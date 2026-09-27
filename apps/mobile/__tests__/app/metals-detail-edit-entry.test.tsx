import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
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
jest.mock("@/components/metals/MetalHoldingDetailScreen", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: ({
      actions,
    }: {
      readonly actions: ReadonlyArray<{ id: string; labelKey: string }>;
    }): React.JSX.Element => <View testID="detail-screen-actions-empty">{actions.length === 0 ? "no-actions" : "has-actions"}</View>,
  };
});
it("opens the existing Edit route from the detail header action", () => {
  render(<MetalHoldingDetailRoute />);
  expect(screen.getByTestId("detail-screen-actions-empty")).toHaveTextContent(
    "no-actions"
  );
  fireEvent.press(screen.getByTestId("metal-holding-detail-edit"));
  expect(router.push).toHaveBeenCalledWith("/metals/holding-123/edit");
});
