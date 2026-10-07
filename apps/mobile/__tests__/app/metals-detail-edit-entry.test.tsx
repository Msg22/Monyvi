import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { HoldingActionDescriptor } from "@/components/metals/holding-actions/registry";
import { router } from "expo-router";
import MetalHoldingDetailRoute from "@/app/(private)/metals/[id]";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: "holding-123" }),
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
    model: {
      status: "active",
      isActiveOwnership: true,
      isFinancialActionLocked: false,
    },
    isLoading: false,
    isOffline: false,
    error: null,
    retry: jest.fn(),
  }),
}));
let mockCapturedActions: readonly HoldingActionDescriptor[] = [];

jest.mock("@/components/metals/MetalHoldingDetailScreen", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: ({
      actions,
    }: {
      readonly actions: readonly HoldingActionDescriptor[];
    }): React.JSX.Element => {
      mockCapturedActions = actions;
      return <View testID="detail-screen-actions" />;
    },
  };
});

it("keeps Delete as the only body action while Edit remains the header action", () => {
  render(<MetalHoldingDetailRoute />);

  expect(mockCapturedActions).toEqual([
    {
      id: "delete",
      labelKey: "actions.delete",
      tone: "danger",
      href: {
        pathname: "/(private)/metals/[holdingId]/delete",
        params: { holdingId: "holding-123" },
      },
    },
  ]);
  expect(mockCapturedActions.some((action) => action.id === "sell")).toBe(false);
  expect(mockCapturedActions.some((action) => action.id === "dispose")).toBe(false);
  expect(mockCapturedActions.some((action) => action.id === "undo")).toBe(false);

  fireEvent.press(screen.getByTestId("metal-holding-detail-edit"));
  expect(router.push).toHaveBeenCalledWith("/metals/holding-123/edit");
});
