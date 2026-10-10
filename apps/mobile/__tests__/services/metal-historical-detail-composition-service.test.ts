import {
  composeHistoricalMetalDetailReference,
  type HistoricalMetalDetailCompositionDependencies,
} from "../../services/metal-historical-detail-composition-service";

function reference(
  actionId: string,
  role: "acquisition_metal" | "acquisition_purchase_currency",
  valueDecimal: string
): Readonly<Record<string, unknown>> {
  const isMetal = role === "acquisition_metal";
  return {
    actionId,
    capturedAt: Date.parse("2026-10-10T12:00:00.000Z"),
    capturedFreshness: "fresh",
    instrumentCode: isMetal ? "metal:GOLD" : "currency:EGP",
    kind: isMetal ? "metal" : "currency",
    orientation: "quote_per_base",
    providerObservedAt: Date.parse("2026-10-10T08:00:00.000Z"),
    quality: "valid",
    role,
    source: "metals.dev",
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    valueDecimal,
  };
}

describe("#355 Details acquisition-reference composition", () => {
  it("passes only the current acquisition action pair to historical qualification", async () => {
    const readHistoricalReference = jest.fn(() =>
      Promise.resolve({
        status: "available" as const,
        rateDate: "2026-10-10",
        purchaseCurrency: "EGP",
        selectedPurityPerGramDecimal: "5000",
        origin: "action_observation" as const,
      })
    );
    const dependencies: HistoricalMetalDetailCompositionDependencies = {
      readHistoricalReference,
    };

    await composeHistoricalMetalDetailReference(
      {
        acquisitionActionId: "action-correct",
        metal: "GOLD",
        purchaseCurrency: "EGP",
        purchaseDate: "2026-10-10",
        purityCode: "gold-999",
        purityFactorDecimal: "0.999",
        rateReferences: [
          reference("action-add", "acquisition_metal", "90"),
          reference("action-add", "acquisition_purchase_currency", "0.019"),
          reference("action-correct", "acquisition_metal", "100"),
          reference(
            "action-correct",
            "acquisition_purchase_currency",
            "0.02"
          ),
        ],
      },
      dependencies
    );

    expect(readHistoricalReference).toHaveBeenCalledTimes(1);
    expect(readHistoricalReference).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionMetalReference: expect.objectContaining({
          actionId: "action-correct",
          role: "acquisition_metal",
          valueDecimal: "100",
        }),
        acquisitionCurrencyReference: expect.objectContaining({
          actionId: "action-correct",
          role: "acquisition_purchase_currency",
          valueDecimal: "0.02",
        }),
      })
    );
  });

  it("still resolves exact-date daily history for a legacy holding with no acquisition action", async () => {
    const readHistoricalReference = jest.fn(() =>
      Promise.resolve({
        status: "unavailable" as const,
        reason: "date_unavailable" as const,
      })
    );

    await composeHistoricalMetalDetailReference(
      {
        acquisitionActionId: null,
        metal: "SILVER",
        purchaseCurrency: "USD",
        purchaseDate: "2024-03-14",
        purityCode: "silver-925",
        purityFactorDecimal: "0.925",
        rateReferences: [
          reference("unrelated", "acquisition_metal", "1"),
        ],
      },
      { readHistoricalReference }
    );

    expect(readHistoricalReference).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisitionMetalReference: undefined,
        acquisitionCurrencyReference: undefined,
        purchaseDate: "2024-03-14",
      })
    );
  });

  it("does not fetch when required recorded material facts are absent", async () => {
    const readHistoricalReference = jest.fn();

    await expect(
      composeHistoricalMetalDetailReference(
        {
          acquisitionActionId: "action-add",
          metal: "GOLD",
          purchaseCurrency: null,
          purchaseDate: "2026-10-10",
          purityCode: "gold-999",
          purityFactorDecimal: "0.999",
          rateReferences: [],
        },
        { readHistoricalReference }
      )
    ).resolves.toBeNull();

    expect(readHistoricalReference).not.toHaveBeenCalled();
  });
});
