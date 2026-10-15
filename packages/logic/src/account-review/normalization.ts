import {
  accountReviewSmsResponseV2Schema,
  accountReviewVoiceResponseV2Schema,
  type AccountReviewSmsResponseV2,
  type AccountReviewVoiceResponseV2,
  type AccountReviewSuggestedAccount,
} from "./parser-schemas";
import {
  accountReviewRowSchema, accountReviewSessionSchema,
  type AccountReviewRow, type AccountReviewSession, type AccountReviewReason,
} from "./review-schemas";
import { deriveAccountReviewRowIdentity } from "./identity";
import { collectFinancialEntries, canonicalAmount, type FinancialEntry } from "./normalization-financial";
import { normalizeRowEvidence, type RowAdvisory, type NormalizedRowEvidence } from "./normalization-evidence";
import {
  normalizeAtmDestinationEvidence, type NormalizedAtmDestination,
} from "./normalization-destination";
import { createPendingReviewGroups, type PendingReviewRow } from "./normalization-groups";
import type { AccountReviewNormalizationInput } from "./normalization-types";

type ValidatedAdvisoryRow =
  | AccountReviewVoiceResponseV2["transactions"][number]
  | AccountReviewSmsResponseV2["transactions"][number];

interface ValidatedAdvisory {
  readonly rows: readonly ValidatedAdvisoryRow[];
  readonly suggestions: readonly AccountReviewSuggestedAccount[];
  readonly isMalformed: boolean;
  /** Only after a full canonical re-parse with destination proof redacted. */
  readonly rawDestinationByRef?: ReadonlyMap<string, unknown>;
}


/**
 * A bad destination alone must not poison valid source evidence. Redact only
 * that field, then run the SAME closed canonical v2 parser over every other
 * source/financial/suggestion field. Original proof remains untrusted.
 */
function recoverSmsDestinationOnly(raw: unknown): ValidatedAdvisory | null {
  if (!isV2Response(raw) || typeof raw !== "object" || raw === null ||
      !("transactions" in raw) || !Array.isArray(raw.transactions)) return null;
  const originalRows: readonly unknown[] = raw.transactions;
  const redactedRows = originalRows.map((row) =>
    typeof row === "object" && row !== null
      ? { ...row, toAccountEvidence: null }
      : row
  );
  const parsed = accountReviewSmsResponseV2Schema.safeParse({
    ...raw, transactions: redactedRows,
  });
  if (!parsed.success) return null;
  const rawDestinationByRef = new Map<string, unknown>();
  for (const [index, row] of parsed.data.transactions.entries()) {
    const original = originalRows[index];
    rawDestinationByRef.set(
      row.transactionRef,
      typeof original === "object" && original !== null &&
        "toAccountEvidence" in original
        ? original.toAccountEvidence : undefined
    );
  }
  return {
    rows: parsed.data.transactions, suggestions: parsed.data.suggestedAccounts,
    isMalformed: false, rawDestinationByRef,
  };
}

function destinationFor(
  parsed: ValidatedAdvisory, row: RowAdvisory | null
): unknown {
  if (!row) return null;
  return parsed.rawDestinationByRef?.has(row.transactionRef)
    ? parsed.rawDestinationByRef.get(row.transactionRef)
    : row.toAccountEvidence;
}

function readAdvisory(input: AccountReviewNormalizationInput): ValidatedAdvisory {
  if (input.source === "VOICE") {
    const parsed = accountReviewVoiceResponseV2Schema.safeParse(input.providerResponse);
    if (parsed.success && parsed.data.original_transcript === input.originalTranscript) {
      return {
        rows: parsed.data.transactions,
        suggestions: parsed.data.suggestedAccounts,
        isMalformed: false,
      };
    }
  } else {
    const parsed = accountReviewSmsResponseV2Schema.safeParse(input.providerResponse);
    if (parsed.success) {
      return {
        rows: parsed.data.transactions,
        suggestions: parsed.data.suggestedAccounts,
        isMalformed: false,
      };
    }
    // Invalid *destination* proof can be isolated without relaxing any
    // existing financial/source/account/currency/group validators.
    const recovered = recoverSmsDestinationOnly(input.providerResponse);
    if (recovered) return recovered;
  }
  return {
    rows: [], suggestions: [],
    isMalformed: isV2Response(input.providerResponse),
  };
}

function isV2Response(response: unknown): boolean {
  return typeof response === "object" && response !== null &&
    "reviewContractVersion" in response &&
    response.reviewContractVersion === "account-review/v2";
}

function originalRef(input: AccountReviewNormalizationInput, index: number): string | null {
  const original = input.financialRows[index];
  if (!original || !("transactionRef" in original)) return null;
  return typeof original.transactionRef === "string" ? original.transactionRef : null;
}

function financialMatches(
  entry: FinancialEntry,
  candidate: ValidatedAdvisoryRow
): boolean {
  return entry.financial.amount === candidate.amount &&
    entry.financial.type === candidate.type &&
    entry.financial.categorySystemName === candidate.categorySystemName &&
    entry.financial.date === candidate.date &&
    entry.financial.currency === candidate.currency &&
    (entry.source === "VOICE" ? !("messageId" in candidate) :
      "messageId" in candidate && entry.financial.messageId === candidate.messageId);
}

