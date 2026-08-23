import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { I18nManager } from "react-native";

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));
jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

import { BudgetRecentTransactions } from "@/components/budget/BudgetRecentTransactions";

const transaction = {
  transactionId: "tx-1",
  label: "Carrefour Citystars",
  date: new Date(2026, 7, 8),
  amount: 450,
  currency: "EGP" as const,
  icon: {
    kind: "CATEGORY" as const,
    iconName: "cart-outline",
    iconLibrary: "Ionicons" as const,
    tone: "GREEN" as const,
  },
};

describe("BudgetRecentTransactions", () => {
  it("makes the entire row one edit-intent target", () => {
    const onPressTransaction = jest.fn();
    render(
      <BudgetRecentTransactions
        transactions={[transaction]}
        onPressTransaction={onPressTransaction}
      />
    );
    expect(screen.getByText("Recent transactions")).toBeOnTheScreen();
    expect(screen.getByText("Carrefour Citystars")).toHaveProp(
      "numberOfLines",
      2
    );
    expect(screen.queryByText("View all")).toBeNull();
    expect(
      screen.getByLabelText(/Edit transaction.*Carrefour Citystars/)
    ).toHaveProp("accessibilityRole", "button");
    fireEvent.press(
      screen.getByLabelText(/Edit transaction.*Carrefour Citystars/)
    );
    expect(onPressTransaction).toHaveBeenCalledWith("tx-1");
  });

  it("shows a compact empty state", () => {
    render(
      <BudgetRecentTransactions
        transactions={[]}
        onPressTransaction={jest.fn()}
      />
    );
    expect(screen.getByText("No matching transactions yet")).toBeOnTheScreen();
  });

  it("uses the localized transaction fallback when the read model has no label", () => {
    render(
      <BudgetRecentTransactions
        transactions={[{ ...transaction, label: null }]}
        onPressTransaction={jest.fn()}
      />
    );

    expect(screen.getByText("Transaction")).toBeOnTheScreen();
    expect(screen.getByLabelText(/Edit transaction.*Transaction/)).toHaveProp(
      "accessibilityRole",
      "button"
    );
  });

  it("mirrors the decorative chevron in RTL", () => {
    const original = I18nManager.isRTL;
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: true,
    });
    render(
      <BudgetRecentTransactions
        transactions={[transaction]}
        onPressTransaction={jest.fn()}
      />
    );
    expect(screen.getByTestId("recent-transaction-chevron-tx-1")).toHaveProp(
      "accessibilityLabel",
      "chevron-back"
    );
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: original,
    });
  });
});
