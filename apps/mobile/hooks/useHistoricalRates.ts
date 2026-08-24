/**
 * useHistoricalRates Hook
 *
 * Batch-fetches historical MarketRate records from WatermelonDB for a set of
 * unique dates. Used by the transaction list parent to pre-compute equivalent
 * amounts for all visible cards, avoiding N+1 queries.
 *
 * @module useHistoricalRates
 */

import { database, type CurrencyType, type MarketRate } from "@monyvi/db";
import {
  assertValidMarketRateModel,
  convertCurrency,
  formatCurrency,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useMemo, useState } from "react";
import { logger } from "../utils/logger";

// =============================================================================
// Types
// =============================================================================

interface HistoricalRateEntry {
  /** ISO date string (YYYY-MM-DD) */
  readonly date: string;
  /** The MarketRate record for that date, or null if not found */
  readonly rate: MarketRate | null;
}

interface UseHistoricalRatesResult {
  /** Map from ISO date string to MarketRate (or null if not found) */
  readonly ratesByDate: ReadonlyMap<string, MarketRate | null>;
  /** True while initial fetch is in progress */
  readonly isLoading: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/** Converts a Date to YYYY-MM-DD string for grouping/lookup. */
function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts a YYYY-MM-DD date key to an end-of-day timestamp (ms).
 * WatermelonDB stores @date fields as numeric timestamps, so we must
 * compare against a number, not a string.
 */
function dateKeyToEndOfDayTimestamp(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 23, 59, 59, 999);
}

function getValidHistoricalMarketRate(
  rate: MarketRate | undefined,
  dateKey: string
): MarketRate | null {
  if (!rate) {
    return null;
  }

  try {
    assertValidMarketRateModel(rate);
    return rate;
  } catch (error: unknown) {
    logger.error("Invalid cached historical market rate", error, {
      date: dateKey,
    });
    return null;
  }
}

/**
 * Computes the formatted equivalent amount string for a transaction.
 * Returns null if no rate is found or currencies are the same.
 */
function computeEquivalentText(
  amount: number,
  transactionCurrency: CurrencyType,
  preferredCurrency: CurrencyType,
  historicalRate: MarketRate | null | undefined
): string | null {
  if (!historicalRate) return null;
  if (transactionCurrency === preferredCurrency) return null;

  const converted = convertCurrency(
    amount,
    transactionCurrency,
    preferredCurrency,
    historicalRate
  );

  if (converted === amount) return null;

  return `≈ ${formatCurrency({ amount: converted, currency: preferredCurrency })}`;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Batch-fetches the closest MarketRate record for each unique date in the given
 * list. Queries WatermelonDB for the most recent rate on or before each date.
 *
 * @param dates - Array of Date objects to look up rates for.
 * @returns A map from ISO date string to MarketRate (or null), plus loading state.
 */
function useHistoricalRates(dates: readonly Date[]): UseHistoricalRatesResult {
  const [entries, setEntries] = useState<HistoricalRateEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Deduplicate dates by their date key
  const uniqueDateKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const d of dates) {
      keys.add(toDateKey(d));
    }
    return Array.from(keys).sort();
  }, [dates]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRates(): Promise<void> {
      const collection = database.get<MarketRate>("market_rates");
      const results: HistoricalRateEntry[] = [];

      for (const dateKey of uniqueDateKeys) {
        // Convert dateKey to end-of-day timestamp for correct comparison
        // against the numeric created_at field stored by WatermelonDB's @date decorator
        const endOfDay = dateKeyToEndOfDayTimestamp(dateKey);

        // Find the most recent rate on or before this date
        const matched = await collection
          .query(
            Q.where("created_at", Q.lte(endOfDay)),
            Q.sortBy("created_at", Q.desc),
            Q.take(1)
          )
          .fetch();

        results.push({
          date: dateKey,
          rate: getValidHistoricalMarketRate(matched.at(0), dateKey),
        });
      }

      if (!cancelled) {
        setEntries(results);
        setIsLoading(false);
      }
    }

    if (uniqueDateKeys.length === 0) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchRates().catch((error: unknown) => {
      logger.error("Failed to fetch historical market rates", error);
      if (!cancelled) setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [uniqueDateKeys]);

  const ratesByDate = useMemo(() => {
    const map = new Map<string, MarketRate | null>();
    for (const entry of entries) {
      map.set(entry.date, entry.rate);
    }
    return map;
  }, [entries]);

  return { ratesByDate, isLoading };
}

export { useHistoricalRates, computeEquivalentText, toDateKey };
export type { UseHistoricalRatesResult };
