import "edge-runtime";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readRemoteHistoricalRates } from "./remote-reader.ts";
import type { Database } from "../../../packages/db/src/supabase-types.ts";
import {
  createFetchHistoricalMetalRateHandler,
  type FetchHistoricalMetalRateHandlerDependencies,
} from "./handler.ts";
import {
  reserveHistoricalMetalRateRequest,
  type HistoricalMetalRateLimiterResult,
  type HistoricalMetalRateRpcClient,
  type HistoricalMetalRateReserveArgs,
} from "./rate-limiter.ts";

function createServiceClient(): SupabaseClient<Database> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase environment is not configured");
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createHistoricalMetalRateRpcClient(
  client: SupabaseClient<Database>
): HistoricalMetalRateRpcClient {
  return {
    rpc: async (
      functionName: "historical_metal_rate_reserve_request",
      args: HistoricalMetalRateReserveArgs,
      signal: AbortSignal
    ) => {
      const response = await client.rpc(functionName, args).abortSignal(signal);
      return {
        data: response.data,
        error: response.error,
      };
    },
  };
}

async function authenticate(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (authorization === null) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token.length === 0) return null;
  const { data, error } = await createServiceClient().auth.getUser(token);
  return error === null && data.user !== null ? data.user.id : null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const dependencies: FetchHistoricalMetalRateHandlerDependencies = {
  authenticate,
  reserveRateLimit: async (
    userId: string,
    signal: AbortSignal
  ): Promise<HistoricalMetalRateLimiterResult> => {
    const serviceClient = createServiceClient();
    const rpcClient = createHistoricalMetalRateRpcClient(serviceClient);
    return reserveHistoricalMetalRateRequest(rpcClient, userId, signal);
  },
  readRemoteRates: (
    date,
    signal
  ): ReturnType<typeof readRemoteHistoricalRates> => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey)
      throw new Error("Supabase environment is not configured");
    return readRemoteHistoricalRates({
      date,
      signal,
      supabaseUrl,
      serviceRoleKey,
      fetch: (url, init): Promise<Response> => fetch(url, init),
    });
  },
  now: (): Date => new Date(),
  sha256Hex,
};

Deno.serve(createFetchHistoricalMetalRateHandler(dependencies));
