const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface RecurringStartDateValidationOptions {
  readonly startDate: Date;
  readonly referenceDate?: Date;
  readonly originalStartDate?: Date | null;
}

/** Returns whether a Date contains a finite timestamp. */
export function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

/** Returns whether two dates identify the same local calendar day. */
export function isSameLocalCalendarDay(
  firstDate: Date,
  secondDate: Date
): boolean {
  return (
    isValidDate(firstDate) &&
    isValidDate(secondDate) &&
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

/**
 * Returns the inclusive upper boundary for a newly selected recurring start
 * date: the same local calendar date one year after the reference date.
 * Leap-day references clamp to the final valid day of the target month.
 */
export function getRecurringStartDateMaximum(
  referenceDate: Date = new Date()
): Date {
  assertValidDate(referenceDate, "reference date");

  const maximumDate = new Date(referenceDate);
  const referenceDay = maximumDate.getDate();
  const referenceMonth = maximumDate.getMonth();

  maximumDate.setDate(1);
  maximumDate.setFullYear(maximumDate.getFullYear() + 1);
  maximumDate.setMonth(referenceMonth);

  const lastDayOfTargetMonth = new Date(
    maximumDate.getFullYear(),
    referenceMonth + 1,
    0
  ).getDate();
  maximumDate.setDate(Math.min(referenceDay, lastDayOfTargetMonth));

  return maximumDate;
}

/**
 * Returns whether a recurring-payment start date satisfies the current
 * inclusive local-calendar range. An existing legacy date outside the range is
 * allowed only while its local calendar day remains unchanged during editing.
 */
export function isRecurringStartDateAllowed({
  startDate,
  referenceDate = new Date(),
  originalStartDate = null,
}: RecurringStartDateValidationOptions): boolean {
  if (!isValidDate(startDate) || !isValidDate(referenceDate)) {
    return false;
  }

  if (
    originalStartDate !== null &&
    isSameLocalCalendarDay(startDate, originalStartDate)
  ) {
    return true;
  }

  const maximumDate = getRecurringStartDateMaximum(referenceDate);
  return (
    isOnOrBeforeDay(referenceDate, startDate) &&
    isOnOrBeforeDay(startDate, maximumDate)
  );
}

/**
 * Returns whether a date falls on or before another date in local calendar days.
 */
export function isOnOrBeforeDay(date: Date, boundary: Date): boolean {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);

  const normalizedBoundary = new Date(boundary);
  normalizedBoundary.setHours(0, 0, 0, 0);

  return normalizedDate.getTime() <= normalizedBoundary.getTime();
}

/** Returns the number of local calendar days from the reference date to a date. */
export function calculateCalendarDaysUntil(
  date: Date,
  referenceDate: Date = new Date()
): number {
  assertValidDate(date, "due date");
  assertValidDate(referenceDate, "reference date");

  return (
    (getLocalCalendarDayTimestamp(date) -
      getLocalCalendarDayTimestamp(referenceDate)) /
    MS_PER_DAY
  );
}

/** Returns whether a date belongs to the reference date's local calendar month. */
export function isInCurrentLocalMonth(
  date: Date,
  referenceDate: Date = new Date()
): boolean {
  assertValidDate(date, "date");
  assertValidDate(referenceDate, "reference date");

  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth()
  );
}

export function getRecurringPaymentReactivationDueDate({
  nextDueDate,
  frequency,
  endDate,
}: {
  readonly nextDueDate: Date;
  readonly frequency: string;
  readonly endDate?: Date | null;
}): Date {
  if (
    endDate !== undefined &&
    endDate !== null &&
    isOnOrBeforeDay(nextDueDate, endDate)
  ) {
    return calculateNextDueDate(nextDueDate, frequency);
  }

  return nextDueDate;
}

function calculateNextDueDate(currentDueDate: Date, frequency: string): Date {
  const next = new Date(currentDueDate);

  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      return next;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      return next;
    case "MONTHLY":
      return addMonthsClamped(currentDueDate, 1);
    case "QUARTERLY":
      return addMonthsClamped(currentDueDate, 3);
    case "YEARLY":
      return addMonthsClamped(currentDueDate, 12);
    default:
      return addMonthsClamped(currentDueDate, 1);
  }
}

function addMonthsClamped(date: Date, months: number): Date {
  const next = new Date(date);
  const dayOfMonth = next.getDate();

  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDayOfTargetMonth = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0
  ).getDate();
  next.setDate(Math.min(dayOfMonth, lastDayOfTargetMonth));

  return next;
}

function assertValidDate(date: Date, label: string): void {
  if (!isValidDate(date)) {
    throw new Error(`Invalid recurring payment ${label}`);
  }
}

function getLocalCalendarDayTimestamp(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
