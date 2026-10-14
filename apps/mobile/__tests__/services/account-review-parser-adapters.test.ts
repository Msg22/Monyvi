/**
 * #395 T007 — original-request parser integration / advisory adapter tests.
 *
 * Deliberately uses the real parser entry points and mocked single Edge
 * transports, rather than inventing a new provider or duplicating review rules.
 * The new T012/T013/T014 adapters must preserve typed review evidence somewhere
 * in the returned result; nested discovery below avoids freezing a new mobile
 * presentation shape that T004 did not name.
 */
import type { Session } from "@supabase/supabase-js";
import type { CategoryTreeSource } from "@monyvi/logic";
import type { AccountType, CurrencyType } from "@monyvi/db";

import {
  makeSmsV1Response,
  makeSmsV2Response,
  makeVoiceV1Response,
  makeVoiceV2Response,
  REVIEW_SMS_BODY,
  REVIEW_VOICE_TRANSCRIPT,
  REVIEW_WIRE_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";

interface MockFunctionResponse {
  readonly data: unknown;
  readonly error: unknown;
}
interface MockFunctionOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

const mockInvoke = jest.fn<
  Promise<MockFunctionResponse>,
  [name: string, options: MockFunctionOptions]
>();
const mockScopedUser = jest.fn<Promise<void>, [userId: string]>();
const mockLoggerWarn = jest.fn<void, [message: string, details?: unknown]>();
const mockLoggerError = jest.fn<void, [message: string, error?: unknown, details?: unknown]>();

const mockStableSession: Session = {
  access_token: "synthetic-test-token",
  refresh_token: "synthetic-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: REVIEW_WIRE_IDS.ownerId,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-14T00:00:00.000Z",
  },
};

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => "00000000-0000-4000-8000-000000000199",
  digestStringAsync: (): Promise<string> => Promise.resolve("f".repeat(64)),
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
}));

jest.mock("@/services/supabase", () => ({
  getStableAuthSession: (): Promise<{
    data: { session: Session };
    error: null;
  }> => Promise.resolve({ data: { session: mockStableSession }, error: null }),
  supabase: {
    functions: {
      invoke: (
        name: string,
        options: MockFunctionOptions
      ): Promise<MockFunctionResponse> => mockInvoke(name, options),
    },
  },
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (userId: string): Promise<void> => mockScopedUser(userId),
}));

jest.mock("@/config/e2e-test-config", () => ({
  shouldBlockUnsafeSmsParserConfiguration: () => false,
  shouldUseFixtureSmsParser: () => false,
}));

jest.mock("@/config/sms-safeguard-qa-config", () => ({
  getSmsSafeguardQaConfig: () => ({
    enabled: false,
    profileId: null,
    runId: null,
  }),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: (message: string, details?: unknown): void =>
      mockLoggerWarn(message, details),
    error: (message: string, error?: unknown, details?: unknown): void =>
      mockLoggerError(message, error, details),
  },
}));

jest.mock("@monyvi/logic", () => {
  const real = jest.requireActual<Record<string, unknown>>("@monyvi/logic");
  return {
    ...real,
    buildCategoryMap: jest.fn().mockReturnValue(
      new Map([
        ["food", { id: "category-food", displayName: "Food" }],
        ["shopping", { id: "category-shopping", displayName: "Shopping" }],
      ])
    ),
    parseCategory: jest.fn().mockImplementation((systemName: string) => ({
      id: "category-" + systemName,
      displayName: systemName,
    })),
  };
});

import {
  isVoiceParserError,
  parseVoiceWithAi,
  type AiVoiceParserOptions,
} from "@/services/ai-voice-parser-service";
import {
  parseSmsWithAi,
  type SmsCandidate,
  type ParseSmsContext,
} from "@/services/ai-sms-parser-service";
import { parseAiResponse } from "@/services/ai-sms-parser-response";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedValues(value: unknown, key: string): readonly unknown[] {
  if (Array.isArray(value)) return value.flatMap((item) => nestedValues(item, key));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([field, item]) =>
    field === key ? [item, ...nestedValues(item, key)] : nestedValues(item, key)
  );
}

function currencyEvidenceStates(value: unknown): readonly string[] {
  return nestedValues(value, "currencyEvidence").flatMap((candidate) =>
    isRecord(candidate) && typeof candidate.state === "string"
      ? [candidate.state]
      : []
  );
}

