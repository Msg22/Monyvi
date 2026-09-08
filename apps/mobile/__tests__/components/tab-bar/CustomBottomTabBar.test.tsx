import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";

const mockSetTabBarHeight = jest.fn<void, [number]>();

jest.mock("expo-blur", () => ({
  BlurView: ({ children }: { readonly children: React.ReactNode }) => {
    const { View: MockView } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockView>{children}</MockView>;
  },
}));

jest.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: { readonly children: React.ReactNode }) => {
    const { View: MockView } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockView>{children}</MockView>;
  },
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ language: "en" }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => `translated:${key}` }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

jest.mock("@/components/tab-bar/TabIcon", () => ({
  TabIcon: ({ label }: { readonly label: string }) => {
    const { Text: MockText } =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText testID="tab-icon-label">{label}</MockText>;
  },
}));

import { CustomBottomTabBar } from "@/components/tab-bar/CustomBottomTabBar";

const tabBarProps = {
  state: {
    index: 0,
    key: "tabs",
    routeNames: ["index", "accounts", "transactions", "metals"],
    routes: [
      { key: "index-key", name: "index" },
      { key: "accounts-key", name: "accounts" },
      { key: "transactions-key", name: "transactions" },
      { key: "metals-key", name: "metals" },
    ],
    stale: false,
    type: "tab",
    history: [],
    preloadedRouteKeys: [],
  },
  descriptors: {},
  navigation: {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  },
  insets: { top: 0, right: 0, bottom: 34, left: 0 },
} as unknown as BottomTabBarProps;

describe("CustomBottomTabBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports its measured height to tab screens", () => {
    render(
      <BottomTabBarHeightCallbackContext.Provider value={mockSetTabBarHeight}>
        <CustomBottomTabBar {...tabBarProps} />
      </BottomTabBarHeightCallbackContext.Provider>
    );

    fireEvent(screen.getByTestId("custom-bottom-tab-bar"), "layout", {
      nativeEvent: { layout: { height: 114 } },
    });

    expect(mockSetTabBarHeight).toHaveBeenCalledWith(114);
  });

  it("uses translated labels for tab text and accessibility labels", () => {
    render(
      <BottomTabBarHeightCallbackContext.Provider value={mockSetTabBarHeight}>
        <CustomBottomTabBar {...tabBarProps} />
      </BottomTabBarHeightCallbackContext.Provider>
    );

    for (const key of ["home", "accounts", "transactions", "metals"]) {
      expect(screen.getAllByLabelText(`translated:${key}`).length).toBe(2);
      expect(screen.getAllByText(`translated:${key}`).length).toBe(2);
    }
    expect(screen.queryByText("Home")).toBeNull();
    expect(screen.queryByText("Metals")).toBeNull();
  });
});
