jest.mock("@monyvi/db", () => ({}));
jest.mock("@/services/user-data-access", () => ({}));

import {
  buildMetalDetailReadModel,
  shapeMetalDetailLifecycleEvents,
  type BuildMetalDetailReadModelInput,
  type MetalDetailAssetInput,
  type MetalDetailHoldingStateInput,
  type MetalDetailLifecycleEventInput,
  type MetalDetailMetalInput,
} from "@/services/metal-detail-read-model-service";
import { buildMetalHistoryReadModel } from "@/services/metal-history-read-model-service";
import {
  resolveLegacyDisposalBaseline,
  toLegacyDisposalActionEvidence,
  type ResolveLegacyDisposalBaselineInput,
} from "@/services/metal-legacy-disposal-baseline-service";
import type { MetalDetailLifecycleEventRecord } from "@/services/metal-detail-read-model-shaping";
import type { MetalDisposeGroupSnapshot } from "@/services/metal-disposed-evidence-service";
import type { MetalLifecycleIdentitySource } from "@/services/metal-lifecycle-identity-service";
import { terminalFactsFixture } from "./terminal-facts-fixture";

function originalDisposalPayload(): Readonly<Record<string, unknown>> {
  return {
    disposalDate: "2026-08-23",
    expectedHoldingRevision: "0",
    holdingId: "018f0c7a-1234-7abc-8def-000000000002",
    notes: null,
    predecessorEventId: null,
    reason: "given_away",
    reversesEventId: null,
  };
}

function originalDisposalGroup(
  overrides: Partial<MetalDisposeGroupSnapshot> = {}
): MetalDisposeGroupSnapshot {
  return {
    actionId: "018f0c7a-1234-7abc-8def-000000000004",
    deleted: false,
    domain: "metals",
    domainReferenceId: "018f0c7a-1234-7abc-8def-000000000002",
    kind: "dispose",
    state: "local_complete",
    userId: "018f0c7a-1234-7abc-8def-000000000001",
    outcomeJson: null,
    rejectionCode: null,
    serverOutcome: null,
    payloadJson: JSON.stringify({
      accountGuards: [],
      actionId: "018f0c7a-1234-7abc-8def-000000000004",
      domain: "metals",
      domainReferenceId: "018f0c7a-1234-7abc-8def-000000000002",
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "dispose",
      occurredAt: "2026-08-23T00:00:00.000Z",
      payload: originalDisposalPayload(),
      payloadVersion: "metals.dispose/v1",
      userId: "018f0c7a-1234-7abc-8def-000000000001",
    }),
    ...overrides,
  };
}

function originalDisposalEvent(): MetalDetailLifecycleEventRecord {
  return {
    actionId: "018f0c7a-1234-7abc-8def-000000000004",
    id: "018f0c7a-1234-7abc-8def-000000000005",
    deleted: false,
    holdingId: "018f0c7a-1234-7abc-8def-000000000002",
    userId: "018f0c7a-1234-7abc-8def-000000000001",
    kind: "dispose",
    isEffective: true,
    isHistoryVisible: true,
    occurredAt: new Date("2026-08-23T00:00:00.000Z"),
    predecessorEventId: null,
    reversesEventId: null,
    payloadJson: JSON.stringify(originalDisposalPayload()),
  };
}

function originalDisposalEvidence(): ReturnType<
  typeof toLegacyDisposalActionEvidence
> {
  return toLegacyDisposalActionEvidence(
    [originalDisposalEvent()],
    [originalDisposalGroup()]
  );
}

function legacyAsset(): MetalDetailAssetInput {
  return {
    acquisitionActionId: null,
    id: "018f0c7a-1234-7abc-8def-000000000002",
    name: "Legacy coin",
    notes: null,
    purchaseCurrency: "USD",
    purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
    purchasePriceDecimal: "1000",
    userId: "018f0c7a-1234-7abc-8def-000000000001",
  };
}

