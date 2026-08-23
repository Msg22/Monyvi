import React from "react";
import { render, screen } from "@testing-library/react-native";

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.View testID="detail-skeleton-block" />;
  },
}));

import { BudgetDetailSkeleton } from "@/components/budget/BudgetDetailSkeleton";

describe("BudgetDetailSkeleton", () => {
  it("mirrors every approved category-detail region without actions", () => {
    render(<BudgetDetailSkeleton showCategoryBreakdown />);
    expect(screen.getByTestId("detail-skeleton-identity")).toBeOnTheScreen();
    expect(screen.getByTestId("detail-skeleton-overview")).toBeOnTheScreen();
    expect(screen.getByTestId("detail-skeleton-trend")).toBeOnTheScreen();
    expect(screen.getByTestId("detail-skeleton-trend-axis")).toBeOnTheScreen();
    expect(screen.getAllByTestId("detail-skeleton-trend-actual")).toHaveLength(4);
    expect(screen.getAllByTestId("detail-skeleton-trend-pace")).toHaveLength(4);
    expect(screen.getByTestId("detail-skeleton-breakdown")).toBeOnTheScreen();
    expect(screen.getByTestId("detail-skeleton-recent")).toBeOnTheScreen();
    expect(screen.getByTestId("detail-skeleton-danger")).toBeOnTheScreen();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("omits the inapplicable breakdown region for a known global budget", () => {
    render(<BudgetDetailSkeleton showCategoryBreakdown={false} />);
    expect(screen.queryByTestId("detail-skeleton-breakdown")).toBeNull();
  });
});
