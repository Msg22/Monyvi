import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";

const mockSetTabBarHeight = jest.fn<void, [number]>();
let mockLanguage: "en" | "ar" = "en";

const mockCommonTranslations = {
  en: {
    home: "Home",
    accounts: "Accounts",
    transactions: "Transactions",
    metals: "Metals",
    voice_recording_label: "Voice input - record a transaction",
    voice_recording_hint: "Tap to start voice recording for a transaction",
  },
  ar: {
    home: "الرئيسية",
    accounts: "الحسابات",
    transactions: "المعاملات",
    metals: "المعادن",
    voice_recording_label: "إدخال صوتي - تسجيل معاملة",
    voice_recording_hint: "اضغط لبدء التسجيل الصوتي لإضافة معاملة",
  },
} as const;

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
  useLocale: () => ({ language: mockLanguage }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: keyof (typeof mockCommonTranslations)["en"]) =>
      mockCommonTranslations[mockLanguage][key],
  }),
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
    mockLanguage = "en";
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

  it("uses English and Arabic tab text and accessibility metadata", () => {
    const { unmount } = render(
      <BottomTabBarHeightCallbackContext.Provider value={mockSetTabBarHeight}>
        <CustomBottomTabBar {...tabBarProps} />
      </BottomTabBarHeightCallbackContext.Provider>
    );

    for (const label of ["Home", "Accounts", "Transactions", "Metals"]) {
      expect(screen.getAllByLabelText(label).length).toBe(2);
      expect(screen.getAllByText(label).length).toBe(2);
    }
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveProp("accessibilityLanguage", "en");
    }
    expect(
      screen.getByLabelText("Voice input - record a transaction")
    ).toHaveProp("accessibilityLanguage", "en");

    unmount();
    mockLanguage = "ar";
    render(
      <BottomTabBarHeightCallbackContext.Provider value={mockSetTabBarHeight}>
        <CustomBottomTabBar {...tabBarProps} />
      </BottomTabBarHeightCallbackContext.Provider>
    );

    for (const label of ["الرئيسية", "الحسابات", "المعاملات", "المعادن"]) {
      expect(screen.getAllByLabelText(label).length).toBe(2);
      expect(screen.getAllByText(label).length).toBe(2);
    }
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveProp("accessibilityLanguage", "ar");
    }
    expect(screen.getByLabelText("إدخال صوتي - تسجيل معاملة")).toHaveProp(
      "accessibilityLanguage",
      "ar"
    );
  });
});