function legacyDisposedHoldingState(): MetalDetailHoldingStateInput {
  return {
    effectiveActionId: "018f0c7a-1234-7abc-8def-000000000004",
    effectiveEventId: "018f0c7a-1234-7abc-8def-000000000005",
    holdingId: "018f0c7a-1234-7abc-8def-000000000002",
    isVisible: true,
    reconciliationState: "accepted",
    status: "disposed",
    userId: "018f0c7a-1234-7abc-8def-000000000001",
  };
}

function legacyActiveAfterUndoHoldingState(): MetalDetailHoldingStateInput {
  return {
    effectiveActionId: "undo-action-1",
    effectiveEventId: "undo-event-1",
    holdingId: "018f0c7a-1234-7abc-8def-000000000002",
    isVisible: true,
    reconciliationState: "accepted",
    status: "active",
    userId: "018f0c7a-1234-7abc-8def-000000000001",
  };
}

function legacyDisposedEvent(): MetalDetailLifecycleEventInput {
  return {
    actionId: "018f0c7a-1234-7abc-8def-000000000004",
    actionState: "accepted",
    id: "018f0c7a-1234-7abc-8def-000000000005",
    isEffective: true,
    isHistoryVisible: true,
    kind: "dispose",
    occurredAt: new Date("2026-08-23T00:00:00.000Z"),
    payloadJson: JSON.stringify(originalDisposalPayload()),
    predecessorEventId: null,
    reversesEventId: null,
  };
}

function legacyUndoEvent(): MetalDetailLifecycleEventInput {
  return {
    actionId: "undo-action-1",
    actionState: "accepted",
    id: "undo-event-1",
    isEffective: true,
    isHistoryVisible: true,
    kind: "undo",
    occurredAt: new Date("2026-08-24T00:00:00.000Z"),
    predecessorEventId: "018f0c7a-1234-7abc-8def-000000000005",
    reversesEventId: "018f0c7a-1234-7abc-8def-000000000005",
  };
}

function legacyMetal(): MetalDetailMetalInput {
  return {
    itemForm: "coin",
    metalType: "GOLD",
    purityCatalogVersion: "1",
    purityCode: "gold-9999",
    purityFactorDecimal: "0.9999",
    weightGramsDecimal: "10",
  };
}

function legacyDisposedDetailInput(): BuildMetalDetailReadModelInput {
  return {
    asset: legacyAsset(),
    holdingState: legacyDisposedHoldingState(),
    legacyDisposalRevisionEvidence: [
      {
        actionId: "018f0c7a-1234-7abc-8def-000000000004",
        canonicalHoldingRevision: "1",
        deleted: false,
        expectedHoldingRevision: "0",
        holdingId: "018f0c7a-1234-7abc-8def-000000000002",
        kind: "dispose",
        userId: "018f0c7a-1234-7abc-8def-000000000001",
      },
    ],
    legacyDisposalActionEvidence: originalDisposalEvidence(),
    lifecycleEvents: [legacyDisposedEvent()],
    metal: legacyMetal(),
    rateReferences: [],
    terminalFacts: {
      ...terminalFactsFixture("disposed"),
      actionId: "018f0c7a-1234-7abc-8def-000000000004",
    },
    userId: "018f0c7a-1234-7abc-8def-000000000001",
  };
}

function legacyActiveAfterUndoDetailInput(): BuildMetalDetailReadModelInput {
  return {
    asset: legacyAsset(),
    holdingState: legacyActiveAfterUndoHoldingState(),
    legacyDisposalRevisionEvidence: [
      {
        actionId: "018f0c7a-1234-7abc-8def-000000000004",
        canonicalHoldingRevision: "1",
        deleted: false,
        expectedHoldingRevision: "0",
        holdingId: "018f0c7a-1234-7abc-8def-000000000002",
        kind: "dispose",
        userId: "018f0c7a-1234-7abc-8def-000000000001",
      },
    ],
    legacyDisposalActionEvidence: originalDisposalEvidence(),
    lifecycleEvents: [legacyDisposedEvent(), legacyUndoEvent()],
    metal: legacyMetal(),
    rateReferences: [],
    terminalFacts: null,
    userId: "018f0c7a-1234-7abc-8def-000000000001",
  };
}

