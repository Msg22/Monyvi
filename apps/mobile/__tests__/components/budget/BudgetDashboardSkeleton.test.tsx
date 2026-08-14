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
  it("matches the dashboard filters, overall carousel, and compact grouped rows", () => {
    render(<BudgetDashboardSkeleton />);

    expect(screen.getByTestId("budget-filter-skeleton-shell")).toHaveProp(
      "className",
      expect.stringContaining("-mx-5")
    );
    expect(
      within(screen.getByTestId("budget-filter-skeletons")).getAllByTestId(
        "skeleton-block"
      )
    ).toHaveLength(4);

    expect(
      screen.getByTestId("budget-overall-heading-skeleton")
    ).toBeOnTheScreen();
    expect(screen.getByTestId("budget-global-card-skeleton")).toHaveProp(
      "className",
      expect.stringContaining("h-64")
    );
    expect(
      within(
        screen.getByTestId("budget-global-card-title-skeleton")
      ).getAllByTestId("skeleton-block")
    ).toHaveLength(4);
    expect(
      screen.getByTestId("budget-global-card-progress-skeleton")
    ).toBeOnTheScreen();
    expect(
      within(
        screen.getByTestId("budget-carousel-dot-skeletons")
      ).getAllByTestId("skeleton-block")
    ).toHaveLength(2);

    expect(
      screen.getByTestId("budget-attention-heading-skeleton")
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
  });
});
