import {
  parseCanonicalDecimal,
  serializeDecimal,
} from "./decimal";
import {
  resolvePuritySelection,
  type SupportedMetal,
} from "./purity-catalog";
import {
  isSupportedMetalsIsoCurrencyCode,
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type MetalsIsoCurrencyCode,
  type RawObservedRateReference,
} from "./rate-reference";
import {
  calculateMetalReferenceValue,
  calculatePurityGramPriceDecimal,
} from "./valuation";

export const HISTORICAL_RATE_CALENDAR_TIME_ZONE = "Africa/Cairo";
export const TROY_OUNCE_GRAMS_DECIMAL = "31.1034768";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const CANONICAL_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export type HistoricalRateOrigin = "action_observation" | "daily_history";

export interface HistoricalDailyRateRecord {
  readonly contractVersion: 1;
  readonly providerKey: string;
  readonly rateDate: string;
  readonly resolution: "daily";
  readonly goldUsdPerTroyOunceDecimal: string;
  readonly silverUsdPerTroyOunceDecimal: string;
  readonly goldUsdPerPureGramDecimal: string;
  readonly silverUsdPerPureGramDecimal: string;
  readonly currenciesUsdPerUnit: Readonly<Record<string, string>>;
  readonly providerResponseTimestamp: string | null;
  readonly fetchedAt: string;
  readonly responseDigest: string;
  readonly source: string;
  readonly quality: "valid";
}

export interface PurchaseDateHistoricalRatePair {
  readonly rateDate: string;
  readonly origin: HistoricalRateOrigin;
  readonly metal: SupportedMetal;
  readonly purchaseCurrency: MetalsIsoCurrencyCode;
  readonly metalUsdPerPureGramDecimal: string;
  readonly purchaseCurrencyUsdPerUnitDecimal: string;
  readonly metalProviderObservedAt: number | null;
  readonly currencyProviderObservedAt: number | null;
  readonly capturedAt: number | null;
  readonly fetchedAt: string | null;
  readonly source: string;
  readonly quality: "valid";
}

export interface TimestampedAcquisitionPairInput {
  readonly purchaseDate: string;
  readonly metal: SupportedMetal;
  readonly purchaseCurrency: string;
  readonly metalReference: RawObservedRateReference;
  readonly currencyReference: RawObservedRateReference;
  readonly calendarTimeZone?: string;
}

export function isExactCalendarDate(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function calendarDateForTimestamp(
  timestampMs: number,
  timeZone: string = HISTORICAL_RATE_CALENDAR_TIME_ZONE
): string | null {
  if (!Number.isFinite(timestampMs) || timestampMs < 0) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestampMs));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (!year || !month || !day) return null;
    const result = year + "-" + month + "-" + day;
    return isExactCalendarDate(result) ? result : null;
  } catch {
    return null;
  }
}

export function normalizeHistoricalMetalTroyOunceToPureGramDecimal(
  valueDecimal: string
): string | null {
  if (!isPositiveCanonicalDecimal(valueDecimal)) return null;
  try {
    return serializeDecimal(
      parseCanonicalDecimal(valueDecimal).dividedBy(TROY_OUNCE_GRAMS_DECIMAL)
    );
  } catch {
    return null;
  }
}

