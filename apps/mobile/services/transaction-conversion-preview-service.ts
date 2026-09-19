import type { CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";
import type { TFunction } from "i18next";
import {
  convertSelectedCurrentAmount,
  getSelectedCurrentCurrencyRate,
} from "./current-market-snapshot-calculations";
import type { SelectedMarketRateSnapshot } from "./market-rate-snapshot-read-model-service";

export function formatSelectedSnapshotConversionPreview(
  amount: number | string,
  fromCurrency: CurrencyType,
  toCurrency: CurrencyType,
  currentSnapshot: SelectedMarketRateSnapshot | null,
  t: TFunction<"transactions">,
  locale = "en-US"
): string {
  if (currentSnapshot === null) return t("conversion_unavailable");
  const parsedAmount = typeof amount === "string" ? Number(amount) : amount;
  const safeAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
  if (fromCurrency === toCurrency) {
    return formatCurrency({
      amount: safeAmount,
      currency: toCurrency,
      locale,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const converted = convertSelectedCurrentAmount({
    amount: safeAmount,
    fromCurrency,
    toCurrency,
    currentSnapshot,
  });
  const forwardRate = getSelectedCurrentCurrencyRate({
    fromCurrency,
    toCurrency,
    currentSnapshot,
  });
  if (converted === null || forwardRate === null) {
    return t("conversion_unavailable");
  }

  const baseCurrency = forwardRate >= 1 ? fromCurrency : toCurrency;
  const quoteCurrency = forwardRate >= 1 ? toCurrency : fromCurrency;
  const displayRate =
    forwardRate >= 1
      ? forwardRate
      : getSelectedCurrentCurrencyRate({
          fromCurrency: toCurrency,
          toCurrency: fromCurrency,
          currentSnapshot,
        });
  if (displayRate === null) {
    return t("conversion_unavailable");
  }
  const formattedRate = new Intl.NumberFormat(locale, {
    maximumFractionDigits: forwardRate >= 1 ? 2 : 4,
    minimumFractionDigits: 2,
  }).format(displayRate);

  return t("conversion_preview", {
    amount: formatCurrency({
      amount: converted,
      currency: toCurrency,
      locale,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    one: new Intl.NumberFormat(locale).format(1),
    baseCurrency,
    quoteCurrency,
    rate: formattedRate,
  });
}
