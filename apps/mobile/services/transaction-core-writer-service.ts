import type {
  Account,
  CurrencyType,
  Transaction,
  TransactionType,
  Transfer,
} from "@monyvi/db";
import type { Collection } from "@nozbe/watermelondb";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  isValidTransactionAmount,
  serializeDecimal,
  toMinorUnits,
} from "@monyvi/logic";

import type {
  CoreAccountEffectInput,
  CoreAccountFinancialActionService,
  CoreFinancialActionMutationRecord,
} from "./core-account-financial-action-service";
import {
  assertRawTransactionMatches,
  formatFinancialActionLocalDate,
  type TransactionAfter,
} from "./transaction-financial-action-service";
import {
  assertRawTransferMatches,
  type TransferAfter,
} from "./transfer-financial-action-evidence";
import type { CurrentUserDataScope } from "./user-data-access";

export const TRANSACTION_CORE_WRITER_ERROR_CODES = {
  ACCOUNT_CURRENCY_MISMATCH: "TRANSACTION_ACCOUNT_CURRENCY_MISMATCH",
  ACCOUNT_UNAVAILABLE: "TRANSACTION_ACCOUNT_UNAVAILABLE",
  AUTH_SCOPE_CHANGED: "AUTH_SCOPE_CHANGED",
  INVALID_AMOUNT: "INVALID_TRANSACTION_AMOUNT",
  INVALID_PLAN: "TRANSACTION_FINANCIAL_ACTION_INVALID_PLAN",
  RECORD_UNAVAILABLE: "TRANSACTION_RECORD_UNAVAILABLE",
} as const;

export interface TransactionCoreUpdateInput {
  readonly accountId?: string;
  readonly amount?: number;
  readonly categoryId?: string;
  readonly counterparty?: string;
  readonly date?: Date;
  readonly note?: string;
  readonly type?: TransactionType;
}

export interface TransactionCoreConvertInput {
  readonly notes?: string;
  readonly toAccountId: string;
  readonly transactionId: string;
}

export type TransactionCoreBatchDeleteItem =
  | { readonly kind: "transaction"; readonly record: Transaction }
  | { readonly kind: "transfer"; readonly record: Transfer };

export interface TransactionCoreWriterDependencies {
  readonly accountsCollection: () => Collection<Account>;
  readonly assertExpectedCurrentUser: (userId: string) => Promise<void>;
  readonly createActionId: () => string;
  readonly commitMetadataUpdate: (
    transaction: Transaction,
    updates: TransactionCoreUpdateInput,
    userId: string
  ) => Promise<void>;
  readonly executeCoreFinancialAction: CoreAccountFinancialActionService["execute"];
  readonly getCurrentUserDataScope: () => Promise<CurrentUserDataScope>;
  readonly now: () => Date;
  readonly transactionsCollection: () => Collection<Transaction>;
  readonly transfersCollection: () => Collection<Transfer>;
}

export interface TransactionCoreWriterService {
  readonly batchDelete: (
    items: readonly TransactionCoreBatchDeleteItem[]
  ) => Promise<void>;
  readonly convertToTransfer: (
    input: TransactionCoreConvertInput
  ) => Promise<void>;
  readonly delete: (transactionId: string) => Promise<void>;
  readonly update: (
    transactionId: string,
    updates: TransactionCoreUpdateInput
  ) => Promise<void>;
}

interface TransactionProjection {
  readonly accountId: string;
  readonly amount: number;
  readonly categoryId: string;
  readonly counterparty?: string;
  readonly currency: CurrencyType;
  readonly date: Date;
  readonly note?: string;
  readonly type: TransactionType;
}

function fail(
  code: (typeof TRANSACTION_CORE_WRITER_ERROR_CODES)[keyof typeof TRANSACTION_CORE_WRITER_ERROR_CODES]
): never {
  throw new Error(code);
}

function currencyPlaces(currency: CurrencyType): number {
  return CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION;
}

