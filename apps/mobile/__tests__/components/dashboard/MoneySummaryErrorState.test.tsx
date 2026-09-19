import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { MoneySummaryErrorState } from "@/components/dashboard/MoneySummaryErrorState";

describe("MoneySummaryErrorState", () => {
  it("presents the plain-language message with an accessible retry action", () => {
    const onRetry = jest.fn<void, []>();
    render(
      <MoneySummaryErrorState
        message="We couldn’t load your money summary. Try again."
        onRetry={onRetry}
        retryLabel="Retry"
        testID="home-money-summary-error"
      />
    );

    expect(
      screen.getByText("We couldn’t load your money summary. Try again.")
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
