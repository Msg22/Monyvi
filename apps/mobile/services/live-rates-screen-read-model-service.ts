import type { CurrencyType } from "@monyvi/db";
import {
  type CurrencyInfo,
  type CurrentMarketInstrument,
  type SupportedMetal,
  CURRENCY_INFO_MAP,
  SUPPORTED_CURRENCIES,
  calculateTrendPercent,
  formatRate,
  getCurrencyUsdValue,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  serializeDecimal,
} from "@monyvi/logic";
import {
  summarizeLiveRatesTrust,
  type LiveRatesTrustReadModel,
  type LiveRatesTrustState,
  type LiveRatesTrustValue,
} from "./live-rates-trust-read-model-service";
import type { SelectedMarketRateSnapshot } from "./market-rate-snapshot-read-model-service";

const GOLD_21K_PURITY_DECIMAL = "0.875";
const GOLD_18K_PURITY_DECIMAL = "0.75";
export interface MetalDisplayData {
  readonly price24k: string;
  readonly price21k: string;
  readonly price18k: string;
  readonly goldTrendPercent: number | null;
  readonly silverPrice: string;
  readonly silverTrendPercent: number | null;
  readonly currencySymbol: string;
}

export interface CurrencyDisplayItem {
  readonly code: CurrencyType;
  readonly name: string;
  readonly flag: string;
  readonly rate: string;
  readonly changePercent: number | null;
  readonly trust: LiveRatesTrustDisplayValue;
}

export interface LiveRatesTrustDisplay {
  readonly gold: LiveRatesTrustDisplayValue;
  readonly silver: LiveRatesTrustDisplayValue;
  readonly currencies: LiveRatesTrustDisplayValue;
}

export interface LiveRatesTrustDisplayValue {
  readonly state: LiveRatesTrustState;
  readonly dateTime: string | null;
  readonly ageText: string | null;
  readonly quality: string | null;
  readonly source: string | null;
}

