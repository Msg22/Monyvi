import { SAFEGUARD_QA_SCENARIOS } from "../../../packages/logic/src/sms-safeguards/safeguard-qa-scenarios";
import {
  getSmsSafeguardQaConfig,
  type SmsSafeguardQaEnvironment,
} from "@/config/sms-safeguard-qa-config";
import type {
  SmsParserDiagnostics,
  SmsScanSafeguardSummary,
} from "./sms-parser-orchestrator";

export interface SmsSafeguardQaDiagnosticsViewModel {
  readonly profileId: string;
  readonly profileVersion: number;
  readonly purpose: string;
  readonly expectedBoundary: string;
  readonly expected: {
    readonly guidance: string;
    readonly mustNotHappen: string;
    readonly firstScan?: {
      readonly localResultCount: number;
      readonly aiResultCount: number;
      readonly deferredAiCount: number;
      readonly oversizedCount: number;
    };
  };
  readonly observedBoundary?: string | null;
  readonly availability?: string | null;
  readonly limits: {
    readonly maxCandidatesPerRequest: number;
    readonly maxCandidatesPerScan: number;
    readonly maxCandidatesPerRollingWindow: number;
    readonly maxPayloadBytes: number;
    readonly maxEstimatedInputTokens: number;
  };
  readonly currentScan: {
    readonly localResultCount: number;
    readonly aiResultCount: number;
    readonly deferredAiCount: number;
    readonly oversizedCount: number;
    readonly unresolvedCount: number;
  };
}

interface CreateSmsSafeguardQaDiagnosticsInput {
  readonly parserDiagnostics: SmsParserDiagnostics | null;
  readonly safeguardSummary: SmsScanSafeguardSummary | null;
}

function resolveObservedBoundary(
  parserDiagnostics: SmsParserDiagnostics,
  safeguardSummary: SmsScanSafeguardSummary
): string | null {
  if (safeguardSummary.oversizedCount > 0) return "candidate_too_large";
  if (safeguardSummary.availability !== undefined) {
    return safeguardSummary.availability.reason;
  }
  return (
    Object.entries(parserDiagnostics.reasonCounts ?? {}).find(
      ([, count]) => count > 0
    )?.[0] ?? null
  );
}

export function createSmsSafeguardQaDiagnostics(
  input: CreateSmsSafeguardQaDiagnosticsInput,
  environment: SmsSafeguardQaEnvironment = process.env
): SmsSafeguardQaDiagnosticsViewModel | null {
  let config: ReturnType<typeof getSmsSafeguardQaConfig>;
  try {
    config = getSmsSafeguardQaConfig(environment);
  } catch {
    return null;
  }
  if (
    !config.enabled ||
    config.profileId === null ||
    input.parserDiagnostics === null ||
    input.safeguardSummary === null
  ) {
    return null;
  }

  const scenario = SAFEGUARD_QA_SCENARIOS[config.profileId];
  const { fullParser } = scenario.policyOverrides;
  return {
    profileId: scenario.id,
    profileVersion: scenario.version,
    purpose: scenario.diagnostic.purpose,
    expectedBoundary: scenario.diagnostic.expectedBoundary,
    expected: {
      guidance: scenario.diagnostic.expectedGuidance,
      mustNotHappen: scenario.diagnostic.mustNotHappen,
      firstScan: scenario.diagnostic.expectedFirstScan,
    },
    observedBoundary: resolveObservedBoundary(
      input.parserDiagnostics,
      input.safeguardSummary
    ),
    availability: input.safeguardSummary.availability?.availableAt ?? null,
    limits: {
      maxCandidatesPerRequest: fullParser.maxUnitsPerRequest,
      maxCandidatesPerScan: fullParser.maxUnitsPerScan,
      maxCandidatesPerRollingWindow: fullParser.maxUnitsPerRollingWindow,
      maxPayloadBytes: fullParser.maxPayloadBytes,
      maxEstimatedInputTokens: fullParser.maxEstimatedInputTokens,
    },
    currentScan: {
      localResultCount: input.parserDiagnostics.localMatchedCount ?? 0,
      aiResultCount: input.parserDiagnostics.aiMatchedCount ?? 0,
      deferredAiCount: input.safeguardSummary.deferredAiCount,
      oversizedCount: input.safeguardSummary.oversizedCount,
      unresolvedCount: input.safeguardSummary.unresolvedCount,
    },
  };
}