export function parseHistoricalDailyRateRecord(
  value: unknown
): HistoricalDailyRateRecord | null {
  if (!isRecord(value)) return null;
  if (
    value["contractVersion"] !== 1 ||
    value["resolution"] !== "daily" ||
    value["quality"] !== "valid" ||
    typeof value["providerKey"] !== "string" ||
    value["providerKey"].trim().length === 0 ||
    typeof value["source"] !== "string" ||
    value["source"].trim().length === 0 ||
    typeof value["rateDate"] !== "string" ||
    !isExactCalendarDate(value["rateDate"]) ||
    typeof value["fetchedAt"] !== "string" ||
    !isTimestamp(value["fetchedAt"]) ||
    typeof value["responseDigest"] !== "string" ||
    !SHA256_HEX_PATTERN.test(value["responseDigest"]) ||
    !isNullableTimestamp(value["providerResponseTimestamp"])
  ) {
    return null;
  }

  const goldPerTroyOunce = readPositiveDecimal(
    value["goldUsdPerTroyOunceDecimal"]
  );
  const silverPerTroyOunce = readPositiveDecimal(
    value["silverUsdPerTroyOunceDecimal"]
  );
  const goldPerPureGram = readPositiveDecimal(
    value["goldUsdPerPureGramDecimal"]
  );
  const silverPerPureGram = readPositiveDecimal(
    value["silverUsdPerPureGramDecimal"]
  );
  if (
    goldPerTroyOunce === null ||
    silverPerTroyOunce === null ||
    goldPerPureGram === null ||
    silverPerPureGram === null ||
    normalizeHistoricalMetalTroyOunceToPureGramDecimal(goldPerTroyOunce) !==
      goldPerPureGram ||
    normalizeHistoricalMetalTroyOunceToPureGramDecimal(silverPerTroyOunce) !==
      silverPerPureGram
  ) {
    return null;
  }

  const rawCurrencies = value["currenciesUsdPerUnit"];
  if (!isRecord(rawCurrencies)) return null;
  const currencies: Record<string, string> = {};
  for (const [code, rawRate] of Object.entries(rawCurrencies)) {
    if (!isSupportedMetalsIsoCurrencyCode(code)) return null;
    const rate = readPositiveDecimal(rawRate);
    if (rate === null) return null;
    if (
      code === "USD" &&
      !parseCanonicalDecimal(rate).minus("1").isZero()
    ) {
      return null;
    }
    currencies[code] = rate;
  }
  if (currencies["USD"] !== "1") return null;

  return Object.freeze({
    contractVersion: 1,
    providerKey: value["providerKey"],
    rateDate: value["rateDate"],
    resolution: "daily",
    goldUsdPerTroyOunceDecimal: goldPerTroyOunce,
    silverUsdPerTroyOunceDecimal: silverPerTroyOunce,
    goldUsdPerPureGramDecimal: goldPerPureGram,
    silverUsdPerPureGramDecimal: silverPerPureGram,
    currenciesUsdPerUnit: Object.freeze(currencies),
    providerResponseTimestamp: value["providerResponseTimestamp"],
    fetchedAt: value["fetchedAt"],
    responseDigest: value["responseDigest"],
    source: value["source"],
    quality: "valid",
  });
}

export function qualifyTimestampedAcquisitionRatePair(
  input: TimestampedAcquisitionPairInput
): PurchaseDateHistoricalRatePair | null {
  if (
    !isExactCalendarDate(input.purchaseDate) ||
    !isSupportedMetalsIsoCurrencyCode(input.purchaseCurrency)
  ) {
    return null;
  }
  const metalInstrument =
    input.metal === "GOLD" ? "metal:GOLD" : "metal:SILVER";
  const currencyInstrument = "currency:" + input.purchaseCurrency;
  const metal = validateAndNormalizeRateReference(input.metalReference, {
    role: "acquisition_metal",
    instrumentCode: metalInstrument,
  });
  const currency = validateAndNormalizeRateReference(input.currencyReference, {
    role: "acquisition_purchase_currency",
    instrumentCode: currencyInstrument as CurrencyInstrumentCode,
  });
  if (!metal.available || !currency.available) return null;

  const metalObservedAt = metal.value.providerObservedAt;
  const currencyObservedAt = currency.value.providerObservedAt;
  if (metalObservedAt === null || currencyObservedAt === null) return null;

  const timeZone =
    input.calendarTimeZone ?? HISTORICAL_RATE_CALENDAR_TIME_ZONE;
  if (
    calendarDateForTimestamp(metalObservedAt, timeZone) !== input.purchaseDate ||
    calendarDateForTimestamp(currencyObservedAt, timeZone) !==
      input.purchaseDate ||
    metal.value.capturedAt !== currency.value.capturedAt ||
    metal.value.source === null ||
    currency.value.source === null ||
    metal.value.source !== currency.value.source
  ) {
    return null;
  }

  return Object.freeze({
    rateDate: input.purchaseDate,
    origin: "action_observation",
    metal: input.metal,
    purchaseCurrency: input.purchaseCurrency,
    metalUsdPerPureGramDecimal: metal.value.normalizedUsdPerBaseDecimal,
    purchaseCurrencyUsdPerUnitDecimal:
      currency.value.normalizedUsdPerBaseDecimal,
    metalProviderObservedAt: metalObservedAt,
    currencyProviderObservedAt: currencyObservedAt,
    capturedAt: metal.value.capturedAt,
    fetchedAt: null,
    source: metal.value.source,
    quality: "valid",
  });
}

