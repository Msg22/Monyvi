/**
 * #395 B1–B4 focused, synthetic financial/advisory provenance fixtures.
 * Uses the existing mapped Voice/SMS domain types and canonical v2 response
 * shapes; all account and message identities are from existing test fixtures.
 */
import {
  accountReviewRequestContextSchema,
  type AccountReviewCurrencyEvidence,
  type AccountReviewAccountEvidence,
  type AccountReviewSmsResponseV2,
  type AccountReviewVoiceResponseV2,
} from "../schemas";
import type { ParsedVoiceTransaction } from "../../types";
import { makeEvidenceSpan, REVIEW_WIRE_IDS } from "./fixtures";
import {
  NORMALIZATION_IDS,
  makeOwnedContext,
  makeParsedVoice,
  makeSmsInput,
  makeTwoSmsInput,
  makeVoiceInput,
} from "./normalization-fixtures";

/** Sender control: the ordinary QNB/QNB baseline legitimately shares a group. */
export function makeTwoSmsGroundedControl(): ReturnType<
  typeof makeTwoSmsInput
> {
  return makeTwoSmsInput();
}

function makeSecondCibRow(
  second: AccountReviewSmsResponseV2["transactions"][number],
  messageId: string,
  body: string
): AccountReviewSmsResponseV2["transactions"][number] {
  return {
    ...second,
    suggestionRef: null,
    accountEvidence: {
      ...second.accountEvidence,
      name: "CIB",
      providerDisplayName: "CIB",
      evidenceSpans: [makeEvidenceSpan(messageId, "body", body, "CIB")],
    },
    currencyEvidence: {
      ...second.currencyEvidence,
      evidenceSpans: [makeEvidenceSpan(messageId, "body", body, "EGP")],
    },
  };
}

export function makeCrossMessageSenderAliasAttack(): ReturnType<
  typeof makeTwoSmsInput
> {
  const input = makeTwoSmsInput();
  const first = input.providerResponse.transactions[0];
  const second = input.providerResponse.transactions[1];
  const suggestion = input.providerResponse.suggestedAccounts[0];
  const firstMapped = input.mappedTransactions[0];
  const secondMapped = input.mappedTransactions[1];
  const firstMessage = input.submittedMessages[0];
  const secondMessage = input.submittedMessages[1];
  if (
    !first ||
    !second ||
    !suggestion ||
    !firstMapped ||
    !secondMapped ||
    !firstMessage ||
    !secondMessage
  ) {
    throw new Error("Missing synthetic two-message evidence");
  }
  const body = "CIB purchase EGP 25";
  const changedFirst = {
    ...first,
    transactionRef: NORMALIZATION_IDS.secondSmsMessageId,
  };
  const changedSecond = makeSecondCibRow(second, secondMessage.id, body);
  const transactions: AccountReviewSmsResponseV2["transactions"] = [
    changedFirst,
    changedSecond,
  ];
  return {
    ...input,
    financialRows: transactions,
    mappedTransactions: [
      firstMapped,
      {
        ...secondMapped,
        originLabel: "CIB",
        senderDisplayName: "CIB",
        rawSmsBody: body,
      },
    ],
    // Intentionally order B before A: the alias must never win over A's fingerprint.
    submittedMessages: [
      { ...secondMessage, sender: "CIB", body },
      firstMessage,
    ],
    providerResponse: {
      ...input.providerResponse,
      transactions,
      suggestedAccounts: [
        {
          ...suggestion,
          senderNames: ["CIB"],
          transactionRefs: [changedFirst.transactionRef],
        },
      ],
    },
  };
}

