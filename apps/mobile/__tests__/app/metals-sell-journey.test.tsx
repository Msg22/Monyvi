import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import SellMetalHoldingRoute from "../../app/(private)/metals/[holdingId]/sell";
import type { SellMetalHoldingScreenProps } from "../../components/metals/SellMetalHoldingScreen";
import type { SellableMetalHolding } from "../../services/sell-metal-holding-facade-service";
import mockEnglish from "../../locales/en/metals.json";

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
const mockExecute = jest.fn<Promise<void>, [unknown]>();
const mockReload = jest.fn();
const mockToast = jest.fn();
const mockDispatch = jest.fn();
let mockId = 0;
let mockCurrentUser: { userId: string | null; isResolvingUser: boolean } = {
  userId: "owner",
  isResolvingUser: false,
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ holdingId: "holding" }),
  router: { back: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
  usePreventRemove: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string): string =>
      Object.entries(mockEnglish.sell).find(
        ([name]) => key === `sell.${name}`
      )?.[1] ?? key,
  }),
}));
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockCurrentUser,
}));
jest.mock("@/hooks/useSellMetalHoldingProduction", () => ({
  useSellMetalHoldingProduction: () => ({
    holding: mockHolding,
    isLoading: false,
    loadError: null,
    reload: mockReload,
    execute: mockExecute,
    createId: () => `action-${++mockId}`,
  }),
}));
jest.mock("@/services/dispose-metal-holding-read-model-service", () => ({
  loadDisposeTerminalRateSnapshots: jest.fn(),
}));
jest.mock("@/services/metal-financial-action-repository", () => ({
  formatMetalLocalCalendarDate: jest.fn(),
}));
jest.mock("@/services/sell-metal-holding-production-service", () => ({
  createSellMetalHoldingProductionService: jest.fn(),
}));
jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: jest.fn(),
  getCurrentUserDataScope: jest.fn(),
}));
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: "PageHeader",
}));
jest.mock("@/components/ui/Skeleton", () => ({ Skeleton: "Skeleton" }));
jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mockToast }),
}));
jest.mock("@/components/metals/SellMetalHoldingScreen", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SellMetalHoldingScreen: (
      props: SellMetalHoldingScreenProps
    ): React.JSX.Element => (
      <View>
        <Text testID="gross-value">{props.values.grossProceedsDecimal}</Text>
        <Text testID="currency-value">{props.values.saleCurrency}</Text>
        <Pressable
          testID="enter-sale"
          onPress={(): void => props.onChange("grossProceedsDecimal", "120")}
        >
          <Text>Amount</Text>
        </Pressable>
        <Pressable
          testID="submit-sale"
          disabled={!props.preview.canSubmit || props.isSubmitting}
          onPress={props.onSubmit}
        >
          <Text>Record sale</Text>
        </Pressable>
        <Pressable testID="cancel-sale" onPress={props.onRequestExit}>
          <Text>Cancel</Text>
        </Pressable>
        <Pressable testID="retry-sale" onPress={props.onRetry}>
          <Text>Retry</Text>
        </Pressable>
      </View>
    ),
  };
});

describe("Sell complete route orchestration", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockExecute.mockReset().mockResolvedValue(undefined);
    mockId = 0;
    mockCurrentUser = { userId: "owner", isResolvingUser: false };
  });
  it("records directly and returns to the same Details route without duplicating it", async (): Promise<void> => {
    const screen = render(<SellMetalHoldingRoute />);
    expect(screen.getByTestId("currency-value")).toHaveTextContent("EGP");
    fireEvent.press(screen.getByTestId("enter-sale"));
    fireEvent.press(screen.getByTestId("submit-sale"));
    await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1));
    await act(async (): Promise<void> => {
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(router.dismissTo).toHaveBeenCalledWith({
        pathname: "/metals/[id]",
        params: { id: "holding" },
      })
    );
    expect(mockToast).toHaveBeenCalledWith({
      type: "success",
      title: "Sale recorded.",
    });
  });
  it("guards dirty cancellation and preserves input when editing continues", (): void => {
    const screen = render(<SellMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("enter-sale"));
    fireEvent.press(screen.getByTestId("cancel-sale"));
    expect(screen.getByTestId("metal-holding-sell-exit-guard")).toHaveStyle({
      paddingBottom: 50,
    });
    expect(router.back).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Keep editing"));
    expect(screen.getByTestId("gross-value")).toHaveTextContent("120");
    expect(mockExecute).not.toHaveBeenCalled();
  });
  it("preserves the command after failed submit and retries exactly once", async (): Promise<void> => {
    mockExecute
      .mockRejectedValueOnce(new Error("local_write_failed"))
      .mockResolvedValueOnce(undefined);
    const screen = render(<SellMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("enter-sale"));
    fireEvent.press(screen.getByTestId("submit-sale"));
    await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1));
    await act(async (): Promise<void> => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("gross-value")).toHaveTextContent("120");
    fireEvent.press(screen.getByTestId("retry-sale"));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledTimes(1));
    expect(mockExecute.mock.calls[1][0]).toBe(mockExecute.mock.calls[0][0]);
  });
  it("reloads a stale holding instead of retrying its rejected revision", async (): Promise<void> => {
    mockExecute.mockRejectedValueOnce(new Error("holding_revision_conflict"));
    const screen = render(<SellMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("enter-sale"));
    fireEvent.press(screen.getByTestId("submit-sale"));
    await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1));
    await act(async (): Promise<void> => {
      await Promise.resolve();
    });
    fireEvent.press(screen.getByTestId("retry-sale"));
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
  it("does not navigate or announce success after the authenticated form unmounts", async (): Promise<void> => {
    const pending: { complete: (() => void) | null } = { complete: null };
    mockExecute.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          pending.complete = resolve;
        })
    );
    const screen = render(<SellMetalHoldingRoute />);
    fireEvent.press(screen.getByTestId("enter-sale"));
    fireEvent.press(screen.getByTestId("submit-sale"));
    await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(1));
    screen.unmount();
    await act(async (): Promise<void> => {
      pending.complete?.();
      await Promise.resolve();
    });
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});
