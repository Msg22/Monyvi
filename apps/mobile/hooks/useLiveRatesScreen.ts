import { useDatabase } from "@/providers/DatabaseProvider";
import { refreshLiveMarketRates } from "@/services/live-rates-refresh-service";
import {
  summarizeLiveRatesTrust,
  type LiveRatesTrustReadModel,
  type LiveRatesTrustState,
  type LiveRatesTrustValue,
} from "@/services/live-rates-trust-read-model-service";
import {
  observeSelectedMarketRateSnapshot,
  type MarketRateSnapshotStream,
  type SelectedMarketRateSnapshot,
} from "@/services/market-rate-snapshot-read-model-service";
import { logger } from "@/utils/logger";
import { formatTimeAgo } from "@/utils/dateHelpers";
import type { CurrencyType } from "@monyvi/db";
import {
  type CurrencyInfo,
  CURRENCY_INFO_MAP,
  SUPPORTED_CURRENCIES,
  calculateTrendPercent,
  formatRate,
  getCurrencyUsdValue,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  serializeDecimal,
} from "@monyvi/logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";

const DEFAULT_CURRENCY_COUNT = 10;
const RATE_STATUS_REFRESH_INTERVAL_MS = 60_000;
const GOLD_21K_PURITY_DECIMAL = "0.875";
const GOLD_18K_PURITY_DECIMAL = "0.75";

const DEFAULT_CURRENCIES: readonly CurrencyType[] = [
  "EGP",
  "USD",
  "SAR",
  "AED",
  "EUR",
  "GBP",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
] as const;

interface MetalDisplayData {
  readonly price24k: string;
  readonly price21k: string;
  readonly price18k: string;
  readonly goldTrendPercent: number;
  readonly silverPrice: string;
  readonly silverTrendPercent: number;
  readonly currencySymbol: string;
}

interface CurrencyDisplayItem {
  readonly code: CurrencyType;
  readonly name: string;
  readonly flag: string;
  readonly rate: string;
  readonly changePercent: number;
  readonly trust: LiveRatesTrustDisplayValue;
}

interface LiveRatesTrustDisplay {
  readonly gold: LiveRatesTrustDisplayValue;
  readonly silver: LiveRatesTrustDisplayValue;
  readonly currencies: LiveRatesTrustDisplayValue;
}

interface LiveRatesTrustDisplayValue {
  readonly state: LiveRatesTrustState;
  readonly dateTime: string | null;
  readonly ageText: string | null;
  readonly quality: string | null;
  readonly source: string | null;
}

type LiveRatesRefreshError = "cached_refresh_failed" | "initial_refresh_failed";

interface UseLiveRatesScreenResult {
  readonly isLoading: boolean;
  readonly isConnected: boolean;
  readonly isStale: boolean;
  readonly hasData: boolean;
  readonly metals: MetalDisplayData;
  readonly currencies: readonly CurrencyDisplayItem[];
  readonly isExpanded: boolean;
  readonly onToggleExpand: () => void;
  readonly showSeeAll: boolean;
  readonly preferredCurrencyLabel: string;
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly lastUpdatedText: string;
  readonly isRefreshing: boolean;
  readonly refreshError: LiveRatesRefreshError | null;
  readonly onRefresh: () => void;
  readonly rateTrust: LiveRatesTrustDisplay;
}

function createEmptyTrustReadModel(): LiveRatesTrustReadModel {
  return {
    gold: { state: "missing", ageMs: null, providerObservedAt: null },
    silver: { state: "missing", ageMs: null, providerObservedAt: null },
    currencies: new Map(),
  };
}