/** A null financial currency means omission is coherent with preferred EGP. */
export function makeOmittedCurrencySmsInput(
  financialCurrency: "USD" | null
): ReturnType<typeof makeSmsInput> {
  const input = makeSmsInput();
  const original = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const submitted = input.submittedMessages[0];
  if (!original || !mapped || !submitted) {
    throw new Error("Missing synthetic source SMS");
  }
  const body = "QNB purchase 50";
  const evidence: AccountReviewCurrencyEvidence = {
    state: "omitted",
    statedCode: null,
    candidateCodes: [],
    evidenceSpans: [],
  };
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...original,
    currency: financialCurrency,
    suggestionRef: null,
    currencyEvidence: evidence,
    accountEvidence: {
      ...original.accountEvidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "QNB"),
      ],
    },
  };
  return {
    ...input,
    financialRows: [row],
    mappedTransactions: [
      {
        ...mapped,
        currency: financialCurrency ?? "EGP",
        rawSmsBody: body,
      },
    ],
    submittedMessages: [
      {
        ...submitted,
        body,
      },
    ],
    providerResponse: {
      ...input.providerResponse,
      transactions: [row],
      suggestedAccounts: [],
    },
  };
}

function qnbOwnedContext(): ReturnType<typeof makeOwnedContext> {
  const owned = makeOwnedContext();
  const bankId = REVIEW_WIRE_IDS.bankAccountId;
  return {
    ...owned,
    accounts: owned.accounts.map((account) =>
      account.id === bankId
        ? { ...account, name: "QNB", providerDisplayName: "QNB" }
        : account
    ),
    providerContext: {
      ...owned.providerContext,
      accounts: owned.providerContext.accounts.map((account) =>
        account.id === bankId
          ? { ...account, name: "QNB", providerDisplayName: "QNB" }
          : account
      ),
    },
  };
}

/** True = same owned provider/name, false = unrelated owned BANK. */
export function makeOwnedCandidateSmsInput(
  compatible: boolean
): ReturnType<typeof makeSmsInput> {
  const input = makeSmsInput();
  const first = input.providerResponse.transactions[0];
  if (!first) throw new Error("Missing synthetic candidate SMS");
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...first,
    suggestionRef: null,
    accountEvidence: {
      ...first.accountEvidence,
      candidateAccountIds: [REVIEW_WIRE_IDS.bankAccountId],
    },
  };
  if (!compatible)
    return {
      ...input,
      financialRows: [row],
      providerResponse: {
        ...input.providerResponse,
        transactions: [row],
        suggestedAccounts: [],
      },
    };
  return {
    ...input,
    financialRows: [row],
    reviewAccountSnapshots: qnbOwnedContext(),
    providerResponse: {
      ...input.providerResponse,
      transactions: [row],
      suggestedAccounts: [],
    },
  };
}

function voiceSharedEvidence(
  first: AccountReviewVoiceResponseV2["transactions"][number],
  transcript: string
): Pick<
  AccountReviewVoiceResponseV2["transactions"][number],
  "accountEvidence" | "currencyEvidence"
> {
  return {
    accountEvidence: {
      ...first.accountEvidence,
      evidenceSpans: [
        makeEvidenceSpan(
          REVIEW_WIRE_IDS.voiceRequestKey,
          "transcript",
          transcript,
          "QNB"
        ),
      ],
    },
    currencyEvidence: {
      ...first.currencyEvidence,
      evidenceSpans: [
        makeEvidenceSpan(
          REVIEW_WIRE_IDS.voiceRequestKey,
          "transcript",
          transcript,
          "EGP"
        ),
      ],
    },
  };
}

function makeMappedVoicePair(
  transcript: string
): readonly ParsedVoiceTransaction[] {
  const mapped = makeParsedVoice();
  return [
    {
      ...mapped,
      originalTranscript: transcript,
      counterparty: "Lunch",
      note: "Lunch at canteen",
    },
    {
      ...mapped,
      originalTranscript: transcript,
      counterparty: "Coffee",
      note: "Coffee break",
    },
  ];
}

function makeVoiceFinancialAndMapped(transcript: string): {
  readonly response: AccountReviewVoiceResponseV2;
  readonly mapped: readonly ParsedVoiceTransaction[];
} {
  const input = makeVoiceInput();
  const first = input.providerResponse.transactions[0];
  const suggestion = input.providerResponse.suggestedAccounts[0];
  if (!first || !suggestion) throw new Error("Missing synthetic Voice source");
  const sharedEvidence = voiceSharedEvidence(first, transcript);
  const lunch = {
    ...first,
    counterparty: "Lunch",
    description: "Lunch at canteen",
    ...sharedEvidence,
  };
  const coffee = {
    ...first,
    transactionRef: NORMALIZATION_IDS.secondVoiceRowRef,
    counterparty: "Coffee",
    description: "Coffee break",
    ...sharedEvidence,
  };
  const transactions: AccountReviewVoiceResponseV2["transactions"] = [
    lunch,
    coffee,
  ];
  return {
    response: {
      ...input.providerResponse,
      original_transcript: transcript,
      transcript: "Paid QNB 50 EGP for lunch and coffee",
      transactions,
      suggestedAccounts: [
        {
          ...suggestion,
          transactionRefs: transactions.map((row) => row.transactionRef),
        },
      ],
    },
    mapped: makeMappedVoicePair(transcript),
  };
}

