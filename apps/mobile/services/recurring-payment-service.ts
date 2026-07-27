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
  action: RecurringAction;
  notes?: string;
}

export type UpdateRecurringPaymentData = RecurringPaymentData;

export const RECURRING_PAYMENT_SERVICE_ERROR_CODES = {
  ACCOUNT_UNAVAILABLE: "RECURRING_PAYMENT_ACCOUNT_UNAVAILABLE",
  CATEGORY_UNAVAILABLE: "RECURRING_PAYMENT_CATEGORY_UNAVAILABLE",
  PAYMENT_UNAVAILABLE: "RECURRING_PAYMENT_UNAVAILABLE",
} as const;

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
      rec.userId = scope.userId;
      rec.name = data.name;
      rec.amount = Math.abs(data.amount);
      rec.currency = data.currency;
      rec.type = data.type;
      rec.accountId = data.accountId;
      rec.categoryId = data.categoryId;
      rec.frequency = data.frequency;
      rec.startDate = data.startDate;
      rec.nextDueDate = calculateNextDueDate(data.startDate, data.frequency);
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
    await payment.update((record) => {
      record.name = data.name;
      record.amount = Math.abs(data.amount);
      record.currency = data.currency;
      record.type = data.type;
      record.accountId = data.accountId;
      record.categoryId = data.categoryId;
      const didStartDateChange =
        record.startDate.getTime() !== data.startDate.getTime();
      const didFrequencyChange = record.frequency !== data.frequency;
      const nextDueDateAnchor = didStartDateChange
        ? data.startDate
        : record.nextDueDate;
      record.frequency = data.frequency;
      record.startDate = data.startDate;
      if (didStartDateChange || didFrequencyChange) {
        record.nextDueDate = calculateNextDueDate(
          nextDueDateAnchor,
          data.frequency
        );
      }
      record.action = data.action;
      record.notes = data.notes;
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
    if (persistedPayment.deleted) {
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
        record.nextDueDate = calculateNextDueDate(
          persistedPayment.nextDueDate,
          persistedPayment.frequency
        );
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
