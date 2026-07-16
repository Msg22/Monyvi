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
        canRetry
        isRetrying={false}
        hasRetryError={false}
        onRetry={onRetry}
      />
    );

    expect(screen.getByTestId("partial-sms-results-notice")).toHaveProp(
      "className",
      expect.stringContaining("border-gold-600/50")
    );
    expect(screen.getByTestId("partial-sms-results-notice")).toHaveProp(
      "className",
      expect.stringContaining("dark:")
    );
    expect(screen.getByText("partial_sms_title:3")).toBeTruthy();
    fireEvent.press(screen.getByTestId("partial-sms-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows actionable feedback when retry fails", () => {
    const RetryAwareNotice = PartialSmsResultsNotice as React.ComponentType<
      React.ComponentProps<typeof PartialSmsResultsNotice> & {
        readonly hasRetryError: boolean;
      }
    >;

    render(
      <RetryAwareNotice
        unresolvedCount={2}
        canRetry
        isRetrying={false}
        hasRetryError
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("partial_sms_retry_error:")).toBeTruthy();
  });

  it("disables repeated retry while busy and disappears at zero", () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <PartialSmsResultsNotice
        unresolvedCount={2}
        canRetry
        isRetrying
        hasRetryError={false}
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
        canRetry={false}
        isRetrying={false}
        hasRetryError={false}
        onRetry={onRetry}
      />
    );
    expect(screen.queryByTestId("partial-sms-results-notice")).toBeNull();
  });

  it("keeps successful results actionable when remaining messages must wait for a later sync", () => {
    render(
      <PartialSmsResultsNotice
        unresolvedCount={1}
        canRetry={false}
        isRetrying={false}
        hasRetryError={false}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("partial_sms_try_later:")).toBeTruthy();
    expect(screen.queryByTestId("partial-sms-retry")).toBeNull();
  });
});
