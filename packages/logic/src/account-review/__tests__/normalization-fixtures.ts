/**
 * #395 T014-P synthetic source records for pure normalization tests.
 * Only canonical Zod-derived provider contracts and existing parsed transaction
 * interfaces are used; no application, DB runtime or platform dependencies.
 */
import { createHash } from "node:crypto";
import type { Sha256Provider } from "../../financial-actions/action-contracts";
import type { normalizeAccountReviewParserResult } from "../normalization";

type ReviewNormalizationInput = Parameters<typeof normalizeAccountReviewParserResult>[0];
type VoiceInput = Extract<ReviewNormalizationInput, { source: "VOICE" }>;
type SmsInput = Extract<ReviewNormalizationInput, { source: "SMS" }>;
type VoiceV2Input = VoiceInput & {
  readonly providerResponse: AccountReviewVoiceResponseV2;
};
type SmsV2Input = SmsInput & {
  readonly providerResponse: AccountReviewSmsResponseV2;
};
import type { ParsedSmsTransaction, ParsedVoiceTransaction } from "../../types";
import {
  accountReviewRequestContextSchema,
  type AccountReviewAccountContext,
  type AccountReviewRequestContext,
  type AccountReviewSmsResponseV2,
  type AccountReviewVoiceResponseV2,
} from "../schemas";
import {
  makeAccountEvidence,
  makeCurrencyEvidence,
  makeEvidenceSpan,
  makeGroundedVoiceCashV2Response,
  makeSmsV2Response,
  makeVoiceV2Response,
  REVIEW_SMS_BODY,
  REVIEW_VOICE_TRANSCRIPT,
  REVIEW_WIRE_IDS,
} from "./fixtures";

export const NORMALIZATION_IDS = Object.freeze({
  owner: REVIEW_WIRE_IDS.ownerId,
  foreignOwner: "00000000-0000-4000-8000-000000000201",
  session: "00000000-0000-4000-8000-000000000202",
  alternateSession: "00000000-0000-4000-8000-000000000203",
  foodCategory: "00000000-0000-4000-8000-000000000204",
  shoppingCategory: "00000000-0000-4000-8000-000000000205",
  smsFingerprint: "synthetic-fingerprint-001",
  secondSmsFingerprint: "synthetic-fingerprint-002",
  secondSmsMessageId: "synthetic-message-2",
  secondRowRef: "sms-row-2",
  secondSuggestionRef: "qnb-suggestion-2",
  secondVoiceRowRef: "voice-duplicate-row-2",
  thirdVoiceRowRef: "voice-distinct-row-3",
});

/** Structural T010 compatibility, derived only from existing canonical types. */
export type SyntheticOwnedContext = {
  readonly ownerId: string;
  readonly preferredCurrency: AccountReviewRequestContext["preferredCurrency"];
  readonly accounts: readonly (AccountReviewAccountContext & {
    readonly isDefault: boolean;
  })[];
  readonly providerContext: AccountReviewRequestContext;
};

export function makeCategoryIdsBySystemName(): ReadonlyMap<string, string> {
  return new Map([
    ["food", NORMALIZATION_IDS.foodCategory],
    ["shopping", NORMALIZATION_IDS.shoppingCategory],
  ]);
}

export const syntheticHashProvider: Sha256Provider = {
  digestUtf8: (text: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(text, "utf8").digest("hex")),
};

