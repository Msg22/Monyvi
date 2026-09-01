import type {
  Account,
  CurrencyType,
  Transaction,
  TransactionSource,
  TransactionType,
} from "@monyvi/db";
import type { Collection, Model } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  isValidTransactionAmount,
  parseCanonicalDecimal,
  parseCanonicalUnsignedIntegerString,
  serializeDecimal,
  toMinorUnits,
  type CanonicalJsonValue,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  AccountBalanceCommandService,
  ExecuteAccountBalanceCommandInput,
} from "./account-balance-command-service";
import type {
  FinancialActionLinkedOperationPostimage,
  FinancialActionLinkedOperationPreimage,
  FinancialActionLinkedOperationPlan,
} from "./financial-action-foundation-repository";
import type { CurrentUserDataScope } from "./user-data-access";

export const TRANSACTION_FINANCIAL_ACTION_ERROR_CODES = {
  ACCOUNT_CURRENCY_MISMATCH: "TRANSACTION_ACCOUNT_CURRENCY_MISMATCH",
  ACCOUNT_UNAVAILABLE: "TRANSACTION_ACCOUNT_UNAVAILABLE",
  AUTH_SCOPE_CHANGED: "AUTH_SCOPE_CHANGED",
  INVALID_AMOUNT: "INVALID_TRANSACTION_AMOUNT",
  INVALID_PLAN: "TRANSACTION_FINANCIAL_ACTION_INVALID_PLAN",
  OWNERSHIP_FAILED: "TRANSACTION_FINANCIAL_ACTION_OWNERSHIP_FAILED",
  REVISION_OVERFLOW: "TRANSACTION_FINANCIAL_ACTION_REVISION_OVERFLOW",
  UNSAFE_BALANCE: "TRANSACTION_FINANCIAL_ACTION_UNSAFE_BALANCE",
} as const;

export interface GuardedTransactionCreateData {
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly categoryId: string;
  readonly counterparty?: string;
  readonly accountId: string;
  readonly note?: string;
  readonly type: TransactionType;
  readonly date?: Date;
  readonly linkedRecurringId?: string;
  readonly source: TransactionSource;
  readonly smsFingerprint?: string;
}

export interface TransactionFinancialActionDependencies {
  readonly accountsCollection: () => Collection<Account>;
  readonly assertExpectedCurrentUser: (userId: string) => Promise<void>;
  readonly executeAccountBalanceCommand: AccountBalanceCommandService["execute"];
  readonly getCurrentUserDataScope: () => Promise<CurrentUserDataScope>;
  readonly hashProvider: Sha256Provider;
  readonly transactionsCollection: () => Collection<Transaction>;
}

export interface TransactionFinancialActionService {
  readonly create: (
    data: GuardedTransactionCreateData,
    expectedUserId?: string
  ) => Promise<Transaction>;
}

export interface TransactionAfter {
  readonly [key: string]: CanonicalJsonValue;
  readonly accountId: string;
  readonly amountMinorUnits: string;
  readonly categoryId: string;
  readonly counterparty: string | null;
  readonly createdAt: string;
  readonly currency: string;
  readonly date: string;
  readonly deleted: boolean;
  readonly id: string;
  readonly isDraft: boolean;
  readonly linkedAssetId: string | null;
  readonly linkedDebtId: string | null;
  readonly linkedRecurringId: string | null;
  readonly note: string | null;
  readonly smsFingerprint: string | null;
  readonly source: string;
  readonly type: string;
}

const MAX_SIGNED_BIGINT = 9223372036854775807n;

function fail(code: string): never {
  throw new Error(code);
}

function currencyPlaces(currency: string): number {
  return (
    CURRENCY_PRECISION[currency as keyof typeof CURRENCY_PRECISION] ??
    DEFAULT_PRECISION
  );
}

export function formatFinancialActionLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfFinancialActionLocalDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function readRaw(
  raw: Readonly<Model["_raw"]>,
  key: string
): unknown {
  return (raw as unknown as Readonly<Record<string, unknown>>)[key];
}

function assertOwnedRaw(
  raw: Readonly<Model["_raw"]>,
  userId: string
): void {
  if (readRaw(raw, "user_id") !== userId) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.OWNERSHIP_FAILED);
  }
}