export interface LiveRatesScreenReadModelInput {
  readonly selectedSnapshot: SelectedMarketRateSnapshot | null;
  readonly previousDayRate: Parameters<typeof getCurrencyUsdValue>[0] | null;
  readonly preferredCurrency: CurrencyType;
  readonly locale: string;
  readonly translateRelativeTime: (
    key: "just_now" | "minutes_ago" | "hours_ago" | "days_ago",
    count: number
  ) => string;
}
export interface LiveRatesScreenReadModel {
  readonly metals: MetalDisplayData;
  readonly currencies: readonly CurrencyDisplayItem[];
  readonly rateTrust: LiveRatesTrustDisplay;
}
export function buildLiveRatesScreenReadModel(
  input: LiveRatesScreenReadModelInput
): LiveRatesScreenReadModel {
  const currencySymbol =
    CURRENCY_INFO_MAP[input.preferredCurrency]?.symbol ??
    input.preferredCurrency;
  return {
    metals: buildMetals(input, currencySymbol),
    currencies: buildCurrencies(input, currencySymbol),
    rateTrust: buildTrust(input),
  };
}
function buildMetals(
  {
    selectedSnapshot,
    previousDayRate,
    preferredCurrency,
  }: LiveRatesScreenReadModelInput,
  currencySymbol: string
): MetalDisplayData {
  const preferredUsdPerUnit = preferredRateDecimal(
    selectedSnapshot,
    preferredCurrency
  );
  if (!selectedSnapshot || preferredUsdPerUnit === null) {
    return {
      price24k: "—",
      price21k: "—",
      price18k: "—",
      goldTrendPercent: null,
      silverPrice: "—",
      silverTrendPercent: null,
      currencySymbol,
    };
  }

  const goldRate = currentRateDecimal(selectedSnapshot, "metal:GOLD");
  const silverRate = currentRateDecimal(selectedSnapshot, "metal:SILVER");
  const gold24k =
    goldRate === null
      ? null
      : displayNumber(divideExact(goldRate, preferredUsdPerUnit));
  const gold21k =
    goldRate === null
      ? null
      : displayNumber(
          divideExact(
            multiplyExact(goldRate, GOLD_21K_PURITY_DECIMAL),
            preferredUsdPerUnit
          )
        );
  const gold18k =
    goldRate === null
      ? null
      : displayNumber(
          divideExact(
            multiplyExact(goldRate, GOLD_18K_PURITY_DECIMAL),
            preferredUsdPerUnit
          )
        );
  const silver =
    silverRate === null
      ? null
      : displayNumber(divideExact(silverRate, preferredUsdPerUnit));
  const previousGold24k = previousDayRate
    ? getMetalPriceHistorical(previousDayRate, "GOLD", preferredCurrency)
    : null;
  const previousSilver = previousDayRate
    ? getMetalPriceHistorical(previousDayRate, "SILVER", preferredCurrency)
    : null;

  return {
    price24k: gold24k === null ? "—" : formatRate(gold24k),
    price21k: gold21k === null ? "—" : formatRate(gold21k),
    price18k: gold18k === null ? "—" : formatRate(gold18k),
    goldTrendPercent: calculateAvailableTrend(gold24k, previousGold24k),
    silverPrice: silver === null ? "—" : formatRate(silver),
    silverTrendPercent: calculateAvailableTrend(silver, previousSilver),
    currencySymbol,
  };
}
function buildCurrencies(
  {
    selectedSnapshot,
    previousDayRate,
    preferredCurrency,
    locale,
    translateRelativeTime,
  }: LiveRatesScreenReadModelInput,
  currencySymbol: string
): readonly CurrencyDisplayItem[] {
  if (!selectedSnapshot) return [];

  const preferredUsdPerUnit = preferredRateDecimal(
    selectedSnapshot,
    preferredCurrency
  );
  if (preferredUsdPerUnit === null) return [];

  return SUPPORTED_CURRENCIES.filter(
    (currency: CurrencyInfo): boolean =>
      currency.code !== preferredCurrency &&
      isSupportedMetalsIsoCurrencyCode(currency.code)
  ).map((currency: CurrencyInfo): CurrencyDisplayItem => {
    if (!isSupportedMetalsIsoCurrencyCode(currency.code)) {
      throw new Error(`Unsupported current currency: ${currency.code}`);
    }
    const instrumentCode: CurrentMarketInstrument = `currency:${currency.code}`;
    const fromUsd = currentRateDecimal(selectedSnapshot, instrumentCode);
    const rate =
      fromUsd === null
        ? null
        : displayNumber(divideExact(fromUsd, preferredUsdPerUnit));
    const previousRate = previousDayRate
      ? getCurrencyUsdValue(previousDayRate, currency.code) /
        getCurrencyUsdValue(previousDayRate, preferredCurrency)
      : null;

    return {
      code: currency.code,
      name: currency.name,
      flag: currency.flag,
      rate: rate === null ? "—" : `${formatRate(rate)} ${currencySymbol}`,
      changePercent: calculateAvailableTrend(rate, previousRate),
      trust: toCombinedTrustDisplay(
        [
          selectedSnapshot.trust.currencies.get(currency.code) ??
            missingTrustValue(),
          selectedSnapshot.trust.currencies.get(preferredCurrency) ??
            missingTrustValue(),
        ],
        locale,
        translateRelativeTime
      ),
    };
  });
}
function buildTrust({
  selectedSnapshot,
  preferredCurrency,
  locale,
  translateRelativeTime,
}: LiveRatesScreenReadModelInput): LiveRatesTrustDisplay {
  const trust = selectedSnapshot
    ? selectedSnapshot.trust
    : createEmptyTrustReadModel();
  const currencyTrustValues = Array.from(trust.currencies.values());
  return {
    gold: toCombinedTrustDisplay(
      [
        trust.gold,
        trust.currencies.get(preferredCurrency) ?? missingTrustValue(),
      ],
      locale,
      translateRelativeTime
    ),
    silver: toCombinedTrustDisplay(
      [
        trust.silver,
        trust.currencies.get(preferredCurrency) ?? missingTrustValue(),
      ],
      locale,
      translateRelativeTime
    ),
    currencies: toTrustDisplayValue(
      summarizeLiveRatesTrust(currencyTrustValues),
      getConservativeObservedAt(currencyTrustValues),
      getConservativeAgeMs(currencyTrustValues),
      locale,
      translateRelativeTime
    ),
  };
}
function createEmptyTrustReadModel(): LiveRatesTrustReadModel {
  return {
    gold: { state: "missing", ageMs: null, providerObservedAt: null },
    silver: { state: "missing", ageMs: null, providerObservedAt: null },
    currencies: new Map(),
  };
}

function calculateAvailableTrend(
  currentValue: number | null,
  previousValue: number | null
): number | null {
  if (
    currentValue === null ||
    previousValue === null ||
    !Number.isFinite(currentValue) ||
    !Number.isFinite(previousValue) ||
    previousValue === 0
  ) {
    return null;
  }

  const trend = calculateTrendPercent(currentValue, previousValue);
  return Number.isFinite(trend) ? trend : null;
}

function getConservativeObservedAt(
  values: readonly LiveRatesTrustValue[]
): Date | null {
  const observedTimes = values
    .map((value): number | null => value.providerObservedAt?.getTime() ?? null)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value)
    );
  if (observedTimes.length === 0) return null;
  return new Date(Math.min(...observedTimes));
}

