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
});