export function makeOwnedContext(): SyntheticOwnedContext {
  const providerContext = accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [
      {
        id: REVIEW_WIRE_IDS.bankAccountId,
        name: "Unrelated bank",
        currency: "EGP",
        type: "BANK",
        institutionId: null,
        providerDisplayName: "Unrelated",
        cardLast4: null,
        senderNames: [],
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
  return {
    ownerId: NORMALIZATION_IDS.owner,
    preferredCurrency: providerContext.preferredCurrency,
    accounts: providerContext.accounts.map((account) => ({
      ...account,
      isDefault: account.type === "CASH",
    })),
    providerContext,
  };
}

export function makeParsedVoice(): ParsedVoiceTransaction {
  return {
    amount: 50,
    currency: "EGP",
    type: "EXPENSE",
    date: new Date("2026-10-14T12:00:00.000Z"),
    categoryId: NORMALIZATION_IDS.foodCategory,
    categoryDisplayName: "Food",
    confidence: 0.95,
    originLabel: "Voice",
    source: "VOICE",
    counterparty: "Lunch",
    note: "Lunch at the canteen",
    originalTranscript: REVIEW_VOICE_TRANSCRIPT,
    detectedLanguage: "en",
    aiDetectedCurrency: "EGP",
  };
}

export function makeParsedSms(): ParsedSmsTransaction {
  return {
    amount: 50,
    currency: "EGP",
    type: "EXPENSE",
    date: new Date("2026-10-14T12:00:00.000Z"),
    categoryId: NORMALIZATION_IDS.shoppingCategory,
    categoryDisplayName: "Shopping",
    confidence: 0.91,
    originLabel: "QNB",
    source: "SMS",
    smsFingerprint: NORMALIZATION_IDS.smsFingerprint,
    senderDisplayName: "QNB",
    rawSmsBody: REVIEW_SMS_BODY,
    isAtmWithdrawal: false,
  };
}

export function makeVoiceInput(): VoiceV2Input {
  const providerResponse: AccountReviewVoiceResponseV2 = makeVoiceV2Response();
  return {
    source: "VOICE" as const,
    ownerId: NORMALIZATION_IDS.owner,
    sessionId: NORMALIZATION_IDS.session,
    sourceRevision: "0",
    requestKey: REVIEW_WIRE_IDS.voiceRequestKey,
    reviewAccountSnapshots: makeOwnedContext(),
    categoryIdsBySystemName: makeCategoryIdsBySystemName(),
    financialRows: providerResponse.transactions,
    providerResponse,
    mappedTransactions: [makeParsedVoice()],
    originalTranscript: providerResponse.original_transcript,
    hashProvider: syntheticHashProvider,
  };
}

export function makeSmsInput(): SmsV2Input {
  const original = makeSmsV2Response();
  const providerResponse: AccountReviewSmsResponseV2 = {
    ...original,
    transactions: original.transactions.map((row) => ({
      ...row,
      isTrusted: true,
    })),
  };
  return {
    source: "SMS" as const,
    ownerId: NORMALIZATION_IDS.owner,
    sessionId: NORMALIZATION_IDS.session,
    sourceRevision: "0",
    requestKey: "synthetic-chunk-001",
    reviewAccountSnapshots: makeOwnedContext(),
    categoryIdsBySystemName: makeCategoryIdsBySystemName(),
    financialRows: providerResponse.transactions,
    providerResponse,
    mappedTransactions: [makeParsedSms()],
    submittedMessages: [
      {
        id: REVIEW_WIRE_IDS.smsMessageId,
        body: REVIEW_SMS_BODY,
        sender: "QNB",
        smsFingerprint: NORMALIZATION_IDS.smsFingerprint,
      },
    ],
    hashProvider: syntheticHashProvider,
  };
}

export function makeSecondSmsRow(): AccountReviewSmsResponseV2["transactions"][number] {
  const body = "QNB purchase EGP 25";
  const base = makeSmsV2Response().transactions[0];
  return {
    ...base,
    messageId: NORMALIZATION_IDS.secondSmsMessageId,
    transactionRef: NORMALIZATION_IDS.secondRowRef,
    amount: 25,
    isTrusted: true,
    accountEvidence: {
      ...makeAccountEvidence("SMS"),
      evidenceSpans: [
        makeEvidenceSpan(NORMALIZATION_IDS.secondSmsMessageId, "body", body, "QNB"),
      ],
    },
    currencyEvidence: {
      ...makeCurrencyEvidence("SMS"),
      evidenceSpans: [
        makeEvidenceSpan(NORMALIZATION_IDS.secondSmsMessageId, "body", body, "EGP"),
      ],
    },
  };
}

export function makeTwoSmsInput(): SmsV2Input {
  const first = makeSmsInput();
  const second = makeSecondSmsRow();
  const secondTransaction: ParsedSmsTransaction = {
    ...makeParsedSms(),
    amount: 25,
    smsFingerprint: NORMALIZATION_IDS.secondSmsFingerprint,
    rawSmsBody: "QNB purchase EGP 25",
  };
  const providerResponse: AccountReviewSmsResponseV2 = {
    ...first.providerResponse,
    transactions: [...first.providerResponse.transactions, second],
    suggestedAccounts: [{
      ...first.providerResponse.suggestedAccounts[0],
      transactionRefs: [
        first.providerResponse.transactions[0].transactionRef,
        NORMALIZATION_IDS.secondRowRef,
      ],
    }],
  };
  return {
    ...first,
    financialRows: providerResponse.transactions,
    providerResponse,
    mappedTransactions: [...first.mappedTransactions, secondTransaction],
    submittedMessages: [
      ...first.submittedMessages,
      {
        id: NORMALIZATION_IDS.secondSmsMessageId,
        body: secondTransaction.rawSmsBody,
        sender: "QNB",
        smsFingerprint: NORMALIZATION_IDS.secondSmsFingerprint,
      },
    ],
  };
}

export function makeCashVoiceInput(): VoiceV2Input {
  const input = makeVoiceInput();
  const providerResponse = makeGroundedVoiceCashV2Response();
  return {
    ...input,
    providerResponse,
    financialRows: providerResponse.transactions,
    originalTranscript: providerResponse.original_transcript,
    mappedTransactions: [{
      ...makeParsedVoice(),
      originalTranscript: providerResponse.original_transcript,
    }],
  };
}

export function makeUsdAmountRow(): AccountReviewSmsResponseV2["transactions"][number] {
  const original = makeSmsV2Response().transactions[0];
  const body = "QNB purchase USD 50.75";
  return {
    ...original,
    amount: 50.75,
    currency: "USD",
    accountEvidence: {
      ...original.accountEvidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "QNB"),
      ],
    },
    currencyEvidence: {
      ...original.currencyEvidence,
      statedCode: "USD",
      candidateCodes: ["USD"],
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "USD"),
      ],
    },
  };
}