function assertCachedOwnership(
  userId: string,
  cachedPreimages: readonly FinancialActionLinkedOperationPreimage[],
  accountId: string
): void {
  if (
    cachedPreimages.length !== 1 ||
    cachedPreimages[0]?.table !== "accounts" ||
    cachedPreimages[0]?.id !== accountId ||
    cachedPreimages[0]?.kind !== "update"
  ) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.INVALID_PLAN);
  }
  assertOwnedRaw(cachedPreimages[0].raw, userId);
}

export function assertRawTransactionMatches(
  raw: Readonly<Model["_raw"]>,
  expected: TransactionAfter
): void {
  const exactEntries: ReadonlyArray<readonly [string, unknown]> = [
    ["account_id", expected.accountId],
    ["amount", Number(fromMinorUnits(expected.amountMinorUnits, currencyPlaces(expected.currency)))],
    ["category_id", expected.categoryId],
    ["counterparty", expected.counterparty],
    ["created_at", Date.parse(expected.createdAt)],
    ["currency", expected.currency],
    ["date", new Date(`${expected.date}T00:00:00`).getTime()],
    ["deleted", expected.deleted],
    ["is_draft", expected.isDraft],
    ["linked_asset_id", expected.linkedAssetId],
    ["linked_debt_id", expected.linkedDebtId],
    ["linked_recurring_id", expected.linkedRecurringId],
    ["note", expected.note],
    ["sms_fingerprint", expected.smsFingerprint],
    ["source", expected.source],
    ["type", expected.type],
  ];
  if (exactEntries.some(([key, value]) => readRaw(raw, key) !== value)) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.INVALID_PLAN);
  }
}

function assertPreparedOwnership(
  userId: string,
  preparedPostimages: readonly FinancialActionLinkedOperationPostimage[],
  expected: TransactionAfter
): void {
  preparedPostimages.forEach((postimage) => assertOwnedRaw(postimage.raw, userId));
  const transaction = preparedPostimages.find(
    (postimage) =>
      postimage.table === "transactions" && postimage.id === expected.id
  );
  if (!transaction || transaction.kind !== "create") {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.INVALID_PLAN);
  }
  assertRawTransactionMatches(transaction.raw, expected);
}

export function getExactTransactionMinorUnits(
  data: GuardedTransactionCreateData
): string {
  if (!isValidTransactionAmount(data.amount)) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.INVALID_AMOUNT);
  }
  const places = currencyPlaces(data.currency);
  const minorUnits = toMinorUnits(String(data.amount), places);
  const normalizedAmount = Number(fromMinorUnits(minorUnits, places));
  if (normalizedAmount !== data.amount) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.INVALID_AMOUNT);
  }
  return minorUnits;
}

export function getNextAccountFinancialRevision(
  currentRevision: string
): string {
  const current = parseCanonicalUnsignedIntegerString(currentRevision);
  const next = BigInt(current) + 1n;
  if (next > MAX_SIGNED_BIGINT) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.REVISION_OVERFLOW);
  }
  return next.toString();
}

export function getNextAccountBalance(
  currentBalance: number,
  signedMinorUnits: string,
  currency: string
): number {
  if (!Number.isFinite(currentBalance)) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.UNSAFE_BALANCE);
  }
  const exact = serializeDecimal(
    parseCanonicalDecimal(String(currentBalance)).plus(
      fromMinorUnits(signedMinorUnits, currencyPlaces(currency))
    )
  );
  const value = Number(exact);
  if (!Number.isFinite(value) || serializeDecimal(String(value)) !== exact) {
    fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.UNSAFE_BALANCE);
  }
  return value;
}

export function prepareFinancialActionTransaction(
  collection: Collection<Transaction>,
  data: GuardedTransactionCreateData,
  userId: string
): Transaction {
  return collection.prepareCreate((record) => {
    record.userId = userId;
    record.accountId = data.accountId;
    record.amount = data.amount;
    record.currency = data.currency;
    record.type = data.type;
    record.categoryId = data.categoryId;
    record.counterparty = data.counterparty || undefined;
    record.note = data.note || undefined;
    record.date = startOfFinancialActionLocalDate(data.date ?? new Date());
    record.source = data.source;
    record.linkedRecurringId = data.linkedRecurringId || undefined;
    record.smsFingerprint = data.smsFingerprint || undefined;
    record.isDraft = false;
    record.deleted = false;
  });
}

