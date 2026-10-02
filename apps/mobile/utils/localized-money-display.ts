/**
 * Mobile presentation adapter for localized monetary output.
 *
 * The existing @monyvi/logic currency formatter remains the source of truth for
 * English number policy. This adapter only adds localized numeric rendering,
 * translated amount labels, and the Arabic number-label order.
 */
import i18next, { t } from "i18next";

import type { CurrencyType } from "@monyvi/db";
import {
  formatCurrency as formatEnglishCurrency,
  roundDecimal,
} from "@monyvi/logic";

import type { SupportedLanguage } from "@/i18n/translation-schema";

const COMMON_NAMESPACE = "common";
const AMOUNT_LABEL_KEY_PREFIX = "currency_amount_labels";
const ARABIC_LOCALE = "ar-EG";
const ENGLISH_LOCALE = "en-US";
const ARABIC_LETTER_MARK = "\u061c";
const ARABIC_GROUP_SEPARATOR = "٬";
const ARABIC_DECIMAL_SEPARATOR = "٫";
const ENGLISH_GROUP_SEPARATOR = ",";
const ENGLISH_DECIMAL_SEPARATOR = ".";
const DEFAULT_DISPLAY_PRECISION = 2;
const EXTENDED_DISPLAY_PRECISION: Partial<Record<CurrencyType, number>> = {
  BHD: 3,
  KWD: 3,
  OMR: 3,
  BTC: 8,
};

export type MoneyDisplaySignDisplay =
  | "always"
  | "exceptZero"
  | "negative"
  | "never"
  | "auto";

export type EnglishCurrencyPresentation =
  | "standard"
  | "code-prefix"
  | "code-suffix";

export interface FormatLocalizedMoneyNumberOptions {
  readonly amount: number | string;
  readonly currency: CurrencyType;
  readonly language?: SupportedLanguage;
  readonly signDisplay?: MoneyDisplaySignDisplay;
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
}

export interface FormatLocalizedMoneyAmountOptions extends FormatLocalizedMoneyNumberOptions {
  readonly englishPresentation?: EnglishCurrencyPresentation;
}

interface FractionPolicy {
  readonly minimumFractionDigits: number;
  readonly maximumFractionDigits: number;
}

interface RoundedDecimal {
  readonly integerDigits: string;
  readonly fractionDigits: string;
  readonly isNegative: boolean;
  readonly isZero: boolean;
}

/** Resolves fixed unit wording for a monetary amount. */
export function getCurrencyAmountLabel(
  currency: CurrencyType,
  language?: SupportedLanguage
): string {
  const resolvedLanguage = language ?? getActiveLanguage();
  const key = `${AMOUNT_LABEL_KEY_PREFIX}.${currency}`;
  const translated = t(key, {
    ns: COMMON_NAMESPACE,
    lng: resolvedLanguage,
    fallbackLng: false,
  });

  return !translated || translated === key ? currency : translated;
}

/** Formats a locale-aware monetary numeric run without a currency label. */
export function formatLocalizedMoneyNumber({
  amount,
  currency,
  language,
  signDisplay = "auto",
  minimumFractionDigits,
  maximumFractionDigits,
}: FormatLocalizedMoneyNumberOptions): string {
  const resolvedLanguage = language ?? getActiveLanguage();
  const policy = resolveFractionPolicy(
    amount,
    currency,
    minimumFractionDigits,
    maximumFractionDigits
  );

  if (typeof amount === "number") {
    const normalizedAmount = amount || 0;
    if (!Number.isFinite(normalizedAmount)) {
      throw new RangeError("Money amount must be finite");
    }

    return new Intl.NumberFormat(
      resolvedLanguage === "ar" ? ARABIC_LOCALE : ENGLISH_LOCALE,
      {
        style: "decimal",
        ...policy,
        signDisplay,
      }
    ).format(normalizedAmount);
  }

  return formatCanonicalDecimal(amount, resolvedLanguage, signDisplay, policy);
}

/** Formats one user-visible monetary amount. */
export function formatLocalizedMoneyAmount({
  amount,
  currency,
  language,
  signDisplay = "auto",
  minimumFractionDigits,
  maximumFractionDigits,
  englishPresentation = "standard",
}: FormatLocalizedMoneyAmountOptions): string {
  const resolvedLanguage = language ?? getActiveLanguage();
  const formattedNumber = formatLocalizedMoneyNumber({
    amount,
    currency,
    language: resolvedLanguage,
    signDisplay,
    minimumFractionDigits,
    maximumFractionDigits,
  });

  if (resolvedLanguage === "ar") {
    return `${formattedNumber} ${getCurrencyAmountLabel(currency, "ar")}`;
  }

  if (englishPresentation === "code-prefix") {
    if (formattedNumber.startsWith("+") || formattedNumber.startsWith("-")) {
      return `${formattedNumber[0]} ${currency} ${formattedNumber.slice(1)}`;
    }
    return `${currency} ${formattedNumber}`;
  }
  if (englishPresentation === "code-suffix") {
    return `${formattedNumber} ${currency}`;
  }
  if (typeof amount === "number") {
    const formattedCurrency = formatEnglishCurrency({
      amount,
      currency,
      signDisplay,
      minimumFractionDigits,
      maximumFractionDigits,
    });

    return formattedNumber.startsWith("+")
      ? applyStandardEnglishCurrencyPlacement(formattedNumber, currency)
      : formattedCurrency;
  }

  return applyStandardEnglishCurrencyPlacement(formattedNumber, currency);
}

