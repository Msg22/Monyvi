import type { SupportedLanguage } from "@/i18n/translation-schema";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";
import type { CurrencyType } from "@monyvi/db";
import {
  getCurrencyPrecision,
  MAX_TRANSACTION_AMOUNT,
  parseStrictAmountInput,
} from "@monyvi/logic";
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

  const language = resolveMoneyLanguage(locale);
  const safeAmount = parseConversionAmount(amount, fromCurrency);
  if (fromCurrency === toCurrency) {
    return formatFixedAmount(safeAmount, toCurrency, language);
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

  return t("conversion_preview_at_rate", {
    amount: formatFixedAmount(converted, toCurrency, language),
    rate: buildRateEquation(
      baseCurrency,
      quoteCurrency,
      displayRate,
      forwardRate >= 1 ? 2 : 4,
      language
    ),
  });
}

function buildRateEquation(
  baseCurrency: CurrencyType,
  quoteCurrency: CurrencyType,
  quoteAmount: number,
  maximumFractionDigits: number,
  language: SupportedLanguage
): string {
  const base = formatLocalizedMoneyAmount({
    amount: 1,
    currency: baseCurrency,
    language,
    englishPresentation: "code-suffix",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const quote = formatLocalizedMoneyAmount({
    amount: quoteAmount,
    currency: quoteCurrency,
    language,
    englishPresentation: "code-suffix",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
  return `${base} = ${quote}`;
}

function formatFixedAmount(
  amount: number,
  currency: CurrencyType,
  language: SupportedLanguage
): string {
  const fractionDigits = getCurrencyPrecision(currency);
  return formatLocalizedMoneyAmount({
    amount,
    currency,
    language,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function parseConversionAmount(
  amount: number | string,
  currency: CurrencyType
): number {
  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : 0;
  }

  const parsed = parseStrictAmountInput(amount, {
    maxAmount: MAX_TRANSACTION_AMOUNT,
    maxFractionDigits: getCurrencyPrecision(currency),
  });
  return parsed.success ? parsed.amount : 0;
}

function resolveMoneyLanguage(locale: string): SupportedLanguage {
  return locale.toLowerCase().startsWith("ar") ? "ar" : "en";
}
