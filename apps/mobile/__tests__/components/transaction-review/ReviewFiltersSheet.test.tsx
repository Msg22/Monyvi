import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { ReviewFiltersSheet } from "@/components/transaction-review/ReviewFiltersSheet";

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 24,
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

describe("ReviewFiltersSheet", () => {
  it("keeps filter edits as drafts until the user applies them", () => {
    const onApply = jest.fn();
    const onClose = jest.fn();

    render(
      <ReviewFiltersSheet
        visible
        period="all_time"
        selectedTypes={["All"]}
        searchQuery=""
        onApply={onApply}
        onClose={onClose}
        getResultCount={() => 7}
      />
    );

    fireEvent.press(screen.getByTestId("review-filter-period-today"));
    fireEvent.press(screen.getByTestId("review-filter-type-Expense"));
    fireEvent.changeText(screen.getByTestId("review-filter-search"), "qnb");

    expect(onApply).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("review-filter-apply"));

    expect(onApply).toHaveBeenCalledWith({
      period: "today",
      searchQuery: "qnb",
      selectedTypes: ["Income", "Transfer"],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets only the draft filters before apply", () => {
    const onApply = jest.fn();

    render(
      <ReviewFiltersSheet
        visible
        period="today"
        selectedTypes={["Expense"]}
        searchQuery="qnb"
        onApply={onApply}
        onClose={jest.fn()}
        getResultCount={() => 12}
      />
    );

    fireEvent.press(screen.getByTestId("review-filter-reset"));
    fireEvent.press(screen.getByTestId("review-filter-apply"));

    expect(onApply).toHaveBeenCalledWith({
      period: "all_time",
      searchQuery: "",
      selectedTypes: ["All"],
    });
  });
});
