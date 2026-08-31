import {
  reduceMetalLifecycle,
  type LifecycleEvent,
  type LifecycleKind,
  type LifecycleReductionResult,
} from "../lifecycle-reducer";

function event(
  id: string,
  kind: LifecycleKind,
  predecessorEventId: string | null,
  overrides: Partial<LifecycleEvent> = {}
): LifecycleEvent {
  return Object.freeze({
    id,
    fingerprint: `${id}-fingerprint`,
    kind,
    occurredAt: 1_000,
    predecessorEventId,
    reversesEventId: null,
    evidenceState: "effective",
    canonicalCasStatus: "unknown",
    ...overrides,
  });
}

const ROOT = event("created", "created", null);

function reasons(result: LifecycleReductionResult): readonly string[] {
  return result.rejectedEvents.map(({ reasonCode }) => reasonCode);
}

describe("approved pure lifecycle reduction", () => {
  it.each([
    ["non-object", null],
    ["unsupported kind", { ...ROOT, kind: "transferred" }],
    ["missing ID", { ...ROOT, id: undefined }],
    ["empty ID", { ...ROOT, id: "" }],
    ["missing fingerprint", { ...ROOT, fingerprint: undefined }],
    ["empty fingerprint", { ...ROOT, fingerprint: "" }],
    ["non-finite time", { ...ROOT, occurredAt: Number.NaN }],
    ["negative time", { ...ROOT, occurredAt: -1 }],
    ["string time", { ...ROOT, occurredAt: "1000" }],
    ["empty predecessor", { ...ROOT, predecessorEventId: "" }],
    ["numeric predecessor", { ...ROOT, predecessorEventId: 42 }],
    ["empty reversal", { ...ROOT, reversesEventId: "" }],
    ["numeric reversal", { ...ROOT, reversesEventId: 42 }],
    ["missing CAS status", { ...ROOT, canonicalCasStatus: undefined }],
    ["invalid CAS status", { ...ROOT, canonicalCasStatus: "pending" }],
  ] as const)("retains malformed runtime event structure as incomplete: %s", (_case, rawEvent) => {
    const result = reduceMetalLifecycle([rawEvent]);

    expect(result.projection).toBeNull();
    expect(result.acceptedEvents).toEqual([]);
    expect(result.rejectedEvents).toHaveLength(1);
    expect(result.rejectedEvents[0]).toMatchObject({
      reasonCode: "incomplete_evidence",
    });
  });

  it("keeps a valid projection while retaining a malformed successor as incomplete", () => {
    const malformedSuccessor: unknown = {
      ...event("malformed", "corrected", "created"),
      occurredAt: Number.POSITIVE_INFINITY,
    };

    const result = reduceMetalLifecycle([ROOT, malformedSuccessor]);

    expect(result.projection?.effectiveEventId).toBe("created");
    expect(result.rejectedEvents).toHaveLength(1);
    const rejection = result.rejectedEvents[0];
    if (rejection === undefined) {
      throw new Error("Expected malformed-event rejection");
    }
    expect(rejection.event.id).toBe("malformed");
    expect(rejection.reasonCode).toBe("incomplete_evidence");
  });

  it.each([
    [event("corrected", "corrected", "created"), "active", true],
    [event("sold", "sold", "created"), "sold", true],
    [event("disposed", "disposed", "created"), "disposed", true],
    [event("deleted", "deleted", "created"), "active", false],
  ] as const)("accepts the valid %s chain", (successor, status, isVisible) => {
    const result = reduceMetalLifecycle([successor, ROOT]);
    expect(result.projection).toMatchObject({ status, isVisible, effectiveEventId: successor.id });
    expect(result.acceptedEvents.map(({ id }) => id)).toEqual(["created", successor.id]);
    expect(result.rejectedEvents).toEqual([]);
  });

  it("accepts a reversal only when both references target the current terminal head", () => {
    const sold = event("sold", "sold", "created");
    const reversal = event("undo", "reversed", "sold", { reversesEventId: "sold" });
    const result = reduceMetalLifecycle([reversal, ROOT, sold]);
    expect(result.projection).toMatchObject({ status: "active", isVisible: true, effectiveEventId: "undo" });
    expect(result.acceptedEvents.map(({ id }) => id)).toEqual(["created", "sold", "undo"]);
  });

  it.each([
    [event("missing", "corrected", "absent"), "missing_predecessor"],
    [event("bad-transition", "corrected", "sold"), "invalid_transition"],
    [event("bad-undo", "reversed", "sold", { reversesEventId: "created" }), "invalid_reversal_target"],
    [event("ineffective", "corrected", "created", { evidenceState: "ineffective" }), "ineffective_evidence"],
    [event("incomplete", "corrected", "created", { evidenceState: "incomplete" }), "incomplete_evidence"],
  ] as const)("rejects unsafe evidence with %s", (unsafeEvent, reason) => {
    const sold = event("sold", "sold", "created");
    const result = reduceMetalLifecycle([ROOT, sold, unsafeEvent]);
    expect(reasons(result)).toContain(reason);
  });

  it("retains duplicate replay and conflicting duplicate evidence without applying it twice", () => {
    const correction = event("correction", "corrected", "created");
    const replay = { ...correction };
    const conflict = { ...correction, fingerprint: "different", occurredAt: 2_000 };
    const replayResult = reduceMetalLifecycle([ROOT, correction, replay]);
    const conflictResult = reduceMetalLifecycle([ROOT, correction, conflict]);
    expect(reasons(replayResult)).toContain("duplicate_event_id_replay");
    expect(reasons(conflictResult)).toEqual(expect.arrayContaining(["duplicate_event_id_conflict", "duplicate_event_id_conflict"]));
    expect(conflictResult.projection?.effectiveEventId).toBe("created");
  });

  it("treats equal IDs and fingerprints with unequal canonical event fields as conflicts", () => {
    const claimedReplay = event("created", "created", null, {
      fingerprint: ROOT.fingerprint,
      occurredAt: 2_000,
    });

    const result = reduceMetalLifecycle([ROOT, claimedReplay]);

    expect(result.projection).toBeNull();
    expect(reasons(result)).toEqual([
      "duplicate_event_id_conflict",
      "duplicate_event_id_conflict",
    ]);
  });

  it.each([undefined, "corrupt"])(
    "fails closed for runtime evidence state %p",
    (evidenceState) => {
      const malformed = {
        ...ROOT,
        id: `created-${String(evidenceState)}`,
        fingerprint: `created-${String(evidenceState)}-fingerprint`,
        evidenceState,
      } as unknown as LifecycleEvent;

      const result = reduceMetalLifecycle([malformed]);

      expect(result.projection).toBeNull();
      expect(result.acceptedEvents).toEqual([]);
      expect(result.rejectedEvents).toMatchObject([
        {
          event: { id: malformed.id },
          fingerprint: malformed.fingerprint,
          reasonCode: "incomplete_evidence",
        },
      ]);
    }
  );

  it("rejects a canonical-CAS-rejected root before ownership and excludes its descendant", () => {
    const rejectedRoot = event("rejected-root", "created", null, {
      canonicalCasStatus: "rejected",
    });
    const descendant = event("descendant", "corrected", "rejected-root");

    const result = reduceMetalLifecycle([rejectedRoot, descendant]);

    expect(result.projection).toBeNull();
    expect(result.acceptedEvents).toEqual([]);
    const rootRejection = result.rejectedEvents.find(
      ({ event }) => event.id === "rejected-root"
    );
    const descendantRejection = result.rejectedEvents.find(
      ({ event }) => event.id === "descendant"
    );
    expect(rootRejection?.reasonCode).toBe("ineffective_evidence");
    expect(descendantRejection?.reasonCode).toBe("predecessor_not_accepted");
  });

  it("rejects cycles and descendants of rejected predecessors", () => {
    const cycleA = event("cycle-a", "corrected", "cycle-b");
    const cycleB = event("cycle-b", "corrected", "cycle-a");
    const descendant = event("descendant", "sold", "cycle-a");
    const result = reduceMetalLifecycle([ROOT, cycleA, cycleB, descendant]);
    expect(reasons(result)).toEqual(expect.arrayContaining(["cycle_detected", "predecessor_not_accepted"]));
    expect(result.projection?.effectiveEventId).toBe("created");
  });

  it("fails closed for competing successors without canonical CAS evidence", () => {
    const sold = event("sold", "sold", "created", { occurredAt: 2_000 });
    const disposed = event("disposed", "disposed", "created", { occurredAt: 3_000 });
    const result = reduceMetalLifecycle([ROOT, disposed, sold]);
    expect(result.projection?.effectiveEventId).toBe("created");
    expect(reasons(result)).toEqual(["conflicting_effective_successors", "conflicting_effective_successors"]);
  });

  it("accepts only the authoritative CAS winner and rejects its competing sibling", () => {
    const sold = event("sold", "sold", "created", { canonicalCasStatus: "accepted" });
    const disposed = event("disposed", "disposed", "created", { canonicalCasStatus: "rejected" });
    const result = reduceMetalLifecycle([disposed, ROOT, sold]);
    expect(result.projection?.effectiveEventId).toBe("sold");
    expect(reasons(result)).toContain("ineffective_evidence");
  });

  it("uses causality rather than time or ID for an equal-time chain", () => {
    const correction = event("z-correction", "corrected", "created", { occurredAt: 1_000 });
    const sold = event("a-sold", "sold", "z-correction", { occurredAt: 1_000 });
    const result = reduceMetalLifecycle([sold, ROOT, correction]);
    expect(result.acceptedEvents.map(({ id }) => id)).toEqual(["created", "z-correction", "a-sold"]);
    expect(result.projection?.effectiveEventId).toBe("a-sold");
  });

  it("orders visible history by recorded time while retaining causal acceptance order", () => {
    const created = event("created-newer", "created", null, {
      occurredAt: 2_000,
    });
    const correction = event("correction-older", "corrected", "created-newer", {
      occurredAt: 1_000,
    });

    const result = reduceMetalLifecycle([correction, created]);

    expect(result.acceptedEvents.map(({ id }) => id)).toEqual([
      "created-newer",
      "correction-older",
    ]);
    expect(result.projection?.history.map(({ id }) => id)).toEqual([
      "created-newer",
      "correction-older",
    ]);
  });

  it("is deterministic across shuffled input and restart replay", () => {
    const correction = event("correction", "corrected", "created", { occurredAt: 2_000 });
    const sold = event("sold", "sold", "correction", { occurredAt: 3_000 });
    const first = reduceMetalLifecycle([sold, ROOT, correction]);
    const replayed = reduceMetalLifecycle([correction, sold, ROOT]);
    expect(replayed).toEqual(first);
  });

  it("returns null projection when no safe root exists", () => {
    const invalid = event("orphan", "sold", "missing");
    const result = reduceMetalLifecycle([invalid]);
    expect(result.projection).toBeNull();
    expect(result.acceptedEvents).toEqual([]);
    expect(reasons(result)).toEqual(["missing_predecessor"]);
  });

  it("rejects a Created root that carries a reversal reference", () => {
    const invalidRoot = event("invalid-root", "created", null, {
      reversesEventId: "terminal-event",
    });

    const result = reduceMetalLifecycle([invalidRoot]);

    expect(result.projection).toBeNull();
    expect(result.acceptedEvents).toEqual([]);
    expect(reasons(result)).toEqual(["invalid_transition"]);
  });
});

export {};
