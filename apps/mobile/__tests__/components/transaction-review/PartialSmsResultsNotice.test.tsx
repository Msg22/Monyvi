import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { PartialSmsResultsNotice } from "@/components/transaction-review/PartialSmsResultsNotice";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { readonly count?: number }): string =>
      `${key}:${values?.count ?? ""}`,
  }),
}));

describe("PartialSmsResultsNotice", () => {
  it("matches the approved compact light/dark token structure and retries", () => {
    const onRetry = jest.fn();
    render(
      <PartialSmsResultsNotice
        unresolvedCount={3}
        isRetrying={false}
        onRetry={onRetry}
      />
    );

    expect(screen.getByTestId("partial-sms-results-notice")).toHaveProp(
      "className",
      expect.stringContaining("border-gold-500")
    );
    expect(screen.getByTestId("partial-sms-results-notice")).toHaveProp(
      "className",
      expect.stringContaining("dark:")
    );
    expect(screen.getByText("partial_sms_title:3")).toBeTruthy();
    fireEvent.press(screen.getByTestId("partial-sms-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables repeated retry while busy and disappears at zero", () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <PartialSmsResultsNotice
        unresolvedCount={2}
        isRetrying
        onRetry={onRetry}
      />
    );

    fireEvent.press(screen.getByTestId("partial-sms-retry"));
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByTestId("partial-sms-retry")).toHaveProp(
      "accessibilityState",
      {
        disabled: true,
        busy: true,
      }
    );

    rerender(
      <PartialSmsResultsNotice
        unresolvedCount={0}
        isRetrying={false}
        onRetry={onRetry}
      />
    );
    expect(screen.queryByTestId("partial-sms-results-notice")).toBeNull();
  });
});