function getActiveLanguage(): SupportedLanguage {
  return i18next.language === "ar" ? "ar" : "en";
}

function resolveFractionPolicy(
  amount: number | string,
  currency: CurrencyType,
  minimumFractionDigits?: number,
  maximumFractionDigits?: number
): FractionPolicy {
  const precision =
    EXTENDED_DISPLAY_PRECISION[currency] ?? DEFAULT_DISPLAY_PRECISION;
  const maximum = maximumFractionDigits ?? precision;

  if (
    !Number.isInteger(maximum) ||
    maximum < 0 ||
    (minimumFractionDigits !== undefined &&
      (!Number.isInteger(minimumFractionDigits) || minimumFractionDigits < 0))
  ) {
    throw new RangeError("Invalid money fraction digit range");
  }

  const hasFraction =
    typeof amount === "number"
      ? hasNonZeroNumberFraction(amount, precision)
      : roundCanonicalDecimal(toCanonicalDecimal(amount), maximum)
          .fractionDigits.slice(0, precision)
          .split("")
          .some((digit) => digit !== "0");
  const minimum =
    minimumFractionDigits ?? (hasFraction ? Math.min(precision, maximum) : 0);

  if (maximum < minimum) {
    throw new RangeError("Invalid money fraction digit range");
  }

  return {
    minimumFractionDigits: minimum,
    maximumFractionDigits: maximum,
  };
}

function hasNonZeroNumberFraction(amount: number, precision: number): boolean {
  if (!Number.isFinite(amount)) {
    throw new RangeError("Money amount must be finite");
  }

  const factor = 10 ** precision;
  const roundedMinorUnits = Math.round(Math.abs(amount || 0) * factor);
  return roundedMinorUnits % factor !== 0;
}

function formatCanonicalDecimal(
  amount: string,
  language: SupportedLanguage,
  signDisplay: MoneyDisplaySignDisplay,
  policy: FractionPolicy
): string {
  const rounded = roundCanonicalDecimal(
    toCanonicalDecimal(amount),
    policy.maximumFractionDigits
  );
  const trimmedFraction = rounded.fractionDigits.replace(/0+$/, "");
  const visibleFraction = trimmedFraction.padEnd(
    policy.minimumFractionDigits,
    "0"
  );
  const groupSeparator =
    language === "ar" ? ARABIC_GROUP_SEPARATOR : ENGLISH_GROUP_SEPARATOR;
  const decimalSeparator =
    language === "ar" ? ARABIC_DECIMAL_SEPARATOR : ENGLISH_DECIMAL_SEPARATOR;
  const groupedInteger = rounded.integerDigits.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    groupSeparator
  );
  const sign = resolveSign(rounded, signDisplay, language);
  const decimal =
    visibleFraction.length > 0
      ? `${groupedInteger}${decimalSeparator}${visibleFraction}`
      : groupedInteger;
  const signedDecimal = `${sign}${decimal}`;

  return language === "ar"
    ? localizeArabicDigits(signedDecimal)
    : signedDecimal;
}

function toCanonicalDecimal(amount: number | string): string {
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) {
      throw new RangeError("Money amount must be finite");
    }
    return (amount || 0).toFixed(20).replace(/\.?0+$/, "");
  }

  const normalized = amount.trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(normalized)) {
    throw new RangeError("Money amount must be a canonical decimal");
  }
  return normalized;
}

function roundCanonicalDecimal(
  amount: string,
  maximumFractionDigits: number
): RoundedDecimal {
  const rounded = roundDecimal(amount, maximumFractionDigits);
  const unsigned = rounded.startsWith("-") ? rounded.slice(1) : rounded;
  const [integerDigits = "0", fractionDigits = ""] = unsigned.split(".");
  const isZero =
    integerDigits === "0" &&
    !fractionDigits.split("").some((digit) => digit !== "0");

  return {
    integerDigits,
    fractionDigits,
    isNegative: amount.startsWith("-") && !isZero,
    isZero,
  };
}

function resolveSign(
  amount: RoundedDecimal,
  signDisplay: MoneyDisplaySignDisplay,
  language: SupportedLanguage
): string {
  const shouldShowNegative = amount.isNegative && signDisplay !== "never";
  const shouldShowPositive =
    !amount.isNegative &&
    (signDisplay === "always" ||
      (signDisplay === "exceptZero" && !amount.isZero));
  const sign = shouldShowNegative ? "-" : shouldShowPositive ? "+" : "";

  return sign && language === "ar" ? `${ARABIC_LETTER_MARK}${sign}` : sign;
}

function localizeArabicDigits(value: string): string {
  return value.replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

/** Keeps the existing English symbol placement for canonical strings. */
function applyStandardEnglishCurrencyPlacement(
  formattedNumber: string,
  currency: CurrencyType
): string {
  const template = formatEnglishCurrency({
    amount: 0,
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const zeroIndex = template.indexOf("0");
  const prefix = template.slice(0, zeroIndex);
  const suffix = template.slice(zeroIndex + 1);

  if (
    (formattedNumber.startsWith("-") || formattedNumber.startsWith("+")) &&
    prefix.length > 0
  ) {
    return `${formattedNumber[0]}${prefix}${formattedNumber.slice(1)}${suffix}`;
  }

  return `${prefix}${formattedNumber}${suffix}`;
}
