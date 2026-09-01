import type { Model } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  canonicalizeFinancialActionEnvelope,
  fromMinorUnits,
  parseCanonicalDecimal,
  serializeDecimal,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  CommitFinancialActionGroupLocallyResult,
  FinancialActionFoundationRepository,
  FinancialActionLinkedExistingOperation,
  FinancialActionLinkedOperationPlan,
} from "./financial-action-foundation-repository";

export const ACCOUNT_BALANCE_COMMAND_ERROR_CODES = {
  INVALID_PLAN: "account_balance_command_invalid_plan",
  REVISION_STALE: "account_balance_command_revision_stale",
  UNSAFE_BALANCE: "account_balance_command_unsafe_balance",
} as const;

interface AccountEffectInput {
  readonly acceptedAccountRevision: string;
  readonly accountId: string;
  readonly actionId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
  readonly domain: string;
  readonly kind: string;
  readonly userId: string;
}

interface AccountBalanceEffect {
  readonly accountId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
}

export interface AccountBalanceCommandDependencies {
  readonly foundationRepository: Pick<
    FinancialActionFoundationRepository,
    "commitFinancialActionGroupLocally"
  >;
  readonly prepareEffectCreate: (input: AccountEffectInput) => Model;
}

export interface ExecuteAccountBalanceCommandInput {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
  readonly prepareDomainOperationPlan: () => Promise<FinancialActionLinkedOperationPlan>;
}

export interface AccountBalanceCommandService {
  readonly execute: (
    input: ExecuteAccountBalanceCommandInput
  ) => Promise<CommitFinancialActionGroupLocallyResult>;
}

interface AccountExpectation {
  readonly accountId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
  readonly expectedRevision: string;
  readonly nextRevision: string;
}

function fail(code: string): never {
  throw new Error(code);
}

function readString(raw: Model["_raw"], key: string): string {
  const value = (raw as unknown as Readonly<Record<string, unknown>>)[key];
  if (typeof value !== "string")
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
  return value;
}

function readBalance(raw: Model["_raw"]): number {
  const value = (raw as unknown as Readonly<Record<string, unknown>>).balance;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.UNSAFE_BALANCE);
  }
  return value;
}

function currencyPlaces(currency: string): number {
  return (
    CURRENCY_PRECISION[currency as keyof typeof CURRENCY_PRECISION] ??
    DEFAULT_PRECISION
  );
}

function expectedBalance(
  currentBalance: number,
  effect: AccountExpectation
): number {
  const current = parseCanonicalDecimal(String(currentBalance));
  const delta = fromMinorUnits(
    effect.amountMinorUnits,
    currencyPlaces(effect.currency)
  );
  const exact = serializeDecimal(current.plus(delta));
  const result = Number(exact);
  if (!Number.isFinite(result) || serializeDecimal(String(result)) !== exact) {
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.UNSAFE_BALANCE);
  }
  return result;
}

function readEffects(
  envelope: FinancialActionEnvelopeV1
): readonly AccountBalanceEffect[] {
  const value = envelope.payload.accountEffects;
  if (!Array.isArray(value))
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
  return value.map((effect) => {
    if (
      typeof effect !== "object" ||
      effect === null ||
      Array.isArray(effect)
    ) {
      fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    }
    const record = effect as Readonly<Record<string, unknown>>;
    if (
      typeof record.accountId !== "string" ||
      typeof record.amountMinorUnits !== "string" ||
      typeof record.currency !== "string"
    )
      fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    return {
      accountId: record.accountId,
      amountMinorUnits: record.amountMinorUnits,
      currency: record.currency,
    };
  });
}

function readOperationCode(envelope: FinancialActionEnvelopeV1): string {
  const value = envelope.payload.operationCode;
  if (typeof value !== "string") {
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
  }
  return value;
}

function buildExpectations(
  envelope: FinancialActionEnvelopeV1
): readonly AccountExpectation[] {
  const effects = readEffects(envelope);
  return envelope.accountGuards.map((guard, index) => {
    const effect = effects[index];
    if (!effect || effect.accountId !== guard.accountId) {
      fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    }
    const nextRevision = BigInt(guard.expectedRevision) + 1n;
    if (nextRevision > 9223372036854775807n) {
      fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    }
    return {
      ...effect,
      expectedRevision: guard.expectedRevision,
      nextRevision: nextRevision.toString(),
    };
  });
}

function verifyPreparedEffect(
  model: Model,
  expectation: AccountExpectation,
  envelope: FinancialActionEnvelopeV1
): void {
  const raw = model._raw;
  if (
    model.table !== "account_financial_effects" ||
    readString(raw, "account_id") !== expectation.accountId ||
    readString(raw, "action_id") !== envelope.actionId ||
    readString(raw, "amount_minor_units") !== expectation.amountMinorUnits ||
    readString(raw, "currency") !== expectation.currency ||
    readString(raw, "accepted_account_revision") !== expectation.nextRevision ||
    readString(raw, "user_id") !== envelope.userId ||
    readString(raw, "domain") !== envelope.domain ||
    readString(raw, "kind") !== readOperationCode(envelope)
  )
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
}

