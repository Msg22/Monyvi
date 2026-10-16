import { render, screen } from "@testing-library/react-native";
import React from "react";

import MetalHoldingDetailRoute from "../../app/(private)/metals/[id]";

let mockStatus: "active" | "sold" | "disposed" = "active";

jest.mock("expo-router", () => ({
  useLocalSearchParams: (): { readonly id: string } => ({ id: "holding-1" }),
  useFocusEffect: jest.fn(),
  router: { dismissTo: jest.fn(), push: jest.fn() },
}));

jest.mock("@/hooks/useUndoMetalHoldingContext", () => ({
  useUndoMetalHoldingContext: () => ({
    context: null,
    userId: "owner",
    isResolvingUser: false,
    isLoading: false,
    error: null,
    retry: jest.fn(),
  }),
}));
jest.mock("@/hooks/useRestoreMetalHolding", () => ({
  useRestoreMetalHolding: jest.fn(),
}));

jest.mock("@/hooks/useMetalHoldingDetail", () => ({
  useMetalHoldingDetail: (): {
    readonly error: null;
    readonly isLoading: false;
    readonly isOffline: false;
    readonly model: {
      readonly id: string;
      readonly status: typeof mockStatus;
      readonly isActiveOwnership: boolean;
      readonly isFinancialActionLocked: false;
      readonly timeline: readonly never[];
    };
    readonly retry: jest.Mock;
  } => ({
    error: null,
    isLoading: false,
    isOffline: false,
    model: {
      id: "holding-1",
      status: mockStatus,
      isActiveOwnership: mockStatus === "active",
      isFinancialActionLocked: false,
      timeline: [],
    },
    retry: jest.fn(),
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({ title }: { readonly title: string }): React.JSX.Element =>
      React.createElement(Text, { testID: "detail-route-title" }, title),
  };
});

jest.mock("@/components/metals/MetalHoldingDetailScreen", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    MetalHoldingDetailScreen: (): React.JSX.Element =>
      React.createElement(View, { testID: "detail-screen" }),
  };
});

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string =>
      ({
        "detail.title": "Holding details",
        "detail.sold_title": "Sold holding",
        "detail.disposed_title": "Disposed holding",
      })[key] ?? key,
  }),
}));

describe("metal holding detail route titles", () => {
  it.each([
    ["active", "Holding details"],
    ["sold", "Sold holding"],
    ["disposed", "Disposed holding"],
  ] as const)("uses the approved %s title", (status, title) => {
    mockStatus = status;

    render(<MetalHoldingDetailRoute />);

    expect(screen.getByTestId("detail-route-title")).toHaveTextContent(title);
    expect(screen.getByTestId("detail-screen")).toBeTruthy();
  });
});
