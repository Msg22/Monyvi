/**
 * Synthetic two-QNB-card input grounded in actual submitted SMS or Voice text.
 * No provider, storage, platform, or normalized-result mocks.
 */
import {
  accountReviewRequestContextSchema,
  type AccountReviewAccountContext,
  type AccountReviewAccountEvidence,
  type AccountReviewEvidenceSpan,
  type AccountReviewSmsResponseV2,
  type AccountReviewVoiceResponseV2,
} from "../parser-schemas";
import type {
  AccountReviewNormalizationInput,
  AccountReviewOwnedContext,
} from "../normalization-types";
import { makeEvidenceSpan, REVIEW_WIRE_IDS } from "./fixtures";
import { makeSmsInput, makeVoiceInput } from "./normalization-fixtures";

export const CARD_PROOF_IDS = Object.freeze({
  first: REVIEW_WIRE_IDS.bankAccountId,
  second: "00000000-0000-4000-8000-000000000119",
  firstSuffix: "0007",
  secondSuffix: "0018",
  foreignSuffix: "0099",
});

export type CardEvidenceVariant =
  | "bank_only"
  | "card_context"
  | "wrong_span"
  | "other_message"
  | "reference_digits"
  | "amount_digits"
  | "phone_digits"
  | "foreign_suffix"
  | "masked_english"
  | "masked_arabic"
  | "ending_arabic"
  | "continued_space"
  | "continued_hyphen"
  | "continued_arabic_space"
  | "continued_arabic_hyphen"
  | "continued_parenthesis"
  | "continued_bracket"
  | "continued_arabic_parenthesis"
  | "continued_arabic_bracket"
  | "continued_arabic_rtl_format"
  | "continued_adjacent_fullwidth";

interface SyntheticSource {
  readonly text: string;
  readonly amount: number;
  readonly suffix: string;
  readonly suffixFragment: string | null;
}

export interface GroundedCardFixture {
  readonly input: AccountReviewNormalizationInput;
  readonly amount: number;
  readonly claimedSuffix: string;
  readonly expectedAccountId: string;
}

function sourceFor(
  source: "SMS" | "VOICE",
  variant: CardEvidenceVariant
): SyntheticSource {
  const sms = source === "SMS";
  const prefix = sms ? "QNB purchase EGP " : "🛒 Paid QNB ";
  const number = variant === "amount_digits" ? "0007" : "50";
  const suffix =
    variant === "foreign_suffix"
      ? CARD_PROOF_IDS.foreignSuffix
      : CARD_PROOF_IDS.firstSuffix;
  const suffixFragment =
    variant === "bank_only"
      ? null
      : variant === "masked_english"
        ? "card **** " + suffix
        : variant === "masked_arabic"
          ? "بطاقة **** ٠٠٠٧"
          : variant === "ending_arabic"
            ? "بطاقتك المنتهية بـ ٠٠٠٧"
            : [
                  "continued_space",
                  "continued_hyphen",
                  "continued_parenthesis",
                  "continued_bracket",
                  "continued_adjacent_fullwidth",
                ].includes(variant)
              ? "card number " + suffix
              : [
                    "continued_arabic_space",
                    "continued_arabic_hyphen",
                    "continued_arabic_parenthesis",
                    "continued_arabic_bracket",
                    "continued_arabic_rtl_format",
                  ].includes(variant)
                ? "بطاقة رقم ٠٠٠٧"
                : [
                      "card_context",
                      "wrong_span",
                      "other_message",
                      "foreign_suffix",
                    ].includes(variant)
                  ? "card ending " + suffix
                  : suffix;
  const phrase =
    variant === "bank_only" || variant === "amount_digits"
      ? ""
      : variant === "reference_digits"
        ? " ref 0007"
        : variant === "phone_digits"
          ? " support 1900007"
          : variant === "masked_english"
            ? " on card **** " + suffix
            : variant === "masked_arabic"
              ? " على بطاقة **** ٠٠٠٧"
              : variant === "ending_arabic"
                ? " على بطاقتك المنتهية بـ ٠٠٠٧"
                : variant === "continued_space"
                  ? " on card number " + suffix + " 1234"
                  : variant === "continued_hyphen"
                    ? " on card number " + suffix + "-1234"
                    : variant === "continued_arabic_space"
                      ? " على بطاقة رقم ٠٠٠٧ ١٢٣٤"
                      : variant === "continued_arabic_hyphen"
                        ? " على بطاقة رقم ٠٠٠٧-١٢٣٤"
                        : variant === "continued_parenthesis"
                          ? " on card number 0007 (1234)"
                          : variant === "continued_bracket"
                            ? " on card number 0007 [1234]"
                            : variant === "continued_arabic_parenthesis"
                              ? " على بطاقة رقم ٠٠٠٧ (١٢٣٤)"
                              : variant === "continued_arabic_bracket"
                                ? " على بطاقة رقم ٠٠٠٧ [١٢٣٤]"
                                : variant === "continued_arabic_rtl_format"
                                  ? " على بطاقة رقم ٠٠٠٧\u200f[١٢٣٤]"
                                  : variant === "continued_adjacent_fullwidth"
                                    ? " on card number " + suffix + "１２３４"
                                    : " on card ending " + suffix;
  return {
    text: sms
      ? prefix + number + phrase
      : prefix + number + " EGP" + phrase + " for lunch",
    amount: variant === "amount_digits" ? 7 : 50,
    suffix,
    suffixFragment,
  };
}

