import { act, renderHook } from "@testing-library/react-native";

import type { AddMetalHoldingFormSubmission } from "../../services/add-metal-holding-facade-service";

jest.mock("../../providers/DatabaseProvider", () => ({
  useDatabase: jest.fn(),
}));

import {
  useAddMetalHoldingForm,
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
    act(() => rejectFirst?.(new Error("write_failed")));
    await expect(first).resolves.toBeNull();

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
});
