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
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));
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
  const { Text, Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: ({
      actions,
      onAction,
    }: {
      actions: ReadonlyArray<{ id: string; labelKey: string }>;
      onAction: (id: string) => void;
    }): React.JSX.Element => (
      <>
        {actions.map((action) => (
          <Pressable key={action.id} onPress={() => onAction(action.id)}>
            <Text>{action.labelKey}</Text>
          </Pressable>
        ))}
      </>
    ),
  };
});
it("opens the existing Edit route from holding details", () => {
  render(<MetalHoldingDetailRoute />);
  fireEvent.press(screen.getByText("actions.edit"));
  expect(router.push).toHaveBeenCalledWith("/metals/holding-123/edit");
});
