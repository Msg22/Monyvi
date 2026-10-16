import {
  shapeMetalHistoryOutcome,
  classifyMetalRecentHistoryOutcome,
} from "@/services/metal-portfolio-history-outcome-service";
import {
  buildMetalPortfolioReadModel,
  observePortfolioRecentHistory,
  observePortfolioEffectiveActionEvidence,
  shapeMetalPortfolioHoldings,
} from "@/services/metal-portfolio-read-model-service";
import type {
  MetalDisposeEventSnapshot,
  MetalDisposeGroupSnapshot,
  MetalDisposeHoldingSnapshot,
} from "@/services/metal-disposed-evidence-service";
import type { LiveRatesTrustReadModel } from "@/services/live-rates-trust-read-model-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000002";
const ACTION_ID = "018f0c7a-1234-7abc-8def-000000000004";
const EVENT_ID = "018f0c7a-1234-7abc-8def-000000000005";

const mockAssetsCollection = { table: "assets" };
const mockHoldingStatesCollection = { table: "metal_holding_states" };
const mockLifecycleEventsCollection = { table: "metal_lifecycle_events" };
const mockActionEvidenceCollection = { table: "metal_action_evidence" };
const mockSellGroupsCollection = { table: "financial_action_groups" };
const mockSaleRateReferencesCollection = { table: "metal_rate_references" };
const mockQueryOwned = jest.fn();

