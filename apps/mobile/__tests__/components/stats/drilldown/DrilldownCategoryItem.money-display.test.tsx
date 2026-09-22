import { render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));

import { DrilldownCategoryItem } from "@/components/stats/drilldown/DrilldownCategoryItem";
import type { CategoryData } from "@/components/stats/drilldown/types";

function createCategory(amount: number): CategoryData {
  return {
    id: "c1",
    name: "Food",
    displayName: "Food",
    amount,
    percentage: 12.5,
    color: "#000000",
    level: 0,
    parentId: null,
    childrenIds: [],
  };
}

describe("DrilldownCategoryItem money display", () => {
  it("keeps the screen-reader amount equal to the visible amount", () => {
    render(
      <DrilldownCategoryItem
        category={createCategory(35500)}
        onPress={jest.fn()}
        canDrillDown
        currency="EGP"
      />
    );

    expect(screen.getByText("35,500 EGP")).toBeTruthy();
    expect(screen.getByTestId("drilldown-category-c1")).toHaveProp(
      "accessibilityLabel",
      expect.stringContaining("35,500 EGP")
    );
    expect(screen.getByTestId("drilldown-category-c1")).toHaveProp(
      "accessibilityLabel",
      expect.not.stringContaining("35,500.00")
    );
  });

  it("keeps meaningful fractions in both visible and spoken text", () => {
    render(
      <DrilldownCategoryItem
        category={createCategory(35500.1)}
        onPress={jest.fn()}
        canDrillDown
        currency="EGP"
      />
    );

    expect(screen.getByText("35,500.10 EGP")).toBeTruthy();
    expect(screen.getByTestId("drilldown-category-c1")).toHaveProp(
      "accessibilityLabel",
      expect.stringContaining("35,500.10 EGP")
    );
  });
});