function verifyPreparedAccountCreate(
  model: Model,
  expectation: AccountExpectation,
  userId: string
): void {
  if (
    readString(model._raw, "user_id") !== userId ||
    readString(model._raw, "currency") !== expectation.currency ||
    readString(model._raw, "financial_revision") !== expectation.nextRevision ||
    readBalance(model._raw) !== expectedBalance(0, expectation)
  )
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
}

function wrapAccountUpdate(
  operation: FinancialActionLinkedExistingOperation,
  expectation: AccountExpectation,
  userId: string
): FinancialActionLinkedExistingOperation {
  if (operation.kind !== "update")
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
  return {
    kind: "update",
    model: operation.model,
    update: (model): void => {
      const before = model._raw;
      if (
        readString(before, "user_id") !== userId ||
        readString(before, "currency") !== expectation.currency ||
        readString(before, "financial_revision") !==
          expectation.expectedRevision
      )
        fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.REVISION_STALE);
      const nextBalance = expectedBalance(readBalance(before), expectation);
      operation.update(model);
      if (
        readString(model._raw, "financial_revision") !==
          expectation.nextRevision ||
        readBalance(model._raw) !== nextBalance
      )
        fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    },
  };
}

function hardenPlan(
  plan: FinancialActionLinkedOperationPlan,
  expectations: readonly AccountExpectation[],
  envelope: FinancialActionEnvelopeV1,
  prepareEffectCreate: (input: AccountEffectInput) => Model
): FinancialActionLinkedOperationPlan {
  const accountCreates = plan.preparedCreates.filter(
    (model) => model.table === "accounts"
  );
  const accountUpdates = plan.existingOperations.filter(
    (operation) => operation.model.table === "accounts"
  );
  const knownAccountIds = [
    ...accountCreates.map((model) => model.id),
    ...accountUpdates.map((operation) => operation.model.id),
  ];
  if (
    knownAccountIds.length !== expectations.length ||
    new Set(knownAccountIds).size !== knownAccountIds.length ||
    expectations.some(
      (expectation) => !knownAccountIds.includes(expectation.accountId)
    )
  )
    fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);

  accountCreates.forEach((model) => {
    const expectation = expectations.find(
      (candidate) => candidate.accountId === model.id
    );
    if (!expectation || expectation.expectedRevision !== "0") {
      fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    }
    verifyPreparedAccountCreate(model, expectation, envelope.userId);
  });

  const existingOperations = plan.existingOperations.map((operation) => {
    if (operation.model.table !== "accounts") return operation;
    const expectation = expectations.find(
      (candidate) => candidate.accountId === operation.model.id
    );
    if (!expectation) fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    return wrapAccountUpdate(operation, expectation, envelope.userId);
  });
  const effects = expectations.map((expectation) =>
    prepareEffectCreate({
      acceptedAccountRevision: expectation.nextRevision,
      accountId: expectation.accountId,
      actionId: envelope.actionId,
      amountMinorUnits: expectation.amountMinorUnits,
      currency: expectation.currency,
      domain: envelope.domain,
      kind: readOperationCode(envelope),
      userId: envelope.userId,
    })
  );
  effects.forEach((effect, index) => {
    const expectation = expectations[index];
    if (!expectation) fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
    verifyPreparedEffect(effect, expectation, envelope);
  });

  return {
    ...plan,
    preparedCreates: Object.freeze([...plan.preparedCreates, ...effects]),
    existingOperations: Object.freeze(existingOperations),
  };
}

export function createAccountBalanceCommandService(
  dependencies: AccountBalanceCommandDependencies
): AccountBalanceCommandService {
  return {
    execute: async (
      input: ExecuteAccountBalanceCommandInput
    ): Promise<CommitFinancialActionGroupLocallyResult> => {
      const envelope = canonicalizeFinancialActionEnvelope(input.envelope);
      if (envelope.payloadVersion !== "account.balance-effects/v1") {
        fail(ACCOUNT_BALANCE_COMMAND_ERROR_CODES.INVALID_PLAN);
      }
      const expectations = buildExpectations(envelope);
      return dependencies.foundationRepository.commitFinancialActionGroupLocally(
        {
          envelope,
          hashProvider: input.hashProvider,
          prepareLinkedOperationPlan:
            async (): Promise<FinancialActionLinkedOperationPlan> =>
              hardenPlan(
                await input.prepareDomainOperationPlan(),
                expectations,
                envelope,
                dependencies.prepareEffectCreate
              ),
        }
      );
    },
  };
}
