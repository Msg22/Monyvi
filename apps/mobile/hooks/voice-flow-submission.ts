import { randomUUID } from "expo-crypto";
import {
  accountReviewSessionSchema,
  voiceRequestKeySchema,
} from "@monyvi/logic";
import type {
  AiVoiceParserOptions,
  AiVoiceParserSuccess,
} from "@/services/ai-voice-parser-service";
import { getAiProcessingConsentStatus } from "@/services/profile-service";
import { logger } from "@/utils/logger";
import type {
  AccountReviewAccountSnapshots,
  FlowConfig,
  ParserContextSnapshot,
  RetainedSubmission,
  VoiceStartResult,
} from "./voice-transaction-flow-types";

export function createRequestKey(): string {
  return voiceRequestKeySchema.parse(randomUUID());
}

export function shouldRetainParserError(kind: string): boolean {
  return kind === "network" || kind === "timeout" || kind === "config";
}

export function isConfigParserError(kind: string): boolean {
  return kind === "config";
}

export function resolveRetriedSubmission(
  retained: RetainedSubmission,
  freshContext: ParserContextSnapshot
): RetainedSubmission {
  if (retained.isConfigRetry === true) {
    return {
      ...retained,
      categories: freshContext.categories,
      categoryRecords: [...freshContext.categoryRecords],
    };
  }
  return retained;
}

export function isActorChanged(
  prevUserId: string | null,
  prevResolving: boolean,
  currUserId: string | null,
  currResolving: boolean
): boolean {
  return prevUserId !== currUserId || prevResolving !== currResolving;
}

export function isModeSwitchActive(
  isStartPending: boolean,
  flowStatus: string
): boolean {
  return (
    isStartPending ||
    ["recording", "paused", "completed", "analyzing"].includes(flowStatus)
  );
}

export function resolveStaleStartResult(
  currentUserId: string | null,
  operationUserId: string,
  isResolvingUser: boolean
): VoiceStartResult {
  return currentUserId !== operationUserId || isResolvingUser
    ? { kind: "not-started", reason: "actor-changed" }
    : { kind: "not-started", reason: "cancelled" };
}

export async function checkAiConsentStatus(
  hasFreshConsent?: () => boolean | Promise<boolean>
): Promise<boolean> {
  if (hasFreshConsent) {
    return hasFreshConsent();
  }
  try {
    const status = await getAiProcessingConsentStatus();
    return status.isConsented;
  } catch (error: unknown) {
    logger.error("voice.aiConsentStatus.failed", error);
    return false;
  }
}

export function buildConfigContext(config: FlowConfig): ParserContextSnapshot {
  return {
    preferredCurrency: config.preferredCurrency,
    categories: config.categories,
    accounts: config.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    })),
    categoryRecords: [...config.categoryRecords],
  };
}

export function buildSubmission(
  userId: string,
  audioUri: string,
  requestKey: string,
  callerTimeZone: string,
  context: ParserContextSnapshot
): RetainedSubmission {
  return {
    ownerUserId: userId,
    audioUri,
    requestKey,
    callerTimeZone,
    preferredCurrency: context.preferredCurrency,
    categories: context.categories,
    accounts: [...context.accounts],
    categoryRecords: [...context.categoryRecords],
    ...(context.reviewAccountSnapshots
      ? { reviewAccountSnapshots: context.reviewAccountSnapshots }
      : {}),
  };
}

export function buildSubmissionWithAccountSnapshots(
  userId: string,
  audioUri: string,
  requestKey: string,
  callerTimeZone: string,
  config: FlowConfig,
  reviewAccountSnapshots: AccountReviewAccountSnapshots
): RetainedSubmission {
  return buildSubmission(userId, audioUri, requestKey, callerTimeZone, {
    ...buildConfigContext(config),
    reviewAccountSnapshots,
  });
}

export function serializeAiReviewParams(
  aiResult: AiVoiceParserSuccess,
  originTabIndex: number
): Record<string, string> {
  // Preserve original Voice data and route navigation. Only the validated
  // optional T054 canonical session adds a V2 transport parameter.
  const base = {
    transactions: JSON.stringify(aiResult.transactions),
    transcript: aiResult.transcript,
    originalTranscript: aiResult.originalTranscript,
    detectedLanguage: aiResult.detectedLanguage,
    originTabIndex: String(originTabIndex),
  };
  if (aiResult.reviewSession === undefined) return base;

  const session = accountReviewSessionSchema.parse(aiResult.reviewSession);
  if (
    session.source !== "VOICE" ||
    session.rows.some((row) => row.source !== "VOICE") ||
    session.rows.length !== aiResult.transactions.length
  ) {
    throw new Error("account_review_voice_route_session_invalid");
  }
  return { ...base, reviewSession: JSON.stringify(session) };
}

export function validateAndSerializeVoiceReviewRoute(
  aiResult: AiVoiceParserSuccess,
  expectedOwnerId: string,
  originTabIndex: number
): Record<string, string> | null {
  if (
    aiResult.reviewSession === undefined ||
    aiResult.transactions.length === 0 ||
    aiResult.reviewSession.ownerId !== expectedOwnerId ||
    aiResult.reviewSession.source !== "VOICE"
  ) {
    return null;
  }
  try {
    const routeParams = serializeAiReviewParams(aiResult, originTabIndex);
    return routeParams.reviewSession ? routeParams : null;
  } catch {
    return null;
  }
}

export function buildParserPayload(
  submission: RetainedSubmission,
  signal: AbortSignal
): AiVoiceParserOptions {
  return {
    audioUri: submission.audioUri,
    requestKey: submission.requestKey,
    callerTimeZone: submission.callerTimeZone,
    preferredCurrency: submission.preferredCurrency,
    categories: submission.categories,
    accounts: submission.accounts,
    categoryRecords: submission.categoryRecords,
    signal,
    ...(submission.reviewAccountSnapshots
      ? { reviewAccountSnapshots: submission.reviewAccountSnapshots }
      : {}),
  };
}
