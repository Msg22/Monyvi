import type {
  RecurringFrequency,
  RecurringStatus,
} from "@monyvi/db";
import {
  getNextRecurringOccurrenceAfter,
  isOnOrBeforeDay,
  isSameLocalCalendarDay,
  isValidDate,
} from "@monyvi/logic";

interface RecurringScheduleFormState {
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly frequency: RecurringFrequency;
  readonly reactivateAfterSaving: boolean;
}

export function getDisplayDueDate({
  dueDate,
  recurrenceAnchorDate,
  initialValues,
  form,
  hasScheduleChanges,
  status,
}: {
  readonly dueDate?: Date;
  readonly recurrenceAnchorDate: Date;
  readonly initialValues: RecurringScheduleFormState;
  readonly form: RecurringScheduleFormState;
  readonly hasScheduleChanges: boolean;
  readonly status?: RecurringStatus;
}): Date {
  if (dueDate && !hasScheduleChanges) {
    return dueDate;
  }

  if (dueDate && status === "COMPLETED" && !form.reactivateAfterSaving) {
    return dueDate;
  }

  const shouldRetainFinalPaidOccurrence =
    dueDate !== undefined &&
    status === "COMPLETED" &&
    form.reactivateAfterSaving &&
    initialValues.endDate !== null &&
    isOnOrBeforeDay(dueDate, initialValues.endDate) &&
    !didRelaxEndDate(initialValues.endDate, form.endDate);
  if (shouldRetainFinalPaidOccurrence) {
    return dueDate;
  }

  const didStartDateChange = !isSameLocalCalendarDay(
    initialValues.startDate,
    form.startDate
  );
  const didFrequencyChange = initialValues.frequency !== form.frequency;
  const didRelaxCompletedEndDate =
    dueDate !== undefined &&
    status === "COMPLETED" &&
    initialValues.endDate !== null &&
    didRelaxEndDate(initialValues.endDate, form.endDate);
  if (
    dueDate &&
    !didStartDateChange &&
    didRelaxCompletedEndDate &&
    isOnOrBeforeDay(dueDate, initialValues.endDate)
  ) {
    return getNextRecurringOccurrenceAfter({
      startDate: recurrenceAnchorDate,
      currentOccurrence: dueDate,
      frequency: form.frequency,
    });
  }
  if (
    dueDate &&
    !didStartDateChange &&
    didFrequencyChange &&
    !(
      status === "COMPLETED" &&
      initialValues.endDate !== null &&
      !isOnOrBeforeDay(dueDate, initialValues.endDate)
    )
  ) {
    return getNextRecurringOccurrenceAfter({
      startDate: recurrenceAnchorDate,
      currentOccurrence: dueDate,
      frequency: form.frequency,
    });
  }

  if (dueDate && status === "COMPLETED") {
    return dueDate;
  }

  return form.startDate;
}

export function areSameOptionalLocalCalendarDays(
  firstDate: Date | null,
  secondDate: Date | null
): boolean {
  if (firstDate === null || secondDate === null) {
    return firstDate === secondDate;
  }

  return isSameLocalCalendarDay(firstDate, secondDate);
}

export function hasNoFurtherEligiblePayment(
  duePayment: Date,
  recurrenceAnchorDate: Date,
  frequency: RecurringFrequency,
  endDate: Date | null
): boolean {
  if (endDate === null || !isOnOrBeforeDay(duePayment, endDate)) {
    return false;
  }

  const nextDueDate = getNextRecurringOccurrenceAfter({
    startDate: recurrenceAnchorDate,
    currentOccurrence: duePayment,
    frequency,
  });

  return !isOnOrBeforeDay(nextDueDate, endDate);
}

export function getReactivationDueDate(
  dueDate: Date | undefined,
  recurrenceAnchorDate: Date,
  initialEndDate: Date | null,
  frequency: RecurringFrequency
): Date | null {
  if (!dueDate) return null;

  return initialEndDate !== null && isOnOrBeforeDay(dueDate, initialEndDate)
    ? getNextRecurringOccurrenceAfter({
        startDate: recurrenceAnchorDate,
        currentOccurrence: dueDate,
        frequency,
      })
    : dueDate;
}

export function getLocalCalendarDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getConstrainedStartDatePickerValue(
  startDate: Date,
  minimumDate: Date,
  maximumDate: Date
): Date {
  const isSelectable =
    isValidDate(startDate) &&
    isOnOrBeforeDay(minimumDate, startDate) &&
    isOnOrBeforeDay(startDate, maximumDate);

  return isSelectable ? startDate : minimumDate;
}

function didRelaxEndDate(
  initialEndDate: Date,
  nextEndDate: Date | null
): boolean {
  return nextEndDate === null || !isOnOrBeforeDay(nextEndDate, initialEndDate);
}
