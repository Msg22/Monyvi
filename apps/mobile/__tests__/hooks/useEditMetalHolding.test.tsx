import { act, renderHook } from "@testing-library/react-native";

import type {
  EditMetalHoldingReadModel,
  EditMetalHoldingSubmission,
} from "../../services/edit-metal-holding-facade-service";

const mockLoadEditableMetalHolding = jest.fn<
  Promise<EditMetalHoldingReadModel>,
  [string]
>();
const mockSaveEditedMetalHolding = jest.fn<
  Promise<void>,
  [EditMetalHoldingSubmission]
>();

jest.mock("../../services/edit-metal-holding-facade-service", () => ({
  loadEditableMetalHolding: (id: string): Promise<EditMetalHoldingReadModel> =>
    mockLoadEditableMetalHolding(id),
  saveEditedMetalHolding: (
    submission: EditMetalHoldingSubmission
  ): Promise<void> => mockSaveEditedMetalHolding(submission),
}));

import {
  useEditMetalHolding,
  type UseEditMetalHoldingInput,
} from "../../hooks/useEditMetalHolding";

function legacyModel(): EditMetalHoldingReadModel {
  return {
    holdingId: "018f0c7a-1234-7abc-8def-000000000010",
    financialRevision: "0",
    predecessorEventId: "018f0c7a-1234-7abc-8def-000000000011",
    status: "active",
    hasCompleteMaterialFacts: false,
    facts: {
      name: "Old Legacy Gold",
      notes: null,
      metal: "GOLD",
      weightGramsDecimal: "", // unrecorded legacy fact
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "", // unrecorded legacy fact
      purchaseCurrency: "EGP",
      purchaseDate: "2020-01-01",
      physicalForm: null,
    },
  };
}

function activeModel(): EditMetalHoldingReadModel {
  return {
    holdingId: "018f0c7a-1234-7abc-8def-000000000010",
    financialRevision: "0",
    predecessorEventId: "018f0c7a-1234-7abc-8def-000000000011",
    status: "active",
    hasCompleteMaterialFacts: true,
    facts: {
      name: "Active Gold Sovereign",
      notes: "Initial note",
      metal: "GOLD",
      weightGramsDecimal: "8",
      purityCode: "gold-999",
      purityCatalogVersion: "1",
      purityFactorDecimal: "0.999",
      purchasePriceDecimal: "32000",
      purchaseCurrency: "EGP",
      purchaseDate: "2026-08-01",
      physicalForm: "COIN",
    },
  };
}

function testInput(
  overrides: Partial<UseEditMetalHoldingInput> = {}
): UseEditMetalHoldingInput {
  let id = 0;
  return {
    holdingId: "018f0c7a-1234-7abc-8def-000000000010",
    locale: "en",
    today: "2026-09-01",
    safeRange: {
      maximumWeightGramsDecimal: "999999999.999",
      maximumPurchasePriceDecimal: "999999999999999.99",
    },
    getPreviewRates: () => ({
      metalUsdPerPureGramDecimal: "100",
      currencyUsdPerUnitDecimal: "0.02",
      egpUsdPerUnitDecimal: "0.02",
      currencyMinorUnits: 2,
      rateFreshness: "fresh",
    }),
    createId: () => `018f0c7a-1234-7abc-8def-${String(++id).padStart(12, "0")}`,
    ...overrides,
  };
}

describe("useEditMetalHolding correctness tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveEditedMetalHolding.mockResolvedValue(undefined);
  });

  describe("Gap 4: legacy holding metadata-only edits (FR-019, business-decisions 529-534)", () => {
    it("allows saving name/notes on legacy holdings with unrecorded purchase facts without validating missing material fields", async () => {
      mockLoadEditableMetalHolding.mockResolvedValue(legacyModel());

      const { result } = renderHook(() => useEditMetalHolding(testInput()));

      // Wait for model load
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.model?.hasCompleteMaterialFacts).toBe(false);

      // Edit metadata only
      act(() => {
        result.current.updateField("name", "Updated Legacy Name");
        result.current.updateField("notes", "New note added");
      });

      expect(result.current.comparison.hasMaterialChanges).toBe(false);
      expect(result.current.comparison.hasMetadataChanges).toBe(true);

      let success = false;
      await act(async () => {
        success = await result.current.submit();
      });

      expect(success).toBe(true);
      expect(mockSaveEditedMetalHolding).toHaveBeenCalledTimes(1);
      const call = mockSaveEditedMetalHolding.mock.calls[0]?.[0];
      expect(call.current).toMatchObject({
        name: "Updated Legacy Name",
        notes: "New note added",
        weightGramsDecimal: "",
        purchasePriceDecimal: "",
      });
      expect(call.correctionReason).toBeNull();
    });
  });

  describe("Gap 5: explicit stale-rate acknowledgment in Edit (FR-020/073-075)", () => {
    it("requires explicit acknowledgment when material changes are affected by stale rates", async () => {
      mockLoadEditableMetalHolding.mockResolvedValue(activeModel());

      const { result } = renderHook(() =>
        useEditMetalHolding(
          testInput({
            getPreviewRates: () => ({
              metalUsdPerPureGramDecimal: "100",
              currencyUsdPerUnitDecimal: "0.02",
              egpUsdPerUnitDecimal: "0.02",
              currencyMinorUnits: 2,
              rateFreshness: "stale", // Stale rate!
            }),
          })
        )
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Material change
      act(() => {
        result.current.updateField("weightGrams", "10");
        result.current.setCorrectionReason("Correction of weight");
      });

      expect(result.current.comparison.hasMaterialChanges).toBe(true);
      expect(
        (
          result.current as unknown as {
            requiresStaleRateAcknowledgment: boolean;
          }
        ).requiresStaleRateAcknowledgment
      ).toBe(true);

      // Submit before acknowledgment -> should fail
      let success = true;
      await act(async () => {
        success = await result.current.submit();
      });
      expect(success).toBe(false);
      expect(mockSaveEditedMetalHolding).not.toHaveBeenCalled();

      // Acknowledge stale rate and submit -> should succeed
      act(() => {
        (
          result.current as unknown as { acknowledgeStaleRate: () => void }
        ).acknowledgeStaleRate();
      });

      await act(async () => {
        success = await result.current.submit();
      });
      expect(success).toBe(true);
      expect(mockSaveEditedMetalHolding).toHaveBeenCalledTimes(1);
    });

    it("does NOT require stale rate acknowledgment for metadata-only edits even when rates are stale", async () => {
      mockLoadEditableMetalHolding.mockResolvedValue(activeModel());

      const { result } = renderHook(() =>
        useEditMetalHolding(
          testInput({
            getPreviewRates: () => ({
              metalUsdPerPureGramDecimal: "100",
              currencyUsdPerUnitDecimal: "0.02",
              egpUsdPerUnitDecimal: "0.02",
              currencyMinorUnits: 2,
              rateFreshness: "stale",
            }),
          })
        )
      );

      await act(async () => {
        await Promise.resolve();
      });

      // Only metadata edit
      act(() => {
        result.current.updateField("name", "Just Renamed");
      });

      expect(result.current.comparison.hasMaterialChanges).toBe(false);
      expect(
        (
          result.current as unknown as {
            requiresStaleRateAcknowledgment: boolean;
          }
        ).requiresStaleRateAcknowledgment
      ).toBe(false);

      let success = false;
      await act(async () => {
        success = await result.current.submit();
      });
      expect(success).toBe(true);
      expect(mockSaveEditedMetalHolding).toHaveBeenCalledTimes(1);
    });
  });
});