interface QueryCondition {
  readonly kind: "take" | "where" | "sortBy";
  readonly column?: string;
  readonly value: unknown;
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => {
      if (table === "assets") return mockAssetsCollection;
      if (table === "metal_holding_states") return mockHoldingStatesCollection;
      if (table === "metal_lifecycle_events")
        return mockLifecycleEventsCollection;
      if (table === "metal_action_evidence")
        return mockActionEvidenceCollection;
      if (table === "financial_action_groups") return mockSellGroupsCollection;
      if (table === "metal_rate_references")
        return mockSaleRateReferencesCollection;
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    desc: "desc",
    oneOf: (values: readonly unknown[]): unknown => ({ oneOf: values }),
    sortBy: (column: string, value: unknown): QueryCondition => ({
      kind: "sortBy",
      column,
      value,
    }),
    take: (value: number): QueryCondition => ({ kind: "take", value }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

interface DisposalVariants {
  readonly omitGroup?: boolean;
  readonly invalidGroupJson?: boolean;
  readonly mismatchedEventReason?: string;
  readonly foreignGroup?: boolean;
}

function disposalPayload(reason: string): Record<string, unknown> {
  return {
    disposalDate: "2026-08-24",
    expectedHoldingRevision: "1",
    holdingId: HOLDING_ID,
    notes: null,
    predecessorEventId: "018f0c7a-1234-7abc-8def-000000000003",
    reason,
    reversesEventId: null,
  };
}

function disposalEnvelopeJson(reason: string): string {
  return JSON.stringify({
    accountGuards: [],
    actionId: ACTION_ID,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "dispose",
    occurredAt: "2026-08-24T12:00:00.000Z",
    payload: disposalPayload(reason),
    payloadVersion: "metals.dispose/v1",
    userId: USER_ID,
  });
}

function outcomeSnapshots(
  reason: string,
  variants: DisposalVariants = {}
): {
  readonly event: MetalDisposeEventSnapshot;
  readonly group: MetalDisposeGroupSnapshot | null;
  readonly holding: MetalDisposeHoldingSnapshot;
} {
  return {
    event: {
      actionId: ACTION_ID,
      deleted: false,
      holdingId: HOLDING_ID,
      id: EVENT_ID,
      isEffective: true,
      kind: "dispose",
      payloadJson: JSON.stringify({
        ...disposalPayload(reason),
        reason: variants.mismatchedEventReason ?? reason,
      }),
      userId: USER_ID,
    },
    group: variants.omitGroup
      ? null
      : {
          actionId: ACTION_ID,
          deleted: false,
          domain: "metals",
          domainReferenceId: HOLDING_ID,
          kind: "dispose",
          outcomeJson: null,
          payloadJson: variants.invalidGroupJson
            ? "{bad JSON"
            : disposalEnvelopeJson(reason),
          rejectionCode: null,
          serverOutcome: null,
          state: "local_complete",
          userId: variants.foreignGroup ? "foreign-user" : USER_ID,
        },
    holding: {
      effectiveActionId: ACTION_ID,
      effectiveEventId: EVENT_ID,
      holdingId: HOLDING_ID,
      isVisible: true,
      reconciliationState: "accepted",
      status: "disposed",
      userId: USER_ID,
    },
  };
}

function outcomeInput(
  reason: string,
  variants: DisposalVariants = {}
): Parameters<typeof shapeMetalHistoryOutcome>[0] {
  const snapshots = outcomeSnapshots(reason, variants);
  return {
    event: snapshots.event,
    group: snapshots.group,
    holding: snapshots.holding,
    latestAllowedCalendarDate: "2026-09-01",
    soldResultDecimal: null,
    status: "disposed",
    userId: USER_ID,
  };
}

function disposalShapingInput(
  reason: string
): Parameters<typeof shapeMetalPortfolioHoldings>[0] {
  const observedAt = new Date("2026-09-01T11:59:59.000Z");
  const rates: LiveRatesTrustReadModel = {
    currencies: new Map([
      [
        "EGP",
        {
          state: "fresh",
          ageMs: 1_000,
          providerObservedAt: observedAt,
          valueDecimal: "0.02",
        },
      ],
      [
        "USD",
        {
          state: "fresh",
          ageMs: 1_000,
          providerObservedAt: observedAt,
          valueDecimal: "1",
        },
      ],
    ]),
    gold: {
      state: "fresh",
      ageMs: 1_000,
      providerObservedAt: observedAt,
      valueDecimal: "100",
    },
    silver: {
      state: "fresh",
      ageMs: 1_000,
      providerObservedAt: observedAt,
      valueDecimal: "2",
    },
  };
  return {
    actionEvidence: [
      {
        actionId: ACTION_ID,
        deleted: false,
        holdingId: HOLDING_ID,
        kind: "dispose",
        userId: USER_ID,
      },
    ],
    actionGroups: [
      {
        actionId: ACTION_ID,
        deleted: false,
        domain: "metals",
        domainReferenceId: HOLDING_ID,
        kind: "dispose",
        outcomeJson: null,
        payloadJson: disposalEnvelopeJson(reason),
        rejectionCode: null,
        serverOutcome: null,
        state: "local_complete",
        userId: USER_ID,
      },
    ],
    assetMetals: [
      {
        assetId: HOLDING_ID,
        deleted: false,
        itemForm: "COIN",
        metalType: "GOLD",
        purityCatalogVersion: "1",
        purityCode: "gold-500",
        purityFactorDecimal: "0.5",
        weightGramsDecimal: "10",
      },
    ],
    assets: [
      {
        acquisitionActionId: null,
        createdAt: new Date("2024-01-01T10:00:00.000Z"),
        id: HOLDING_ID,
        name: "Exact gold",
        purchaseCurrency: "EGP",
        purchaseDate: new Date("2024-01-01T00:00:00.000Z"),
        purchasePriceDecimal: "20000",
        userId: USER_ID,
      },
    ],
    currentRates: rates,
    holdingStates: [
      {
        deleted: false,
        effectiveActionId: ACTION_ID,
        effectiveEventId: EVENT_ID,
        holdingId: HOLDING_ID,
        isVisible: true,
        reconciliationState: "accepted",
        status: "disposed",
        userId: USER_ID,
      },
    ],
    latestAllowedCalendarDate: "2026-09-01",
    lifecycleEvents: [
      {
        actionId: ACTION_ID,
        deleted: false,
        holdingId: HOLDING_ID,
        id: EVENT_ID,
        isEffective: true,
        kind: "dispose",
        occurredAt: new Date("2026-08-24T12:00:00.000Z"),
        payloadJson: JSON.stringify(disposalPayload(reason)),
        userId: USER_ID,
      },
    ],
    preferredCurrency: "EGP",
    rateReferences: [],
    userId: USER_ID,
  };
}

const RESTORE_ACTION = "018f0c7a-1234-7abc-8def-000000000006";

function restoredLegacyPortfolioInput(
  undoTarget: string
): Parameters<typeof shapeMetalPortfolioHoldings>[0] {
  const original = disposalShapingInput("given_away");
  const originalAt = "2026-08-24T12:00:00.000Z";
  const restoredAt = "2026-08-25T12:00:00.000Z";
  const disposePayload = {
    ...disposalPayload("given_away"),
    expectedHoldingRevision: "0",
    predecessorEventId: null,
  };
  const undoPayload = {
    expectedHoldingRevision: "1",
    holdingId: HOLDING_ID,
    predecessorEventId: undoTarget,
    reversesEventId: undoTarget,
  };
  const disposeRoot = {
    ...original.actionGroups?.[0],
    actionId: ACTION_ID,
    deleted: false,
    domain: "metals",
    domainReferenceId: HOLDING_ID,
    kind: "dispose",
    outcomeJson: null,
    rejectionCode: null,
    serverOutcome: null,
    state: "local_complete",
    userId: USER_ID,
    payloadJson: JSON.stringify({
      accountGuards: [],
      actionId: ACTION_ID,
      domain: "metals",
      domainReferenceId: HOLDING_ID,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "dispose",
      occurredAt: originalAt,
      payload: disposePayload,
      payloadVersion: "metals.dispose/v1",
      userId: USER_ID,
    }),
  };
  return {
    ...original,
    actionGroups: [
      disposeRoot,
      {
        ...disposeRoot,
        actionId: RESTORE_ACTION,
        kind: "undo",
        payloadJson: JSON.stringify({
          accountGuards: [],
          actionId: RESTORE_ACTION,
          domain: "metals",
          domainReferenceId: HOLDING_ID,
          envelopeVersion: "monyvi.financial-action/v1",
          kind: "undo",
          occurredAt: restoredAt,
          payload: undoPayload,
          payloadVersion: "metals.undo/v1",
          userId: USER_ID,
        }),
      },
    ],
    actionEvidence: [
      {
        actionId: ACTION_ID,
        deleted: false,
        domainPayloadJson: JSON.stringify(disposePayload),
        expectedHoldingRevision: "0",
        canonicalHoldingRevision: "1",
        holdingId: HOLDING_ID,
        kind: "dispose",
        userId: USER_ID,
      },
      {
        actionId: RESTORE_ACTION,
        deleted: false,
        domainPayloadJson: JSON.stringify(undoPayload),
        expectedHoldingRevision: "1",
        canonicalHoldingRevision: "2",
        holdingId: HOLDING_ID,
        kind: "undo",
        userId: USER_ID,
      },
    ],
    holdingStates: [
      {
        deleted: false,
        effectiveActionId: RESTORE_ACTION,
        effectiveEventId: RESTORE_ACTION,
        holdingId: HOLDING_ID,
        isVisible: true,
        reconciliationState: "sync_pending",
        status: "active",
        userId: USER_ID,
      },
    ],
    lifecycleEvents: [
      {
        actionId: ACTION_ID,
        deleted: false,
        holdingId: HOLDING_ID,
        id: EVENT_ID,
        isEffective: true,
        isHistoryVisible: true,
        kind: "dispose",
        occurredAt: new Date(originalAt),
        payloadJson: JSON.stringify(disposePayload),
        predecessorEventId: null,
        reversesEventId: null,
        userId: USER_ID,
      },
      {
        actionId: RESTORE_ACTION,
        deleted: false,
        holdingId: HOLDING_ID,
        id: RESTORE_ACTION,
        isEffective: true,
        isHistoryVisible: true,
        kind: "undo",
        occurredAt: new Date(restoredAt),
        payloadJson: JSON.stringify(undoPayload),
        predecessorEventId: undoTarget,
        reversesEventId: undoTarget,
        userId: USER_ID,
      },
    ],
  };
}

function portfolioForRestoredLegacy(
  input: Parameters<typeof shapeMetalPortfolioHoldings>[0]
): ReturnType<typeof buildMetalPortfolioReadModel> {
  return buildMetalPortfolioReadModel({
    filter: "ALL",
    holdings: shapeMetalPortfolioHoldings(input),
    preferredCurrency: "EGP",
    rateStatus: { ageMs: 1_000, state: "fresh" },
    userId: USER_ID,
  });
}

describe("metal portfolio history outcome", () => {
  it.each([
    ["9007199254740993.123", "gain"],
    ["-9007199254740993.123", "loss"],
    ["0", "neutral"],
    [null, "neutral"],
    ["not-a-decimal", "neutral"],
  ] as const)(
    "classifies exact canonical realized sale result %s without JS number coercion",
    (value, expected): void => {
      expect(classifyMetalRecentHistoryOutcome("sold", value, null)).toBe(
        expected
      );
    }
  );

  it("maps over-precision canonical decimals to neutral instead of coercing", (): void => {
    const fiftyDigitLoss = `-${"9".repeat(50)}`;
    expect(
      classifyMetalRecentHistoryOutcome("sold", fiftyDigitLoss, null)
    ).toBe("loss");
    const fiftyOneDigitGain = "9".repeat(51);
    const fiftyOneDigitLoss = `-${"9".repeat(51)}.5`;
    expect(
      classifyMetalRecentHistoryOutcome("sold", fiftyOneDigitGain, null)
    ).toBe("neutral");
    expect(
      classifyMetalRecentHistoryOutcome("sold", fiftyOneDigitLoss, null)
    ).toBe("neutral");
  });

  it.each([
    ["lost_or_stolen", "loss"],
    ["destroyed_or_damaged", "loss"],
    ["other_write_off", "loss"],
    ["given_away", "neutral"],
    ["donated", "neutral"],
    ["other_external_transfer", "neutral"],
  ])(
    "shapes recent-History disposition outcome for validated %s as %s",
    (reason, expected): void => {
      expect(shapeMetalHistoryOutcome(outcomeInput(reason))).toBe(expected);
    }
  );

  it.each([
    ["missing action group", { omitGroup: true }],
    ["malformed group payload", { invalidGroupJson: true }],
    ["event and group payload mismatch", { mismatchedEventReason: "donated" }],
    ["foreign-user action group", { foreignGroup: true }],
  ])(
    "uses a neutral disposition outcome for %s instead of inventing a loss",
    (_label, variants): void => {
      expect(
        shapeMetalHistoryOutcome(outcomeInput("lost_or_stolen", variants))
      ).toBe("neutral");
    }
  );

  it("observes scoped complete holding histories and action evidence for repeated legacy cycles", (): void => {
    mockQueryOwned.mockClear();
    const state = restoredLegacyPortfolioInput(ACTION_ID).holdingStates;
    const queryInput = { userId: USER_ID, holdingStates: state };
    observePortfolioRecentHistory(queryInput);
    observePortfolioEffectiveActionEvidence(queryInput);
    const holdingSelector = {
      column: "holding_id",
      kind: "where",
      value: { oneOf: [HOLDING_ID] },
    };
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockLifecycleEventsCollection,
      USER_ID,
      holdingSelector,
      { column: "deleted", kind: "where", value: false },
      { column: "occurred_at", kind: "sortBy", value: "desc" }
    );
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockActionEvidenceCollection,
      USER_ID,
      holdingSelector,
      { column: "deleted", kind: "where", value: false }
    );
  });

  it.each([
    ["device-local E", EVENT_ID],
    ["server canonical D", ACTION_ID],
  ] as const)(
    "preserves a proven original rev0 Dispose before its first Restore (%s)",
    (_label, effectiveEventId): void => {
      const restored = restoredLegacyPortfolioInput(ACTION_ID);
      const [storedState] = restored.holdingStates;
      if (storedState === undefined) {
        throw new Error("missing_pre_restore_portfolio_state");
      }
      const preUndo = {
        ...restored,
        actionGroups: restored.actionGroups?.filter(
          (root) => root.actionId === ACTION_ID
        ),
        actionEvidence: restored.actionEvidence?.filter(
          (entry) => entry.actionId === ACTION_ID
        ),
        lifecycleEvents: restored.lifecycleEvents.filter(
          (entry) => entry.id === EVENT_ID
        ),
        holdingStates: [
          {
            ...storedState,
            effectiveActionId: ACTION_ID,
            effectiveEventId,
            status: "disposed",
          },
        ],
      } satisfies Parameters<typeof shapeMetalPortfolioHoldings>[0];
      const [holding] = shapeMetalPortfolioHoldings(preUndo);
      expect(holding).toMatchObject({
        status: "disposed",
        isEffective: true,
        isVisible: true,
      });
      const portfolio = portfolioForRestoredLegacy(preUndo);
      expect(portfolio.activeHoldings).toHaveLength(0);
      expect(portfolio.activeTotalDecimal).toBe("0");
      expect(portfolio.hasTerminalHistory).toBe(true);
      expect(portfolio.recentHistory).toHaveLength(1);
      expect(portfolio.recentHistory[0]?.status).toBe("disposed");
    }
  );

  it("excludes historical invalid E-linked Undo from effective Active wealth and totals", (): void => {
    const model = portfolioForRestoredLegacy(
      restoredLegacyPortfolioInput(EVENT_ID)
    );
    expect(model.activeHoldings).toHaveLength(0);
    expect(model.activeTotalDecimal).toBe("0");
    expect(model.holdings).toHaveLength(0);
  });

  it("does not count a restored holding when its predecessor evidence has not loaded", (): void => {
    const original = restoredLegacyPortfolioInput(ACTION_ID);
    const withoutPredecessor = {
      ...original,
      lifecycleEvents: original.lifecycleEvents.filter(
        (event) => event.id !== EVENT_ID
      ),
    };
    const model = portfolioForRestoredLegacy(withoutPredecessor);
    expect(model.activeHoldings).toHaveLength(0);
    expect(model.activeTotalDecimal).toBe("0");
  });

  it("includes proven original E != D after a valid D-linked offline Undo", (): void => {
    const model = portfolioForRestoredLegacy(
      restoredLegacyPortfolioInput(ACTION_ID)
    );
    expect(model.activeHoldings).toHaveLength(1);
    expect(model.activeHoldings[0]).toMatchObject({
      id: HOLDING_ID,
      isEffective: true,
      status: "active",
    });
    expect(model.activeTotalDecimal).toEqual(expect.any(String));
    expect(model.activeTotalDecimal).not.toBe("0");
  });

  it("includes a proven second Dispose then Restore cycle in Active totals", (): void => {
    const first = restoredLegacyPortfolioInput(ACTION_ID);
    const secondDispose = "018f0c7a-1234-7abc-8def-000000000007";
    const secondUndo = "018f0c7a-1234-7abc-8def-000000000008";
    const secondDisposePayload = {
      disposalDate: "2026-08-26",
      expectedHoldingRevision: "2",
      holdingId: HOLDING_ID,
      notes: null,
      predecessorEventId: RESTORE_ACTION,
      reason: "donated",
      reversesEventId: null,
    };
    const secondUndoPayload = {
      expectedHoldingRevision: "3",
      holdingId: HOLDING_ID,
      predecessorEventId: secondDispose,
      reversesEventId: secondDispose,
    };
    const firstGroup = first.actionGroups?.[0];
    if (firstGroup === undefined)
      throw new Error("missing_portfolio_test_root");
    const input: Parameters<typeof shapeMetalPortfolioHoldings>[0] = {
      ...first,
      actionGroups: [
        ...(first.actionGroups ?? []),
        {
          ...firstGroup,
          actionId: secondDispose,
          kind: "dispose",
          payloadJson: JSON.stringify(secondDisposePayload),
        },
        {
          ...firstGroup,
          actionId: secondUndo,
          kind: "undo",
          payloadJson: JSON.stringify(secondUndoPayload),
        },
      ],
      actionEvidence: [
        ...(first.actionEvidence ?? []),
        {
          actionId: secondDispose,
          deleted: false,
          domainPayloadJson: JSON.stringify(secondDisposePayload),
          expectedHoldingRevision: "2",
          canonicalHoldingRevision: "3",
          holdingId: HOLDING_ID,
          kind: "dispose",
          userId: USER_ID,
        },
        {
          actionId: secondUndo,
          deleted: false,
          domainPayloadJson: JSON.stringify(secondUndoPayload),
          expectedHoldingRevision: "3",
          canonicalHoldingRevision: "4",
          holdingId: HOLDING_ID,
          kind: "undo",
          userId: USER_ID,
        },
      ],
      holdingStates: [
        {
          deleted: false,
          effectiveActionId: secondUndo,
          effectiveEventId: secondUndo,
          holdingId: HOLDING_ID,
          isVisible: true,
          reconciliationState: "sync_pending",
          status: "active",
          userId: USER_ID,
        },
      ],
      lifecycleEvents: [
        ...first.lifecycleEvents,
        {
          actionId: secondDispose,
          deleted: false,
          holdingId: HOLDING_ID,
          id: secondDispose,
          isEffective: true,
          isHistoryVisible: true,
          kind: "dispose",
          occurredAt: new Date("2026-08-26T12:00:00.000Z"),
          payloadJson: JSON.stringify(secondDisposePayload),
          predecessorEventId: RESTORE_ACTION,
          reversesEventId: null,
          userId: USER_ID,
        },
        {
          actionId: secondUndo,
          deleted: false,
          holdingId: HOLDING_ID,
          id: secondUndo,
          isEffective: true,
          isHistoryVisible: true,
          kind: "undo",
          occurredAt: new Date("2026-08-27T12:00:00.000Z"),
          payloadJson: JSON.stringify(secondUndoPayload),
          predecessorEventId: secondDispose,
          reversesEventId: secondDispose,
          userId: USER_ID,
        },
      ],
    };
    const model = portfolioForRestoredLegacy(input);
    expect(model.activeHoldings).toHaveLength(1);
    expect(model.activeTotalDecimal).not.toBe("0");
  });

  it("keeps a canonical-only fresh Active holding effective without a legacy root", (): void => {
    const original = restoredLegacyPortfolioInput(ACTION_ID);
    const canonicalOnly = {
      ...original,
      lifecycleEvents: original.lifecycleEvents.map((event) =>
        event.id === EVENT_ID ? { ...event, id: ACTION_ID } : event
      ),
    };
    const model = portfolioForRestoredLegacy(canonicalOnly);
    expect(model.activeHoldings).toHaveLength(1);
    expect(model.activeTotalDecimal).toEqual(expect.any(String));
    expect(model.activeTotalDecimal).not.toBe("0");
  });

  it("keeps disposed sold results absent while shaping the validated outcome through the read model", (): void => {
    const [holding] = shapeMetalPortfolioHoldings(
      disposalShapingInput("lost_or_stolen")
    );
    expect(holding).toMatchObject({
      status: "disposed",
      isEffective: true,
      recentHistoryOutcome: "loss",
    });
    expect(holding?.soldResultDecimal).toBeNull();
  });
});
