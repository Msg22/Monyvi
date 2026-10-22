/**
 * Synthetic-only T012 Voice review request/response data.
 * Every v2 fixture is inferred and parsed from the GENERATED Edge Zod contract;
 * never import app/DB/logic source or fork canonical schema/business rules.
 */
import type { z } from "zod";
import {
  accountReviewRequestContextSchema,
  accountReviewVoiceResponseV2Schema,
  accountReviewEvidenceSpanSchema,
} from "../../_shared/account-review-contract.ts";

type ReviewContext = z.infer<typeof accountReviewRequestContextSchema>;
type VoiceResponseV2 = z.infer<typeof accountReviewVoiceResponseV2Schema>;
type VoiceEvidenceSpan = z.infer<typeof accountReviewEvidenceSpanSchema>;

export const REVIEW_WIRE_IDS = Object.freeze({
  ownerId: "00000000-0000-4000-8000-000000000101",
  bankAccountId: "00000000-0000-4000-8000-000000000102",
  cashAccountId: "00000000-0000-4000-8000-000000000103",
  voiceRequestKey: "voice-logical-request-1",
  voiceRowRef: "voice-row-1",
  suggestionRef: "qnb-suggestion-1",
});

export const REVIEW_VOICE_TRANSCRIPT = "🛒 Paid QNB 50 EGP for lunch";

export function makeReviewRequestContext(): ReviewContext {
  return accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [
      {
        id: REVIEW_WIRE_IDS.bankAccountId,
        name: "QNB salary",
        currency: "EGP",
        type: "BANK",
        institutionId: null,
        providerDisplayName: "QNB",
        cardLast4: "0007",
        senderNames: ["QNB"],
      },
      {
        id: REVIEW_WIRE_IDS.cashAccountId,
        name: "Cash",
        currency: "EGP",
        type: "CASH",
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        senderNames: [],
      },
    ],
  });
}

function voiceSpan(
  sourceRef: string,
  sourceText: string,
  fragment: string
): VoiceEvidenceSpan {
  const start = sourceText.indexOf(fragment);
  if (start < 0) throw new Error("Invalid synthetic Voice evidence fragment");
  return {
    sourceRef,
    field: "transcript",
    start,
    end: start + fragment.length,
    text: fragment,
  };
}

type VoiceRow = VoiceResponseV2["transactions"][number];

function voiceAccountEvidence(sourceRef: string): VoiceRow["accountEvidence"] {
  return {
    state: "explicit",
    name: "QNB",
    type: "BANK",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: null,
    evidenceSpans: [voiceSpan(sourceRef, REVIEW_VOICE_TRANSCRIPT, "QNB")],
    candidateAccountIds: [],
  };
}

function voiceCurrencyEvidence(
  sourceRef: string,
  transcript: string
): VoiceRow["currencyEvidence"] {
  return {
    state: "explicit",
    statedCode: "EGP",
    candidateCodes: ["EGP"],
    evidenceSpans: [voiceSpan(sourceRef, transcript, "EGP")],
  };
}

function voiceFinancialTransaction(sourceRef: string): VoiceRow {
  return {
    amount: 50,
    type: "EXPENSE",
    counterparty: "Lunch",
    categorySystemName: "food",
    description: "Lunch at the canteen",
    accountId: null,
    currency: "EGP",
    date: "2026-10-14",
    confidenceScore: 0.95,
    transactionRef: REVIEW_WIRE_IDS.voiceRowRef,
    suggestionRef: REVIEW_WIRE_IDS.suggestionRef,
    accountEvidence: voiceAccountEvidence(sourceRef),
    toAccountEvidence: null,
    currencyEvidence: voiceCurrencyEvidence(sourceRef, REVIEW_VOICE_TRANSCRIPT),
  };
}

function voiceSuggestion(): VoiceResponseV2["suggestedAccounts"][number] {
  return {
    suggestionRef: REVIEW_WIRE_IDS.suggestionRef,
    name: "QNB",
    type: "BANK",
    currency: "EGP",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: null,
    senderNames: ["QNB"],
    transactionRefs: [REVIEW_WIRE_IDS.voiceRowRef],
  };
}

export function makeVoiceV2Response(
  sourceRef: string = REVIEW_WIRE_IDS.voiceRequestKey
): VoiceResponseV2 {
  return accountReviewVoiceResponseV2Schema.parse({
    reviewContractVersion: "account-review/v2",
    transcript: "Paid QNB 50 EGP for lunch",
    original_transcript: REVIEW_VOICE_TRANSCRIPT,
    detected_language: "en",
    transactions: [voiceFinancialTransaction(sourceRef)],
    suggestedAccounts: [voiceSuggestion()],
  });
}

function cashAccountEvidence(
  row: VoiceRow,
  sourceRef: string,
  transcript: string
): VoiceRow["accountEvidence"] {
  return {
    ...row.accountEvidence,
    name: "Cash",
    type: "CASH",
    institutionId: null,
    providerDisplayName: null,
    cardLast4: null,
    evidenceSpans: [voiceSpan(sourceRef, transcript, "Cash")],
  };
}

function cashSuggestion(
  suggestion: VoiceResponseV2["suggestedAccounts"][number]
): VoiceResponseV2["suggestedAccounts"][number] {
  return {
    ...suggestion,
    name: "Cash",
    type: "CASH",
    providerDisplayName: null,
    cardLast4: null,
    senderNames: [],
  };
}

/** A real spoken Cash span; never invent BANK destination or provider evidence. */
export function makeGroundedVoiceCashV2Response(): VoiceResponseV2 {
  const base = makeVoiceV2Response();
  const originalTranscript = "🛒 Paid Cash 50 EGP for lunch";
  const row = base.transactions[0];
  const suggestion = base.suggestedAccounts[0];
  if (!row || !suggestion) throw new Error("Missing synthetic Voice source");
  return accountReviewVoiceResponseV2Schema.parse({
    ...base,
    transcript: "Paid Cash 50 EGP for lunch",
    original_transcript: originalTranscript,
    transactions: [
      {
        ...row,
        accountEvidence: cashAccountEvidence(
          row,
          REVIEW_WIRE_IDS.voiceRequestKey,
          originalTranscript
        ),
        currencyEvidence: voiceCurrencyEvidence(
          REVIEW_WIRE_IDS.voiceRequestKey,
          originalTranscript
        ),
      },
    ],
    suggestedAccounts: [cashSuggestion(suggestion)],
  });
}

/** Legacy financial fixture projected from the generated canonical V2 fields. */
type VoiceLegacyResponse = {
  readonly transcript: VoiceResponseV2["transcript"];
  readonly original_transcript: VoiceResponseV2["original_transcript"];
  readonly detected_language: VoiceResponseV2["detected_language"];
  readonly transactions: readonly Pick<
    VoiceRow,
    | "amount"
    | "type"
    | "counterparty"
    | "categorySystemName"
    | "description"
    | "accountId"
    | "currency"
    | "date"
    | "confidenceScore"
  >[];
};

export function makeVoiceV1Response(): VoiceLegacyResponse {
  const base = makeVoiceV2Response();
  return {
    transcript: base.transcript,
    original_transcript: base.original_transcript,
    detected_language: base.detected_language,
    transactions: base.transactions.map((row) => ({
      amount: row.amount,
      type: row.type,
      counterparty: row.counterparty,
      categorySystemName: row.categorySystemName,
      description: row.description,
      accountId: row.accountId,
      currency: row.currency,
      date: row.date,
      confidenceScore: row.confidenceScore,
    })),
  };
}
