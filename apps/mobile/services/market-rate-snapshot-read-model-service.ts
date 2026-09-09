import { Q, type Database } from "@nozbe/watermelondb";
import type { MarketRate, MarketRateObservation } from "@monyvi/db";
import type {
  CurrentMarketInstrument,
  CurrentMarketRate,
} from "@monyvi/logic";
import { classifyRateTrust, validateCurrentMarketSnapshot } from "@monyvi/logic";

import {
  buildTrustFromSelectedSnapshot,
  type LiveRatesTrustReadModel,
} from "./live-rates-trust-read-model-service";

export interface SelectedCurrentMarketRate {
  readonly instrumentCode: CurrentMarketInstrument;
  readonly valueDecimal: string;
  readonly normalizedUsdPerBaseDecimal: string;
  readonly unit: CurrentMarketRate["unit"];
  readonly orientation: CurrentMarketRate["orientation"];
  readonly providerObservedAt: Date | null;
  readonly source: string;
  readonly quality: "valid";
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly ageMs: number | null;
}

export interface SelectedMarketRateSnapshot {
  readonly snapshotId: string;
  readonly capturedAt: Date;
  readonly ratesByInstrument: ReadonlyMap<
    CurrentMarketInstrument,
    SelectedCurrentMarketRate
  >;
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

export interface MarketRateSnapshotObserver {
  readonly next: (value: SelectedMarketRateSnapshot | null) => void;
  readonly error?: (error: unknown) => void;
}

export interface MarketRateSnapshotRowsObserver<T> {
  readonly next: (value: T) => void;
  readonly error?: (error: unknown) => void;
}

export interface MarketRateSnapshotSubscription {
  readonly unsubscribe: () => void;
}

export interface MarketRateSnapshotDataSource {
  observeRoots(
    observer: MarketRateSnapshotRowsObserver<
      readonly MarketRateRootCandidate[]
    >
  ): MarketRateSnapshotSubscription;
  observeObservations(
    batchIds: readonly string[],
    observer: MarketRateSnapshotRowsObserver<
      readonly MarketRateObservationCandidate[]
    >
  ): MarketRateSnapshotSubscription;
  fetchRoots(): Promise<readonly MarketRateRootCandidate[]>;
  fetchObservations(
    batchIds: readonly string[]
  ): Promise<readonly MarketRateObservationCandidate[]>;
}

export interface MarketRateSnapshotStream {
  refresh(): void;
  subscribe(observer: MarketRateSnapshotObserver): MarketRateSnapshotSubscription;
}

export const MAX_SNAPSHOT_CANDIDATES = 30;

const sharedStreams = new WeakMap<Database, MarketRateSnapshotStream>();

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
      return byCreated !== 0
        ? byCreated
        : right.id.localeCompare(left.id);
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

  const ratesByInstrument = new Map<
    CurrentMarketInstrument,
    SelectedCurrentMarketRate
  >();
  for (const [instrumentCode, rate] of validation.rates) {
    ratesByInstrument.set(
      instrumentCode,
      toSelectedRate(rate, root, nowMs)
    );
  }

