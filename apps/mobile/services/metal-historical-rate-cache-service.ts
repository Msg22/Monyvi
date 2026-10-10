import { Q, type Database } from "@nozbe/watermelondb";
import {
  database,
  MetalHistoricalRateCache,
} from "@monyvi/db";
import {
  isExactCalendarDate,
  parseHistoricalDailyRateRecord,
  type HistoricalDailyRateRecord,
} from "@monyvi/logic";

import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

const CACHE_TABLE = "metal_historical_rate_cache";
const PROVIDER_KEY = "metals.dev";

export const METAL_HISTORICAL_RATE_CACHE_ERROR_CODES = {
  CORRUPT: "metal_historical_rate_cache_corrupt",
  INVALID_DATE: "metal_historical_rate_cache_invalid_date",
  INVALID_RECORD: "metal_historical_rate_cache_invalid_record",
} as const;

export async function readHistoricalDailyRateCache(
  rateDate: string,
  db: Database = database
): Promise<HistoricalDailyRateRecord | null> {
  if (!isExactCalendarDate(rateDate)) {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.INVALID_DATE);
  }
  const scope = await getCurrentUserDataScope();
  const rows = await scope
    .queryOwned(
      db.get<MetalHistoricalRateCache>(CACHE_TABLE),
      Q.where("provider_key", PROVIDER_KEY),
      Q.where("rate_date", rateDate),
      Q.take(2)
    )
    .fetch();

  if (rows.length > 1) {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
  }
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function saveHistoricalDailyRateCache(
  input: HistoricalDailyRateRecord,
  db: Database = database
): Promise<HistoricalDailyRateRecord> {
  const record = parseHistoricalDailyRateRecord(input);
  if (record === null || record.providerKey !== PROVIDER_KEY) {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.INVALID_RECORD);
  }

  const scope = await getCurrentUserDataScope();
  const collection = db.get<MetalHistoricalRateCache>(CACHE_TABLE);
  const existing = await scope
    .queryOwned(
      collection,
      Q.where("provider_key", PROVIDER_KEY),
      Q.where("rate_date", record.rateDate),
      Q.take(2)
    )
    .fetch();

  if (existing.length > 1) {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
  }

  await assertExpectedCurrentUser(scope.userId);
  const now = new Date();

  await db.write(async (): Promise<void> => {
    const row = existing[0];
    if (row) {
      await row.update((draft): void => {
        applyRecord(draft, record);
        draft.updatedAt = now;
      });
      return;
    }

    await collection.create((draft): void => {
      draft.userId = scope.userId;
      applyRecord(draft, record);
      draft.createdAt = now;
      draft.updatedAt = now;
    });
  });

  return record;
}

function applyRecord(
  row: MetalHistoricalRateCache,
  record: HistoricalDailyRateRecord
): void {
  row.providerKey = record.providerKey;
  row.rateDate = record.rateDate;
  row.resolution = record.resolution;
  row.goldUsdPerTroyOunceDecimal = record.goldUsdPerTroyOunceDecimal;
  row.silverUsdPerTroyOunceDecimal = record.silverUsdPerTroyOunceDecimal;
  row.goldUsdPerPureGramDecimal = record.goldUsdPerPureGramDecimal;
  row.silverUsdPerPureGramDecimal = record.silverUsdPerPureGramDecimal;
  row.currenciesUsdPerUnitJson = JSON.stringify(record.currenciesUsdPerUnit);
  row.providerResponseTimestamp = record.providerResponseTimestamp;
  row.fetchedAt = new Date(record.fetchedAt);
  row.responseDigest = record.responseDigest;
  row.source = record.source;
  row.quality = record.quality;
  row.contractVersion = record.contractVersion;
}

function toRecord(
  row: MetalHistoricalRateCache
): HistoricalDailyRateRecord {
  let currencies: unknown;
  try {
    currencies = JSON.parse(row.currenciesUsdPerUnitJson);
  } catch {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
  }

  const parsed = parseHistoricalDailyRateRecord({
    contractVersion: row.contractVersion,
    providerKey: row.providerKey,
    rateDate: row.rateDate,
    resolution: row.resolution,
    goldUsdPerTroyOunceDecimal: row.goldUsdPerTroyOunceDecimal,
    silverUsdPerTroyOunceDecimal: row.silverUsdPerTroyOunceDecimal,
    goldUsdPerPureGramDecimal: row.goldUsdPerPureGramDecimal,
    silverUsdPerPureGramDecimal: row.silverUsdPerPureGramDecimal,
    currenciesUsdPerUnit: currencies,
    providerResponseTimestamp: row.providerResponseTimestamp,
    fetchedAt: row.fetchedAt.toISOString(),
    responseDigest: row.responseDigest,
    source: row.source,
    quality: row.quality,
  });

  if (parsed === null) {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
  }
  return parsed;
}
