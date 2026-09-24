jest.mock("@monyvi/db", () => ({}));
jest.mock("@/services/user-data-access", () => ({}));

import {
  buildMetalDetailReadModel,
  type BuildMetalDetailReadModelInput,
  type MetalDetailAssetInput,
  type MetalDetailHoldingStateInput,
  type MetalDetailLifecycleEventInput,
  type MetalDetailMetalInput,
} from "@/services/metal-detail-read-model-service";
import {
  buildMetalHistoryReadModel,
  type MetalHistoryHoldingInput,
} from "@/services/metal-history-read-model-service";
import {
  resolveLegacyDisposalBaseline,
  type ResolveLegacyDisposalBaselineInput,
} from "@/services/metal-legacy-disposal-baseline-service";
import { terminalFactsFixture } from "./terminal-facts-fixture";

function legacyAsset(): MetalDetailAssetInput {
  return {
    acquisitionActionId: null,
    id: "holding-1",
    name: "Legacy coin",
    notes: null,
    purchaseCurrency: "USD",
    purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
    purchasePriceDecimal: "1000",
    userId: "user-1",
  };
}

function legacyHoldingState(): MetalDetailHoldingStateInput {
  return {
    effectiveActionId: "legacy-dispose",
    effectiveEventId: "legacy-disposed",
    holdingId: "holding-1",
    isVisible: true,
    reconciliationState: "accepted",
    status: "disposed",
    userId: "user-1",
  };
}

function legacyDisposedEvent(): MetalDetailLifecycleEventInput {
  return {
    actionId: "legacy-dispose",
    actionState: "accepted",
    id: "legacy-disposed",
    isEffective: true,
    isHistoryVisible: true,
    kind: "dispose",
    occurredAt: new Date("2026-08-23T00:00:00.000Z"),
    predecessorEventId: null,
    reversesEventId: null,
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

function legacyDetailInput(): BuildMetalDetailReadModelInput {
  return {
    asset: legacyAsset(),
    holdingState: legacyHoldingState(),
    legacyDisposalRevisionEvidence: [
      {
        actionId: "legacy-dispose",
        canonicalHoldingRevision: "1",
        deleted: false,
        expectedHoldingRevision: "0",
        holdingId: "holding-1",
        kind: "dispose",
        userId: "user-1",
      },
    ],
    lifecycleEvents: [legacyDisposedEvent()],
    metal: legacyMetal(),
    rateReferences: [],
    terminalFacts: {
      ...terminalFactsFixture("disposed"),
      actionId: "legacy-dispose",
    },
    userId: "user-1",
  };
}

function legacyHistoryHolding(): MetalHistoryHoldingInput {
  const input = legacyDetailInput();
  return {
    asset: input.asset,
    holdingState: input.holdingState,
    legacyDisposalRevisionEvidence: input.legacyDisposalRevisionEvidence,
    lifecycleEvents: input.lifecycleEvents,
    metal: input.metal,
    terminalFacts: input.terminalFacts,
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
  };
}

describe("legacy disposal baseline read model", () => {
  it("keeps a verified legacy disposal readable in detail and History after its first action", (): void => {
    const input = legacyDetailInput();

    expect(resolveLegacyDisposalBaseline(baselineSource(input))).toEqual({
      terminalEventId: "legacy-disposed",
    });
    expect(
      resolveLegacyDisposalBaseline(
        baselineSource({
          ...input,
          legacyDisposalRevisionEvidence: [
            {
              actionId: "legacy-dispose",
              canonicalHoldingRevision: "1",
              deleted: false,
              expectedHoldingRevision: "1",
              holdingId: "holding-1",
              kind: "dispose",
              userId: "user-1",
            },
          ],
        })
      )
    ).toBeNull();

    const model = buildMetalDetailReadModel(input);
    expect(model).toMatchObject({
      id: "holding-1",
      isActiveOwnership: false,
      status: "disposed",
    });
    expect(model?.timeline.map((item) => item.id)).toEqual(["legacy-disposed"]);

    const history = buildMetalHistoryReadModel({
      filter: "disposed",
      holdings: [legacyHistoryHolding()],
      userId: "user-1",
    });
    expect(history.items.map((item) => item.holdingId)).toEqual(["holding-1"]);
  });
});
