import {
  shapeMetalDisposedEvidence,
  type MetalDisposeEventSnapshot,
  type MetalDisposeGroupSnapshot,
  type MetalDisposeHoldingSnapshot,
  type MetalDisposedEvidenceInput,
} from "@/services/metal-disposed-evidence-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000002";
const ADD_EVENT_ID = "018f0c7a-1234-7abc-8def-000000000003";
const DISPOSE_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000004";
const DISPOSE_EVENT_ID = "018f0c7a-1234-7abc-8def-000000000005";

function disposalPayload(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    disposalDate: "2026-08-24",
    expectedHoldingRevision: "1",
    holdingId: HOLDING_ID,
    notes: "Given to my sister",
    predecessorEventId: ADD_EVENT_ID,
    reason: "given_away",
    reversesEventId: null,
    ...overrides,
  };
}

function disposalEnvelope(
  payload: Record<string, unknown>,
  overrides: Readonly<Record<string, unknown>> = {}
): string {
  return JSON.stringify({
    accountGuards: [],
    actionId: DISPOSE_ACTION_ID,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "dispose",
    occurredAt: "2026-08-24T12:00:00.000Z",
    payload,
    payloadVersion: "metals.dispose/v1",
    userId: USER_ID,
    ...overrides,
  });
}

function disposalGroup(
  payload: Record<string, unknown>,
  overrides: Partial<MetalDisposeGroupSnapshot> = {}
): MetalDisposeGroupSnapshot {
  return {
    actionId: DISPOSE_ACTION_ID,
    deleted: false,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    kind: "dispose",
    outcomeJson: null,
    payloadJson: disposalEnvelope(payload),
    rejectionCode: null,
    serverOutcome: null,
    state: "local_complete",
    userId: USER_ID,
    ...overrides,
  };
}

function disposalEvent(
  payload: Record<string, unknown>,
  overrides: Partial<MetalDisposeEventSnapshot> = {}
): MetalDisposeEventSnapshot {
  return {
    actionId: DISPOSE_ACTION_ID,
    deleted: false,
    holdingId: HOLDING_ID,
    id: DISPOSE_EVENT_ID,
    isEffective: true,
    kind: "dispose",
    payloadJson: JSON.stringify(payload),
    userId: USER_ID,
    ...overrides,
  };
}

function disposalHolding(
  overrides: Partial<MetalDisposeHoldingSnapshot> = {}
): MetalDisposeHoldingSnapshot {
  return {
    effectiveActionId: DISPOSE_ACTION_ID,
    effectiveEventId: DISPOSE_EVENT_ID,
    holdingId: HOLDING_ID,
    isVisible: true,
    reconciliationState: "accepted",
    status: "disposed",
    userId: USER_ID,
    ...overrides,
  };
}

function inputOf(
  payload: Record<string, unknown>,
  overrides: Partial<MetalDisposedEvidenceInput> = {}
): MetalDisposedEvidenceInput {
  return {
    event: disposalEvent(payload),
    group: disposalGroup(payload),
    holding: disposalHolding(),
    latestAllowedCalendarDate: "2026-09-01",
    userId: USER_ID,
    ...overrides,
  };
}