function baselineSource(
  input: BuildMetalDetailReadModelInput
): ResolveLegacyDisposalBaselineInput {
  return {
    assetId: input.asset.id,
    userId: input.userId,
    holdingState: input.holdingState,
    lifecycleEvents: input.lifecycleEvents,
    terminalFacts: input.terminalFacts ?? null,
    revisionEvidence: input.legacyDisposalRevisionEvidence ?? null,
    actionEvidence: input.legacyDisposalActionEvidence ?? null,
  };
}

interface HistoricalOriginalDisposalProof extends ResolveLegacyDisposalBaselineInput {
  readonly lifecycleEvents: readonly MetalDetailLifecycleEventInput[];
}

// Build the historical action as recorded on its originating device.
// Its recorded civil date may be later than Cairo's day at the same UTC instant.
function historicalOriginalDisposalProof(
  occurredAtIso: string,
  recordedDisposalDate: string
): HistoricalOriginalDisposalProof {
  const input = legacyActiveAfterUndoDetailInput();
  const occurredAt = new Date(occurredAtIso);
  const payload = {
    ...originalDisposalPayload(),
    disposalDate: recordedDisposalDate,
  };
  const originalEnvelope: unknown = JSON.parse(
    originalDisposalGroup().payloadJson
  );
  if (
    originalEnvelope === null ||
    typeof originalEnvelope !== "object" ||
    Array.isArray(originalEnvelope)
  ) {
    throw new Error("invalid_disposal_envelope_fixture");
  }
  const event = {
    ...originalDisposalEvent(),
    occurredAt,
    payloadJson: JSON.stringify(payload),
  };
  const group = originalDisposalGroup({
    payloadJson: JSON.stringify({
      ...originalEnvelope,
      occurredAt: occurredAtIso,
      payload,
    }),
  });
  return {
    ...baselineSource(input),
    lifecycleEvents: [
      { ...legacyDisposedEvent(), occurredAt, payloadJson: event.payloadJson },
      {
        ...legacyUndoEvent(),
        occurredAt: new Date(occurredAt.getTime() + 60_000),
      },
    ],
    actionEvidence: toLegacyDisposalActionEvidence([event], [group]),
  };
}

