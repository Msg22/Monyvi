import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { PartialSmsResultsNotice } from "@/components/transaction-review/PartialSmsResultsNotice";
import type { SmsScanSafeguardSummary } from "@/services/sms-parser-orchestrator";

const summary: SmsScanSafeguardSummary = {
  admittedAiCount: 2,
  deferredAiCount: 1,
  oversizedCount: 1,
  unresolvedCount: 1,
  availability: {
    reason: "scan_limit",
    availableAt: "2026-07-21T16:30:00.000Z",
  },
  completionStatus: "partial",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (
      key: string,
      values?: { readonly count?: number; readonly availability?: string }
    ): string => `${key}:${values?.count ?? ""}:${values?.availability ?? ""}`,
  }),
}));

describe("PartialSmsResultsNotice", () => {
  it("matches the approved compact light/dark token structure and retries", () => {
    const onRetry = jest.fn();
    render(
      <PartialSmsResultsNotice
        safeguardSummary={summary}
        retryableCount={1}
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
    expect(screen.getByText("partial_sms_title:3:")).toBeTruthy();
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
        safeguardSummary={{
          ...summary,
          deferredAiCount: 0,
          oversizedCount: 0,
          unresolvedCount: 2,
          availability: undefined,
        }}
        retryableCount={2}
        canRetry
        isRetrying={false}
        hasRetryError
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("partial_sms_retry_error::")).toBeTruthy();
  });

  it("disables repeated retry while busy and disappears at zero", () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <PartialSmsResultsNotice
        safeguardSummary={{
          ...summary,
          deferredAiCount: 0,
          oversizedCount: 0,
          unresolvedCount: 2,
        }}
        retryableCount={2}
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
        safeguardSummary={{
          ...summary,
          deferredAiCount: 0,
          oversizedCount: 0,
          unresolvedCount: 0,
          availability: undefined,
          completionStatus: "complete",
        }}
        retryableCount={0}
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
        safeguardSummary={{
          ...summary,
          deferredAiCount: 1,
          oversizedCount: 1,
          unresolvedCount: 0,
          availability: undefined,
        }}
        retryableCount={0}
        canRetry={false}
        isRetrying={false}
        hasRetryError={false}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("partial_sms_try_later::")).toBeTruthy();
    expect(screen.queryByTestId("partial-sms-retry")).toBeNull();
  });

  it("uses truthful copy when no suggestions are available after oversized messages are skipped", () => {
    render(
      <PartialSmsResultsNotice
        safeguardSummary={{
          ...summary,
          deferredAiCount: 0,
          oversizedCount: 4,
          unresolvedCount: 0,
          availability: undefined,
        }}
        retryableCount={0}
        canRetry={false}
        isRetrying={false}
        hasRetryError={false}
        hasReviewableSuggestions={false}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("partial_sms_oversized_empty::")).toBeTruthy();
    expect(screen.queryByText("partial_sms_oversized::")).toBeNull();
  });

  it("shows one localized absolute availability time without exposing raw message data", () => {
    render(
      <PartialSmsResultsNotice
        safeguardSummary={summary}
        retryableCount={0}
        canRetry={false}
        isRetrying={false}
        hasRetryError={false}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText(/partial_sms_try_later_at::.+/)).toBeTruthy();
    expect(screen.queryByText(/raw|sender|merchant/i)).toBeNull();
  });
});
