/**
 * #395 I1 synthetic local review-row inputs. Types come from the exact canonical
 * Zod input contract, whose new proof field is intentionally optional on input.
 * No app/DB runtime, source-model mock or copied domain vocabulary.
 */
import type { z } from "zod";
import {
  accountReviewRowSchema,
  accountReviewSessionSchema,
  type AccountReviewAccountEvidence,
  type AccountReviewAssignment,
  type AccountReviewCurrency,
} from "../schemas";
import {
  makeAccountEvidence,
  makeEvidenceSpan,
  REVIEW_VOICE_TRANSCRIPT,
  REVIEW_WIRE_IDS,
} from "./fixtures";

export type LocalRowInput = z.input<typeof accountReviewRowSchema>;
export type LocalSessionInput = z.input<typeof accountReviewSessionSchema>;

export const I1 = Object.freeze({
  rowId: "00000000-0000-4000-8000-000000000105",
  sessionId: "00000000-0000-4000-8000-000000000106",
  categoryId: "00000000-0000-4000-8000-000000000108",
  smsFingerprint: "synthetic-i1-sms-fingerprint",
  body: "QNB ATM withdrew 50 EGP to Cash",
  unmatchedBody: "QNB ATM withdrew 50 EGP to Vault Cash",
});

export function knownCurrency(): AccountReviewCurrency {
  return { state: "known", code: "EGP", origin: "explicit" };
}

export function existingAccount(
  id: string,
  currency: Extract<AccountReviewCurrency, { state: "known" }>["code"] = "EGP"
): AccountReviewAssignment {
  return {
    state: "existing", accountId: id, currency,
    origin: "user", identityRevision: "0",
  };
}

export function unresolved(): AccountReviewAssignment {
  return {
    state: "unresolved", accountId: null,
    reasonCode: "account_needed", candidateAccountIds: [],
  };
}

export function voiceRow(): LocalRowInput {
  return {
    source: "VOICE", rowId: I1.rowId,
    sourceRef: REVIEW_WIRE_IDS.voiceRowRef, sourceFingerprint: null,
    transaction: {
      source: "VOICE", amount: 50, currency: "EGP", type: "EXPENSE",
      date: new Date("2026-10-14T12:00:00.000Z"),
      categoryId: I1.categoryId, categoryDisplayName: "Food",
      confidence: 0.95, originLabel: "Voice", note: "Lunch",
      originalTranscript: REVIEW_VOICE_TRANSCRIPT, detectedLanguage: "en",
      aiDetectedCurrency: "EGP",
    },
    amountDecimal: "50", accountEvidence: makeAccountEvidence("VOICE"),
    currency: knownCurrency(), assignment: unresolved(),
    toAssignment: null, reviewReasons: ["account_needed"],
    selected: false, revision: "0",
    hasUserAccountOverride: false, hasUserCurrencyOverride: false,
  };
}

export function smsRow(): LocalRowInput {
  return {
    source: "SMS", rowId: I1.rowId,
    sourceRef: REVIEW_WIRE_IDS.smsRowRef,
    sourceFingerprint: I1.smsFingerprint,
    transaction: {
      source: "SMS", amount: 50, currency: "EGP", type: "EXPENSE",
      date: new Date("2026-10-14T12:00:00.000Z"),
      categoryId: I1.categoryId, categoryDisplayName: "Shopping",
      confidence: 0.92, originLabel: "QNB",
      smsFingerprint: I1.smsFingerprint,
      senderDisplayName: "QNB", rawSmsBody: I1.body,
      isAtmWithdrawal: false,
    },
    amountDecimal: "50", accountEvidence: makeAccountEvidence("SMS"),
    currency: knownCurrency(),
    assignment: existingAccount(REVIEW_WIRE_IDS.bankAccountId),
    toAssignment: null, reviewReasons: [],
    selected: false, revision: "0",
    hasUserAccountOverride: true, hasUserCurrencyOverride: false,
  };
}

export function atmRow(body: string = I1.body): LocalRowInput {
  const row = smsRow();
  if (row.source !== "SMS") throw new Error("Expected canonical SMS fixture");
  return {
    ...row,
    transaction: { ...row.transaction, isAtmWithdrawal: true, rawSmsBody: body },
    reviewReasons: ["cash_transfer_review"],
  };
}

export function explicitDestination(
  body: string = I1.body,
  name = "Cash",
  candidateAccountIds: readonly string[] = []
): AccountReviewAccountEvidence {
  return {
    state: "explicit", name, type: "CASH",
    institutionId: null, providerDisplayName: null, cardLast4: null,
    evidenceSpans: [
      makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, name),
    ],
    candidateAccountIds: [...candidateAccountIds],
  };
}

export function absentDestination(): AccountReviewAccountEvidence {
  return {
    state: "absent", name: null, type: null,
    institutionId: null, providerDisplayName: null, cardLast4: null,
    evidenceSpans: [], candidateAccountIds: [],
  };
}

export function uncertainDestination(): AccountReviewAccountEvidence {
  return {
    ...explicitDestination(),
    state: "uncertain",
    candidateAccountIds: [],
  };
}

export function session(row: LocalRowInput): LocalSessionInput {
  return {
    ownerId: REVIEW_WIRE_IDS.ownerId, source: row.source,
    sessionId: I1.sessionId, sourceRevision: "0", preferredCurrency: "EGP",
    rows: [row], groups: [], removedEvidenceKeys: [], filter: "all",
    revision: "0", operationGeneration: "0", saveIntent: null,
  };
}
