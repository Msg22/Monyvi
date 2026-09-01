import type {
  Account,
  RecurringPayment,
  RecurringStatus,
  Transaction,
} from "@monyvi/db";
import type { Collection, Model } from "@nozbe/watermelondb";
import {
  isOnOrBeforeDay,
  parseCanonicalUnsignedIntegerString,
  type CanonicalJsonValue,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";

import type { AccountBalanceCommandService } from "./account-balance-command-service";
import type {
  FinancialActionLinkedOperationPostimage,
  FinancialActionLinkedOperationPreimage,
  FinancialActionLinkedOperationPlan,
} from "./financial-action-foundation-repository";
import {
  assertRawTransactionMatches,
  buildTransactionAfter,
  formatFinancialActionLocalDate,
  getExactTransactionMinorUnits,
  getNextAccountBalance,
  getNextAccountFinancialRevision,
  prepareFinancialActionTransaction,
  type TransactionAfter,
} from "./transaction-financial-action-service";
import type { CurrentUserDataScope } from "./user-data-access";

export const RECURRING_FINANCIAL_ACTION_ERROR_CODES = {
  ACCOUNT_CURRENCY_MISMATCH: "RECURRING_PAYMENT_ACCOUNT_CURRENCY_MISMATCH",
  ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
  INVALID_PLAN: "RECURRING_PAYMENT_FINANCIAL_ACTION_INVALID_PLAN",
  OWNERSHIP_FAILED: "RECURRING_PAYMENT_FINANCIAL_ACTION_OWNERSHIP_FAILED",
  PAYMENT_UNAVAILABLE: "RECURRING_PAYMENT_UNAVAILABLE",
} as const;

export interface SubmitRecurringPaymentFinancialActionInput {
  readonly accountId: string;
  readonly amount: number;
  readonly note?: string;
  readonly paymentId: string;
}

export interface RecurringPaymentFinancialActionDependencies {
  readonly accountsCollection: () => Collection<Account>;
  readonly assertExpectedCurrentUser: (userId: string) => Promise<void>;
  readonly calculateNextDueDate: (
    date: Date,
    frequency: string
  ) => Date;
  readonly executeAccountBalanceCommand: AccountBalanceCommandService["execute"];
  readonly getCurrentUserDataScope: () => Promise<CurrentUserDataScope>;
  readonly hashProvider: Sha256Provider;
  readonly now: () => Date;
  readonly recurringPaymentsCollection: () => Collection<RecurringPayment>;
  readonly transactionsCollection: () => Collection<Transaction>;
}

export interface RecurringPaymentFinancialActionService {
  readonly submit: (
    input: SubmitRecurringPaymentFinancialActionInput
  ) => Promise<Transaction>;
}

interface RecurringPaymentAfter {
  readonly [key: string]: CanonicalJsonValue;
  readonly id: string;
  readonly nextDueDate: string;
  readonly status: RecurringStatus;
}

interface RecurringScheduleResult {
  readonly after: RecurringPaymentAfter;
  readonly nextDueDate: Date;
  readonly status: RecurringStatus;
}

function fail(code: string): never {
  throw new Error(code);
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
    fail(RECURRING_FINANCIAL_ACTION_ERROR_CODES.OWNERSHIP_FAILED);
  }
}

function assertPaymentIsAvailable(payment: RecurringPayment): void {
  const hasEligibleDuePayment =
    payment.endDate === undefined ||
    payment.endDate === null ||
    isOnOrBeforeDay(payment.nextDueDate, payment.endDate);
  if (payment.deleted || payment.status !== "ACTIVE" || !hasEligibleDuePayment) {
    fail(RECURRING_FINANCIAL_ACTION_ERROR_CODES.PAYMENT_UNAVAILABLE);
  }
}

function buildScheduleResult(
  payment: RecurringPayment,
  calculateNextDueDate: (date: Date, frequency: string) => Date
): RecurringScheduleResult {
  const candidate = calculateNextDueDate(
    payment.nextDueDate,
    payment.frequency
  );
  const isFinalOccurrence =
    payment.endDate !== undefined &&
    payment.endDate !== null &&
    !isOnOrBeforeDay(candidate, payment.endDate);
  const nextDueDate = isFinalOccurrence ? payment.nextDueDate : candidate;
  const status: RecurringStatus = isFinalOccurrence
    ? "COMPLETED"
    : "ACTIVE";
  return {
    after: {
      id: payment.id,
      nextDueDate: formatFinancialActionLocalDate(nextDueDate),
      status,
    },
    nextDueDate,
    status,
  };
}

function buildEnvelope(input: {
  readonly account: Account;
  readonly payment: RecurringPayment;
  readonly schedule: RecurringPaymentAfter;
  readonly signedMinorUnits: string;
  readonly transaction: TransactionAfter;
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
    actionId: input.transaction.id,
    domain: "recurring_payments",
    domainReferenceId: input.payment.id,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "pay_now",
    occurredAt: input.transaction.createdAt,
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
            after: input.schedule,
            entity: "recurring_payment",
            expectedUpdatedAt: input.payment.updatedAt.toISOString(),
            mode: "update",
          },
          {
            after: input.transaction,
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [input.payment.id, input.transaction.id].sort(),
      operationCode: "recurring.pay-now",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: input.userId,
  };
}

function assertCachedOwnership(
  userId: string,
  cachedPreimages: readonly FinancialActionLinkedOperationPreimage[],
  accountId: string,
  paymentId: string
): void {
  const identities = cachedPreimages.map(
    (preimage) => `${preimage.table}:${preimage.id}:${preimage.kind}`
  );
  if (
    cachedPreimages.length !== 2 ||
    !identities.includes(`accounts:${accountId}:update`) ||
    !identities.includes(`recurring_payments:${paymentId}:update`)
  ) {
    fail(RECURRING_FINANCIAL_ACTION_ERROR_CODES.INVALID_PLAN);
  }
  cachedPreimages.forEach((preimage) => assertOwnedRaw(preimage.raw, userId));
}

