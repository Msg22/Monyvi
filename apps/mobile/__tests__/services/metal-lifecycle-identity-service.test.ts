import { reduceMetalLifecycle, type LifecycleEvent } from "@monyvi/logic";
import {
  normalizeMetalLifecycleEvents,
  resolveMetalLifecycleIdentity,
  type MetalIdentityActionEvidence,
  type MetalIdentityActionRoot,
  type MetalIdentityEvent,
} from "../../services/metal-lifecycle-identity-service";

const USER = "018f0c7a-1234-7abc-8def-000000000001";
const FOREIGN = "018f0c7a-1234-7abc-8def-000000000099";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000002";
const ACTION = "018f0c7a-1234-7abc-8def-000000000042";
const LEGACY_EVENT = "018f0c7a-1234-7abc-8def-000000000017";
const UNDO = "018f0c7a-1234-7abc-8def-000000000043";
const OCCURRED = "2026-08-23T00:00:00.000Z";

function payload(): Record<string, unknown> {
  return {
    disposalDate: "2026-08-23",
    expectedHoldingRevision: "0",
    holdingId: HOLDING,
    notes: null,
    predecessorEventId: null,
    reason: "given_away",
    reversesEventId: null,
  };
}

function event(
  overrides: Partial<MetalIdentityEvent> = {}
): MetalIdentityEvent {
  return {
    actionId: ACTION,
    deleted: false,
    holdingId: HOLDING,
    id: LEGACY_EVENT,
    isEffective: true,
    isHistoryVisible: true,
    kind: "dispose",
    occurredAt: new Date(OCCURRED),
    payloadJson: JSON.stringify(payload()),
    predecessorEventId: null,
    reversesEventId: null,
    userId: USER,
    ...overrides,
  };
}

function root(
  overrides: Partial<MetalIdentityActionRoot> = {}
): MetalIdentityActionRoot {
  return {
    accountGuardsJson: "[]",
    actionId: ACTION,
    deleted: false,
    domain: "metals",
    domainReferenceId: HOLDING,
    kind: "dispose",
    outcomeJson: null,
    payloadJson: JSON.stringify({
      accountGuards: [],
      actionId: ACTION,
      domain: "metals",
      domainReferenceId: HOLDING,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "dispose",
      occurredAt: OCCURRED,
      payload: payload(),
      payloadVersion: "metals.dispose/v1",
      userId: USER,
    }),
    rejectionCode: null,
    serverOutcome: null,
    state: "local_complete",
    userId: USER,
    ...overrides,
  };
}

function evidence(
  overrides: Partial<MetalIdentityActionEvidence> = {}
): MetalIdentityActionEvidence {
  return {
    actionId: ACTION,
    canonicalHoldingRevision: "1",
    deleted: false,
    domainPayloadJson: JSON.stringify(payload()),
    expectedHoldingRevision: "0",
    holdingId: HOLDING,
    kind: "dispose",
    userId: USER,
    ...overrides,
  };
}

function proof(
  overrides: {
    readonly events?: readonly MetalIdentityEvent[];
    readonly roots?: readonly MetalIdentityActionRoot[];
    readonly evidence?: readonly MetalIdentityActionEvidence[];
    readonly userId?: string;
    readonly holdingId?: string;
  } = {}
): ReturnType<typeof resolveMetalLifecycleIdentity> {
  return resolveMetalLifecycleIdentity({
    events: overrides.events ?? [event()],
    groups: overrides.roots ?? [root()],
    evidence: overrides.evidence ?? [evidence()],
    userId: overrides.userId ?? USER,
    holdingId: overrides.holdingId ?? HOLDING,
  });
}

