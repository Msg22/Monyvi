import { render, screen } from "@testing-library/react-native";
import type { ReviewableTransaction } from "@monyvi/logic";
import React from "react";
import { TransactionItem } from "@/components/transaction-review/TransactionItem";

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "ar" }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

function createTransaction(): ReviewableTransaction {
  return {
    amount: 125,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Fixture Shop",
    date: new Date("2026-01-02T10:30:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.95,
    originLabel: "QNB",
    source: "SMS",
  };
}

function renderItem(isSmsWorkspace = false): void {
  render(
    <TransactionItem
      transaction={createTransaction()}
      index={0}
      isSelected
      accountName="QNB Account"
      onToggleSelect={jest.fn()}
      onPress={jest.fn()}
      isSmsWorkspace={isSmsWorkspace}
    />
  );
}

describe("TransactionItem", () => {
  it("shows the parsed counterparty in an SMS review row", () => {
    renderItem();

    expect(screen.getByText("Fixture Shop")).toBeTruthy();
  });

  it("uses the debit color for an expense amount", () => {
    renderItem();

    expect(screen.getByTestId("transaction-review-amount")).toHaveProp(
      "className",
      expect.stringContaining("text-red-400")
    );
  });

  it("formats review dates using the active app locale", () => {
    const dateSpy = jest.spyOn(Date.prototype, "toLocaleDateString");
    const timeSpy = jest.spyOn(Date.prototype, "toLocaleTimeString");

    renderItem();

    expect(dateSpy).toHaveBeenCalledWith(
      "ar-EG-u-nu-latn",
      expect.objectContaining({ month: "short", day: "numeric" })
    );
    expect(timeSpy).toHaveBeenCalledWith(
      "ar-EG-u-nu-latn",
      expect.objectContaining({ hour: "2-digit", minute: "2-digit" })
    );

    dateSpy.mockRestore();
    timeSpy.mockRestore();
  });

  it("keeps the shared row theme-aware outside the SMS workspace", () => {
    renderItem();

    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("bg-white")
    );
    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-950")
    );
  });

  it("keeps the SMS row surface compatible with light and dark themes", () => {
    renderItem(true);

    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("bg-white")
    );
    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-950")
    );
  });
});
