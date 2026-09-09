import { type Database } from "@nozbe/watermelondb";

import {
  observeSelectedMarketRateSnapshot,
  selectMarketRateSnapshot,
  type MarketRateObservationCandidate,
  type MarketRateRootCandidate,
} from "@/services/market-rate-snapshot-read-model-service";
import {
  completeFixtureA,
  completeFixtureBOnTopOfA,
  createObservationsA,
  createObservationsB,
  createRootA,
  createRootB,
  crossBatchRepairFixture,
  delayedOlderCompleteZ,
  divergentWideRootFixtureA,
  duplicateInstrumentFixtureB,
  newerIncompleteFixtureB,
  nullProviderTimeFixtureA,
  removeObservationByInstrument,
  SNAPSHOT_A_ID,
  SNAPSHOT_B_ID,
  sourceInvalidFixtureB,
} from "../fixtures/market-rate-snapshot";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

type Row = Record<string, unknown>;

function toRoots(
  roots: readonly { readonly id: string; readonly createdAt: Date }[]
): readonly MarketRateRootCandidate[] {
  return roots as readonly MarketRateRootCandidate[];
}

function toObservations(
  rows: readonly {
    id: string;
    batchId: string;
    createdAt: Date;
    instrumentCode: string;
    valueDecimal: string | null;
    unit: string;
    orientation: string;
    providerObservedAt: Date | null;
    source: string | null;
    quality: string;
  }[]
): readonly MarketRateObservationCandidate[] {
  return rows as unknown as readonly MarketRateObservationCandidate[];
}

function createFakeDatabase(
  roots: readonly Row[],
  observations: readonly Row[]
): Database {
  const collections: Record<string, readonly Row[]> = {
    market_rates: roots,
    market_rate_observations: observations,
  };
  return {
    get: (table: string) => ({
      query: () => ({
        observe: () => ({
          subscribe: (observer: {
            next: (rows: readonly Row[]) => void;
          }) => {
            observer.next(collections[table] ?? []);
            return { unsubscribe: (): void => undefined };
          },
        }),
        fetch: async () => collections[table] ?? [],
      }),
    }),
  } as unknown as Database;
}

