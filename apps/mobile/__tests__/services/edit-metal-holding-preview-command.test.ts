interface PuritySnapshot {
  readonly code: string;
  readonly catalogVersion: "1";
  readonly factorDecimal: string;
  readonly label: string;
}

interface MetalHoldingEditFacts {
  readonly status: "ACTIVE" | "SOLD" | "DISPOSED";
  readonly name: string;
  readonly notes: string | null;
  readonly metal: "GOLD" | "SILVER";
  readonly weightGramsDecimal: string | null;
  readonly purity: PuritySnapshot | null;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
  readonly purchasePriceDecimal: string | null;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: string | null;
}

interface MaterialDifference {
  readonly field:
    | "weightGramsDecimal"
    | "purity"
    | "physicalForm"
    | "purchasePriceDecimal"
    | "purchaseCurrency"
    | "purchaseDate";
  readonly persisted: unknown;
  readonly current: unknown;
}

interface EditConsequence {
  readonly kind:
    | "current_value_unchanged"
    | "profit_or_loss_unchanged"
    | "holding_render_updates"
    | "history_entry"
    | "valuation_unavailable";
  readonly amountDecimal?: string;
}

interface EditMetalHoldingPreview {
  readonly mode: "ordinary" | "material_correction" | "terminal_metadata";
  readonly materialDifferences: readonly MaterialDifference[];
  readonly requiresCorrectionReason: boolean;
  readonly summary: null | {
    readonly changedFacts: readonly MaterialDifference[];
    readonly consequences: readonly EditConsequence[];
  };
  readonly unavailableExactFacts: readonly string[];
}

interface EditMetalHoldingSaveIntent {
  readonly canSave: boolean;
  readonly kind: "metadata_lww" | "material_correction" | "blocked";
  readonly directCommit: true;
  readonly reviewRoute: null;
  readonly requiresCorrectionReason: boolean;
  readonly metadataWritePolicy: "last_write_wins";
  readonly materialWritePolicy: "whole_fact_set_compare_and_swap" | null;
  readonly requiresUndo: boolean;
}

interface EditPreviewServiceModule {
  createEditMetalHoldingPreview(input: {
    readonly persisted: MetalHoldingEditFacts;
    readonly current: MetalHoldingEditFacts;
    readonly currentValue:
      | { readonly available: true; readonly amountDecimal: string }
      | { readonly available: false };
    readonly profitOrLoss:
      | { readonly available: true; readonly amountDecimal: string }
      | { readonly available: false };
  }): EditMetalHoldingPreview;
}

interface EditCommandServiceModule {
  createEditMetalHoldingSaveIntent(input: {
    readonly persisted: MetalHoldingEditFacts;
    readonly current: MetalHoldingEditFacts;
    readonly correctionReason: string | null;
  }): EditMetalHoldingSaveIntent;
}

function loadPreviewService(): EditPreviewServiceModule {
  return jest.requireActual<EditPreviewServiceModule>(
    "../../services/edit-metal-holding-preview-service"
  );
}

function loadCommandService(): EditCommandServiceModule {
  return jest.requireActual<EditCommandServiceModule>(
    "../../services/edit-metal-holding-command-service"
  );
}

const persistedActive: MetalHoldingEditFacts = {
  status: "ACTIVE",
  name: "Wedding coin",
  notes: "Original note",
  metal: "GOLD",
  weightGramsDecimal: "10",
  purity: {
    code: "gold-999",
    catalogVersion: "1",
    factorDecimal: "0.999",
    label: "24K · 999",
  },
  physicalForm: "COIN",
  purchasePriceDecimal: "47800",
  purchaseCurrency: "EGP",
  purchaseDate: "2024-03-14",
};

function preview(
  current: Partial<MetalHoldingEditFacts> = {},
  persisted: MetalHoldingEditFacts = persistedActive,
  values: {
    readonly currentValue:
      | { readonly available: true; readonly amountDecimal: string }
      | { readonly available: false };
    readonly profitOrLoss:
      | { readonly available: true; readonly amountDecimal: string }
      | { readonly available: false };
  } = {
    currentValue: { available: true, amountDecimal: "52150.32" },
    profitOrLoss: { available: true, amountDecimal: "4350.32" },
  }
): EditMetalHoldingPreview {
  return loadPreviewService().createEditMetalHoldingPreview({
    persisted,
    current: { ...persisted, ...current },
    ...values,
  });
}

function saveIntent(
  current: Partial<MetalHoldingEditFacts> = {},
  correctionReason: string | null = null,
  persisted: MetalHoldingEditFacts = persistedActive
): EditMetalHoldingSaveIntent {
  return loadCommandService().createEditMetalHoldingSaveIntent({
    persisted,
    current: { ...persisted, ...current },
    correctionReason,
  });
}