function evidenceSpans(
  source: "SMS" | "VOICE",
  variant: CardEvidenceVariant,
  record: SyntheticSource
): readonly AccountReviewEvidenceSpan[] {
  const sourceRef =
    source === "SMS"
      ? REVIEW_WIRE_IDS.smsMessageId
      : REVIEW_WIRE_IDS.voiceRequestKey;
  const field = source === "SMS" ? ("body" as const) : ("transcript" as const);
  const bank = makeEvidenceSpan(sourceRef, field, record.text, "QNB");
  if (record.suffixFragment === null) return [bank];
  const actual = makeEvidenceSpan(
    sourceRef,
    field,
    record.text,
    record.suffixFragment
  );
  const suffixSpan =
    variant === "wrong_span"
      ? { ...actual, start: 0, end: actual.text.length }
      : variant === "other_message"
        ? { ...actual, sourceRef: "synthetic-unsubmitted-reference" }
        : actual;
  return [bank, suffixSpan];
}

function ownedTwoCards(ownerId: string): AccountReviewOwnedContext {
  const first: AccountReviewAccountContext = {
    id: CARD_PROOF_IDS.first,
    name: "QNB salary",
    currency: "EGP",
    type: "BANK",
    institutionId: null,
    providerDisplayName: "QNB",
    cardLast4: CARD_PROOF_IDS.firstSuffix,
    senderNames: ["QNB"],
  };
  const second: AccountReviewAccountContext = {
    ...first,
    id: CARD_PROOF_IDS.second,
    name: "QNB purchases",
    cardLast4: CARD_PROOF_IDS.secondSuffix,
  };
  const accounts = [first, second];
  return {
    ownerId,
    preferredCurrency: "EGP",
    accounts: accounts.map((account) => ({ ...account, isDefault: false })),
    providerContext: accountReviewRequestContextSchema.parse({
      reviewContractVersion: "account-review/v2",
      preferredCurrency: "EGP",
      accounts,
    }),
  };
}

function claimedEvidence(
  source: "SMS" | "VOICE",
  variant: CardEvidenceVariant,
  record: SyntheticSource,
  original: AccountReviewAccountEvidence
): AccountReviewAccountEvidence {
  return {
    ...original,
    name: "QNB",
    type: "BANK",
    providerDisplayName: "QNB",
    cardLast4: record.suffix,
    // A response-owned ID plus matching account metadata is NOT source proof.
    candidateAccountIds: [CARD_PROOF_IDS.first],
    evidenceSpans: [...evidenceSpans(source, variant, record)],
  };
}