function getConservativeAgeMs(
  values: readonly LiveRatesTrustValue[]
): number | null {
  const ages = values
    .map((value): number | null => value.ageMs)
    .filter(
      (value): value is number => value !== null && Number.isFinite(value)
    );
  return ages.length === 0 ? null : Math.max(...ages);
}

function toTrustDisplayValue(
  value:
    | {
        readonly state: LiveRatesTrustState;
        readonly providerObservedAt: Date | null;
        readonly ageMs: number | null;
        readonly quality?: string | null;
        readonly source?: string | null;
      }
    | LiveRatesTrustState,
  providerObservedAt: Date | null | undefined,
  ageMs: number | null | undefined,
  locale: string,
  translateRelativeTime: LiveRatesScreenReadModelInput["translateRelativeTime"]
): LiveRatesTrustDisplayValue {
  const state = typeof value === "string" ? value : value.state;
  const date =
    typeof value === "string"
      ? (providerObservedAt ?? null)
      : value.providerObservedAt;
  const resolvedAgeMs =
    typeof value === "string" ? (ageMs ?? null) : value.ageMs;
  return {
    state,
    dateTime: date?.toLocaleString(locale) ?? null,
    ageText: formatRateAge(resolvedAgeMs, translateRelativeTime),
    quality: typeof value === "string" ? null : (value.quality ?? null),
    source: typeof value === "string" ? null : (value.source ?? null),
  };
}

function toCombinedTrustDisplay(
  values: readonly LiveRatesTrustValue[],
  locale: string,
  translateRelativeTime: LiveRatesScreenReadModelInput["translateRelativeTime"]
): LiveRatesTrustDisplayValue {
  const sources = uniquePresentValues(
    values.map((value): string | null | undefined => value.source)
  );
  const qualities = uniquePresentValues(
    values.map((value): string | null | undefined => value.quality)
  );
  return {
    ...toTrustDisplayValue(
      summarizeLiveRatesTrust(values),
      getConservativeObservedAt(values),
      getConservativeAgeMs(values),
      locale,
      translateRelativeTime
    ),
    quality: qualities.length === 1 ? qualities[0] : null,
    source: sources.length === 1 ? sources[0] : null,
  };
}

function uniquePresentValues(
  values: ReadonlyArray<string | null | undefined>
): readonly string[] {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === "string")
    )
  );
}

function missingTrustValue(): LiveRatesTrustValue {
  return { ageMs: null, providerObservedAt: null, state: "missing" };
}

function formatRateAge(
  ageMs: number | null,
  translateRelativeTime: LiveRatesScreenReadModelInput["translateRelativeTime"]
): string | null {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return null;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) {
    return translateRelativeTime(
      minutes === 0 ? "just_now" : "minutes_ago",
      minutes
    );
  }
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 24) {
    return translateRelativeTime("hours_ago", hours);
  }
  const days = Math.floor(hours / 24);
  return translateRelativeTime("days_ago", Math.max(1, days));
}

function currentRateDecimal(
  snapshot: SelectedMarketRateSnapshot | null,
  instrumentCode: CurrentMarketInstrument
): string | null {
  return snapshot?.ratesByInstrument.get(instrumentCode)?.valueDecimal ?? null;
}

function preferredRateDecimal(
  snapshot: SelectedMarketRateSnapshot | null,
  preferredCurrency: CurrencyType
): string | null {
  if (!snapshot || !isSupportedMetalsIsoCurrencyCode(preferredCurrency)) {
    return null;
  }
  if (preferredCurrency === "USD") {
    return "1";
  }
  const instrumentCode: CurrentMarketInstrument = `currency:${preferredCurrency}`;
  return currentRateDecimal(snapshot, instrumentCode);
}

function multiplyExact(left: string, right: string): string {
  return serializeDecimal(parseCanonicalDecimal(left).times(right));
}

function divideExact(numerator: string, denominator: string): string {
  return serializeDecimal(
    parseCanonicalDecimal(numerator).dividedBy(denominator)
  );
}

function displayNumber(exactDecimal: string): number {
  return Number(exactDecimal);
}

function getMetalPriceHistorical(
  previousDayRates: Parameters<typeof getCurrencyUsdValue>[0],
  metal: SupportedMetal,
  preferredCurrency: CurrencyType
): number {
  const usdPerGram =
    metal === "GOLD"
      ? previousDayRates.goldUsdPerGram
      : previousDayRates.silverUsdPerGram;
  return usdPerGram / getCurrencyUsdValue(previousDayRates, preferredCurrency);
}
