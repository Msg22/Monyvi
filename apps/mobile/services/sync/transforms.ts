import {
  ALL_DATE_COLUMNS,
  DATE_ONLY_COLUMNS,
  PROFILE_AI_PROCESSING_CONSENT_COLUMN,
  PROFILE_NOTIFICATION_SETTINGS_COLUMN,
  PROFILE_ONBOARDING_FLAGS_COLUMN,
  TIMESTAMP_COLUMNS,
} from "./config";
import type { SupabaseTablesNames, WritableSupabaseTablesNames } from "./types";

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
  return {
    ...record,
    [PROFILE_NOTIFICATION_SETTINGS_COLUMN]: parseJsonForSupabase(
      record[PROFILE_NOTIFICATION_SETTINGS_COLUMN],
      null,
      PROFILE_NOTIFICATION_SETTINGS_COLUMN
    ),
    [PROFILE_AI_PROCESSING_CONSENT_COLUMN]: parseJsonForSupabase(
      record[PROFILE_AI_PROCESSING_CONSENT_COLUMN],
      null,
      PROFILE_AI_PROCESSING_CONSENT_COLUMN
    ),
    [PROFILE_ONBOARDING_FLAGS_COLUMN]: parseJsonForSupabase(
      record[PROFILE_ONBOARDING_FLAGS_COLUMN],
      {},
      PROFILE_ONBOARDING_FLAGS_COLUMN
    ),
  };
}

export function transformFromSupabase(
  table: SupabaseTablesNames,
  record: Record<string, unknown>
): Record<string, unknown> {
  const transformed: Record<string, unknown> =
    table === "profiles" ? normalizeProfileFromSupabase(record) : { ...record };

  for (const col of ALL_DATE_COLUMNS) {
    if (typeof record[col] === "string") {
      const timestamp = new Date(record[col]).getTime();
      if (!Number.isNaN(timestamp)) {
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

  if (!isChildTable) {
    transformed.user_id = userId;
  }

  for (const col of TIMESTAMP_COLUMNS) {
    if (typeof wmRecord[col] === "number") {
      transformed[col] = new Date(wmRecord[col]).toISOString();
    }
  }

  for (const col of DATE_ONLY_COLUMNS) {
    if (typeof wmRecord[col] === "number") {
      transformed[col] = new Date(wmRecord[col]).toISOString().split("T")[0];
    }
  }

  return transformed;
}
