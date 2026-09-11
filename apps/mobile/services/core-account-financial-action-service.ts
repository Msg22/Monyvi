import type { Account } from "@monyvi/db";
import type { Model } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  parseCanonicalDecimal,
  parseCanonicalUnsignedIntegerString,
  serializeDecimal,
  type CanonicalJsonValue,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  AccountBalanceCommandService,
  ExecuteAccountBalanceCommandInput,
} from "./account-balance-command-service";
import type {
  CommitFinancialActionGroupLocallyResult,
  FinancialActionLinkedExistingOperation,
  FinancialActionLinkedOperationPlan,
  FinancialActionLinkedOperationPostimage,
  FinancialActionLinkedOperationPreimage,
} from "./financial-action-foundation-repository";

export const CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES = {
  ACCOUNT_UNAVAILABLE: "core_account_financial_action_account_unavailable",
  INVALID_EFFECT: "core_account_financial_action_invalid_effect",
  INVALID_MUTATION: "core_account_financial_action_invalid_mutation",
  NOT_OWNED: "core_account_financial_action_not_owned",
  REVISION_EXHAUSTED: "core_account_financial_action_revision_exhausted",
  UNSAFE_BALANCE: "core_account_financial_action_unsafe_balance",
} as const;

type CoreFinancialActionDomain = "accounts" | "transactions" | "transfers";
type CoreMutationEntity = "account" | "transaction" | "transfer";
type CoreMutationMode = "create" | "update" | "delete";

export interface CoreAccountEffectInput {
  readonly account: Account;
  readonly amountMinorUnits: string;
}

export interface CoreFinancialActionMutationRecord {
  readonly after: Readonly<Record<string, CanonicalJsonValue>>;
  readonly assertPostimage?: (raw: Readonly<Model["_raw"]>) => void;
  readonly entity: CoreMutationEntity;
  readonly expectedUpdatedAt: string | null;
  readonly mode: CoreMutationMode;
  readonly model: Model;
  readonly update?: (model: Model) => void;
}

export interface ExecuteCoreAccountFinancialActionInput {
  readonly accountEffects: readonly CoreAccountEffectInput[];
  readonly actionId: string;
  readonly domain: CoreFinancialActionDomain;
  readonly domainReferenceId: string;
  readonly kind: string;
  readonly mutationRecords: readonly CoreFinancialActionMutationRecord[];
  readonly occurredAt: string;
  readonly operationCode: string;
  readonly userId: string;
}

export interface CoreAccountFinancialActionDependencies {
  readonly executeAccountBalanceCommand: AccountBalanceCommandService["execute"];
  readonly hashProvider: Sha256Provider;
}

export interface CoreAccountFinancialActionService {
  readonly execute: (
    input: ExecuteCoreAccountFinancialActionInput
  ) => Promise<CommitFinancialActionGroupLocallyResult>;
}

interface CanonicalAccountEffect {
  readonly account: Account;
  readonly amountMinorUnits: string;
  readonly expectedRevision: string;
  readonly isPreparedCreate: boolean;
  readonly nextBalance: number;
  readonly nextRevision: string;
}

const MAX_SIGNED_BIGINT = 9223372036854775807n;
const SIGNED_MINOR_UNITS = /^-?(?:0|[1-9][0-9]*)$/;

function compareAscii(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function fail(
  code: (typeof CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES)[keyof typeof CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES]
): never {
  throw new Error(code);
}

function readRaw(raw: Readonly<Model["_raw"]>, key: string): unknown {
  return (raw as unknown as Readonly<Record<string, unknown>>)[key];
}

function readAccountUserId(account: Account): string {
  const rawUserId = readRaw(account._raw, "user_id");
  return typeof rawUserId === "string" ? rawUserId : account.userId;
}

function currencyPlaces(currency: string): number {
  return (
    CURRENCY_PRECISION[currency as keyof typeof CURRENCY_PRECISION] ??
    DEFAULT_PRECISION
  );
}

function addToBalance(
  balance: number,
  amountMinorUnits: string,
  currency: string
): number {
  if (!Number.isFinite(balance)) {
    fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.UNSAFE_BALANCE);
  }
  const exact = serializeDecimal(
    parseCanonicalDecimal(String(balance)).plus(
      fromMinorUnits(amountMinorUnits, currencyPlaces(currency))
    )
  );
  const next = Number(exact);
  if (!Number.isFinite(next) || serializeDecimal(String(next)) !== exact) {
    fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.UNSAFE_BALANCE);
  }
  return next;
}

