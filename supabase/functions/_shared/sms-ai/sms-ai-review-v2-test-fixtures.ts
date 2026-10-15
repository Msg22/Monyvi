/**
 * #395 T013 synthetic Edge-only SMS account-review fixture.
 * Types and validators derive exclusively from the generated canonical facade;
 * no packages/logic, DB, mobile, provider call, or copied business validators.
 */
import type { z } from "zod";
import {
  accountReviewRequestContextSchema,
  accountReviewSmsResponseV2Schema,
  accountReviewEvidenceSpanSchema,
} from "../account-review-contract.ts";
import type { ParseSmsMessage } from "./sms-ai-provider.ts";

type Context = z.infer<typeof accountReviewRequestContextSchema>;
type V2Response = z.infer<typeof accountReviewSmsResponseV2Schema>;
type EvidenceSpan = z.infer<typeof accountReviewEvidenceSpanSchema>;
type SmsRow = V2Response["transactions"][number];

export const SMS_REVIEW_IDS = Object.freeze({
  bank: "00000000-0000-4000-8000-000000000102",
  cash: "00000000-0000-4000-8000-000000000103",
  message: "synthetic-message-1",
  secondMessage: "synthetic-message-2",
  row: "sms-row-1",
  suggestion: "qnb-suggestion-1",
  fingerprint: "synthetic-fingerprint-1",
  secondFingerprint: "synthetic-fingerprint-2",
  body: "QNB purchase EGP 50",
  secondBody: "CIB purchase USD 20",
});

export function makeSmsReviewContext(): Context {
  return accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [{
      id: SMS_REVIEW_IDS.bank,
      name: "QNB salary",
      currency: "EGP",
      type: "BANK",
      institutionId: null,
      providerDisplayName: "QNB",
      cardLast4: "0007",
      senderNames: ["QNB"],
    }, {
      id: SMS_REVIEW_IDS.cash,
      name: "Cash",
      currency: "EGP",
      type: "CASH",
      institutionId: null,
      providerDisplayName: null,
      cardLast4: null,
      senderNames: [],
    }],
  });
}

export function makeSubmittedSmsMessages(): readonly ParseSmsMessage[] {
  return [{
    id: SMS_REVIEW_IDS.message,
    sender: "QNB",
    body: SMS_REVIEW_IDS.body,
    date: "2026-10-14T12:00:00.000Z",
    smsFingerprint: SMS_REVIEW_IDS.fingerprint,
  }];
}

function span(sourceText: string, fragment: string): EvidenceSpan {
  const start = sourceText.indexOf(fragment);
  if (start < 0) throw new Error("Synthetic source lacks evidence fragment");
  return {
    sourceRef: SMS_REVIEW_IDS.message,
    field: "body",
    start,
    end: start + fragment.length,
    text: fragment,
  };
}

function bankProof(): SmsRow["accountEvidence"] {
  return {
    state: "explicit",
    name: "QNB",
    type: "BANK",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: null,
    evidenceSpans: [span(SMS_REVIEW_IDS.body, "QNB")],
    candidateAccountIds: [],
  };
}

function currencyProof(): SmsRow["currencyEvidence"] {
  return {
    state: "explicit",
    statedCode: "EGP",
    candidateCodes: ["EGP"],
    evidenceSpans: [span(SMS_REVIEW_IDS.body, "EGP")],
  };
}

function transaction(): SmsRow {
  return {
    messageId: SMS_REVIEW_IDS.message,
    amount: 50,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: "2026-10-14",
    categorySystemName: "shopping",
    isAtmWithdrawal: false,
    confidenceScore: 0.91,
    isTrusted: true,
    transactionRef: SMS_REVIEW_IDS.row,
    suggestionRef: SMS_REVIEW_IDS.suggestion,
    accountEvidence: bankProof(),
    toAccountEvidence: null,
    currencyEvidence: currencyProof(),
  };
}

function suggestion(): V2Response["suggestedAccounts"][number] {
  return {
    suggestionRef: SMS_REVIEW_IDS.suggestion,
    name: "QNB",
    type: "BANK",
    currency: "EGP",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: null,
    senderNames: ["QNB"],
    transactionRefs: [SMS_REVIEW_IDS.row],
  };
}

/** Provider's model-owned JSON excludes server completion/fingerprint metadata. */
export function makeSmsReviewV2Response(): V2Response {
  return accountReviewSmsResponseV2Schema.parse({
    reviewContractVersion: "account-review/v2",
    transactions: [transaction()],
    suggestedAccounts: [suggestion()],
  });
}

export function makeSmsReviewUnconfirmedCurrencyV2(): V2Response {
  const base = makeSmsReviewV2Response();
  const row = base.transactions[0];
  if (!row) throw new Error("Missing synthetic financial row");
  return accountReviewSmsResponseV2Schema.parse({
    ...base,
    suggestedAccounts: [],
    transactions: [{
      ...row,
      currency: null,
      suggestionRef: null,
      currencyEvidence: {
        state: "unknown",
        statedCode: null,
        candidateCodes: [],
        evidenceSpans: [],
      },
    }],
  });
}

/** Separate unchanged historical financial projection, without v2 evidence. */
export function makeLegacySmsResponse(): {
  readonly transactions: readonly Pick<
    SmsRow,
    | "messageId" | "amount" | "currency" | "type" | "counterparty"
    | "date" | "categorySystemName" | "isAtmWithdrawal"
    | "cardLast4" | "confidenceScore" | "isTrusted"
  >[];
  readonly completionStatus: "complete";
  readonly negativeFingerprints: readonly string[];
  readonly terminalFingerprints: readonly string[];
  readonly unresolvedFingerprints: readonly string[];
} {
  const row = transaction();
  return {
    transactions: [{
      messageId: row.messageId,
      amount: row.amount,
      currency: row.currency,
      type: row.type,
      counterparty: row.counterparty,
      date: row.date,
      categorySystemName: row.categorySystemName,
      isAtmWithdrawal: row.isAtmWithdrawal,
      confidenceScore: row.confidenceScore,
      isTrusted: row.isTrusted,
    }],
    completionStatus: "complete",
    negativeFingerprints: [],
    terminalFingerprints: [],
    unresolvedFingerprints: [],
  };
}