export function makeDistinctVoiceCounterpartyInput(
  reverseMapped: boolean
): ReturnType<typeof makeVoiceInput> {
  const input = makeVoiceInput();
  const transcript = "🛒 Paid QNB 50 EGP for lunch and QNB 50 EGP for coffee";
  const { response, mapped } = makeVoiceFinancialAndMapped(transcript);
  return {
    ...input,
    originalTranscript: transcript,
    financialRows: response.transactions,
    providerResponse: response,
    mappedTransactions: reverseMapped ? [...mapped].reverse() : mapped,
  };
}

function cashSenderOwnedSnapshots(
  input: ReturnType<typeof makeSmsInput>
): ReturnType<typeof makeSmsInput>["reviewAccountSnapshots"] {
  const snapshots = input.reviewAccountSnapshots;
  const cashId = REVIEW_WIRE_IDS.cashAccountId;
  return {
    ...snapshots,
    accounts: snapshots.accounts.map((account) =>
      account.id === cashId ? { ...account, senderNames: ["Cash"] } : account
    ),
    providerContext: {
      ...snapshots.providerContext,
      accounts: snapshots.providerContext.accounts.map((account) =>
        account.id === cashId ? { ...account, senderNames: ["Cash"] } : account
      ),
    },
  };
}

function groundedCashSource(
  messageId: string,
  body: string,
  sender: string,
  candidateIds: readonly string[]
): AccountReviewAccountEvidence {
  return {
    state: "explicit",
    name: "Cash",
    type: "CASH",
    institutionId: null,
    providerDisplayName: null,
    cardLast4: null,
    evidenceSpans: [
      makeEvidenceSpan(messageId, "body", body, "Cash"),
      makeEvidenceSpan(messageId, "sender", sender, "Cash"),
    ],
    candidateAccountIds: [...candidateIds],
  };
}

/** Valid v2 source; ordinary SMS must exclude Cash even when owner/sender agree. */
export function makeOrdinaryCashSenderSms(
  withCandidate: boolean
): ReturnType<typeof makeSmsInput> {
  const input = makeSmsInput();
  const original = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const submitted = input.submittedMessages[0];
  if (!original || !mapped || !submitted) {
    throw new Error("Missing original ordinary SMS");
  }
  const body = "Cash purchase EGP 50";
  const sender = "Cash";
  const accountEvidence = groundedCashSource(
    submitted.id,
    body,
    sender,
    withCandidate ? [REVIEW_WIRE_IDS.cashAccountId] : []
  );
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...original,
    suggestionRef: null,
    accountEvidence,
    currencyEvidence: {
      ...original.currencyEvidence,
      evidenceSpans: [makeEvidenceSpan(submitted.id, "body", body, "EGP")],
    },
  };
  return {
    ...input,
    financialRows: [row],
    mappedTransactions: [
      {
        ...mapped,
        rawSmsBody: body,
        senderDisplayName: sender,
        originLabel: sender,
      },
    ],
    submittedMessages: [{ ...submitted, body, sender }],
    reviewAccountSnapshots: cashSenderOwnedSnapshots(input),
    providerResponse: {
      ...input.providerResponse,
      transactions: [row],
      suggestedAccounts: [],
    },
  };
}

