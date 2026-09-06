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

export const TRANSFER_CORE_WRITER_ERROR_CODES = {
  ACCOUNT_CURRENCY_MISMATCH: "TRANSFER_ACCOUNT_CURRENCY_MISMATCH",
  ACCOUNT_UNAVAILABLE: "TRANSFER_ACCOUNT_UNAVAILABLE",
  AUTH_SCOPE_CHANGED: "AUTH_SCOPE_CHANGED",
  DESTINATION_AMOUNT_REQUIRED: "TRANSFER_DESTINATION_AMOUNT_REQUIRED",
  INVALID_AMOUNT: "INVALID_TRANSACTION_AMOUNT",
  INVALID_PLAN: "TRANSFER_FINANCIAL_ACTION_INVALID_PLAN",
  RECORD_UNAVAILABLE: "TRANSFER_RECORD_UNAVAILABLE",
} as const;

export interface TransferCoreCreateInput {
  readonly amount: number;
  readonly convertedAmount?: number;
  readonly currency: CurrencyType;
  readonly date?: Date;
  readonly exchangeRate?: number;
  readonly fromAccountId: string;
  readonly notes?: string;
  readonly smsFingerprint?: string;
  readonly toAccountId: string;
}

export interface TransferCoreUpdateInput {
  readonly amount?: number;
  readonly convertedAmount?: number;
  readonly date?: Date;
  readonly fromAccountId?: string;
  readonly notes?: string;
  readonly toAccountId?: string;
}

export interface TransferCoreConvertInput {
  readonly accountId: string;
  readonly categoryId: string;
  readonly counterparty?: string;
  readonly transferId: string;
  readonly type: TransactionType;
}

export interface TransferCoreWriterDependencies {
  readonly accountsCollection: () => Collection<Account>;
  readonly assertExpectedCurrentUser: (userId: string) => Promise<void>;
  readonly createActionId: () => string;
  readonly commitMetadataUpdate: (
    transfer: Transfer,
    updates: TransferCoreUpdateInput,
    userId: string
  ) => Promise<void>;
  readonly executeCoreFinancialAction: CoreAccountFinancialActionService["execute"];
  readonly getCurrentUserDataScope: () => Promise<CurrentUserDataScope>;
  readonly now: () => Date;
  readonly transactionsCollection: () => Collection<Transaction>;
  readonly transfersCollection: () => Collection<Transfer>;
}

export interface TransferCoreWriterService {
  readonly convertToTransaction: (
    input: TransferCoreConvertInput
  ) => Promise<void>;
  readonly create: (
    input: TransferCoreCreateInput,
    expectedUserId?: string
  ) => Promise<void>;
  readonly delete: (transferId: string) => Promise<void>;
  readonly update: (
    transferId: string,
    updates: TransferCoreUpdateInput
  ) => Promise<void>;
}

interface TransferProjection {
  readonly amount: number;
  readonly convertedAmount?: number;
  readonly currency: CurrencyType;
  readonly date: Date;
  readonly exchangeRate?: number;
  readonly fromAccountId: string;
  readonly notes?: string;
  readonly smsFingerprint?: string;
  readonly toAccountId: string;
}

function fail(
  code: (typeof TRANSFER_CORE_WRITER_ERROR_CODES)[keyof typeof TRANSFER_CORE_WRITER_ERROR_CODES]
): never {
  throw new Error(code);
}

function currencyPlaces(currency: CurrencyType): number {
  return CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION;
}

function positiveMinorUnits(amount: number, currency: CurrencyType): string {
  if (!isValidTransactionAmount(amount)) {
    fail(TRANSFER_CORE_WRITER_ERROR_CODES.INVALID_AMOUNT);
  }
  const places = currencyPlaces(currency);
  const minorUnits = toMinorUnits(String(amount), places);
  if (Number(fromMinorUnits(minorUnits, places)) !== amount) {
    fail(TRANSFER_CORE_WRITER_ERROR_CODES.INVALID_AMOUNT);
  }
  return minorUnits;
}

async function findAccount(
  scope: CurrentUserDataScope,
  collection: Collection<Account>,
  accountId: string
): Promise<Account> {
  const account = await scope.findOwned(collection, accountId);
  if (account.deleted) {
    fail(TRANSFER_CORE_WRITER_ERROR_CODES.ACCOUNT_UNAVAILABLE);
  }
  return account;
}

function assertTransferAvailable(transfer: Transfer): void {
  if (transfer.deleted) {
    fail(TRANSFER_CORE_WRITER_ERROR_CODES.RECORD_UNAVAILABLE);
  }
}

