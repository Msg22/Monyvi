import AsyncStorage from "@react-native-async-storage/async-storage";
import { Q, type Database } from "@nozbe/watermelondb";
import { applyRemoteChanges } from "@nozbe/watermelondb/sync/impl";
import type { MarketRateObservation } from "@monyvi/db";

import {
  pullMarketRateObservations,
  pullMarketRates,
  type MetalObservationCursor,
} from "./sync/pull-strategies";

const E2E_REFRESH_FAILURE_MARKER_PREFIX =
  "@monyvi/e2e/live-rates-refresh-failure/";
const E2E_REFRESH_FAILURE_ARMED = "armed";
const E2E_REFRESH_FAILURE_CONSUMED = "consumed";
const E2E_REFRESH_FAILURE_ERROR = "e2e_live_rates_refresh_failure_once";

let fixtureMarkerQueue: Promise<void> = Promise.resolve();

async function getLatestObservationCursor(
  database: Database
): Promise<MetalObservationCursor | null> {
  const observations = await database
    .get<MarketRateObservation>("market_rate_observations")
    .query(Q.sortBy("created_at", Q.desc), Q.sortBy("id", Q.desc), Q.take(1))
    .fetch();
  const latest = observations[0];
  return latest
    ? { createdAt: latest.createdAt.toISOString(), id: latest.id }
    : null;
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

/**
 * Refreshes shared live-rate snapshots and exact observations without invoking
 * generic synchronization or changing its cursor metadata.
 */
export async function refreshLiveMarketRates(
  database: Database
): Promise<void> {
  if (await consumeArmedFixtureMarker()) {
    throw new Error(E2E_REFRESH_FAILURE_ERROR);
  }

  const observationCursor = await getLatestObservationCursor(database);
  const [marketRates, observations] = await Promise.all([
    pullMarketRates(),
    pullMarketRateObservations(observationCursor),
  ]);

  await database.write(async (): Promise<void> => {
    await applyRemoteChanges(
      {
        market_rates: marketRates,
        market_rate_observations: observations.changes,
      },
      { db: database, sendCreatedAsUpdated: true }
    );
  });
}