export function makeUsdAmountInput(): SmsV2Input {
  const input = makeSmsInput();
  const body = "QNB purchase USD 50.75";
  const row = makeUsdAmountRow();
  return {
    ...input,
    financialRows: [row],
    providerResponse: {
      ...input.providerResponse,
      transactions: [row],
      suggestedAccounts: [{
        ...input.providerResponse.suggestedAccounts[0],
        currency: "USD",
      }],
    },
    mappedTransactions: [{
      ...makeParsedSms(), amount: 50.75, currency: "USD", rawSmsBody: body,
    }],
    submittedMessages: [{
      ...input.submittedMessages[0], body,
    }],
  };
}

export function makeSecondUsdSmsRow(): AccountReviewSmsResponseV2["transactions"][number] {
  const second = makeSecondSmsRow();
  const body = "QNB purchase USD 25";
  return {
    ...second,
    currency: "USD",
    suggestionRef: NORMALIZATION_IDS.secondSuggestionRef,
    accountEvidence: {
      ...second.accountEvidence,
      evidenceSpans: [
        makeEvidenceSpan(NORMALIZATION_IDS.secondSmsMessageId, "body", body, "QNB"),
      ],
    },
    currencyEvidence: {
      ...second.currencyEvidence,
      statedCode: "USD",
      candidateCodes: ["USD"],
      evidenceSpans: [
        makeEvidenceSpan(NORMALIZATION_IDS.secondSmsMessageId, "body", body, "USD"),
      ],
    },
  };
}

export function makeTwoCurrenciesInput(): SmsV2Input {
  const input = makeTwoSmsInput();
  const row = makeSecondUsdSmsRow();
  const body = "QNB purchase USD 25";
  const firstFinancial = input.financialRows[0];
  const firstMapped = input.mappedTransactions[0];
  const secondMapped = input.mappedTransactions[1];
  if (!firstFinancial || !firstMapped || !secondMapped) {
    throw new Error("Synthetic two-message fixture is incomplete");
  }
  return {
    ...input,
    financialRows: [firstFinancial, row],
    providerResponse: {
      ...input.providerResponse,
      transactions: [input.providerResponse.transactions[0], row],
      suggestedAccounts: [
        { ...input.providerResponse.suggestedAccounts[0],
          transactionRefs: [REVIEW_WIRE_IDS.smsRowRef] },
        { ...input.providerResponse.suggestedAccounts[0],
          suggestionRef: NORMALIZATION_IDS.secondSuggestionRef,
          currency: "USD",
          transactionRefs: [NORMALIZATION_IDS.secondRowRef] },
      ],
    },
    mappedTransactions: [
      firstMapped,
      { ...secondMapped, currency: "USD", rawSmsBody: body },
    ],
    submittedMessages: [
      input.submittedMessages[0],
      { ...input.submittedMessages[1], body },
    ],
  };
}

