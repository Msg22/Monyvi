import type { CurrencyType } from "@monyvi/db";

import { CURRENCY_PRECISION, DEFAULT_PRECISION } from "../utils/currency";
import {
  isSupportedMetalsIsoCurrencyCode,
  type CurrencyInstrumentCode,
} from "./rate-reference";

const THREE_MINOR_UNIT_CURRENCIES: ReadonlySet<string> = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);
const ZERO_MINOR_UNIT_CURRENCIES: ReadonlySet<string> = new Set([
  "ISK",
  "JPY",
  "KRW",
]);

export function resolveMetalsCurrencyMinorUnits(
  instrumentCode: CurrencyInstrumentCode
): number | null {
  const code = instrumentCode.startsWith("currency:")
    ? instrumentCode.slice("currency:".length)
    : "";
  if (!isSupportedMetalsIsoCurrencyCode(code)) {
    return null;
  }
  if (THREE_MINOR_UNIT_CURRENCIES.has(code)) {
    return 3;
  }
  return ZERO_MINOR_UNIT_CURRENCIES.has(code) ? 0 : 2;
}

export function resolveCurrencyDisplayMinorUnits(
  currency: CurrencyType
): number {
  if (isSupportedMetalsIsoCurrencyCode(currency)) {
    return (
      resolveMetalsCurrencyMinorUnits(`currency:${currency}`) ??
      DEFAULT_PRECISION
    );
  }
  return CURRENCY_PRECISION[currency] ?? DEFAULT_PRECISION;
}