export function useLiveRatesScreen(): UseLiveRatesScreenResult {
  const database = useDatabase();
  const { i18n } = useTranslation();
  const locale = resolveLiveRatesLocale(i18n.resolvedLanguage);
  const {
    selectedSnapshot,
    previousDayRate,
    isLoading,
    isConnected,
    lastUpdated,
  } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdatedText, setLastUpdatedText] = useState("");
  const [observedSnapshot, setObservedSnapshot] =
    useState<SelectedMarketRateSnapshot | null>(null);
  const [isTrustLoading, setIsTrustLoading] = useState(true);
  const [trustObservationError, setTrustObservationError] =
    useState<LiveRatesRefreshError | null>(null);
  const [trustRetryIndex, setTrustRetryIndex] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] =
    useState<LiveRatesRefreshError | null>(null);
  const isRefreshInProgressRef = useRef(false);
  const latestCapturedAtRef = useRef<number | null>(null);
  const snapshotAvailableRef = useRef(false);
  const trustObservationRef = useRef<MarketRateSnapshotStream | null>(null);

  const updateTimestamp = useCallback((): void => {
    if (lastUpdated) {
      setLastUpdatedText(`Updated ${formatTimeAgo(lastUpdated)}`);
      return;
    }
    setLastUpdatedText("");
  }, [lastUpdated]);

  useEffect(() => {
    snapshotAvailableRef.current = observedSnapshot !== null;
  }, [observedSnapshot]);

  useEffect(() => {
    updateTimestamp();
    const timer = setInterval(() => {
      updateTimestamp();
      trustObservationRef.current?.refresh();
    }, RATE_STATUS_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [updateTimestamp]);

  useEffect(() => {
    const observation = observeSelectedMarketRateSnapshot(database);
    trustObservationRef.current = observation;
    setIsTrustLoading(true);
    const subscription = observation.subscribe({
      next: (snapshot): void => {
        const capturedAt = snapshot ? snapshot.capturedAt.getTime() : null;
        if (
          capturedAt !== null &&
          latestCapturedAtRef.current !== null &&
          capturedAt > latestCapturedAtRef.current
        ) {
          setRefreshError(null);
        }
        latestCapturedAtRef.current = capturedAt;
        setTrustObservationError(null);
        setObservedSnapshot(snapshot);
        setIsTrustLoading(false);
      },
      error: (error: unknown): void => {
        logger.error("marketSnapshot.observe.failed", error);
        setTrustObservationError(
          snapshotAvailableRef.current
            ? "cached_refresh_failed"
            : "initial_refresh_failed"
        );
        setIsTrustLoading(false);
      },
    });

    return () => {
      if (trustObservationRef.current === observation) {
        trustObservationRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [database, trustRetryIndex]);

  const currencySymbol = useMemo((): string => {
    return CURRENCY_INFO_MAP[preferredCurrency]?.symbol ?? preferredCurrency;
  }, [preferredCurrency]);

  const metals = useMemo((): MetalDisplayData => {
    const preferredUsdPerUnit = preferredRateDecimal(
      observedSnapshot,
      preferredCurrency
    );
    if (!observedSnapshot || preferredUsdPerUnit === null) {
      return {
        price24k: "—",
        price21k: "—",
        price18k: "—",
        goldTrendPercent: 0,
        silverPrice: "—",
        silverTrendPercent: 0,
        currencySymbol,
      };
    }

    const goldRate = currentRateDecimal(observedSnapshot, "metal:GOLD");
    const silverRate = currentRateDecimal(observedSnapshot, "metal:SILVER");
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
      goldTrendPercent: calculateTrendPercent(gold24k ?? 0, previousGold24k),
      silverPrice: silver === null ? "—" : formatRate(silver),
      silverTrendPercent: calculateTrendPercent(silver ?? 0, previousSilver),
      currencySymbol,
    };
  }, [observedSnapshot, previousDayRate, preferredCurrency, currencySymbol]);

  const allCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    if (!observedSnapshot) return [];

    const preferredUsdPerUnit = preferredRateDecimal(
      observedSnapshot,
      preferredCurrency
    );
    if (preferredUsdPerUnit === null) return [];

    return SUPPORTED_CURRENCIES.filter(
      (currency: CurrencyInfo) =>
        currency.code !== preferredCurrency &&
        isSupportedMetalsIsoCurrencyCode(currency.code)
    ).map((currency: CurrencyInfo): CurrencyDisplayItem => {
      const fromUsd = currentRateDecimal(
        observedSnapshot,
        `currency:${currency.code}`
      );
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
        rate:
          rate === null
            ? "—"
            : `${formatRate(rate)} ${currencySymbol}`,
        changePercent: calculateTrendPercent(rate ?? 0, previousRate),
        trust: toCombinedTrustDisplay(
          [
            observedSnapshot.trust.currencies.get(currency.code) ??
              missingTrustValue(),
            observedSnapshot.trust.currencies.get(preferredCurrency) ??
              missingTrustValue(),
          ],
          locale
        ),
      };
    });
  }, [
    currencySymbol,
    locale,
    observedSnapshot,
    preferredCurrency,
    previousDayRate,
  ]);

  const sortedCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    const defaultCurrencies = allCurrencies.filter((currency) =>
      DEFAULT_CURRENCIES.includes(currency.code)
    );
    const otherCurrencies = allCurrencies.filter(
      (currency) => !DEFAULT_CURRENCIES.includes(currency.code)
    );

    defaultCurrencies.sort(
      (first, second) =>
        DEFAULT_CURRENCIES.indexOf(first.code) -
        DEFAULT_CURRENCIES.indexOf(second.code)
    );
    otherCurrencies.sort((first, second) =>
      first.code.localeCompare(second.code)
    );

    return [...defaultCurrencies, ...otherCurrencies];
  }, [allCurrencies]);

  const filteredCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    if (!searchQuery.trim()) return sortedCurrencies;

    const query = searchQuery.trim().toLowerCase();
    return sortedCurrencies.filter(
      (currency) =>
        currency.code.toLowerCase().includes(query) ||
        currency.name.toLowerCase().includes(query)
    );
  }, [searchQuery, sortedCurrencies]);

  const visibleCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    if (searchQuery.trim() || isExpanded) return filteredCurrencies;
    return filteredCurrencies.slice(0, DEFAULT_CURRENCY_COUNT);
  }, [filteredCurrencies, isExpanded, searchQuery]);

  const showSeeAll = useMemo((): boolean => {
    return (
      !searchQuery.trim() &&
      !isExpanded &&
      filteredCurrencies.length > DEFAULT_CURRENCY_COUNT
    );
  }, [filteredCurrencies.length, isExpanded, searchQuery]);

  const preferredCurrencyLabel = useMemo((): string => {
    return CURRENCY_INFO_MAP[preferredCurrency]?.code ?? preferredCurrency;
  }, [preferredCurrency]);

  const rateTrust = useMemo<LiveRatesTrustDisplay>(() => {
    const trust = observedSnapshot
      ? observedSnapshot.trust
      : createEmptyTrustReadModel();
    const currencyTrustValues = Array.from(trust.currencies.values());
    return {
      gold: toTrustDisplayValue(
        trust.gold,
        undefined,
        undefined,
        locale
      ),
      silver: toTrustDisplayValue(
        trust.silver,
        undefined,
        undefined,
        locale
      ),
      currencies: toTrustDisplayValue(
        summarizeLiveRatesTrust(currencyTrustValues),
        getConservativeObservedAt(currencyTrustValues),
        getConservativeAgeMs(currencyTrustValues),
        locale
      ),
    };
  }, [locale, observedSnapshot]);

  const onToggleExpand = useCallback((): void => {
    setIsExpanded((expanded) => !expanded);
  }, []);

  const onSearchChange = useCallback((query: string): void => {
    setSearchQuery(query);
  }, []);

  const onRefresh = useCallback((): void => {
    if (isRefreshInProgressRef.current) return;

    if (trustObservationError !== null) {
      setTrustRetryIndex((value) => value + 1);
    }
    isRefreshInProgressRef.current = true;
    setIsRefreshing(true);
    setRefreshError(null);

    void (async (): Promise<void> => {
      try {
        await refreshLiveMarketRates(database);
      } catch (error: unknown) {
        logger.error("liveRates.refresh.failed", error);
        setRefreshError(
          snapshotAvailableRef.current
            ? "cached_refresh_failed"
            : "initial_refresh_failed"
        );
      } finally {
        isRefreshInProgressRef.current = false;
        setIsRefreshing(false);
        trustObservationRef.current?.refresh();
      }
    })();
  }, [database, trustObservationError]);

  return {
    isLoading: isLoading || isTrustLoading,
    isConnected,
    isStale: Object.values(rateTrust).some(({ state }) => state !== "fresh"),
    hasData: observedSnapshot !== null && !isTrustLoading,
    metals,
    currencies: visibleCurrencies,
    isExpanded,
    onToggleExpand,
    showSeeAll,
    preferredCurrencyLabel,
    searchQuery,
    onSearchChange,
    lastUpdatedText,
    isRefreshing,
    refreshError: trustObservationError ?? refreshError,
    onRefresh,
    rateTrust,
  };
}

