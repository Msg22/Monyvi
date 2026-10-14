import { Q, type Database } from "@nozbe/watermelondb";
import { database, MetalHistoricalRateCache } from "@monyvi/db";
import {
  isExactCalendarDate,
  parseHistoricalDailyRateRecord,
  type HistoricalDailyRateRecord,
} from "@monyvi/logic";

import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  USER_DATA_ACCESS_ERROR_CODES,
} from "./user-data-access";

const CACHE_TABLE = "metal_historical_rate_cache";

export const METAL_HISTORICAL_RATE_CACHE_ERROR_CODES = {
  CORRUPT: "metal_historical_rate_cache_corrupt",
  INVALID_DATE: "metal_historical_rate_cache_invalid_date",
  INVALID_RECORD: "metal_historical_rate_cache_invalid_record",
  CANCELLED: "metal_historical_detail_cancelled",
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
      Q.where("rate_date", rateDate),
      Q.take(2)
    )
    .fetch();

  await assertExpectedCurrentUser(scope.userId);
  if (rows.length > 1) {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
  }
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function saveHistoricalDailyRateCache(
  input: HistoricalDailyRateRecord,
  db: Database = database,
  options: {
    readonly expectedUserId?: string;
    readonly signal?: AbortSignal;
  } = {}
): Promise<HistoricalDailyRateRecord> {
  const record = parseHistoricalDailyRateRecord(input);
  if (record === null) {
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.INVALID_RECORD);
  }

  const scope = await getCurrentUserDataScope();
  if (
    options.expectedUserId !== undefined &&
    options.expectedUserId !== scope.userId
  ) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  const collection = db.get<MetalHistoricalRateCache>(CACHE_TABLE);
  const now = new Date();

  await db.write(async (): Promise<void> => {
    assertCacheSaveNotCancelled(options.signal);
    await assertExpectedCurrentUser(scope.userId);
    const existing = await scope
      .queryOwned(collection, Q.where("rate_date", record.rateDate), Q.take(2))
      .fetch();

    await assertExpectedCurrentUser(scope.userId);
    assertCacheSaveNotCancelled(options.signal);

    if (existing.length > 1) {
      throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CORRUPT);
    }

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
      draft.updatedAt = now;
    });
  });

  return record;
}

function assertCacheSaveNotCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true)
    throw new Error(METAL_HISTORICAL_RATE_CACHE_ERROR_CODES.CANCELLED);
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
  row.snapshotId = record.snapshotId ?? null;
  row.metalProviderObservedAt = record.metalProviderObservedAt ?? null;
  row.currencyProviderObservedAt = record.currencyProviderObservedAt ?? null;
  row.fetchedAt = new Date(record.fetchedAt);
  row.responseDigest = record.responseDigest;
  row.source = record.source;
  row.quality = record.quality;
  row.contractVersion = record.contractVersion;
}

function toRecord(row: MetalHistoricalRateCache): HistoricalDailyRateRecord {
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
    ...(row.snapshotId === null || row.snapshotId === undefined
      ? {}
      : { snapshotId: row.snapshotId }),
    ...(row.metalProviderObservedAt === null ||
    row.metalProviderObservedAt === undefined
      ? {}
      : { metalProviderObservedAt: row.metalProviderObservedAt }),
    ...(row.currencyProviderObservedAt === null ||
    row.currencyProviderObservedAt === undefined
      ? {}
      : { currencyProviderObservedAt: row.currencyProviderObservedAt }),
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
