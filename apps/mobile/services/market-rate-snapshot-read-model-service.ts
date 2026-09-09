import { Q, type Database } from "@nozbe/watermelondb";
import type { MarketRate, MarketRateObservation } from "@monyvi/db";
import type { CurrentMarketRate } from "@monyvi/logic";
import { classifyRateTrust, validateCurrentMarketSnapshot } from "@monyvi/logic";

import { buildTrustFromSelectedSnapshot } from "./live-rates-trust-read-model-service";
import type { LiveRatesTrustReadModel } from "./live-rates-trust-read-model-service";

export interface SelectedCurrentMarketRate {
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly normalizedUsdPerBaseDecimal: string;
  readonly unit: string;
  readonly orientation: string;
  readonly providerObservedAt: Date | null;
  readonly source: string;
  readonly quality: "valid";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly ageMs: number | null;
}

export interface SelectedMarketRateSnapshot {
  readonly snapshotId: string;
  readonly capturedAt: Date;
  readonly ratesByInstrument: ReadonlyMap<string, SelectedCurrentMarketRate>;
  readonly trust: LiveRatesTrustReadModel;
}

export interface MarketRateRootCandidate {
  readonly id: string;
  readonly createdAt: Date;
}

export interface MarketRateObservationCandidate {
  readonly id: string;
  readonly batchId: string;
  readonly createdAt: Date;
  readonly instrumentCode: string;
  readonly valueDecimal: string | null;
  readonly unit: string | null;
  readonly orientation: string | null;
  readonly providerObservedAt: Date | null;
  readonly source: string | null;
  readonly quality: string | null;
}

export type MarketRateObservationCandidateRow = MarketRateObservation | MarketRateObservationCandidate;

export interface MarketRateSnapshotObserver {
  readonly next: (value: SelectedMarketRateSnapshot | null) => void;
  readonly error?: (error: unknown) => void;
}

export interface MarketRateSnapshotSubscription {
  readonly unsubscribe: () => void;
}

export interface MarketRateSnapshotStream {
  refresh(): void;
  subscribe(observer: MarketRateSnapshotObserver): MarketRateSnapshotSubscription;
}

export const MAX_SNAPSHOT_CANDIDATES = 30;

export function selectMarketRateSnapshot(
  roots: readonly MarketRateRootCandidate[],
  observations: readonly MarketRateObservationCandidate[],
  nowMs: number
): SelectedMarketRateSnapshot | null {
  const candidateIds = new Set<string>();
  const conflictedIds = new Set<string>();
  for (const root of roots) {
    if (candidateIds.has(root.id)) {
      conflictedIds.add(root.id);
    }
    candidateIds.add(root.id);
  }

  const ordered = [...roots]
    .filter(
      (root) =>
        !conflictedIds.has(root.id) &&
        Number.isFinite(root.createdAt.getTime())
    )
    .sort((left, right) => {
      const byCreated = right.createdAt.getTime() - left.createdAt.getTime();
      if (byCreated !== 0) {
        return byCreated;
      }
      return right.id.localeCompare(left.id);
    });

  for (const root of ordered.slice(0, MAX_SNAPSHOT_CANDIDATES)) {
    const children = observations.filter(
      (observation) => observation.batchId === root.id
    );
    const selected = evaluateCandidate(root, children, nowMs);
    if (selected !== null) {
      return selected;
    }
  }

  return null;
}

function evaluateCandidate(
  root: MarketRateRootCandidate,
  children: readonly MarketRateObservationCandidate[],
  nowMs: number
): SelectedMarketRateSnapshot | null {
  const validation = validateCurrentMarketSnapshot(
    children.map((observation) => ({
      instrumentCode: observation.instrumentCode,
      valueDecimal: observation.valueDecimal,
      unit: observation.unit,
      orientation: observation.orientation,
      providerObservedAt: observation.providerObservedAt,
      source: observation.source,
      quality: observation.quality,
      capturedAt: root.createdAt,
    }))
  );
  if (!validation.available) {
    return null;
  }

  const ratesByInstrument = new Map<string, SelectedCurrentMarketRate>();
  for (const [instrumentCode, rate] of validation.rates) {
    ratesByInstrument.set(
      instrumentCode,
      toSelectedRate(rate, root, nowMs)
    );
  }

  const snapshot: SelectedMarketRateSnapshot = {
    snapshotId: root.id,
    capturedAt: root.createdAt,
    ratesByInstrument,
    trust: buildTrustFromSelectedSnapshot({
      capturedAt: root.createdAt,
      ratesByInstrument,
    }),
  };
  return Object.freeze(snapshot);
}

function toSelectedRate(
  rate: CurrentMarketRate,
  root: MarketRateRootCandidate,
  nowMs: number
): SelectedCurrentMarketRate {
  const trust = classifyRateTrust(
    {
      valueDecimal: rate.valueDecimal,
      quality: "valid",
      providerObservedAt: rate.providerObservedAt?.getTime() ?? null,
      capturedAt: root.createdAt.getTime(),
    },
    nowMs
  );

  return Object.freeze({
    instrumentCode: rate.instrumentCode,
    valueDecimal: rate.valueDecimal,
    normalizedUsdPerBaseDecimal: rate.normalizedUsdPerBaseDecimal,
    unit: rate.unit,
    orientation: rate.orientation,
    providerObservedAt: rate.providerObservedAt,
    source: rate.source,
    quality: rate.quality,
    freshness:
      trust.state === "fresh" ||
      trust.state === "stale" ||
      trust.state === "unknown"
        ? trust.state
        : "unknown",
    ageMs: trust.ageMs,
  });
}

export function observeSelectedMarketRateSnapshot(
  database: Database,
  getNowMs: () => number = Date.now
): MarketRateSnapshotStream {
  const roots = database.get<MarketRate>("market_rates");
  const observations =
    database.get<MarketRateObservation>("market_rate_observations");
  const refreshers = new Set<() => void>();

  return {
    refresh(): void {
      for (const refresh of [...refreshers]) {
        refresh();
      }
    },
    subscribe(
      observer: MarketRateSnapshotObserver
    ): MarketRateSnapshotSubscription {
      let cancelled = false;
      let latestRoots: readonly MarketRateRootCandidate[] = [];

      const publish = async (): Promise<void> => {
        try {
          const candidateIds = latestRoots.map((root) => root.id);
          const children =
            candidateIds.length === 0
              ? []
              : await observations
                  .query(Q.where("batch_id", Q.oneOf(candidateIds)))
                  .fetch();
          if (cancelled) {
            return;
          }
          observer.next(
            selectMarketRateSnapshot(latestRoots, children, getNowMs())
          );
        } catch (error: unknown) {
          if (!cancelled) {
            observer.error?.(error);
          }
        }
      };

      const refresh = (): void => {
        void publish();
      };
      refreshers.add(refresh);

      const rootSubscription = roots
        .query(
          Q.sortBy("created_at", Q.desc),
          Q.sortBy("id", Q.desc),
          Q.take(MAX_SNAPSHOT_CANDIDATES)
        )
        .observe()
        .subscribe({
          next: (candidateRoots): void => {
            latestRoots = candidateRoots;
            void publish();
          },
          error: (error: unknown): void => {
            if (!cancelled) {
              observer.error?.(error);
            }
          },
        });

      return {
        unsubscribe: (): void => {
          cancelled = true;
          refreshers.delete(refresh);
          rootSubscription.unsubscribe();
        },
      };
    },
  };
}
