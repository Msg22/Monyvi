import {
  getFirstRecurringOccurrenceOnOrAfter,
  getNextRecurringOccurrenceAfter,
  getRecurringPaymentReactivationDueDate,
  isOnOrBeforeDay,
  isRecurringStartDateAllowed,
  isSameLocalCalendarDay,
  isValidCurrencyAmount,
  isValidDate,
  isValidTransactionAmount,
} from "@monyvi/logic";

import {
  database,
  type Account,
  type Category,
  type CurrencyType,
  type RecurringAction,
  type RecurringFrequency,
  type RecurringPayment,
  type TransactionType,
} from "@monyvi/db";
import { getCurrentUserDataScope } from "@/services/user-data-access";
import {
  assertValidTransactionAmount,
  prepareTransactionCreateWithBalance,
} from "./transaction-service";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { commitPreparedBatch } from "./watermelon-atomic-batch";

export interface RecurringPaymentData {
  readonly name: string;
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: TransactionType;
  readonly accountId: string;
  readonly categoryId: string;
  readonly frequency: RecurringFrequency;
  readonly startDate: Date;
  readonly endDate?: Date | null;
  readonly initialOccurrenceRecorded?: boolean;
  readonly action: RecurringAction;
  readonly notes?: string;
}

export interface UpdateRecurringPaymentData extends RecurringPaymentData {
  readonly reactivateAfterSaving?: boolean;
  readonly expectedNextDueDate?: Date;
}

export const RECURRING_PAYMENT_SERVICE_ERROR_CODES = {
  ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
  CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
  PAYMENT_UNAVAILABLE: "RECURRING_PAYMENT_UNAVAILABLE",
  REACTIVATION_UNAVAILABLE: "RECURRING_PAYMENT_REACTIVATION_UNAVAILABLE",
  INVALID_AMOUNT: "RECURRING_PAYMENT_INVALID_AMOUNT",
  INVALID_START_DATE: "RECURRING_PAYMENT_INVALID_START_DATE",
  INVALID_END_DATE: "RECURRING_PAYMENT_INVALID_END_DATE",
  INVALID_SCHEDULE: "RECURRING_PAYMENT_INVALID_SCHEDULE",
  CURRENCY_MISMATCH: "RECURRING_PAYMENT_CURRENCY_MISMATCH",
  STALE_SCHEDULE: "RECURRING_PAYMENT_STALE_SCHEDULE",
} as const;

type CurrentUserDataScope = Awaited<
  ReturnType<typeof getCurrentUserDataScope>
>;

function isEligibleDueDate(
  dueDate: Date,
  endDate: Date | null | undefined
): boolean {
  return (
    endDate === undefined ||
    endDate === null ||
    isOnOrBeforeDay(dueDate, endDate)
  );
}

function assertValidRecurringPaymentAmountValue(amount: number): void {
  if (!isValidTransactionAmount(amount)) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);
  }
}

function assertValidRecurringPaymentAmountPrecision(
  amount: number,
  currency: CurrencyType
): void {
  if (!isValidCurrencyAmount(amount, currency)) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_AMOUNT);
  }
}

function assertCurrencyMatchesAccount(
  currency: CurrencyType,
  account: Account
): void {
  if (account.currency !== currency) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CURRENCY_MISMATCH);
  }
}

function assertValidRecurringPaymentDateShape(
  data: Pick<RecurringPaymentData, "startDate" | "endDate">
): void {
  if (!isValidDate(data.startDate)) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE);
  }

  if (
    data.endDate !== undefined &&
    data.endDate !== null &&
    !isValidDate(data.endDate)
  ) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_END_DATE);
  }
}

function assertStartDateAllowed(
  startDate: Date,
  referenceDate: Date,
  originalStartDate: Date | null = null
): void {
  if (
    !isRecurringStartDateAllowed({
      startDate,
      referenceDate,
      originalStartDate,
    })
  ) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_START_DATE);
  }
}

function assertEndDateAllowsDuePayment(
  dueDate: Date,
  endDate: Date | null | undefined
): void {
  if (!isEligibleDueDate(dueDate, endDate)) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE);
  }
}

