import type { MarketRate } from "@monyvi/db";
import { assertValidMarketRateModel } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";
import { useDatabase } from "../providers/DatabaseProvider";
import { useMarketRatesRealtime } from "../providers/MarketRatesRealtimeProvider";
import { logger } from "../utils/logger";

interface UseMarketRatesResult {
  readonly latestRates: MarketRate | null;
  readonly previousDayRate: MarketRate | null;
  readonly isLoading: boolean;
  readonly isConnected: boolean;
  readonly lastUpdated: Date | null;
  readonly isStale: boolean;
}

function getValidPreviousDayRate(
  rate: MarketRate | undefined
): MarketRate | null {
  if (!rate) {
    return null;
  }

  try {
    assertValidMarketRateModel(rate);
    return rate;
  } catch (error: unknown) {
    logger.error("Invalid cached previous-day market rate", error);
    return null;
  }
}

/**
 * Hook to get market rates from local WatermelonDB.
 *
 * Connection state (`isConnected`) is provided by the app-level
 * `MarketRatesRealtimeProvider`, so the realtime channel persists
 * across screen navigations without re-subscribing.
 *
 * Single source of truth: WatermelonDB (synced from Supabase)
 */
export function useMarketRates(): UseMarketRatesResult {
  const database = useDatabase();
  const { isConnected } = useMarketRatesRealtime();
  const [observedLatestRates, setObservedLatestRates] = useState<
    readonly MarketRate[]
  >([]);
  const [previousDayRate, setPreviousDayRate] = useState<MarketRate | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const latestRates = observedLatestRates.at(0) ?? null;

  // Query latest market rate from local DB
  useEffect(() => {
    const subscription = database
      .get<MarketRate>("market_rates")
      .query(Q.sortBy("created_at", Q.desc), Q.take(1))
      .observe()
      .subscribe((rates) => {
        // Watermelon mutates cached model instances in place. Preserve the
        // emitted result array so same-model updates still trigger a render.
        setObservedLatestRates(rates);
        setIsLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [database]);

  // Query previous day rate (before today)
  useEffect(() => {
    const fetchPreviousDay = async (): Promise<void> => {
      try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const rates = await database
          .get<MarketRate>("market_rates")
          .query(
            Q.where("created_at", Q.lt(todayStart.getTime())),
            Q.sortBy("created_at", Q.desc),
            Q.take(1)
          )
          .fetch();

        setPreviousDayRate(getValidPreviousDayRate(rates.at(0)));
      } catch (error: unknown) {
        logger.error("Failed to fetch previous-day market rate", error);
        setPreviousDayRate(null);
      }
    };

    void fetchPreviousDay();
  }, [database, observedLatestRates]); // Re-fetch when the observed result changes

  return {
    latestRates,
    previousDayRate,
    isLoading,
    isConnected,
    lastUpdated: latestRates?.createdAt ?? null,
    isStale: latestRates?.isStale() ?? false,
  };
}
