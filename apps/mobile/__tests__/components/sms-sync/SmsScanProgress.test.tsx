import { render } from "@testing-library/react-native";
import React from "react";

jest.mock("@/hooks/useCategories", () => ({
  useCategories: (): never => {
    throw new Error("SmsScanProgress must not read category hooks directly");
  },
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    t: (key: string, opts?: Record<string, unknown>) => string;
  } => ({
    t: (key: string, opts?: Record<string, unknown>): string => {
      const count =
        typeof opts?.count === "number" || typeof opts?.count === "string"
          ? opts.count
          : "";
      if (key === "review_transactions") return `Review ${count}`;
      if (key === "scanned_count") return `Scanned ${count}`;
      if (key === "duration_seconds") return `${count}s`;
      return key;
    },
  }),
}));

import { SmsScanProgress } from "@/components/sms-sync/SmsScanProgress";
import type { SmsSafeguardQaDiagnosticsViewModel } from "@/services/sms-safeguard-qa-diagnostics-service";

const completeSummary = {
  admittedAiCount: 0,
  deferredAiCount: 0,
  oversizedCount: 0,
  unresolvedCount: 0,
  completionStatus: "complete" as const,
};

const qaDiagnostics: SmsSafeguardQaDiagnosticsViewModel = {
  profileId: "history-cooldown-v1",
  profileVersion: 1,
  purpose: "history_cooldown",
  expectedBoundary: "history_cooldown",
  expected: {
    guidance: "history_cooldown",
    mustNotHappen: "history_cooldown",
  },
  observedBoundary: null,
  availability: null,
  limits: {
    maxCandidatesPerRequest: 2,
    maxCandidatesPerScan: 8,
    maxCandidatesPerRollingWindow: 24,
    maxPayloadBytes: 4_096,
    maxEstimatedInputTokens: 1_024,
  },
  currentScan: {
    localResultCount: 1,
    aiResultCount: 4,
    deferredAiCount: 0,
    oversizedCount: 0,
    unresolvedCount: 0,
  },
};

