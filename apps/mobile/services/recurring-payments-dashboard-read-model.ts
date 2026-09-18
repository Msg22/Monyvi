import type { CurrencyType, RecurringPayment } from "@monyvi/db";
import { convertSelectedCurrentAmount } from "@/services/current-market-snapshot-calculations";
import type { SelectedMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import { getRecurringPaymentDueGroupTitle } from "@/utils/recurring-payment-due-labels";

export type SortOption =
  | "next_due"
  | "highest_amount"
  | "lowest_amount"
  | "name_a_z";

export interface PaymentSection {
  readonly key: string;
  readonly title: string;
  readonly data: readonly RecurringPayment[];
}

interface SortPaymentsOptions {
  readonly preferredCurrency?: CurrencyType;
  readonly selectedSnapshot?: SelectedMarketRateSnapshot;
}

export function sortPayments(
  payments: readonly RecurringPayment[],
  sort: SortOption,
  options: SortPaymentsOptions = {}
): RecurringPayment[] {
  return [...payments].sort((a, b) => {
    switch (sort) {
      case "highest_amount":
        return (
          getComparableAmount(b, options) - getComparableAmount(a, options)
        );
      case "lowest_amount":
        return (
          getComparableAmount(a, options) - getComparableAmount(b, options)
        );
      case "name_a_z":
        return a.name.localeCompare(b.name);
      case "next_due":
        return a.nextDueDate.getTime() - b.nextDueDate.getTime();
    }
  });
}

export function groupPaymentsByDueDate(
  payments: readonly RecurringPayment[]
): PaymentSection[] {
  return payments.reduce<PaymentSection[]>((sections, payment) => {
    const key = getDueGroupKey(payment);
    const title = getRecurringPaymentDueGroupTitle(payment);
    const existingSection = sections.find((section) => section.key === key);

    if (existingSection) {
      return sections.map((section) =>
        section.key === key
          ? { ...section, data: [...section.data, payment] }
          : section
      );
    }

    return [...sections, { key, title, data: [payment] }];
  }, []);
}

function getDueGroupKey(payment: RecurringPayment): string {
  const date = payment.nextDueDate;

  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}

function getComparableAmount(
  payment: RecurringPayment,
  options: SortPaymentsOptions
): number {
  if (!options.preferredCurrency || !options.selectedSnapshot) {
    return payment.amount;
  }

  return (
    convertSelectedCurrentAmount({
      amount: payment.amount,
      fromCurrency: payment.currency,
      toCurrency: options.preferredCurrency,
      currentSnapshot: options.selectedSnapshot,
    }) ?? payment.amount
  );
}
