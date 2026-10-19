/**
 * #395 review transcript fixtures — launch service.
 *
 * Builds a canonical Voice review session from one fixed scenario and the
 * current owner's real account snapshot, using the SAME shipped source adapter
 * (`createVoiceAccountReviewSession`). No provider request, no fake Save, no
 * account creation, and no navigation (the route owns navigation).
 *
 * Gated by a real development, non-production runtime. A synchronous in-flight
 * guard prevents rapid duplicate launches, and a stale owner result is refused
 * before it can reach the route.
 *
 * @module review-transcript-fixtures-launcher-service
 */

import * as Crypto from "expo-crypto";
import type { AccountReviewSession } from "@monyvi/logic";

import { createVoiceAccountReviewSession } from "./account-review-source-adapter-service";
import { productionFinancialActionHashProvider } from "./account-balance-command-production";
import { getRequiredCurrentUserId } from "./user-data-access";
import type { ReviewTranscriptFixturesContext } from "./review-transcript-fixtures-context-service";
import { getReviewTranscriptFixtureScenario } from "@/dev/review-transcript-fixtures/catalog";
import {
  buildVoiceReviewNormalizationInput,
  ReviewTranscriptFixtureBuildError,
} from "@/dev/review-transcript-fixtures/voice-normalization";

export type ReviewTranscriptFixtureLaunchUnavailableReason =
  | "runtime_unavailable"
  | "already_launching"
  | "scenario_unknown"
  | "owner_changed"
  | "build_failed"
  | "session_failed";

export interface ReviewTranscriptFixtureLaunchResult {
  readonly status: "launched" | "unavailable";
  readonly reason: ReviewTranscriptFixtureLaunchUnavailableReason | null;
  readonly session: AccountReviewSession | null;
  readonly transcript: string;
  readonly detectedLanguage: string;
}

/** Real dev build plus non-production Node environment; nothing else. */
export function isReviewTranscriptFixturesRuntimeAvailable(): boolean {
  return __DEV__ === true && process.env.NODE_ENV !== "production";
}

/**
 * One actual launch at a time, regardless of scenario or owner. The hook
 * enforces the same global admission; this service guard is the backstop so a
 * second screen cannot start before the first completes.
 */
let isLaunching = false;

function unavailable(
  reason: ReviewTranscriptFixtureLaunchUnavailableReason,
  transcript = "",
  detectedLanguage = "en"
): ReviewTranscriptFixtureLaunchResult {
  return {
    status: "unavailable",
    reason,
    session: null,
    transcript,
    detectedLanguage,
  };
}

/**
 * Resolve one scenario into a fresh canonical session. The caller supplies the
 * already-loaded context so owner stability can be rechecked without a second
 * unscoped read.
 */
export async function buildReviewTranscriptFixtureLaunch(input: {
  readonly scenarioId: string;
  readonly context: ReviewTranscriptFixturesContext;
}): Promise<ReviewTranscriptFixtureLaunchResult> {
  const scenario = getReviewTranscriptFixtureScenario(input.scenarioId);
  if (scenario === null) return unavailable("scenario_unknown");

  if (!isReviewTranscriptFixturesRuntimeAvailable()) {
    return unavailable(
      "runtime_unavailable",
      scenario.transcript,
      scenario.detectedLanguage
    );
  }

  // Synchronous global admission: a second tap cannot start any parallel launch.
  if (isLaunching) {
    return unavailable(
      "already_launching",
      scenario.transcript,
      scenario.detectedLanguage
    );
  }
  isLaunching = true;

  try {
    const ownerId = input.context.ownerId;
    if ((await getRequiredCurrentUserId()) !== ownerId) {
      return unavailable(
        "owner_changed",
        scenario.transcript,
        scenario.detectedLanguage
      );
    }

    const sessionId = Crypto.randomUUID();
    // A fresh recording identity per intentional launch. It is retained inside
    // the returned session so Save retries reuse the same evidence reference.
    const requestKey = Crypto.randomUUID();
    const normalizationInput = buildVoiceReviewNormalizationInput({
      scenario,
      ownerId,
      sessionId,
      requestKey,
      reviewAccountSnapshots: {
        ownerId: input.context.ownerId,
        preferredCurrency: input.context.preferredCurrency,
        accounts: input.context.accounts,
        providerContext: input.context.providerContext,
      },
      categoryIdsBySystemName: input.context.categoryIdsBySystemName,
      fallbackCategorySystemNameByType:
        input.context.fallbackCategorySystemNameByType,
      hashProvider: productionFinancialActionHashProvider,
    });

    let session: AccountReviewSession;
    try {
      session = await createVoiceAccountReviewSession(normalizationInput);
    } catch {
      return unavailable(
        "session_failed",
        scenario.transcript,
        scenario.detectedLanguage
      );
    }

    // Revoke a stale owner completion before handing anything to the route.
    if (
      session.ownerId !== ownerId ||
      session.source !== "VOICE" ||
      session.rows.length === 0 ||
      (await getRequiredCurrentUserId()) !== ownerId
    ) {
      return unavailable(
        "owner_changed",
        scenario.transcript,
        scenario.detectedLanguage
      );
    }

    return {
      status: "launched",
      reason: null,
      session,
      transcript: scenario.transcript,
      detectedLanguage: scenario.detectedLanguage,
    };
  } catch (error: unknown) {
    const reason: ReviewTranscriptFixtureLaunchUnavailableReason =
      error instanceof ReviewTranscriptFixtureBuildError
        ? "build_failed"
        : "session_failed";
    return unavailable(reason, scenario.transcript, scenario.detectedLanguage);
  } finally {
    isLaunching = false;
  }
}
