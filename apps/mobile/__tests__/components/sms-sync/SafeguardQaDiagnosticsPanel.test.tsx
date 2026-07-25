import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { SafeguardQaDiagnosticsPanel } from "@/components/sms-sync/SafeguardQaDiagnosticsPanel";
import type { SmsSafeguardQaDiagnosticsViewModel } from "@/services/sms-safeguard-qa-diagnostics-service";

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    t: (key: string, options?: Record<string, unknown>) => string;
  } => ({
    t: (key: string, options?: Record<string, unknown>): string =>
      typeof options?.count === "number" ? `${key}:${options.count}` : key,
  }),
}));

const diagnostics: SmsSafeguardQaDiagnosticsViewModel = {
  profileId: "oversized-candidate-v1",
  profileVersion: 1,
  purpose: "oversized_candidate",
  expectedBoundary: "candidate_too_large",
  expected: {
    guidance: "oversized_candidate",
    mustNotHappen: "oversized_candidate",
    firstScan: {
      localResultCount: 1,
      aiResultCount: 2,
      deferredAiCount: 0,
      oversizedCount: 1,
    },
  },
  limits: {
    maxCandidatesPerRequest: 2,
    maxCandidatesPerScan: 4,
    maxCandidatesPerRollingWindow: 4,
    maxPayloadBytes: 8192,
    maxEstimatedInputTokens: 4096,
  },
  currentScan: {
    localResultCount: 1,
    aiResultCount: 0,
    deferredAiCount: 0,
    oversizedCount: 3,
  },
  availability: null,
};

describe("SafeguardQaDiagnosticsPanel", () => {
  it("is collapsed by default and reveals only aggregate profile diagnostics", () => {
    const { getAllByText, getByLabelText, getByText, queryByText } = render(
      <SafeguardQaDiagnosticsPanel diagnostics={diagnostics} />
    );

    expect(getByText("qa_safeguard_panel_title")).toBeTruthy();
    expect(getByText("oversized-candidate-v1 v1")).toBeTruthy();
    expect(queryByText("qa_safeguard_limits_title")).toBeNull();

    fireEvent.press(getByLabelText("qa_safeguard_expand"));

    expect(getByText("qa_safeguard_purpose_oversized_candidate")).toBeTruthy();
    expect(getByText("qa_safeguard_expected_title")).toBeTruthy();
    expect(getByText("qa_safeguard_expected_oversized_candidate")).toBeTruthy();
    expect(getByText("qa_safeguard_must_not_title")).toBeTruthy();
    expect(getByText("qa_safeguard_must_not_oversized_candidate")).toBeTruthy();
    expect(getByText("qa_safeguard_privacy_guardrail")).toBeTruthy();
    expect(getByText("qa_safeguard_observed_title")).toBeTruthy();
    expect(getByText("qa_safeguard_limits_title")).toBeTruthy();
    expect(getByText("qa_safeguard_ai_results:2")).toBeTruthy();
    expect(getAllByText("qa_safeguard_local_results:1")).toHaveLength(2);
    expect(getByText("qa_safeguard_oversized_results:3")).toBeTruthy();
  });

  it("does not render when no explicit QA diagnostic model exists", () => {
    const { toJSON } = render(
      <SafeguardQaDiagnosticsPanel diagnostics={null} />
    );

    expect(toJSON()).toBeNull();
  });
});
