import assert from "node:assert/strict";
import test from "node:test";
import { readRemoteHistoricalRates } from "./remote-reader.ts";
import {
  DATE,
  BATCH,
  FETCHED_AT,
  root,
  atom,
  atoms,
  raw,
} from "./remote-fixture.test-data.ts";
import { buildHistoricalSnapshotRateRecord } from "../_shared/historical-metal-rate-contract-remote.ts";

test("reads raw numeric JSON by provider timestamp bounds and same batch ids", async () => {
  const urls: URL[] = [];
  const result = await readRemoteHistoricalRates({
    date: DATE,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "server-key",
    fetch: async (url, init): Promise<Response> => {
      urls.push(new URL(url));
      assert.equal(init.signal?.aborted, false);
      assert.equal(new Headers(init.headers).get("apikey"), "server-key");
      const response = new Response(
        raw(urls.length === 1 ? [root()] : atoms())
      );
      Object.defineProperty(response, "json", {
        value: (): never => {
          throw new Error("must preserve raw numeric tokens");
        },
      });
      return response;
    },
  });
  assert.ok(result.rawRootResponseText.includes("100.123456789012345678901"));
  assert.ok(result.rawObservationResponseText.includes("0.020000000000000001"));
  assert.equal(urls[0].pathname, "/rest/v1/market_rates");
  assert.ok(urls[0].searchParams.get("and")?.includes("timestamp_metal.gte."));
  assert.ok(
    urls[0].searchParams.get("and")?.includes("timestamp_currency.gte.")
  );
  assert.equal(
    urls[0].searchParams.get("order"),
    "timestamp_metal.desc.nullslast,timestamp_currency.desc.nullslast,created_at.desc.nullslast,id.desc"
  );
  assert.equal(urls[1].pathname, "/rest/v1/market_rate_observations");
  assert.ok(urls[1].searchParams.get("batch_id")?.startsWith("in.("));
});

test("rejects invalid rootPageSize values before making network calls", async () => {
  for (const badPageSize of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
    let called = false;
    await assert.rejects(
      readRemoteHistoricalRates({
        date: DATE,
        rootPageSize: badPageSize,
        signal: new AbortController().signal,
        supabaseUrl: "https://project.test",
        serviceRoleKey: "key",
        fetch: async (): Promise<Response> => {
          called = true;
          return new Response("[]");
        },
      }),
      (err: unknown) =>
        err instanceof Error && err.message === "invalid_root_page_size"
    );
    assert.equal(called, false);
  }
});

test("many roots older than winner are not all fetched and stop early", async () => {
  // Winner at 15:00 with matching 15:00 provider timestamps on both root legs and all atoms
  const winnerId = "018f0c7a-1234-7abc-8def-000000000000";
  const winnerTime = "2026-10-10T15:00:00.000Z";
  const winnerRoot = root({
    id: winnerId,
    timestamp_metal: winnerTime,
    timestamp_currency: winnerTime,
  });
  const olderRoots = Array.from({ length: 500 }, (_, index) => {
    const mins = String(59 - (index % 60)).padStart(2, "0");
    const hours = String(14 - Math.floor(index / 60)).padStart(2, "0");
    const ts = `2026-10-10T${hours}:${mins}:00.000Z`;
    return root({
      id: "018f0c7a-1234-7abc-8def-" + String(index + 1).padStart(12, "0"),
      timestamp_metal: ts,
      timestamp_currency: ts,
    });
  });
  const allRoots = [winnerRoot, ...olderRoots];

  const rootOffsets: string[] = [];
  let observationCalls = 0;
  const observedBatchIds: string[] = [];

  const result = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 100,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset"));
        rootOffsets.push(String(offset));
        return new Response(raw(allRoots.slice(offset, offset + 100)));
      }
      observationCalls++;
      const batchParam = request.searchParams.get("batch_id") ?? "";
      observedBatchIds.push(batchParam);
      return new Response(
        raw(atoms(winnerId, { provider_observed_at: winnerTime }))
      );
    },
  });

  // Only the first page of roots (offset 0) was read; offsets 100, 200, 300, 400, 500 were NOT fetched!
  assert.deepEqual(rootOffsets, ["0"]);
  // Observations were fetched ONLY for the winner snapshot (1 observation query)!
  assert.equal(observationCalls, 1);
  assert.ok(observedBatchIds[0].includes(winnerId));

  // The record builds correctly with the winner
  const built = buildHistoricalSnapshotRateRecord({
    ...result,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(built.snapshotId, winnerId);
  assert.equal(built.metalProviderObservedAt, winnerTime);
  assert.equal(built.currencyProviderObservedAt, winnerTime);
});

