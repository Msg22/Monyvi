import type { RecurringPayment } from "@monyvi/db";
import { calculateCalendarDaysUntil } from "@monyvi/logic";
import { formatDate, getDaysUntil, getDueText } from "./dateHelpers";

export function getRecurringPaymentDueLabel(
  payment: RecurringPayment
): string {
  if (payment.isCompleted && calculateCalendarDaysUntil(payment.nextDueDate) < 0) {
    return formatRecurringPaymentCalendarDate(payment.nextDueDate);
  }

  return getDueText(payment.nextDueDate);
}

export function getRecurringPaymentDueGroupTitle(
  payment: RecurringPayment
): string {
  const daysUntilDue = getDaysUntil(payment.nextDueDate);

  if (payment.isCompleted && calculateCalendarDaysUntil(payment.nextDueDate) < 0) {
    return formatRecurringPaymentCalendarDate(payment.nextDueDate);
  }

  if (daysUntilDue <= 1) {
    return getDueText(payment.nextDueDate);
  }

  return formatRecurringPaymentCalendarDate(payment.nextDueDate);
}

function formatRecurringPaymentCalendarDate(date: Date): string {
  const format =
    date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy";

  return formatDate(date, format);
}