export function smsCardFixture(
  variant: CardEvidenceVariant,
  withSuggestion = false
): GroundedCardFixture {
  const base = makeSmsInput();
  const original = base.providerResponse.transactions[0];
  const suggested = base.providerResponse.suggestedAccounts[0];
  const financial = base.financialRows[0];
  const mapped = base.mappedTransactions[0];
  const submitted = base.submittedMessages[0];
  if (!original || !suggested || !financial || !mapped || !submitted) {
    throw new Error("Missing canonical SMS fixture");
  }
  const record = sourceFor("SMS", variant);
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...original,
    amount: record.amount,
    suggestionRef: withSuggestion ? suggested.suggestionRef : null,
    accountEvidence: claimedEvidence(
      "SMS",
      variant,
      record,
      original.accountEvidence
    ),
    currencyEvidence: {
      ...original.currencyEvidence,
      evidenceSpans: [
        makeEvidenceSpan(
          REVIEW_WIRE_IDS.smsMessageId,
          "body",
          record.text,
          "EGP"
        ),
      ],
    },
  };
  const response: AccountReviewSmsResponseV2 = {
    ...base.providerResponse,
    transactions: [row],
    suggestedAccounts: withSuggestion
      ? [{ ...suggested, cardLast4: record.suffix }]
      : [],
  };
  return {
    amount: record.amount,
    claimedSuffix: record.suffix,
    expectedAccountId: CARD_PROOF_IDS.first,
    input: {
      ...base,
      reviewAccountSnapshots: ownedTwoCards(base.ownerId),
      financialRows: [{ ...financial, amount: record.amount }],
      mappedTransactions: [
        {
          ...mapped,
          amount: record.amount,
          rawSmsBody: record.text,
        },
      ],
      submittedMessages: [
        {
          id: REVIEW_WIRE_IDS.smsMessageId,
          body: record.text,
          sender: "QNB",
          smsFingerprint: submitted.smsFingerprint,
        },
      ],
      providerResponse: response,
    },
  };
}

export function voiceCardFixture(
  variant: CardEvidenceVariant,
  withSuggestion = false
): GroundedCardFixture {
  const base = makeVoiceInput();
  const original = base.providerResponse.transactions[0];
  const suggested = base.providerResponse.suggestedAccounts[0];
  const financial = base.financialRows[0];
  const mapped = base.mappedTransactions[0];
  if (!original || !suggested || !financial || !mapped) {
    throw new Error("Missing canonical Voice fixture");
  }
  const record = sourceFor("VOICE", variant);
  const row: AccountReviewVoiceResponseV2["transactions"][number] = {
    ...original,
    amount: record.amount,
    suggestionRef: withSuggestion ? suggested.suggestionRef : null,
    accountEvidence: claimedEvidence(
      "VOICE",
      variant,
      record,
      original.accountEvidence
    ),
    currencyEvidence: {
      ...original.currencyEvidence,
      evidenceSpans: [
        makeEvidenceSpan(
          REVIEW_WIRE_IDS.voiceRequestKey,
          "transcript",
          record.text,
          "EGP"
        ),
      ],
    },
  };
  const response: AccountReviewVoiceResponseV2 = {
    ...base.providerResponse,
    original_transcript: record.text,
    transcript: record.text,
    transactions: [row],
    suggestedAccounts: withSuggestion
      ? [{ ...suggested, cardLast4: record.suffix }]
      : [],
  };
  return {
    amount: record.amount,
    claimedSuffix: record.suffix,
    expectedAccountId: CARD_PROOF_IDS.first,
    input: {
      ...base,
      reviewAccountSnapshots: ownedTwoCards(base.ownerId),
      financialRows: [{ ...financial, amount: record.amount }],
      mappedTransactions: [
        {
          ...mapped,
          amount: record.amount,
          originalTranscript: record.text,
        },
      ],
      originalTranscript: record.text,
      providerResponse: response,
    },
  };
}