function resolveCreateNextDueDate(
  data: RecurringPaymentData,
  referenceDate: Date
): Date {
  if (!data.initialOccurrenceRecorded) {
    return data.startDate;
  }

  try {
    return getFirstRecurringOccurrenceOnOrAfter({
      startDate: data.startDate,
      frequency: data.frequency,
      referenceDate,
    });
  } catch {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.INVALID_SCHEDULE);
  }
}

async function resolveRecurringPaymentReferences(
  scope: CurrentUserDataScope,
  accountId: string,
  categoryId: string,
  paymentType: TransactionType
): Promise<Account> {
  let account: Account;
  try {
    account = await scope.findOwned(
      database.get<Account>("accounts"),
      accountId
    );
  } catch {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.ACCOUNT_UNAVAILABLE);
  }
  if (account.deleted) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.ACCOUNT_UNAVAILABLE);
  }

  let category: Category;
  try {
    category = await scope.findAccessibleCategory(
      database.get<Category>("categories"),
      categoryId
    );
  } catch {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE);
  }
  if (category.deleted || category.type !== paymentType) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.CATEGORY_UNAVAILABLE);
  }

  return account;
}

/**
 * Create a new recurring payment record.
 */
export async function createRecurringPayment(
  data: RecurringPaymentData
): Promise<RecurringPayment> {
  assertValidRecurringPaymentAmountValue(data.amount);
  assertValidRecurringPaymentDateShape(data);

  const referenceDate = new Date();
  const nextDueDate = resolveCreateNextDueDate(data, referenceDate);
  assertStartDateAllowed(nextDueDate, referenceDate);
  assertEndDateAllowsDuePayment(nextDueDate, data.endDate);

  const scope = await getCurrentUserDataScope();
  const account = await resolveRecurringPaymentReferences(
    scope,
    data.accountId,
    data.categoryId,
    data.type
  );
  assertCurrencyMatchesAccount(data.currency, account);
  assertValidRecurringPaymentAmountPrecision(data.amount, account.currency);

  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  return await database.write(async () => {
    return await recurringCollection.create((rec) => {
      rec.userId = scope.userId;
      rec.name = data.name;
      rec.amount = data.amount;
      rec.currency = data.currency;
      rec.type = data.type;
      rec.accountId = data.accountId;
      rec.categoryId = data.categoryId;
      rec.frequency = data.frequency;
      rec.startDate = data.startDate;
      rec.endDate = data.endDate ?? undefined;
      rec.nextDueDate = nextDueDate;
      rec.action = data.action;
      rec.status = "ACTIVE";
      rec.deleted = false;
      rec.notes = data.notes;
    });
  });
}