function assertRecurringScheduleMatches(
  raw: Readonly<Model["_raw"]>,
  expected: RecurringPaymentAfter
): void {
  if (
    readRaw(raw, "next_due_date") !==
      new Date(`${expected.nextDueDate}T00:00:00`).getTime() ||
    readRaw(raw, "status") !== expected.status
  ) {
    fail(RECURRING_FINANCIAL_ACTION_ERROR_CODES.INVALID_PLAN);
  }
}

function assertPreparedOwnership(
  userId: string,
  preparedPostimages: readonly FinancialActionLinkedOperationPostimage[],
  schedule: RecurringPaymentAfter,
  transaction: TransactionAfter
): void {
  preparedPostimages.forEach((postimage) => assertOwnedRaw(postimage.raw, userId));
  const preparedTransaction = preparedPostimages.find(
    (postimage) =>
      postimage.table === "transactions" && postimage.id === transaction.id
  );
  const preparedSchedule = preparedPostimages.find(
    (postimage) =>
      postimage.table === "recurring_payments" &&
      postimage.id === schedule.id
  );
  if (
    !preparedTransaction ||
    preparedTransaction.kind !== "create" ||
    !preparedSchedule ||
    preparedSchedule.kind !== "update"
  ) {
    fail(RECURRING_FINANCIAL_ACTION_ERROR_CODES.INVALID_PLAN);
  }
  assertRawTransactionMatches(preparedTransaction.raw, transaction);
  assertRecurringScheduleMatches(preparedSchedule.raw, schedule);
}

function buildPlan(input: {
  readonly account: Account;
  readonly nextAccountBalance: number;
  readonly nextAccountRevision: string;
  readonly payment: RecurringPayment;
  readonly schedule: RecurringScheduleResult;
  readonly transaction: Transaction;
  readonly transactionAfter: TransactionAfter;
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
      {
        kind: "update",
        model: input.payment,
        update: (model): void => {
          const payment = model as RecurringPayment;
          payment.nextDueDate = input.schedule.nextDueDate;
          payment.status = input.schedule.status;
        },
      },
    ],
    assertCachedOwnership: ({ userId, cachedPreimages }): Promise<void> => {
      assertCachedOwnership(
        userId,
        cachedPreimages,
        input.account.id,
        input.payment.id
      );
      return Promise.resolve();
    },
    assertPreparedOwnership: ({ userId, preparedPostimages }): Promise<void> => {
      assertPreparedOwnership(
        userId,
        preparedPostimages,
        input.schedule.after,
        input.transactionAfter
      );
      return Promise.resolve();
    },
  };
}

export function createRecurringPaymentFinancialActionService(
  dependencies: RecurringPaymentFinancialActionDependencies
): RecurringPaymentFinancialActionService {
  return {
    submit: async (
      input: SubmitRecurringPaymentFinancialActionInput
    ): Promise<Transaction> => {
      const scope = await dependencies.getCurrentUserDataScope();
      const payment = await scope.findOwned(
        dependencies.recurringPaymentsCollection(),
        input.paymentId
      );
      assertPaymentIsAvailable(payment);
      const account = await scope.findOwned(
        dependencies.accountsCollection(),
        input.accountId
      );
      if (account.deleted) {
        fail(RECURRING_FINANCIAL_ACTION_ERROR_CODES.ACCOUNT_UNAVAILABLE);
      }
      if (account.currency !== payment.currency) {
        fail(
          RECURRING_FINANCIAL_ACTION_ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH
        );
      }
      const occurredAt = dependencies.now();
      const amountMinorUnits = getExactTransactionMinorUnits({
        accountId: account.id,
        amount: input.amount,
        categoryId: payment.categoryId,
        currency: payment.currency,
        date: occurredAt,
        linkedRecurringId: payment.id,
        note: input.note,
        source: "RECURRING",
        type: payment.type,
      });
      await dependencies.assertExpectedCurrentUser(scope.userId);

      const transaction = prepareFinancialActionTransaction(
        dependencies.transactionsCollection(),
        {
          accountId: account.id,
          amount: input.amount,
          categoryId: payment.categoryId,
          currency: payment.currency,
          date: occurredAt,
          linkedRecurringId: payment.id,
          note: input.note,
          source: "RECURRING",
          type: payment.type,
        },
        scope.userId
      );
      const transactionAfter = buildTransactionAfter(
        transaction,
        amountMinorUnits
      );
      const signedMinorUnits =
        payment.type === "EXPENSE"
          ? `-${amountMinorUnits}`
          : amountMinorUnits;
      const schedule = buildScheduleResult(
        payment,
        dependencies.calculateNextDueDate
      );
      const envelope = buildEnvelope({
        account,
        payment,
        schedule: schedule.after,
        signedMinorUnits,
        transaction: transactionAfter,
        userId: scope.userId,
      });
      await dependencies.executeAccountBalanceCommand({
        envelope,
        hashProvider: dependencies.hashProvider,
        prepareDomainOperationPlan: (): Promise<FinancialActionLinkedOperationPlan> =>
          Promise.resolve(
            buildPlan({
              account,
              nextAccountBalance: getNextAccountBalance(
                account.balance,
                signedMinorUnits,
                account.currency
              ),
              nextAccountRevision: getNextAccountFinancialRevision(
                account.financialRevision
              ),
              payment,
              schedule,
              transaction,
              transactionAfter,
            })
          ),
      });
      return transaction;
    },
  };
}
