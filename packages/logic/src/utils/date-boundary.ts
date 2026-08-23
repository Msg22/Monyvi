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

function assertValidDate(date: Date, label: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid recurring payment ${label}`);
  }
}

function getLocalCalendarDayTimestamp(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