/** Tagged v2 intentionally omits only the *required* destination field. */
export function makeOrdinarySmsMissingRequiredDestination(): {
  readonly input: ReturnType<typeof makeSmsInput>;
  readonly rawV2Response: unknown;
} {
  const input = makeSmsInput();
  const original = input.providerResponse.transactions[0];
  if (!original) throw new Error("Missing ordinary SMS response row");
  const { toAccountEvidence, ...missingRequiredField } = original;
  if (toAccountEvidence !== null) {
    throw new Error(
      "Baseline ordinary SMS must have explicit null destination"
    );
  }
  return {
    input,
    rawV2Response: {
      ...input.providerResponse,
      transactions: [missingRequiredField],
    },
  };
}

/** L2: untrusted model's BankX name is shared by two truly owned accounts.
 * Only one has the original SMS sender; eligibility constraints select
 * the OTHER. Candidate IDs are deliberately advisory, never source proof.
 */
export type SplitSenderConstraint =
  | "currency"
  | "type"
  | "institution"
  | "card";

export const SPLIT_SENDER_BANK_B = "00000000-0000-4000-8000-000000000119";

/**
 * Genuine SMS source, real EGP transaction, exact body/sender/card spans,
 * and full owner/provider projections that pass the canonical wire schemas.
 */
export function makeSplitSenderOwnedSmsInput(
  variant: SplitSenderConstraint,
  candidateAccountIds: readonly string[],
  originalSender: "ALERT-A" | "ALERT-B" = "ALERT-A"
): ReturnType<typeof makeSmsInput> {
  const input = makeSmsInput();
  const financial = input.providerResponse.transactions[0];
  const mapped = input.mappedTransactions[0];
  const submitted = input.submittedMessages[0];
  if (!financial || !mapped || !submitted)
    throw new Error("missing_authentic_sms_source");
  const withCard = variant === "card";
  const body = withCard
    ? "BankX purchase EGP 50 card ending 0018"
    : "BankX purchase EGP 50";
  const one = {
    id: REVIEW_WIRE_IDS.bankAccountId,
    name: "BankX",
    currency: variant === "currency" ? ("USD" as const) : ("EGP" as const),
    type: variant === "type" ? ("DIGITAL_WALLET" as const) : ("BANK" as const),
    institutionId: "inst-A",
    providerDisplayName: "BankX",
    cardLast4: "0007",
    senderNames: ["ALERT-A"],
  };
  const two = {
    ...one,
    id: SPLIT_SENDER_BANK_B,
    currency: "EGP" as const,
    type: "BANK" as const,
    institutionId: "inst-B",
    cardLast4: "0018",
    senderNames: ["ALERT-B"],
  };
  const provider = accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2",
    preferredCurrency: "EGP",
    accounts: [one, two],
  });
  const evidence = {
    ...financial.accountEvidence,
    state: "explicit" as const,
    name: "BankX",
    type: "BANK" as const,
    institutionId: variant === "institution" ? "inst-B" : null,
    providerDisplayName: "BankX",
    cardLast4: withCard ? "0018" : null,
    candidateAccountIds: [...candidateAccountIds],
    evidenceSpans: [
      makeEvidenceSpan(submitted.id, "body", body, "BankX"),
      ...(withCard
        ? [makeEvidenceSpan(submitted.id, "body", body, "card ending 0018")]
        : []),
      makeEvidenceSpan(submitted.id, "sender", originalSender, originalSender),
    ],
  };
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...financial,
    suggestionRef: null,
    accountEvidence: evidence,
    currencyEvidence: {
      ...financial.currencyEvidence,
      state: "explicit",
      statedCode: "EGP",
      candidateCodes: ["EGP"],
      evidenceSpans: [makeEvidenceSpan(submitted.id, "body", body, "EGP")],
    },
  };
  return {
    ...input,
    reviewAccountSnapshots: {
      ownerId: input.ownerId,
      preferredCurrency: "EGP",
      accounts: provider.accounts.map((account) => ({
        ...account,
        isDefault: false,
      })),
      providerContext: provider,
    },
    financialRows: [row],
    mappedTransactions: [
      {
        ...mapped,
        rawSmsBody: body,
        senderDisplayName: originalSender,
        originLabel: originalSender,
      },
    ],
    submittedMessages: [
      {
        ...submitted,
        body,
        sender: originalSender,
      },
    ],
    providerResponse: {
      ...input.providerResponse,
      transactions: [row],
      suggestedAccounts: [],
    },
  };
}
