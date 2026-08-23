import {
  DATE_ONLY_COLUMNS,
  PROFILE_AI_PROCESSING_CONSENT_COLUMN,
  PROFILE_NOTIFICATION_SETTINGS_COLUMN,
  PROFILE_ONBOARDING_FLAGS_COLUMN,
  TIMESTAMP_COLUMNS,
} from "./config";
import type { SupabaseTablesNames, WritableSupabaseTablesNames } from "./types";
import {
  assertValidMarketRateRecord,
  isValidTransactionAmount,
} from "@monyvi/logic";

const INVALID_SYNC_AMOUNT_ERROR_CODE = "INVALID_TRANSACTION_AMOUNT";

function parseDateOnlyAsLocal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue) - 1;
  const day = Number(dayValue);
  const date = new Date(year, month, day);

  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date.getTime()
    : null;
}

function formatLocalDateOnly(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function stringifyJsonForWatermelon(
  value: unknown
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

export function parseJsonForSupabase(
  value: unknown,
  fallback: Record<string, never> | null,
  columnName: string
): unknown {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid serialized JSON in profile column ${columnName}: ${reason}`
    );
  }
}

function normalizeProfileFromSupabase(
  record: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...record,
    [PROFILE_NOTIFICATION_SETTINGS_COLUMN]: stringifyJsonForWatermelon(
      record[PROFILE_NOTIFICATION_SETTINGS_COLUMN]
    ),
    [PROFILE_AI_PROCESSING_CONSENT_COLUMN]: stringifyJsonForWatermelon(
      record[PROFILE_AI_PROCESSING_CONSENT_COLUMN]
    ),
    [PROFILE_ONBOARDING_FLAGS_COLUMN]:
      stringifyJsonForWatermelon(record[PROFILE_ONBOARDING_FLAGS_COLUMN]) ??
      "{}",
  };
}

function normalizeProfileToSupabase(
  record: Record<string, unknown>
): Record<string, unknown> {
  const shouldOmitUnchangedAiConsent =
    record["_status"] === "updated" &&
    typeof record["_changed"] === "string" &&
    !record["_changed"]
      .split(",")
      .includes(PROFILE_AI_PROCESSING_CONSENT_COLUMN);
  const {
    [PROFILE_AI_PROCESSING_CONSENT_COLUMN]: aiProcessingConsent,
    ...rest
  } = record;

  const transformed = {
    ...rest,
    [PROFILE_NOTIFICATION_SETTINGS_COLUMN]: parseJsonForSupabase(
      record[PROFILE_NOTIFICATION_SETTINGS_COLUMN],
      null,
      PROFILE_NOTIFICATION_SETTINGS_COLUMN
    ),
    ...(shouldOmitUnchangedAiConsent
      ? {}
      : {
          [PROFILE_AI_PROCESSING_CONSENT_COLUMN]: parseJsonForSupabase(
            aiProcessingConsent,
            null,
            PROFILE_AI_PROCESSING_CONSENT_COLUMN
          ),
        }),
    [PROFILE_ONBOARDING_FLAGS_COLUMN]: parseJsonForSupabase(
      record[PROFILE_ONBOARDING_FLAGS_COLUMN],
      {},
      PROFILE_ONBOARDING_FLAGS_COLUMN
    ),
  };

  return transformed;
}

function assertValidSyncedAmount(
  table: SupabaseTablesNames,
  record: Record<string, unknown>
): void {
  if (table !== "transactions" && table !== "transfers") {
    return;
  }

  const amount = record.amount;
  if (typeof amount !== "number" || !isValidTransactionAmount(amount)) {
    throw new Error(INVALID_SYNC_AMOUNT_ERROR_CODE);
  }
}

export function transformFromSupabase(
  table: SupabaseTablesNames,
  record: Record<string, unknown>
): Record<string, unknown> {
  assertValidSyncedAmount(table, record);
  if (table === "market_rates") {
    assertValidMarketRateRecord(record);
  }

  const transformed: Record<string, unknown> =
    table === "profiles" ? normalizeProfileFromSupabase(record) : { ...record };

  for (const col of TIMESTAMP_COLUMNS) {
    if (typeof record[col] === "string") {
      const timestamp = new Date(record[col]).getTime();
      if (!Number.isNaN(timestamp)) {
        transformed[col] = timestamp;
      }
    }
  }

  for (const col of DATE_ONLY_COLUMNS) {
    if (typeof record[col] === "string") {
      const timestamp = parseDateOnlyAsLocal(record[col]);
      if (timestamp !== null) {
        transformed[col] = timestamp;
      }
    }
  }

  return transformed;
}

export function transformToSupabase(
  table: WritableSupabaseTablesNames,
  record: unknown,
  userId: string,
  isChildTable = false
): Record<string, unknown> {
  const wmRecord = record as Record<string, unknown>;
  const transformed: Record<string, unknown> =
    table === "profiles"
      ? normalizeProfileToSupabase(wmRecord)
      : { ...wmRecord };

  delete transformed["_status"];
  delete transformed["_changed"];
  delete transformed["sms_body_hash"];

  if (table === "bank_details") {
    delete transformed["bank_name"];
    delete transformed["sms_sender_name"];
  }

  if (table === "categories" && transformed.is_system === true) {
    transformed.user_id = null;
  } else if (!isChildTable) {
    transformed.user_id = userId;
  }

  for (const col of TIMESTAMP_COLUMNS) {
    if (typeof wmRecord[col] === "number") {
      transformed[col] = new Date(wmRecord[col]).toISOString();
    }
  }

  for (const col of DATE_ONLY_COLUMNS) {
    if (typeof wmRecord[col] === "number") {
      transformed[col] = formatLocalDateOnly(wmRecord[col]);
    }
  }

  return transformed;
}