export function buildTransactionAfter(
  transaction: Transaction,
  amountMinorUnits: string
): TransactionAfter {
  return {
    accountId: transaction.accountId,
    amountMinorUnits,
    categoryId: transaction.categoryId,
    counterparty: transaction.counterparty ?? null,
    createdAt: transaction.createdAt.toISOString(),
    currency: transaction.currency,
    date: formatFinancialActionLocalDate(transaction.date),
    deleted: transaction.deleted,
    id: transaction.id,
    isDraft: transaction.isDraft,
    linkedAssetId: transaction.linkedAssetId ?? null,
    linkedDebtId: transaction.linkedDebtId ?? null,
    linkedRecurringId: transaction.linkedRecurringId ?? null,
    note: transaction.note ?? null,
    smsFingerprint: transaction.smsFingerprint ?? null,
    source: transaction.source,
    type: transaction.type,
  };
}

function buildEnvelope(input: {
  readonly account: Account;
  readonly after: TransactionAfter;
  readonly signedMinorUnits: string;
  readonly userId: string;
}): FinancialActionEnvelopeV1 {
  return {
    accountGuards: [
      {
        accountId: input.account.id,
        expectedRevision: parseCanonicalUnsignedIntegerString(
          input.account.financialRevision
        ),
      },
    ],
    actionId: input.after.id,
    domain: "transactions",
    domainReferenceId: input.after.id,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt: input.after.createdAt,
    payload: {
      accountEffects: [
        {
          accountId: input.account.id,
          amountMinorUnits: input.signedMinorUnits,
          currency: input.account.currency,
        },
      ],
      domainMutation: {
        records: [
          {
            after: input.after,
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [input.after.id],
      operationCode: "transaction.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: input.userId,
  };
}

function buildPlan(input: {
  readonly account: Account;
  readonly after: TransactionAfter;
  readonly nextAccountBalance: number;
  readonly nextAccountRevision: string;
  readonly transaction: Transaction;
}): FinancialActionLinkedOperationPlan {
  return {
    preparedCreates: [input.transaction],
    existingOperations: [
      {
        kind: "update",
        model: input.account,
        update: (model): void => {
          const account = model as Account;
          account.balance = input.nextAccountBalance;
          account.financialRevision = input.nextAccountRevision;
        },
      },
    ],
    assertCachedOwnership: ({ userId, cachedPreimages }): Promise<void> => {
      assertCachedOwnership(userId, cachedPreimages, input.account.id);
      return Promise.resolve();
    },
    assertPreparedOwnership: ({ userId, preparedPostimages }): Promise<void> => {
      assertPreparedOwnership(userId, preparedPostimages, input.after);
      return Promise.resolve();
    },
  };
}

export function createTransactionFinancialActionService(
  dependencies: TransactionFinancialActionDependencies
): TransactionFinancialActionService {
  return {
    create: async (
      data: GuardedTransactionCreateData,
      expectedUserId?: string
    ): Promise<Transaction> => {
      const amountMinorUnits = getExactTransactionMinorUnits(data);
      const scope = await dependencies.getCurrentUserDataScope();
      if (expectedUserId !== undefined && scope.userId !== expectedUserId) {
        fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.AUTH_SCOPE_CHANGED);
      }
      const account = await scope.findOwned(
        dependencies.accountsCollection(),
        data.accountId
      );
      if (account.deleted) {
        fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.ACCOUNT_UNAVAILABLE);
      }
      if (account.currency !== data.currency) {
        fail(TRANSACTION_FINANCIAL_ACTION_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      await dependencies.assertExpectedCurrentUser(scope.userId);

      const transaction = prepareFinancialActionTransaction(
        dependencies.transactionsCollection(),
        data,
        scope.userId
      );
      const after = buildTransactionAfter(transaction, amountMinorUnits);
      const signedMinorUnits =
        data.type === "EXPENSE" ? `-${amountMinorUnits}` : amountMinorUnits;
      const envelope = buildEnvelope({
        account,
        after,
        signedMinorUnits,
        userId: scope.userId,
      });
      const command: ExecuteAccountBalanceCommandInput = {
        envelope,
        hashProvider: dependencies.hashProvider,
        prepareDomainOperationPlan: (): Promise<FinancialActionLinkedOperationPlan> =>
          Promise.resolve(
            buildPlan({
              account,
              after,
              nextAccountBalance: getNextAccountBalance(
                account.balance,
                signedMinorUnits,
                account.currency
              ),
              nextAccountRevision: getNextAccountFinancialRevision(
                account.financialRevision
              ),
              transaction,
            })
          ),
      };
      await dependencies.executeAccountBalanceCommand(command);
      return transaction;
    },
  };
}
