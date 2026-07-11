import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { PageHeader } from "@/components/navigation/PageHeader";

const mockRouterBack = jest.fn();

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
  } => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
      expect.stringContaining("bg-slate-50")
    );
    expect(screen.getByTestId("review-page-header")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-950")
    );

    fireEvent.press(screen.getByTestId("header-back"));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockRouterBack).not.toHaveBeenCalled();
  });
});
