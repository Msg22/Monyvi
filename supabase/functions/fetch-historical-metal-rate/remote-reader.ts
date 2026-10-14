import { parse, stringify } from "lossless-json";
import {
  compareCandidates,
  tryQualifyRoot,
  tryQualifyRootRank,
  type SnapshotCandidate,
} from "../_shared/historical-metal-rate-contract-remote.ts";
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
const ROOT_PAGE_SIZE = 100;
const OBSERVATION_PAGE_SIZE = 500;
const MILLISECONDS_PER_DAY = 86_400_000;

export interface ReadRemoteHistoricalRatesInput {
  readonly date: string;
  readonly signal: AbortSignal;
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly rootPageSize?: number;
}

interface ScanState {
  readonly bestCandidate: SnapshotCandidate | null;
  readonly bestRootRow: Readonly<Record<string, unknown>> | null;
  readonly bestObservations: readonly Readonly<Record<string, unknown>>[];
  readonly bestMinTime: number | null;
  readonly stopped: boolean;
}

export async function readRemoteHistoricalRates(
  input: ReadRemoteHistoricalRatesInput
): Promise<RemoteHistoricalRateRows> {
  input.signal.throwIfAborted();
  const bounds = calculateDateBounds(input.date);
  const pageSize = validatePageSize(input.rootPageSize);

  let state: ScanState = {
    bestCandidate: null,
    bestRootRow: null,
    bestObservations: [],
    bestMinTime: null,
    stopped: false,
  };

  for (let offset = 0; !state.stopped; offset += pageSize) {
    input.signal.throwIfAborted();
    const rootPage = await fetchRootPage(input, bounds, pageSize, offset);
    if (rootPage.length === 0) break;

    state = await processRootPageRows(input, rootPage, state);
    if (rootPage.length < pageSize) break;
  }

  return serializeWinningRows(state);
}

function calculateDateBounds(date: string): { lower: string; upper: string } {
  const midnight = Date.parse(date + "T00:00:00.000Z");
  if (!Number.isFinite(midnight)) throw new Error("invalid_remote_rate_date");
  return {
    lower: new Date(midnight - MILLISECONDS_PER_DAY).toISOString(),
    upper: new Date(midnight + MILLISECONDS_PER_DAY * 2).toISOString(),
  };
}

function validatePageSize(rootPageSize?: number): number {
  if (rootPageSize === undefined) return ROOT_PAGE_SIZE;
  if (
    typeof rootPageSize !== "number" ||
    !Number.isInteger(rootPageSize) ||
    rootPageSize <= 0
  ) {
    throw new Error("invalid_root_page_size");
  }
  return rootPageSize;
}

async function fetchRootPage(
  input: ReadRemoteHistoricalRatesInput,
  bounds: { lower: string; upper: string },
  pageSize: number,
  offset: number
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  const result = await readPage(input, "market_rates", {
    select: "*",
    and:
      "(timestamp_metal.gte." +
      bounds.lower +
      ",timestamp_metal.lt." +
      bounds.upper +
      ",timestamp_currency.gte." +
      bounds.lower +
      ",timestamp_currency.lt." +
      bounds.upper +
      ")",
    order:
      "timestamp_metal.desc.nullslast,timestamp_currency.desc.nullslast,created_at.desc.nullslast,id.desc",
    limit: String(pageSize),
    offset: String(offset),
  });
  return result.rows;
}

async function processRootPageRows(
  input: ReadRemoteHistoricalRatesInput,
  rootRows: readonly Readonly<Record<string, unknown>>[],
  currentState: ScanState
): Promise<ScanState> {
  let state = currentState;
  for (const rootRow of rootRows) {
    input.signal.throwIfAborted();
    assertValidRootId(rootRow.id);

    if (shouldEarlyStop(rootRow, state.bestMinTime)) {
      return { ...state, stopped: true };
    }

    const rootRank = tryQualifyRootRank(rootRow, input.date);
    if (rootRank === null) {
      continue;
    }

    if (
      state.bestCandidate !== null &&
      compareCandidates(rootRank, state.bestCandidate) >= 0
    ) {
      continue;
    }

    state = await evaluateCandidateRoot(input, rootRow, state);
  }
  return state;
}

function assertValidRootId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("invalid_remote_rate_root");
  }
}

function shouldEarlyStop(
  rootRow: Readonly<Record<string, unknown>>,
  bestMinTime: number | null
): boolean {
  if (bestMinTime === null) return false;
  if (typeof rootRow.timestamp_metal !== "string") return false;
  const metalMs = Date.parse(rootRow.timestamp_metal);
  return Number.isFinite(metalMs) && metalMs < bestMinTime;
}

async function evaluateCandidateRoot(
  input: ReadRemoteHistoricalRatesInput,
  rootRow: Readonly<Record<string, unknown>>,
  state: ScanState
): Promise<ScanState> {
  const obsResult = await readPages(input, "market_rate_observations", {
    select: OBSERVATION_COLUMNS.join(","),
    batch_id: "in.(" + (rootRow.id as string) + ")",
    order: "id.asc",
  });

  const candidate = tryQualifyRoot(rootRow, obsResult.rows, input.date);
  if (candidate === null) return state;

  if (
    state.bestCandidate === null ||
    compareCandidates(candidate, state.bestCandidate) < 0
  ) {
    return {
      bestCandidate: candidate,
      bestRootRow: rootRow,
      bestObservations: obsResult.rows,
      bestMinTime: Math.min(
        Date.parse(candidate.metalAt),
        Date.parse(candidate.currencyAt)
      ),
      stopped: false,
    };
  }

  return state;
}

function serializeWinningRows(state: ScanState): RemoteHistoricalRateRows {
  const roots = state.bestRootRow ? [state.bestRootRow] : [];
  const observations = state.bestObservations;
  return {
    rawRootResponseText:
      "[" + roots.map((root) => stringify(root)).join(",") + "]",
    rawObservationResponseText:
      "[" + observations.map((obs) => stringify(obs)).join(",") + "]",
  };
}

async function readPage(
  input: ReadRemoteHistoricalRatesInput,
  table: RemoteTable,
  params: Readonly<Record<string, string>>
): Promise<{
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}> {
  input.signal.throwIfAborted();
  const url = new URL("/rest/v1/" + table, input.supabaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
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
  if (!Array.isArray(page) || !raw.startsWith("[") || !raw.endsWith("]")) {
    throw new Error("invalid_remote_rate_rows");
  }
  const rows: Readonly<Record<string, unknown>>[] = [];
  for (const row of page) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error("invalid_remote_rate_rows");
    }
    rows.push(row as Record<string, unknown>);
  }
  return { rows };
}

async function readPages(
  input: ReadRemoteHistoricalRatesInput,
  table: RemoteTable,
  params: Readonly<Record<string, string>>
): Promise<{
  readonly rows: readonly Readonly<Record<string, unknown>>[];
}> {
  const rows: Readonly<Record<string, unknown>>[] = [];
  for (let offset = 0; ; offset += OBSERVATION_PAGE_SIZE) {
    input.signal.throwIfAborted();
    const pageResult = await readPage(input, table, {
      ...params,
      limit: String(OBSERVATION_PAGE_SIZE),
      offset: String(offset),
    });
    for (const row of pageResult.rows) {
      rows.push(row);
    }
    if (pageResult.rows.length < OBSERVATION_PAGE_SIZE) {
      return { rows };
    }
  }
}
