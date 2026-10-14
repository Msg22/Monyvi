import { z } from "zod";
import { addIssue, areDistinct } from "./schema-primitives";
import type {
  AccountReviewEvidenceSpan,
  ResponseRow,
  SuggestedAccount,
} from "./parser-schemas";

/** Provider payloads exclude private submitted SMS body and sender strings. */
function validateSpanSource(
  span: AccountReviewEvidenceSpan,
  source: "VOICE" | "SMS",
  originalTranscript: string | null,
  messageId: string | null,
  ctx: z.RefinementCtx,
  rowIndex: number
): void {
  const path = ["transactions", rowIndex, "accountEvidence"];
  if (source === "VOICE") {
    if (span.field !== "transcript") {
      addIssue(ctx, path, "Voice evidence must reference transcript");
    }
    if (originalTranscript === null ||
        originalTranscript.slice(span.start, span.end) !== span.text) {
      addIssue(ctx, path, "Voice span mismatches original transcript");
    }
  } else if (span.field === "transcript" || span.sourceRef !== messageId) {
    addIssue(ctx, path, "SMS evidence must reference its own message");
  }
}

function validateRowEvidence(
  row: ResponseRow,
  source: "VOICE" | "SMS",
  transcript: string | null,
  ctx: z.RefinementCtx,
  index: number
): void {
  if (source === "SMS" && row.accountEvidence.state === "contextual") {
    addIssue(ctx, ["transactions", index, "accountEvidence"], "Contextual evidence is Voice-only");
  }
  if (row.suggestionRef !== null &&
      row.accountEvidence.state !== "explicit" &&
      row.accountEvidence.state !== "contextual") {
    addIssue(ctx, ["transactions", index, "suggestionRef"], "A suggestion requires explicit account evidence");
  }
  if (source === "VOICE" && row.toAccountEvidence !== null) {
    addIssue(ctx, ["transactions", index, "toAccountEvidence"], "Ordinary Voice transaction cannot invent a transfer endpoint");
  }
  if (source === "SMS" && "isAtmWithdrawal" in row &&
      !row.isAtmWithdrawal && row.toAccountEvidence !== null) {
    addIssue(ctx, ["transactions", index, "toAccountEvidence"], "Ordinary SMS transaction cannot invent Cash destination");
  }
  const messageId = "messageId" in row ? row.messageId : null;
  for (const span of [
    ...row.accountEvidence.evidenceSpans,
    ...(row.toAccountEvidence?.evidenceSpans ?? []),
    ...row.currencyEvidence.evidenceSpans,
  ]) {
    validateSpanSource(span, source, transcript, messageId, ctx, index);
  }
}

function validateSuggestedCore(
  row: ResponseRow,
  suggestion: SuggestedAccount,
  ctx: z.RefinementCtx,
  index: number
): void {
  const evidence = row.accountEvidence;
  if (suggestion.currency !== null &&
      row.currencyEvidence.state === "explicit" &&
      suggestion.currency !== row.currencyEvidence.statedCode) {
    addIssue(ctx, ["transactions", index, "currencyEvidence"], "Suggested identity conflicts with explicit currency");
  }
  if (suggestion.type !== null && evidence.type !== null &&
      suggestion.type !== evidence.type) {
    addIssue(ctx, ["transactions", index, "accountEvidence"], "Suggested account type conflicts with evidence");
  }
  if (evidence.name !== null &&
      suggestion.name.trim().toLowerCase() !== evidence.name.trim().toLowerCase()) {
    addIssue(ctx, ["transactions", index, "accountEvidence"], "Suggested account name conflicts with evidence");
  }
}

function validateSuggestedMetadata(
  row: ResponseRow,
  suggestion: SuggestedAccount,
  ctx: z.RefinementCtx,
  index: number
): void {
  const evidence = row.accountEvidence;
  if (suggestion.providerDisplayName !== null &&
      evidence.providerDisplayName !== null &&
      suggestion.providerDisplayName !== evidence.providerDisplayName) {
    addIssue(ctx, ["transactions", index, "accountEvidence"], "Suggested provider conflicts with evidence");
  }
  if (suggestion.institutionId !== null && evidence.institutionId !== null &&
      suggestion.institutionId !== evidence.institutionId) {
    addIssue(ctx, ["transactions", index, "accountEvidence"], "Suggested institution conflicts with explicit identity");
  }
  if (suggestion.cardLast4 !== evidence.cardLast4) {
    addIssue(ctx, ["transactions", index, "accountEvidence"], "Unproven or conflicting card identity");
  }
}

function validateRowSuggestion(
  row: ResponseRow,
  suggestions: readonly SuggestedAccount[],
  source: "VOICE" | "SMS",
  ctx: z.RefinementCtx,
  index: number
): void {
  if (row.suggestionRef === null) return;
  const suggestion = suggestions.find((candidate) => candidate.suggestionRef === row.suggestionRef);
  if (!suggestion || !suggestion.transactionRefs.includes(row.transactionRef)) {
    addIssue(ctx, ["transactions", index, "suggestionRef"], "Dangling/nonreciprocal suggestion reference");
    return;
  }
  if (source === "SMS" && "isAtmWithdrawal" in row &&
      !row.isAtmWithdrawal && suggestion.type === "CASH") {
    addIssue(ctx, ["transactions", index, "suggestionRef"], "Ordinary SMS source excludes Cash");
  }
  validateSuggestedCore(row, suggestion, ctx, index);
  validateSuggestedMetadata(row, suggestion, ctx, index);
}

export function validateAdvisoryEnvelope(
  rows: readonly ResponseRow[],
  suggestions: readonly SuggestedAccount[],
  source: "VOICE" | "SMS",
  transcript: string | null,
  ctx: z.RefinementCtx
): void {
  if (!areDistinct(rows.map((row) => row.transactionRef))) {
    addIssue(ctx, ["transactions"], "Duplicate response-local transaction refs");
  }
  if (!areDistinct(suggestions.map((suggestion) => suggestion.suggestionRef))) {
    addIssue(ctx, ["suggestedAccounts"], "Duplicate suggestion refs");
  }
  for (const [index, row] of rows.entries()) {
    validateRowEvidence(row, source, transcript, ctx, index);
    validateRowSuggestion(row, suggestions, source, ctx, index);
  }
  for (const [index, suggestion] of suggestions.entries()) {
    for (const ref of suggestion.transactionRefs) {
      const row = rows.find((item) => item.transactionRef === ref);
      if (!row || row.suggestionRef !== suggestion.suggestionRef) {
        addIssue(ctx, ["suggestedAccounts", index, "transactionRefs"], "Suggestion references an unrelated row");
      }
    }
  }
}
