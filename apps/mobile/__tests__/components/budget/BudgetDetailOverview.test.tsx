import React from "react";
import { render, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { BudgetDetailOverview } from "@/components/budget/BudgetDetailOverview";

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));

describe("BudgetDetailOverview", () => {
  it("shows the approved values and accessible linear progress", () => {
    render(
      <BudgetDetailOverview
        metrics={{
          spent: 1750,
          limit: 5000,
          remaining: 3250,
          percentage: 35,
          dailyAverage: 135,
          status: "safe",
        }}
        currency="EGP"
        daysLeft={18}
      />
    );

    expect(screen.getByText("Spent")).toBeOnTheScreen();
    expect(screen.getByText(/1,750/)).toBeOnTheScreen();
    expect(screen.getAllByText("35%").length).toBeGreaterThan(0);
    expect(screen.getByText("Daily average spent")).toBeOnTheScreen();
    expect(screen.getByText(/135.*day/)).toBeOnTheScreen();
    expect(screen.getByText("18 days")).toBeOnTheScreen();
    expect(screen.getByTestId("budget-detail-progress")).toHaveProp(
      "accessibilityRole",
      "progressbar"
    );
    expect(screen.getByTestId("budget-detail-progress-marker")).toHaveStyle({
      left: "35%",
    });
    expect(screen.getByTestId("budget-detail-progress")).toHaveProp(
      "accessibilityValue",
      expect.objectContaining({ min: 0, max: 100, now: 35 })
    );
  });

  it("keeps the actual percentage accessible while clamping visual width", () => {
    render(
      <BudgetDetailOverview
        metrics={{
          spent: 1500,
          limit: 1000,
          remaining: 0,
          percentage: 150,
          dailyAverage: 50,
          status: "danger",
        }}
        currency="EGP"
        daysLeft={0}
      />
    );

    expect(screen.getAllByText("150%").length).toBeGreaterThan(0);
    expect(screen.getByTestId("budget-detail-progress-fill")).toHaveStyle({
      width: "100%",
    });
    expect(screen.getByText("Over budget")).toBeOnTheScreen();
  });

  it("uses responsive stacking and AA semantic tones", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../components/budget/BudgetDetailOverview.tsx"),
      "utf8"
    );
    expect(source).toContain("useWindowDimensions");
    expect(source).toContain("text-nileGreen-700 dark:text-nileGreen-400");
    expect(source).toContain("text-red-600 dark:text-red-500");
    expect(source).toContain("text-gold-800 dark:text-gold-400");
  });
});
