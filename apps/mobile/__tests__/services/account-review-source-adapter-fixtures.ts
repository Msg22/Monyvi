/**
 * #395 T014-M source-adapter synthetic inputs.
 * Canonical exported parser/normalization types, real Node SHA-256 in Jest.
 * No provider/DB runtime, copied schema or mocked normalization engine.
 */
import { createHash } from "node:crypto";
import {
  accountReviewRequestContextSchema,
  accountReviewSmsResponseV2Schema,
  accountReviewVoiceResponseV2Schema,
  type AccountReviewAccountContext,
  type AccountReviewAccountEvidence,
  type AccountReviewEvidenceSpan,
  type AccountReviewOwnedContext,
  type AccountReviewSmsResponseV2,
  type AccountReviewVoiceResponseV2,
  type Sha256Provider,
  type SmsReviewNormalizationInput,
  type VoiceReviewNormalizationInput,
} from "@monyvi/logic";

export const ADAPTER_IDS = Object.freeze({
  owner: "00000000-0000-4000-8000-000000000101",
  otherOwner: "00000000-0000-4000-8000-000000000201",
  session: "00000000-0000-4000-8000-000000000202",
  secondSession: "00000000-0000-4000-8000-000000000203",
  bank: "00000000-0000-4000-8000-000000000102",
  cash: "00000000-0000-4000-8000-000000000103",
  food: "00000000-0000-4000-8000-000000000204",
  shopping: "00000000-0000-4000-8000-000000000205",
  fingerprint: "synthetic-adapter-fingerprint-1",
  secondFingerprint: "synthetic-adapter-fingerprint-2",
  smsId: "original-sms-1",
  secondSmsId: "original-sms-2",
  voiceRef: "voice-1",
  smsRef: "sms-1",
  suggestedRef: "qnb-1",
  recordingKey: "voice-logical-recording-1",
});

const DATE = "2026-10-14";
const VOICE_TEXT = "Paid QNB 50 EGP for lunch";
const SMS_BODY = "QNB purchase EGP 50";

export const realNodeSha256: Sha256Provider = {
  digestUtf8: (text: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(text, "utf8").digest("hex")),
};

function exactSpan(
  sourceRef: string, field: AccountReviewEvidenceSpan["field"],
  source: string, text: string
): AccountReviewEvidenceSpan {
  const start = source.indexOf(text);
  if (start < 0) throw new Error("Invalid synthetic evidence substring");
  return { sourceRef, field, start, end: start + text.length, text };
}

function accountEvidence(
  source: "VOICE" | "SMS", originalText: string,
  name: "QNB" | "Cash" = "QNB"
): AccountReviewAccountEvidence {
  const ref = source === "VOICE" ? ADAPTER_IDS.recordingKey : ADAPTER_IDS.smsId;
  const field = source === "VOICE" ? "transcript" : "body";
  return {
    state: "explicit", name, type: name === "Cash" ? "CASH" : "BANK",
    institutionId: null,
    providerDisplayName: name === "Cash" ? null : "QNB", cardLast4: null,
    evidenceSpans: [exactSpan(ref, field, originalText, name)],
    candidateAccountIds: [],
  };
}

export function makeAdapterSnapshots(): AccountReviewOwnedContext {
  const accounts: AccountReviewOwnedContext["accounts"] = [
    {
      id: ADAPTER_IDS.bank, name: "QNB", type: "BANK", currency: "EGP",
      institutionId: null, providerDisplayName: "QNB", cardLast4: null,
      senderNames: ["QNB"], isDefault: false,
    },
    {
      id: ADAPTER_IDS.cash, name: "Cash", type: "CASH", currency: "EGP",
      institutionId: null, providerDisplayName: null, cardLast4: null,
      senderNames: [], isDefault: true,
    },
  ];
  const project = (
    account: AccountReviewOwnedContext["accounts"][number]
  ): AccountReviewAccountContext => ({
    id: account.id, name: account.name, type: account.type,
    currency: account.currency, institutionId: account.institutionId,
    providerDisplayName: account.providerDisplayName,
    cardLast4: account.cardLast4, senderNames: [...account.senderNames],
  });
  const providerContext = accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2", preferredCurrency: "EGP",
    accounts: accounts.map(project),
  });
  return {
    ownerId: ADAPTER_IDS.owner, preferredCurrency: "EGP",
    accounts, providerContext,
  };
}

function categoryIds(): ReadonlyMap<string, string> {
  return new Map([
    ["food", ADAPTER_IDS.food],
    ["shopping", ADAPTER_IDS.shopping],
  ]);
}

