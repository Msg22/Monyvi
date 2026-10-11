import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useSellMetalHoldingProduction } from "../../hooks/useSellMetalHoldingProduction";
import {
  createSellMetalHoldingFormExecutor,
  loadSellableMetalHolding,
  type SellableMetalHolding,
} from "../../services/sell-metal-holding-facade-service";

jest.mock("expo-crypto", () => ({ randomUUID: () => "stable-id" }));
jest.mock("@/providers/DatabaseProvider", () => ({
  useDatabase: () => mockDatabase,
}));
jest.mock("@/services/sell-metal-holding-facade-service", () => ({
  createSellMetalHoldingFormExecutor: jest.fn(),
  loadSellableMetalHolding: jest.fn(),
}));
const mockDatabase = Object.freeze({});
const mockHolding: SellableMetalHolding = {
  holdingId: "holding",
  userId: "owner",
  name: "Coin",
  metalType: "GOLD",
  purchaseCurrency: "EGP",
  purchaseCostDecimal: "100",
  purchaseDate: "2024-01-01",
  expectedFinancialRevision: "0",
  predecessorEventId: null,
  weightLabel: "10",
};
const load = jest.mocked(loadSellableMetalHolding);

describe("Sell production loader lifecycle", () => {
  beforeEach((): void => {
    load.mockReset();
    jest
      .mocked(createSellMetalHoldingFormExecutor)
      .mockReturnValue({ execute: jest.fn() });
  });
  it("loads only through the scoped facade and exposes settled state", async (): Promise<void> => {
    load.mockResolvedValue(mockHolding);
    const hook = renderHook(() =>
      useSellMetalHoldingProduction("holding", "en")
    );
    expect(hook.result.current.isLoading).toBe(true);
    await waitFor(() => expect(hook.result.current.holding).toBe(mockHolding));
    expect(load).toHaveBeenCalledWith(mockDatabase, "holding", "en");
    expect(hook.result.current.isLoading).toBe(false);
  });
  it("ignores an old request after holding navigation", async (): Promise<void> => {
    const pending: {
      complete: ((value: SellableMetalHolding) => void) | null;
    } = { complete: null };
    load
      .mockImplementationOnce(
        () =>
          new Promise<SellableMetalHolding>((resolve) => {
            pending.complete = resolve;
          })
      )
      .mockResolvedValueOnce({ ...mockHolding, holdingId: "second" });
    const hook = renderHook(
      ({ id }: { id: string }) => useSellMetalHoldingProduction(id, "en"),
      { initialProps: { id: "holding" } }
    );
    hook.rerender({ id: "second" });
    await waitFor(() =>
      expect(hook.result.current.holding?.holdingId).toBe("second")
    );
    await act(async (): Promise<void> => {
      pending.complete?.(mockHolding);
      await Promise.resolve();
    });
    expect(hook.result.current.holding?.holdingId).toBe("second");
  });
  it("retains the loaded holding through failed recovery then adopts refreshed revision", async (): Promise<void> => {
    load
      .mockResolvedValueOnce(mockHolding)
      .mockRejectedValueOnce(new Error("local_store_failed"))
      .mockResolvedValueOnce({
        ...mockHolding,
        expectedFinancialRevision: "1",
      });
    const hook = renderHook(() =>
      useSellMetalHoldingProduction("holding", "en")
    );
    await waitFor(() => expect(hook.result.current.holding).toBe(mockHolding));
    act(() => hook.result.current.reload());
    await waitFor(() =>
      expect(hook.result.current.loadError).toBe("local_store_failed")
    );
    expect(hook.result.current.holding).toBe(mockHolding);
    act(() => hook.result.current.reload());
    await waitFor(() =>
      expect(hook.result.current.holding?.expectedFinancialRevision).toBe("1")
    );
    expect(hook.result.current.loadError).toBeNull();
  });
});
