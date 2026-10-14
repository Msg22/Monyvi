import type {
  AccountReviewAccountContext,
  AccountReviewRequestContext,
  AccountReviewEvidenceSpan,
  AccountReviewAccountEvidence,
  AccountReviewCurrencyEvidence,
  AccountReviewSuggestedAccount,
  AccountReviewVoiceFinancialRow,
  AccountReviewSmsFinancialRow,
  AccountReviewVoiceResponseV2,
  AccountReviewSmsResponseV2,
  AccountReviewRow,
} from "../schemas";

type ReviewTestSource = AccountReviewRow["source"];

/**
 * Synthetic, intentionally non-customer #395 wire fixtures.
 * All persisted identities are canonical UUIDs; parser aliases are request-local.
 * Builders return fresh graphs so one test cannot contaminate another.
 */
export const REVIEW_WIRE_IDS = Object.freeze({
  ownerId: "00000000-0000-4000-8000-000000000101",
  bankAccountId: "00000000-0000-4000-8000-000000000102",
  cashAccountId: "00000000-0000-4000-8000-000000000103",
  voiceRequestKey: "voice-logical-request-1",
  smsMessageId: "synthetic-message-1",
  voiceRowRef: "voice-row-1",
  smsRowRef: "sms-row-1",
  suggestionRef: "qnb-suggestion-1",
});

export const REVIEW_VOICE_TRANSCRIPT = "🛒 Paid QNB 50 EGP for lunch";
export const REVIEW_SMS_BODY = "QNB purchase EGP 50";

export function makeEvidenceSpan(
  sourceRef: string,
  field: AccountReviewEvidenceSpan["field"],
  sourceText: string,
  fragment: string
): AccountReviewEvidenceSpan {
  const start = sourceText.indexOf(fragment);
  if (start < 0) throw new Error("Synthetic evidence fixture is inconsistent");
  return { sourceRef, field, start, end: start + fragment.length, text: fragment };
}

export function makeRequestAccountContext(): AccountReviewAccountContext {
  return {
    id: REVIEW_WIRE_IDS.bankAccountId,
    name: "QNB salary",
    currency: "EGP",
    type: "BANK",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: "0007",
    senderNames: ["QNB"],
  };
}

export function makeReviewRequestContext(): AccountReviewRequestContext {
  return {
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [
      makeRequestAccountContext(),
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
  };
}

export function makeAccountEvidence(
  source: ReviewTestSource = "VOICE"
): AccountReviewAccountEvidence {
  const isVoice = source === "VOICE";
  const sourceRef = isVoice
    ? REVIEW_WIRE_IDS.voiceRequestKey
    : REVIEW_WIRE_IDS.smsMessageId;
  const field = isVoice ? "transcript" : "body";
  const sourceText = isVoice ? REVIEW_VOICE_TRANSCRIPT : REVIEW_SMS_BODY;
  return {
    state: "explicit",
    name: "QNB",
    type: "BANK",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: null,
    evidenceSpans: [makeEvidenceSpan(sourceRef, field, sourceText, "QNB")],
    candidateAccountIds: [],
  };
}

export function makeCurrencyEvidence(
  source: ReviewTestSource = "VOICE"
): AccountReviewCurrencyEvidence {
  const isVoice = source === "VOICE";
  const sourceRef = isVoice
    ? REVIEW_WIRE_IDS.voiceRequestKey
    : REVIEW_WIRE_IDS.smsMessageId;
  const sourceText = isVoice ? REVIEW_VOICE_TRANSCRIPT : REVIEW_SMS_BODY;
  return {
    state: "explicit",
    statedCode: "EGP",
    candidateCodes: ["EGP"],
    evidenceSpans: [
      makeEvidenceSpan(
        sourceRef,
        isVoice ? "transcript" : "body",
        sourceText,
        "EGP"
      ),
    ],
  };
}

export function makeSuggestedAccount(
  source: ReviewTestSource = "VOICE"
): AccountReviewSuggestedAccount {
  return {
    suggestionRef: REVIEW_WIRE_IDS.suggestionRef,
    name: "QNB",
    type: "BANK",
    currency: "EGP",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: null,
    senderNames: ["QNB"],
    transactionRefs: [
      source === "VOICE" ? REVIEW_WIRE_IDS.voiceRowRef : REVIEW_WIRE_IDS.smsRowRef,
    ],
  };
}

export function makeVoiceFinancialRow(): AccountReviewVoiceFinancialRow {
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
  };
}