describe("metal disposed evidence shaper", () => {
  it("keeps canonical disposal facts after holding reconciliation", () => {
    expect(
      shapeMetalDisposedEvidence(
        inputOf(disposalPayload(), {
          holding: disposalHolding({ reconciliationState: "reconciled" }),
        })
      )
    ).toMatchObject({ available: true, value: { reason: "given_away" } });
  });

  it.each(["reason", "reas\\u006fn"])(
    "rejects duplicate event keys including %s",
    (key) => {
      const payload = disposalPayload();
      const payloadJson = JSON.stringify(payload).replace(
        '"reason":"given_away"',
        `"reason":"donated","${key}":"given_away"`
      );
      expect(
        shapeMetalDisposedEvidence(
          inputOf(payload, {
            event: disposalEvent(payload, { payloadJson }),
          })
        )
      ).toEqual({ available: false, reason: "invalid_disposal_evidence" });
    }
  );

  it.each([
    ["lost_or_stolen", "lost_or_stolen", "write_off"],
    ["destroyed_or_damaged", "destroyed_or_damaged", "write_off"],
    ["given_away", "given_away", "external_transfer"],
    ["donated", "donated", "external_transfer"],
    ["other_write_off", "other", "write_off"],
    ["other_external_transfer", "other", "external_transfer"],
  ] as const)(
    "shapes approved reason %s without sale facts",
    (payloadReason, reason, treatment) => {
      expect(
        shapeMetalDisposedEvidence(
          inputOf(disposalPayload({ reason: payloadReason }))
        )
      ).toEqual({
        available: true,
        value: {
          actionId: DISPOSE_ACTION_ID,
          disposalDate: "2026-08-24",
          holdingId: HOLDING_ID,
          notes: "Given to my sister",
          reason,
          treatment,
        },
      });
    }
  );

  it("preserves an absent optional note as null", () => {
    expect(
      shapeMetalDisposedEvidence(inputOf(disposalPayload({ notes: null })))
    ).toMatchObject({ available: true, value: { notes: null } });
  });

  it("uses device-local today as the trusted date boundary when none is injected", () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 1, 12));
    try {
      const input = inputOf(disposalPayload());
      const { latestAllowedCalendarDate: _omitted, ...withoutBoundary } = input;

      expect(shapeMetalDisposedEvidence(withoutBoundary)).toMatchObject({
        available: true,
      });
      expect(
        shapeMetalDisposedEvidence({
          ...withoutBoundary,
          event: disposalEvent(disposalPayload({ disposalDate: "2026-09-02" })),
          group: disposalGroup(disposalPayload({ disposalDate: "2026-09-02" })),
        })
      ).toEqual({
        available: false,
        reason: "unsupported_disposal_evidence",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ["foreign holding", { holding: disposalHolding({ userId: "user-2" }) }],
    [
      "foreign event",
      { event: disposalEvent(disposalPayload(), { userId: "user-2" }) },
    ],
    [
      "foreign group",
      { group: disposalGroup(disposalPayload(), { userId: "user-2" }) },
    ],
  ] as const)("rejects %s evidence", (_label, overrides) => {
    expect(
      shapeMetalDisposedEvidence(inputOf(disposalPayload(), overrides))
    ).toEqual({
      available: false,
      reason: "foreign_disposal_evidence",
    });
  });

  it.each([
    ["hidden holding", { holding: disposalHolding({ isVisible: false }) }],
    ["active holding", { holding: disposalHolding({ status: "active" }) }],
    [
      "ineffective event",
      { event: disposalEvent(disposalPayload(), { isEffective: false }) },
    ],
    [
      "deleted event",
      { event: disposalEvent(disposalPayload(), { deleted: true }) },
    ],
    [
      "deleted group",
      { group: disposalGroup(disposalPayload(), { deleted: true }) },
    ],
    [
      "rejected group",
      {
        group: disposalGroup(disposalPayload(), {
          state: "reconciled",
          serverOutcome: "rejected",
          outcomeJson: "{}",
          rejectionCode: "stale",
        }),
      },
    ],
    [
      "incomplete group",
      {
        group: disposalGroup(disposalPayload(), {
          state: "reconciliation_incomplete",
        }),
      },
    ],
    [
      "wrong effective event",
      { holding: disposalHolding({ effectiveEventId: ADD_EVENT_ID }) },
    ],
    [
      "wrong effective action",
      { holding: disposalHolding({ effectiveActionId: ADD_EVENT_ID }) },
    ],
  ] as const)(
    "excludes %s from reportable disposal facts",
    (_label, overrides) => {
      expect(
        shapeMetalDisposedEvidence(inputOf(disposalPayload(), overrides))
      ).toEqual({ available: false, reason: "excluded_disposal" });
    }
  );

  it.each([
    ["unknown reason", disposalPayload({ reason: "gifted" })],
    ["future date", disposalPayload({ disposalDate: "2026-09-02" })],
    [
      "missing notes field",
      (() => {
        const value = disposalPayload();
        delete value.notes;
        return value;
      })(),
    ],
  ] as const)("rejects malformed payload: %s", (_label, payload) => {
    expect(shapeMetalDisposedEvidence(inputOf(payload))).toEqual({
      available: false,
      reason: "unsupported_disposal_evidence",
    });
  });

  it("rejects unsupported payload versions", () => {
    const payload = disposalPayload();
    expect(
      shapeMetalDisposedEvidence(
        inputOf(payload, {
          group: disposalGroup(payload, {
            payloadJson: disposalEnvelope(payload, {
              payloadVersion: "metals.dispose/v2",
            }),
          }),
        })
      )
    ).toEqual({
      available: false,
      reason: "unsupported_disposal_evidence",
    });
  });

  it("rejects event payloads that differ from the immutable action envelope", () => {
    const payload = disposalPayload();
    expect(
      shapeMetalDisposedEvidence(
        inputOf(payload, {
          event: disposalEvent({ ...payload, notes: "changed later" }),
        })
      )
    ).toEqual({
      available: false,
      reason: "invalid_disposal_evidence",
    });
  });

  it("rejects duplicate JSON keys instead of accepting ambiguous evidence", () => {
    const payload = disposalPayload();
    const canonical = disposalEnvelope(payload);
    const duplicated = canonical.replace(
      '"payloadVersion":"metals.dispose/v1"',
      '"payloadVersion":"metals.dispose/v1","payloadVersion":"metals.dispose/v1"'
    );
    expect(
      shapeMetalDisposedEvidence(
        inputOf(payload, {
          group: disposalGroup(payload, { payloadJson: duplicated }),
        })
      )
    ).toEqual({
      available: false,
      reason: "unsupported_disposal_evidence",
    });
  });
});
