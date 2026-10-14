import type { Database } from "../../../packages/db/src/supabase-types.ts";

export interface HistoricalMetalRateLimiterResult {
  readonly accepted: boolean;
  readonly remaining: number;
  readonly resetAt: string;
  readonly retryAfterSeconds: number;
}

export type HistoricalMetalRateReserveArgs =
  Database["public"]["Functions"]["historical_metal_rate_reserve_request"]["Args"];

export type HistoricalMetalRateReserveReturns =
  Database["public"]["Functions"]["historical_metal_rate_reserve_request"]["Returns"];

export interface HistoricalMetalRateRpcClient {
  readonly rpc: (
    functionName: "historical_metal_rate_reserve_request",
    args: HistoricalMetalRateReserveArgs,
    signal: AbortSignal
  ) => Promise<{
    readonly data: HistoricalMetalRateReserveReturns | null;
    readonly error: { readonly message: string } | null;
  }>;
}

export async function reserveHistoricalMetalRateRequest(
  client: HistoricalMetalRateRpcClient,
  userId: string,
  signal: AbortSignal
): Promise<HistoricalMetalRateLimiterResult> {
  if (signal.aborted) {
    const abortError = new Error("Request cancelled before reservation");
    abortError.name = "AbortError";
    throw abortError;
  }

  const { data, error } = await client.rpc(
    "historical_metal_rate_reserve_request",
    {
      p_user_id: userId,
    },
    signal
  );

  if (signal.aborted) {
    const abortError = new Error("Request cancelled after reservation");
    abortError.name = "AbortError";
    throw abortError;
  }

  if (error !== null) {
    throw new Error(
      `Historical metal rate reservation failed: ${error.message}`
    );
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      "Expected exactly one reservation record from database RPC"
    );
  }

  const row = data[0];
  if (!row || typeof row !== "object") {
    throw new Error("Malformed reservation record: row is not an object");
  }

  if (typeof row.accepted !== "boolean") {
    throw new Error("Malformed reservation record: accepted must be boolean");
  }

  if (
    typeof row.remaining !== "number" ||
    !Number.isInteger(row.remaining) ||
    row.remaining < 0 ||
    row.remaining > 59
  ) {
    throw new Error(
      "Malformed reservation record: remaining must be an integer between 0 and 59"
    );
  }

  if (
    typeof row.retry_after_seconds !== "number" ||
    !Number.isInteger(row.retry_after_seconds) ||
    row.retry_after_seconds < 0
  ) {
    throw new Error(
      "Malformed reservation record: retry_after_seconds must be a non-negative integer"
    );
  }

  if (row.accepted && row.retry_after_seconds !== 0) {
    throw new Error(
      "Malformed reservation record: accepted request must have retry_after_seconds === 0"
    );
  }

  if (!row.accepted && row.retry_after_seconds < 1) {
    throw new Error(
      "Malformed reservation record: denied request must have retry_after_seconds >= 1"
    );
  }

  if (!row.accepted && row.remaining !== 0) {
    throw new Error(
      "Malformed reservation record: denied request must have remaining === 0"
    );
  }

  if (
    typeof row.reset_at !== "string" ||
    !Number.isFinite(Date.parse(row.reset_at))
  ) {
    throw new Error(
      "Malformed reservation record: reset_at must be a valid timestamp string"
    );
  }

  return {
    accepted: row.accepted,
    remaining: row.remaining,
    resetAt: row.reset_at,
    retryAfterSeconds: row.retry_after_seconds,
  };
}
