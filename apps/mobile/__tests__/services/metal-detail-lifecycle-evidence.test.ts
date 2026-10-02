jest.mock("@monyvi/db", () => ({
  database: { get: jest.fn() },
}));

jest.mock("@/services/user-data-access", () => ({
  USER_DATA_ACCESS_ERROR_CODES: { AUTH_SCOPE_CHANGED: "AUTH_SCOPE_CHANGED" },
  findOwnedById: jest.fn(),
  getCurrentUserDataScope: jest.fn(),
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: jest.fn(),
}));

import {
  buildMetalDetailReadModel,
  type BuildMetalDetailReadModelInput,
} from "@/services/metal-detail-read-model-service";
import {
  selectCanonicalOrOnly,
  correctionChangesFromPayload,
  shapeMetalDetailLifecycleEvents,
  toDetailLifecycleEventInput,
} from "@/services/metal-detail-read-model-shaping";
import type { MetalActionEvidence, MetalLifecycleEvent } from "@monyvi/db";

interface EventInput {
  readonly actionState?: "accepted" | "rejected" | "unknown";
  readonly id: string;
  readonly isEffective?: boolean;
  readonly isHistoryVisible?: boolean;
  readonly kind: "add" | "correct" | "sell" | "dispose" | "delete" | "undo";
  readonly occurredAt: Date;
  readonly payloadJson?: string;
  readonly predecessorEventId: string | null;
  readonly reversesEventId?: string | null;
}

function event(overrides: Partial<EventInput> = {}): EventInput {
  return {
    actionState: "accepted",
    id: "created",
    isEffective: true,
    isHistoryVisible: true,
    kind: "add",
    occurredAt: new Date("2026-08-20T10:00:00.000Z"),
    predecessorEventId: null,
    reversesEventId: null,
    payloadJson: "{}",
    ...overrides,
  };
}

function detailInput(
  overrides: Partial<BuildMetalDetailReadModelInput> = {}
): BuildMetalDetailReadModelInput {
  return {
    asset: {
      acquisitionActionId: "action-add",
      id: "holding-1",
      name: "Gold coin",
      notes: null,
      purchaseCurrency: "USD",
      purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
      purchasePriceDecimal: "1000",
      userId: "user-1",
    },
    holdingState: {
      effectiveActionId: "action-add",
      effectiveEventId: "created",
      holdingId: "holding-1",
      isVisible: true,
      reconciliationState: "accepted",
      status: "active",
      userId: "user-1",
    },
    lifecycleEvents: [event()],
    metal: {
      itemForm: "coin",
      metalType: "GOLD",
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      weightGramsDecimal: "10",
    },
    rateReferences: [],
    userId: "user-1",
    ...overrides,
  };
}