function positiveMinorUnits(amount: number, currency: CurrencyType): string {
  if (!isValidTransactionAmount(amount)) {
    fail(TRANSACTION_CORE_WRITER_ERROR_CODES.INVALID_AMOUNT);
  }
  const places = currencyPlaces(currency);
  const minorUnits = toMinorUnits(String(amount), places);
  if (Number(fromMinorUnits(minorUnits, places)) !== amount) {
    fail(TRANSACTION_CORE_WRITER_ERROR_CODES.INVALID_AMOUNT);
  }
  return minorUnits;
}

function signedTransactionEffect(
  amount: number,
  currency: CurrencyType,
  type: TransactionType,
  direction: "apply" | "reverse"
): string {
  const amountMinorUnits = positiveMinorUnits(amount, currency);
  const isNegative =
    direction === "apply" ? type === "EXPENSE" : type === "INCOME";
  return isNegative ? `-${amountMinorUnits}` : amountMinorUnits;
}

function isoTimestamp(value: Date): string {
  return value.toISOString();
}

function compareAscii(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function transactionAfter(
  transaction: Transaction,
  projection: TransactionProjection,
  deleted: boolean
): TransactionAfter {
  return {
    accountId: projection.accountId,
    amountMinorUnits: positiveMinorUnits(
      projection.amount,
      projection.currency
    ),
    categoryId: projection.categoryId,
    counterparty: projection.counterparty ?? null,
    createdAt: isoTimestamp(transaction.createdAt),
    currency: projection.currency,
    date: formatFinancialActionLocalDate(projection.date),
    deleted,
    id: transaction.id,
    isDraft: transaction.isDraft,
    linkedAssetId: transaction.linkedAssetId ?? null,
    linkedDebtId: transaction.linkedDebtId ?? null,
    linkedRecurringId: transaction.linkedRecurringId ?? null,
    note: projection.note ?? null,
    smsFingerprint: transaction.smsFingerprint ?? null,
    source: transaction.source,
    type: projection.type,
  };
}

function transferAfter(
  transfer: Transfer,
  destinationCurrency: CurrencyType
): TransferAfter {
  return {
    amountMinorUnits: positiveMinorUnits(transfer.amount, transfer.currency),
    convertedAmountMinorUnits:
      transfer.convertedAmount === undefined
        ? null
        : positiveMinorUnits(transfer.convertedAmount, destinationCurrency),
    createdAt: isoTimestamp(transfer.createdAt),
    currency: transfer.currency,
    date: formatFinancialActionLocalDate(transfer.date),
    deleted: transfer.deleted,
    exchangeRate:
      transfer.exchangeRate === undefined
        ? null
        : serializeDecimal(String(transfer.exchangeRate)),
    fromAccountId: transfer.fromAccountId,
    id: transfer.id,
    notes: transfer.notes ?? null,
    smsFingerprint: transfer.smsFingerprint ?? null,
    toAccountId: transfer.toAccountId,
  };
}

function projectionOf(transaction: Transaction): TransactionProjection {
  return {
    accountId: transaction.accountId,
    amount: transaction.amount,
    categoryId: transaction.categoryId,
    counterparty: transaction.counterparty,
    currency: transaction.currency,
    date: transaction.date,
    note: transaction.note,
    type: transaction.type,
  };
}

function updatedProjection(
  current: TransactionProjection,
  updates: TransactionCoreUpdateInput,
  targetCurrency: CurrencyType
): TransactionProjection {
  return {
    accountId: updates.accountId ?? current.accountId,
    amount: updates.amount ?? current.amount,
    categoryId: updates.categoryId ?? current.categoryId,
    counterparty: updates.counterparty ?? current.counterparty,
    currency:
      updates.accountId === undefined ? current.currency : targetCurrency,
    date: updates.date ?? current.date,
    note: updates.note ?? current.note,
    type: updates.type ?? current.type,
  };
}

async function findOwnedAccount(
  scope: CurrentUserDataScope,
  collection: Collection<Account>,
  accountId: string
): Promise<Account> {
  const account = await scope.findOwned(collection, accountId);
  if (account.deleted) {
    fail(TRANSACTION_CORE_WRITER_ERROR_CODES.ACCOUNT_UNAVAILABLE);
  }
  return account;
}

function assertTransactionAvailable(transaction: Transaction): void {
  if (transaction.deleted) {
    fail(TRANSACTION_CORE_WRITER_ERROR_CODES.RECORD_UNAVAILABLE);
  }
}

function expectedUpdatedAt(record: { readonly updatedAt: Date }): string {
  return isoTimestamp(record.updatedAt);
}

function transactionUpdateMutation(
  transaction: Transaction,
  projection: TransactionProjection
): CoreFinancialActionMutationRecord {
  const after = transactionAfter(transaction, projection, false);
  return {
    after,
    assertPostimage: (raw): void => assertRawTransactionMatches(raw, after),
    entity: "transaction",
    expectedUpdatedAt: expectedUpdatedAt(transaction),
    mode: "update",
    model: transaction,
    update: (model): void => {
      const record = model as Transaction;
      record.accountId = projection.accountId;
      record.amount = projection.amount;
      record.categoryId = projection.categoryId;
      record.counterparty = projection.counterparty;
      record.currency = projection.currency;
      record.date = projection.date;
      record.note = projection.note;
      record.type = projection.type;
    },
  };
}

function transactionDeleteMutation(
  transaction: Transaction
): CoreFinancialActionMutationRecord {
  const after = transactionAfter(transaction, projectionOf(transaction), true);
  return {
    after,
    assertPostimage: (raw): void => assertRawTransactionMatches(raw, after),
    entity: "transaction",
    expectedUpdatedAt: expectedUpdatedAt(transaction),
    mode: "delete",
    model: transaction,
  };
}

function transferDeleteMutation(
  transfer: Transfer,
  destinationCurrency: CurrencyType
): CoreFinancialActionMutationRecord {
  const after = {
    ...transferAfter(transfer, destinationCurrency),
    deleted: true,
  };
  return {
    after,
    assertPostimage: (raw): void =>
      assertRawTransferMatches(
        raw,
        after,
        destinationCurrency,
        TRANSACTION_CORE_WRITER_ERROR_CODES.INVALID_PLAN
      ),
    entity: "transfer",
    expectedUpdatedAt: expectedUpdatedAt(transfer),
    mode: "delete",
    model: transfer,
  };
}

function firstMutationReference(
  mutations: readonly CoreFinancialActionMutationRecord[]
): string {
  const first = [...mutations].sort((left, right) =>
    compareAscii(
      `${left.entity}:${left.model.id}`,
      `${right.entity}:${right.model.id}`
    )
  )[0];
  if (!first) {
    fail(TRANSACTION_CORE_WRITER_ERROR_CODES.RECORD_UNAVAILABLE);
  }
  return first.model.id;
}

function buildUpdatedEffects(
  oldAccount: Account,
  newAccount: Account,
  oldProjection: TransactionProjection,
  newProjection: TransactionProjection
): readonly CoreAccountEffectInput[] {
  return [
    {
      account: oldAccount,
      amountMinorUnits: signedTransactionEffect(
        oldProjection.amount,
        oldAccount.currency,
        oldProjection.type,
        "reverse"
      ),
    },
    {
      account: newAccount,
      amountMinorUnits: signedTransactionEffect(
        newProjection.amount,
        newAccount.currency,
        newProjection.type,
        "apply"
      ),
    },
  ];
}

function prepareTransfer(
  collection: Collection<Transfer>,
  transaction: Transaction,
  toAccountId: string,
  notes: string | undefined,
  userId: string
): Transfer {
  return collection.prepareCreate((transfer) => {
    transfer.userId = userId;
    transfer.fromAccountId = transaction.accountId;
    transfer.toAccountId = toAccountId;
    transfer.amount = transaction.amount;
    transfer.currency = transaction.currency;
    transfer.date = transaction.date;
    transfer.notes = notes ?? transaction.note;
    transfer.deleted = false;
  });
}

export function createTransactionCoreWriterService(
  dependencies: TransactionCoreWriterDependencies
): TransactionCoreWriterService {
  async function context(): Promise<{
    readonly scope: CurrentUserDataScope;
    readonly actionId: string;
    readonly occurredAt: string;
  }> {
    const scope = await dependencies.getCurrentUserDataScope();
    await dependencies.assertExpectedCurrentUser(scope.userId);
    return {
      scope,
      actionId: dependencies.createActionId(),
      occurredAt: dependencies.now().toISOString(),
    };
  }

  return {
    update: async (transactionId, updates): Promise<void> => {
      const { scope, actionId, occurredAt } = await context();
      const transaction = await scope.findOwned(
        dependencies.transactionsCollection(),
        transactionId
      );
      assertTransactionAvailable(transaction);
      const oldProjection = projectionOf(transaction);
      const hasFinancialChange =
        (updates.accountId ?? oldProjection.accountId) !==
          oldProjection.accountId ||
        (updates.amount ?? oldProjection.amount) !== oldProjection.amount ||
        (updates.type ?? oldProjection.type) !== oldProjection.type;
      if (!hasFinancialChange) {
        await dependencies.commitMetadataUpdate(
          transaction,
          updates,
          scope.userId
        );
        return;
      }
      const oldAccount = await findOwnedAccount(
        scope,
        dependencies.accountsCollection(),
        oldProjection.accountId
      );
      if (oldProjection.currency !== oldAccount.currency) {
        fail(TRANSACTION_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      const newAccount =
        updates.accountId === undefined ||
        updates.accountId === oldProjection.accountId
          ? oldAccount
          : await findOwnedAccount(
              scope,
              dependencies.accountsCollection(),
              updates.accountId
            );
      const nextProjection = updatedProjection(
        oldProjection,
        updates,
        newAccount.currency
      );
      await dependencies.executeCoreFinancialAction({
        accountEffects: buildUpdatedEffects(
          oldAccount,
          newAccount,
          oldProjection,
          nextProjection
        ),
        actionId,
        domain: "transactions",
        domainReferenceId: transaction.id,
        kind: "update",
        mutationRecords: [
          transactionUpdateMutation(transaction, nextProjection),
        ],
        occurredAt,
        operationCode: "transaction.update",
        userId: scope.userId,
      });
    },

    delete: async (transactionId): Promise<void> => {
      const { scope, actionId, occurredAt } = await context();
      const transaction = await scope.findOwned(
        dependencies.transactionsCollection(),
        transactionId
      );
      assertTransactionAvailable(transaction);
      const account = await findOwnedAccount(
        scope,
        dependencies.accountsCollection(),
        transaction.accountId
      );
      if (transaction.currency !== account.currency) {
        fail(TRANSACTION_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      await dependencies.executeCoreFinancialAction({
        accountEffects: [
          {
            account,
            amountMinorUnits: signedTransactionEffect(
              transaction.amount,
              account.currency,
              transaction.type,
              "reverse"
            ),
          },
        ],
        actionId,
        domain: "transactions",
        domainReferenceId: transaction.id,
        kind: "delete",
        mutationRecords: [transactionDeleteMutation(transaction)],
        occurredAt,
        operationCode: "transaction.delete",
        userId: scope.userId,
      });
    },

    convertToTransfer: async (input): Promise<void> => {
      const { scope, actionId, occurredAt } = await context();
      const transaction = await scope.findOwned(
        dependencies.transactionsCollection(),
        input.transactionId
      );
      assertTransactionAvailable(transaction);
      const fromAccount = await findOwnedAccount(
        scope,
        dependencies.accountsCollection(),
        transaction.accountId
      );
      const toAccount = await findOwnedAccount(
        scope,
        dependencies.accountsCollection(),
        input.toAccountId
      );
      if (transaction.currency !== fromAccount.currency) {
        fail(TRANSACTION_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      if (fromAccount.currency !== toAccount.currency) {
        fail(TRANSACTION_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      const transfer = prepareTransfer(
        dependencies.transfersCollection(),
        transaction,
        input.toAccountId,
        input.notes,
        scope.userId
      );
      const transferPostimage = transferAfter(transfer, toAccount.currency);
      await dependencies.executeCoreFinancialAction({
        accountEffects: [
          {
            account: fromAccount,
            amountMinorUnits: signedTransactionEffect(
              transaction.amount,
              fromAccount.currency,
              transaction.type,
              "reverse"
            ),
          },
          {
            account: fromAccount,
            amountMinorUnits: `-${positiveMinorUnits(
              transaction.amount,
              fromAccount.currency
            )}`,
          },
          {
            account: toAccount,
            amountMinorUnits: positiveMinorUnits(
              transaction.amount,
              toAccount.currency
            ),
          },
        ],
        actionId,
        domain: "transactions",
        domainReferenceId: transaction.id,
        kind: "convert_to_transfer",
        mutationRecords: [
          transactionDeleteMutation(transaction),
          {
            after: transferPostimage,
            assertPostimage: (raw): void =>
              assertRawTransferMatches(
                raw,
                transferPostimage,
                toAccount.currency,
                TRANSACTION_CORE_WRITER_ERROR_CODES.INVALID_PLAN
              ),
            entity: "transfer",
            expectedUpdatedAt: null,
            mode: "create",
            model: transfer,
          },
        ],
        occurredAt,
        operationCode: "transaction.convert-to-transfer",
        userId: scope.userId,
      });
    },

    batchDelete: async (items): Promise<void> => {
      if (items.length === 0) return;
      const { scope, actionId, occurredAt } = await context();
      const accountById = new Map<string, Account>();
      const effects: CoreAccountEffectInput[] = [];
      const mutations: CoreFinancialActionMutationRecord[] = [];
      const getAccount = async (accountId: string): Promise<Account> => {
        const cached = accountById.get(accountId);
        if (cached) return cached;
        const found = await findOwnedAccount(
          scope,
          dependencies.accountsCollection(),
          accountId
        );
        accountById.set(accountId, found);
        return found;
      };

      for (const item of items) {
        if (item.kind === "transaction") {
          const record = scope.assertOwned(item.record);
          if (record.deleted) {
            fail(TRANSACTION_CORE_WRITER_ERROR_CODES.RECORD_UNAVAILABLE);
          }
          const account = await getAccount(record.accountId);
          effects.push({
            account,
            amountMinorUnits: signedTransactionEffect(
              record.amount,
              account.currency,
              record.type,
              "reverse"
            ),
          });
          mutations.push(transactionDeleteMutation(record));
        } else {
          const record = scope.assertOwned(item.record);
          if (record.deleted) {
            fail(TRANSACTION_CORE_WRITER_ERROR_CODES.RECORD_UNAVAILABLE);
          }
          const fromAccount = await getAccount(record.fromAccountId);
          const toAccount = await getAccount(record.toAccountId);
          effects.push(
            {
              account: fromAccount,
              amountMinorUnits: positiveMinorUnits(
                record.amount,
                fromAccount.currency
              ),
            },
            {
              account: toAccount,
              amountMinorUnits: `-${positiveMinorUnits(
                record.convertedAmount ?? record.amount,
                toAccount.currency
              )}`,
            }
          );
          mutations.push(transferDeleteMutation(record, toAccount.currency));
        }
      }

      await dependencies.executeCoreFinancialAction({
        accountEffects: effects,
        actionId,
        domain: "transactions",
        domainReferenceId: firstMutationReference(mutations),
        kind: "batch_delete",
        mutationRecords: mutations,
        occurredAt,
        operationCode: "transaction.batch-delete",
        userId: scope.userId,
      });
    },
  };
}