function projectionOf(transfer: Transfer): TransferProjection {
  return {
    amount: transfer.amount,
    convertedAmount: transfer.convertedAmount,
    currency: transfer.currency,
    date: transfer.date,
    exchangeRate: transfer.exchangeRate,
    fromAccountId: transfer.fromAccountId,
    notes: transfer.notes,
    smsFingerprint: transfer.smsFingerprint,
    toAccountId: transfer.toAccountId,
  };
}

function projectionAfter(
  current: TransferProjection,
  updates: TransferCoreUpdateInput
): TransferProjection {
  return {
    ...current,
    amount: updates.amount ?? current.amount,
    convertedAmount: updates.convertedAmount ?? current.convertedAmount,
    date: updates.date ?? current.date,
    fromAccountId: updates.fromAccountId ?? current.fromAccountId,
    notes: updates.notes ?? current.notes,
    toAccountId: updates.toAccountId ?? current.toAccountId,
  };
}

function destinationMinorUnits(
  projection: TransferProjection,
  destinationCurrency: CurrencyType
): string {
  if (projection.convertedAmount !== undefined) {
    return positiveMinorUnits(projection.convertedAmount, destinationCurrency);
  }
  if (projection.currency !== destinationCurrency) {
    fail(TRANSFER_CORE_WRITER_ERROR_CODES.DESTINATION_AMOUNT_REQUIRED);
  }
  return positiveMinorUnits(projection.amount, destinationCurrency);
}

function transferAfter(
  transfer: Transfer,
  projection: TransferProjection,
  destinationCurrency: CurrencyType,
  deleted: boolean
): TransferAfter {
  return {
    amountMinorUnits: positiveMinorUnits(
      projection.amount,
      projection.currency
    ),
    convertedAmountMinorUnits:
      projection.convertedAmount === undefined
        ? null
        : destinationMinorUnits(projection, destinationCurrency),
    createdAt: transfer.createdAt.toISOString(),
    currency: projection.currency,
    date: formatFinancialActionLocalDate(projection.date),
    deleted,
    exchangeRate:
      projection.exchangeRate === undefined
        ? null
        : serializeDecimal(String(projection.exchangeRate)),
    fromAccountId: projection.fromAccountId,
    id: transfer.id,
    notes: projection.notes ?? null,
    smsFingerprint: projection.smsFingerprint ?? null,
    toAccountId: projection.toAccountId,
  };
}

function transferUpdateMutation(
  transfer: Transfer,
  projection: TransferProjection,
  destinationCurrency: CurrencyType
): CoreFinancialActionMutationRecord {
  const after = transferAfter(transfer, projection, destinationCurrency, false);
  return {
    after,
    assertPostimage: (raw): void =>
      assertRawTransferMatches(
        raw,
        after,
        destinationCurrency,
        TRANSFER_CORE_WRITER_ERROR_CODES.INVALID_PLAN
      ),
    entity: "transfer",
    expectedUpdatedAt: transfer.updatedAt.toISOString(),
    mode: "update",
    model: transfer,
    update: (model): void => {
      const record = model as Transfer;
      record.amount = projection.amount;
      record.convertedAmount = projection.convertedAmount;
      record.date = projection.date;
      record.fromAccountId = projection.fromAccountId;
      record.notes = projection.notes;
      record.toAccountId = projection.toAccountId;
    },
  };
}

function transferDeleteMutation(
  transfer: Transfer,
  destinationCurrency: CurrencyType
): CoreFinancialActionMutationRecord {
  const after = transferAfter(
    transfer,
    projectionOf(transfer),
    destinationCurrency,
    true
  );
  return {
    after,
    assertPostimage: (raw): void =>
      assertRawTransferMatches(
        raw,
        after,
        destinationCurrency,
        TRANSFER_CORE_WRITER_ERROR_CODES.INVALID_PLAN
      ),
    entity: "transfer",
    expectedUpdatedAt: transfer.updatedAt.toISOString(),
    mode: "delete",
    model: transfer,
  };
}

function prepareTransfer(
  collection: Collection<Transfer>,
  input: TransferCoreCreateInput,
  userId: string,
  date: Date
): Transfer {
  return collection.prepareCreate((transfer) => {
    transfer.userId = userId;
    transfer.fromAccountId = input.fromAccountId;
    transfer.toAccountId = input.toAccountId;
    transfer.amount = input.amount;
    transfer.convertedAmount = input.convertedAmount;
    transfer.currency = input.currency;
    transfer.date = input.date ?? date;
    transfer.notes = input.notes;
    transfer.exchangeRate = input.exchangeRate;
    transfer.smsFingerprint = input.smsFingerprint;
    transfer.deleted = false;
  });
}

