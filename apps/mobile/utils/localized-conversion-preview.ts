import i18next, { t } from "i18next";

import type { CurrencyType, MarketRate } from "@monyvi/db";
import { convertCurrency, getCurrencyRate } from "@monyvi/logic";

import type { SupportedLanguage } from "@/i18n/translation-schema";
import { formatLocalizedMoneyAmount } from "@/utils/localized-money-display";

const PRIMARY_RATE_FRACTION_DIGITS = 2;
const SECONDARY_RATE_MAX_FRACTION_DIGITS = 4;

export interface FormatLocalizedConversionPreviewOptions {
  readonly amount: number | string;
  readonly fromCurrency: CurrencyType;
  readonly toCurrency: CurrencyType;
  readonly rates: MarketRate | null;
  readonly language?: SupportedLanguage;
}

export function formatLocalizedConversionPreview({
  amount,
  fromCurrency,
  toCurrency,
  rates,
  language,
}: FormatLocalizedConversionPreviewOptions): string {
  const resolvedLanguage = language ?? getActiveLanguage();
  if (!rates) {
    return translateForLanguage("exchange_rate_unavailable", resolvedLanguage);
  }

  const parsedAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  const safeAmount = Number.isFinite(parsedAmount) ? parsedAmount : 0;

  if (fromCurrency === toCurrency) {
    return formatFixedAmount(safeAmount, toCurrency, resolvedLanguage);
  }

  try {
    const convertedAmount = convertCurrency(
      safeAmount,
      fromCurrency,
      toCurrency,
      rates
    );
    const formattedAmount = formatFixedAmount(
      convertedAmount,
      toCurrency,
      resolvedLanguage
    );
    const formattedRate = formatLocalizedExchangeRate(
      fromCurrency,
      toCurrency,
      rates,
      resolvedLanguage
    );

    return translateForLanguage(
      "conversion_preview_at_rate",
      resolvedLanguage,
      {
        amount: formattedAmount,
        rate: formattedRate,
      }
    );
  } catch {
    return translateForLanguage("conversion_unavailable", resolvedLanguage);
  }
}

function formatLocalizedExchangeRate(
  currencyA: CurrencyType,
  currencyB: CurrencyType,
  rates: MarketRate,
  language: SupportedLanguage
): string {
  const rateAToB = getCurrencyRate(rates, currencyA, currencyB);

  if (rateAToB >= 1) {
    return buildRateEquation(
      currencyA,
      currencyB,
      rateAToB,
      PRIMARY_RATE_FRACTION_DIGITS,
      language
    );
  }

  return buildRateEquation(
    currencyB,
    currencyA,
    getCurrencyRate(rates, currencyB, currencyA),
    SECONDARY_RATE_MAX_FRACTION_DIGITS,
    language
  );
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
    minimumFractionDigits: PRIMARY_RATE_FRACTION_DIGITS,
    maximumFractionDigits,
  });

  return `${base} = ${quote}`;
}

function formatFixedAmount(
  amount: number,
  currency: CurrencyType,
  language: SupportedLanguage
): string {
  return formatLocalizedMoneyAmount({
    amount,
    currency,
    language,
    englishPresentation: "code-suffix",
    minimumFractionDigits: PRIMARY_RATE_FRACTION_DIGITS,
    maximumFractionDigits: PRIMARY_RATE_FRACTION_DIGITS,
  });
}

function translateForLanguage(
  key:
    | "exchange_rate_unavailable"
    | "conversion_unavailable"
    | "conversion_preview_at_rate",
  language: SupportedLanguage,
  values?: Readonly<Record<string, string>>
): string {
  return t(key, {
    ns: "transactions",
    lng: language,
    fallbackLng: false,
    ...values,
  });
}

function getActiveLanguage(): SupportedLanguage {
  return i18next.language === "ar" ? "ar" : "en";
}
