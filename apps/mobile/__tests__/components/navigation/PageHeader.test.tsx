import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { I18nManager } from "react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PageHeader } from "@/components/navigation/PageHeader";

const mockRouterBack = jest.fn();

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({
    name,
    color,
  }: {
    readonly name: string;
    readonly color: string;
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    const IconView = ReactNative.View as unknown as React.ComponentType<{
      readonly testID: string;
      readonly color: string;
    }>;
    return <IconView testID={`icon-${name}`} color={color} />;
  },
}));

jest.mock("expo-router", () => ({
  useRouter: (): { readonly back: typeof mockRouterBack } => ({
    back: mockRouterBack,
  }),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: true }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({ top: 24, right: 0, bottom: 0, left: 0 }),
}));

jest.mock("@/components/navigation/AppDrawer", () => ({
  AppDrawer: (): null => null,
}));

describe("PageHeader review variant", () => {
  beforeEach(() => {
    mockRouterBack.mockReset();
  });

  it("renders the approved title and subtitle and uses the supplied back action", () => {
    const onBack = jest.fn();

    render(
      <PageHeader
        title="Review transactions"
        subtitle="3 found from SMS scan"
        variant="review"
        includeTopSafeAreaInset
        showDrawer={false}
        showBackButton
        onBack={onBack}
        backAccessibilityLabel="Back"
      />
    );

    expect(screen.getByText("Review transactions")).toBeTruthy();
    expect(screen.getByText("3 found from SMS scan")).toBeTruthy();
    expect(screen.getByLabelText("Back")).toBeTruthy();
    expect(screen.getByTestId("review-page-header")).toHaveProp(
      "className",
      expect.stringContaining("bg-background")
    );
    expect(screen.getByTestId("review-page-header")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
    expect(screen.getByTestId("review-page-header")).toHaveStyle({
      paddingTop: 32,
    });

    fireEvent.press(screen.getByTestId("header-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it("does not double-apply the top inset when its parent owns the safe area", () => {
    render(
      <PageHeader
        title="Review transactions"
        variant="review"
        showDrawer={false}
      />
    );

    expect(screen.getByTestId("review-page-header")).toHaveStyle({
      paddingTop: 8,
    });
  });

  it("names icon actions and keeps NativeWind shadow classes off the touchable", () => {
    render(
      <PageHeader
        title="Budgets"
        showDrawer={false}
        rightAction={{
          icon: "add",
          accessibilityLabel: "Create budget",
          onPress: jest.fn(),
        }}
      />
    );

    expect(screen.getByLabelText("Create budget")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(screen.getByLabelText("Create budget")).toHaveStyle({ elevation: 2 });
  });

  it("renders an icon and label together with an explicit brand icon color", () => {
    const onPress = jest.fn();

    render(
      <PageHeader
        title="Budget Detail"
        showDrawer={false}
        rightAction={{
          icon: "create-outline",
          label: "Edit",
          iconColor: "#10B981",
          accessibilityLabel: "Edit budget",
          onPress,
          transparent: true,
        }}
      />
    );

    expect(screen.getByLabelText("Edit budget")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(
      readFileSync(
        resolve(__dirname, "../../../components/navigation/PageHeader.tsx"),
        "utf8"
      )
    ).toContain("min-h-11");
    expect(screen.getByText("Edit")).toBeOnTheScreen();
    expect(screen.getByTestId("icon-create-outline")).toHaveProp(
      "color",
      "#10B981"
    );

    fireEvent.press(screen.getByLabelText("Edit budget"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps the default Back action labelled and at least 44dp", () => {
    const onBack = jest.fn();

    render(
      <PageHeader
        title="Budget Detail"
        showDrawer={false}
        showBackButton
        onBack={onBack}
        backAccessibilityLabel="Back"
      />
    );

    expect(screen.getByLabelText("Back")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(
      readFileSync(
        resolve(__dirname, "../../../components/navigation/PageHeader.tsx"),
        "utf8"
      )
    ).toContain("min-h-11 min-w-11");

    fireEvent.press(screen.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it("mirrors the default Back arrow in RTL", () => {
    const original = I18nManager.isRTL;
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: true,
    });
    render(
      <PageHeader
        title="Budget Detail"
        showDrawer={false}
        showBackButton
        backAccessibilityLabel="Back"
      />
    );
    expect(screen.getByTestId("icon-arrow-forward-outline")).toBeOnTheScreen();
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: original,
    });
  });

  it("uses accessible light and dark brand tones for labelled actions", () => {
    expect(
      readFileSync(
        resolve(__dirname, "../../../components/navigation/PageHeader.tsx"),
        "utf8"
      )
    ).toContain("text-nileGreen-700 dark:text-nileGreen-400");
  });
});