function prepareTransaction(
  collection: Collection<Transaction>,
  input: TransferCoreConvertInput,
  transfer: Transfer,
  amount: number,
  currency: CurrencyType,
  userId: string
): Transaction {
  return collection.prepareCreate((transaction) => {
    transaction.userId = userId;
    transaction.accountId = input.accountId;
    transaction.amount = amount;
    transaction.currency = currency;
    transaction.type = input.type;
    transaction.categoryId = input.categoryId;
    transaction.counterparty = input.counterparty;
    transaction.date = transfer.date;
    transaction.note = transfer.notes;
    transaction.source = "MANUAL";
    transaction.isDraft = false;
    transaction.deleted = false;
  });
}

function transactionAfter(
  transaction: Transaction,
  transfer: Transfer
): TransactionAfter {
  return {
    accountId: transaction.accountId,
    amountMinorUnits: positiveMinorUnits(
      transaction.amount,
      transaction.currency
    ),
    categoryId: transaction.categoryId,
    counterparty: transaction.counterparty ?? null,
    createdAt: transaction.createdAt.toISOString(),
    currency: transaction.currency,
    date: formatFinancialActionLocalDate(transaction.date),
    deleted: false,
    id: transaction.id,
    isDraft: false,
    linkedAssetId: null,
    linkedDebtId: null,
    linkedRecurringId: null,
    note: transaction.note ?? null,
    smsFingerprint: transfer.smsFingerprint ?? null,
    source: "MANUAL",
    type: transaction.type,
  };
}

function effectsFor(
  fromAccount: Account,
  toAccount: Account,
  projection: TransferProjection,
  direction: "apply" | "reverse"
): readonly CoreAccountEffectInput[] {
  const source = positiveMinorUnits(projection.amount, fromAccount.currency);
  const destination = destinationMinorUnits(projection, toAccount.currency);
  return [
    {
      account: fromAccount,
      amountMinorUnits: direction === "apply" ? `-${source}` : source,
    },
    {
      account: toAccount,
      amountMinorUnits: direction === "apply" ? destination : `-${destination}`,
    },
  ];
}

