import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@nozbe/watermelondb";
import { applyRemoteChanges } from "@nozbe/watermelondb/sync/impl";

import { readSelectedMarketRateSnapshot } from "./market-rate-snapshot-read-model-service";
import {
  pullMarketRateSnapshots,
  type MarketRateSnapshotCursor,
  type MarketRateSnapshotPullResult,
} from "./sync/market-rate-snapshot-pull";

const E2E_REFRESH_FAILURE_MARKER_PREFIX =
  "@monyvi/e2e/live-rates-refresh-failure/";
const E2E_REFRESH_FAILURE_ARMED = "armed";
const E2E_REFRESH_FAILURE_CONSUMED = "consumed";
const E2E_REFRESH_FAILURE_ERROR = "e2e_live_rates_refresh_failure_once";

let fixtureMarkerQueue: Promise<void> = Promise.resolve();

export interface LiveMarketRateRefreshDependencies {
  readonly consumeArmedFixtureMarker: () => Promise<boolean>;
  readonly readLatestSnapshotCursor: () => Promise<MarketRateSnapshotCursor | null>;
  readonly pullSnapshots: (
    cursor: MarketRateSnapshotCursor | null
  ) => Promise<MarketRateSnapshotPullResult>;
  readonly applyChanges: (
    changes: MarketRateSnapshotPullResult["changes"]
  ) => Promise<void>;
}

async function consumeArmedFixtureMarker(): Promise<boolean> {
  if (!__DEV__) return false;

  let didConsume = false;
  const operation = fixtureMarkerQueue.then(async (): Promise<void> => {
    const markerKeys = (await AsyncStorage.getAllKeys())
      .filter((key) => key.startsWith(E2E_REFRESH_FAILURE_MARKER_PREFIX))
      .sort();
    for (const markerKey of markerKeys) {
      if (
        (await AsyncStorage.getItem(markerKey)) !== E2E_REFRESH_FAILURE_ARMED
      ) {
        continue;
      }
      await AsyncStorage.setItem(markerKey, E2E_REFRESH_FAILURE_CONSUMED);
      didConsume = true;
      return;
    }
  });
  fixtureMarkerQueue = operation.catch(() => undefined);
  await operation;
  return didConsume;
}

export async function refreshLiveMarketRatesWithDependencies(
  dependencies: LiveMarketRateRefreshDependencies
): Promise<void> {
  if (await dependencies.consumeArmedFixtureMarker()) {
    throw new Error(E2E_REFRESH_FAILURE_ERROR);
  }

  const cursor = await dependencies.readLatestSnapshotCursor();
  const result = await dependencies.pullSnapshots(cursor);
  await dependencies.applyChanges(result.changes);
}

/**
 * Pulls only complete validated market-rate envelopes and applies each returned
 * root-plus-observation set inside one Watermelon writer. Failed pulls or local
 * writes leave the last complete cached snapshot untouched.
 */
export async function refreshLiveMarketRates(
  database: Database
): Promise<void> {
  return refreshLiveMarketRatesWithDependencies({
    consumeArmedFixtureMarker,
    async readLatestSnapshotCursor(): Promise<MarketRateSnapshotCursor | null> {
      const selected = await readSelectedMarketRateSnapshot(database);
      return selected === null
        ? null
        : {
            createdAt: selected.capturedAt.toISOString(),
            id: selected.snapshotId,
          };
    },
    pullSnapshots: pullMarketRateSnapshots,
    async applyChanges(
      changes: MarketRateSnapshotPullResult["changes"]
    ): Promise<void> {
      await database.write(async (): Promise<void> => {
        await applyRemoteChanges(changes, {
          db: database,
          sendCreatedAsUpdated: true,
        });
      });
    },
  });
}