function nextRevision(currentRevision: string): string {
  const current = BigInt(parseCanonicalUnsignedIntegerString(currentRevision));
  const next = current + 1n;
  if (next > MAX_SIGNED_BIGINT) {
    fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.REVISION_EXHAUSTED);
  }
  return next.toString();
}

function assertMinorUnits(value: string): bigint {
  if (!SIGNED_MINOR_UNITS.test(value) || value === "-0") {
    fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_EFFECT);
  }
  const parsed = BigInt(value);
  if (parsed < -MAX_SIGNED_BIGINT || parsed > MAX_SIGNED_BIGINT) {
    fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_EFFECT);
  }
  return parsed;
}

function canonicalizeEffects(
  effects: readonly CoreAccountEffectInput[],
  userId: string
): readonly CanonicalAccountEffect[] {
  const byAccountId = new Map<
    string,
    { readonly account: Account; amountMinorUnits: bigint }
  >();
  effects.forEach((effect) => {
    if (readAccountUserId(effect.account) !== userId) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.NOT_OWNED);
    }
    if (effect.account.deleted) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.ACCOUNT_UNAVAILABLE);
    }
    const previous = byAccountId.get(effect.account.id);
    if (previous && previous.account !== effect.account) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_EFFECT);
    }
    const amountMinorUnits =
      (previous?.amountMinorUnits ?? 0n) +
      assertMinorUnits(effect.amountMinorUnits);
    if (
      amountMinorUnits < -MAX_SIGNED_BIGINT ||
      amountMinorUnits > MAX_SIGNED_BIGINT
    ) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_EFFECT);
    }
    byAccountId.set(effect.account.id, {
      account: effect.account,
      amountMinorUnits,
    });
  });

  const canonical = [...byAccountId.entries()]
    .filter(([, effect]) => effect.amountMinorUnits !== 0n)
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([, effect]) => {
      const isPreparedCreate = effect.account._preparedState === "create";
      const expectedRevision = isPreparedCreate
        ? "0"
        : effect.account.financialRevision;
      const nextBalance = addToBalance(
        isPreparedCreate ? 0 : effect.account.balance,
        effect.amountMinorUnits.toString(),
        effect.account.currency
      );
      const next = nextRevision(expectedRevision);
      if (
        isPreparedCreate &&
        (effect.account.balance !== nextBalance ||
          effect.account.financialRevision !== next)
      ) {
        fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_MUTATION);
      }
      return {
        account: effect.account,
        amountMinorUnits: effect.amountMinorUnits.toString(),
        expectedRevision,
        isPreparedCreate,
        nextBalance,
        nextRevision: next,
      };
    });
  if (canonical.length === 0) {
    fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_EFFECT);
  }
  return Object.freeze(canonical);
}

function assertOwnedPreimages(
  userId: string,
  preimages: readonly FinancialActionLinkedOperationPreimage[]
): void {
  preimages.forEach((preimage) => {
    if (readRaw(preimage.raw, "user_id") !== userId) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.NOT_OWNED);
    }
  });
}

function assertPreparedPostimages(
  userId: string,
  postimages: readonly FinancialActionLinkedOperationPostimage[],
  mutations: readonly CoreFinancialActionMutationRecord[]
): void {
  postimages.forEach((postimage) => {
    if (readRaw(postimage.raw, "user_id") !== userId) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.NOT_OWNED);
    }
  });
  mutations.forEach((mutation) => {
    const postimage = postimages.find(
      (candidate) =>
        candidate.table === mutation.model.table &&
        candidate.id === mutation.model.id
    );
    if (!postimage) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_MUTATION);
    }
    const expectedKind =
      mutation.mode === "delete" ? "markAsDeleted" : mutation.mode;
    if (postimage.kind !== expectedKind) {
      fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_MUTATION);
    }
    mutation.assertPostimage?.(postimage.raw);
  });
}

function buildExistingOperation(
  mutation: CoreFinancialActionMutationRecord
): FinancialActionLinkedExistingOperation {
  if (mutation.mode === "delete") {
    return { kind: "markAsDeleted", model: mutation.model };
  }
  if (mutation.mode !== "update" || !mutation.update) {
    fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_MUTATION);
  }
  return {
    kind: "update",
    model: mutation.model,
    update: mutation.update,
  };
}

