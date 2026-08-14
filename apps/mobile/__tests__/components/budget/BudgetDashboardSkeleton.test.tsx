import React from "react";
import { render, screen, within } from "@testing-library/react-native";
jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return <ReactNative.View testID="skeleton-block" />;
  },
}));

import { BudgetDashboardSkeleton } from "@/components/budget/BudgetDashboardSkeleton";

describe("BudgetDashboardSkeleton", () => {
  it("matches four filters and full-width compact grouped rows", () => {
    render(<BudgetDashboardSkeleton />);

    expect(
      within(screen.getByTestId("budget-filter-skeletons")).getAllByTestId(
        "skeleton-block"
      )
    ).toHaveLength(4);
    expect(screen.getAllByTestId(/^budget-row-skeleton-\d+$/)).toHaveLength(3);
    expect(screen.getByTestId("budget-row-skeleton-group")).not.toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );
  });
});