function accountEvidenceStates(value: unknown): readonly string[] {
  return nestedValues(value, "accountEvidence").flatMap((candidate) =>
    isRecord(candidate) && typeof candidate.state === "string"
      ? [candidate.state]
      : []
  );
}

function hasSuggestionReference(value: unknown, expectedRef: string): boolean {
  return nestedValues(value, "suggestionRef").includes(expectedRef);
}

/** Synthetic T004 request context, using only EXISTING domain/input types.
 * Strict review-schema behavior remains the separate T005 responsibility.
 */
function makeReviewRequestContext() {
  const currency: CurrencyType = "EGP";
  const bankType: AccountType = "BANK";
  const cashType: AccountType = "CASH";
  return {
    reviewContractVersion: "account-review/v2" as const,
    preferredCurrency: currency,
    accounts: [
      {
        id: REVIEW_WIRE_IDS.bankAccountId,
        name: "QNB salary",
        currency,
        type: bankType,
        institutionId: null,
        providerDisplayName: "QNB",
        cardLast4: "0007",
        senderNames: ["QNB"],
      },
      {
        id: REVIEW_WIRE_IDS.cashAccountId,
        name: "Cash",
        currency,
        type: cashType,
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        senderNames: [],
      },
    ],
  };
}

function voiceOptions() {
  const review = makeReviewRequestContext();
  return {
    audioUri: "file:///synthetic/recording.m4a",
    requestKey: REVIEW_WIRE_IDS.voiceRequestKey,
    callerTimeZone: "Africa/Cairo",
    categories: "Food/Shopping",
    accounts: review.accounts,
    categoryRecords: [],
    preferredCurrency: review.preferredCurrency,
    // T004 parser request discriminator; account and preference fields above
    // already use the normative context shape without a copied wrapper.
    reviewContractVersion: review.reviewContractVersion,
  } satisfies AiVoiceParserOptions & {
    readonly reviewContractVersion: "account-review/v2";
  };
}

function smsCategories(): readonly CategoryTreeSource[] {
  return [
    {
      id: "category-shopping",
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      parentId: undefined,
      type: "EXPENSE",
    },
  ];
}

function smsContext() {
  return {
    categories: smsCategories(),
    supportedCurrencies: ["EGP", "USD"],
    ...makeReviewRequestContext(),
  } satisfies ParseSmsContext & ReturnType<typeof makeReviewRequestContext>;
}

function smsCandidates(): readonly SmsCandidate[] {
  return [
    {
      message: {
        id: REVIEW_WIRE_IDS.smsMessageId,
        address: "QNB",
        body: REVIEW_SMS_BODY,
        date: 1791979200000,
        read: false,
      },
      smsFingerprint: "synthetic-fingerprint-1",
    },
  ];
}

function invokeBodyText(): string {
  const options = mockInvoke.mock.calls[0]?.[1];
  const body = options?.body;
  if (isRecord(body)) return JSON.stringify(body);
  return String(body);
}

