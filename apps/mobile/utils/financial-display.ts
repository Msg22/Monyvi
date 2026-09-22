import type { CurrencyType, TransactionType } from "@monyvi/db";
import { getCurrentLanguage } from "@/i18n/changeLanguage";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

interface AccountBalanceInput {
  readonly balance: number;
  readonly currency: CurrencyType;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
}

interface TransactionAmountInput {
  readonly amount: number;
  readonly currency: CurrencyType;
  readonly type: TransactionType;
}

export function formatAccountBalance(account: AccountBalanceInput): string {
  return formatLocalizedMoneyAmount({
    amount: account.balance,
    currency: account.currency,
    minimumFractionDigits: account.minimumFractionDigits,
    maximumFractionDigits: account.maximumFractionDigits,
  });
}

export function formatSignedTransactionAmount(
  transaction: TransactionAmountInput
): string {
  const language = getCurrentLanguage();
  const sign = transaction.type === "EXPENSE" ? "-" : "+";

  if (language === "ar") {
    const signedAmount =
      transaction.type === "EXPENSE"
        ? -Math.abs(transaction.amount)
        : Math.abs(transaction.amount);
    return formatLocalizedMoneyAmount({
      amount: signedAmount,
      currency: transaction.currency,
      language,
      signDisplay: "always",
    });
  }

  return `${sign}${formatLocalizedMoneyAmount({
    amount: transaction.amount,
    currency: transaction.currency,
    language,
  })}`;
}