test("newer invalid snapshot is skipped without shadowing older complete valid snapshot", async () => {
  const newerInvalidId = "018f0c7a-1234-7abc-8def-000000000099";
  const olderValidId = "018f0c7a-1234-7abc-8def-000000000001";
  const muchOlderId = "018f0c7a-1234-7abc-8def-000000000002";

  const newerTime = "2026-10-10T18:00:00.000Z";
  const olderTime = "2026-10-10T12:00:00.000Z";
  const muchOlderTime = "2026-10-10T06:00:00.000Z";

  const newerInvalidRoot = root({
    id: newerInvalidId,
    timestamp_metal: newerTime,
    timestamp_currency: newerTime,
  });
  const olderValidRoot = root({
    id: olderValidId,
    timestamp_metal: olderTime,
    timestamp_currency: olderTime,
  });
  const muchOlderRoot = root({
    id: muchOlderId,
    timestamp_metal: muchOlderTime,
    timestamp_currency: muchOlderTime,
  });

  const rootsInDb = [newerInvalidRoot, olderValidRoot, muchOlderRoot];
  const observationQueries: string[] = [];

  const result = await readRemoteHistoricalRates({
    date: DATE,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        return new Response(raw(rootsInDb));
      }
      const batchParam = request.searchParams.get("batch_id") ?? "";
      observationQueries.push(batchParam);
      if (batchParam.includes(newerInvalidId)) {
        // Return 18:00 atoms for all, except 1 deliberately bad quality atom
        return new Response(
          raw([
            atom("metal:GOLD", {
              batch_id: newerInvalidId,
              provider_observed_at: newerTime,
              quality: "invalid",
            }),
            ...atoms(newerInvalidId, {
              provider_observed_at: newerTime,
            }).slice(1),
          ])
        );
      }
      return new Response(
        raw(atoms(olderValidId, { provider_observed_at: olderTime }))
      );
    },
  });

  // Observations were queried for newerInvalidId, then olderValidId.
  // muchOlderRoot was skipped because its metal timestamp (06:00) < min_time (12:00) of olderValidId!
  assert.equal(observationQueries.length, 2);
  assert.ok(observationQueries[0].includes(newerInvalidId));
  assert.ok(observationQueries[1].includes(olderValidId));

  const built = buildHistoricalSnapshotRateRecord({
    ...result,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  // Selected winner is the older valid batch, not shadowed by the newer invalid
  assert.equal(built.snapshotId, olderValidId);
  assert.equal(built.metalProviderObservedAt, olderTime);
});

