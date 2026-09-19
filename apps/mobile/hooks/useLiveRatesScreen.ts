import { useDatabase } from "@/providers/DatabaseProvider";
import { refreshLiveMarketRates } from "@/services/live-rates-refresh-service";
import {
  buildLiveRatesScreenReadModel,
  type MetalDisplayData,
  type CurrencyDisplayItem,
  type LiveRatesTrustDisplay,
} from "@/services/live-rates-screen-read-model-service";
import { logger } from "@/utils/logger";
import { formatTimeAgo } from "@/utils/dateHelpers";
import type { CurrencyType } from "@monyvi/db";
import { CURRENCY_INFO_MAP } from "@monyvi/logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";

const DEFAULT_CURRENCY_COUNT = 10;
const RATE_STATUS_REFRESH_INTERVAL_MS = 60_000;

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

type LiveRatesRefreshError = "cached_refresh_failed" | "initial_refresh_failed";

interface UseLiveRatesScreenResult {
  readonly isLoading: boolean;
  readonly isConnected: boolean;
  readonly isLive: boolean;
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

export function useLiveRatesScreen(): UseLiveRatesScreenResult {
  const database = useDatabase();
  const { i18n, t } = useTranslation("common");
  const locale = resolveLiveRatesLocale(i18n.resolvedLanguage);
  const {
    selectedSnapshot,
    previousDayRate,
    isCurrentLoading,
    currentError,
    isConnected,
    lastUpdated,
    refreshSelectedSnapshot,
  } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdatedText, setLastUpdatedText] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] =
    useState<LiveRatesRefreshError | null>(null);
  const isRefreshInProgressRef = useRef(false);
  const latestCapturedAtRef = useRef<number | null>(null);
  const snapshotAvailableRef = useRef(false);

  const updateTimestamp = useCallback((): void => {
    setLastUpdatedText(
      lastUpdated ? `Updated ${formatTimeAgo(lastUpdated)}` : ""
    );
  }, [lastUpdated]);

  useEffect(() => {
    const capturedAt = selectedSnapshot?.capturedAt.getTime() ?? null;
    if (
      capturedAt !== null &&
      (latestCapturedAtRef.current === null ||
        capturedAt > latestCapturedAtRef.current)
    ) {
      setRefreshError(null);
    }
    latestCapturedAtRef.current = capturedAt;
    snapshotAvailableRef.current = selectedSnapshot !== null;
  }, [selectedSnapshot]);

  useEffect(() => {
    updateTimestamp();
    const timer = setInterval(() => {
      updateTimestamp();
      refreshSelectedSnapshot();
    }, RATE_STATUS_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refreshSelectedSnapshot, updateTimestamp]);

  const {
    metals,
    currencies: allCurrencies,
    rateTrust,
  } = useMemo(
    () =>
      buildLiveRatesScreenReadModel({
        selectedSnapshot,
        previousDayRate,
        preferredCurrency,
        locale,
        translateRelativeTime: (key, count): string => t(key, { count }),
      }),
    [selectedSnapshot, previousDayRate, preferredCurrency, locale, t]
  );

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

  const onToggleExpand = useCallback((): void => {
    setIsExpanded((expanded) => !expanded);
  }, []);

  const onSearchChange = useCallback((query: string): void => {
    setSearchQuery(query);
  }, []);

  const onRefresh = useCallback((): void => {
    if (isRefreshInProgressRef.current) return;

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
        refreshSelectedSnapshot();
      }
    })();
  }, [database, refreshSelectedSnapshot]);

  const observationError: LiveRatesRefreshError | null = currentError
    ? selectedSnapshot
      ? "cached_refresh_failed"
      : "initial_refresh_failed"
    : null;

  const effectiveRefreshError = observationError ?? refreshError;
  return {
    isLoading: isCurrentLoading,
    isConnected,
    isLive:
      isConnected &&
      effectiveRefreshError === null &&
      rateTrust.gold.state === "fresh" &&
      rateTrust.silver.state === "fresh" &&
      rateTrust.currencies.state === "fresh",
    isStale: Object.values(rateTrust).some(({ state }) => state !== "fresh"),
    hasData: selectedSnapshot !== null,
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
    refreshError: effectiveRefreshError,
    onRefresh,
    rateTrust,
  };
}

function resolveLiveRatesLocale(language: string | undefined): string {
  return language?.toLowerCase().startsWith("ar") ? "ar-EG-u-nu-latn" : "en-GB";
}
