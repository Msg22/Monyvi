import type { SmsParserDiagnostics } from "@/services/sms-parser-result-contract";
import {
  createSmsSafeguardQaDiagnostics,
  type SmsSafeguardQaDiagnosticsViewModel,
} from "@/services/sms-safeguard-qa-diagnostics-service";

const qaEnvironment = {
  NODE_ENV: "development",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA: "true",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROVIDER: "simulated",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_INBOX: "fixture",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE: "oversized-candidate-v1",
  EXPO_PUBLIC_SMS_SAFEGUARD_QA_RUN_ID: "qa-diagnostics-test",
} as const;

const parserDiagnostics: SmsParserDiagnostics = {
  mode: "hybrid",
  attemptedAi: true,
  attemptedLocal: true,
  candidateCount: 4,
  resultCount: 1,
  matchedPatternIds: ["trusted-template-id"],
  runtimeScopeCounts: { trusted_production: 1 },
  localMatchedCount: 1,
  aiMatchedCount: 0,
  aiDeferredCount: 3,
  reasonCounts: { candidate_too_large: 3 },
};

describe("createSmsSafeguardQaDiagnostics", () => {
  it("projects an explicit QA run into aggregate-only presentation data", () => {
    const diagnostics = createSmsSafeguardQaDiagnostics(
      {
        parserDiagnostics,
        safeguardSummary: {
          admittedAiCount: 0,
          deferredAiCount: 0,
          oversizedCount: 3,
          unresolvedCount: 2,
          completionStatus: "partial",
        },
      },
      qaEnvironment
    );

    expect(diagnostics).toMatchObject<SmsSafeguardQaDiagnosticsViewModel>({
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
      currentScan: {
        localResultCount: 1,
        aiResultCount: 0,
        deferredAiCount: 0,
        oversizedCount: 3,
        unresolvedCount: 2,
      },
      limits: {
        maxCandidatesPerRequest: 2,
        maxCandidatesPerScan: 4,
        maxCandidatesPerRollingWindow: 4,
        maxPayloadBytes: 8192,
        maxEstimatedInputTokens: 4096,
      },
    });

    expect(JSON.stringify(diagnostics)).not.toContain("trusted-template-id");
  });

  it("returns no presentation data outside an explicit non-release QA run", () => {
    expect(
      createSmsSafeguardQaDiagnostics(
        {
          parserDiagnostics,
          safeguardSummary: {
            admittedAiCount: 0,
            deferredAiCount: 0,
            oversizedCount: 0,
            unresolvedCount: 0,
            completionStatus: "complete",
          },
        },
        { ...qaEnvironment, NODE_ENV: "production" }
      )
    ).toBeNull();

    expect(
      createSmsSafeguardQaDiagnostics(
        {
          parserDiagnostics,
          safeguardSummary: {
            admittedAiCount: 0,
            deferredAiCount: 0,
            oversizedCount: 0,
            unresolvedCount: 0,
            completionStatus: "complete",
          },
        },
        { NODE_ENV: "development" }
      )
    ).toBeNull();
  });
});
