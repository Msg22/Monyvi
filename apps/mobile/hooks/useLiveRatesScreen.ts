/**
 * Live Rates Screen Hook
 *
 * Container hook (Custom Hook as Container) that encapsulates all state derivation
 * for the Live Rates screen. Composes `useMarketRates` for raw data and
 * `usePreferredCurrency` for the display currency.
 *
 * Architecture & Design Rationale:
 * - Pattern: Container Hook (Custom Hook as Container)
 * - Why: Separates derived state and side effects from presentation.
 *   All state derivation is in one place, testable without rendering.
 * - SOLID: SRP — hook only manages state derivation.
 *   Open/Closed — new derived values can be added without modifying components.
 *
 * @module useLiveRatesScreen
 */

import {
  currencyMatchesQuery,
  getCurrencyName,
} from "@/utils/currency-localization";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMarketRates } from "./useMarketRates";
import { usePreferredCurrency } from "./usePreferredCurrency";

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CURRENCY_COUNT = 10;
const TIMESTAMP_REFRESH_INTERVAL_MS = 60_000;
const GOLD_21K_PURITY = 21 / 24; // 0.875
const GOLD_18K_PURITY = 18 / 24; // 0.75

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

// =============================================================================
// Types
// =============================================================================

interface MetalDisplayData {
  readonly price24k: string;
  readonly price21k: string;
  readonly price18k: string;
  readonly goldTrendPercent: number;
  readonly silverPrice: string;
  readonly silverTrendPercent: number;
  readonly platinumPrice: string;
  readonly platinumTrendPercent: number;
  readonly currencySymbol: string;
}

interface CurrencyDisplayItem {
  readonly code: CurrencyType;
  readonly name: string;
  readonly flag: string;
  readonly rate: string;
  readonly changePercent: number;
}

interface UseLiveRatesScreenResult {
  // Loading & connectivity
  readonly isLoading: boolean;
  readonly isConnected: boolean;
  readonly isStale: boolean;
  readonly hasData: boolean;

  // Metal data
  readonly metals: MetalDisplayData;

  // Currency data
  readonly currencies: readonly CurrencyDisplayItem[];
  readonly isExpanded: boolean;
  readonly onToggleExpand: () => void;
  readonly showSeeAll: boolean;
  readonly preferredCurrencyLabel: string;

  // Search
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;

  // Footer
  readonly lastUpdatedText: string;

  // Pull-to-refresh
  readonly isRefreshing: boolean;
  readonly onRefresh: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useLiveRatesScreen(): UseLiveRatesScreenResult {
  const {
    latestRates,
    previousDayRate,
    isLoading,
    isConnected,
    lastUpdated,
    isStale,
  } = useMarketRates();
  const { preferredCurrency } = usePreferredCurrency();
  const { i18n } = useTranslation("common");

  // UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdatedText, setLastUpdatedText] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Timestamp auto-refresh (60s)
  // ---------------------------------------------------------------------------

  const updateTimestamp = useCallback((): void => {
    if (lastUpdated) {
      setLastUpdatedText(`Updated ${formatTimeAgo(lastUpdated)}`);
    } else {
      setLastUpdatedText("");
    }
  }, [lastUpdated]);

  useEffect(() => {
    updateTimestamp();

    timerRef.current = setInterval(
      updateTimestamp,
      TIMESTAMP_REFRESH_INTERVAL_MS
    );

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [updateTimestamp]);

  // ---------------------------------------------------------------------------
  // Metal data derivation
  // ---------------------------------------------------------------------------

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
        platinumPrice: "—",
        platinumTrendPercent: 0,
        currencySymbol,
      };
    }

    // Gold
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
    const prevGold24k = previousDayRate
      ? getMetalPrice("GOLD", previousDayRate, preferredCurrency)
      : null;

    // Silver
    const silver = getMetalPrice("SILVER", latestRates, preferredCurrency);
    const prevSilver = previousDayRate
      ? getMetalPrice("SILVER", previousDayRate, preferredCurrency)
      : null;

    // Platinum
    const platinum = getMetalPrice("PLATINUM", latestRates, preferredCurrency);
    const prevPlatinum = previousDayRate
      ? getMetalPrice("PLATINUM", previousDayRate, preferredCurrency)
      : null;