describe("Edit metal holding preview", () => {
  it("compares persisted and current active facts exactly, distinguishing ordinary metadata from material corrections", () => {
    const metadataOnly = preview({
      name: "Wedding coin 2024",
      notes: "هدية 🎁",
    });
    const material = preview({
      weightGramsDecimal: "10.125",
      purchasePriceDecimal: "48000",
    });

    expect(metadataOnly).toMatchObject({
      mode: "ordinary",
      materialDifferences: [],
      requiresCorrectionReason: false,
      summary: null,
    });
    expect(material).toMatchObject({
      mode: "material_correction",
      requiresCorrectionReason: true,
      materialDifferences: [
        {
          field: "weightGramsDecimal",
          persisted: "10",
          current: "10.125",
        },
        {
          field: "purchasePriceDecimal",
          persisted: "47800",
          current: "48000",
        },
      ],
    });
    expect(material.summary?.changedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "weightGramsDecimal" }),
        expect.objectContaining({ field: "purchasePriceDecimal" }),
      ])
    );
  });

  it("reveals a required reason only while a material delta exists and removes it when every material fact is reverted", () => {
    expect(saveIntent({ weightGramsDecimal: "10.125" })).toMatchObject({
      canSave: false,
      kind: "blocked",
      requiresCorrectionReason: true,
    });
    expect(
      saveIntent(
        { weightGramsDecimal: "10.125", name: "Wedding coin corrected" },
        "Corrected scale reading"
      )
    ).toMatchObject({
      canSave: true,
      kind: "material_correction",
      requiresCorrectionReason: true,
      directCommit: true,
      reviewRoute: null,
    });
    expect(
      saveIntent({ name: "Wedding coin corrected" }, "Stale reason")
    ).toMatchObject({
      canSave: true,
      kind: "metadata_lww",
      requiresCorrectionReason: false,
      directCommit: true,
      reviewRoute: null,
    });
  });

  it("reports the approved physical-form-only facts and unchanged value consequences without inventing a rate attribution", () => {
    const result = preview({ physicalForm: "BAR" });

    expect(result).toMatchObject({
      mode: "material_correction",
      materialDifferences: [
        { field: "physicalForm", persisted: "COIN", current: "BAR" },
      ],
      summary: {
        changedFacts: [
          { field: "physicalForm", persisted: "COIN", current: "BAR" },
        ],
        consequences: [
          { kind: "current_value_unchanged", amountDecimal: "52150.32" },
          { kind: "profit_or_loss_unchanged", amountDecimal: "4350.32" },
          { kind: "holding_render_updates" },
          { kind: "history_entry" },
        ],
      },
    });
    expect(result.summary?.consequences).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "rate_attribution" }),
      ])
    );
  });

  it("keeps Metal locked and directs a wrong-metal correction to Delete then Add instead of a replacement state", () => {
    expect(saveIntent({ metal: "SILVER" })).toMatchObject({
      canSave: false,
      kind: "blocked",
      requiresUndo: false,
    });
    expect(preview({ metal: "SILVER" })).toMatchObject({
      mode: "ordinary",
      materialDifferences: [],
    });
  });

  it("allows only terminal name/notes metadata under LWW and requires Undo for Sold or Disposed financial changes", () => {
    const sold: MetalHoldingEditFacts = { ...persistedActive, status: "SOLD" };
    const disposed: MetalHoldingEditFacts = {
      ...persistedActive,
      status: "DISPOSED",
    };

    expect(saveIntent({ name: "Sold wedding coin" }, null, sold)).toEqual(
      expect.objectContaining({
        canSave: true,
        kind: "metadata_lww",
        metadataWritePolicy: "last_write_wins",
        materialWritePolicy: null,
        requiresUndo: false,
      })
    );
    expect(saveIntent({ purchaseDate: "2024-03-15" }, null, sold)).toEqual(
      expect.objectContaining({
        canSave: false,
        kind: "blocked",
        requiresUndo: true,
      })
    );
    expect(saveIntent({ physicalForm: "JEWELRY" }, null, disposed)).toEqual(
      expect.objectContaining({
        canSave: false,
        kind: "blocked",
        requiresUndo: true,
      })
    );
  });

  it("preserves missing legacy acquisition facts honestly and requires a complete exact replacement set before material correction", () => {
    const legacy: MetalHoldingEditFacts = {
      ...persistedActive,
      weightGramsDecimal: null,
      purity: null,
      purchasePriceDecimal: null,
    };

    expect(preview({ notes: "Legacy note" }, legacy)).toMatchObject({
      mode: "ordinary",
      unavailableExactFacts: [
        "weightGramsDecimal",
        "purity",
        "purchasePriceDecimal",
      ],
    });
    expect(
      saveIntent({ weightGramsDecimal: "10" }, "Found receipt", legacy)
    ).toMatchObject({
      canSave: false,
      kind: "blocked",
    });
    expect(
      saveIntent(
        {
          weightGramsDecimal: "10",
          purity: persistedActive.purity,
          purchasePriceDecimal: "47800",
        },
        "Found receipt",
        legacy
      )
    ).toMatchObject({
      canSave: true,
      kind: "material_correction",
      materialWritePolicy: "whole_fact_set_compare_and_swap",
    });
  });

  it("makes unavailable dependent valuation explicit rather than zero, a compatibility fallback, or attributed rate facts", () => {
    const result = preview({ purchasePriceDecimal: "48000" }, persistedActive, {
      currentValue: { available: false },
      profitOrLoss: { available: false },
    });

    expect(result.summary?.consequences).toEqual(
      expect.arrayContaining([{ kind: "valuation_unavailable" }])
    );
    expect(result.summary?.consequences).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amountDecimal: "0" }),
        expect.objectContaining({ kind: "rate_attribution" }),
      ])
    );
  });
});