test("divergent provider times select same winner as exhaustive parser", async () => {
  // Root A: metal=20:00, currency=08:00 => min=08:00
  // Root B: metal=16:00, currency=16:00 => min=16:00 (beats Root A!)
  // Root C: metal=10:00, currency=10:00 => min=10:00 (worse than Root B, should stop early)
  const idA = "018f0c7a-1234-7abc-8def-00000000000a";
  const idB = "018f0c7a-1234-7abc-8def-00000000000b";
  const idC = "018f0c7a-1234-7abc-8def-00000000000c";

  const rootA = root({
    id: idA,
    timestamp_metal: "2026-10-10T20:00:00.000Z",
    timestamp_currency: "2026-10-10T08:00:00.000Z",
  });
  const rootB = root({
    id: idB,
    timestamp_metal: "2026-10-10T16:00:00.000Z",
    timestamp_currency: "2026-10-10T16:00:00.000Z",
  });
  const rootC = root({
    id: idC,
    timestamp_metal: "2026-10-10T10:00:00.000Z",
    timestamp_currency: "2026-10-10T10:00:00.000Z",
  });

  const rootsInDb = [rootA, rootB, rootC];
  const observationQueries: string[] = [];

  const result = await readRemoteHistoricalRates({
    date: DATE,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        return new Response(raw(rootsInDb));
      }
      const batchParam = request.searchParams.get("batch_id") ?? "";
      observationQueries.push(batchParam);
      if (batchParam.includes(idA)) {
        return new Response(
          raw(
            atoms(idA, {
              provider_observed_at: "2026-10-10T08:00:00.000Z",
            }).map((at) =>
              at.instrument_code === "metal:GOLD" ||
              at.instrument_code === "metal:SILVER"
                ? { ...at, provider_observed_at: "2026-10-10T20:00:00.000Z" }
                : at
            )
          )
        );
      }
      if (batchParam.includes(idB)) {
        return new Response(
          raw(atoms(idB, { provider_observed_at: "2026-10-10T16:00:00.000Z" }))
        );
      }
      return new Response(
        raw(atoms(idC, { provider_observed_at: "2026-10-10T10:00:00.000Z" }))
      );
    },
  });

  // Root A was evaluated (min=08:00).
  // Root B was evaluated because its metal (16:00) >= min_time of A (08:00).
  // Root B qualified with min=16:00, which beats Root A!
  // Root C has metal=10:00 < min_time of B (16:00), so Root C was stopped and never queried!
  assert.equal(observationQueries.length, 2);
  assert.ok(observationQueries[0].includes(idA));
  assert.ok(observationQueries[1].includes(idB));

  const built = buildHistoricalSnapshotRateRecord({
    ...result,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  // Root B is the selected winner
  assert.equal(built.snapshotId, idB);
  assert.equal(built.metalProviderObservedAt, "2026-10-10T16:00:00.000Z");
  assert.equal(built.currencyProviderObservedAt, "2026-10-10T16:00:00.000Z");
});