function buildPlan(
  effects: readonly CanonicalAccountEffect[],
  mutations: readonly CoreFinancialActionMutationRecord[]
): FinancialActionLinkedOperationPlan {
  const effectByAccount = new Map(
    effects.map((effect) => [effect.account.id, effect])
  );
  const preparedCreates = mutations
    .filter((mutation) => mutation.mode === "create")
    .map((mutation) => mutation.model);
  effects
    .filter((effect) => effect.isPreparedCreate)
    .forEach((effect) => {
      const mutation = mutations.find(
        (candidate) =>
          candidate.entity === "account" &&
          candidate.mode === "create" &&
          candidate.model === effect.account
      );
      if (!mutation) {
        fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_MUTATION);
      }
    });
  const mutationOperations = mutations
    .filter((mutation) => mutation.mode !== "create")
    .map((mutation): FinancialActionLinkedExistingOperation => {
      const effect =
        mutation.entity === "account"
          ? effectByAccount.get(mutation.model.id)
          : undefined;
      if (!effect) return buildExistingOperation(mutation);
      if (mutation.mode !== "update" || !mutation.update) {
        fail(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.INVALID_MUTATION);
      }
      return {
        kind: "update",
        model: mutation.model,
        update: (model): void => {
          mutation.update?.(model);
          const account = model as Account;
          account.balance = effect.nextBalance;
          account.financialRevision = effect.nextRevision;
        },
      };
    });
  const mergedAccountIds = new Set(
    mutations
      .filter(
        (mutation) =>
          mutation.entity === "account" && mutation.mode === "update"
      )
      .map((mutation) => mutation.model.id)
  );
  const accountOperations = effects
    .filter(
      (effect) =>
        !effect.isPreparedCreate && !mergedAccountIds.has(effect.account.id)
    )
    .map(
      (effect): FinancialActionLinkedExistingOperation => ({
        kind: "update",
        model: effect.account,
        update: (model): void => {
          const account = model as Account;
          account.balance = effect.nextBalance;
          account.financialRevision = effect.nextRevision;
        },
      })
    );
  return {
    preparedCreates: Object.freeze(preparedCreates),
    existingOperations: Object.freeze([
      ...mutationOperations,
      ...accountOperations,
    ]),
    assertCachedOwnership: ({ userId, cachedPreimages }): Promise<void> => {
      assertOwnedPreimages(userId, cachedPreimages);
      return Promise.resolve();
    },
    assertPreparedOwnership: ({
      userId,
      preparedPostimages,
    }): Promise<void> => {
      assertPreparedPostimages(userId, preparedPostimages, mutations);
      return Promise.resolve();
    },
  };
}

function buildEnvelope(
  input: ExecuteCoreAccountFinancialActionInput,
  effects: readonly CanonicalAccountEffect[]
): FinancialActionEnvelopeV1 {
  const mutations = [...input.mutationRecords].sort((left, right) =>
    compareAscii(
      `${left.entity}:${left.model.id}`,
      `${right.entity}:${right.model.id}`
    )
  );
  return {
    accountGuards: effects.map((effect) => ({
      accountId: effect.account.id,
      expectedRevision: parseCanonicalUnsignedIntegerString(
        effect.expectedRevision
      ),
    })),
    actionId: input.actionId,
    domain: input.domain,
    domainReferenceId: input.domainReferenceId,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: input.kind,
    occurredAt: input.occurredAt,
    payload: {
      accountEffects: effects.map((effect) => ({
        accountId: effect.account.id,
        amountMinorUnits: effect.amountMinorUnits,
        currency: effect.account.currency,
      })),
      domainMutation: {
        records: mutations.map((mutation) => ({
          after: mutation.after,
          entity: mutation.entity,
          expectedUpdatedAt: mutation.expectedUpdatedAt,
          mode: mutation.mode,
        })),
      },
      domainRecordRefs: [
        ...new Set(mutations.map(({ model }) => model.id)),
      ].sort(compareAscii),
      operationCode: input.operationCode,
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: input.userId,
  };
}

export function createCoreAccountFinancialActionService(
  dependencies: CoreAccountFinancialActionDependencies
): CoreAccountFinancialActionService {
  return {
    execute: async (
      input: ExecuteCoreAccountFinancialActionInput
    ): Promise<CommitFinancialActionGroupLocallyResult> => {
      const effects = canonicalizeEffects(input.accountEffects, input.userId);
      const command: ExecuteAccountBalanceCommandInput = {
        envelope: buildEnvelope(input, effects),
        hashProvider: dependencies.hashProvider,
        prepareDomainOperationPlan:
          (): Promise<FinancialActionLinkedOperationPlan> =>
            Promise.resolve(buildPlan(effects, input.mutationRecords)),
      };
      return dependencies.executeAccountBalanceCommand(command);
    },
  };
}