  const snapshot: SelectedMarketRateSnapshot = {
    snapshotId: root.id,
    capturedAt: new Date(root.createdAt.getTime()),
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

  const freshness =
    trust.state === "fresh" ||
    trust.state === "stale" ||
    trust.state === "unknown"
      ? trust.state
      : "unknown";

  return Object.freeze({
    instrumentCode: rate.instrumentCode,
    valueDecimal: rate.valueDecimal,
    normalizedUsdPerBaseDecimal: rate.normalizedUsdPerBaseDecimal,
    unit: rate.unit,
    orientation: rate.orientation,
    providerObservedAt:
      rate.providerObservedAt === null
        ? null
        : new Date(rate.providerObservedAt.getTime()),
    source: rate.source,
    quality: rate.quality,
    freshness,
    ageMs: trust.ageMs,
  });
}

export function createMarketRateSnapshotStream(
  source: MarketRateSnapshotDataSource,
  getNowMs: () => number = Date.now
): MarketRateSnapshotStream {
  const observers = new Set<MarketRateSnapshotObserver>();
  let rootSubscription: MarketRateSnapshotSubscription | null = null;
  let observationsSubscription: MarketRateSnapshotSubscription | null = null;
  let latestRoots: readonly MarketRateRootCandidate[] = [];
  let latestObservations: readonly MarketRateObservationCandidate[] = [];
  let currentSnapshot: SelectedMarketRateSnapshot | null = null;
  let hasPublished = false;
  let started = false;
  let observationGeneration = 0;

  const reportError = (error: unknown): void => {
    for (const observer of [...observers]) {
      observer.error?.(error);
    }
  };

  const publish = (): void => {
    currentSnapshot = selectMarketRateSnapshot(
      latestRoots,
      latestObservations,
      getNowMs()
    );
    hasPublished = true;
    for (const observer of [...observers]) {
      observer.next(currentSnapshot);
    }
  };

  const replaceObservationSubscription = (
    roots: readonly MarketRateRootCandidate[]
  ): void => {
    observationGeneration += 1;
    const generation = observationGeneration;
    observationsSubscription?.unsubscribe();
    observationsSubscription = null;

    const batchIds = roots.map(({ id }) => id);
    if (batchIds.length === 0) {
      latestObservations = [];
      publish();
      return;
    }

    observationsSubscription = source.observeObservations(batchIds, {
      next: (observations): void => {
        if (generation !== observationGeneration) {
          return;
        }
        latestObservations = observations;
        publish();
      },
      error: (error: unknown): void => {
        if (generation === observationGeneration) {
          reportError(error);
        }
      },
    });
  };

  const start = (): void => {
    if (started) {
      return;
    }
    started = true;
    rootSubscription = source.observeRoots({
      next: (roots): void => {
        latestRoots = roots;
        replaceObservationSubscription(roots);
      },
      error: reportError,
    });
  };

  const stop = (): void => {
    if (!started) {
      return;
    }
    started = false;
    observationGeneration += 1;
    observationsSubscription?.unsubscribe();
    observationsSubscription = null;
    rootSubscription?.unsubscribe();
    rootSubscription = null;
  };

  return {
    refresh(): void {
      if (hasPublished) {
        publish();
      }
    },
    subscribe(observer: MarketRateSnapshotObserver): MarketRateSnapshotSubscription {
      observers.add(observer);
      if (hasPublished) {
        observer.next(currentSnapshot);
      }
      start();

      let subscribed = true;
      return {
        unsubscribe: (): void => {
          if (!subscribed) {
            return;
          }
          subscribed = false;
          observers.delete(observer);
          if (observers.size === 0) {
            stop();
          }
        },
      };
    },
  };
}

export function observeSelectedMarketRateSnapshot(
  database: Database,
  getNowMs: () => number = Date.now
): MarketRateSnapshotStream {
  if (getNowMs !== Date.now) {
    return createMarketRateSnapshotStream(
      createWatermelonMarketRateSnapshotDataSource(database),
      getNowMs
    );
  }

  const existing = sharedStreams.get(database);
  if (existing) {
    return existing;
  }

  const created = createMarketRateSnapshotStream(
    createWatermelonMarketRateSnapshotDataSource(database),
    getNowMs
  );
  sharedStreams.set(database, created);
  return created;
}

export async function readSelectedMarketRateSnapshot(
  database: Database,
  getNowMs: () => number = Date.now
): Promise<SelectedMarketRateSnapshot | null> {
  const source = createWatermelonMarketRateSnapshotDataSource(database);
  const roots = await source.fetchRoots();
  const batchIds = roots.map(({ id }) => id);
  const observations =
    batchIds.length === 0 ? [] : await source.fetchObservations(batchIds);
  return selectMarketRateSnapshot(roots, observations, getNowMs());
}

export function createWatermelonMarketRateSnapshotDataSource(
  database: Database
): MarketRateSnapshotDataSource {
  const roots = database.get<MarketRate>("market_rates");
  const observations =
    database.get<MarketRateObservation>("market_rate_observations");

  const rootQuery = (): ReturnType<typeof roots.query> =>
    roots.query(
      Q.sortBy("created_at", Q.desc),
      Q.sortBy("id", Q.desc),
      Q.take(MAX_SNAPSHOT_CANDIDATES)
    );

  return {
    observeRoots(observer): MarketRateSnapshotSubscription {
      return rootQuery().observe().subscribe(observer);
    },
    observeObservations(batchIds, observer): MarketRateSnapshotSubscription {
      if (batchIds.length === 0) {
        observer.next([]);
        return { unsubscribe: (): void => undefined };
      }
      return observations
        .query(Q.where("batch_id", Q.oneOf([...batchIds])))
        .observe()
        .subscribe(observer);
    },
    async fetchRoots(): Promise<readonly MarketRateRootCandidate[]> {
      return rootQuery().fetch();
    },
    async fetchObservations(
      batchIds: readonly string[]
    ): Promise<readonly MarketRateObservationCandidate[]> {
      if (batchIds.length === 0) {
        return [];
      }
      return observations
        .query(Q.where("batch_id", Q.oneOf([...batchIds])))
        .fetch();
    },
  };
}
