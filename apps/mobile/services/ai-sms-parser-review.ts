/**
 * #395 T013 — pure SMS provider financial/advisory boundary and immutable
 * local full-session attach. No network, DB, source adapter or orchestrator.
 */
import { z } from "zod";
import {
  accountReviewSmsFinancialRowSchema,
  accountReviewSmsResponseV2Schema,
  type AccountReviewSmsFinancialRow,
} from "../../../packages/logic/src/account-review/parser-schemas";
import {
  accountReviewSessionSchema, type AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";
import type { AiParseResult } from "./ai-sms-parser-service";
import type { SmsReviewNormalizationInput } from
  "../../../packages/logic/src/account-review/normalization-types";

interface SubmittedMessage {
  readonly id: string;
  readonly body: string;
  readonly sender: string;
  readonly smsFingerprint: string;
}

/** Direct canonical pure-normalizer fields; no copied provider/writer DTO. */
export type SmsReviewChunk = Pick<
  SmsReviewNormalizationInput,
  | "requestKey" | "financialRows" | "mappedTransactions"
  | "submittedMessages" | "providerResponse"
>;

export interface SmsReviewClassification {
  readonly kind: "v2" | "legacy" | "malformed_advisory" | "invalid_financial";
  readonly financialRows: readonly AccountReviewSmsFinancialRow[];
  readonly providerResponse: unknown;
}

const financialProjection = z.object(accountReviewSmsFinancialRowSchema.shape);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRows(value: unknown): readonly unknown[] | null {
  return isRecord(value) && Array.isArray(value.transactions) ?
    value.transactions : null;
}

function validFinancialRows(
  raw: readonly unknown[],
  sources?: readonly SubmittedMessage[]
): readonly AccountReviewSmsFinancialRow[] {
  const sourceIds = sources === undefined ? null :
    new Set(sources.map((m) => m.id));
  const seen = new Set<string>();
  const accepted: AccountReviewSmsFinancialRow[] = [];
  for (const item of raw) {
    const parsed = financialProjection.safeParse(item);
    if (!parsed.success ||
        (sourceIds !== null && !sourceIds.has(parsed.data.messageId)) ||
        seen.has(parsed.data.messageId)) continue;
    seen.add(parsed.data.messageId);
    accepted.push(parsed.data);
  }
  return accepted;
}

function validSourceSpans(
  row: AccountReviewSmsFinancialRow,
  advisory: unknown,
  sources: readonly SubmittedMessage[]
): boolean {
  if (!isRecord(advisory)) return false;
  const source = sources.find((m) => m.id === row.messageId);
  if (!source || !isRecord(advisory.accountEvidence) ||
      !isRecord(advisory.currencyEvidence)) return false;
  const sourceProof = advisory.accountEvidence.evidenceSpans;
  const currencyProof = advisory.currencyEvidence.evidenceSpans;
  const targetProof = isRecord(advisory.toAccountEvidence)
    ? advisory.toAccountEvidence.evidenceSpans : [];
  const spans = [sourceProof, currencyProof, targetProof].flatMap(
    (values) => Array.isArray(values) ? values : []
  );
  return spans.every((span) => {
    if (!isRecord(span) || span.sourceRef !== source.id ||
        typeof span.start !== "number" || typeof span.end !== "number" ||
        typeof span.text !== "string") return false;
    const text = span.field === "body" ? source.body :
      span.field === "sender" ? source.sender : null;
    return text !== null && text.slice(span.start, span.end) === span.text;
  });
}

/**
 * A malformed *advisory* retains valid original finance and raw evidence so
 * the real T014 pure normalizer can mark unconfirmed/hard reasons.
 */
export function classifySmsReviewV2Response(
  input: unknown,
  submittedMessages?: readonly SubmittedMessage[]
): SmsReviewClassification {
  const raw = readRows(input);
  if (raw === null) {
    return { kind: "invalid_financial", financialRows: [], providerResponse: input };
  }
  const rows = validFinancialRows(raw, submittedMessages);
  if (rows.length !== raw.length) {
    return { kind: "invalid_financial", financialRows: [], providerResponse: input };
  }
  if (!isRecord(input)) {
    return { kind: "invalid_financial", financialRows: [], providerResponse: input };
  }
  if (!("reviewContractVersion" in input)) {
    return { kind: "legacy", financialRows: rows, providerResponse: null };
  }
  const parsed = accountReviewSmsResponseV2Schema.safeParse(input);
  // Without original sources (legacy direct parser caller) this is only a
  // syntactic advisory preview, never a trusted ownership/Save decision.
  const grounded = parsed.success && (submittedMessages === undefined ||
    parsed.data.transactions.every((row) =>
      validSourceSpans(row, row, submittedMessages)));
  return grounded && parsed.success
    ? { kind: "v2", financialRows: rows, providerResponse: parsed.data }
    : { kind: "malformed_advisory", financialRows: rows, providerResponse: input };
}

/** Real T014-M adapter returns the canonical complete session, never here. */
export function attachSmsReviewSession(input: {
  readonly success: AiParseResult;
  readonly reviewSession: AccountReviewSession | null;
  readonly expectedOwnerId: AccountReviewSession["ownerId"];
  readonly expectedSessionId: AccountReviewSession["sessionId"];
}): AiParseResult {
  if (input.reviewSession === null) return input.success;
  const review = accountReviewSessionSchema.parse(input.reviewSession);
  if (review.source !== "SMS" || review.ownerId !== input.expectedOwnerId ||
      review.sessionId !== input.expectedSessionId) {
    throw new Error("SMS review session owner/source identity changed");
  }
  return { ...input.success, reviewSession: review };
}