test("same-time ties resolve deterministically by max(provider), then created_at, then id across pages", async () => {
  // Candidate 1: min 12:00, max 14:00 (beats equal min with lower max)
  const idMaxWinner = "018f0c7a-1234-7abc-8def-000000000010";
  // Candidate 2 & 3: equal min 12:00, equal max 12:00, differing created_at
  const idNewerCreated = "018f0c7a-1234-7abc-8def-000000000020";
  const idOlderCreated = "018f0c7a-1234-7abc-8def-000000000030";
  // Candidate 4 & 5: equal min 12:00, equal max 12:00, equal created_at, differing UUIDs (idZ > idA)
  const idZ = "018f0c7a-1234-7abc-8def-00000000000f";
  const idA = "018f0c7a-1234-7abc-8def-00000000000a";

  const rootMaxWinner = root({
    id: idMaxWinner,
    timestamp_metal: "2026-10-10T14:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    created_at: "2026-10-11T12:00:00.000Z",
  });
  const rootNewerCreated = root({
    id: idNewerCreated,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    created_at: "2026-10-11T16:00:00.000Z",
  });
  const rootOlderCreated = root({
    id: idOlderCreated,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    created_at: "2026-10-11T10:00:00.000Z",
  });
  const rootIdZ = root({
    id: idZ,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    created_at: "2026-10-11T08:00:00.000Z",
  });
  const rootIdA = root({
    id: idA,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    created_at: "2026-10-11T08:00:00.000Z",
  });

  // Verify ID tiebreak between idZ and idA alone across pages (pageSize 1)
  const idTieRoots = [rootIdZ, rootIdA];
  const rootOffsets: string[] = [];

  const resultIdTie = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 1,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset"));
        rootOffsets.push(String(offset));
        if (offset < idTieRoots.length) {
          return new Response(raw([idTieRoots[offset]]));
        }
        return new Response("[]");
      }
      const batchParam = request.searchParams.get("batch_id") ?? "";
      const targetId = batchParam.includes(idZ) ? idZ : idA;
      return new Response(
        raw(
          atoms(targetId, { provider_observed_at: "2026-10-10T12:00:00.000Z" })
        )
      );
    },
  });

  // Pages read: offset 0 (rootIdZ), offset 1 (rootIdA), offset 2 (empty -> terminates)
  assert.deepEqual(rootOffsets, ["0", "1", "2"]);
  const builtIdTie = buildHistoricalSnapshotRateRecord({
    ...resultIdTie,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(builtIdTie.snapshotId, idZ);

  // Now verify max(provider) winner beats lower max with same min
  const resultMaxWinner = await readRemoteHistoricalRates({
    date: DATE,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        return new Response(
          raw([rootMaxWinner, rootNewerCreated, rootOlderCreated])
        );
      }
      const batchParam = request.searchParams.get("batch_id") ?? "";
      if (batchParam.includes(idMaxWinner)) {
        return new Response(
          raw(
            atoms(idMaxWinner, {
              provider_observed_at: "2026-10-10T12:00:00.000Z",
            }).map((at) =>
              at.instrument_code === "metal:GOLD" ||
              at.instrument_code === "metal:SILVER"
                ? { ...at, provider_observed_at: "2026-10-10T14:00:00.000Z" }
                : at
            )
          )
        );
      }
      return new Response(
        raw(
          atoms(
            batchParam.includes(idNewerCreated)
              ? idNewerCreated
              : idOlderCreated,
            { provider_observed_at: "2026-10-10T12:00:00.000Z" }
          )
        )
      );
    },
  });
  const builtMax = buildHistoricalSnapshotRateRecord({
    ...resultMaxWinner,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(builtMax.snapshotId, idMaxWinner);
});

test("overlapping page results do not duplicate atoms and serialize exactly 38 atoms", async () => {
  // Concurrent insertions between paginated REST reads can cause the same winning root
  // to be returned across multiple page offsets.
  // Winning batch: complete 38 atoms, metal 16:00, currency 14:00
  // Offset 0: winning root
  // Offset 1: winning root repeated (due to pagination shift)
  // Offset 2: older root (metal 13:00 < min 14:00 -> early stop)
  const winnerId = "018f0c7a-1234-7abc-8def-000000000077";
  const winnerRoot = root({
    id: winnerId,
    timestamp_metal: "2026-10-10T16:00:00.000Z",
    timestamp_currency: "2026-10-10T14:00:00.000Z",
  });
  const olderRoot = root({
    id: "018f0c7a-1234-7abc-8def-000000000078",
    timestamp_metal: "2026-10-10T13:00:00.000Z",
    timestamp_currency: "2026-10-10T13:00:00.000Z",
  });

  const rootOffsets: string[] = [];
  const result = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 1,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset"));
        rootOffsets.push(String(offset));
        if (offset === 0) return new Response(raw([winnerRoot]));
        if (offset === 1) return new Response(raw([winnerRoot]));
        if (offset === 2) return new Response(raw([olderRoot]));
        return new Response("[]");
      }
      return new Response(
        raw(
          atoms(winnerId, {
            provider_observed_at: "2026-10-10T14:00:00.000Z",
          }).map((at) =>
            at.instrument_code === "metal:GOLD" ||
            at.instrument_code === "metal:SILVER"
              ? { ...at, provider_observed_at: "2026-10-10T16:00:00.000Z" }
              : at
          )
        )
      );
    },
  });

  // Offsets traversed: 0 (winner), 1 (winner repeated), 2 (older -> metal 13:00 < min 14:00 -> stop)
  assert.deepEqual(rootOffsets, ["0", "1", "2"]);

  // Serialized raw roots: contains exactly 1 root object, not 2
  const parsedRoots = JSON.parse(result.rawRootResponseText);
  assert.equal(parsedRoots.length, 1);
  assert.equal(parsedRoots[0].id, winnerId);

  // Serialized raw observations: contains exactly 38 atoms, NOT 76!
  const parsedAtoms = JSON.parse(result.rawObservationResponseText);
  assert.equal(parsedAtoms.length, 38);

  // Still qualifies cleanly and builds winner
  const built = buildHistoricalSnapshotRateRecord({
    ...result,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(built.snapshotId, winnerId);
  assert.equal(built.metalProviderObservedAt, "2026-10-10T16:00:00.000Z");
  assert.equal(built.currencyProviderObservedAt, "2026-10-10T14:00:00.000Z");
});

