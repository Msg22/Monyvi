import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));
jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));

let mockScreenWidth = 360;
let mockFontScale = 1;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({
    width: mockScreenWidth,
    height: 844,
    scale: 1,
    fontScale: mockFontScale,
  }),
}));

import type { BudgetDetailIdentity as Identity } from "@/contracts/budget-detail-presentation";
import { BudgetDetailIdentity } from "@/components/budget/BudgetDetailIdentity";

const identity: Identity = {
  budgetId: "food-budget",
  name: "Food & Drinks",
  type: "CATEGORY",
  lifecycle: "ACTIVE",
  period: "MONTHLY",
  periodStart: new Date(2026, 7, 1),
  periodEnd: new Date(2026, 7, 31),
  icon: {
    kind: "CATEGORY",
    iconName: "restaurant-outline",
    iconLibrary: "Ionicons",
    tone: "GREEN",
  },
  availableLifecycleAction: "PAUSE",
};

describe("BudgetDetailIdentity", () => {
  it("renders identity metadata and a separately operable lifecycle action", () => {
    const onLifecycleAction = jest.fn();
    render(
      <BudgetDetailIdentity
        identity={identity}
        onLifecycleAction={onLifecycleAction}
      />
    );

    expect(screen.getByText("Food & Drinks")).toBeOnTheScreen();
    expect(screen.getByText("Active")).toBeOnTheScreen();
    expect(screen.getByText("Monthly")).toBeOnTheScreen();
    expect(screen.getByText(/Aug 1/)).toBeOnTheScreen();
    expect(
      screen.getByLabelText("Food & Drinks, Active, Monthly, Aug 1 – Aug 31")
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("budget-detail-category-icon", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();

    expect(screen.getByLabelText("Pause budget: Food & Drinks")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    fireEvent.press(screen.getByLabelText("Pause budget: Food & Drinks"));
    expect(onLifecycleAction).toHaveBeenCalledWith("PAUSE");
  });

  it("uses semantic fallback icons and omits invalid expired actions", () => {
    const { rerender } = render(
      <BudgetDetailIdentity
        identity={{ ...identity, type: "GLOBAL", icon: { kind: "GLOBAL" } }}
        onLifecycleAction={jest.fn()}
      />
    );
    expect(
      screen.getByTestId("budget-detail-global-icon", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();

    rerender(
      <BudgetDetailIdentity
        identity={{
          ...identity,
          lifecycle: "EXPIRED",
          icon: { kind: "DELETED_CATEGORY" },
          availableLifecycleAction: null,
        }}
        onLifecycleAction={jest.fn()}
      />
    );
    expect(
      screen.getByTestId("budget-detail-deleted-category-icon", {
        includeHiddenElements: true,
      })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("budget-detail-deleted-category-icon", {
        includeHiddenElements: true,
      })
    ).toHaveProp("importantForAccessibility", "no-hide-descendants");
    expect(screen.getByText("Expired")).toBeOnTheScreen();
    expect(screen.queryByText("Pause")).toBeNull();
    expect(screen.queryByText("Resume")).toBeNull();
  });

  it("keeps the lifecycle action beside the identity on an A54-sized viewport", () => {
    mockScreenWidth = 360;
    mockFontScale = 1;

    render(
      <BudgetDetailIdentity identity={identity} onLifecycleAction={jest.fn()} />
    );

    expect(screen.getByTestId("budget-detail-identity-row")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    expect(
      screen.queryByTestId("budget-detail-identity-lifecycle-row")
    ).toBeNull();
    expect(
      screen.getByTestId("budget-detail-lifecycle-action")
    ).toBeOnTheScreen();
  });

  it("moves the lifecycle action below only when the viewport is genuinely narrow", () => {
    mockScreenWidth = 320;
    mockFontScale = 1;

    render(
      <BudgetDetailIdentity identity={identity} onLifecycleAction={jest.fn()} />
    );

    expect(
      screen.getByTestId("budget-detail-identity-lifecycle-row")
    ).toBeOnTheScreen();
  });

  it("uses constrained wrapping and lifecycle-specific semantic tones", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../components/budget/BudgetDetailIdentity.tsx"),
      "utf8"
    );
    expect(source).toContain("useWindowDimensions");
    expect(source).toContain("text-nileGreen-700 dark:text-nileGreen-400");
    expect(source).toContain("text-red-600 dark:text-red-500");
    expect(source).toContain("border-slate-500");
  });

  it("includes years in a cross-year identity range", () => {
    render(
      <BudgetDetailIdentity
        identity={{
          ...identity,
          periodStart: new Date(2025, 11, 28),
          periodEnd: new Date(2026, 0, 4),
        }}
        onLifecycleAction={jest.fn()}
      />
    );

    expect(screen.getByText(/Dec 28, 2025 – Jan 4, 2026/)).toBeOnTheScreen();
  });
});
