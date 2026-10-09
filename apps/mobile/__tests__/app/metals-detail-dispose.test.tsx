import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { HoldingActionDescriptor } from "@/components/metals/holding-actions/registry";
import { router } from "expo-router";
import MetalHoldingDetailRoute from "@/app/(private)/metals/[id]";

let mockModel: Record<string, unknown> | null = {
  status: "active",
  isActiveOwnership: true,
  isFinancialActionLocked: false,
};
let mockRouteId: string | string[] | undefined = "holding-123";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: mockRouteId }),
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
    status: "active",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
  };
  mockRouteId = "holding-123";
  mockCapturedActions = [];
});

describe("Detail No Longer production wiring", () => {
  it("exposes Dispose beside Delete for an effective active holding and preserves Edit", (): void => {
    render(<MetalHoldingDetailRoute />);
    expect(mockCapturedActions.map((action) => action.id)).toEqual([
      "dispose",
      "delete",
    ]);
    fireEvent.press(screen.getByTestId("metal-holding-detail-edit"));
    expect(router.push).toHaveBeenCalledWith("/metals/holding-123/edit");
    fireEvent.press(screen.getByTestId("detail-action-dispose"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(private)/metals/[holdingId]/dispose",
      params: { holdingId: "holding-123" },
    });
  });

  it.each([
    [
      "disposed terminal",
      {
        status: "disposed",
        isActiveOwnership: false,
        isFinancialActionLocked: false,
      },
    ],
    [
      "sold terminal",
      {
        status: "sold",
        isActiveOwnership: false,
        isFinancialActionLocked: false,
      },
    ],
    [
      "locked reconciliation",
      {
        status: "active",
        isActiveOwnership: true,
        isFinancialActionLocked: true,
      },
    ],
  ])("fails closed for %s without a dispose action", (_label, model): void => {
    mockModel = model;
    render(<MetalHoldingDetailRoute />);
    expect(mockCapturedActions.some((action) => action.id === "dispose")).toBe(
      false
    );
    expect(mockCapturedActions.some((action) => action.id === "delete")).toBe(
      false
    );
    expect(screen.queryByTestId("detail-action-dispose")).toBeNull();
  });

  it.each([["   "], ["  \t  "]])(
    "never throws for whitespace id %s and exposes no actions",
    (routeId): void => {
      mockRouteId = routeId;
      expect(() => render(<MetalHoldingDetailRoute />)).not.toThrow();
      expect(mockCapturedActions).toEqual([]);
      expect(screen.queryByTestId("detail-action-dispose")).toBeNull();
      expect(screen.queryByTestId("detail-action-delete")).toBeNull();
    }
  );
});