describe("legacy revision-zero Dispose identity", (): void => {
  it("proves local event 17 maps to canonical action 42 and normalizes only logical reducer IDs", (): void => {
    const identity = proof();
    expect(identity).toEqual({
      legacyRootEventId: LEGACY_EVENT,
      canonicalRootActionId: ACTION,
      hasUnprovenLegacyRoot: false,
    });
    const legacy = event();
    const canonicalUndo = {
      id: UNDO,
      kind: "reversed",
      predecessorEventId: ACTION,
      reversesEventId: ACTION,
    };
    const normalized = normalizeMetalLifecycleEvents(
      [
        {
          id: legacy.id,
          kind: "disposed",
          predecessorEventId: legacy.predecessorEventId,
          reversesEventId: legacy.reversesEventId,
        },
        canonicalUndo,
      ],
      identity
    );
    expect(normalized[0]?.id).toBe(ACTION);
    expect(normalized[1]).toMatchObject(canonicalUndo);
    expect(legacy.id).toBe(LEGACY_EVENT);
  });

  it("keeps an old immutable Undo referencing E unaccepted; never rewrites its links", (): void => {
    const originalUndo = {
      id: UNDO,
      kind: "reversed",
      predecessorEventId: LEGACY_EVENT,
      reversesEventId: LEGACY_EVENT,
    };
    expect(normalizeMetalLifecycleEvents([originalUndo], proof())[0]).toEqual(
      originalUndo
    );
  });

  it("keeps a canonical revision-zero Dispose -> Restore -> Dispose -> Restore chain coherent for subsequent Delete", (): void => {
    const secondDispose = "018f0c7a-1234-7abc-8def-000000000044";
    const secondUndo = "018f0c7a-1234-7abc-8def-000000000045";
    const source: readonly LifecycleEvent[] = [
      {
        id: LEGACY_EVENT,
        fingerprint: "original-dispose",
        kind: "disposed",
        occurredAt: Date.parse(OCCURRED),
        predecessorEventId: null,
        reversesEventId: null,
        evidenceState: "effective",
        canonicalCasStatus: "accepted",
      },
      {
        id: UNDO,
        fingerprint: "original-undo",
        kind: "reversed",
        occurredAt: Date.parse(OCCURRED) + 1000,
        predecessorEventId: ACTION,
        reversesEventId: ACTION,
        evidenceState: "effective",
        canonicalCasStatus: "accepted",
      },
      {
        id: secondDispose,
        fingerprint: "second-dispose",
        kind: "disposed",
        occurredAt: Date.parse(OCCURRED) + 2000,
        predecessorEventId: UNDO,
        reversesEventId: null,
        evidenceState: "effective",
        canonicalCasStatus: "accepted",
      },
      {
        id: secondUndo,
        fingerprint: "second-undo",
        kind: "reversed",
        occurredAt: Date.parse(OCCURRED) + 3000,
        predecessorEventId: secondDispose,
        reversesEventId: secondDispose,
        evidenceState: "effective",
        canonicalCasStatus: "accepted",
      },
    ];
    const normalized = normalizeMetalLifecycleEvents(source, proof());
    const reduced = reduceMetalLifecycle(normalized, {
      terminalEventId: ACTION,
    });
    expect(reduced.projection).toMatchObject({
      effectiveEventId: secondUndo,
      status: "active",
      isVisible: true,
    });
    expect(reduced.acceptedEvents).toHaveLength(4);
    expect(reduced.rejectedEvents).toHaveLength(0);
  });

  it("leaves ordinary Add->Dispose with a physical E!=D event ID outside revision-zero aliases", (): void => {
    const addId = "018f0c7a-1234-7abc-8def-000000000046";
    const created = event({
      actionId: addId,
      id: addId,
      kind: "add",
      predecessorEventId: null,
      payloadJson: "{}",
    });
    const normalDispose = event({ predecessorEventId: addId });
    const identity = proof({ events: [created, normalDispose] });
    expect(identity).toEqual({
      legacyRootEventId: null,
      canonicalRootActionId: null,
      hasUnprovenLegacyRoot: false,
    });
  });

  it("still refuses an unproven original E!=D Dispose root with a corrupted predecessor", (): void => {
    const identity = proof({
      events: [
        event({
          predecessorEventId: "018f0c7a-1234-7abc-8def-000000000047",
        }),
      ],
    });
    expect(identity.canonicalRootActionId).toBeNull();
    expect(identity.hasUnprovenLegacyRoot).toBe(true);
  });

  it("does not excuse ambiguous rev0 Dispose roots merely because an Add is present", (): void => {
    const addId = "018f0c7a-1234-7abc-8def-000000000046";
    const created = event({
      actionId: addId,
      id: addId,
      kind: "add",
      payloadJson: "{}",
    });
    const identity = proof({ events: [created, event()] });
    expect(identity.canonicalRootActionId).toBeNull();
    expect(identity.hasUnprovenLegacyRoot).toBe(true);
  });

  it("recognizes a canonical-only fresh device without introducing aliases", (): void => {
    expect(proof({ events: [event({ id: ACTION })] })).toEqual({
      legacyRootEventId: ACTION,
      canonicalRootActionId: ACTION,
      hasUnprovenLegacyRoot: false,
    });
  });

  it.each([
    "foreign-event",
    "foreign-evidence",
    "foreign-root",
    "foreign-request-user",
    "wrong-holding",
    "wrong-event-kind",
    "wrong-evidence-kind",
    "wrong-revision",
    "missing-root",
    "missing-evidence",
    "duplicate-root",
    "duplicate-event",
    "duplicate-evidence",
    "mismatched-evidence-payload",
    "mismatched-event-payload",
    "malformed-root",
    "malformed-evidence",
    "numeric-root-payload",
    "future-recorded-day",
  ] as const)(
    "rejects %s instead of guessing an identity",
    (scenario): void => {
      let changedEvent: Partial<MetalIdentityEvent> = {};
      let changedEvidence: Partial<MetalIdentityActionEvidence> = {};
      let changedRoot: Partial<MetalIdentityActionRoot> = {};
      if (scenario === "foreign-event")
        changedEvent = { ...changedEvent, userId: FOREIGN };
      if (scenario === "foreign-evidence")
        changedEvidence = { ...changedEvidence, userId: FOREIGN };
      if (scenario === "foreign-root")
        changedRoot = { ...changedRoot, userId: FOREIGN };
      if (scenario === "wrong-holding")
        changedEvent = { ...changedEvent, holdingId: FOREIGN };
      if (scenario === "wrong-event-kind")
        changedEvent = { ...changedEvent, kind: "sell" };
      if (scenario === "wrong-evidence-kind")
        changedEvidence = { ...changedEvidence, kind: "sell" };
      if (scenario === "wrong-revision")
        changedEvidence = { ...changedEvidence, canonicalHoldingRevision: "2" };
      if (scenario === "mismatched-evidence-payload")
        changedEvidence = {
          ...changedEvidence,
          domainPayloadJson: JSON.stringify({
            ...payload(),
            reason: "donated",
          }),
        };
      if (scenario === "mismatched-event-payload")
        changedEvent = {
          ...changedEvent,
          payloadJson: JSON.stringify({
            ...payload(),
            reason: "donated",
          }),
        };
      if (scenario === "malformed-root")
        changedRoot = { ...changedRoot, payloadJson: "{" };
      if (scenario === "malformed-evidence")
        changedEvidence = { ...changedEvidence, domainPayloadJson: "{" };
      if (scenario === "numeric-root-payload") {
        const value = JSON.parse(root().payloadJson) as Record<string, unknown>;
        changedRoot = {
          ...changedRoot,
          payloadJson: JSON.stringify({
            ...value,
            payload: { ...payload(), expectedHoldingRevision: 0 },
          }),
        };
      }
      if (scenario === "future-recorded-day") {
        const value = JSON.parse(root().payloadJson) as Record<string, unknown>;
        const future = { ...payload(), disposalDate: "2026-08-25" };
        changedRoot = {
          ...changedRoot,
          payloadJson: JSON.stringify({ ...value, payload: future }),
        };
        changedEvent = { ...changedEvent, payloadJson: JSON.stringify(future) };
        changedEvidence = {
          ...changedEvidence,
          domainPayloadJson: JSON.stringify(future),
        };
      }
      const sourceEvent = event(changedEvent);
      const sourceRoot = root(changedRoot);
      const sourceEvidence = evidence(changedEvidence);
      const actual = proof({
        userId: scenario === "foreign-request-user" ? FOREIGN : USER,
        events:
          scenario === "duplicate-event"
            ? [sourceEvent, sourceEvent]
            : [sourceEvent],
        roots:
          scenario === "missing-root"
            ? []
            : scenario === "duplicate-root"
              ? [sourceRoot, sourceRoot]
              : [sourceRoot],
        evidence:
          scenario === "missing-evidence"
            ? []
            : scenario === "duplicate-evidence"
              ? [sourceEvidence, sourceEvidence]
              : [sourceEvidence],
      });
      expect(actual.canonicalRootActionId).toBeNull();
      expect(actual.hasUnprovenLegacyRoot).toBe(true);
    }
  );
});
