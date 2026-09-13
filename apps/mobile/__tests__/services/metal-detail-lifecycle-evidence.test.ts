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
import { toDetailLifecycleEventInput } from "@/services/metal-detail-read-model-shaping";
import type {
  MetalActionEvidence,
  MetalLifecycleEvent,
} from "@monyvi/db";

interface EventInput {
  readonly actionState?: "accepted" | "rejected" | "unknown";
  readonly id: string;
  readonly isEffective?: boolean;
  readonly isHistoryVisible?: boolean;
  readonly kind: "add" | "correct" | "sell" | "dispose" | "delete" | "undo";
  readonly occurredAt: Date;
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
});
