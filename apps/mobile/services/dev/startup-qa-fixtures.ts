/**
 * Development-only startup fixtures for manual device QA.
 *
 * These helpers mutate WatermelonDB only. They never touch Supabase and must
 * remain unavailable in release builds.
 */

import { database, type MarketRate } from "@monyvi/db";

/**
 * Permanently removes cached market rates while preserving all user-owned
 * records, including the authenticated user's profile.
 */
export async function removeLocalMarketRatesForQa(): Promise<number> {
  if (!__DEV__) {
    throw new Error("Startup QA fixtures are unavailable in release builds");
  }

  const marketRates = await database
    .get<MarketRate>("market_rates")
    .query()
    .fetch();

  if (marketRates.length === 0) {
    return 0;
  }

  await database.write(async (): Promise<void> => {
    await database.batch(
      marketRates.map((marketRate) => marketRate.prepareDestroyPermanently())
    );
  });

  return marketRates.length;
}
