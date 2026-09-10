import "edge-runtime";
import { createClient } from "@supabase/supabase-js";

import {
  createFetchMetalRatesHandler,
  type PersistSnapshotResult,
} from "./handler.ts";

const handler = createFetchMetalRatesHandler({
  getEnv(name): string | undefined {
    return Deno.env.get(name);
  },
  fetch(url): Promise<Response> {
    return fetch(url);
  },
  now(): Date {
    return new Date();
  },
  createSnapshotId(): string {
    return crypto.randomUUID();
  },
  async persistSnapshot(payload): Promise<PersistSnapshotResult> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return {
        data: null,
        error: { message: "Supabase service configuration is missing" },
      };
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc(
      "persist_market_rate_snapshot_v1",
      payload
    );

    return {
      data,
      error: error === null ? null : { message: error.message },
    };
  },
});

Deno.serve(handler);
