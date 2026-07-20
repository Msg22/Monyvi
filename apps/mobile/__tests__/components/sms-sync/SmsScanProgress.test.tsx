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

const completeSummary = {
  admittedAiCount: 0,
  deferredAiCount: 0,
  oversizedCount: 0,
  unresolvedCount: 0,
  completionStatus: "complete" as const,
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