export async function updateRecurringPayment(
  paymentId: string,
  data: UpdateRecurringPaymentData
): Promise<void> {
  assertValidRecurringPaymentAmountValue(data.amount);
  assertValidRecurringPaymentDateShape(data);

  const scope = await getCurrentUserDataScope();
  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");
  const payment = await scope.findOwned(recurringCollection, paymentId);

  if (
    data.expectedNextDueDate !== undefined &&
    (!isValidDate(data.expectedNextDueDate) ||
      !isSameLocalCalendarDay(payment.nextDueDate, data.expectedNextDueDate))
  ) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.STALE_SCHEDULE);
  }

  const dataMatchesStoredAnchor = isSameLocalCalendarDay(
    payment.startDate,
    data.startDate
  );
  const dataMatchesCurrentDueDate = isSameLocalCalendarDay(
    payment.nextDueDate,
    data.startDate
  );
  const originalEditableDate = dataMatchesStoredAnchor
    ? payment.startDate
    : payment.nextDueDate;
  const requestedDueDate =
    dataMatchesStoredAnchor && !dataMatchesCurrentDueDate
      ? payment.nextDueDate
      : data.startDate;

  const referenceDate = new Date();
  assertStartDateAllowed(data.startDate, referenceDate, originalEditableDate);
  assertEndDateAllowsDuePayment(requestedDueDate, data.endDate);
  const account = await resolveRecurringPaymentReferences(
    scope,
    data.accountId,
    data.categoryId,
    data.type
  );
  assertCurrencyMatchesAccount(data.currency, account);
  assertValidRecurringPaymentAmountPrecision(data.amount, account.currency);

  await database.write(async () => {
    const previousEndDate = payment.endDate;
    const nextEndDate = data.endDate ?? null;
    const previousStatus = payment.status;
    const wasCompletedByPreviousEndDate =
      previousStatus === "COMPLETED" &&
      previousEndDate !== undefined &&
      previousEndDate !== null;
    const wasCompletedAtPreviousBoundary =
      wasCompletedByPreviousEndDate &&
      isOnOrBeforeDay(payment.nextDueDate, previousEndDate);
    const didRelaxEndDate =
      nextEndDate === null ||
      (nextEndDate !== null &&
        previousEndDate !== undefined &&
        previousEndDate !== null &&
        !isOnOrBeforeDay(nextEndDate, previousEndDate));
    const didDuePaymentChange =
      !dataMatchesStoredAnchor && !dataMatchesCurrentDueDate;
    const didFrequencyChange = payment.frequency !== data.frequency;
    const shouldRetainFinalPaidOccurrence =
      wasCompletedAtPreviousBoundary &&
      !didRelaxEndDate &&
      data.reactivateAfterSaving !== true;
    const recurrenceAnchorDate = didDuePaymentChange
      ? data.startDate
      : didFrequencyChange
        ? payment.nextDueDate
        : dataMatchesStoredAnchor
          ? data.startDate
          : payment.startDate;
    let nextDueDate = payment.nextDueDate;
    if (didDuePaymentChange) {
      nextDueDate = data.startDate;
    } else if (
      wasCompletedAtPreviousBoundary &&
      (didRelaxEndDate || data.reactivateAfterSaving === true)
    ) {
      nextDueDate = getNextRecurringOccurrenceAfter({
        startDate: recurrenceAnchorDate,
        currentOccurrence: payment.nextDueDate,
        frequency: data.frequency,
      });
    } else if (didFrequencyChange) {
      nextDueDate = getNextRecurringOccurrenceAfter({
        startDate: recurrenceAnchorDate,
        currentOccurrence: payment.nextDueDate,
        frequency: data.frequency,
      });
    }
    const nextDueDateIsEligible = isEligibleDueDate(nextDueDate, nextEndDate);
    if (
      previousStatus === "COMPLETED" &&
      data.reactivateAfterSaving === true &&
      !nextDueDateIsEligible
    ) {
      throw new Error(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.REACTIVATION_UNAVAILABLE
      );
    }
    await payment.update((record) => {
      record.name = data.name;
      record.amount = data.amount;
      record.currency = data.currency;
      record.type = data.type;
      record.accountId = data.accountId;
      record.categoryId = data.categoryId;
      record.frequency = data.frequency;
      record.startDate = recurrenceAnchorDate;
      record.endDate = nextEndDate ?? undefined;
      if (!shouldRetainFinalPaidOccurrence) {
        record.nextDueDate = nextDueDate;
      }
      record.action = data.action;
      record.notes = data.notes;
      const hasNoEligibleFutureOccurrence =
        (previousStatus === "ACTIVE" || previousStatus === "PAUSED") &&
        !nextDueDateIsEligible;
      if (hasNoEligibleFutureOccurrence) {
        record.status = "COMPLETED";
      }
      if (
        previousStatus === "COMPLETED" &&
        data.reactivateAfterSaving === true &&
        nextDueDateIsEligible
      ) {
        record.status = "ACTIVE";
      }
    });
  });
}

export async function reactivateRecurringPayment(
  paymentId: string
): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  await database.write(async () => {
    const payment = await scope.findOwned(recurringCollection, paymentId);
    const nextDueDate = getRecurringPaymentReactivationDueDate(payment);
    if (
      payment.deleted ||
      payment.status !== "COMPLETED" ||
      !isEligibleDueDate(nextDueDate, payment.endDate)
    ) {
      throw new Error(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.REACTIVATION_UNAVAILABLE
      );
    }

    await payment.update((record) => {
      record.nextDueDate = nextDueDate;
      record.status = "ACTIVE";
    });
  });
}

