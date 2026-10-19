/**
 * #395 T012 — canonical Voice financial/advisory classification and immutable
 * full-session attachment. No network, device DB, provider or source adapter.
 */
import { z } from "zod";
import {
  accountReviewVoiceFinancialRowSchema,
  accountReviewVoiceResponseV2Schema,
  type AccountReviewCurrencyEvidence,
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

const financialProjection = z.object(
  accountReviewVoiceFinancialRowSchema.shape
);

/**
 * Resolve one financial row by its ORIGINAL response index. Compacted valid
 * arrays are not safe to index after a preceding malformed row is filtered.
 */
export function projectVoiceFinancialAtSourceIndex(
  rows: readonly unknown[],
  sourceIndex: number
): AccountReviewVoiceFinancialRow | null {
  const parsed = financialProjection.safeParse(rows[sourceIndex]);
  return parsed.success ? parsed.data : null;
}

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

/** Keep externally supplied JSON arrays typed as unknown[], never inferred any[]. */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function readResponseRows(value: unknown): readonly unknown[] | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("transactions" in value) ||
    !isUnknownArray(value.transactions)
  ) {
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
    return {
      kind: "invalid_financial",
      financialRows: [],
      providerResponse: input,
    };
  }
  const financialRows = validFinancialRows(rows);
  if (financialRows.length !== rows.length) {
    return {
      kind: "invalid_financial",
      financialRows,
      providerResponse: input,
    };
  }
  if (typeof input !== "object" || input === null) {
    return {
      kind: "invalid_financial",
      financialRows,
      providerResponse: input,
    };
  }
  if (!("reviewContractVersion" in input)) {
    return { kind: "legacy", financialRows, providerResponse: null };
  }
  const v2 = accountReviewVoiceResponseV2Schema.safeParse(input);
  return v2.success
    ? { kind: "v2", financialRows, providerResponse: v2.data }
    : { kind: "malformed_advisory", financialRows, providerResponse: input };
}

/**
 * DEV-only caller consumes these fixed-shape counters transiently.
 * No raw source/response text, ID, account, amount, span offsets or Zod message
 * can appear in the returned payload, including on malformed provider input.
 */
type CurrencyEvidenceState = AccountReviewCurrencyEvidence["state"] | "invalid";
type SafeIssueCode =
  | "invalid_type"
  | "invalid_value"
  | "invalid_format"
  | "too_small"
  | "too_big"
  | "unrecognized_keys"
  | "custom"
  | "other";
type SafeIssueField =
  | "currency"
  | "account"
  | "destination"
  | "financial"
  | "reference"
  | "suggestions"
  | "transcript"
  | "envelope";
type UnconfirmedReason = Extract<
  AccountReviewSession["rows"][number]["currency"],
  { state: "unconfirmed" }