function voiceResponse(
  originalText: string, name: "QNB" | "Cash" = "QNB"
): AccountReviewVoiceResponseV2 {
  const financial = {
    amount: 50, type: "EXPENSE",
    counterparty: "Lunch", categorySystemName: "food",
    description: "Lunch at canteen", accountId: null,
    currency: "EGP", date: DATE, confidenceScore: 0.95,
  };
  return accountReviewVoiceResponseV2Schema.parse({
    reviewContractVersion: "account-review/v2",
    original_transcript: originalText,
    transcript: originalText, detected_language: "en",
    transactions: [{
      ...financial, transactionRef: ADAPTER_IDS.voiceRef,
      suggestionRef: ADAPTER_IDS.suggestedRef,
      accountEvidence: accountEvidence("VOICE", originalText, name),
      toAccountEvidence: null,
      currencyEvidence: {
        state: "explicit", statedCode: "EGP", candidateCodes: ["EGP"],
        evidenceSpans: [exactSpan(
          ADAPTER_IDS.recordingKey, "transcript", originalText, "EGP"
        )],
      },
    }],
    suggestedAccounts: [{
      suggestionRef: ADAPTER_IDS.suggestedRef, name,
      type: name === "Cash" ? "CASH" : "BANK",
      currency: "EGP", institutionId: null,
      providerDisplayName: name === "Cash" ? null : "QNB",
      cardLast4: null, senderNames: [],
      transactionRefs: [ADAPTER_IDS.voiceRef],
    }],
  });
}

export function makeAdapterVoiceInput(): VoiceReviewNormalizationInput {
  const providerResponse = voiceResponse(VOICE_TEXT);
  return {
    source: "VOICE", ownerId: ADAPTER_IDS.owner, sessionId: ADAPTER_IDS.session,
    sourceRevision: "0", requestKey: ADAPTER_IDS.recordingKey,
    reviewAccountSnapshots: makeAdapterSnapshots(), categoryIdsBySystemName: categoryIds(),
    providerResponse, financialRows: providerResponse.transactions,
    originalTranscript: providerResponse.original_transcript,
    mappedTransactions: [{
      amount: 50, currency: "EGP", type: "EXPENSE",
      counterparty: "Lunch", date: new Date(DATE + "T12:00:00.000Z"),
      categoryId: ADAPTER_IDS.food, categoryDisplayName: "Food",
      confidence: 0.95, originLabel: "Voice", source: "VOICE",
      note: "Lunch at canteen", originalTranscript: VOICE_TEXT,
      detectedLanguage: "en", aiDetectedCurrency: "EGP",
    }],
    hashProvider: realNodeSha256,
  };
}

function smsResponse(body: string): AccountReviewSmsResponseV2 {
  return accountReviewSmsResponseV2Schema.parse({
    reviewContractVersion: "account-review/v2", completionStatus: "complete",
    negativeFingerprints: [], terminalFingerprints: [], unresolvedFingerprints: [],
    transactions: [{
      messageId: ADAPTER_IDS.smsId, amount: 50, currency: "EGP",
      type: "EXPENSE", counterparty: "Shop", date: DATE,
      categorySystemName: "shopping", isAtmWithdrawal: false,
      confidenceScore: 0.91, isTrusted: true,
      transactionRef: ADAPTER_IDS.smsRef,
      suggestionRef: ADAPTER_IDS.suggestedRef,
      accountEvidence: accountEvidence("SMS", body),
      toAccountEvidence: null,
      currencyEvidence: {
        state: "explicit", statedCode: "EGP", candidateCodes: ["EGP"],
        evidenceSpans: [exactSpan(ADAPTER_IDS.smsId, "body", body, "EGP")],
      },
    }],
    suggestedAccounts: [{
      suggestionRef: ADAPTER_IDS.suggestedRef, name: "QNB", type: "BANK",
      currency: "EGP", institutionId: null, providerDisplayName: "QNB",
      cardLast4: null, senderNames: ["QNB"],
      transactionRefs: [ADAPTER_IDS.smsRef],
    }],
  });
}

export function makeAdapterSmsInput(): SmsReviewNormalizationInput {
  const providerResponse = smsResponse(SMS_BODY);
  return {
    source: "SMS", ownerId: ADAPTER_IDS.owner, sessionId: ADAPTER_IDS.session,
    sourceRevision: "0", requestKey: "transport-chunk-1",
    reviewAccountSnapshots: makeAdapterSnapshots(), categoryIdsBySystemName: categoryIds(),
    financialRows: providerResponse.transactions, providerResponse,
    mappedTransactions: [{
      amount: 50, currency: "EGP", type: "EXPENSE",
      date: new Date(DATE + "T12:00:00.000Z"),
      categoryId: ADAPTER_IDS.shopping, categoryDisplayName: "Shopping",
      confidence: 0.91, originLabel: "QNB", source: "SMS",
      smsFingerprint: ADAPTER_IDS.fingerprint, senderDisplayName: "QNB",
      rawSmsBody: SMS_BODY, isAtmWithdrawal: false,
    }],
    submittedMessages: [{
      id: ADAPTER_IDS.smsId, body: SMS_BODY, sender: "QNB",
      smsFingerprint: ADAPTER_IDS.fingerprint,
    }],
    hashProvider: realNodeSha256,
  };
}

