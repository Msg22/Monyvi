import { useDatabase } from "@/providers/DatabaseProvider";
import {
  observeLiveRatesTrust,
  summarizeLiveRatesTrust,
  type LiveRatesTrustReadModel,
  type LiveRatesTrustState,
} from "@/services/live-rates-trust-read-model-service";
import { logger } from "@/utils/logger";
import { formatTimeAgo } from "@/utils/dateHelpers";
import type { CurrencyType } from "@monyvi/db";
import {
  type CurrencyInfo,
  CURRENCY_INFO_MAP,
  SUPPORTED_CURRENCIES,
  calculateTrendPercent,
  convertCurrency,
  formatRate,
  getGoldPurityPrice,
  getMetalPrice,
} from "@monyvi/logic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";

const DEFAULT_CURRENCY_COUNT = 10;
const RATE_STATUS_REFRESH_INTERVAL_MS = 60_000;
const GOLD_21K_PURITY = 21 / 24;
const GOLD_18K_PURITY = 18 / 24;

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
}

interface LiveRatesTrustDisplay {
  readonly gold: LiveRatesTrustState;
  readonly silver: LiveRatesTrustState;
  readonly currencies: LiveRatesTrustState;
}

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
  readonly onRefresh: () => void;
  readonly rateTrust: LiveRatesTrustDisplay;
}

function createInitialTrustReadModel(): LiveRatesTrustReadModel {
  return {
    gold: { state: "missing", ageMs: null },
    silver: { state: "missing", ageMs: null },
    currencies: new Map(),
  };
}

export function useLiveRatesScreen(): UseLiveRatesScreenResult {
  const database = useDatabase();
  const { latestRates, previousDayRate, isLoading, isConnected, lastUpdated } =
    useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdatedText, setLastUpdatedText] = useState("");
  const [trustRefreshRevision, setTrustRefreshRevision] = useState(0);
  const [trustReadModel, setTrustReadModel] = useState<LiveRatesTrustReadModel>(
    createInitialTrustReadModel
  );

  const updateTimestamp = useCallback((): void => {
    if (lastUpdated) {
      setLastUpdatedText(`Updated ${formatTimeAgo(lastUpdated)}`);
      return;
    }
    setLastUpdatedText("");
  }, [lastUpdated]);

  useEffect(() => {
    updateTimestamp();
    const timer = setInterval(() => {
      updateTimestamp();
      setTrustRefreshRevision((revision) => revision + 1);
    }, RATE_STATUS_REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [updateTimestamp]);

  useEffect(() => {
    const observation = observeLiveRatesTrust(database);
    const subscription = observation.subscribe({
      next: setTrustReadModel,
      error: (error: unknown): void => {
        logger.error("liveRatesTrust.observe.failed", error);
      },
    });

    return () => subscription.unsubscribe();
  }, [database, trustRefreshRevision]);

  const currencySymbol = useMemo((): string => {
    return CURRENCY_INFO_MAP[preferredCurrency]?.symbol ?? preferredCurrency;
  }, [preferredCurrency]);

  const metals = useMemo((): MetalDisplayData => {
    if (!latestRates) {
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

    const gold24k = getMetalPrice("GOLD", latestRates, preferredCurrency);
    const gold21k = getGoldPurityPrice(
      GOLD_21K_PURITY,
      latestRates,
      preferredCurrency
    );
    const gold18k = getGoldPurityPrice(
      GOLD_18K_PURITY,
      latestRates,
      preferredCurrency
    );
    const previousGold24k = previousDayRate
      ? getMetalPrice("GOLD", previousDayRate, preferredCurrency)
      : null;
    const silver = getMetalPrice("SILVER", latestRates, preferredCurrency);
    const previousSilver = previousDayRate
      ? getMetalPrice("SILVER", previousDayRate, preferredCurrency)
      : null;

    return {
      price24k: formatRate(gold24k),
      price21k: formatRate(gold21k),
      price18k: formatRate(gold18k),
      goldTrendPercent: calculateTrendPercent(gold24k, previousGold24k),
      silverPrice: formatRate(silver),
      silverTrendPercent: calculateTrendPercent(silver, previousSilver),
      currencySymbol,
    };
  }, [latestRates, previousDayRate, preferredCurrency, currencySymbol]);

  const allCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    if (!latestRates) return [];

    return SUPPORTED_CURRENCIES.filter(
      (currency: CurrencyInfo) => currency.code !== preferredCurrency
    ).map((currency: CurrencyInfo): CurrencyDisplayItem => {
      const rate = convertCurrency(
        1,
        currency.code,
        preferredCurrency,
        latestRates
      );
      const previousRate = previousDayRate
        ? convertCurrency(1, currency.code, preferredCurrency, previousDayRate)
        : null;

      return {
        code: currency.code,
        name: currency.name,
        flag: currency.flag,
        rate: `${formatRate(rate)} ${currencySymbol}`,
        changePercent: calculateTrendPercent(rate, previousRate),
      };
    });
  }, [latestRates, previousDayRate, preferredCurrency, currencySymbol]);

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
    return {
      gold: trustReadModel.gold.state,
      silver: trustReadModel.silver.state,
      currencies: summarizeLiveRatesTrust(trustReadModel.currencies.values()),
    };
  }, [trustReadModel]);

  const onToggleExpand = useCallback((): void => {
    setIsExpanded((expanded) => !expanded);
  }, []);

  const onSearchChange = useCallback((query: string): void => {
    setSearchQuery(query);
  }, []);

  const onRefresh = useCallback((): void => {
    setTrustRefreshRevision((revision) => revision + 1);
  }, []);

  return {
    isLoading,
    isConnected,
    isStale: Object.values(rateTrust).some((state) => state !== "fresh"),
    hasData: latestRates !== null,
    metals,
    currencies: visibleCurrencies,
    isExpanded,
    onToggleExpand,
    showSeeAll,
    preferredCurrencyLabel,
    searchQuery,
    onSearchChange,
    lastUpdatedText,
    isRefreshing: false,
    onRefresh,
    rateTrust,
  };
}
