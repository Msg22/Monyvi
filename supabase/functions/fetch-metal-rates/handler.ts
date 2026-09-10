import {
  buildMarketRateSnapshotEnvelope,
  buildPersistRpcPayload,
  MarketRateSnapshotContractError,
  type PersistRpcPayload,
} from "../_shared/market-rate-snapshot-contract.ts";

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export interface PersistSnapshotResult {
  readonly data: unknown;
  readonly error: { readonly message: string } | null;
}

export interface FetchMetalRatesHandlerDependencies {
  readonly getEnv: (name: string) => string | undefined;
  readonly fetch: (url: string) => Promise<Response>;
  readonly now: () => Date;
  readonly createSnapshotId: () => string;
  readonly persistSnapshot: (
    payload: PersistRpcPayload
  ) => Promise<PersistSnapshotResult>;
}

type PersistenceStatus = "created" | "replayed";

type HandlerErrorCode =
  | "configuration_error"
  | "method_not_allowed"
  | "provider_error"
  | "persistence_error"
  | "internal_error";

class FetchMetalRatesHandlerError extends Error {
  constructor(
    readonly code: HandlerErrorCode,
    readonly status: number
  ) {
    super(code);
    this.name = "FetchMetalRatesHandlerError";
  }
}

export function createFetchMetalRatesHandler(
  dependencies: FetchMetalRatesHandlerDependencies
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "POST") {
      return jsonResponse(
        { success: false, code: "method_not_allowed" },
        405
      );
    }

    try {
      const apiKey =
        dependencies.getEnv("METALS.DEV_API_KEY") ??
        dependencies.getEnv("METALS_DEV_API_KEY");
      if (!apiKey) {
        throw new FetchMetalRatesHandlerError("configuration_error", 500);
      }

      const capturedAtDate = dependencies.now();
      if (!Number.isFinite(capturedAtDate.getTime())) {
        throw new FetchMetalRatesHandlerError("internal_error", 500);
      }
      const capturedAt = capturedAtDate.toISOString();
      const snapshotId = dependencies.createSnapshotId();

      const providerUrl = new URL("https://api.metals.dev/v1/latest");
      providerUrl.searchParams.set("api_key", apiKey);
      providerUrl.searchParams.set("currency", "USD");
      providerUrl.searchParams.set("unit", "g");

      const providerResponse = await dependencies.fetch(providerUrl.toString());
      if (!providerResponse.ok) {
        throw new FetchMetalRatesHandlerError("provider_error", 502);
      }

      const rawResponseText = await providerResponse.text();
      const envelope = buildMarketRateSnapshotEnvelope({
        rawResponseText,
        snapshotId,
        capturedAt,
      });
      const payload = buildPersistRpcPayload(envelope);
      const persisted = await dependencies.persistSnapshot(payload);
      if (persisted.error !== null) {
        throw new FetchMetalRatesHandlerError("persistence_error", 502);
      }

      const persistenceStatus = readPersistenceStatus(
        persisted.data,
        snapshotId
      );

      return jsonResponse(
        {
          success: true,
          snapshotId,
          capturedAt,
          persistenceStatus,
        },
        200
      );
    } catch (error: unknown) {
      if (error instanceof FetchMetalRatesHandlerError) {
        return jsonResponse(
          { success: false, code: error.code },
          error.status
        );
      }
      if (error instanceof MarketRateSnapshotContractError) {
        return jsonResponse(
          { success: false, code: "provider_error" },
          502
        );
      }
      return jsonResponse(
        { success: false, code: "internal_error" },
        500
      );
    }
  };
}

function readPersistenceStatus(
  data: unknown,
  snapshotId: string
): PersistenceStatus {
  if (!isRecord(data)) {
    throw new FetchMetalRatesHandlerError("persistence_error", 502);
  }

  const status = data["status"];
  const persistedSnapshotId = data["snapshotId"];
  if (
    (status !== "created" && status !== "replayed") ||
    persistedSnapshotId !== snapshotId
  ) {
    throw new FetchMetalRatesHandlerError("persistence_error", 502);
  }

  return status;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