export function makeAdapterVoiceCashInput(): VoiceReviewNormalizationInput {
  const input = makeAdapterVoiceInput();
  const text = "Paid Cash 50 EGP for lunch";
  const providerResponse = voiceResponse(text, "Cash");
  return {
    ...input, originalTranscript: text,
    financialRows: providerResponse.transactions, providerResponse,
    mappedTransactions: input.mappedTransactions.map((tx) => ({
      ...tx, originalTranscript: text,
    })),
  };
}

export function makeAdapterAtmInput(): SmsReviewNormalizationInput {
  const input = makeAdapterSmsInput();
  const body = "QNB ATM withdrawal EGP 50 to Cash";
  const response = smsResponse(body);
  const base = response.transactions[0];
  const mapped = input.mappedTransactions[0];
  const submitted = input.submittedMessages[0];
  if (!base || !mapped || !submitted) throw new Error("Missing SMS ATM input");
  const cashEvidence: AccountReviewAccountEvidence = {
    state: "explicit", name: "Cash", type: "CASH",
    institutionId: null, providerDisplayName: null, cardLast4: null,
    evidenceSpans: [exactSpan(ADAPTER_IDS.smsId, "body", body, "Cash")],
    candidateAccountIds: [ADAPTER_IDS.cash],
  };
  const row = { ...base, isAtmWithdrawal: true, toAccountEvidence: cashEvidence };
  return {
    ...input, financialRows: [row],
    providerResponse: { ...response, transactions: [row] },
    mappedTransactions: [{ ...mapped, rawSmsBody: body, isAtmWithdrawal: true }],
    submittedMessages: [{ ...submitted, body }],
  };
}

export function makeAdapterRepeatedVoiceInput(): VoiceReviewNormalizationInput {
  const input = makeAdapterVoiceInput();
  const text = "Paid QNB 50 EGP for lunch twice";
  const original = voiceResponse(text);
  const first = original.transactions[0];
  if (!first) throw new Error("Missing Voice duplicate fixture");
  const second = { ...first, transactionRef: "voice-duplicate-2" };
  return {
    ...input, originalTranscript: text,
    financialRows: [first, second],
    providerResponse: {
      ...original, transactions: [first, second],
      suggestedAccounts: original.suggestedAccounts.map((group) => ({
        ...group, transactionRefs: [first.transactionRef, second.transactionRef],
      })),
    },
    mappedTransactions: input.mappedTransactions.map((mapped) => ({
      ...mapped, originalTranscript: text,
    })).concat(input.mappedTransactions.map((mapped) => ({
      ...mapped, originalTranscript: text,
    }))),
  };
}

/** Accepted two-message final SMS batch: one transaction per original fingerprint. */
export function makeAdapterTwoSmsInput(): SmsReviewNormalizationInput {
  const input = makeAdapterSmsInput();
  const response = accountReviewSmsResponseV2Schema.parse(input.providerResponse);
  const first = response.transactions[0];
  const firstMapped = input.mappedTransactions[0];
  if (!first || !firstMapped) throw new Error("Missing original first SMS");
  const body = "QNB purchase EGP 25";
  const second = {
    ...first, messageId: ADAPTER_IDS.secondSmsId,
    transactionRef: "sms-2", amount: 25,
    accountEvidence: {
      ...first.accountEvidence,
      evidenceSpans: [exactSpan(ADAPTER_IDS.secondSmsId, "body", body, "QNB")],
    },
    currencyEvidence: {
      ...first.currencyEvidence,
      evidenceSpans: [exactSpan(ADAPTER_IDS.secondSmsId, "body", body, "EGP")],
    },
  };
  return {
    ...input, financialRows: [first, second],
    providerResponse: {
      ...response, transactions: [first, second],
      suggestedAccounts: response.suggestedAccounts.map((suggestion) => ({
        ...suggestion, transactionRefs: [first.transactionRef, second.transactionRef],
      })),
    },
    mappedTransactions: [firstMapped, {
      ...firstMapped, amount: 25,
      smsFingerprint: ADAPTER_IDS.secondFingerprint, rawSmsBody: body,
    }],
    submittedMessages: [...input.submittedMessages, {
      id: ADAPTER_IDS.secondSmsId, sender: "QNB", body,
      smsFingerprint: ADAPTER_IDS.secondFingerprint,
    }],
  };
}

