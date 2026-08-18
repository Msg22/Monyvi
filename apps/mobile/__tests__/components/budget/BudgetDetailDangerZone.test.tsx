import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { BudgetDetailDangerZone } from "@/components/budget/BudgetDetailDangerZone";

describe("BudgetDetailDangerZone", () => {
  it("isolates destructive copy and exposes a full-width outlined action", () => {
    const onDelete = jest.fn();
    render(<BudgetDetailDangerZone onDelete={onDelete} />);

    expect(screen.getByText("Danger zone")).toBeOnTheScreen();
    expect(
      screen.getByText(/keeps your transactions.*removes this budget/i)
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Delete budget")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    fireEvent.press(screen.getByLabelText("Delete budget"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("exposes the pending disabled state", () => {
    render(<BudgetDetailDangerZone onDelete={jest.fn()} isDisabled />);
    expect(screen.getByLabelText("Delete budget")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
  });
});