test("malformed provider metadata row is skipped without triggering false early-stop", async () => {
  // Winner at 12:00
  // Next row has malformed timestamp_metal (e.g. "invalid-date" or null)
  // It must NOT trigger early-stop; instead it is skipped and subsequent valid row is evaluated
  const winnerId = "018f0c7a-1234-7abc-8def-000000000088";
  const winnerRoot = root({
    id: winnerId,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
  });
  const malformedRoot = root({
    id: "018f0c7a-1234-7abc-8def-000000000089",
    timestamp_metal: "not-a-valid-timestamp",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
  });
  const nextValidOlderRoot = root({
    id: "018f0c7a-1234-7abc-8def-000000000090",
    timestamp_metal: "2026-10-10T10:00:00.000Z",
    timestamp_currency: "2026-10-10T10:00:00.000Z",
  });

  const rootsList = [winnerRoot, malformedRoot, nextValidOlderRoot];
  const rootOffsets: string[] = [];

  const result = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 1,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset"));
        rootOffsets.push(String(offset));
        if (offset < rootsList.length) {
          return new Response(raw([rootsList[offset]]));
        }
        return new Response("[]");
      }
      return new Response(
        raw(
          atoms(winnerId, {
            provider_observed_at: "2026-10-10T12:00:00.000Z",
          })
        )
      );
    },
  });

  // Offset 0: winnerRoot (qualifies with min 12:00)
  // Offset 1: malformedRoot (does NOT early-stop because NaN is not finite; skipped by Cairo date check)
  // Offset 2: nextValidOlderRoot (metal 10:00 is finite and strictly < 12:00 -> early-stop triggers!)
  assert.deepEqual(rootOffsets, ["0", "1", "2"]);

  const built = buildHistoricalSnapshotRateRecord({
    ...result,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(built.snapshotId, winnerId);
});

test("pagination and Cairo DST window envelope boundaries", async () => {
  // Page 1 contains roots from 2026-10-11 02:00 (which in Cairo is Oct 11, so ignored for Oct 10)
  // Page 2 contains the first valid root on 2026-10-10 at 20:00
  // Page 3 has older root at 10:00 strictly below winner min (20:00), triggering early-stop
  const page1Root = root({
    id: "018f0c7a-1234-7abc-8def-000000000011",
    timestamp_metal: "2026-10-11T02:00:00.000Z",
    timestamp_currency: "2026-10-11T02:00:00.000Z",
  });
  const page2Root = root({
    id: "018f0c7a-1234-7abc-8def-000000000010",
    timestamp_metal: "2026-10-10T20:00:00.000Z",
    timestamp_currency: "2026-10-10T20:00:00.000Z",
  });
  const page3Root = root({
    id: "018f0c7a-1234-7abc-8def-000000000009",
    timestamp_metal: "2026-10-10T10:00:00.000Z",
    timestamp_currency: "2026-10-10T10:00:00.000Z",
  });

  const rootsList = [page1Root, page2Root, page3Root];
  const rootOffsets: string[] = [];
  const observationQueries: string[] = [];

  const result = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 1, // 1 root per page
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset"));
        rootOffsets.push(String(offset));
        if (offset < rootsList.length) {
          return new Response(raw([rootsList[offset]]));
        }
        return new Response("[]");
      }
      const batchParam = request.searchParams.get("batch_id") ?? "";
      observationQueries.push(batchParam);
      return new Response(
        raw(
          atoms(page2Root.id as string, {
            provider_observed_at: "2026-10-10T20:00:00.000Z",
          })
        )
      );
    },
  });

  // Offsets requested:
  // - 0: page1Root (evaluated, Cairo Oct 11, ignored, no winner yet)
  // - 1: page2Root (evaluated, qualifies as winner with min=20:00)
  // - 2: page3Root (metal 10:00 < min 20:00 -> early stop triggers!)
  assert.deepEqual(rootOffsets, ["0", "1", "2"]);
  assert.equal(observationQueries.length, 1);
  assert.ok(observationQueries[0].includes(page2Root.id as string));

  const built = buildHistoricalSnapshotRateRecord({
    ...result,
    requestedDate: DATE,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(built.snapshotId, page2Root.id);
  assert.equal(built.metalProviderObservedAt, "2026-10-10T20:00:00.000Z");
});

