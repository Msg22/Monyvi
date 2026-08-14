import React from "react";
import { render, screen, within } from "@testing-library/react-native";
import type { DimensionValue } from "react-native";

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: ({
    width,
    height,
    borderRadius,
  }: {
    readonly width: DimensionValue;
    readonly height: number;
    readonly borderRadius?: number;
  }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return (
      <ReactNative.View
        testID="skeleton-block"
        style={{ width, height, borderRadius }}
      />
    );
  },
}));

import { BudgetDashboardSkeleton } from "@/components/budget/BudgetDashboardSkeleton";

describe("BudgetDashboardSkeleton", () => {
  it("matches scope tabs, two filter cards, result count, and compact rows", () => {
    render(<BudgetDashboardSkeleton />);

    expect(
      screen.getByTestId("budget-filter-skeleton-shell")
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId("budget-scope-tab-skeletons")).getAllByTestId(
        "skeleton-block"
      )
    ).toHaveLength(3);

    expect(
      within(screen.getByTestId("budget-filter-card-skeletons")).getAllByTestId(
        "skeleton-block"
      )
    ).toHaveLength(8);
    expect(
      screen.getByTestId("budget-result-count-skeleton")
    ).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^budget-row-skeleton-\d+$/)).toHaveLength(3);
    expect(screen.getByTestId("budget-row-skeleton-group")).not.toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
    for (let index = 0; index < 3; index += 1) {
      expect(
        screen.getByTestId(`budget-row-icon-skeleton-${index}`)
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(`budget-row-copy-skeleton-${index}`)
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(`budget-row-metric-skeleton-${index}`)
      ).toBeOnTheScreen();
      expect(
        screen.getByTestId(`budget-row-chevron-skeleton-${index}`)
      ).toBeOnTheScreen();
    }
    expect(screen.queryByTestId("budget-global-card-skeleton")).toBeNull();
    expect(screen.queryByTestId("budget-carousel-dot-skeletons")).toBeNull();
    expect(screen.queryByTestId("activity-indicator")).toBeNull();
  });
});
