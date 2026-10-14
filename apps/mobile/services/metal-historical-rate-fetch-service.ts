import {
  parseHistoricalDailyRateRecord,
  type HistoricalDailyRateRecord,
} from "@monyvi/logic";

import {
  getEdgeFunctionErrorStatus,
  invokeAuthenticatedEdgeFunction,
} from "./authenticated-edge-function-service";

import { logger } from "../utils/logger";

const FUNCTION_NAME = "fetch-historical-metal-rate";

export const METAL_HISTORICAL_RATE_FETCH_ERROR_CODES = {
  DATE_UNAVAILABLE: "metal_historical_rate_date_unavailable",
  FAILED: "metal_historical_rate_fetch_failed",
  INVALID_RESPONSE: "metal_historical_rate_invalid_response",
} as const;

export class MetalHistoricalRateFetchError extends Error {
  public constructor(
    public readonly code: (typeof METAL_HISTORICAL_RATE_FETCH_ERROR_CODES)[keyof typeof METAL_HISTORICAL_RATE_FETCH_ERROR_CODES]
  ) {
    super(code);
    this.name = "MetalHistoricalRateFetchError";
  }
}

export async function fetchHistoricalDailyRate(
  rateDate: string,
  signal?: AbortSignal
): Promise<HistoricalDailyRateRecord> {
  if (signal?.aborted === true) {
    throw new MetalHistoricalRateFetchError(
      METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.FAILED
    );
  }
  const response = await invokeAuthenticatedEdgeFunction<unknown>(
    FUNCTION_NAME,
    { body: { date: rateDate }, ...(signal === undefined ? {} : { signal }) }
  );

  if (response.error !== null) {
    if (
      getEdgeFunctionErrorStatus(response.error) === 404 &&
      (await isHistoricalDateUnavailable(response.error))
    ) {
      throw new MetalHistoricalRateFetchError(
        METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.DATE_UNAVAILABLE
      );
    }
    const error = new MetalHistoricalRateFetchError(
      METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.FAILED
    );
    logger.error("metals.historicalRate.fetch.failed", error, {
      status: getEdgeFunctionErrorStatus(response.error),
    });
    throw error;
  }

  if (
    typeof response.data !== "object" ||
    response.data === null ||
    Array.isArray(response.data) ||
    !("success" in response.data) ||
    response.data.success !== true ||
    !("record" in response.data)
  ) {
    throw new MetalHistoricalRateFetchError(
      METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.INVALID_RESPONSE
    );
  }

  const record = parseHistoricalDailyRateRecord(response.data.record);
  if (record === null || record.rateDate !== rateDate) {
    throw new MetalHistoricalRateFetchError(
      METAL_HISTORICAL_RATE_FETCH_ERROR_CODES.INVALID_RESPONSE
    );
  }
  return record;
}

async function isHistoricalDateUnavailable(error: unknown): Promise<boolean> {
  if (
    typeof error !== "object" ||
    error === null ||
    !("context" in error) ||
    !(error.context instanceof Response)
  )
    return false;
  try {
    const body: unknown = await error.context.clone().json();
    return (
      typeof body === "object" &&
      body !== null &&
      "success" in body &&
      body.success === false &&
      "code" in body &&
      body.code === "date_unavailable"
    );
  } catch {
    // An unreadable gateway response cannot prove that historical rates are missing.
    return false;
  }
}
