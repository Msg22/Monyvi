import { act, renderHook, waitFor } from "@testing-library/react-native";

let mockNext: ((rows: readonly unknown[]) => void) | null = null;
let mockWealth = {
  totalNetWorthDecimal: "1500",
  totalNetWorthUsdDecimal: "30",
  accounts: { amountDecimal: "1500" },
  metals: { amountDecimal: "0" },
};
const mockRefresh = jest.fn();
const mockPortfolio = jest.fn((_input: unknown): unknown => ({
  wealthBreakdown: mockWealth,
  isSummaryLoading: false,
  error: null,
  refresh: mockRefresh,
}));
jest.mock("@/hooks/useMetalPortfolio", () => ({
  useMetalPortfolio: (input: unknown): unknown => mockPortfolio(input),
}));
jest.mock("@/hooks/useMarketRates", () => ({
  useMarketRates: (): unknown => ({
    selectedSnapshot: {},
    isLoading: false,
    isCurrentLoading: false,
  }),
}));
jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: (): unknown => ({ preferredCurrency: "EGP" }),
}));
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): unknown => ({ userId: "u1", isResolvingUser: false }),
  runUserScopedEffect: ({
    onAuthenticated,
  }: {
    onAuthenticated: (id: string) => unknown;
  }): unknown => onAuthenticated("u1"),
}));
jest.mock("@/services/net-worth-read-model-service", () => ({
  observeNetWorthAccounts: (): unknown => ({
    observeWithColumns: (): unknown => ({
      subscribe: ({
        next,
      }: {
        next: (rows: readonly unknown[]) => void;
      }): unknown => {
        mockNext = next;
        return { unsubscribe: jest.fn() };
      },
    }),
  }),
  observeNetWorthAssets: (): unknown => ({
    observeWithColumns: (): unknown => ({
      subscribe: ({
        next,
      }: {
        next: (rows: readonly unknown[]) => void;
      }): unknown => {
        next([]);
        return { unsubscribe: jest.fn() };
      },
    }),
  }),
  observeNetWorthAssetMetals: (): null => null,
  buildNetWorthReadModel: (): unknown => ({
    totalAccounts: 1500,
    totalAssets: 1000,
    totalNetWorth: 2500,
    totalNetWorthUsd: 50,
  }),
}));

import { useNetWorth } from "@/hooks/useNetWorth";

it("uses the effective portfolio projection instead of re-valuing terminal asset rows", async () => {
  const { result, rerender } = renderHook(() => useNetWorth());
  act(() => mockNext?.([{ id: "a1" }]));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.totalNetWorth).toBe(1500);
  expect(result.current.totalAssets).toBe(0);
  expect(result.current.totalNetWorthUsd).toBe(30);
  mockWealth = {
    ...mockWealth,
    totalNetWorthDecimal: "2500",
    totalNetWorthUsdDecimal: "50",
    metals: { amountDecimal: "1000" },
  };
  rerender({});
  expect(result.current.totalNetWorth).toBe(2500);
  act(() => result.current.refresh());
  expect(mockRefresh).toHaveBeenCalled();
});
