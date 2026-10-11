import React from "react";
import { render } from "@testing-library/react-native";
import SellMetalHoldingRoute from "../../app/(private)/metals/[holdingId]/sell";

const mockParams: { holdingId?: string } = { holdingId: "holding" };
const mockCurrentUser: { userId: string | null; isResolvingUser: boolean } = {
  userId: "owner",
  isResolvingUser: false,
};
const mockProduction = jest.fn((_holdingId: string, _locale: string) => ({
  holding: null,
  isLoading: true,
  loadError: null,
  reload: jest.fn(),
  createId: jest.fn(),
  execute: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { back: jest.fn(), dismissTo: jest.fn() },
}));
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockCurrentUser,
}));
jest.mock("@/hooks/useSellMetalHoldingProduction", () => ({
  useSellMetalHoldingProduction: (holdingId: string, locale: string) =>
    mockProduction(holdingId, locale),
}));
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: "PageHeader",
}));
jest.mock("@/components/ui/Skeleton", () => ({ Skeleton: "Skeleton" }));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
    i18n: { language: "en" },
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

describe("Sell route auth boundary", () => {
  beforeEach((): void => {
    mockParams.holdingId = "holding";
    mockCurrentUser.userId = "owner";
    mockCurrentUser.isResolvingUser = false;
    mockProduction.mockClear();
  });
  it("mounts no owned loader or form while auth resolves", (): void => {
    mockCurrentUser.isResolvingUser = true;
    const screen = render(<SellMetalHoldingRoute />);
    expect(screen.getByTestId("metal-holding-sell-auth-loading")).toBeTruthy();
    expect(mockProduction).not.toHaveBeenCalled();
  });
  it("mounts no owned loader for a signed-out account", (): void => {
    mockCurrentUser.userId = null;
    render(<SellMetalHoldingRoute />);
    expect(mockProduction).not.toHaveBeenCalled();
  });
  it("shows recovery for missing ID without querying any holding", (): void => {
    mockParams.holdingId = undefined;
    const screen = render(<SellMetalHoldingRoute />);
    expect(screen.getByTestId("metal-holding-sell-missing-id")).toBeTruthy();
    expect(mockProduction).not.toHaveBeenCalled();
  });
  it("loads the authenticated holding with content Skeleton", (): void => {
    const screen = render(<SellMetalHoldingRoute />);
    expect(screen.getByTestId("metal-holding-sell-loading")).toBeTruthy();
    expect(mockProduction).toHaveBeenCalledWith("holding", "en");
  });
});
