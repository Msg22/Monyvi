import { parse } from "lossless-json";
import type { Database } from "../../../packages/db/src/supabase-types.ts";
import type { RemoteHistoricalRateRows } from "./handler.ts";

type RemoteTable = keyof Database["public"]["Tables"];
type ObservationRow =
  Database["public"]["Tables"]["market_rate_observations"]["Row"];
const OBSERVATION_COLUMNS = [
  "id",
  "batch_id",
  "instrument_code",
  "value_decimal",
  "unit",
  "orientation",
  "provider_observed_at",
  "source",
  "quality",
  "created_at",
] satisfies readonly (keyof ObservationRow)[];
const PAGE_SIZE = 500;
const BATCH_CHUNK_SIZE = 100;
const MILLISECONDS_PER_DAY = 86_400_000;

export interface ReadRemoteHistoricalRatesInput {
  readonly date: string;
  readonly signal: AbortSignal;
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
}

export async function readRemoteHistoricalRates(
  input: ReadRemoteHistoricalRatesInput
): Promise<RemoteHistoricalRateRows> {
  input.signal.throwIfAborted();
  const midnight = Date.parse(input.date + "T00:00:00.000Z");
  if (!Number.isFinite(midnight)) throw new Error("invalid_remote_rate_date");
  // Broad UTC envelope includes both Cairo DST offsets; exact provider-date proof follows.
  const lower = new Date(midnight - MILLISECONDS_PER_DAY).toISOString();
  const upper = new Date(midnight + MILLISECONDS_PER_DAY * 2).toISOString();
  const roots = await readPages(input, "market_rates", {
    select: "*",
    and:
      "(timestamp_metal.gte." +
      lower +
      ",timestamp_metal.lt." +
      upper +
      ",timestamp_currency.gte." +
      lower +
      ",timestamp_currency.lt." +
      upper +
      ")",
    order: "id.asc",
  });
  const ids = roots.rows.map((row): string => {
    if (typeof row.id !== "string" || !/^[0-9a-f-]{36}$/i.test(row.id))
      throw new Error("invalid_remote_rate_root");
    return row.id;
  });
  const atomRaw: string[] = [];
  for (let index = 0; index < ids.length; index += BATCH_CHUNK_SIZE) {
    const batchIds = ids.slice(index, index + BATCH_CHUNK_SIZE);
    const observations = await readPages(input, "market_rate_observations", {
      select: OBSERVATION_COLUMNS.join(","),
      batch_id: "in.(" + batchIds.join(",") + ")",
      order: "id.asc",
    });
    atomRaw.push(...observations.rawParts);
  }
  return {
    rawRootResponseText: "[" + roots.rawParts.join(",") + "]",
    rawObservationResponseText: "[" + atomRaw.join(",") + "]",
  };
}

async function readPages(
  input: ReadRemoteHistoricalRatesInput,
  table: RemoteTable,
  params: Readonly<Record<string, string>>
): Promise<{
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly rawParts: readonly string[];
}> {
  const rows: Readonly<Record<string, unknown>>[] = [],
    rawParts: string[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    input.signal.throwIfAborted();
    const url = new URL("/rest/v1/" + table, input.supabaseUrl);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    const response = await input.fetch(url.toString(), {
      signal: input.signal,
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: "Bearer " + input.serviceRoleKey,
      },
    });
    if (!response.ok) throw new Error("remote_rate_read_failed");
    const raw = (await response.text()).trim();
    input.signal.throwIfAborted();
    const page: unknown = parse(raw);
    if (!Array.isArray(page) || !raw.startsWith("[") || !raw.endsWith("]"))
      throw new Error("invalid_remote_rate_rows");
    for (const row of page) {
      if (typeof row !== "object" || row === null || Array.isArray(row))
        throw new Error("invalid_remote_rate_rows");
      rows.push(row as Record<string, unknown>);
    }
    if (page.length > 0) rawParts.push(raw.slice(1, -1));
    if (page.length < PAGE_SIZE) return { rows, rawParts };
  }
}
