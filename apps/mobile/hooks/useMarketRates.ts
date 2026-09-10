import type { MarketRate } from "@monyvi/db";
import { assertValidMarketRateModel } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDatabase } from "../providers/DatabaseProvider";
import { useMarketRatesRealtime } from "../providers/MarketRatesRealtimeProvider";
import {
  observeSelectedMarketRateSnapshot,
  type MarketRateSnapshotStream,
  type SelectedMarketRateSnapshot,
} from "../services/market-rate-snapshot-read-model-service";
import { summarizeLiveRatesTrust } from "../services/live-rates-trust-read-model-service";
import { logger } from "../utils/logger";

export interface UseMarketRatesResult {
  readonly selectedSnapshot: SelectedMarketRateSnapshot | null;
  /** Explicitly historical previous-day comparison row. */
  readonly previousDayRate: MarketRate | null;
  /** Current complete-snapshot readiness only. */
  readonly isLoading: boolean;
  readonly isCurrentLoading: boolean;
  /** Wide/history query readiness is independent from current readiness. */
  readonly isHistoryLoading: boolean;
  readonly currentError: Error | null;
  readonly isConnected: boolean;
  readonly lastUpdated: Date | null;
  readonly isStale: boolean;
  readonly refreshSelectedSnapshot: () => void;
}

function getValidHistoricalRate(
  rate: MarketRate | undefined
): MarketRate | null {
  if (!rate) {
    return null;
  }

  try {
    assertValidMarketRateModel(rate);
    return rate;
  } catch (error: unknown) {
    logger.error("marketRates.historicalRow.invalid", error);
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

  const observedTimes = Array.from(snapshot.ratesByInstrument.values())
    .map((rate) => rate.providerObservedAt?.getTime() ?? null)
    .filter((time): time is number => time !== null && Number.isFinite(time));

  return observedTimes.length === 0
    ? null
    : new Date(Math.min(...observedTimes));
}

/**
 * Current values come from one shared Watermelon-backed complete snapshot.
 * Wide rows remain available only for explicit historical comparisons.
 */
export function useMarketRates(): UseMarketRatesResult {
  const database = useDatabase();
  const { isConnected } = useMarketRatesRealtime();
  const streamRef = useRef<MarketRateSnapshotStream | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<SelectedMarketRateSnapshot | null>(null);
  const [isCurrentLoading, setIsCurrentLoading] = useState(true);
  const [currentError, setCurrentError] = useState<Error | null>(null);
  const [observedLatestRates, setObservedLatestRates] = useState<
    readonly MarketRate[]
  >([]);
  const [previousDayRate, setPreviousDayRate] = useState<MarketRate | null>(
    null
  );
  const [isWideHistoryLoading, setIsWideHistoryLoading] = useState(true);
  const [isPreviousDayLoading, setIsPreviousDayLoading] = useState(true);

  useEffect(() => {
    const stream = observeSelectedMarketRateSnapshot(database);
    streamRef.current = stream;
    const subscription = stream.subscribe({
      next: (snapshot): void => {
        setSelectedSnapshot(snapshot);
        setCurrentError(null);
        setIsCurrentLoading(false);
      },
      error: (error: unknown): void => {
        const normalized =
          error instanceof Error
            ? error
            : new Error("Market snapshot observation failed");
        logger.error("marketSnapshot.observe.failed", normalized);
        // Retain the last complete snapshot. A transient observer failure must
        // not blank valid cached financial truth.
        setCurrentError(normalized);
        setIsCurrentLoading(false);
      },
    });

    return () => {
      if (streamRef.current === stream) {
        streamRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, [database]);

  useEffect(() => {
    const subscription = database
      .get<MarketRate>("market_rates")
      .query(Q.sortBy("created_at", Q.desc), Q.take(1))
      .observe()
      .subscribe({
        next: (rates): void => {
          setObservedLatestRates(rates);
          setIsWideHistoryLoading(false);
        },
        error: (error: unknown): void => {
          logger.error("marketRates.historicalLatest.observe.failed", error);
          setIsWideHistoryLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [database]);

  useEffect(() => {
    let active = true;

    const fetchPreviousDay = async (): Promise<void> => {
      setIsPreviousDayLoading(true);
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

        if (active) {
          setPreviousDayRate(getValidHistoricalRate(rates.at(0)));
        }
      } catch (error: unknown) {
        logger.error("marketRates.previousDay.fetch.failed", error);
        if (active) {
          setPreviousDayRate(null);
        }
      } finally {
        if (active) {
          setIsPreviousDayLoading(false);
        }
      }
    };

    void fetchPreviousDay();
    return () => {
      active = false;
    };
  }, [database, observedLatestRates]);

  const refreshSelectedSnapshot = useCallback((): void => {
    streamRef.current?.refresh();
  }, []);

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
    previousDayRate,
    isLoading: isCurrentLoading,
    isCurrentLoading,
    isHistoryLoading: isWideHistoryLoading || isPreviousDayLoading,
    currentError,
    isConnected,
    lastUpdated: getSnapshotProviderTime(selectedSnapshot),
    isStale: selectedSnapshot === null ? false : summary !== "fresh",
    refreshSelectedSnapshot,
  };
}
