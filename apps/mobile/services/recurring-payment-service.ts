import {
  getRecurringPaymentReactivationDueDate,
  isOnOrBeforeDay,
} from "@monyvi/logic";

import { calculateNextDueDate } from "@/utils/dateHelpers";
import {
  Account,
  Category,
  CurrencyType,
  database,
  RecurringAction,
  RecurringFrequency,
  RecurringPayment,
  TransactionType,
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
  name: string;
  amount: number;
  currency: CurrencyType;
  type: TransactionType;
  accountId: string;
  categoryId: string;
  frequency: RecurringFrequency;
  startDate: Date;
  endDate?: Date | null;
  initialOccurrenceRecorded?: boolean;
  action: RecurringAction;
  notes?: string;
}

export interface UpdateRecurringPaymentData extends RecurringPaymentData {
  readonly reactivateAfterSaving?: boolean;
}

export const RECURRING_PAYMENT_SERVICE_ERROR_CODES = {
  ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
  CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
  PAYMENT_UNAVAILABLE: "RECURRING_PAYMENT_UNAVAILABLE",
  REACTIVATION_UNAVAILABLE: "RECURRING_PAYMENT_REACTIVATION_UNAVAILABLE",
} as const;

function isEligibleDueDate(
  dueDate: Date,
  endDate: Date | null | undefined
): boolean {
  return endDate === undefined || endDate === null || isOnOrBeforeDay(dueDate, endDate);
}

function assertEndDateAllowsDuePayment(data: RecurringPaymentData): void {
  if (!isEligibleDueDate(data.startDate, data.endDate)) {
    throw new Error(RECURRING_PAYMENT_SERVICE_ERROR_CODES.REACTIVATION_UNAVAILABLE);
  }
}

async function resolveRecurringPaymentReferences(
  scope: Awaited<ReturnType<typeof getCurrentUserDataScope>>,
  accountId: string,
  categoryId: string,
  paymentType: TransactionType
): Promise<void> {
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
}

/**
 * Create a new recurring payment record.
 */
export async function createRecurringPayment(
  data: RecurringPaymentData
): Promise<RecurringPayment> {
  assertEndDateAllowsDuePayment(data);
  const scope = await getCurrentUserDataScope();
  await resolveRecurringPaymentReferences(
    scope,
    data.accountId,
    data.categoryId,
    data.type
  );

  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  return await database.write(async () => {
    return await recurringCollection.create((rec) => {
      const nextDueDate = data.initialOccurrenceRecorded
        ? calculateNextDueDate(data.startDate, data.frequency)
        : data.startDate;
      const hasEligibleNextDueDate = isEligibleDueDate(nextDueDate, data.endDate);
      rec.userId = scope.userId;
      rec.name = data.name;
      rec.amount = Math.abs(data.amount);
      rec.currency = data.currency;
      rec.type = data.type;
      rec.accountId = data.accountId;
      rec.categoryId = data.categoryId;
      rec.frequency = data.frequency;
      rec.startDate = data.startDate;
      rec.endDate = data.endDate ?? undefined;
      rec.nextDueDate =
        data.initialOccurrenceRecorded && !hasEligibleNextDueDate
          ? data.startDate
          : nextDueDate;
      rec.action = data.action;
      rec.status =
        data.initialOccurrenceRecorded && !hasEligibleNextDueDate
          ? "COMPLETED"
          : "ACTIVE";
      rec.deleted = false;
      rec.notes = data.notes;
    });
  });
}

export async function updateRecurringPayment(
  paymentId: string,
  data: UpdateRecurringPaymentData
): Promise<void> {
  assertEndDateAllowsDuePayment(data);
  const scope = await getCurrentUserDataScope();
  await resolveRecurringPaymentReferences(
    scope,
    data.accountId,
    data.categoryId,
    data.type
  );

  const recurringCollection =
    database.get<RecurringPayment>("recurring_payments");

  await database.write(async () => {
    const payment = await scope.findOwned(recurringCollection, paymentId);
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
    const didStartDateChange =
      payment.startDate.getTime() !== data.startDate.getTime();
    const didFrequencyChange = payment.frequency !== data.frequency;
    const shouldRetainFinalPaidOccurrence =
      wasCompletedAtPreviousBoundary && !didRelaxEndDate;
    let nextDueDate = payment.nextDueDate;
    if (didStartDateChange) {
      nextDueDate = data.startDate;
    } else if (wasCompletedAtPreviousBoundary && didRelaxEndDate) {
      nextDueDate = calculateNextDueDate(payment.nextDueDate, data.frequency);
    } else if (didFrequencyChange) {
      nextDueDate = calculateNextDueDate(payment.nextDueDate, data.frequency);
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
      record.amount = Math.abs(data.amount);
      record.currency = data.currency;
      record.type = data.type;
      record.accountId = data.accountId;
      record.categoryId = data.categoryId;
      record.frequency = data.frequency;
      record.startDate = data.startDate;
      record.endDate = nextEndDate ?? undefined;
      if (shouldRetainFinalPaidOccurrence) {
        // Preserve the final paid date until its End date is relaxed.
      } else {
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
      record.nextDueDate = calculateNextDueDate(currentDueDate, frequency);
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
        const nextDueDate = calculateNextDueDate(
          persistedPayment.nextDueDate,
          persistedPayment.frequency
        );
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