test("DST boundaries: winter UTC+2 and summer UTC+3 boundaries on exact requested Cairo date", async () => {
  // Case 1: Winter date (standard time UTC+2): 2026-01-10
  // Cairo midnight is 2026-01-09T22:00:00.000Z.
  // Earliest provider timestamp on that Cairo day is 2026-01-09T22:00:00.000Z.
  const winterDate = "2026-01-10";
  const winterRootId = "018f0c7a-1234-7abc-8def-0000000000b1";
  const winterBoundaryTime = "2026-01-09T22:00:00.000Z";
  const winterRoot = root({
    id: winterRootId,
    timestamp_metal: winterBoundaryTime,
    timestamp_currency: winterBoundaryTime,
  });

  const winterResult = await readRemoteHistoricalRates({
    date: winterDate,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        return new Response(raw([winterRoot]));
      }
      return new Response(
        raw(
          atoms(winterRootId, {
            provider_observed_at: winterBoundaryTime,
          })
        )
      );
    },
  });

  const winterBuilt = buildHistoricalSnapshotRateRecord({
    ...winterResult,
    requestedDate: winterDate,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(winterBuilt.snapshotId, winterRootId);
  assert.equal(winterBuilt.metalProviderObservedAt, winterBoundaryTime);

  // Case 2: Summer date (daylight saving time UTC+3): 2026-10-10
  // Cairo midnight is 2026-10-09T21:00:00.000Z.
  // Earliest provider timestamp on that Cairo day is 2026-10-09T21:00:00.000Z.
  const summerDate = "2026-10-10";
  const summerRootId = "018f0c7a-1234-7abc-8def-0000000000c1";
  const summerBoundaryTime = "2026-10-09T21:00:00.000Z";
  const summerRoot = root({
    id: summerRootId,
    timestamp_metal: summerBoundaryTime,
    timestamp_currency: summerBoundaryTime,
  });

  const summerResult = await readRemoteHistoricalRates({
    date: summerDate,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        return new Response(raw([summerRoot]));
      }
      return new Response(
        raw(
          atoms(summerRootId, {
            provider_observed_at: summerBoundaryTime,
          })
        )
      );
    },
  });

  const summerBuilt = buildHistoricalSnapshotRateRecord({
    ...summerResult,
    requestedDate: summerDate,
    fetchedAt: FETCHED_AT,
    responseDigest:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  });
  assert.equal(summerBuilt.snapshotId, summerRootId);
  assert.equal(summerBuilt.metalProviderObservedAt, summerBoundaryTime);
});

test("partial observation batch never falls back to legacy columns", async () => {
  const partialId = "018f0c7a-1234-7abc-8def-000000000005";
  const partialRoot = root({
    id: partialId,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    gold_usd_per_gram: "100.0",
    silver_usd_per_gram: "1.0",
    egp_usd: "0.02",
  });

  const result = await readRemoteHistoricalRates({
    date: DATE,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        return new Response(raw([partialRoot]));
      }
      // Return partial atoms (only 5 out of 38)
      return new Response(raw(atoms(partialId).slice(0, 5)));
    },
  });

  // Because it was partial, buildHistoricalSnapshotRateRecord MUST reject it as date_unavailable
  // and MUST NOT fall back to legacy columns
  assert.throws(
    () =>
      buildHistoricalSnapshotRateRecord({
        ...result,
        requestedDate: DATE,
        fetchedAt: FETCHED_AT,
        responseDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "date_unavailable"
  );
});