/** Actual speech identifies two identical but separate lunch transactions. */
function groundedVoiceRow(
  original: AccountReviewVoiceResponseV2["transactions"][number],
  transcript: string
): AccountReviewVoiceResponseV2["transactions"][number] {
  const span = (fragment: string) =>
    makeEvidenceSpan(
      REVIEW_WIRE_IDS.voiceRequestKey, "transcript", transcript, fragment
    );
  return {
    ...original,
    accountEvidence: {
      ...original.accountEvidence,
      evidenceSpans: [span("QNB")],
    },
    currencyEvidence: {
      ...original.currencyEvidence,
      evidenceSpans: [span("EGP")],
    },
  };
}

export function makeTwoIdenticalVoiceInput(): VoiceV2Input {
  const input = makeVoiceInput();
  const originalTranscript = "🛒 Paid QNB 50 EGP for lunch twice";
  const original = input.providerResponse.transactions[0];
  const suggested = input.providerResponse.suggestedAccounts[0];
  if (!original || !suggested) {
    throw new Error("Synthetic Voice response is missing its first entry");
  }
  const first = groundedVoiceRow(original, originalTranscript);
  const second = {
    ...first,
    transactionRef: NORMALIZATION_IDS.secondVoiceRowRef,
  };
  const providerResponse: AccountReviewVoiceResponseV2 = {
    ...input.providerResponse,
    transcript: "Paid QNB 50 EGP for lunch twice",
    original_transcript: originalTranscript,
    transactions: [first, second],
    suggestedAccounts: [{
      ...suggested,
      transactionRefs: [first.transactionRef, second.transactionRef],
    }],
  };
  const mapped = { ...makeParsedVoice(), originalTranscript };
  return {
    ...input,
    originalTranscript,
    providerResponse,
    financialRows: providerResponse.transactions,
    mappedTransactions: [mapped, { ...mapped }],
  };
}

/** An unrelated, genuinely spoken coffee item must not renumber lunch rows. */
export function makeTwoIdenticalVoiceWithExtraInput(): VoiceV2Input {
  const input = makeTwoIdenticalVoiceInput();
  const originalTranscript =
    "🛒 Paid QNB 50 EGP for lunch twice and QNB 25 EGP for coffee";
  const first = input.providerResponse.transactions[0];
  const suggested = input.providerResponse.suggestedAccounts[0];
  if (!first || !suggested) {
    throw new Error("Synthetic duplicate Voice fixture is incomplete");
  }
  const distinct = {
    ...first,
    transactionRef: NORMALIZATION_IDS.thirdVoiceRowRef,
    amount: 25,
    counterparty: "Coffee",
    description: "Coffee",
  };
  const providerResponse: AccountReviewVoiceResponseV2 = {
    ...input.providerResponse,
    original_transcript: originalTranscript,
    transcript: "Paid QNB 50 EGP for lunch twice and QNB 25 EGP for coffee",
    transactions: [...input.providerResponse.transactions, distinct],
    suggestedAccounts: [{
      ...suggested,
      transactionRefs: [...suggested.transactionRefs, distinct.transactionRef],
    }],
  };
  return {
    ...input,
    originalTranscript,
    providerResponse,
    financialRows: providerResponse.transactions,
    mappedTransactions: [
      ...input.mappedTransactions.map((row) => ({ ...row, originalTranscript })),
      { ...makeParsedVoice(), amount: 25, counterparty: "Coffee",
        note: "Coffee", originalTranscript },
    ],
  };
}
