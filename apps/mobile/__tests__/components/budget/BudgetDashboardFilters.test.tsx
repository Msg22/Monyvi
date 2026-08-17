/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import React from "react";
import { Text as MockText } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";

let mockBottomInset = 16;
let mockIsDark = false;
let mockIsReducedMotion = false;

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>(
    "react-native-reanimated/mock"
  ),
  useReducedMotion: (): boolean => mockIsReducedMotion,
}));

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => mockBottomInset,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: mockIsDark }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string =>
      ({
        filter_all: "All",
        category_type: "Category",
        global_type: "Global",
        period: "Period",
        status: "Status",
        filter_weekly: "Weekly",
        filter_monthly: "Monthly",
        filter_custom: "Custom",
        filter_active: "Active",
        filter_paused: "Paused",
        filter_expired: "Expired",
        select_period: "Select period",
        select_status: "Select status",
        close: "Close",
      })[key] ?? key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({
    name,
    color,
  }: {
    readonly name: string;
    readonly color: string;
  }) => (
    <MockText testID={`icon-${name}`} accessibilityLabel={color}>
      {name}
    </MockText>
  ),
}));

jest.mock("@/constants/colors", () => ({
  palette: {
    nileGreen: { 500: "#000" },
    slate: { 25: "#fff", 300: "#300", 400: "#400", 500: "#500" },
  },
}));

import { BudgetDashboardFilters } from "@/components/budget/BudgetDashboardFilters";

describe("BudgetDashboardFilters", () => {
  beforeEach(() => {
    mockBottomInset = 16;
    mockIsDark = false;
    mockIsReducedMotion = false;
  });

  it("shows approved scope order and current Period/Status values", () => {
    render(
      <BudgetDashboardFilters
        filters={{ scope: "ALL", period: "ALL", status: "ACTIVE" }}
        onSelectScope={jest.fn()}
        onSelectPeriod={jest.fn()}
        onSelectStatus={jest.fn()}
      />
    );

    expect(
      screen.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)
    ).toEqual(["All", "Category", "Global"]);
    expect(screen.getByRole("tab", { name: "All" })).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
    expect(
      screen.getByRole("button", { name: "Period, All" })
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Status, Active" })
    ).toBeOnTheScreen();
    const tabListClassName = screen.getByTestId("budget-scope-tabs").props
      .className as string;
    const tabListClasses = tabListClassName.split(/\s+/).filter(Boolean);
    expect(tabListClasses).toContain("min-h-12");
    expect(tabListClasses).not.toContain("h-12");

    expect(screen.getByTestId("budget-filter-period-layout")).toHaveProp(
      "className",
      expect.stringContaining("min-h-16")
    );
    expect(screen.getByTestId("budget-filter-cards")).toHaveProp(
      "className",
      expect.stringContaining("mt-3")
    );
  });

  it("selects scope directly and Period/Status through safe-area option sheets", () => {
    const onSelectScope = jest.fn();
    const onSelectPeriod = jest.fn();
    const onSelectStatus = jest.fn();
    render(
      <BudgetDashboardFilters
        filters={{ scope: "ALL", period: "ALL", status: "ACTIVE" }}
        onSelectScope={onSelectScope}
        onSelectPeriod={onSelectPeriod}
        onSelectStatus={onSelectStatus}
      />
    );

    fireEvent.press(screen.getByRole("tab", { name: "Category" }));
    expect(onSelectScope).toHaveBeenCalledWith("CATEGORY");

    fireEvent.press(screen.getByRole("button", { name: "Period, All" }));
    expect(
      screen.getByTestId("budget-filter-option-sheet").props.style
    ).toEqual({
      paddingBottom: 32,
    });
    fireEvent.press(screen.getByRole("radio", { name: "Weekly" }));
    expect(onSelectPeriod).toHaveBeenCalledWith("WEEKLY");

    fireEvent.press(screen.getByRole("button", { name: "Status, Active" }));
    fireEvent.press(screen.getByRole("radio", { name: "Expired" }));
    expect(onSelectStatus).toHaveBeenCalledWith("EXPIRED");
  });

  it("announces expanded and selected option state", () => {
    render(
      <BudgetDashboardFilters
        filters={{ scope: "GLOBAL", period: "MONTHLY", status: "PAUSED" }}
        onSelectScope={jest.fn()}
        onSelectPeriod={jest.fn()}
        onSelectStatus={jest.fn()}
      />
    );

    const statusButton = screen.getByRole("button", { name: "Status, Paused" });
    expect(statusButton).toHaveProp("accessibilityState", { expanded: false });
    fireEvent.press(statusButton);
    expect(screen.getByRole("radio", { name: "Paused" })).toHaveProp(
      "accessibilityState",
      { selected: true }
    );
  });

  it("uses the resolved app theme for the filter-sheet close icon", () => {
    mockIsDark = true;
    render(
      <BudgetDashboardFilters
        filters={{ scope: "ALL", period: "ALL", status: "ACTIVE" }}
        onSelectScope={jest.fn()}
        onSelectPeriod={jest.fn()}
        onSelectStatus={jest.fn()}
      />
    );

    fireEvent.press(screen.getByRole("button", { name: "Period, All" }));

    expect(screen.getByTestId("icon-close")).toHaveProp(
      "accessibilityLabel",
      "#300"
    );
  });

  it("disables the filter-sheet slide when reduced motion is enabled", () => {
    mockIsReducedMotion = true;
    render(
      <BudgetDashboardFilters
        filters={{ scope: "ALL", period: "ALL", status: "ACTIVE" }}
        onSelectScope={jest.fn()}
        onSelectPeriod={jest.fn()}
        onSelectStatus={jest.fn()}
      />
    );

    fireEvent.press(screen.getByRole("button", { name: "Period, All" }));

    expect(screen.getByTestId("budget-filter-modal")).toHaveProp(
      "animationType",
      "none"
    );
  });
});
