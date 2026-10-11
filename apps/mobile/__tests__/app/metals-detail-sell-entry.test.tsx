import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { HoldingActionDescriptor } from "@/components/metals/holding-actions/registry";
import { router } from "expo-router";
import MetalHoldingDetailRoute from "@/app/(private)/metals/[id]";

let mockModel: Record<string, unknown> | null = {
  id: "holding-123",
  status: "active",
  isActiveOwnership: true,
  isFinancialActionLocked: false,
  timeline: [],
};
let mockRouteId: string | string[] | undefined = "holding-123";

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: mockRouteId }),
}));
jest.mock("@/hooks/useUndoMetalHoldingContext", () => ({
  useUndoMetalHoldingContext: () => ({
    context: null,
    userId: null,
    isResolvingUser: false,
    isLoading: false,
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock("@/hooks/useRestoreMetalHolding", () => ({
  useRestoreMetalHolding: jest.fn(),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));
jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      rightAction,
    }: {
      readonly rightAction?: {
        readonly testID?: string;
        readonly accessibilityLabel?: string;
        readonly onPress: () => void;
      };
    }): React.JSX.Element | null =>
      rightAction ? (
        <Pressable
          testID={rightAction.testID ?? "header-right-action"}
          accessibilityLabel={rightAction.accessibilityLabel}
          onPress={rightAction.onPress}
        >
          <Text>Edit</Text>
        </Pressable>
      ) : null,
  };
});
jest.mock("@/hooks/useMetalHoldingDetail", () => ({
  useMetalHoldingDetail: () => ({
    model: mockModel,
    isLoading: false,
    isOffline: false,
    error: null,
    retry: jest.fn(),
  }),
}));
let mockCapturedActions: readonly HoldingActionDescriptor[] = [];

jest.mock("@/components/metals/MetalHoldingDetailScreen", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: ({
      actions,
      onAction,
    }: {
      readonly actions: readonly HoldingActionDescriptor[];
      readonly onAction?: (action: string) => void;
    }): React.JSX.Element => {
      mockCapturedActions = actions;
      return (
        <View>
          {actions.map((action) => (
            <Pressable
              key={action.id}
              testID={`detail-action-${action.id}`}
              onPress={(): void => onAction?.(action.id)}
            >
              <Text>{action.id}</Text>
            </Pressable>
          ))}
        </View>
      );
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockModel = {
    id: "holding-123",
    status: "active",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    timeline: [],
  };
  mockRouteId = "holding-123";
  mockCapturedActions = [];
});

describe("Details Sell reachability", () => {
  it("opens the real whole-holding Sell route beside other lifecycle actions", (): void => {
    render(<MetalHoldingDetailRoute />);
    expect(mockCapturedActions.map((action) => action.id)).toEqual([
      "sell",
      "dispose",
      "delete",
    ]);
    fireEvent.press(screen.getByTestId("detail-action-sell"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(private)/metals/[holdingId]/sell",
      params: { holdingId: "holding-123" },
    });
  });
  it.each(["sold", "disposed"] as const)(
    "hides Sell for %s",
    (status): void => {
      mockModel = {
        id: "holding-123",
        status,
        isActiveOwnership: false,
        isFinancialActionLocked: false,
        timeline: [],
      };
      render(<MetalHoldingDetailRoute />);
      expect(screen.queryByTestId("detail-action-sell")).toBeNull();
    }
  );
  it("hides Sell while reconciliation locks financial actions", (): void => {
    mockModel = {
      id: "holding-123",
      status: "active",
      isActiveOwnership: true,
      isFinancialActionLocked: true,
      timeline: [],
    };
    render(<MetalHoldingDetailRoute />);
    expect(screen.queryByTestId("detail-action-sell")).toBeNull();
  });
  it("normalizes the route ID without exposing a missing holding action", (): void => {
    mockRouteId = "   ";
    render(<MetalHoldingDetailRoute />);
    expect(mockCapturedActions).toEqual([]);
  });
});
