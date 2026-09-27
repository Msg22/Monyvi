import {
  compareMetalHoldingEdit,
  normalizeEditPhysicalForm,
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

describe("normalizeEditPhysicalForm", () => {
  it("passes through canonical uppercase forms", (): void => {
    expect(normalizeEditPhysicalForm("COIN")).toBe("COIN");
    expect(normalizeEditPhysicalForm("BAR")).toBe("BAR");
    expect(normalizeEditPhysicalForm("JEWELRY")).toBe("JEWELRY");
  });

  it("normalizes lowercase seed/QA rows so the edit form can preselect them", (): void => {
    expect(normalizeEditPhysicalForm("coin")).toBe("COIN");
    expect(normalizeEditPhysicalForm("bar")).toBe("BAR");
    expect(normalizeEditPhysicalForm("jewelry")).toBe("JEWELRY");
  });

  it("trims whitespace and ignores case", (): void => {
    expect(normalizeEditPhysicalForm(" Coin ")).toBe("COIN");
    expect(normalizeEditPhysicalForm("Bar")).toBe("BAR");
  });

  it("returns null for missing or unsupported forms", (): void => {
    expect(normalizeEditPhysicalForm(null)).toBeNull();
    expect(normalizeEditPhysicalForm(undefined)).toBeNull();
    expect(normalizeEditPhysicalForm("")).toBeNull();
    expect(normalizeEditPhysicalForm("amulet")).toBeNull();
    expect(normalizeEditPhysicalForm("RING")).toBeNull();
    expect(normalizeEditPhysicalForm(42)).toBeNull();
  });
});
