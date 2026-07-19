import { act, renderHook } from "@testing-library/react-native";
import React from "react";
import { SmsScanProvider, useSmsScanContext } from "@/context/SmsScanContext";
import type { SmsScanResult } from "@/services/sms-sync-service";

function wrapper({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return <SmsScanProvider>{children}</SmsScanProvider>;
}

function scanResult(): SmsScanResult {
  return {
    transactions: [],
    unresolvedCandidates: [
      {
        candidate: {
          message: {
            id: "1",
            address: "NBE",
            body: "raw",
            date: 1,
            read: false,
          },
          smsFingerprint: "fp-1",
        },
        reason: "ai_failed",
        isRetryable: true,
      },
    ],
    parseContext: { categories: [], supportedCurrencies: ["EGP"] },
    parserDiagnostics: {
      mode: "hybrid",
      attemptedAi: true,
      attemptedLocal: true,
      candidateCount: 1,
      resultCount: 0,
      matchedPatternIds: [],
      runtimeScopeCounts: {},
    },
    totalScanned: 1,
    totalFound: 0,
    totalFilteredCandidates: 1,
    durationMs: 1,
  };
}

describe("SmsScanContext review session", () => {
  it("sets, updates, and clears transient retry state atomically", () => {
    const { result } = renderHook(() => useSmsScanContext(), { wrapper });

    act(() => result.current.setReviewSession(scanResult()));
    expect(result.current.unresolvedCandidates).toHaveLength(1);
    expect(result.current.parseContext?.supportedCurrencies).toEqual(["EGP"]);

    act(() =>
      result.current.updateReviewSession(
        {
          transactions: [],
          unresolvedCandidates: [],
        },
        result.current.reviewSessionId
      )
    );
    expect(result.current.unresolvedCandidates).toEqual([]);
    expect(result.current.parseContext).not.toBeNull();

    act(() => result.current.clearTransactions());
    expect(result.current.transactions).toEqual([]);
    expect(result.current.unresolvedCandidates).toEqual([]);
    expect(result.current.parseContext).toBeNull();
  });

  it("does not retain raw retry state after the private provider unmounts", () => {
    const first = renderHook(() => useSmsScanContext(), { wrapper });
    act(() => first.result.current.setReviewSession(scanResult()));
    expect(first.result.current.unresolvedCandidates).toHaveLength(1);
    first.unmount();

    const second = renderHook(() => useSmsScanContext(), { wrapper });
    expect(second.result.current.transactions).toEqual([]);
    expect(second.result.current.unresolvedCandidates).toEqual([]);
    expect(second.result.current.parseContext).toBeNull();
  });

  it("rejects a stale retry result after the review session is cleared", () => {
    const { result } = renderHook(() => useSmsScanContext(), { wrapper });
    act(() => result.current.setReviewSession(scanResult()));
    const sessionId = result.current.reviewSessionId;

    act(() => result.current.clearTransactions());
    act(() =>
      result.current.updateReviewSession(
        {
          transactions: [],
          unresolvedCandidates: scanResult().unresolvedCandidates,
        },
        sessionId
      )
    );

    expect(result.current.unresolvedCandidates).toEqual([]);
    expect(result.current.parseContext).toBeNull();
  });
});