function getConservativeObservedAt(
  values: readonly LiveRatesTrustValue[]
): Date | null {
  const observedTimes = values
    .map((value) => value.providerObservedAt?.getTime() ?? null)
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
    .map((value) => value.ageMs)
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
  locale: string
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
    ageText: formatRateAge(resolvedAgeMs, locale),
    quality: typeof value === "string" ? null : (value.quality ?? null),
    source: typeof value === "string" ? null : (value.source ?? null),
  };
}

function toCombinedTrustDisplay(
  values: readonly LiveRatesTrustValue[],
  locale: string
): LiveRatesTrustDisplayValue {
  const sources = uniquePresentValues(values.map((value) => value.source));
  const qualities = uniquePresentValues(values.map((value) => value.quality));
  return {
    ...toTrustDisplayValue(
      summarizeLiveRatesTrust(values),
      getConservativeObservedAt(values),
      getConservativeAgeMs(values),
      locale
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

function formatRateAge(ageMs: number | null, locale: string): string | null {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return null;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      -minutes,
      "minute"
    );
  }
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 24) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
      -hours,
      "hour"
    );
  }
  const days = Math.floor(hours / 24);
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
    -Math.max(1, days),
    "day"
  );
}

function currentRateDecimal(
  snapshot: SelectedMarketRateSnapshot | null,
  instrumentCode: string
): string | null {
  return snapshot?.ratesByInstrument.get(instrumentCode)?.valueDecimal ?? null;
}

function preferredRateDecimal(
  snapshot: SelectedMarketRateSnapshot | null,
  preferredCurrency: CurrencyType
): string | null {
  if (!snapshot) {
    return null;
  }
  if (preferredCurrency === "USD") {
    return "1";
  }
  return currentRateDecimal(snapshot, `currency:${preferredCurrency}`);
}

function multiplyExact(left: string, right: string): string {
  return serializeDecimal(parseCanonicalDecimal(left).times(right));
}

function divideExact(numerator: string, denominator: string): string {
  return serializeDecimal(parseCanonicalDecimal(numerator).dividedBy(denominator));
}

function displayNumber(exactDecimal: string): number {
  return Number(exactDecimal);
}

function getMetalPriceHistorical(
  previousDayRates: Parameters<typeof getCurrencyUsdValue>[0],
  metal: "GOLD" | "SILVER",
  preferredCurrency: CurrencyType
): number {
  const usdPerGram =
    metal === "GOLD"
      ? previousDayRates.goldUsdPerGram
      : previousDayRates.silverUsdPerGram;
  return usdPerGram / getCurrencyUsdValue(previousDayRates, preferredCurrency);
}

function resolveLiveRatesLocale(language: string | undefined): string {
  return language?.toLowerCase().startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}