describe("#395 T007 — original Voice parser with advisory review v2", () => {
  let appendSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockScopedUser.mockResolvedValue(undefined);
    appendSpy = jest.spyOn(FormData.prototype, "append");
  });

  afterEach(() => {
    appendSpy.mockRestore();
  });

  function appendedValues(key: string): readonly unknown[] {
    return appendSpy.mock.calls
      .filter((args: readonly unknown[]) => args[0] === key)
      .map((args: readonly unknown[]) => args[1]);
  }

  it("sends validated review context in the original Gemini request exactly once, without private balance/card data", async () => {
    mockInvoke.mockResolvedValueOnce({ data: makeVoiceV2Response(), error: null });

    const result = await parseVoiceWithAi(voiceOptions());

    expect(isVoiceParserError(result)).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-voice");
    expect(appendedValues("requestKey")).toEqual([REVIEW_WIRE_IDS.voiceRequestKey]);
    expect(appendedValues("reviewContractVersion")).toEqual(["account-review/v2"]);
    const sentAccountContext = appendedValues("accounts");
    expect(sentAccountContext).toHaveLength(1);
    const serializedContext = String(sentAccountContext[0]);
    expect(serializedContext).toContain(REVIEW_WIRE_IDS.bankAccountId);
    expect(serializedContext).toContain('"cardLast4":"0007"');
    expect(serializedContext).not.toMatch(/"balance":|"financial_revision":|"accountNumber":|"cardNumber":/);
  });

  it("keeps valid financial content plus exact explicit evidence and a shared suggestion", async () => {
    mockInvoke.mockResolvedValueOnce({ data: makeVoiceV2Response(), error: null });
    const result = await parseVoiceWithAi(voiceOptions());

    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Expected accepted Voice financial row");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(50);
    expect(result.transactions[0].categoryId).toBe("category-food");
    expect(currencyEvidenceStates(result)).toContain("explicit");
    expect(accountEvidenceStates(result)).toContain("explicit");
    expect(hasSuggestionReference(result, REVIEW_WIRE_IDS.suggestionRef)).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("preserves ambiguous Voice currency as unconfirmed instead of applying preferred EGP", async () => {
    const response = makeVoiceV2Response();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        suggestedAccounts: [],
        transactions: [{
          ...response.transactions[0],
          suggestionRef: null,
          currency: null,
          currencyEvidence: {
            state: "ambiguous",
            statedCode: null,
            candidateCodes: ["EGP", "USD"],
            evidenceSpans: [],
          },
        }],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Valid unconfirmed currency cannot erase transaction");
    expect(result.transactions).toHaveLength(1);
    expect(currencyEvidenceStates(result)).toContain("ambiguous");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("does not interpret old-server v1 null provenance as confirmed v2 omission", async () => {
    mockInvoke.mockResolvedValueOnce({ data: makeVoiceV1Response(), error: null });
    const result = await parseVoiceWithAi(voiceOptions());

    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Legacy financial response was lost");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(50);
    expect(currencyEvidenceStates(result)).not.toContain("omitted");
    expect(accountEvidenceStates(result)).not.toContain("absent");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("keeps a valid financial row unresolved on malformed advisory evidence without another Gemini call", async () => {
    const response = makeVoiceV2Response();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        transactions: [{
          ...response.transactions[0],
          accountEvidence: {
            ...response.transactions[0].accountEvidence,
            evidenceSpans: [{ sourceRef: "wrong", field: "transcript", start: 1, end: 3, text: "QNB" }],
          },
          currencyEvidence: {
            state: "omitted",
            statedCode: "EGP",
            candidateCodes: ["EGP"],
            evidenceSpans: [],
          },
        }],
      },
      error: null,
    });

    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Malformed advisory must not erase financial row");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(50);
    expect(currencyEvidenceStates(result)).toContain("unknown");
    expect(accountEvidenceStates(result)).toContain("uncertain");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify([
      ...mockLoggerError.mock.calls,
      ...mockLoggerWarn.mock.calls,
    ]);
    expect(logged).not.toContain(REVIEW_VOICE_TRANSCRIPT);
    expect(logged).not.toContain("Lunch at the canteen");
  });

  it("rejects malformed core financial data while preserving existing no-retry semantics", async () => {
    const response = makeVoiceV2Response();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        transactions: [{ ...response.transactions[0], amount: Number.POSITIVE_INFINITY }],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});

describe("#395 T007 — original SMS parser and DeepInfra advisory compatibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScopedUser.mockResolvedValue(undefined);
  });

  it("preserves valid v2 financial rows, completion metadata, and source correlation", () => {
    const result = parseAiResponse(
      makeSmsV2Response(),
      new Set(["synthetic-fingerprint-1"])
    );
    expect(result.hasError).toBe(false);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].messageId).toBe(REVIEW_WIRE_IDS.smsMessageId);
    expect(result.transactions[0].amount).toBe(50);
    expect(result.terminalFingerprints).toEqual([]);
    expect(result.unresolvedFingerprints).toEqual([]);
    expect(currencyEvidenceStates(result)).toContain("explicit");
    expect(accountEvidenceStates(result)).toContain("explicit");
  });

  it("retains an otherwise valid SMS row with explicitly unknown v2 currency (null is not an invalid v1 currency)", () => {
    const response = makeSmsV2Response();
    const result = parseAiResponse(
      {
        ...response,
        suggestedAccounts: [],
        transactions: [{
          ...response.transactions[0],
          currency: null,
          suggestionRef: null,
          currencyEvidence: {
            state: "unknown",
            statedCode: null,
            candidateCodes: [],
            evidenceSpans: [],
          },
        }],
      },
      new Set(["synthetic-fingerprint-1"])
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(50);
    expect(result.transactions[0].categorySystemName).toBe("shopping");
    expect(result.transactions[0].isAtmWithdrawal).toBe(false);
    expect(currencyEvidenceStates(result)).toContain("unknown");
    expect(result.durableNegativeFingerprints).toEqual([]);
  });

  it("keeps v1 valid financial rows and does not fabricate confirmed/omitted v2 evidence", () => {
    const result = parseAiResponse(
      makeSmsV1Response(),
      new Set(["synthetic-fingerprint-1"])
    );
    expect(result.transactions).toHaveLength(1);
    expect(result.hasError).toBe(false);
    expect(currencyEvidenceStates(result)).not.toContain("omitted");
    expect(hasSuggestionReference(result, REVIEW_WIRE_IDS.suggestionRef)).toBe(false);
  });

  it("sends a scoped account-review context alongside the existing one-chunk SMS request", async () => {
    mockInvoke.mockResolvedValueOnce({ data: makeSmsV2Response(), error: null });
    const result = await parseSmsWithAi(
      smsCandidates(),
      smsContext(),
      undefined,
      undefined,
      REVIEW_WIRE_IDS.ownerId,
      { scanSessionId: "synthetic-scan-1", scanKind: "incremental", scanStartedAtMs: 1791979200000 },
      "synthetic-original-request"
    );

    expect(result.transactions).toHaveLength(1);
    expect(result.hasError).toBe(false);
    expect(result.transactions[0].categoryId).toBe("category-shopping");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-sms");
    const body = invokeBodyText();
    expect(body).toContain("account-review/v2");
    expect(body).toContain(REVIEW_WIRE_IDS.bankAccountId);
    expect(body).toContain(REVIEW_WIRE_IDS.smsMessageId);
    expect(body).not.toMatch(/"balance":|"financial_revision":|"accountNumber":|"cardNumber":/);
  });

  it("retains valid correlated SMS financial content as unresolved on bad advisory and does not add provider calls", async () => {
    const response = makeSmsV2Response();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        transactions: [{
          ...response.transactions[0],
          accountEvidence: {
            ...response.transactions[0].accountEvidence,
            evidenceSpans: [{
              sourceRef: "different-message",
              field: "body",
              start: 0,
              end: 3,
              text: "QNB",
            }],
          },
          currencyEvidence: { state: "omitted", statedCode: "EGP", candidateCodes: [], evidenceSpans: [] },
        }],
      },
      error: null,
    });

    const result = await parseSmsWithAi(smsCandidates(), smsContext());
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(50);
    expect(currencyEvidenceStates(result)).toContain("unknown");
    expect(accountEvidenceStates(result)).toContain("uncertain");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify([
      ...mockLoggerWarn.mock.calls,
      ...mockLoggerError.mock.calls,
    ]);
    expect(logged).not.toContain(REVIEW_SMS_BODY);
  });

  it("does not treat unsubmitted response identities as a trusted SMS candidate or durable negative", async () => {
    const response = makeSmsV2Response();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        transactions: [{
          ...response.transactions[0],
          messageId: "not-submitted",
        }],
      },
      error: null,
    });
    const result = await parseSmsWithAi(smsCandidates(), smsContext());
    expect(result.transactions).toHaveLength(0);
    expect(result.durableNegativeFingerprints ?? []).not.toContain("synthetic-fingerprint-1");
    expect(result.unresolvedCandidates?.length ?? 0).toBeGreaterThan(0);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("retains existing capacity/quota/refusal semantics with no second provider request", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({
            reason: "burst_limit",
            availableAt: "2026-10-15T00:00:00.000Z",
          }),
          { status: 429, headers: { "content-type": "application/json" } }
        ),
      },
    });
    const result = await parseSmsWithAi(smsCandidates(), smsContext());
    expect(result.transactions).toHaveLength(0);
    expect(result.availability).toEqual({
      reason: "burst_limit",
      availableAt: "2026-10-15T00:00:00.000Z",
    });
    expect(result.unresolvedCandidates).toEqual([
      expect.objectContaining({
        candidate: smsCandidates()[0],
        reason: "capacity_limited",
        isRetryable: false,
      }),
    ]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("checks current owner before sending any provider request", async () => {
    mockScopedUser.mockRejectedValueOnce(new Error("AUTH_SCOPE_CHANGED"));
    await expect(
      parseSmsWithAi(smsCandidates(), smsContext(), undefined, undefined, REVIEW_WIRE_IDS.ownerId)
    ).rejects.toThrow("AUTH_SCOPE_CHANGED");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
