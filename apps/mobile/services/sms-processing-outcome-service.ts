import { database, type SmsAiNegativeOutcome } from "@monyvi/db";
import { DEFAULT_SMS_SCAN_POLICY } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";

import { syncDatabase } from "./sync";
import { getCurrentUserDataScope } from "./user-data-access";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";

export interface SmsProcessingOutcome {
  readonly smsFingerprint: string;
  readonly originalReceivedAt: string;
  readonly strikeCount: number;
  readonly isTerminal: boolean;
  readonly terminalAt: string | null;
  readonly lastClassifiedAt: string;
}

function toProcessingOutcome(
  model: SmsAiNegativeOutcome
): SmsProcessingOutcome {
  return {
    smsFingerprint: model.smsFingerprint,
    originalReceivedAt: model.originalReceivedAt,
    strikeCount: model.strikeCount,
    isTerminal: model.isTerminal,
    terminalAt: model.terminalAt ?? null,
    lastClassifiedAt: model.lastClassifiedAt,
  };
}

function normalizeFingerprints(
  fingerprints: readonly string[]
): readonly string[] {
  return [
    ...new Set(
      fingerprints.map((fingerprint) => fingerprint.trim()).filter(Boolean)
    ),
  ];
}

function isActiveProcessingOutcome(
  outcome: SmsAiNegativeOutcome,
  nowMs: number
): boolean {
  if (outcome.deleted) return false;
  if (outcome.isTerminal) return true;
  const receivedAtMs = Date.parse(outcome.originalReceivedAt);
  const cutoffMs =
    nowMs - DEFAULT_SMS_SCAN_POLICY.lookbackDays * 24 * 60 * 60 * 1000;
  return Number.isFinite(receivedAtMs) && receivedAtMs >= cutoffMs;
}

export async function getSmsProcessingOutcomes(
  fingerprints: readonly string[],
  expectedUserId?: string
): Promise<readonly SmsProcessingOutcome[]> {
  const normalizedFingerprints = normalizeFingerprints(fingerprints);
  if (normalizedFingerprints.length === 0) return [];

  const scope = await getCurrentUserDataScope();
  if (expectedUserId !== undefined && scope.userId !== expectedUserId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  const outcomes = await scope
    .queryOwned(
      database.get<SmsAiNegativeOutcome>("sms_ai_negative_outcomes"),
      Q.where("sms_fingerprint", Q.oneOf([...normalizedFingerprints])),
      Q.where("deleted", Q.notEq(true))
    )
    .fetch();

  return outcomes
    .filter((outcome) => isActiveProcessingOutcome(outcome, Date.now()))
    .map(toProcessingOutcome);
}

export async function getTerminalSmsFingerprints(
  fingerprints: readonly string[],
  expectedUserId?: string
): Promise<ReadonlySet<string>> {
  const outcomes = await getSmsProcessingOutcomes(fingerprints, expectedUserId);
  return new Set(
    outcomes
      .filter((outcome) => outcome.isTerminal)
      .map((outcome) => outcome.smsFingerprint)
  );
}

export async function refreshSmsProcessingOutcomes(
  fingerprints: readonly string[],
  expectedUserId?: string
): Promise<readonly SmsProcessingOutcome[]> {
  await syncDatabase(database);
  return getSmsProcessingOutcomes(fingerprints, expectedUserId);
}
