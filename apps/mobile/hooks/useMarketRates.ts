import type { MarketRate } from "@monyvi/db";
import { assertValidMarketRateModel } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";
import { useDatabase } from "../providers/DatabaseProvider";
import { useMarketRatesRealtime } from "../providers/MarketRatesRealtimeProvider";
import {
  observeSelectedMarketRateSnapshot,
  type MarketRateSnapshotStream,
  type SelectedMarketRateSnapshot,
} from "../services/market-rate-snapshot-read-model-service";
import { summarizeLiveRatesTrust } from "../services/live-rates-trust-read-model-service";
import { logger } from "../utils/logger";

interface UseMarketRatesResult {
  readonly selectedSnapshot: SelectedMarketRateSnapshot | null;
  /**
   * Compatibility read path for legacy wide-root consumers (issue #241 debt).
   * NEVER authoritative for current financial truth; the selected snapshot is.
   */
  readonly latestRates: MarketRate | null;
  /** Explicitly historical previous-day comparison row; never current trust. */
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
 * Conservative provider-observation time shared by every current display:
 * the oldest provider timestamp in the selected snapshot. Root `created_at`,
 * fetch, storage, sync, receipt, and restart times are never used here.
 */
function getSnapshotProviderTime(
  snapshot: SelectedMarketRateSnapshot | null
): Date | null {
  if (!snapshot) {
    return null;
  }
  const times = Array.from(snapshot.ratesByInstrument.values())
    .map((rate) => rate.providerObservedAt?.getTime() ?? null)
    .filter((time): time is number => time !== null);
  return times.length === 0 ? null : new Date(Math.min(...times));
}

/**
 * Hook to get market rates from local WatermelonDB.
 *
 * The current financial truth is the single selected atomic snapshot rebuilt
 * deterministically from cached roots + bound exact observations. Connection
 * state (`isConnected`) is provided by the app-level
 * `MarketRatesRealtimeProvider`.
 *
 * Single source of truth: WatermelonDB (synced from Supabase)
 */
export function useMarketRates(): UseMarketRatesResult {
  const database = useDatabase();
  const { isConnected } = useMarketRatesRealtime();
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<SelectedMarketRateSnapshot | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(true);
  const [observedLatestRates, setObservedLatestRates] = useState<
    readonly MarketRate[]
  >([]);
  const [previousDayRate, setPreviousDayRate] = useState<MarketRate | null>(
    null
  );
  const [isLegacyLoading, setIsLegacyLoading] = useState(true);
  const latestRates = observedLatestRates.at(0) ?? null;

  useEffect(() => {
    const stream: MarketRateSnapshotStream =
      observeSelectedMarketRateSnapshot(database);
    const subscription = stream.subscribe({
      next: (snapshot): void => {
        setSelectedSnapshot(snapshot);
        setIsSnapshotLoading(false);
      },
      error: (error: unknown): void => {
        logger.error("marketSnapshot.observe.failed", error);
        setSelectedSnapshot(null);
        setIsSnapshotLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, [database]);

  // Historical compatibility window: newest wide row is only a legacy
  // conversion input (issue #241) and never current freshness.
  useEffect(() => {
    const subscription = database
      .get<MarketRate>("market_rates")
      .query(Q.sortBy("created_at", Q.desc), Q.take(1))
      .observe()
      .subscribe((rates) => {
        // Watermelon mutates cached model instances in place. Preserve the
        // emitted result array so same-model updates still trigger a render.
        setObservedLatestRates(rates);
        setIsLegacyLoading(false);
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

  const trustValues = selectedSnapshot
    ? [
        selectedSnapshot.trust.gold,
        selectedSnapshot.trust.silver,
        ...selectedSnapshot.trust.currencies.values(),
      ]
    : [];
  const summary = selectedSnapshot
    ? summarizeLiveRatesTrust(trustValues)
    : "missing";

  return {
    selectedSnapshot,
    latestRates,
    previousDayRate,
    isLoading: isSnapshotLoading || isLegacyLoading,
    isConnected,
    lastUpdated: getSnapshotProviderTime(selectedSnapshot),
    isStale:
      selectedSnapshot === null ? false : summary !== "fresh",
  };
}