describe("selectMarketRateSnapshot", () => {
  it("returns null when no complete snapshot exists", () => {
    expect(
      selectMarketRateSnapshot([], [], NOW_MS)
    ).toBeNull();
    const incomplete = newerIncompleteFixtureB();
    expect(
      selectMarketRateSnapshot(
        toRoots(incomplete.roots),
        toObservations(incomplete.observations),
        NOW_MS
      )?.snapshotId ?? null
    ).toBe(SNAPSHOT_A_ID);
  });

  it("selects a complete snapshot A", () => {
    const fixture = completeFixtureA();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
    expect(selected?.ratesByInstrument.get("metal:GOLD")?.valueDecimal).toBe(
      "3738.74000000"
    );
    expect(selected?.trust.gold.state).not.toBe("missing");
    expect(selected?.trust.currencies.get("EGP")?.valueDecimal).toBe(
      "0.0210523309"
    );
  });

  it("keeps A current when a newer B is incomplete", () => {
    const fixture = newerIncompleteFixtureB();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("promotes B once B is complete and valid", () => {
    const fixture = completeFixtureBOnTopOfA();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_B_ID);
  });

  it("never repairs an incomplete candidate from another batch", () => {
    const fixture = crossBatchRepairFixture();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("rejects duplicate instruments within a candidate", () => {
    const fixture = duplicateInstrumentFixtureB();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("rejects a candidate with a blank source", () => {
    const fixture = sourceInvalidFixtureB();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("rejects a candidate with an invalid quality or value", () => {
    const broken = createObservationsB().map((row) =>
      row.instrumentCode === "metal:SILVER"
        ? { ...row, quality: "unknown" }
        : row
    );
    const selected = selectMarketRateSnapshot(
      toRoots([createRootA(), createRootB()]),
      toObservations([...createObservationsA(), ...broken]),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("rejects a conflicted duplicate root identity", () => {
    const conflictingRoot = Object.freeze({
      ...createRootB(),
      createdAt: new Date(createRootB().createdAt.getTime() + 1000),
    });
    const fixture = completeFixtureBOnTopOfA();
    const selected = selectMarketRateSnapshot(
      toRoots([...fixture.roots, conflictingRoot]),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("does not regress to a delayed older complete Z", () => {
    const fixture = delayedOlderCompleteZ();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_B_ID);
  });

  it("classifies null provider time as unknown without substituting capture time", () => {
    const fixture = nullProviderTimeFixtureA();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
    expect(selected?.trust.gold.state).toBe("unknown");
    expect(selected?.trust.gold.providerObservedAt).toBeNull();
    expect(selected?.trust.currencies.get("EGP")?.state).toBe("unknown");
  });

  it("drops a selected candidate when required evidence is removed", () => {
    const full = completeFixtureBOnTopOfA();
    const strippedB = [
      ...full.observations.filter(
        (row) =>
          !(row.batchId === SNAPSHOT_B_ID && row.instrumentCode === "currency:EGP")
      ),
    ];
    const afterRemoval = selectMarketRateSnapshot(
      toRoots(full.roots),
      toObservations(strippedB),
      NOW_MS
    );
    expect(afterRemoval?.snapshotId).toBe(SNAPSHOT_A_ID);

    const noComplete = selectMarketRateSnapshot(
      toRoots(full.roots),
      toObservations(
        strippedB.filter(
          (row) =>
            !(row.batchId === SNAPSHOT_A_ID && row.instrumentCode === "currency:EGP")
        )
      ),
      NOW_MS
    );
    expect(noComplete).toBeNull();
  });

  it("returns null when no complete candidate remains", () => {
    const a = completeFixtureA();
    const stripped = removeObservationByInstrument(
      a.observations,
      "metal:SILVER"
    );
    expect(
      selectMarketRateSnapshot(
        toRoots(a.roots),
        toObservations(stripped),
        NOW_MS
      )
    ).toBeNull();
  });

  it("exports exact observation decimals regardless of wide root numbers", () => {
    const fixture = divergentWideRootFixtureA();
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations(fixture.observations),
      NOW_MS
    );

    expect(selected?.ratesByInstrument.get("metal:GOLD")?.valueDecimal).toBe(
      "3738.74000000"
    );
    expect(selected?.ratesByInstrument.get("currency:USD")?.valueDecimal).toBe(
      "1"
    );
  });

  it("ignores observations from batches outside the candidate roots", () => {
    const fixture = completeFixtureA();
    const stray = createObservationsB().map((row) => ({
      ...row,
      batchId: "ffffffff-0000-4000-8000-ffffffffffff",
    }));
    const selected = selectMarketRateSnapshot(
      toRoots(fixture.roots),
      toObservations([...fixture.observations, ...stray]),
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
    expect(selected?.ratesByInstrument.get("metal:GOLD")?.valueDecimal).toBe(
      "3738.74000000"
    );
  });
});

describe("observeSelectedMarketRateSnapshot", () => {
  it("emits the selected snapshot from cached Watermelon state", async () => {
    const fixture = completeFixtureA();
    const stream = observeSelectedMarketRateSnapshot(
      createFakeDatabase(fixture.roots as unknown as Row[], fixture.observations as unknown as Row[]),
      () => NOW_MS
    );

    const emitted: unknown[] = [];
    const subscription = stream.subscribe({
      next: (value): void => {
        emitted.push(value);
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    subscription.unsubscribe();
    expect(emitted.length).toBeGreaterThanOrEqual(1);
    const latest = emitted[emitted.length - 1] as { snapshotId: string };
    expect(latest.snapshotId).toBe(SNAPSHOT_A_ID);
  });
});