>["reason"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeCurrencyState(value: unknown): CurrencyEvidenceState {
  switch (value) {
    case "explicit":
    case "omitted":
    case "ambiguous":
    case "conflicting":
    case "unsupported":
    case "unknown":
      return value;
    default:
      return "invalid";
  }
}

function safeIssueCode(value: string): SafeIssueCode {
  switch (value) {
    case "invalid_type":
    case "invalid_value":
    case "invalid_format":
    case "too_small":
    case "too_big":
    case "unrecognized_keys":
    case "custom":
      return value;
    default:
      return "other";
  }
}

function safeIssueField(path: PropertyKey[]): SafeIssueField {
  if (path[0] === "suggestedAccounts") return "suggestions";
  if (path[0] === "transcript" || path[0] === "original_transcript")
    return "transcript";
  if (path[0] !== "transactions") return "envelope";
  switch (path[2]) {
    case "currencyEvidence":
      return "currency";
    case "accountEvidence":
      return "account";
    case "toAccountEvidence":
      return "destination";
    case "suggestionRef":
    case "transactionRef":
      return "reference";
    default:
      return "financial";
  }
}

export function summarizeVoiceCurrencyDiagnostics(input: {
  readonly classification: VoiceReviewClassification;
  readonly originalTranscript: string;
  readonly requestKey: string;
  readonly finalSession: AccountReviewSession | null;
}): {
  readonly classifier: VoiceReviewClassification["kind"];
  readonly financialCount: number;
  readonly advisoryCount: number;
  readonly transcriptEqual: boolean | null;
  readonly evidenceStates: Record<CurrencyEvidenceState, number>;
  readonly spans: {
    readonly checked: number;
    readonly sourceMatches: number;
    readonly utf16Matches: number;
    readonly bothMatch: number;
  };
  readonly validation: {
    readonly count: number;
    readonly codes: Record<SafeIssueCode, number>;
    readonly fields: Record<SafeIssueField, number>;
  };
  readonly normalized: {
    readonly knownExplicit: number;
    readonly knownOmission: number;
    readonly knownUser: number;
    readonly unconfirmed: Record<UnconfirmedReason, number>;
  } | null;
} {
  const response = isRecord(input.classification.providerResponse)
    ? input.classification.providerResponse
    : null;
  const original = response?.original_transcript;
  const rows: readonly unknown[] = isUnknownArray(response?.transactions)
    ? response.transactions
    : [];
  const evidenceStates: Record<CurrencyEvidenceState, number> = {
    explicit: 0,
    omitted: 0,
    ambiguous: 0,
    conflicting: 0,
    unsupported: 0,
    unknown: 0,
    invalid: 0,
  };
  const spans = { checked: 0, sourceMatches: 0, utf16Matches: 0, bothMatch: 0 };
  // Bounded sample counts only; source text and offsets never leave this scope.
  for (const candidate of rows.slice(0, 32)) {
    const evidence = isRecord(candidate) ? candidate.currencyEvidence : null;
    const record = isRecord(evidence) ? evidence : null;
    evidenceStates[safeCurrencyState(record?.state)] += 1;
    const sourceSpans: readonly unknown[] = isUnknownArray(
      record?.evidenceSpans
    )
      ? record.evidenceSpans
      : [];
    for (const value of sourceSpans.slice(0, 8)) {
      spans.checked += 1;
      const span = isRecord(value) ? value : null;
      const sourceMatches =
        span?.field === "transcript" && span.sourceRef === input.requestKey;
      const start = span?.start;
      const end = span?.end;
      const text = span?.text;
      const utf16Matches =
        typeof start === "number" &&
        typeof end === "number" &&
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        end > start &&
        end <= input.originalTranscript.length &&
        typeof text === "string" &&
        input.originalTranscript.slice(start, end) === text;
      if (sourceMatches) spans.sourceMatches += 1;
      if (utf16Matches) spans.utf16Matches += 1;
      if (sourceMatches && utf16Matches) spans.bothMatch += 1;
    }
  }

  const codes: Record<SafeIssueCode, number> = {
    invalid_type: 0,
    invalid_value: 0,
    invalid_format: 0,
    too_small: 0,
    too_big: 0,
    unrecognized_keys: 0,
    custom: 0,
    other: 0,
  };
  const fields: Record<SafeIssueField, number> = {
    currency: 0,
    account: 0,
    destination: 0,
    financial: 0,
    reference: 0,
    suggestions: 0,
    transcript: 0,
    envelope: 0,
  };
  let issueCount = 0;
  if (
    input.classification.kind === "malformed_advisory" ||
    input.classification.kind === "invalid_financial"
  ) {
    const checked = accountReviewVoiceResponseV2Schema.safeParse(
      input.classification.providerResponse
    );
    if (!checked.success) {
      issueCount = Math.min(checked.error.issues.length, 100);
      for (const issue of checked.error.issues.slice(0, 16)) {
        codes[safeIssueCode(issue.code)] += 1;
        fields[safeIssueField(issue.path)] += 1;
      }
    }
  }
  const unconfirmed: Record<UnconfirmedReason, number> = {
    ambiguous: 0,
    conflicting: 0,
    unsupported: 0,
    legacy_unknown: 0,
  };
  const normalized =
    input.finalSession === null
      ? null
      : {
          knownExplicit: input.finalSession.rows.filter(
            (row) =>
              row.currency.state === "known" &&
              row.currency.origin === "explicit"
          ).length,
          knownOmission: input.finalSession.rows.filter(
            (row) =>
              row.currency.state === "known" &&
              row.currency.origin === "preferred_omission"
          ).length,
          knownUser: input.finalSession.rows.filter(
            (row) =>
              row.currency.state === "known" && row.currency.origin === "user"
          ).length,
          unconfirmed,
        };
  if (input.finalSession !== null) {
    for (const row of input.finalSession.rows) {
      if (row.currency.state === "unconfirmed")
        unconfirmed[row.currency.reason] += 1;
    }
  }
  return {
    classifier: input.classification.kind,
    financialCount: Math.min(input.classification.financialRows.length, 100),
    advisoryCount: Math.min(rows.length, 100),
    transcriptEqual:
      typeof original === "string"
        ? original === input.originalTranscript
        : null,
    evidenceStates,
    spans,
    validation: { count: issueCount, codes, fields },
    normalized,
  };
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
  if (
    checked.source !== "VOICE" ||
    checked.ownerId !== input.expectedOwnerId ||
    checked.sessionId !== input.expectedSessionId
  ) {
    throw new Error("Voice review session owner/source identity changed");
  }
  return { ...input.success, reviewSession: checked };
}
