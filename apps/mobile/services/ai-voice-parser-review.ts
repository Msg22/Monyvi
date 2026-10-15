/**
 * #395 T012 — canonical Voice financial/advisory classification and immutable
 * full-session attachment. No network, device DB, provider or source adapter.
 */
import { z } from "zod";
import {
  accountReviewVoiceFinancialRowSchema,
  accountReviewVoiceResponseV2Schema,
  type AccountReviewVoiceFinancialRow,
} from "../../../packages/logic/src/account-review/parser-schemas";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";
import type { AiVoiceParserSuccess } from "./ai-voice-parser-service";

export interface VoiceReviewClassification {
  readonly kind: "v2" | "legacy" | "malformed_advisory" | "invalid_financial";
  readonly financialRows: readonly AccountReviewVoiceFinancialRow[];
  readonly providerResponse: unknown;
}

const financialProjection = z.object(accountReviewVoiceFinancialRowSchema.shape);

/** Reuse the canonical financial schema; strip only the canonical v2 evidence fields. */
function validFinancialRows(
  rows: readonly unknown[]
): readonly AccountReviewVoiceFinancialRow[] {
  const result: AccountReviewVoiceFinancialRow[] = [];
  for (const row of rows) {
    const parsed = financialProjection.safeParse(row);
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

function readResponseRows(value: unknown): readonly unknown[] | null {
  if (typeof value !== "object" || value === null ||
      !("transactions" in value) || !Array.isArray(value.transactions)) {
    return null;
  }
  return value.transactions;
}

/**
 * Legacy responses cannot prove currency omission or account identity. An
 * invalid v2 advisory retains valid financial rows and its raw v2 provenance
 * for the pure normalizer's conservative unconfirmed/hard-reason result.
 */
export function classifyVoiceReviewV2Response(
  input: unknown
): VoiceReviewClassification {
  const rows = readResponseRows(input);
  if (rows === null) {
    return { kind: "invalid_financial", financialRows: [], providerResponse: input };
  }
  const financialRows = validFinancialRows(rows);
  if (financialRows.length !== rows.length) {
    return { kind: "invalid_financial", financialRows, providerResponse: input };
  }
  if (typeof input !== "object" || input === null) {
    return { kind: "invalid_financial", financialRows, providerResponse: input };
  }
  if (!("reviewContractVersion" in input)) {
    return { kind: "legacy", financialRows, providerResponse: null };
  }
  const v2 = accountReviewVoiceResponseV2Schema.safeParse(input);
  return v2.success
    ? { kind: "v2", financialRows, providerResponse: v2.data }
    : { kind: "malformed_advisory", financialRows, providerResponse: input };
}

/** Only the T014-M adapter creates the full normalized session. */
export function attachVoiceReviewSession(input: {
  readonly success: AiVoiceParserSuccess;
  readonly reviewSession: AccountReviewSession | null;
  readonly expectedOwnerId: AccountReviewSession["ownerId"];
  readonly expectedSessionId: AccountReviewSession["sessionId"];
}): AiVoiceParserSuccess {
  if (input.reviewSession === null) return input.success;
  const checked = accountReviewSessionSchema.parse(input.reviewSession);
  if (checked.source !== "VOICE" ||
      checked.ownerId !== input.expectedOwnerId ||
      checked.sessionId !== input.expectedSessionId) {
    throw new Error("Voice review session owner/source identity changed");
  }
  return { ...input.success, reviewSession: checked };
}
