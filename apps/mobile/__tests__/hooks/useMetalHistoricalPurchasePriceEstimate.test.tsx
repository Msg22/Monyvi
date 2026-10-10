import { act, renderHook, waitFor } from "@testing-library/react-native";

import {
  useMetalHistoricalPurchasePriceEstimate,
  type UseMetalHistoricalPurchasePriceEstimateInput,
} from "../../hooks/useMetalHistoricalPurchasePriceEstimate";
import type { PurchaseDateHistoricalRateResolution } from "../../services/metal-purchase-date-reference-service";

function available(): PurchaseDateHistoricalRateResolution {
  return {
    status: "available",
    source: "network",
    value: {
      rateDate: "2026-10-10",
      origin: "daily_history",
      metal: "GOLD",
      purchaseCurrency: "USD",
      metalUsdPerPureGramDecimal: "100",
      purchaseCurrencyUsdPerUnitDecimal: "1",
      metalProviderObservedAt: null,
      currencyProviderObservedAt: null,
      capturedAt: null,
      fetchedAt: "2026-10-10T15:00:00.000Z",
      source: "metals.dev",
      quality: "valid",
    },
  };
}

interface Props {
  readonly weight: string;
  readonly purchasePrice: string;
  readonly purchaseDate?: string;
}

function input(
  props: Props,
  onPurchasePriceChange: jest.Mock,
  resolveReference: jest.Mock
): UseMetalHistoricalPurchasePriceEstimateInput {
  return {
    metal: "GOLD",
    weightGrams: props.weight,
    purityCode: "gold-999",
    purchaseCurrency: "USD",
    purchaseDate: props.purchaseDate ?? "2026-10-10",
    purchasePrice: props.purchasePrice,
    onPurchasePriceChange,
    resolveReference,
  };
}

describe("#355 Add-only historical purchase-price estimator", () => {
  it("prefills approved gold-999 from the quoted 24K rate and currency precision", async () => {
    const onChange = jest.fn();
    const resolver = jest.fn(() => Promise.resolve(available()));
    const { result } = renderHook(() =>
      useMetalHistoricalPurchasePriceEstimate(
        input({ weight: "10", purchasePrice: "" }, onChange, resolver)
      )
    );

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("1000.00");
      expect(result.current.ownership).toBe("estimated");
    });
  });

  it("recomputes weight changes locally without another provider/cache resolution", async () => {
    const onChange = jest.fn();
    const resolver = jest.fn(() => Promise.resolve(available()));
    const { rerender } = renderHook(
      (props: Props) =>
        useMetalHistoricalPurchasePriceEstimate(
          input(props, onChange, resolver)
        ),
      { initialProps: { weight: "10", purchasePrice: "" } }
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("1000.00"));
    expect(resolver).toHaveBeenCalledTimes(1);
    onChange.mockClear();

    rerender({ weight: "20", purchasePrice: "1000.00" });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("2000.00");
    });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("resolves a new pair when the purchase date changes before manual override", async () => {
    const onChange = jest.fn();
    const resolver = jest.fn(() => Promise.resolve(available()));
    const { rerender } = renderHook(
      (props: Props) =>
        useMetalHistoricalPurchasePriceEstimate(
          input(props, onChange, resolver)
        ),
      { initialProps: { weight: "10", purchasePrice: "" } }
    );

    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(1));
    rerender({
      weight: "10",
      purchasePrice: "1000.00",
      purchaseDate: "2026-10-11",
    });

    await waitFor(() => expect(resolver).toHaveBeenCalledTimes(2));
    expect(resolver).toHaveBeenLastCalledWith(
      expect.objectContaining({ purchaseDate: "2026-10-11" })
    );
  });

  it("never overwrites a manual edit, including a deliberate clear", async () => {
    const onChange = jest.fn();
    const resolver = jest.fn(() => Promise.resolve(available()));
    const { result, rerender } = renderHook(
      (props: Props) =>
        useMetalHistoricalPurchasePriceEstimate(
          input(props, onChange, resolver)
        ),
      { initialProps: { weight: "10", purchasePrice: "" } }
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("1000.00"));
    onChange.mockClear();

    act(() => {
      result.current.onPurchasePriceUserChange("");
    });
    expect(result.current.ownership).toBe("manual");
    expect(onChange).toHaveBeenCalledWith("");

    const callsBeforeChange = resolver.mock.calls.length;
    rerender({
      weight: "20",
      purchasePrice: "",
      purchaseDate: "2026-10-11",
    });
    await Promise.resolve();

    expect(resolver).toHaveBeenCalledTimes(callsBeforeChange);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps manual entry empty when exact-date history is unavailable", async () => {
    const onChange = jest.fn();
    const resolver = jest.fn(() =>
      Promise.resolve({
        status: "unavailable",
        reason: "date_unavailable",
      } satisfies PurchaseDateHistoricalRateResolution)
    );

    const { result } = renderHook(() =>
      useMetalHistoricalPurchasePriceEstimate(
        input({ weight: "10", purchasePrice: "" }, onChange, resolver)
      )
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/\d/));
    expect(result.current.ownership).toBe("unset");
  });

  it("surfaces retrieval failure without fabricating an estimate", async () => {
    const onChange = jest.fn();
    const resolver = jest.fn(() =>
      Promise.resolve({
        status: "fetch_failed",
        error: new Error("offline"),
      } satisfies PurchaseDateHistoricalRateResolution)
    );

    const { result } = renderHook(() =>
      useMetalHistoricalPurchasePriceEstimate(
        input({ weight: "10", purchasePrice: "" }, onChange, resolver)
      )
    );

    await waitFor(() => expect(result.current.error?.message).toBe("offline"));
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/\d/));
    expect(result.current.ownership).toBe("unset");
  });
});