function advisoryFor(
  input: AccountReviewNormalizationInput,
  entry: FinancialEntry,
  index: number,
  valid: ValidatedAdvisory
): RowAdvisory | null {
  if (valid.isMalformed || valid.rows.length === 0) return null;
  const ref = originalRef(input, index);
  const candidates = valid.rows.filter((row) =>
    financialMatches(entry, row) && (ref === null || row.transactionRef === ref)
  );
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

function initialReasons(
  entry: FinancialEntry,
  evidence: NormalizedRowEvidence,
  malformed: boolean
): AccountReviewReason[] {
  const codes: AccountReviewReason[] = [...(entry.mapped.reviewReasons ?? []), ...evidence.reasons];
  if (malformed && !codes.includes("account_evidence_invalid")) {
    codes.push("account_evidence_invalid");
  }
  const pending = evidence.currency.state === "unconfirmed"
    ? "currency_confirmation_needed" :
    !evidence.isAccountEvidenceValid && malformed
      ? "account_evidence_invalid" : "account_needed";
  if (!codes.includes(pending)) codes.push(pending);
  if (entry.source === "SMS" && entry.mapped.isAtmWithdrawal) {
    if (!codes.includes("cash_transfer_review")) codes.push("cash_transfer_review");
  }
  return [...new Set(codes)];
}

function prepareRow(
  entry: FinancialEntry, rowId: string, evidence: NormalizedRowEvidence,
  destination: NormalizedAtmDestination, malformed: boolean
): AccountReviewRow {
  const reasons = initialReasons(entry, evidence, malformed);
  if (destination.invalid && !reasons.includes("account_evidence_invalid")) {
    reasons.push("account_evidence_invalid");
  }
  const reasonCode = reasons.includes("currency_confirmation_needed")
    ? "currency_confirmation_needed" :
    reasons.includes("account_evidence_invalid")
      ? "account_evidence_invalid" : "account_needed";
  const common = {
    rowId, sourceRef: evidence.sourceRef, amountDecimal: canonicalAmount(entry.financial.amount),
    accountEvidence: evidence.accountEvidence,
    toAccountEvidence: destination.toAccountEvidence,
    currency: evidence.currency,
    assignment: {
      state: "unresolved" as const, accountId: null, reasonCode,
      candidateAccountIds: [],
    },
    toAssignment: null, reviewReasons: reasons,
    selected: false, revision: "0", hasUserAccountOverride: false,
    hasUserCurrencyOverride: false,
  };
  return accountReviewRowSchema.parse(entry.source === "VOICE"
    ? { ...common, source: "VOICE", sourceFingerprint: null, transaction: entry.mapped }
    : { ...common, source: "SMS",
        sourceFingerprint: entry.mapped.smsFingerprint, transaction: entry.mapped });
}

async function buildRows(
  input: AccountReviewNormalizationInput,
  entries: readonly FinancialEntry[],
  advisory: ValidatedAdvisory
): Promise<PendingReviewRow[]> {
  const occurrences = new Map<string, number>();
  const pending: PendingReviewRow[] = [];
  for (const [index, entry] of entries.entries()) {
    const key = JSON.stringify([entry.sourceRecordKey, entry.financialKey]);
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    const rowId = await deriveAccountReviewRowIdentity({
      ownerId: input.ownerId, sessionId: input.sessionId, source: input.source,
      sourceRecordKey: entry.sourceRecordKey, sourceFinancialKey: entry.financialKey,
      occurrence, hashProvider: input.hashProvider,
    });
    const raw = advisoryFor(input, entry, index, advisory);
    const evidence = normalizeRowEvidence(input, entry, raw);
    const destination = normalizeAtmDestinationEvidence(
      input, entry, evidence.currency, destinationFor(advisory, raw)
    );
    const invalidAdvisory = advisory.isMalformed ||
      (advisory.rows.length > 0 && raw === null);
    pending.push({
      row: prepareRow(entry, rowId, evidence, destination, invalidAdvisory),
      evidence,
    });
  }
  return pending;
}

/** Pure, first complete immutable source snapshot. No account resolver or persistence. */
export async function normalizeAccountReviewParserResult(
  input: AccountReviewNormalizationInput
): Promise<AccountReviewSession> {
  const entries = collectFinancialEntries(input);
  const advisory = readAdvisory(input);
  const prepared = await buildRows(input, entries, advisory);
  const projected = await createPendingReviewGroups(input, prepared, advisory.suggestions);
  return accountReviewSessionSchema.parse({
    ownerId: input.ownerId, sessionId: input.sessionId, source: input.source,
    sourceRevision: input.sourceRevision,
    preferredCurrency: input.reviewAccountSnapshots.preferredCurrency,
    rows: projected.rows, groups: projected.groups,
    removedEvidenceKeys: [], filter: "all", revision: "0",
    operationGeneration: "0", saveIntent: null,
  });
}

export type { AccountReviewNormalizationInput } from "./normalization-types";
