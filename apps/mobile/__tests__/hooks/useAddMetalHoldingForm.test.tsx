import { act, renderHook } from "@testing-library/react-native";

import type { AddMetalHoldingFormSubmission } from "../../services/add-metal-holding-facade-service";

jest.mock("../../providers/DatabaseProvider", () => ({
  useDatabase: jest.fn(),
}));

jest.mock("../../hooks/useMarketRates", () => ({
  useMarketRates: jest.fn(),
}));

import {
  useAddMetalHoldingForm,
  useMetalAddPreviewRates,
  type UseAddMetalHoldingFormInput,
  type UseAddMetalHoldingFormResult,
} from "../../hooks/useAddMetalHolding";

function input(
  overrides: Partial<UseAddMetalHoldingFormInput> = {}
): UseAddMetalHoldingFormInput {
  let id = 0;
  return {
    locale: "en",
    preferredCurrency: "EGP",
    today: "2026-09-01",
    currencyMinorUnits: 2,
    safeRange: {
      maximumWeightGramsDecimal: "999999999.999",
      maximumPurchasePriceDecimal: "999999999999999.99",
    },
    previewRates: () => ({
      metalUsdPerPureGramDecimal: "100",
      currencyUsdPerUnitDecimal: "0.02",
      egpUsdPerUnitDecimal: "0.02",
      currencyMinorUnits: 2,
      rateFreshness: "fresh",
    }),
    isUnusualValue: () => false,
    createId: () => `018f0c7a-1234-7abc-8def-${String(++id).padStart(12, "0")}`,
    addHolding: jest.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function completeForm(result: { current: UseAddMetalHoldingFormResult }): void {
  result.current.updateField("name", "Savings coin");
  result.current.updateField("weightGrams", "10.125");
  result.current.updateField("purchasePrice", "47800");
  result.current.updateField("purchaseDate", "2024-03-14");
  result.current.updateField("physicalForm", "COIN");
}

describe("useAddMetalHoldingForm", () => {
  it("preserves separate metal and FX trust from the selected snapshot", () => {
    const useMarketRates = (jest.requireMock("../../hooks/useMarketRates") as { useMarketRates: jest.Mock }).useMarketRates;
    useMarketRates.mockReturnValue({ selectedSnapshot: { trust: {
      gold: { valueDecimal: "100", state: "fresh", ageMs: 60_000, source: "Metal feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") },
      silver: { valueDecimal: "1", state: "fresh", ageMs: 60_000, source: "Metal feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") },
      currencies: new Map([["EGP", { valueDecimal: "0.02", state: "stale", ageMs: 3_600_000, source: "FX feed", quality: "indicative", providerObservedAt: new Date("2026-09-01T09:00:00Z") }]]),
    } } });
    const { result } = renderHook(() => useMetalAddPreviewRates());
    const form = renderHook(() => useAddMetalHoldingForm(input({ previewRates: result.current.getPreviewRates })));
    act(() => completeForm(form.result));
    expect(form.result.current.preview.metalRateTrust).toMatchObject({ source: "Metal feed", state: "fresh", quality: "verified", ageMs: 60_000 });
    expect(form.result.current.preview.fxRateTrust).toMatchObject({ source: "FX feed", state: "stale", quality: "indicative", ageMs: 3_600_000 });
  });
  it("submits normalized facts directly with one stable seven-ID action bundle", async () => {
    const addHolding = jest.fn<Promise<void>, [AddMetalHoldingFormSubmission]>(
      () => Promise.resolve()
    );
    const { result } = renderHook(() =>
      useAddMetalHoldingForm(input({ addHolding }))
    );

    act(() => completeForm(result));
    let holdingId: string | null = null;
    await act(async () => {
      holdingId = await result.current.submit();
    });

    expect(holdingId).toBe("018f0c7a-1234-7abc-8def-000000000002");
    expect(addHolding).toHaveBeenCalledTimes(1);
    expect(addHolding.mock.calls[0]?.[0]).toMatchObject({
      holding: {
        name: "Savings coin",
        metal: "GOLD",
        weightGramsDecimal: "10.125",
        purchasePriceDecimal: "47800",
        purchaseCurrency: "EGP",
        purchaseDate: "2024-03-14",
        physicalForm: "COIN",
      },
      ids: {
        actionId: "018f0c7a-1234-7abc-8def-000000000001",
        holdingId: "018f0c7a-1234-7abc-8def-000000000002",
        metalRateReferenceId: "018f0c7a-1234-7abc-8def-000000000006",
        currencyRateReferenceId: "018f0c7a-1234-7abc-8def-000000000007",
      },
    });
  });

  it("blocks a duplicate tap synchronously and reuses IDs after an unchanged failure", async () => {
    let rejectFirst: ((reason: Error) => void) | null = null;
    const firstAttempt = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const addHolding = jest
      .fn<Promise<void>, [AddMetalHoldingFormSubmission]>()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce();
    const { result } = renderHook(() =>
      useAddMetalHoldingForm(input({ addHolding }))
    );
    act(() => completeForm(result));

    let first = Promise.resolve<string | null>(null);
    let duplicate = Promise.resolve<string | null>(null);
    act(() => {
      first = result.current.submit();
      duplicate = result.current.submit();
    });
    await expect(duplicate).resolves.toBeNull();
    await act(async () => {
      rejectFirst?.(new Error("write_failed"));
      await expect(first).resolves.toBeNull();
    });

    await act(async () => {
      await result.current.submit();
    });
    expect(addHolding).toHaveBeenCalledTimes(2);
    expect(addHolding.mock.calls[1]?.[0]).toMatchObject({
      ids: (addHolding.mock.calls[0]?.[0] as { ids: object }).ids,
    });
  });

  it("requires in-form acknowledgment at the inclusive Gold weight boundary", async () => {
    const addHolding = jest.fn<Promise<void>, [AddMetalHoldingFormSubmission]>(
      () => Promise.resolve()
    );
    const { result } = renderHook(() =>
      useAddMetalHoldingForm(input({ addHolding }))
    );
    act(() => {
      completeForm(result);
      result.current.updateField("weightGrams", "1000");
    });

    expect(result.current.requiresUnusualValueAcknowledgment).toBe(true);
    await act(async () => {
      await result.current.submit();
    });
    expect(addHolding).not.toHaveBeenCalled();

    act(() => result.current.acknowledgeUnusualValue());
    await act(async () => {
      await result.current.submit();
    });
    expect(addHolding).toHaveBeenCalledTimes(1);
  });

  it("uses the selected purchase currency precision after the user changes currency", async () => {
    const addHolding = jest.fn<Promise<void>, [AddMetalHoldingFormSubmission]>(
      () => Promise.resolve()
    );
    const { result } = renderHook(() =>
      useAddMetalHoldingForm(input({ addHolding }))
    );
    act(() => {
      completeForm(result);
      result.current.updateField("purchaseCurrency", "KWD");
      result.current.updateField("purchasePrice", "1.234");
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(addHolding).toHaveBeenCalledTimes(1);
    expect(addHolding.mock.calls[0]?.[0].holding).toMatchObject({
      purchaseCurrency: "KWD",
      purchasePriceDecimal: "1.234",
    });
  });

  it("requires explicit acknowledgment when rates are stale before submitting", async () => {
    const addHolding = jest.fn<Promise<void>, [AddMetalHoldingFormSubmission]>(
      () => Promise.resolve()
    );
    const { result } = renderHook(() =>
      useAddMetalHoldingForm(
        input({
          addHolding,
          previewRates: () => ({
            metalUsdPerPureGramDecimal: "100",
            currencyUsdPerUnitDecimal: "0.02",
            egpUsdPerUnitDecimal: "0.02",
            currencyMinorUnits: 2,
            rateFreshness: "stale",
          }),
        })
      )
    );
    act(() => completeForm(result));

    expect(
      (
        result.current as unknown as {
          requiresStaleRateAcknowledgment: boolean;
        }
      ).requiresStaleRateAcknowledgment
    ).toBe(true);

    let holdingId: string | null = null;
    await act(async () => {
      holdingId = await result.current.submit();
    });
    expect(holdingId).toBeNull();
    expect(addHolding).not.toHaveBeenCalled();

    act(() => {
      (
        result.current as unknown as { acknowledgeStaleRate: () => void }
      ).acknowledgeStaleRate();
    });

    await act(async () => {
      holdingId = await result.current.submit();
    });
    expect(holdingId).toBe("018f0c7a-1234-7abc-8def-000000000002");
    expect(addHolding).toHaveBeenCalledTimes(1);
  });

  it("requires explicit acknowledgment when rates have unknown freshness before submitting", async () => {
    const addHolding = jest.fn<Promise<void>, [AddMetalHoldingFormSubmission]>(
      () => Promise.resolve()
    );
    const { result } = renderHook(() =>
      useAddMetalHoldingForm(
        input({
          addHolding,
          previewRates: () => ({
            metalUsdPerPureGramDecimal: "100",
            currencyUsdPerUnitDecimal: "0.02",
            egpUsdPerUnitDecimal: "0.02",
            currencyMinorUnits: 2,
            rateFreshness: "unknown",
          }),
        })
      )
    );
    act(() => completeForm(result));

    expect(
      (
        result.current as unknown as {
          requiresStaleRateAcknowledgment: boolean;
        }
      ).requiresStaleRateAcknowledgment
    ).toBe(true);

    let holdingId: string | null = null;
    await act(async () => {
      holdingId = await result.current.submit();
    });
    expect(holdingId).toBeNull();
    expect(addHolding).not.toHaveBeenCalled();

    act(() => {
      (
        result.current as unknown as { acknowledgeStaleRate: () => void }
      ).acknowledgeStaleRate();
    });

    await act(async () => {
      holdingId = await result.current.submit();
    });
    expect(holdingId).toBe("018f0c7a-1234-7abc-8def-000000000002");
    expect(addHolding).toHaveBeenCalledTimes(1);
  });  it("stays fresh when only the EGP reference rate is stale for a non-EGP purchase", () => {
    const useMarketRates = (
      jest.requireMock("../../hooks/useMarketRates") as {
        useMarketRates: jest.Mock;
      }
    ).useMarketRates;
    useMarketRates.mockReturnValue({
      selectedSnapshot: {
        trust: {
          gold: {
            valueDecimal: "100",
            state: "fresh",
            ageMs: 60_000,
            source: "Metal feed",
            quality: "verified",
            providerObservedAt: new Date("2026-09-01T10:00:00Z"),
          },
          silver: {
            valueDecimal: "1",
            state: "fresh",
            ageMs: 60_000,
            source: "Metal feed",
            quality: "verified",
            providerObservedAt: new Date("2026-09-01T10:00:00Z"),
          },
          currencies: new Map([
            [
              "USD",
              {
                valueDecimal: "1",
                state: "fresh",
                ageMs: 60_000,
                source: "FX feed",
                quality: "verified",
                providerObservedAt: new Date("2026-09-01T10:00:00Z"),
              },
            ],
            [
              "EGP",
              {
                valueDecimal: "0.02",
                state: "stale",
                ageMs: 3_600_000,
                source: "FX feed",
                quality: "indicative",
                providerObservedAt: new Date("2026-09-01T09:00:00Z"),
              },
            ],
          ]),
        },
      },
    });
    const { result } = renderHook(() => useMetalAddPreviewRates());
    // The EGP rate only feeds the unusual-value policy; the acquisition facade
    // snapshots metal + purchase-currency rates, so a stale EGP reference must
    // not mark a USD purchase preview stale.
    const rates = result.current.getPreviewRates({
      name: "Savings coin",
      metal: "GOLD",
      weightGramsDecimal: "10.125",
      purity: {
        code: "gold-999",
        catalogVersion: "1",
        factorDecimal: "0.999",
        labelKey: "purity_gold_999",
      },
      purchasePriceDecimal: "47800",
      purchaseCurrency: "USD",
      purchaseDate: "2024-03-14",
      physicalForm: "COIN",
      notes: null,
    });
    expect(rates.rateFreshness).toBe("fresh");
    expect(rates.egpUsdPerUnitDecimal).toBe("0.02");
  });

  it("computes per-gram in preferred EGP while keeping purchase CAD valuation", () => {
    const { result } = renderHook(() =>
      useAddMetalHoldingForm(
        input({
          preferredCurrency: "EGP",
          previewRates: (() => ({
            metalUsdPerPureGramDecimal: "100",
            currencyUsdPerUnitDecimal: "0.75",
            egpUsdPerUnitDecimal: "0.02",
            currencyMinorUnits: 2,
            rateFreshness: "fresh",
            preferredCurrency: "EGP",
            preferredCurrencyUsdPerUnitDecimal: "0.02",
          })) as UseAddMetalHoldingFormInput["previewRates"],
        })
      )
    );

    act(() => {
      result.current.updateField("name", "Maple coin");
      result.current.updateField("weightGrams", "8");
      result.current.updateField("purchasePrice", "750");
      result.current.updateField("purchaseCurrency", "CAD");
      result.current.updateField("purchaseDate", "2024-03-14");
      result.current.updateField("physicalForm", "COIN");
    });

    expect(result.current.preview.displayCurrency).toBe("CAD");
    expect(result.current.preview.valuation).toEqual({
      available: true,
      valueDecimal: "1065.6",
    });
    const preferredPreview = result.current.preview as unknown as {
      readonly preferredCurrency?: string;
      readonly metalPerPureGramInPreferredCurrencyDecimal?: string | null;
    };
    expect(preferredPreview.preferredCurrency).toBe("EGP");
    expect(preferredPreview.metalPerPureGramInPreferredCurrencyDecimal).toBe(
      "5000"
    );
  });

  it("resolves preferred EGP FX alongside purchase CAD FX without changing freshness", () => {
    const useMarketRates = (jest.requireMock("../../hooks/useMarketRates") as { useMarketRates: jest.Mock }).useMarketRates;
    useMarketRates.mockReturnValue({ selectedSnapshot: { trust: {
      gold: { valueDecimal: "100", state: "fresh", ageMs: 60_000, source: "Metal feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") },
      silver: { valueDecimal: "1", state: "fresh", ageMs: 60_000, source: "Metal feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") },
      currencies: new Map([
        ["CAD", { valueDecimal: "0.75", state: "fresh", ageMs: 60_000, source: "FX feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") }],
        ["EGP", { valueDecimal: "0.02", state: "fresh", ageMs: 60_000, source: "FX feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") }],
        ["USD", { valueDecimal: "1", state: "fresh", ageMs: 60_000, source: "FX feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") }],
      ]),
    } } });
    const { result } = renderHook(() => useMetalAddPreviewRates());
    const rates = result.current.getPreviewRates(
      {
        name: "Maple coin",
        metal: "GOLD",
        weightGramsDecimal: "8",
        purity: {
          code: "gold-999",
          catalogVersion: "1",
          factorDecimal: "0.999",
          labelKey: "purity_gold_999",
        },
        purchasePriceDecimal: "750",
        purchaseCurrency: "CAD",
        purchaseDate: "2024-03-14",
        physicalForm: "COIN",
        notes: null,
      },
      "EGP"
    );
    expect(rates.currencyUsdPerUnitDecimal).toBe("0.75");
    const preferredRates = rates as unknown as {
      readonly preferredCurrency?: string;
      readonly preferredCurrencyUsdPerUnitDecimal?: string | null;
    };
    expect(preferredRates.preferredCurrency).toBe("EGP");
    expect(preferredRates.preferredCurrencyUsdPerUnitDecimal).toBe("0.02");
    expect(rates.rateFreshness).toBe("fresh");
    const usdRates = result.current.getPreviewRates(
      {
        name: "Maple coin",
        metal: "GOLD",
        weightGramsDecimal: "8",
        purity: {
          code: "gold-999",
          catalogVersion: "1",
          factorDecimal: "0.999",
          labelKey: "purity_gold_999",
        },
        purchasePriceDecimal: "750",
        purchaseCurrency: "CAD",
        purchaseDate: "2024-03-14",
        physicalForm: "COIN",
        notes: null,
      },
      "USD"
    ) as unknown as {
      readonly preferredCurrencyUsdPerUnitDecimal?: string | null;
    };
    expect(usdRates.preferredCurrencyUsdPerUnitDecimal).toBe("1");
  });

  it("returns null preferred FX instead of fabricating when preferred is missing", () => {
    const useMarketRates = (jest.requireMock("../../hooks/useMarketRates") as { useMarketRates: jest.Mock }).useMarketRates;
    useMarketRates.mockReturnValue({ selectedSnapshot: { trust: {
      gold: { valueDecimal: "100", state: "fresh", ageMs: 60_000, source: "Metal feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") },
      silver: { valueDecimal: "1", state: "fresh", ageMs: 60_000, source: "Metal feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") },
      currencies: new Map([
        ["CAD", { valueDecimal: "0.75", state: "fresh", ageMs: 60_000, source: "FX feed", quality: "verified", providerObservedAt: new Date("2026-09-01T10:00:00Z") }],
      ]),
    } } });
    const { result } = renderHook(() => useMetalAddPreviewRates());
    const rates = result.current.getPreviewRates(
      {
        name: "Maple coin",
        metal: "GOLD",
        weightGramsDecimal: "8",
        purity: {
          code: "gold-999",
          catalogVersion: "1",
          factorDecimal: "0.999",
          labelKey: "purity_gold_999",
        },
        purchasePriceDecimal: "750",
        purchaseCurrency: "CAD",
        purchaseDate: "2024-03-14",
        physicalForm: "COIN",
        notes: null,
      },
      "EGP"
    );
    expect(rates.currencyUsdPerUnitDecimal).toBe("0.75");
    const missingPreferred = rates as unknown as {
      readonly preferredCurrency?: string;
      readonly preferredCurrencyUsdPerUnitDecimal?: string | null;
    };
    expect(missingPreferred.preferredCurrency).toBe("EGP");
    expect(missingPreferred.preferredCurrencyUsdPerUnitDecimal).toBeNull();
  });
});
