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
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

jest.mock("@/components/tab-bar/TabIcon", () => ({
  TabIcon: () => null,
}));

import { CustomBottomTabBar } from "@/components/tab-bar/CustomBottomTabBar";

const tabBarProps = {
  state: {
    index: 0,
    key: "tabs",
    routeNames: ["index"],
    routes: [{ key: "index-key", name: "index" }],
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
});
