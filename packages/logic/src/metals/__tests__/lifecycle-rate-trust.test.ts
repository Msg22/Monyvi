import {
  orderLifecycleEventsNewestFirst,
  reduceMetalLifecycle,
  type LifecycleEvent,
  type LifecycleKind,
} from "../lifecycle-reducer";
import { classifyRateTrust } from "../rate-trust";

function loadLifecycleApi(): {
  readonly orderLifecycleEventsNewestFirst: typeof orderLifecycleEventsNewestFirst;
  readonly reduceMetalLifecycle: typeof reduceMetalLifecycle;
} {
  return { orderLifecycleEventsNewestFirst, reduceMetalLifecycle };
}

function loadRateTrustApi(): {
  readonly classifyRateTrust: typeof classifyRateTrust;
} {
  return { classifyRateTrust };
}

function event(
  id: string,
  kind: LifecycleKind,
  occurredAt: number,
  predecessorEventId: string | null = null,
  reversesEventId: string | null = null
): LifecycleEvent {
  return Object.freeze({
    id,
    fingerprint: `${id}-fingerprint`,
    kind,
    occurredAt,
    predecessorEventId,
    reversesEventId,
    evidenceState: "effective",
    canonicalCasStatus: "unknown",
  });
}

const CREATED = event("event-created", "created", 1_000);

describe("deterministic Metals lifecycle reduction", () => {
  it("reduces creation to a visible Active holding", () => {
    const { reduceMetalLifecycle } = loadLifecycleApi();

    expect(reduceMetalLifecycle([CREATED]).projection).toEqual({
      status: "active",
      isVisible: true,
      effectiveEventId: "event-created",
      history: [CREATED],
    });
  });

  it.each([
    [event("event-sold", "sold", 2_000, "event-created"), "sold"],
    [event("event-disposed", "disposed", 2_000, "event-created"), "disposed"],
  ] as const)("reduces %s to terminal state %s", (terminalEvent, expectedStatus) => {
    const { reduceMetalLifecycle } = loadLifecycleApi();

    expect(reduceMetalLifecycle([CREATED, terminalEvent]).projection).toMatchObject({
      status: expectedStatus,
      isVisible: true,
      effectiveEventId: terminalEvent.id,
      history: [terminalEvent, CREATED],
    });
  });

  it("keeps correction evidence while the holding remains Active", () => {
    const { reduceMetalLifecycle } = loadLifecycleApi();
    const correction = event("event-corrected", "corrected", 2_000, "event-created");

    expect(reduceMetalLifecycle([CREATED, correction]).projection).toEqual({
      status: "active",
      isVisible: true,
      effectiveEventId: "event-corrected",
      history: [correction, CREATED],
    });
  });

  it("makes Delete hidden and non-History instead of a terminal holding state", () => {
    const { reduceMetalLifecycle } = loadLifecycleApi();
    const deleted = event("event-deleted", "deleted", 2_000, "event-created");

    expect(reduceMetalLifecycle([CREATED, deleted]).projection).toEqual({
      status: "active",
      isVisible: false,
      effectiveEventId: "event-deleted",
      history: [],
    });
  });

  it("restores Sold to Active by reversal without erasing terminal history", () => {
    const { reduceMetalLifecycle } = loadLifecycleApi();
    const sold = event("event-sold", "sold", 2_000, "event-created");
    const reversal = event("event-reversal", "reversed", 3_000, "event-sold", "event-sold");

    expect(reduceMetalLifecycle([CREATED, sold, reversal]).projection).toEqual({
      status: "active",
      isVisible: true,
      effectiveEventId: "event-reversal",
      history: [reversal, sold, CREATED],
    });
  });

  it("orders an equal-time causal successor before the event it reverses", () => {
    const { orderLifecycleEventsNewestFirst } = loadLifecycleApi();
    const sold = event("event-b-sold", "sold", 2_000, "event-created");
    const reversal = event("event-a-reversal", "reversed", 2_000, "event-b-sold", "event-b-sold");

    const orderedIds = orderLifecycleEventsNewestFirst([sold, reversal]).map(({ id }) => id);

    expect(orderedIds).toEqual(["event-a-reversal", "event-b-sold"]);
  });

  it("uses stable immutable event IDs for unrelated equal-time events without prescribing ID direction", () => {
    const { orderLifecycleEventsNewestFirst } = loadLifecycleApi();
    const eventIdAlpha = event("event-id-alpha", "corrected", 2_000, "event-created");
    const eventIdBeta = event("event-id-beta", "corrected", 2_000, "event-created");
    const eventIdGamma = event("event-id-gamma", "corrected", 2_000, "event-created");

    const orderA = orderLifecycleEventsNewestFirst([
      eventIdGamma,
      eventIdAlpha,
      eventIdBeta,
    ]).map(({ id }) => id);
    const orderB = orderLifecycleEventsNewestFirst([
      eventIdBeta,
      eventIdGamma,
      eventIdAlpha,
    ]).map(({ id }) => id);
    const ascendingIds = ["event-id-alpha", "event-id-beta", "event-id-gamma"];
    const descendingIds = ["event-id-gamma", "event-id-beta", "event-id-alpha"];

    expect(orderA).toEqual(orderB);
    expect([ascendingIds, descendingIds]).toContainEqual(orderA);
  });

  it("orders every permutation of an equal-time causal chain transitively before applying the ID tie-break", () => {
    const { orderLifecycleEventsNewestFirst } = loadLifecycleApi();
    const rootA = event("event-a-root", "created", 2_000);
    const successorB = event("event-b-successor", "corrected", 2_000, "event-a-root");
    const successorZ = event("event-z-successor", "corrected", 2_000, "event-b-successor");
    const permutations = [
      [rootA, successorB, successorZ],
      [rootA, successorZ, successorB],
      [successorB, rootA, successorZ],
      [successorB, successorZ, rootA],
      [successorZ, rootA, successorB],
      [successorZ, successorB, rootA],
    ];

    for (const permutation of permutations) {
      expect(orderLifecycleEventsNewestFirst(permutation).map(({ id }) => id)).toEqual([
        "event-z-successor",
        "event-b-successor",
        "event-a-root",
      ]);
    }
  });
});

