import React from "react";
import { render, screen } from "@testing-library/react-native";

import { SubcategoryBreakdown } from "@/components/budget/SubcategoryBreakdown";

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

describe("SubcategoryBreakdown", () => {
  it("renders compact noninteractive rows with counts and no chevrons", () => {
    render(
      <SubcategoryBreakdown
        data={[
          {
            categoryId: "groceries",
            name: "Groceries",
            icon: {
              kind: "CATEGORY",
              iconName: "cart-outline",
              iconLibrary: "Ionicons",
              tone: "GREEN",
            },
            transactionCount: 12,
            amount: 1050,
            percentage: 60,
          },
        ]}
        currency="EGP"
      />
    );
    expect(screen.getByText("Category breakdown")).toBeOnTheScreen();
    expect(screen.getByText("Groceries")).toBeOnTheScreen();
    expect(screen.getByText("Groceries")).toHaveProp("numberOfLines", 2);
    expect(screen.getByText("12 transactions")).toBeOnTheScreen();
    expect(screen.getByText("60%")).toBeOnTheScreen();
    expect(screen.queryByTestId("category-breakdown-chevron")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps an applicable empty section visible", () => {
    render(<SubcategoryBreakdown data={[]} currency="EGP" />);
    expect(screen.getByText("Category breakdown")).toBeOnTheScreen();
    expect(screen.getByText("No category spending yet")).toBeOnTheScreen();
  });
});
