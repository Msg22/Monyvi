import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
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
  futureProviderTimeFixtureA,
  newerIncompleteFixtureB,
  nullProviderTimeFixtureA,
  removeObservationByInstrument,
  SNAPSHOT_A_ID,
  SNAPSHOT_B_ID,
  sourceInvalidFixtureB,
} from "../fixtures/market-rate-snapshot";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

describe("selectMarketRateSnapshot", () => {
  it("returns null when no complete snapshot exists", () => {
    expect(selectMarketRateSnapshot([], [], NOW_MS)).toBeNull();
    const incomplete = newerIncompleteFixtureB();
    expect(
      selectMarketRateSnapshot(
        incomplete.roots,
        incomplete.observations,
        NOW_MS
      )?.snapshotId ?? null
    ).toBe(SNAPSHOT_A_ID);
  });

  it("selects a complete snapshot A", () => {
    const fixture = completeFixtureA();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
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
      fixture.roots,
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("promotes B once B is complete and valid", () => {
    const fixture = completeFixtureBOnTopOfA();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_B_ID);
  });

  it("never repairs an incomplete candidate from another batch", () => {
    const fixture = crossBatchRepairFixture();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("rejects duplicate instruments within a candidate", () => {
    const fixture = duplicateInstrumentFixtureB();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("rejects a candidate with a blank source", () => {
    const fixture = sourceInvalidFixtureB();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
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
      [createRootA(), createRootB()],
      [...createObservationsA(), ...broken],
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("rejects a conflicted duplicate root identity", () => {
    const conflictingRoot = Object.freeze({
      ...createRootB(),
      createdAt: new Date(createRootB().createdAt.getTime() + 1_000),
    });
    const fixture = completeFixtureBOnTopOfA();
    const selected = selectMarketRateSnapshot(
      [...fixture.roots, conflictingRoot],
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
  });

  it("does not regress to a delayed older complete Z", () => {
    const fixture = delayedOlderCompleteZ();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_B_ID);
  });

  it("classifies null provider time as unknown without substituting capture time", () => {
    const fixture = nullProviderTimeFixtureA();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
    expect(selected?.trust.gold.state).toBe("unknown");
    expect(selected?.trust.gold.providerObservedAt).toBeNull();
    expect(selected?.trust.currencies.get("EGP")?.state).toBe("unknown");
  });

  it("classifies locally future provider time as unknown without local substitution", () => {
    const fixture = futureProviderTimeFixtureA();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
    expect(selected?.trust.gold.state).toBe("unknown");
    expect(selected?.trust.gold.providerObservedAt).toBeNull();
  });

  it("rejects a candidate whose observation capture time differs from its root", () => {
    const fixture = completeFixtureBOnTopOfA();
    const mismatched = fixture.observations.map((observation) =>
      observation.batchId === SNAPSHOT_B_ID &&
      observation.instrumentCode === "currency:EGP"
        ? {
            ...observation,
            createdAt: new Date(observation.createdAt.getTime() + 1),
          }
        : observation
    );

    expect(
      selectMarketRateSnapshot(fixture.roots, mismatched, NOW_MS)?.snapshotId
    ).toBe(SNAPSHOT_A_ID);
  });

  it("drops a selected candidate when required evidence is removed", () => {
    const full = completeFixtureBOnTopOfA();
    const strippedB = full.observations.filter(
      (row) =>
        !(
          row.batchId === SNAPSHOT_B_ID &&
          row.instrumentCode === "currency:EGP"
        )
    );
    const afterRemoval = selectMarketRateSnapshot(
      full.roots,
      strippedB,
      NOW_MS
    );
    expect(afterRemoval?.snapshotId).toBe(SNAPSHOT_A_ID);

    const noComplete = selectMarketRateSnapshot(
      full.roots,
      strippedB.filter(
        (row) =>
          !(
            row.batchId === SNAPSHOT_A_ID &&
            row.instrumentCode === "currency:EGP"
          )
      ),
      NOW_MS
    );
    expect(noComplete).toBeNull();
  });

  it("returns null when no complete candidate remains", () => {
    const fixture = completeFixtureA();
    const stripped = removeObservationByInstrument(
      fixture.observations,
      "metal:SILVER"
    );
    expect(
      selectMarketRateSnapshot(fixture.roots, stripped, NOW_MS)
    ).toBeNull();
  });

  it("exports exact observation decimals regardless of wide root numbers", () => {
    const fixture = divergentWideRootFixtureA();
    const selected = selectMarketRateSnapshot(
      fixture.roots,
      fixture.observations,
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
      fixture.roots,
      [...fixture.observations, ...stray],
      NOW_MS
    );

    expect(selected?.snapshotId).toBe(SNAPSHOT_A_ID);
    expect(selected?.ratesByInstrument.get("metal:GOLD")?.valueDecimal).toBe(
      "3738.74000000"
    );
  });
});