describe("metal detail lifecycle evidence binding", () => {
  it("shows exact correction facts from the event payload, not the current asset", () => {
    const before = {
      weightGramsDecimal: "10",
      purityCode: "gold-9999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.9999",
      physicalForm: "COIN",
      purchasePriceDecimal: "1000",
      purchaseCurrency: "EGP",
      purchaseDate: "2026-08-01",
    };
    const payloadJson = JSON.stringify({
      materialCorrection: {
        before,
        after: {
          ...before,
          weightGramsDecimal: "12",
          physicalForm: "BAR",
          purchasePriceDecimal: "1200",
          purchaseCurrency: "USD",
        },
        reason: "",
      },
    });
    const model = buildMetalDetailReadModel(
      detailInput({
        metal: {
          itemForm: "bar",
          metalType: "GOLD",
          purityCatalogVersion: "1",
          purityCode: "gold-9999",
          purityFactorDecimal: "0.9999",
          weightGramsDecimal: "99",
        },
        lifecycleEvents: [
          event(),
          event({
            id: "corrected",
            kind: "correct",
            predecessorEventId: "created",
            occurredAt: new Date("2026-08-21T10:00:00.000Z"),
            payloadJson,
          }),
        ],
      })
    );
    expect(model?.timeline[0].correctionChanges).toEqual([
      { field: "weight", before: "10", after: "12" },
      { field: "physicalForm", before: "COIN", after: "BAR" },
      {
        field: "purchasePrice",
        before: "1000",
        after: "1200",
        beforeCurrency: "EGP",
        afterCurrency: "USD",
      },
      { field: "purchaseCurrency", before: "EGP", after: "USD" },
    ]);
  });

  it("does not invent old facts for malformed or incomplete correction evidence", () => {
    expect(correctionChangesFromPayload("{bad json")).toBeNull();
    expect(
      correctionChangesFromPayload(
        JSON.stringify({
          materialCorrection: {
            before: { weightGramsDecimal: "10" },
            after: { weightGramsDecimal: "12" },
          },
        })
      )
    ).toBeNull();
  });

  it("reads a legacy Add event as creation only when matching Add evidence exists", () => {
    const legacyEvent = {
      actionId: "action-add",
      deleted: false,
      holdingId: "holding-1",
      id: "legacy-event",
      isEffective: true,
      isHistoryVisible: true,
      kind: "created",
      occurredAt: new Date("2026-08-20T10:00:00.000Z"),
      payloadJson: "{}",
      predecessorEventId: null,
      reversesEventId: null,
      userId: "user-1",
    } as unknown as MetalLifecycleEvent;
    const boundEvidence = [
      {
        actionId: "action-add",
        deleted: false,
        holdingId: "holding-1",
        kind: "add",
        userId: "user-1",
      },
    ] as unknown as readonly MetalActionEvidence[];
    expect(
      toDetailLifecycleEventInput(legacyEvent, boundEvidence)
    ).toMatchObject({
      actionState: "accepted",
      kind: "add",
    });
    expect(toDetailLifecycleEventInput(legacyEvent, [])).toBeNull();
  });

  it("prefers canonical rows and excludes a superseded legacy creation event", () => {
    expect(
      selectCanonicalOrOnly(
        [{ id: "legacy" }, { id: "holding-1" }],
        "holding-1"
      )
    ).toEqual({ id: "holding-1" });
    expect(
      selectCanonicalOrOnly(
        [{ id: "legacy-a" }, { id: "legacy-b" }],
        "holding-1"
      )
    ).toBeNull();
    const boundEvidence = [
      {
        actionId: "action-add",
        deleted: false,
        holdingId: "holding-1",
        kind: "add",
        userId: "user-1",
      },
    ] as unknown as readonly MetalActionEvidence[];
    const legacyEvent = {
      actionId: "action-add",
      deleted: false,
      holdingId: "holding-1",
      id: "legacy-event",
      isEffective: true,
      isHistoryVisible: true,
      kind: "created",
      occurredAt: new Date("2026-08-20T10:00:00.000Z"),
      payloadJson: "{}",
      predecessorEventId: null,
      reversesEventId: null,
      userId: "user-1",
    } as unknown as MetalLifecycleEvent;
    const canonicalEvent = {
      ...legacyEvent,
      id: "action-add",
      kind: "add",
    } as unknown as MetalLifecycleEvent;
    expect(
      shapeMetalDetailLifecycleEvents(
        [legacyEvent, canonicalEvent],
        boundEvidence
      ).map((item) => item.id)
    ).toEqual(["action-add"]);
  });
  it("keeps an effective lifecycle event recovery-only until its action evidence arrives", () => {
    const model = buildMetalDetailReadModel(
      detailInput({
        lifecycleEvents: [
          event(),
          event({
            actionState: "unknown",
            id: "sold",
            kind: "sell",
            occurredAt: new Date("2026-08-21T10:00:00.000Z"),
            predecessorEventId: "created",
          }),
        ],
      })
    );

    expect(model).toMatchObject({ isActiveOwnership: true, status: "active" });
    expect(model?.timeline.map((item) => item.id)).toEqual(["created"]);
  });

  it("drops a lifecycle event with an invalid occurredAt instead of emitting NaN", () => {
    expect(
      toDetailLifecycleEventInput(
        {
          actionId: "action-add",
          deleted: false,
          holdingId: "holding-1",
          id: "created",
          isEffective: true,
          isHistoryVisible: true,
          kind: "add",
          occurredAt: new Date("invalid"),
          payloadJson: "{}",
          predecessorEventId: null,
          reversesEventId: null,
          userId: "user-1",
        } as unknown as MetalLifecycleEvent,
        [
          {
            actionId: "action-add",
            deleted: false,
            holdingId: "holding-1",
            kind: "add",
            userId: "user-1",
          },
        ] as unknown as readonly MetalActionEvidence[]
      )
    ).toBeNull();
  });

  it("successfully evaluates current observation value with trusted non-USD currency rates", () => {
    const model = buildMetalDetailReadModel(
      detailInput({
        preferredCurrency: "EGP",
        currentRates: {
          gold: {
            state: "fresh",
            valueDecimal: "80.00",
            ageMs: 500,
            providerObservedAt: new Date("2026-08-20T10:00:00.000Z"),
          },
          silver: {
            state: "fresh",
            valueDecimal: "1.00",
            ageMs: 500,
            providerObservedAt: new Date("2026-08-20T10:00:00.000Z"),
          },
          currencies: new Map([
            [
              "EGP",
              {
                state: "fresh",
                valueDecimal: "0.02",
                ageMs: 500,
                providerObservedAt: new Date("2026-08-20T10:00:00.000Z"),
              },
            ],
          ]),
        },
      })
    );

    expect(model).not.toBeNull();
    expect(model?.currentValueCurrency).toBe("EGP");
    expect(model?.currentValueDecimal).not.toBeNull();
  });
});