describe("provider-observation-time rate trust", () => {
  const NOW = 1_800_000_000_000;
  const DAY_MS = 86_400_000;

  it.each([
    ["exactly now", NOW, { state: "fresh", ageMs: 0 }],
    ["one millisecond ahead", NOW + 1, { state: "unknown", ageMs: null }],
  ] as const)("classifies provider time %s without emitting a negative age", (_case, providerObservedAt, expected) => {
    const { classifyRateTrust } = loadRateTrustApi();

    expect(
      classifyRateTrust(
        { valueDecimal: "100.25", providerObservedAt, capturedAt: NOW, quality: "valid" },
        NOW
      )
    ).toEqual(expected);
  });

  it("treats exactly 24 hours old as fresh because only over 24 hours is stale", () => {
    const { classifyRateTrust } = loadRateTrustApi();

    expect(
      classifyRateTrust(
        { valueDecimal: "100.25", providerObservedAt: NOW - DAY_MS, capturedAt: NOW, quality: "valid" },
        NOW
      )
    ).toEqual({ state: "fresh", ageMs: DAY_MS });
  });

  it("treats one millisecond over 24 hours as stale", () => {
    const { classifyRateTrust } = loadRateTrustApi();

    expect(
      classifyRateTrust(
        { valueDecimal: "100.25", providerObservedAt: NOW - DAY_MS - 1, capturedAt: NOW, quality: "valid" },
        NOW
      )
    ).toEqual({ state: "stale", ageMs: DAY_MS + 1 });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["unparseable", "not-a-provider-timestamp"],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
  ] as const)("keeps %s provider observation time Unknown even when captured now", (_case, providerObservedAt) => {
    const { classifyRateTrust } = loadRateTrustApi();

    expect(
      classifyRateTrust(
        { valueDecimal: "100.25", providerObservedAt, capturedAt: NOW, quality: "valid" },
        NOW
      )
    ).toEqual({ state: "unknown", ageMs: null });
  });

  it.each([
    [null, "valid"],
    ["0", "valid"],
    ["-0.01", "valid"],
    ["not-a-decimal", "valid"],
    ["100.25", "invalid"],
    ["100.25", "unknown"],
  ] as const)("marks unavailable value %p with quality %s as missing", (valueDecimal, quality) => {
    const { classifyRateTrust } = loadRateTrustApi();

    expect(
      classifyRateTrust(
        { valueDecimal, providerObservedAt: NOW, capturedAt: NOW, quality },
        NOW
      )
    ).toEqual({ state: "missing", ageMs: null });
  });

  it("does not let recent capture time make an old provider observation fresh", () => {
    const { classifyRateTrust } = loadRateTrustApi();

    expect(
      classifyRateTrust(
        { valueDecimal: "100.25", providerObservedAt: NOW - DAY_MS - 5_000, capturedAt: NOW, quality: "valid" },
        NOW
      )
    ).toEqual({ state: "stale", ageMs: DAY_MS + 5_000 });
  });
});
