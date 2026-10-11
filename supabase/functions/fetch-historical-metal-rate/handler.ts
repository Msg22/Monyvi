import {
  HistoricalMetalRateContractError,
  buildHistoricalSnapshotRateRecord,
  type HistoricalMetalRateContractErrorCode,
} from "../_shared/historical-metal-rate-contract.ts";
import { withTimeout } from "../_shared/promise-timeout.ts";

const REMOTE_TIMEOUT_MS = 10_000;

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type HandlerErrorCode =
  | "authentication_required"
  | "configuration_error"
  | "date_unavailable"
  | "internal_error"
  | "invalid_request"
  | "method_not_allowed"
  | "remote_rate_error";

class FetchHistoricalMetalRateHandlerError extends Error {
  public constructor(
    public readonly code: HandlerErrorCode,
    public readonly status: number
  ) {
    super(code);
    this.name = "FetchHistoricalMetalRateHandlerError";
  }
}

export interface RemoteHistoricalRateRows {
  readonly rawRootResponseText: string;
  readonly rawObservationResponseText: string;
}

export interface FetchHistoricalMetalRateHandlerDependencies {
  readonly authenticate: (request: Request) => Promise<string | null>;
  readonly readRemoteRates: (
    date: string,
    signal: AbortSignal
  ) => Promise<RemoteHistoricalRateRows>;
  readonly now: () => Date;
  readonly sha256Hex: (value: string) => Promise<string>;
}

export function createFetchHistoricalMetalRateHandler(
  dependencies: FetchHistoricalMetalRateHandlerDependencies
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return jsonResponse({ success: false, code: "method_not_allowed" }, 405);
    }

    try {
      const userId = await dependencies.authenticate(request);
      if (userId === null) {
        throw new FetchHistoricalMetalRateHandlerError(
          "authentication_required",
          401
        );
      }

      const date = await readRequestDate(request);
      if (request.signal.aborted)
        return jsonResponse({ success: false, code: "request_cancelled" }, 499);
      const remote = await withTimeout(
        (signal): Promise<RemoteHistoricalRateRows> =>
          dependencies.readRemoteRates(date, signal),
        REMOTE_TIMEOUT_MS,
        request.signal
      );
      if (request.signal.aborted)
        return jsonResponse({ success: false, code: "request_cancelled" }, 499);

      const fetchedAtDate = dependencies.now();
      if (!Number.isFinite(fetchedAtDate.getTime())) {
        throw new FetchHistoricalMetalRateHandlerError("internal_error", 500);
      }

      const responseDigest = await dependencies.sha256Hex(
        JSON.stringify([
          remote.rawRootResponseText,
          remote.rawObservationResponseText,
        ])
      );
      const record = buildHistoricalSnapshotRateRecord({
        ...remote,
        requestedDate: date,
        fetchedAt: fetchedAtDate.toISOString(),
        responseDigest,
      });

      if (request.signal.aborted)
        return jsonResponse({ success: false, code: "request_cancelled" }, 499);
      return jsonResponse({ success: true, record }, 200);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "TimeoutError") {
        return jsonResponse({ success: false, code: "remote_rate_error" }, 504);
      }
      if (error instanceof FetchHistoricalMetalRateHandlerError) {
        return jsonResponse({ success: false, code: error.code }, error.status);
      }
      if (error instanceof HistoricalMetalRateContractError) {
        return historicalContractErrorResponse(error.code);
      }
      if (request.signal.aborted)
        return jsonResponse({ success: false, code: "request_cancelled" }, 499);
      return jsonResponse({ success: false, code: "remote_rate_error" }, 502);
    }
  };
}

async function readRequestDate(request: Request): Promise<string> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new FetchHistoricalMetalRateHandlerError("invalid_request", 400);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !("date" in parsed) ||
    typeof parsed.date !== "string" ||
    !isExactCalendarDate(parsed.date)
  ) {
    throw new FetchHistoricalMetalRateHandlerError("invalid_request", 400);
  }
  return parsed.date;
}

function historicalContractErrorResponse(
  code: HistoricalMetalRateContractErrorCode
): Response {
  if (code === "date_unavailable") {
    return jsonResponse({ success: false, code: "date_unavailable" }, 404);
  }
  return jsonResponse({ success: false, code: "remote_rate_error" }, 502);
}

function isExactCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function jsonResponse(
  body: Readonly<Record<string, unknown>>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
