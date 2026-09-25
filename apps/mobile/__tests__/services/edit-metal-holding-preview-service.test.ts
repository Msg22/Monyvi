import {
  compareMetalHoldingEdit,
  type EditableMetalHoldingFacts,
} from "../../services/edit-metal-holding-preview-service";

const original: EditableMetalHoldingFacts = {
  name: "Wedding coin",
  notes: "Gift",
  metal: "GOLD",
  weightGramsDecimal: "10.125",
  purityCode: "gold-999",
  purityCatalogVersion: "1",
  purityFactorDecimal: "0.999",
  purchasePriceDecimal: "47800",
  purchaseCurrency: "EGP",
  purchaseDate: "2024-03-14",
  physicalForm: "COIN",
};

describe("edit metal holding comparison", () => {
  it("keeps metadata changes out of the audited financial correction", (): void => {
    expect(
      compareMetalHoldingEdit({
        original,
        current: { ...original, name: "Wedding coin corrected" },
        holdingStatus: "active",
      })
    ).toMatchObject({
      hasMetadataChanges: true,
      hasMaterialChanges: false,
      requiresCorrectionReason: false,
      affectedFields: [],
    });
  });

  it("reports only changed material facts and clears them when restored", (): void => {
    const changed = compareMetalHoldingEdit({
      original,
      current: {
        ...original,
        weightGramsDecimal: "11.125",
        purchasePriceDecimal: "48000",
      },
      holdingStatus: "active",
    });
    expect(changed.affectedFields).toEqual(["weight", "purchasePrice"]);
    expect(changed.requiresCorrectionReason).toBe(true);
    expect(
      compareMetalHoldingEdit({
        original,
        current: { ...original },
        holdingStatus: "active",
      }).hasMaterialChanges
    ).toBe(false);
  });

  it("marks physical-form-only correction as non-financial", (): void => {
    expect(
      compareMetalHoldingEdit({
        original,
        current: { ...original, physicalForm: "BAR" },
        holdingStatus: "active",
      })
    ).toMatchObject({
      affectedFields: ["physicalForm"],
      hasFinancialConsequences: false,
    });
  });

  it("refuses material facts on terminal holdings", (): void => {
    expect(
      compareMetalHoldingEdit({
        original,
        current: { ...original, weightGramsDecimal: "12" },
        holdingStatus: "sold",
      })
    ).toMatchObject({
      hasMaterialChanges: true,
      isMaterialEditAllowed: false,
    });
  });
});