export async function pauseRecurringPayment(paymentId: string): Promise<void> {
  await updateRecurringPaymentStatus(paymentId, "PAUSED");
}

export async function resumeRecurringPayment(paymentId: string): Promise<void> {
  await updateRecurringPaymentStatus(paymentId, "ACTIVE");
}

export async function deleteRecurringPayment(paymentId: string): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  await database.write(async () => {
    const payment = await scope.findOwned(recurringCollection, paymentId);
    await payment.update((record) => {
      record.deleted = true;
    });
  });
}

async function updateRecurringPaymentStatus(
  paymentId: string,
  status: "ACTIVE" | "PAUSED"
): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  await database.write(async () => {
    const payment = await scope.findOwned(recurringCollection, paymentId);
    await payment.update((record) => {
      record.status = status;
    });
  });
}

/**
 * Update the next due date of a recurring payment after a "Pay Now" action.
 * Calculates the next due date based on the payment's frequency.
 */
export async function updateRecurringPaymentNextDueDate(
  paymentId: string,
  currentDueDate: Date,
  frequency: string
): Promise<void> {
  const scope = await getCurrentUserDataScope();
  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  await database.write(async () => {
    const payment = await scope.findOwned(recurringCollection, paymentId);
    await payment.update((record) => {
      record.nextDueDate = getNextRecurringOccurrenceAfter({
        startDate: payment.startDate,
        currentOccurrence: currentDueDate,
        frequency,
      });
    });
  });
}

/**
 * Atomically creates a linked transaction, updates its account balance, and
 * advances the authoritative recurring-payment schedule.
 */
export async function submitRecurringPayment(params: {
  payment: RecurringPayment;
  accountId: string;
  amount: number;
  note?: string;
}): Promise<void> {
  const { payment, accountId, amount, note } = params;
  assertValidTransactionAmount(amount);

  const scope = await getCurrentUserDataScope();
  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  await database.write(async () => {
    const persistedPayment = await scope.findOwned(
      recurringCollection,
      payment.id
    );
    const hasEligibleDuePayment =
      persistedPayment.endDate === undefined ||
      persistedPayment.endDate === null ||
      isOnOrBeforeDay(persistedPayment.nextDueDate, persistedPayment.endDate);
    if (
      persistedPayment.deleted ||
      persistedPayment.status !== "ACTIVE" ||
      !hasEligibleDuePayment
    ) {
      throw new Error(
        RECURRING_PAYMENT_SERVICE_ERROR_CODES.PAYMENT_UNAVAILABLE
      );
    }

    const transactionData = {
      amount,
      currency: persistedPayment.currency,
      categoryId: persistedPayment.categoryId,
      accountId,
      note,
      type: persistedPayment.type,
      source: "MANUAL" as const,
      date: new Date(),
      linkedRecurringId: persistedPayment.id,
    };
    const preparedTransaction = await prepareTransactionCreateWithBalance(
      transactionData,
      scope,
      scope.userId
    );
    const paymentSnapshot = captureCachedModelSnapshot(persistedPayment);
    try {
      const scheduleUpdate = persistedPayment.prepareUpdate((record) => {
        const nextDueDate = getNextRecurringOccurrenceAfter({
          startDate: persistedPayment.startDate,
          currentOccurrence: persistedPayment.nextDueDate,
          frequency: persistedPayment.frequency,
        });
        const hasReachedFinalEligibleOccurrence =
          persistedPayment.endDate !== undefined &&
          persistedPayment.endDate !== null &&
          !isOnOrBeforeDay(nextDueDate, persistedPayment.endDate);
        if (hasReachedFinalEligibleOccurrence) {
          record.status = "COMPLETED";
          return;
        }
        record.nextDueDate = nextDueDate;
      });

      await commitPreparedBatch([
        ...preparedTransaction.operations,
        scheduleUpdate,
      ]);
    } catch (error) {
      preparedTransaction.restoreCachedAccount();
      restoreCachedModelSnapshot(paymentSnapshot);
      throw error;
    }
  });
}