    return {
      price24k: formatRate(gold24k),
      price21k: formatRate(gold21k),
      price18k: formatRate(gold18k),
      goldTrendPercent: calculateTrendPercent(gold24k, prevGold24k),
      silverPrice: formatRate(silver),
      silverTrendPercent: calculateTrendPercent(silver, prevSilver),
      platinumPrice: formatRate(platinum),
      platinumTrendPercent: calculateTrendPercent(platinum, prevPlatinum),
      currencySymbol,
    };
  }, [latestRates, previousDayRate, preferredCurrency, currencySymbol]);

  // ---------------------------------------------------------------------------
  // Currency data derivation
  // ---------------------------------------------------------------------------

  const allCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    if (!latestRates) return [];

    // Build display items for all supported currencies, filtering out preferred
    return SUPPORTED_CURRENCIES.filter(
      (c: CurrencyInfo) => c.code !== preferredCurrency
    ).map((info: CurrencyInfo): CurrencyDisplayItem => {
      const rate = convertCurrency(
        1,
        info.code,
        preferredCurrency,
        latestRates
      );
      const prevRate = previousDayRate
        ? convertCurrency(1, info.code, preferredCurrency, previousDayRate)
        : null;

      return {
        code: info.code,
        name: getCurrencyName(info.code),
        flag: info.flag,
        rate: `${formatRate(rate)} ${currencySymbol}`,
        changePercent: calculateTrendPercent(rate, prevRate),
      };
    });
  }, [
    latestRates,
    previousDayRate,
    preferredCurrency,
    currencySymbol,
    i18n.language,
  ]);

  // Sort: show DEFAULT_CURRENCIES first, then rest alphabetically
  const sortedCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    const defaultSet = new Set(DEFAULT_CURRENCIES);
    const defaults = allCurrencies.filter((c) => defaultSet.has(c.code));
    const rest = allCurrencies.filter((c) => !defaultSet.has(c.code));

    // Sort defaults by their order in DEFAULT_CURRENCIES
    defaults.sort(
      (a, b) =>
        DEFAULT_CURRENCIES.indexOf(a.code) - DEFAULT_CURRENCIES.indexOf(b.code)
    );
    // Sort rest alphabetically by code
    rest.sort((a, b) => a.code.localeCompare(b.code));

    return [...defaults, ...rest];
  }, [allCurrencies]);

  // Apply search filter
  const filteredCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    if (!searchQuery.trim()) return sortedCurrencies;

    return sortedCurrencies.filter((c) =>
      currencyMatchesQuery(c.code, searchQuery)
    );
  }, [sortedCurrencies, searchQuery, i18n.language]);

  // Apply expansion limit
  const visibleCurrencies = useMemo((): readonly CurrencyDisplayItem[] => {
    if (searchQuery.trim()) {
      // When searching, show all filtered results (no slicing)
      return filteredCurrencies;
    }
    if (isExpanded) return filteredCurrencies;
    return filteredCurrencies.slice(0, DEFAULT_CURRENCY_COUNT);
  }, [filteredCurrencies, isExpanded, searchQuery]);

  // Hide "See all" when search is active with no results, or when already expanded
  const showSeeAll = useMemo((): boolean => {
    if (searchQuery.trim()) return false;
    if (isExpanded) return false;
    return filteredCurrencies.length > DEFAULT_CURRENCY_COUNT;
  }, [searchQuery, isExpanded, filteredCurrencies.length]);

  const preferredCurrencyLabel = useMemo((): string => {
    return CURRENCY_INFO_MAP[preferredCurrency]?.code ?? preferredCurrency;
  }, [preferredCurrency]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const onToggleExpand = useCallback((): void => {
    setIsExpanded((prev) => !prev);
  }, []);

  const onSearchChange = useCallback((query: string): void => {
    setSearchQuery(query);
  }, []);

  const onRefresh = useCallback((): void => {
    setIsRefreshing(true);
    // The useMarketRates hook handles syncing via realtime subscription.
    // Pull-to-refresh simulates a visual feedback then resets.
    setTimeout(() => {
      setIsRefreshing(false);
      updateTimestamp();
    }, 1000);
  }, [updateTimestamp]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    isLoading,
    isConnected,
    isStale,
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

    isRefreshing,
    onRefresh,
  };
}