test("request abort cancels the in-flight remote read", async () => {
  const controller = new AbortController();
  const promise = readRemoteHistoricalRates({
    date: DATE,
    signal: controller.signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (_url, init): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        );
        controller.abort();
      }),
  });
  await assert.rejects(promise);
});

test("remote failure/invalid JSON and abort are not successful empty history", async () => {
  for (const response of [
    new Response("private error", { status: 500 }),
    new Response("{}"),
  ]) {
    await assert.rejects(
      readRemoteHistoricalRates({
        date: DATE,
        signal: new AbortController().signal,
        supabaseUrl: "https://project.test",
        serviceRoleKey: "key",
        fetch: async (): Promise<Response> => response,
      })
    );
  }
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    readRemoteHistoricalRates({
      date: DATE,
      signal: controller.signal,
      supabaseUrl: "https://project.test",
      serviceRoleKey: "key",
      fetch: async (): Promise<Response> => {
        calls++;
        return new Response("[]");
      },
    })
  );
  assert.equal(calls, 0);
});

test(">500 roots with identical provider times and descending createdAt/id fetch observations exactly once", async () => {
  const winnerId = "018f0c7a-1234-7abc-8def-000000000000";
  const winnerTime = "2026-10-10T12:00:00.000Z";
  const winnerRoot = root({
    id: winnerId,
    timestamp_metal: winnerTime,
    timestamp_currency: winnerTime,
    created_at: "2026-10-10T12:05:00.000Z",
  });

  // 550 older roots with IDENTICAL provider timestamps but older created_at
  const identicalOlderRoots = Array.from({ length: 550 }, (_, index) => {
    return root({
      id: "018f0c7a-1234-7abc-8def-" + String(index + 1).padStart(12, "0"),
      timestamp_metal: winnerTime,
      timestamp_currency: winnerTime,
      created_at: new Date(
        Date.parse("2026-10-10T12:04:00.000Z") - index * 1000
      ).toISOString(),
    });
  });

  const allRoots = [winnerRoot, ...identicalOlderRoots];
  let observationCalls = 0;
  const observedBatchIds: string[] = [];

  const result = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 100,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset") ?? "0");
        const limit = Number(request.searchParams.get("limit") ?? "100");
        const page = allRoots.slice(offset, offset + limit);
        return new Response(raw(page));
      }
      if (request.pathname.endsWith("market_rate_observations")) {
        observationCalls++;
        const batchParam = request.searchParams.get("batch_id");
        if (batchParam) observedBatchIds.push(batchParam);
        return new Response(raw(atoms(winnerId)));
      }
      return new Response("[]");
    },
  });

  // Exactly ONE observation read performed because the first root won and all subsequent 550 roots cannot outrank it
  assert.equal(observationCalls, 1);
  assert.deepEqual(observedBatchIds, ["in.(" + winnerId + ")"]);
  assert.ok(result.rawRootResponseText.includes(winnerId));
});