describe("legacy disposal baseline read model (issue #338)", () => {
  it.each([
    undefined,
    {
      state: "rejected_compensating",
      serverOutcome: "rejected",
      outcomeJson: "{}",
      rejectionCode: "rejected",
    },
    {
      state: "reconciliation_incomplete",
      rejectionCode: "reconciliation_required",
    },
    {
      state: "reconciled",
      serverOutcome: "stale",
      outcomeJson: "{}",
      rejectionCode: "stale_revision",
    },
    { state: "accepted", serverOutcome: null },
    { state: "local_complete", rejectionCode: "rejected" },
    { userId: "018f0c7a-1234-7abc-8def-000000000099" },
    { domainReferenceId: "018f0c7a-1234-7abc-8def-000000000099" },
    { deleted: true },
    { payloadJson: "{}" },
  ] satisfies ReadonlyArray<Partial<MetalDisposeGroupSnapshot> | undefined>)(
    "rejects an unproven original group through production event shaping (%j)",
    (overrides): void => {
      const input = legacyActiveAfterUndoDetailInput();
      const event = originalDisposalEvent();
      const groups =
        overrides === undefined ? [] : [originalDisposalGroup(overrides)];
      const invalid = {
        ...input,
        lifecycleEvents: [
          ...shapeMetalDetailLifecycleEvents(
            [event],
            input.legacyDisposalRevisionEvidence ?? []
          ),
          legacyUndoEvent(),
        ],
        legacyDisposalActionEvidence: toLegacyDisposalActionEvidence(
          [event],
          groups
        ),
      };
      expect(invalid.lifecycleEvents[0].actionState).toBe("accepted");
      expect(resolveLegacyDisposalBaseline(baselineSource(invalid))).toBeNull();
      expect(buildMetalDetailReadModel(invalid)).toBeNull();
    }
  );

  it.each([
    { expectedHoldingRevision: "1" },
    { predecessorEventId: "018f0c7a-1234-7abc-8def-000000000003" },
    { holdingId: "018f0c7a-1234-7abc-8def-000000000099" },
    { reason: "not-a-disposal-reason" },
  ])("rejects immutable root payload mismatch (%j)", (payloadChanges): void => {
    const input = legacyActiveAfterUndoDetailInput();
    const event = {
      ...originalDisposalEvent(),
      payloadJson: JSON.stringify({
        ...originalDisposalPayload(),
        ...payloadChanges,
      }),
    };
    const invalid = {
      ...input,
      lifecycleEvents: [
        ...shapeMetalDetailLifecycleEvents(
          [event],
          input.legacyDisposalRevisionEvidence ?? []
        ),
        legacyUndoEvent(),
      ],
      legacyDisposalActionEvidence: toLegacyDisposalActionEvidence(
        [event],
        [originalDisposalGroup()]
      ),
    };
    expect(resolveLegacyDisposalBaseline(baselineSource(invalid))).toBeNull();
    expect(buildMetalDetailReadModel(invalid)).toBeNull();
  });

  it.each([
    { state: "local_complete" },
    { state: "sync_pending" },
    { state: "sync_failed", rejectionCode: "network_error" },
    { state: "accepted", serverOutcome: "accepted", outcomeJson: "{}" },
  ] satisfies ReadonlyArray<Partial<MetalDisposeGroupSnapshot>>)(
    "accepts valid root state evidence (%j)",
    (overrides): void => {
      const input = legacyActiveAfterUndoDetailInput();
      const valid = {
        ...input,
        legacyDisposalActionEvidence: toLegacyDisposalActionEvidence(
          [originalDisposalEvent()],
          [originalDisposalGroup(overrides)]
        ),
      };
      expect(buildMetalDetailReadModel(valid)?.status).toBe("active");
    }
  );

  it.each([
    {
      accountGuards: [
        {
          accountId: "018f0c7a-1234-7abc-8def-000000000099",
          expectedRevision: "0",
        },
      ],
    },
    { userId: "018f0c7a-1234-7abc-8def-000000000099" },
    { actionId: "018f0c7a-1234-7abc-8def-000000000099" },
    { payloadVersion: "metals.dispose/v2" },
  ])("rejects original immutable envelope mutation (%j)", (mutation): void => {
    const input = legacyActiveAfterUndoDetailInput();
    const group = originalDisposalGroup();
    const envelope: unknown = JSON.parse(group.payloadJson);
    if (
      typeof envelope !== "object" ||
      envelope === null ||
      Array.isArray(envelope)
    )
      throw new Error("invalid fixture");
    const invalid = {
      ...input,
      legacyDisposalActionEvidence: toLegacyDisposalActionEvidence(
        [originalDisposalEvent()],
        [
          {
            ...group,
            payloadJson: JSON.stringify({ ...envelope, ...mutation }),
          },
        ]
      ),
    };
    expect(buildMetalDetailReadModel(invalid)).toBeNull();
  });

  it.each([
    { userId: "018f0c7a-1234-7abc-8def-000000000099" },
    { holdingId: "018f0c7a-1234-7abc-8def-000000000099" },
    { deleted: true },
    { occurredAt: new Date("2026-08-22T00:00:00.000Z") },
    { predecessorEventId: "018f0c7a-1234-7abc-8def-000000000003" },
  ])("rejects mismatched owned root event (%j)", (mutation): void => {
    const input = legacyActiveAfterUndoDetailInput();
    const invalid = {
      ...input,
      legacyDisposalActionEvidence: toLegacyDisposalActionEvidence(
        [{ ...originalDisposalEvent(), ...mutation }],
        [originalDisposalGroup()]
      ),
    };
    expect(buildMetalDetailReadModel(invalid)).toBeNull();
  });

  it("rejects ambiguous original action groups", (): void => {
    const input = legacyActiveAfterUndoDetailInput();
    const invalid = {
      ...input,
      legacyDisposalActionEvidence: toLegacyDisposalActionEvidence(
        [originalDisposalEvent()],
        [originalDisposalGroup(), originalDisposalGroup()]
      ),
    };
    expect(buildMetalDetailReadModel(invalid)).toBeNull();
  });

  it("requires the shaped root payload to match the proven original event", (): void => {
    const input = legacyActiveAfterUndoDetailInput();
    const invalid = {
      ...input,
      lifecycleEvents: [
        { ...legacyDisposedEvent(), payloadJson: "{}" },
        legacyUndoEvent(),
      ],
    };
    expect(buildMetalDetailReadModel(invalid)).toBeNull();
  });

  it("supports raw owned persistence snapshots for restored legacy command eligibility", (): void => {
    const input = legacyActiveAfterUndoDetailInput();
    expect(
      resolveLegacyDisposalBaseline({
        ...baselineSource(input),
        lifecycleEvents: [
          originalDisposalEvent(),
          { ...originalDisposalEvent(), ...legacyUndoEvent() },
        ],
      })
    ).toEqual({ terminalEventId: "018f0c7a-1234-7abc-8def-000000000005" });
  });

  it("validates the production-shaped owned root after projection advances", (): void => {
    const input = legacyActiveAfterUndoDetailInput();
    const shaped = {
      ...input,
      lifecycleEvents: [
        ...shapeMetalDetailLifecycleEvents(
          [originalDisposalEvent()],
          input.legacyDisposalRevisionEvidence ?? []
        ),
        legacyUndoEvent(),
      ],
    };
    expect(buildMetalDetailReadModel(shaped)?.status).toBe("active");
    expect(buildMetalDetailReadModel(shaped)?.timeline).toHaveLength(2);
  });

  it("retains immutable original disposal evidence after the device clock rolls back", (): void => {
    const input = legacyActiveAfterUndoDetailInput();
    jest.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    try {
      expect(resolveLegacyDisposalBaseline(baselineSource(input))).toEqual({
        terminalEventId: originalDisposalEvent().id,
      });
      expect(buildMetalDetailReadModel(input)?.status).toBe("active");
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(["Asia/Dubai", "Pacific/Honolulu", "Africa/Cairo"])(
    "preserves Dubai-device Nov 15 disposal when current timezone changes to %s and clock rolls back",
    (deviceTimezone: string): void => {
      // Nov 15 00:30 in Dubai = Nov 14 20:30Z; Cairo still reads Nov 14.
      const savedTimezone: unknown = process.env.TZ;
      const previousTimezone =
        typeof savedTimezone === "string" ? savedTimezone : undefined;
      process.env.TZ = deviceTimezone;
      jest.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
      try {
        const proof = historicalOriginalDisposalProof(
          "2026-11-14T20:30:00.000Z",
          "2026-11-15"
        );
        expect(resolveLegacyDisposalBaseline(proof)).toEqual({
          terminalEventId: originalDisposalEvent().id,
        });
        const source = legacyActiveAfterUndoDetailInput();
        expect(
          buildMetalDetailReadModel({
            ...source,
            lifecycleEvents: proof.lifecycleEvents,
            legacyDisposalActionEvidence: proof.actionEvidence,
          })?.status
        ).toBe("active");
      } finally {
        jest.useRealTimers();
        if (previousTimezone === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = previousTimezone;
        }
      }
    }
  );

  it.each([
    ["2026-11-14T09:59:59.999Z", false],
    ["2026-11-14T10:00:00.000Z", true],
    ["2026-11-14T20:30:00.000Z", true],
  ] as const)(
    "uses the actual +14 device-calendar maximum at %s for Nov 15 (valid: %s)",
    (occurredAt, isValid): void => {
      const proof = historicalOriginalDisposalProof(occurredAt, "2026-11-15");
      const outcome = resolveLegacyDisposalBaseline(proof);
      expect(outcome !== null).toBe(isValid);
    }
  );

  it("rejects Nov 16 when the latest possible device date at the saved occurrence is Nov 15", (): void => {
    expect(
      resolveLegacyDisposalBaseline(
        historicalOriginalDisposalProof(
          "2026-11-14T20:30:00.000Z",
          "2026-11-16"
        )
      )
    ).toBeNull();
  });

  it("retains an intentionally backdated civil disposal date before its occurrence", (): void => {
    expect(
      resolveLegacyDisposalBaseline(
        historicalOriginalDisposalProof(
          "2026-11-14T20:30:00.000Z",
          "2026-11-01"
        )
      )
    ).toEqual({ terminalEventId: originalDisposalEvent().id });
  });

  it("keeps a verified legacy disposal readable in detail and History after its first action", (): void => {
    const input = legacyDisposedDetailInput();

    expect(resolveLegacyDisposalBaseline(baselineSource(input))).toEqual({
      terminalEventId: "018f0c7a-1234-7abc-8def-000000000005",
    });
    expect(
      resolveLegacyDisposalBaseline(
        baselineSource({
          ...input,
          legacyDisposalRevisionEvidence: [
            {
              actionId: "018f0c7a-1234-7abc-8def-000000000004",
              canonicalHoldingRevision: "1",
              deleted: false,
              expectedHoldingRevision: "1",
              holdingId: "018f0c7a-1234-7abc-8def-000000000002",
              kind: "dispose",
              userId: "018f0c7a-1234-7abc-8def-000000000001",
            },
          ],
        })
      )
    ).toBeNull();

    const model = buildMetalDetailReadModel(input);
    expect(model).toMatchObject({
      id: "018f0c7a-1234-7abc-8def-000000000002",
      isActiveOwnership: false,
      status: "disposed",
    });
    expect(model?.timeline.map((item) => item.id)).toEqual([
      "018f0c7a-1234-7abc-8def-000000000005",
    ]);

    const history = buildMetalHistoryReadModel({
      filter: "disposed",
      holdings: [
        {
          asset: input.asset,
          holdingState: input.holdingState,
          legacyDisposalRevisionEvidence: input.legacyDisposalRevisionEvidence,
          legacyDisposalActionEvidence: input.legacyDisposalActionEvidence,
          lifecycleEvents: input.lifecycleEvents,
          metal: input.metal,
          terminalFacts: input.terminalFacts,
        },
      ],
      userId: "018f0c7a-1234-7abc-8def-000000000001",
    });
    expect(history.items.map((item) => item.holdingId)).toEqual([
      "018f0c7a-1234-7abc-8def-000000000002",
    ]);
  });

  it("resolves the baseline and restores same holding to Active in detail after Undo (issue #338)", (): void => {
    const input = legacyActiveAfterUndoDetailInput();

    // Baseline must still resolve to the original legacy root event so the reducer has a valid root
    expect(resolveLegacyDisposalBaseline(baselineSource(input))).toEqual({
      terminalEventId: "018f0c7a-1234-7abc-8def-000000000005",
    });

    const model = buildMetalDetailReadModel(input);
    expect(model).not.toBeNull();
    expect(model).toMatchObject({
      id: "018f0c7a-1234-7abc-8def-000000000002",
      isActiveOwnership: true,
      status: "active",
    });
    // Timeline shows newest first: undo then original dispose
    expect(model?.timeline.map((item) => item.id)).toEqual([
      "undo-event-1",
      "018f0c7a-1234-7abc-8def-000000000005",
    ]);
  });

  it("rejects invalid or foreign lineage chains after Undo", (): void => {
    const input = legacyActiveAfterUndoDetailInput();

    // Rejects foreign user in revision evidence
    expect(
      resolveLegacyDisposalBaseline(
        baselineSource({
          ...input,
          legacyDisposalRevisionEvidence: [
            {
              actionId: "018f0c7a-1234-7abc-8def-000000000004",
              canonicalHoldingRevision: "1",
              deleted: false,
              expectedHoldingRevision: "0",
              holdingId: "018f0c7a-1234-7abc-8def-000000000002",
              kind: "dispose",
              userId: "foreign-user",
            },
          ],
        })
      )
    ).toBeNull();

    // Rejects if an 'add' event exists (not a legacy revision 0 first-lifecycle holding)
    expect(
      resolveLegacyDisposalBaseline(
        baselineSource({
          ...input,
          lifecycleEvents: [
            {
              actionId: "add-action",
              actionState: "accepted",
              id: "add-event",
              isEffective: true,
              isHistoryVisible: true,
              kind: "add",
              occurredAt: new Date("2026-08-01T00:00:00.000Z"),
              predecessorEventId: null,
            },
            ...input.lifecycleEvents,
          ],
        })
      )
    ).toBeNull();

    // Root proof survives rejected descendants; the reducer excludes them.
    const rejectedUndoInput = {
      ...input,
      lifecycleEvents: [
        legacyDisposedEvent(),
        { ...legacyUndoEvent(), actionState: "rejected" as const },
      ],
    };
    expect(
      resolveLegacyDisposalBaseline(baselineSource(rejectedUndoInput))
    ).toEqual({ terminalEventId: "018f0c7a-1234-7abc-8def-000000000005" });
    const rejectedUndoModel = buildMetalDetailReadModel(rejectedUndoInput);
    expect(rejectedUndoModel?.status).toBe("disposed");
    expect(rejectedUndoModel?.timeline.map(({ id }) => id)).toEqual([
      "018f0c7a-1234-7abc-8def-000000000005",
    ]);
  });

  function canonicalIdentitySource(): MetalLifecycleIdentitySource {
    return {
      userId: "018f0c7a-1234-7abc-8def-000000000001",
      holdingId: "018f0c7a-1234-7abc-8def-000000000002",
      events: [originalDisposalEvent()],
      groups: [{ ...originalDisposalGroup(), accountGuardsJson: "[]" }],
      evidence: [
        {
          actionId: originalDisposalEvent().actionId,
          canonicalHoldingRevision: "1",
          deleted: false,
          domainPayloadJson: JSON.stringify(originalDisposalPayload()),
          expectedHoldingRevision: "0",
          holdingId: originalDisposalEvent().holdingId,
          kind: "dispose",
          userId: originalDisposalEvent().userId,
        },
      ],
    };
  }

  it("builds Active after a new canonical Undo without rewriting legacy event rows", (): void => {
    const original = legacyActiveAfterUndoDetailInput();
    const canonicalId = originalDisposalEvent().actionId;
    const model = buildMetalDetailReadModel({
      ...original,
      identitySource: canonicalIdentitySource(),
      lifecycleEvents: [
        legacyDisposedEvent(),
        {
          ...legacyUndoEvent(),
          predecessorEventId: canonicalId,
          reversesEventId: canonicalId,
        },
      ],
    });
    expect(model?.status).toBe("active");
    expect(model?.isActiveOwnership).toBe(true);
    expect(model?.timeline).toHaveLength(2);
    expect(model?.timeline[1]?.id).toBe(canonicalId);
    expect(originalDisposalEvent().id).not.toBe(canonicalId);
  });

  it("does not silently server-accept an old Undo with E references", (): void => {
    const original = legacyActiveAfterUndoDetailInput();
    const model = buildMetalDetailReadModel({
      ...original,
      identitySource: canonicalIdentitySource(),
    });
    expect(model?.isActiveOwnership).toBe(false);
    expect(model?.status).toBe("disposed");
    expect(model?.timeline).toHaveLength(1);
  });

  it("preserves immutable history for recovery without fabricating Active when alias proof is missing", (): void => {
    const original = legacyActiveAfterUndoDetailInput();
    const unproved = {
      ...canonicalIdentitySource(),
      evidence: [],
    };
    expect(
      buildMetalDetailReadModel({ ...original, identitySource: unproved })
    ).toBeNull();
    expect(original.lifecycleEvents).toHaveLength(2);
    expect(original.legacyDisposalActionEvidence).toBeDefined();
  });

  it("retains original legacy root and complete Details timeline through repeated Dispose/Undo cycles", (): void => {
    const input = legacyActiveAfterUndoDetailInput();
    const secondDispose: MetalDetailLifecycleEventInput = {
      ...legacyDisposedEvent(),
      actionId: "dispose-action-2",
      id: "dispose-event-2",
      predecessorEventId: "undo-event-1",
      occurredAt: new Date("2026-08-25T00:00:00.000Z"),
    };
    const secondUndo: MetalDetailLifecycleEventInput = {
      ...legacyUndoEvent(),
      actionId: "undo-action-2",
      id: "undo-event-2",
      predecessorEventId: secondDispose.id,
      reversesEventId: secondDispose.id,
      occurredAt: new Date("2026-08-26T00:00:00.000Z"),
    };
    const secondDisposedInput: BuildMetalDetailReadModelInput = {
      ...input,
      holdingState: {
        ...input.holdingState,
        status: "disposed",
        effectiveActionId: "dispose-action-2",
        effectiveEventId: secondDispose.id,
      },
      lifecycleEvents: [...input.lifecycleEvents, secondDispose],
      terminalFacts: {
        ...terminalFactsFixture("disposed"),
        actionId: "dispose-action-2",
      },
    };
    expect(
      resolveLegacyDisposalBaseline(baselineSource(secondDisposedInput))
    ).toEqual({ terminalEventId: "018f0c7a-1234-7abc-8def-000000000005" });
    expect(buildMetalDetailReadModel(secondDisposedInput)?.status).toBe(
      "disposed"
    );
    const secondUndoInput: BuildMetalDetailReadModelInput = {
      ...secondDisposedInput,
      holdingState: {
        ...input.holdingState,
        effectiveActionId: "undo-action-2",
        effectiveEventId: secondUndo.id,
      },
      lifecycleEvents: [
        secondUndo,
        secondDispose,
        ...input.lifecycleEvents,
      ].reverse(),
      terminalFacts: null,
    };
    expect(
      resolveLegacyDisposalBaseline(baselineSource(secondUndoInput))
    ).toEqual({ terminalEventId: "018f0c7a-1234-7abc-8def-000000000005" });
    const restored = buildMetalDetailReadModel(secondUndoInput);
    expect(restored).toMatchObject({
      id: "018f0c7a-1234-7abc-8def-000000000002",
      status: "active",
      isActiveOwnership: true,
    });
    expect(restored?.timeline.map(({ id }) => id)).toEqual([
      secondUndo.id,
      secondDispose.id,
      "undo-event-1",
      "018f0c7a-1234-7abc-8def-000000000005",
    ]);
  });

  it.each(["rejected", "unknown"] as const)(
    "excludes a %s original disposal root",
    (actionState): void => {
      const input = legacyActiveAfterUndoDetailInput();
      const invalid = {
        ...input,
        lifecycleEvents: [
          { ...legacyDisposedEvent(), actionState },
          legacyUndoEvent(),
        ],
      };
      expect(resolveLegacyDisposalBaseline(baselineSource(invalid))).toBeNull();
      expect(buildMetalDetailReadModel(invalid)).toBeNull();
    }
  );
});