export function makeSmsFinancialRow(): AccountReviewSmsFinancialRow {
  return {
    messageId: REVIEW_WIRE_IDS.smsMessageId,
    amount: 50,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Shop",
    date: "2026-10-14",
    categorySystemName: "shopping",
    isAtmWithdrawal: false,
    confidenceScore: 0.91,
    isTrusted: false,
  };
}

export function makeVoiceV2Response(): AccountReviewVoiceResponseV2 {
  return {
    reviewContractVersion: "account-review/v2",
    transcript: "Paid QNB 50 EGP for lunch",
    original_transcript: REVIEW_VOICE_TRANSCRIPT,
    detected_language: "en",
    transactions: [
      {
        ...makeVoiceFinancialRow(),
        transactionRef: REVIEW_WIRE_IDS.voiceRowRef,
        suggestionRef: REVIEW_WIRE_IDS.suggestionRef,
        accountEvidence: makeAccountEvidence("VOICE"),
        toAccountEvidence: null,
        currencyEvidence: makeCurrencyEvidence("VOICE"),
      },
    ],
    suggestedAccounts: [makeSuggestedAccount("VOICE")],
  };
}


/** Voice CASH has an actual spoken Cash span, never a BANK/provider alias recast as cash. */
export function makeGroundedVoiceCashV2Response(): AccountReviewVoiceResponseV2 {
  const base = makeVoiceV2Response();
  const transcript = "🛒 Paid Cash 50 EGP for lunch";
  return {
    ...base,
    transcript: "Paid Cash 50 EGP for lunch",
    original_transcript: transcript,
    transactions: [{
      ...base.transactions[0],
      accountEvidence: {
        ...base.transactions[0].accountEvidence,
        name: "Cash",
        type: "CASH",
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        evidenceSpans: [
          makeEvidenceSpan(
            REVIEW_WIRE_IDS.voiceRequestKey,
            "transcript",
            transcript,
            "Cash"
          ),
        ],
      },
      currencyEvidence: {
        ...base.transactions[0].currencyEvidence,
        evidenceSpans: [
          makeEvidenceSpan(
            REVIEW_WIRE_IDS.voiceRequestKey,
            "transcript",
            transcript,
            "EGP"
          ),
        ],
      },
    }],
    suggestedAccounts: [{
      ...base.suggestedAccounts[0],
      name: "Cash",
      type: "CASH",
      providerDisplayName: null,
      cardLast4: null,
      senderNames: [],
    }],
  };
}

export function makeSmsV2Response(): AccountReviewSmsResponseV2 {
  return {
    reviewContractVersion: "account-review/v2",
    transactions: [
      {
        ...makeSmsFinancialRow(),
        transactionRef: REVIEW_WIRE_IDS.smsRowRef,
        suggestionRef: REVIEW_WIRE_IDS.suggestionRef,
        accountEvidence: makeAccountEvidence("SMS"),
        toAccountEvidence: null,
        currencyEvidence: makeCurrencyEvidence("SMS"),
      },
    ],
    suggestedAccounts: [makeSuggestedAccount("SMS")],
    completionStatus: "complete",
    negativeFingerprints: [],
    terminalFingerprints: [],
    unresolvedFingerprints: [],
  };
}

export function makeVoiceV1Response(): {
  readonly transcript: string;
  readonly original_transcript: string;
  readonly detected_language: string;
  readonly transactions: readonly AccountReviewVoiceFinancialRow[];
} {
  return {
    transcript: "Paid QNB 50 EGP for lunch",
    original_transcript: REVIEW_VOICE_TRANSCRIPT,
    detected_language: "en",
    transactions: [makeVoiceFinancialRow()],
  };
}

export function makeSmsV1Response(): {
  readonly transactions: readonly AccountReviewSmsFinancialRow[];
  readonly completionStatus: "complete";
  readonly negativeFingerprints: readonly string[];
  readonly terminalFingerprints: readonly string[];
  readonly unresolvedFingerprints: readonly string[];
} {
  return {
    transactions: [makeSmsFinancialRow()],
    completionStatus: "complete",
    negativeFingerprints: [],
    terminalFingerprints: [],
    unresolvedFingerprints: [],
  };
}
