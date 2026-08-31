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