export function createTransferCoreWriterService(
  dependencies: TransferCoreWriterDependencies
): TransferCoreWriterService {
  async function context(expectedUserId?: string): Promise<{
    readonly actionId: string;
    readonly occurredAt: string;
    readonly scope: CurrentUserDataScope;
  }> {
    const scope = await dependencies.getCurrentUserDataScope();
    if (expectedUserId !== undefined && expectedUserId !== scope.userId) {
      fail(TRANSFER_CORE_WRITER_ERROR_CODES.AUTH_SCOPE_CHANGED);
    }
    await dependencies.assertExpectedCurrentUser(
      expectedUserId ?? scope.userId
    );
    return {
      actionId: dependencies.createActionId(),
      occurredAt: dependencies.now().toISOString(),
      scope,
    };
  }

  return {
    create: async (input, expectedUserId): Promise<void> => {
      const { actionId, occurredAt, scope } = await context(expectedUserId);
      const fromAccount = await findAccount(
        scope,
        dependencies.accountsCollection(),
        input.fromAccountId
      );
      const toAccount = await findAccount(
        scope,
        dependencies.accountsCollection(),
        input.toAccountId
      );
      if (input.currency !== fromAccount.currency) {
        fail(TRANSFER_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      const transfer = prepareTransfer(
        dependencies.transfersCollection(),
        input,
        scope.userId,
        dependencies.now()
      );
      const projection = projectionOf(transfer);
      destinationMinorUnits(projection, toAccount.currency);
      const after = transferAfter(
        transfer,
        projection,
        toAccount.currency,
        false
      );
      await dependencies.executeCoreFinancialAction({
        accountEffects: effectsFor(fromAccount, toAccount, projection, "apply"),
        actionId,
        domain: "transfers",
        domainReferenceId: transfer.id,
        kind: "create",
        mutationRecords: [
          {
            after,
            assertPostimage: (raw): void =>
              assertRawTransferMatches(
                raw,
                after,
                toAccount.currency,
                TRANSFER_CORE_WRITER_ERROR_CODES.INVALID_PLAN
              ),
            entity: "transfer",
            expectedUpdatedAt: null,
            mode: "create",
            model: transfer,
          },
        ],
        occurredAt,
        operationCode: "transfer.create",
        userId: scope.userId,
      });
    },

    update: async (transferId, updates): Promise<void> => {
      const { actionId, occurredAt, scope } = await context();
      const transfer = await scope.findOwned(
        dependencies.transfersCollection(),
        transferId
      );
      assertTransferAvailable(transfer);
      const before = projectionOf(transfer);
      const after = projectionAfter(before, updates);
      const isFinancialChange =
        after.amount !== before.amount ||
        after.convertedAmount !== before.convertedAmount ||
        after.fromAccountId !== before.fromAccountId ||
        after.toAccountId !== before.toAccountId;
      if (!isFinancialChange) {
        await dependencies.commitMetadataUpdate(
          transfer,
          updates,
          scope.userId
        );
        return;
      }
      const oldFrom = await findAccount(
        scope,
        dependencies.accountsCollection(),
        before.fromAccountId
      );
      const oldTo = await findAccount(
        scope,
        dependencies.accountsCollection(),
        before.toAccountId
      );
      const newFrom =
        after.fromAccountId === before.fromAccountId
          ? oldFrom
          : await findAccount(
              scope,
              dependencies.accountsCollection(),
              after.fromAccountId
            );
      const newTo =
        after.toAccountId === before.toAccountId
          ? oldTo
          : await findAccount(
              scope,
              dependencies.accountsCollection(),
              after.toAccountId
            );
      if (
        before.currency !== oldFrom.currency ||
        after.currency !== newFrom.currency
      ) {
        fail(TRANSFER_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      destinationMinorUnits(before, oldTo.currency);
      destinationMinorUnits(after, newTo.currency);
      await dependencies.executeCoreFinancialAction({
        accountEffects: [
          ...effectsFor(oldFrom, oldTo, before, "reverse"),
          ...effectsFor(newFrom, newTo, after, "apply"),
        ],
        actionId,
        domain: "transfers",
        domainReferenceId: transfer.id,
        kind: "update",
        mutationRecords: [
          transferUpdateMutation(transfer, after, newTo.currency),
        ],
        occurredAt,
        operationCode: "transfer.update",
        userId: scope.userId,
      });
    },

    delete: async (transferId): Promise<void> => {
      const { actionId, occurredAt, scope } = await context();
      const transfer = await scope.findOwned(
        dependencies.transfersCollection(),
        transferId
      );
      assertTransferAvailable(transfer);
      const projection = projectionOf(transfer);
      const fromAccount = await findAccount(
        scope,
        dependencies.accountsCollection(),
        projection.fromAccountId
      );
      const toAccount = await findAccount(
        scope,
        dependencies.accountsCollection(),
        projection.toAccountId
      );
      if (projection.currency !== fromAccount.currency) {
        fail(TRANSFER_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      await dependencies.executeCoreFinancialAction({
        accountEffects: effectsFor(
          fromAccount,
          toAccount,
          projection,
          "reverse"
        ),
        actionId,
        domain: "transfers",
        domainReferenceId: transfer.id,
        kind: "delete",
        mutationRecords: [transferDeleteMutation(transfer, toAccount.currency)],
        occurredAt,
        operationCode: "transfer.delete",
        userId: scope.userId,
      });
    },

    convertToTransaction: async (input): Promise<void> => {
      const { actionId, occurredAt, scope } = await context();
      const transfer = await scope.findOwned(
        dependencies.transfersCollection(),
        input.transferId
      );
      assertTransferAvailable(transfer);
      const projection = projectionOf(transfer);
      const fromAccount = await findAccount(
        scope,
        dependencies.accountsCollection(),
        projection.fromAccountId
      );
      const toAccount = await findAccount(
        scope,
        dependencies.accountsCollection(),
        projection.toAccountId
      );
      const targetAccount = await findAccount(
        scope,
        dependencies.accountsCollection(),
        input.accountId
      );
      if (projection.currency !== fromAccount.currency) {
        fail(TRANSFER_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      }
      const transactionAmount =
        targetAccount.currency === projection.currency
          ? projection.amount
          : targetAccount.id === toAccount.id &&
              projection.convertedAmount !== undefined
            ? projection.convertedAmount
            : fail(TRANSFER_CORE_WRITER_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH);
      const transaction = prepareTransaction(
        dependencies.transactionsCollection(),
        input,
        transfer,
        transactionAmount,
        targetAccount.currency,
        scope.userId
      );
      const transactionEffect = positiveMinorUnits(
        transactionAmount,
        targetAccount.currency
      );
      const transactionPostimage = transactionAfter(transaction, transfer);
      await dependencies.executeCoreFinancialAction({
        accountEffects: [
          ...effectsFor(fromAccount, toAccount, projection, "reverse"),
          {
            account: targetAccount,
            amountMinorUnits:
              input.type === "EXPENSE"
                ? `-${transactionEffect}`
                : transactionEffect,
          },
        ],
        actionId,
        domain: "transfers",
        domainReferenceId: transfer.id,
        kind: "convert_to_transaction",
        mutationRecords: [
          transferDeleteMutation(transfer, toAccount.currency),
          {
            after: transactionPostimage,
            assertPostimage: (raw): void =>
              assertRawTransactionMatches(raw, transactionPostimage),
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
            model: transaction,
          },
        ],
        occurredAt,
        operationCode: "transfer.convert-to-transaction",
        userId: scope.userId,
      });
    },
  };
}