export function makeAdapterSmsCashSourceInput(): SmsReviewNormalizationInput {
  const input = makeAdapterSmsInput();
  const response = accountReviewSmsResponseV2Schema.parse(input.providerResponse);
  const first = response.transactions[0];
  const mapped = input.mappedTransactions[0];
  const submitted = input.submittedMessages[0];
  if (!first || !mapped || !submitted) throw new Error("Missing Cash source");
  const body = "Cash purchase EGP 50";
  const cashSource = accountEvidence("SMS", body, "Cash");
  const row = {
    ...first, suggestionRef: null, accountEvidence: cashSource,
    currencyEvidence: {
      ...first.currencyEvidence,
      evidenceSpans: [exactSpan(ADAPTER_IDS.smsId, "body", body, "EGP")],
    },
  };
  return {
    ...input, financialRows: [row],
    providerResponse: { ...response, transactions: [row], suggestedAccounts: [] },
    submittedMessages: [{ ...submitted, body, sender: "Cash" }],
    mappedTransactions: [{
      ...mapped, rawSmsBody: body, originLabel: "Cash", senderDisplayName: "Cash",
    }],
  };
}

/** Current T010 account metadata may move while a pinned parse is in flight. */
export type AdapterSnapshotChange = "added" | "metadata" | "preferred";

function projectCurrentPublicAccount(
  account: AccountReviewOwnedContext["accounts"][number]
): AccountReviewAccountContext {
  return {
    id: account.id, name: account.name, currency: account.currency,
    type: account.type, institutionId: account.institutionId,
    providerDisplayName: account.providerDisplayName,
    cardLast4: account.cardLast4, senderNames: [...account.senderNames],
  };
}

function changedCurrentAccounts(
  original: AccountReviewOwnedContext["accounts"],
  kind: AdapterSnapshotChange
): AccountReviewOwnedContext["accounts"] {
  if (kind === "added") return [...original, {
    id: "00000000-0000-4000-8000-000000000206",
    name: "Another wallet", type: "DIGITAL_WALLET", currency: "USD",
    institutionId: null, providerDisplayName: null, cardLast4: null,
    senderNames: [], isDefault: false,
  }];
  if (kind !== "metadata") return original;
  return original.map((account) =>
    account.id === ADAPTER_IDS.bank
      ? {
          ...account, name: "QNB updated", providerDisplayName: "QNB new",
          cardLast4: "4321", senderNames: ["QNB-new"], isDefault: true,
        }
      : { ...account, isDefault: false }
  );
}

/** A valid refreshed same-owner snapshot; never mutates the captured input. */
export function makeSameOwnerChangedSnapshots(
  kind: AdapterSnapshotChange
): AccountReviewOwnedContext {
  const original = makeAdapterSnapshots();
  const accounts = changedCurrentAccounts(original.accounts, kind);
  const preferredCurrency = kind === "preferred" ? "USD" : original.preferredCurrency;
  return {
    ...original, accounts, preferredCurrency,
    providerContext: accountReviewRequestContextSchema.parse({
      reviewContractVersion: "account-review/v2",
      preferredCurrency, accounts: accounts.map(projectCurrentPublicAccount),
    }),
  };
}

/** Only valid original financial omission may use captured preferred EGP. */
export function makeAdapterSmsOmittedCurrencyInput(): SmsReviewNormalizationInput {
  const input = makeAdapterSmsInput();
  const response = accountReviewSmsResponseV2Schema.parse(input.providerResponse);
  const financial = response.transactions[0];
  const mapped = input.mappedTransactions[0];
  const submitted = input.submittedMessages[0];
  if (!financial || !mapped || !submitted) {
    throw new Error("Missing original SMS financial omission fixture");
  }
  const body = "QNB purchase 50";
  const row: AccountReviewSmsResponseV2["transactions"][number] = {
    ...financial, currency: null, suggestionRef: null,
    currencyEvidence: {
      state: "omitted", statedCode: null,
      candidateCodes: [], evidenceSpans: [],
    },
  };
  return {
    ...input, financialRows: [row],
    providerResponse: accountReviewSmsResponseV2Schema.parse({
      ...response, transactions: [row], suggestedAccounts: [],
    }),
    submittedMessages: [{ ...submitted, body }],
    mappedTransactions: [{ ...mapped, rawSmsBody: body }],
  };
}
