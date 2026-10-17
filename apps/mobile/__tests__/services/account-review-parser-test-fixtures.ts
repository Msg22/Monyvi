/**
 * #395 T007 synthetic Voice/SMS parser fixture builders.
 *
 * Pure, typed data only. Transport mocks, spies, and assertions stay in
 * account-review-parser-adapters.test.ts; no runtime provider or DB access.
 */
import {
  accountReviewRequestContextSchema,
  type AccountReviewRequestContext,
  type AccountReviewSmsResponseV2,
  type AccountReviewVoiceResponseV2,
  type CategoryTreeSource,
} from "@monyvi/logic";
import type { AccountReviewAccountSnapshots } from "@/services/account-review-read-model-service";
import type { AiVoiceParserOptions } from "@/services/ai-voice-parser-service";
import type {
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";
import {
  makeEvidenceSpan,
  makeSmsV2Response,
  makeVoiceV2Response,
  REVIEW_SMS_BODY,
  REVIEW_WIRE_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";

export const PARSER_TEST_CATEGORY_IDS = {
  food: "00000000-0000-4000-8000-000000000181",
  shopping: "00000000-0000-4000-8000-000000000182",
} as const;
export const PARSER_TEST_VOICE_REQUEST_KEY =
  "00000000-0000-4000-8000-000000000199";
export const PARSER_TEST_SMS_SESSION_ID =
  "00000000-0000-4000-8000-000000000198";
export const PARSER_TEST_SMS_REQUEST_KEY = "synthetic-original-request";
export const PARSER_TEST_SMS_FINGERPRINT = "f".repeat(64);

export function makeReviewRequestContext(): AccountReviewRequestContext {
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

export function makeReviewAccountSnapshots(): AccountReviewAccountSnapshots {
  const providerContext = makeReviewRequestContext();
  return {
    ownerId: REVIEW_WIRE_IDS.ownerId,
    preferredCurrency: providerContext.preferredCurrency,
    accounts: providerContext.accounts.map((account) => ({
      ...account,
      isDefault: account.id === REVIEW_WIRE_IDS.cashAccountId,
    })),
    providerContext,
  };
}

export function voiceOptions(reviewMode = true): AiVoiceParserOptions & {
  readonly reviewAccountSnapshots?: AccountReviewAccountSnapshots;
} {
  const snapshots = makeReviewAccountSnapshots();
  return {
    audioUri: "file:///synthetic/recording.m4a",
    requestKey: PARSER_TEST_VOICE_REQUEST_KEY,
    callerTimeZone: "Africa/Cairo",
    categories: "Food/Shopping",
    accounts: snapshots.providerContext.accounts,
    categoryRecords: [],
    preferredCurrency: snapshots.preferredCurrency,
    ...(reviewMode ? { reviewAccountSnapshots: snapshots } : {}),
  };
}

export function smsCategories(): readonly CategoryTreeSource[] {
  return [
    {
      id: PARSER_TEST_CATEGORY_IDS.shopping,
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      parentId: undefined,
      type: "EXPENSE",
    },
  ];
}

export function smsContext(reviewMode = true): ParseSmsContext & {
  readonly reviewAccountSnapshots?: AccountReviewAccountSnapshots;
} {
  return {
    categories: smsCategories(),
    supportedCurrencies: ["EGP", "USD"],
    ...(reviewMode
      ? { reviewAccountSnapshots: makeReviewAccountSnapshots() }
      : {}),
  };
}

export function smsCandidates(): readonly SmsCandidate[] {
  return [
    {
      message: {
        id: REVIEW_WIRE_IDS.smsMessageId,
        address: "QNB",
        body: REVIEW_SMS_BODY,
        date: 1791979200000,
        read: false,
      },
      smsFingerprint: PARSER_TEST_SMS_FINGERPRINT,
    },
  ];
}

export function firstSmsCandidate(): SmsCandidate {
  const candidate = smsCandidates()[0];
  if (!candidate) throw new Error("Missing submitted synthetic SMS candidate");
  return candidate;
}

function forVoiceRequest(
  response: AccountReviewVoiceResponseV2
): AccountReviewVoiceResponseV2 {
  return {
    ...response,
    transactions: response.transactions.map((row) => ({
      ...row,
      accountEvidence: {
        ...row.accountEvidence,
        evidenceSpans: row.accountEvidence.evidenceSpans.map((span) => ({
          ...span,
          sourceRef: PARSER_TEST_VOICE_REQUEST_KEY,
        })),
      },
      currencyEvidence: {
        ...row.currencyEvidence,
        evidenceSpans: row.currencyEvidence.evidenceSpans.map((span) => ({
          ...span,
          sourceRef: PARSER_TEST_VOICE_REQUEST_KEY,
        })),
      },
    })),
  };
}

export function explicitVoiceResponse(): AccountReviewVoiceResponseV2 {
  return forVoiceRequest(makeVoiceV2Response());
}

type VoiceEvidenceRow = AccountReviewVoiceResponseV2["transactions"][number];

function withCibVoiceEvidence(
  row: VoiceEvidenceRow,
  transcript: string
): VoiceEvidenceRow {
  return {
    ...row,
    accountEvidence: {
      ...row.accountEvidence,
      name: "CIB",
      providerDisplayName: "CIB",
      evidenceSpans: [
        makeEvidenceSpan(
          PARSER_TEST_VOICE_REQUEST_KEY,
          "transcript",
          transcript,
          "CIB"
        ),
      ],
    },
    currencyEvidence: {
      ...row.currencyEvidence,
      evidenceSpans: [
        makeEvidenceSpan(
          PARSER_TEST_VOICE_REQUEST_KEY,
          "transcript",
          transcript,
          "EGP"
        ),
      ],
    },
  };
}

export function unmatchedVoiceResponse(): AccountReviewVoiceResponseV2 {
  const base = explicitVoiceResponse();
  const original = "🛒 Paid CIB 50 EGP for lunch";
  const suggested = base.suggestedAccounts[0];
  if (!suggested) throw new Error("Bad synthetic fixture");
  return {
    ...base,
    transcript: "Paid CIB 50 EGP for lunch",
    original_transcript: original,
    transactions: base.transactions.map((row) =>
      withCibVoiceEvidence(row, original)
    ),
    suggestedAccounts: [
      {
        ...suggested,
        name: "CIB",
        providerDisplayName: "CIB",
        senderNames: ["CIB"],
      },
    ],
  };
}

export function trustedSmsResponse(): AccountReviewSmsResponseV2 {
  const base = makeSmsV2Response();
  return {
    ...base,
    transactions: base.transactions.map((row) => ({ ...row, isTrusted: true })),
  };
}

export function unknownSmsResponse(): AccountReviewSmsResponseV2 {
  const base = trustedSmsResponse();
  return {
    ...base,
    suggestedAccounts: [],
    transactions: base.transactions.map((row) => ({
      ...row,
      suggestionRef: null,
      currency: null,
      currencyEvidence: {
        state: "unknown",
        statedCode: null,
        candidateCodes: [],
        evidenceSpans: [],
      },
    })),
  };
}

export function unmentionedSmsCurrencyResponse(): AccountReviewSmsResponseV2 {
  const base = unknownSmsResponse();
  return {
    ...base,
    transactions: base.transactions.map((row) => ({
      ...row,
      accountEvidence: {
        state: "absent",
        name: null,
        type: null,
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        evidenceSpans: [],
        candidateAccountIds: [],
      },
      currencyEvidence: {
        state: "omitted",
        statedCode: null,
        candidateCodes: [],
        evidenceSpans: [],
      },
    })),
  };
}

type SmsEvidenceRow = AccountReviewSmsResponseV2["transactions"][number];

function withCibSmsEvidence(row: SmsEvidenceRow, body: string): SmsEvidenceRow {
  return {
    ...row,
    accountEvidence: {
      ...row.accountEvidence,
      name: "CIB",
      providerDisplayName: "CIB",
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "CIB"),
      ],
    },
    currencyEvidence: {
      ...row.currencyEvidence,
      evidenceSpans: [
        makeEvidenceSpan(REVIEW_WIRE_IDS.smsMessageId, "body", body, "EGP"),
      ],
    },
  };
}

export function unmatchedSmsCase(): {
  readonly candidates: readonly SmsCandidate[];
  readonly response: AccountReviewSmsResponseV2;
} {
  const submittedBody = "CIB purchase EGP 50";
  const sms = firstSmsCandidate();
  const base = trustedSmsResponse();
  const suggested = base.suggestedAccounts[0];
  if (!suggested) throw new Error("Bad synthetic fixture");
  const candidate: SmsCandidate = {
    ...sms,
    message: { ...sms.message, address: "CIB", body: submittedBody },
  };
  return {
    candidates: [candidate],
    response: {
      ...base,
      suggestedAccounts: [
        {
          ...suggested,
          name: "CIB",
          providerDisplayName: "CIB",
          senderNames: ["CIB"],
        },
      ],
      transactions: base.transactions.map((row) =>
        withCibSmsEvidence(row, submittedBody)
      ),
    },
  };
}

export function smsOrchestratorOptions(): {
  readonly expectedUserId: string;
  readonly requestContext: {
    readonly scanSessionId: string;
    readonly scanKind: "incremental";
    readonly scanStartedAtMs: number;
  };
  readonly requestKey: string;
} {
  return {
    expectedUserId: REVIEW_WIRE_IDS.ownerId,
    requestContext: {
      scanSessionId: PARSER_TEST_SMS_SESSION_ID,
      scanKind: "incremental",
      scanStartedAtMs: 1791979200000,
    },
    requestKey: PARSER_TEST_SMS_REQUEST_KEY,
  };
}