describe("SmsScanProgress", () => {
  it("renders scanning progress state from props", () => {
    const { getByText } = render(
      <SmsScanProgress
        status="scanning"
        progress={{
          totalMessages: 10,
          messagesScanned: 4,
          transactionsFound: 2,
          candidatesFound: 5,
          currentPhase: "ai-parsing",
          currentSender: "BANK",
          aiChunksCompleted: 1,
          aiChunksTotal: 3,
          scanStartedAt: Date.now() - 2_000,
          estimatedRemainingMs: 5_000,
        }}
        transactionsFound={0}
        totalScanned={0}
        durationMs={0}
        topCategories={[]}
        categoryNameMap={new Map<string, string>()}
        safeguardSummary={completeSummary}
        error={null}
        onReviewPress={jest.fn()}
        onBackPress={jest.fn()}
        onRetryPress={jest.fn()}
      />
    );

    expect(getByText("scanning_analyzing")).toBeTruthy();
    expect(getByText("sms_scan_scope_last_30_days")).toBeTruthy();
    expect(getByText("cancel_scan")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
  });

  it("renders category display labels from props without category hooks", () => {
    const categoryNameMap = new Map<string, string>([
      ["food_drinks", "Food & Drinks"],
    ]);

    const { getByText } = render(
      <SmsScanProgress
        status="complete"
        progress={null}
        transactionsFound={3}
        totalScanned={20}
        durationMs={3000}
        topCategories={["food_drinks"]}
        categoryNameMap={categoryNameMap}
        safeguardSummary={completeSummary}
        error={null}
        onReviewPress={jest.fn()}
        onBackPress={jest.fn()}
        onRetryPress={jest.fn()}
      />
    );

    expect(getByText("Food & Drinks")).toBeTruthy();
  });

  it("renders QA diagnostics below completed results in independent scroll flow", () => {
    const { getByTestId, getByText } = render(
      <SmsScanProgress
        status="complete"
        progress={null}
        transactionsFound={3}
        totalScanned={20}
        durationMs={3000}
        topCategories={[]}
        categoryNameMap={new Map<string, string>()}
        safeguardSummary={completeSummary}
        qaDiagnostics={qaDiagnostics}
        error={null}
        onReviewPress={jest.fn()}
        onBackPress={jest.fn()}
        onRetryPress={jest.fn()}
      />
    );

    expect(getByTestId("sms-scan-complete-scroll")).toBeTruthy();
    expect(getByText("qa_safeguard_panel_title")).toBeTruthy();
  });

  it("keeps the partial-results notice visible when suggestions are ready", () => {
    const { getByText, queryByTestId, toJSON } = render(
      <SmsScanProgress
        status="complete"
        progress={null}
        transactionsFound={2}
        totalScanned={4}
        durationMs={1000}
        topCategories={[]}
        categoryNameMap={new Map<string, string>()}
        safeguardSummary={{
          ...completeSummary,
          deferredAiCount: 2,
          unresolvedCount: 2,
          completionStatus: "partial",
          availability: { reason: "rolling_limit", availableAt: null },
        }}
        retryableCount={2}
        error={null}
        onReviewPress={jest.fn()}
        onBackPress={jest.fn()}
        onRetryPress={jest.fn()}
      />
    );

    expect(getByText("partial_sms_title")).toBeTruthy();
    expect(getByText("Review 2")).toBeTruthy();
    expect(queryByTestId("partial-sms-retry")).toBeNull();
    const renderedTree = JSON.stringify(toJSON());
    expect(renderedTree.indexOf("partial-sms-results-notice")).toBeLessThan(
      renderedTree.indexOf("Review 2")
    );
  });

  it("does not offer a fake retry action for a zero-suggestion partial scan", () => {
    const onReviewPress = jest.fn();
    const { getByText, queryByTestId } = render(
      <SmsScanProgress
        status="complete"
        progress={null}
        transactionsFound={0}
        totalScanned={4}
        durationMs={1000}
        topCategories={[]}
        categoryNameMap={new Map<string, string>()}
        safeguardSummary={{
          ...completeSummary,
          unresolvedCount: 1,
          completionStatus: "partial",
        }}
        retryableCount={1}
        error={null}
        onReviewPress={onReviewPress}
        onBackPress={jest.fn()}
        onRetryPress={jest.fn()}
      />
    );

    expect(getByText("partial_sms_title")).toBeTruthy();
    expect(getByText("back_to_dashboard")).toBeTruthy();
    expect(queryByTestId("partial-sms-retry")).toBeNull();
    expect(onReviewPress).not.toHaveBeenCalled();
  });

  it("renders empty and error states from props", () => {
    const { getByText, queryByText, rerender } = render(
      <SmsScanProgress
        status="complete"
        progress={null}
        transactionsFound={0}
        totalScanned={8}
        durationMs={0}
        topCategories={[]}
        categoryNameMap={new Map<string, string>()}
        safeguardSummary={{
          ...completeSummary,
          deferredAiCount: 2,
          completionStatus: "partial",
          availability: { reason: "rolling_limit", availableAt: null },
        }}
        error={null}
        onReviewPress={jest.fn()}
        onBackPress={jest.fn()}
        onRetryPress={jest.fn()}
      />
    );

    expect(getByText("partial_sms_title")).toBeTruthy();
    expect(getByText("partial_sms_try_later")).toBeTruthy();
    expect(queryByText("no_transactions_found")).toBeNull();
    expect(getByText("back_to_dashboard")).toBeTruthy();

    rerender(
      <SmsScanProgress
        status="error"
        progress={null}
        transactionsFound={0}
        totalScanned={0}
        durationMs={0}
        topCategories={[]}
        categoryNameMap={new Map<string, string>()}
        safeguardSummary={completeSummary}
        error="Could not read messages"
        onReviewPress={jest.fn()}
        onBackPress={jest.fn()}
        onRetryPress={jest.fn()}
      />
    );

    expect(getByText("scan_failed")).toBeTruthy();
    expect(getByText("Could not read messages")).toBeTruthy();
    expect(getByText("try_again")).toBeTruthy();
  });
});