export function selectHistoricalDailyRatePair(input: {
  readonly record: HistoricalDailyRateRecord;
  readonly purchaseDate: string;
  readonly metal: SupportedMetal;
  readonly purchaseCurrency: string;
}): PurchaseDateHistoricalRatePair | null {
  const record = parseHistoricalDailyRateRecord(input.record);
  if (
    record === null ||
    record.rateDate !== input.purchaseDate ||
    !isSupportedMetalsIsoCurrencyCode(input.purchaseCurrency)
  ) {
    return null;
  }
  const currency = record.currenciesUsdPerUnit[input.purchaseCurrency];
  if (currency === undefined) return null;

  return Object.freeze({
    rateDate: record.rateDate,
    origin: "daily_history",
    metal: input.metal,
    purchaseCurrency: input.purchaseCurrency,
    metalUsdPerPureGramDecimal:
      input.metal === "GOLD"
        ? record.goldUsdPerPureGramDecimal
        : record.silverUsdPerPureGramDecimal,
    purchaseCurrencyUsdPerUnitDecimal: currency,
    metalProviderObservedAt: null,
    currencyProviderObservedAt: null,
    capturedAt: null,
    fetchedAt: record.fetchedAt,
    source: record.source,
    quality: "valid",
  });
}

export function calculateHistoricalPurityGramPriceDecimal(input: {
  readonly purityCode: string;
  readonly purityFactorDecimal: string;
  readonly pair: PurchaseDateHistoricalRatePair;
}): string | null {
  const purityFactorDecimal = resolveHistoricalQuotedPurityFactor(input);
  if (purityFactorDecimal === null) return null;
  return calculatePurityGramPriceDecimal({
    purityFactorDecimal,
    metalUsdPerPureGramDecimal: input.pair.metalUsdPerPureGramDecimal,
    currencyUsdPerUnitDecimal:
      input.pair.purchaseCurrencyUsdPerUnitDecimal,
  });
}

export function calculateHistoricalPurchaseEstimateDecimal(input: {
  readonly weightGramsDecimal: string;
  readonly purityCode: string;
  readonly purityFactorDecimal: string;
  readonly pair: PurchaseDateHistoricalRatePair;
}): string | null {
  const purityFactorDecimal = resolveHistoricalQuotedPurityFactor(input);
  if (purityFactorDecimal === null) return null;
  const result = calculateMetalReferenceValue({
    weightGramsDecimal: input.weightGramsDecimal,
    purityFactorDecimal,
    metalUsdPerPureGramDecimal: input.pair.metalUsdPerPureGramDecimal,
    currencyUsdPerUnitDecimal:
      input.pair.purchaseCurrencyUsdPerUnitDecimal,
  });
  return result.available ? result.valueDecimal : null;
}

function resolveHistoricalQuotedPurityFactor(input: {
  readonly purityCode: string;
  readonly purityFactorDecimal: string;
  readonly pair: PurchaseDateHistoricalRatePair;
}): string | null {
  const purity = resolvePuritySelection(input.pair.metal, input.purityCode);
  if (
    !purity.available ||
    purity.entry.factorDecimal !== input.purityFactorDecimal
  ) {
    return null;
  }

  // Approved app-wide quoted 24K rule: gold-999 displays/estimates against
  // the quoted 24K gram price directly, while the stored 0.999 evidence stays
  // unchanged for immutable FR-050/P&L accounting.
  return input.pair.metal === "GOLD" && input.purityCode === "gold-999"
    ? "1"
    : input.purityFactorDecimal;
}

function readPositiveDecimal(value: unknown): string | null {
  if (typeof value !== "string" || !isPositiveCanonicalDecimal(value)) {
    return null;
  }
  return value;
}

function isPositiveCanonicalDecimal(value: string): boolean {
  if (!CANONICAL_DECIMAL_PATTERN.test(value)) return false;
  try {
    return parseCanonicalDecimal(value).greaterThan("0");
  } catch {
    return false;
  }
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && isTimestamp(value));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
