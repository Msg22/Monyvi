const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid recurring payment ${label}`);
  }
}

function getLocalCalendarDayTimestamp(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
