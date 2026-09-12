const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface RecurringStartDateValidationOptions {
  readonly startDate: Date;
  readonly referenceDate?: Date;
  readonly originalStartDate?: Date | null;
}

export interface FirstRecurringOccurrenceOptions {
  readonly startDate: Date;
  readonly frequency: string;
  readonly referenceDate?: Date;
}

export interface NextRecurringOccurrenceOptions {
  readonly startDate: Date;
  readonly currentOccurrence: Date;
  readonly frequency: string;
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
 * Returns the first occurrence after an already recorded start date whose local
 * calendar day is on or after the supplied reference date. Monthly, quarterly,
 * and yearly occurrences stay anchored to the original day instead of drifting
 * after a shorter month.
 */
export function getFirstRecurringOccurrenceOnOrAfter({
  startDate,
  frequency,
  referenceDate = new Date(),
}: FirstRecurringOccurrenceOptions): Date {
  assertValidDate(startDate, "start date");
  assertValidDate(referenceDate, "reference date");

  let occurrenceIndex = 1;
  let occurrence = getAnchoredRecurringOccurrence(
    startDate,
    frequency,
    occurrenceIndex
  );

  while (!isOnOrBeforeDay(referenceDate, occurrence)) {
    const previousTimestamp = occurrence.getTime();
    occurrenceIndex += 1;
    occurrence = getAnchoredRecurringOccurrence(
      startDate,
      frequency,
      occurrenceIndex
    );

    if (occurrence.getTime() <= previousTimestamp) {
      throw new Error("Recurring payment occurrence did not advance");
    }
  }

  return occurrence;
}

/**
 * Returns the first occurrence strictly after the current local calendar day
 * while retaining the original schedule anchor. This prevents a monthly or
 * yearly series from drifting after a shortened month.
 */
export function getNextRecurringOccurrenceAfter({
  startDate,
  currentOccurrence,
  frequency,
}: NextRecurringOccurrenceOptions): Date {
  assertValidDate(startDate, "start date");
  assertValidDate(currentOccurrence, "current occurrence");

  if (!isOnOrBeforeDay(startDate, currentOccurrence)) {
    return new Date(startDate);
  }

  const nextReferenceDate = new Date(currentOccurrence);
  nextReferenceDate.setDate(nextReferenceDate.getDate() + 1);

  return getFirstRecurringOccurrenceOnOrAfter({
    startDate,
    frequency,
    referenceDate: nextReferenceDate,
  });
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
  startDate,
  nextDueDate,
  frequency,
  endDate,
}: {
  readonly startDate?: Date;
  readonly nextDueDate: Date;
  readonly frequency: string;
  readonly endDate?: Date | null;
}): Date {
  if (
    endDate !== undefined &&
    endDate !== null &&
    isOnOrBeforeDay(nextDueDate, endDate)
  ) {
    return startDate === undefined
      ? calculateNextDueDate(nextDueDate, frequency)
      : getNextRecurringOccurrenceAfter({
          startDate,
          currentOccurrence: nextDueDate,
          frequency,
        });
  }

  return nextDueDate;
}

function getAnchoredRecurringOccurrence(
  startDate: Date,
  frequency: string,
  occurrenceIndex: number
): Date {
  const occurrence = new Date(startDate);

  switch (frequency) {
    case "DAILY":
      occurrence.setDate(occurrence.getDate() + occurrenceIndex);
      return occurrence;
    case "WEEKLY":
      occurrence.setDate(occurrence.getDate() + occurrenceIndex * 7);
      return occurrence;
    case "MONTHLY":
    case "CUSTOM":
      // Preserve the legacy recurring-date fallback. CUSTOM schedules were
      // advanced monthly before anchored recurrence calculations were added.
      return addMonthsClamped(startDate, occurrenceIndex);
    case "QUARTERLY":
      return addMonthsClamped(startDate, occurrenceIndex * 3);
    case "YEARLY":
      return addMonthsClamped(startDate, occurrenceIndex * 12);
    default:
      throw new Error("Unsupported recurring payment frequency");
  }
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