test("newer incomplete root among same provider times causes two observation reads then skips remaining", async () => {
  const incompleteId = "018f0c7a-1234-7abc-8def-000000000001";
  const validWinnerId = "018f0c7a-1234-7abc-8def-000000000002";
  const providerTime = "2026-10-10T12:00:00.000Z";

  // Incomplete root is newer
  const incompleteRoot = root({
    id: incompleteId,
    timestamp_metal: providerTime,
    timestamp_currency: providerTime,
    created_at: "2026-10-10T12:10:00.000Z",
  });

  // Valid winner is older
  const validWinnerRoot = root({
    id: validWinnerId,
    timestamp_metal: providerTime,
    timestamp_currency: providerTime,
    created_at: "2026-10-10T12:05:00.000Z",
  });

  // 100 dominated older roots
  const dominatedRoots = Array.from({ length: 100 }, (_, index) => {
    return root({
      id: "018f0c7a-1234-7abc-8def-" + String(index + 3).padStart(12, "0"),
      timestamp_metal: providerTime,
      timestamp_currency: providerTime,
      created_at: new Date(
        Date.parse("2026-10-10T12:04:00.000Z") - index * 1000
      ).toISOString(),
    });
  });

  const allRoots = [incompleteRoot, validWinnerRoot, ...dominatedRoots];
  let observationCalls = 0;
  const observedBatchIds: string[] = [];

  const result = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 50,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        const offset = Number(request.searchParams.get("offset") ?? "0");
        const limit = Number(request.searchParams.get("limit") ?? "50");
        return new Response(raw(allRoots.slice(offset, offset + limit)));
      }
      if (request.pathname.endsWith("market_rate_observations")) {
        observationCalls++;
        const batchParam = request.searchParams.get("batch_id");
        if (batchParam) observedBatchIds.push(batchParam);
        if (batchParam?.includes(incompleteId)) {
          // Return only partial observations (invalid)
          return new Response(raw(atoms(incompleteId).slice(0, 5)));
        }
        // Return full valid observations for validWinnerId
        return new Response(raw(atoms(validWinnerId)));
      }
      return new Response("[]");
    },
  });

  // Exactly TWO observation reads (incompleteId first, then validWinnerId, then zero for remaining 100 dominated)
  assert.equal(observationCalls, 2);
  assert.deepEqual(observedBatchIds, [
    "in.(" + incompleteId + ")",
    "in.(" + validWinnerId + ")",
  ]);
  assert.ok(result.rawRootResponseText.includes(validWinnerId));
});

test("later SQL ordered root with smaller metal timestamp but larger MIN provider timestamp still wins", async () => {
  // Candidate A (ordered first by SQL because timestamp_metal is higher: 14:00)
  // metal: 14:00, currency: 10:00 -> min(metal, currency) is 10:00
  const candidateAId = "018f0c7a-1234-7abc-8def-000000000001";
  const rootA = root({
    id: candidateAId,
    timestamp_metal: "2026-10-10T14:00:00.000Z",
    timestamp_currency: "2026-10-10T10:00:00.000Z",
    created_at: "2026-10-10T14:05:00.000Z",
  });

  // Candidate B (ordered later by SQL because timestamp_metal is 12:00 < 14:00)
  // metal: 12:00, currency: 12:00 -> min(metal, currency) is 12:00 > 10:00!
  // Candidate B MUST outrank Candidate A and win. Early break must NOT prevent reading B.
  const candidateBId = "018f0c7a-1234-7abc-8def-000000000002";
  const rootB = root({
    id: candidateBId,
    timestamp_metal: "2026-10-10T12:00:00.000Z",
    timestamp_currency: "2026-10-10T12:00:00.000Z",
    created_at: "2026-10-10T12:05:00.000Z",
  });

  const roots = [rootA, rootB];
  let observationCalls = 0;

  const result = await readRemoteHistoricalRates({
    date: DATE,
    rootPageSize: 10,
    signal: new AbortController().signal,
    supabaseUrl: "https://project.test",
    serviceRoleKey: "key",
    fetch: async (url): Promise<Response> => {
      const request = new URL(url);
      if (request.pathname.endsWith("market_rates")) {
        return new Response(raw(roots));
      }
      if (request.pathname.endsWith("market_rate_observations")) {
        observationCalls++;
        const batchParam = request.searchParams.get("batch_id");
        if (batchParam?.includes(candidateAId)) {
          return new Response(raw(atoms(candidateAId)));
        }
        return new Response(raw(atoms(candidateBId)));
      }
      return new Response("[]");
    },
  });

  assert.equal(observationCalls, 2);
  assert.ok(result.rawRootResponseText.includes(candidateBId));
  assert.ok(!result.rawRootResponseText.includes(candidateAId));
});
