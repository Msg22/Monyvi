/**
 * #395 T007 — tests-first Voice/SMS v2 contract and legacy safeguards.
 *
 * Actual parser and orchestrator functions remain the SUT. Typed canonical
 * advisory is checked only at the raw SMS response boundary; complete review
 * sessions must be validated at the owner-aware parser/orchestrator boundary.
 * No provider, account, SMS queue, or financial database is contacted.
 */
import type { Session } from "@supabase/supabase-js";
import { accountReviewSessionSchema, type AccountReviewSession } from "@monyvi/logic";

import {
  makeVoiceV1Response,
  REVIEW_VOICE_TRANSCRIPT,
  REVIEW_WIRE_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import {
  PARSER_TEST_CATEGORY_IDS,
  PARSER_TEST_VOICE_REQUEST_KEY,
  makeReviewAccountSnapshots,
  voiceOptions,
  explicitVoiceResponse,
  unmatchedVoiceResponse,
} from "./account-review-parser-test-fixtures";

// Keep these lazy mock* captures local for Jest's factory-hoist restrictions.
const mockCategoryIds = PARSER_TEST_CATEGORY_IDS;
const mockVoiceRequestKey = PARSER_TEST_VOICE_REQUEST_KEY;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const mockCurrentOwnerId = REVIEW_WIRE_IDS.ownerId;

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
  getRequiredCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentOwnerId),
  getCurrentUserDataScope: (): Promise<{ readonly userId: string }> =>
    Promise.resolve({ userId: mockCurrentOwnerId }),
}));

jest.mock("@/config/e2e-test-config", () => ({
  shouldBlockUnsafeSmsParserConfiguration: (): boolean => false,
  shouldUseFixtureSmsParser: (): boolean => false,
  shouldUseHybridSmsParser: (): boolean => false,
  shouldUseLocalSmsParser: (): boolean => false,
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
  const real = jest.requireActual<typeof import("@monyvi/logic")>("@monyvi/logic");
  return {
    ...real,
    buildCategoryMap: jest.fn().mockImplementation((
      records: readonly {
        readonly id: string;
        readonly systemName: string;
        readonly displayName: string;
      }[]
    ) => {
      // Real SMS context supplies the category collection; do not substitute
      // an unconditional fake ID unrelated to the submitted category.
      if (records.length > 0) return real.buildCategoryMap(records);
      // Legacy Voice input supplies its category text separately; give the
      // preexisting Voice test a bounded synthetic category-map fixture.
      return new Map([
        ["food", { name: "Food", id: mockCategoryIds.food }],
        ["shopping", { name: "Shopping", id: mockCategoryIds.shopping }],
      ]);
    }),
  };
});

import {
  isVoiceParserError,
  parseVoiceWithAi,
} from "@/services/ai-voice-parser-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireReviewSession(result: unknown): AccountReviewSession {
  if (!isRecord(result)) throw new Error("Expected typed review parser success");
  const parsed = accountReviewSessionSchema.safeParse(result.reviewSession);
  if (!parsed.success) {
    throw new Error("Missing complete canonical reviewSession on review-mode success");
  }
  return parsed.data;
}

function assertSessionBasics(session: AccountReviewSession, source: "VOICE" | "SMS"): void {
  expect(session.ownerId).toBe(REVIEW_WIRE_IDS.ownerId);
  expect(session.source).toBe(source);
  expect(session.sessionId).toMatch(UUID_PATTERN);
  expect(session.preferredCurrency).toBe("EGP");
  expect(session.sourceRevision).toMatch(/^(0|[1-9][0-9]*)$/);
  expect(session.revision).toMatch(/^(0|[1-9][0-9]*)$/);
  expect(session.operationGeneration).toMatch(/^(0|[1-9][0-9]*)$/);
  expect(session.saveIntent).toBeNull();
  for (const row of session.rows) {
    expect(row.rowId).toMatch(UUID_PATTERN);
    expect(row.transaction.categoryId).toMatch(UUID_PATTERN);
    expect(row.amountDecimal).toBe("50");
    expect(row.transaction.amount).toBe(50);
    expect(row.transaction.date).toBeInstanceOf(Date);
    expect(row.sourceRef).not.toBe("");
    expect(row.hasUserAccountOverride).toBe(false);
    expect(row.hasUserCurrencyOverride).toBe(false);
  }
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
    mockInvoke.mockResolvedValueOnce({ data: explicitVoiceResponse(), error: null });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-voice");
    expect(appendedValues("requestKey")).toEqual([mockVoiceRequestKey]);
    expect(appendedValues("reviewContractVersion")).toEqual(["account-review/v2"]);
    const values = appendedValues("accounts");
    expect(values).toHaveLength(1);
    const submitted: unknown = JSON.parse(String(values[0]));
    expect(submitted).toEqual(makeReviewAccountSnapshots().providerContext.accounts);
    const text = String(values[0]);
    expect(text).toContain('"cardLast4":"0007"');
    expect(text).not.toMatch(/"balance"|"financial_revision"|"accountNumber"|"cardNumber"|"isDefault"|"ownerId"/);
    requireReviewSession(result);
  });
  it("keeps valid financial content plus exact explicit evidence and a shared suggestion", async () => {
    mockInvoke.mockResolvedValueOnce({ data: explicitVoiceResponse(), error: null });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Expected accepted Voice financial row");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(50);
    expect(result.transactions[0]?.categoryId).toBe(mockCategoryIds.food);
    const session = requireReviewSession(result);
    assertSessionBasics(session, "VOICE");
    expect(session.rows).toHaveLength(1);
    const row = session.rows[0];
    if (!row) throw new Error("Expected complete normalized Voice row");
    expect(row.transaction.categoryId).toBe(mockCategoryIds.food);
    expect(row.accountEvidence.state).toBe("explicit");
    expect(row.accountEvidence.evidenceSpans[0]?.sourceRef).toBe(mockVoiceRequestKey);
    for (const span of row.accountEvidence.evidenceSpans) {
      expect(REVIEW_VOICE_TRANSCRIPT.slice(span.start, span.end)).toBe(span.text);
    }
    expect(row.currency).toEqual({ state: "known", code: "EGP", origin: "explicit" });
    expect(row.sourceFingerprint).toBeNull();
    expect(session.groups.every((group) => /^[0-9a-f]{64}$/.test(group.evidenceKey)))
      .toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
  it("preserves ambiguous Voice currency as unconfirmed instead of applying preferred EGP", async () => {
    const base = explicitVoiceResponse();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...base,
        suggestedAccounts: [],
        transactions: [{
          ...base.transactions[0],
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
    if (isVoiceParserError(result)) throw new Error("Valid uncertain financial row was lost");
    expect(result.transactions).toHaveLength(1);
    const session = requireReviewSession(result);
    assertSessionBasics(session, "VOICE");
    const row = session.rows[0];
    expect(row?.currency).toEqual({
      state: "unconfirmed",
      reason: "ambiguous",
      statedCode: null,
      candidateCodes: ["EGP", "USD"],
      evidenceSpans: [],
    });
    expect(row?.assignment.state).toBe("unresolved");
    expect(row?.selected).toBe(false);
    expect(row?.reviewReasons).toContain("currency_confirmation_needed");
    expect(session.groups.filter((group) => group.status === "confirmed")).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
  it("does not interpret old-server v1 null provenance as confirmed v2 omission", async () => {
    mockInvoke.mockResolvedValueOnce({ data: makeVoiceV1Response(), error: null });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Legacy financial response was lost");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(50);
    const session = requireReviewSession(result);
    assertSessionBasics(session, "VOICE");
    expect(session.rows[0]?.currency.state).toBe("unconfirmed");
    if (session.rows[0]?.currency.state === "unconfirmed") {
      expect(session.rows[0].currency.reason).toBe("legacy_unknown");
    }
    expect(session.rows[0]?.assignment.state).toBe("unresolved");
    expect(session.rows[0]?.reviewReasons).toContain("currency_confirmation_needed");
    expect(session.rows[0]?.selected).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
  it("keeps a valid financial row unresolved on malformed advisory evidence without another Gemini call", async () => {
    const response = explicitVoiceResponse();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        transactions: [{
          ...response.transactions[0],
          accountEvidence: {
            ...response.transactions[0].accountEvidence,
            evidenceSpans: [{
              sourceRef: "wrong", field: "transcript", start: 1, end: 3, text: "QNB",
            }],
          },
          currencyEvidence: {
            state: "omitted", statedCode: "EGP", candidateCodes: ["EGP"], evidenceSpans: [],
          },
        }],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Malformed advisory erased valid finance");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(50);
    const session = requireReviewSession(result);
    assertSessionBasics(session, "VOICE");
    const row = session.rows[0];
    expect(row?.currency.state).toBe("unconfirmed");
    expect(row?.assignment.state).toBe("unresolved");
    expect(row?.reviewReasons).toContain("account_evidence_invalid");
    expect(row?.selected).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify([...mockLoggerError.mock.calls, ...mockLoggerWarn.mock.calls]);
    expect(logged).not.toContain(REVIEW_VOICE_TRANSCRIPT);
    expect(logged).not.toContain("Lunch at the canteen");
  });
  it("builds a pending shared Voice group only from unmatched grounded institution evidence", async () => {
    const response = unmatchedVoiceResponse();
    mockInvoke.mockResolvedValueOnce({ data: response, error: null });
    const result = await parseVoiceWithAi(voiceOptions());
    const session = requireReviewSession(result);
    assertSessionBasics(session, "VOICE");
    expect(session.groups).toHaveLength(1);
    const group = session.groups[0];
    const row = session.rows[0];
    if (!group || !row) throw new Error("Missing grounded shared review group");
    expect(group.name).toBe("CIB");
    expect(group.type).toBe("BANK");
    expect(group.currency).toBe("EGP");
    expect(group.status).toBe("pending");
    expect(group.confirmedIdentityRevision).toBeNull();
    expect(group.evidenceKey).toMatch(/^[0-9a-f]{64}$/);
    expect(group.groupId).toMatch(UUID_PATTERN);
    expect(group.linkedRowIds).toEqual([row.rowId]);
    expect(row.assignment).toEqual({
      state: "suggested",
      accountId: null,
      groupId: group.groupId,
      groupRevision: group.revision,
      confirmation: "pending",
    });
    expect(row.accountEvidence.name).toBe("CIB");
    expect(row.selected).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("treats proven v2 Voice currency omission as preferred currency without guessing account evidence", async () => {
    const response = explicitVoiceResponse();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        suggestedAccounts: [],
        transactions: [{
          ...response.transactions[0],
          suggestionRef: null,
          currency: null,
          accountEvidence: {
            state: "absent", name: null, type: null, institutionId: null,
            providerDisplayName: null, cardLast4: null,
            evidenceSpans: [], candidateAccountIds: [],
          },
          currencyEvidence: {
            state: "omitted", statedCode: null, candidateCodes: [], evidenceSpans: [],
          },
        }],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    const session = requireReviewSession(result);
    expect(session.rows).toHaveLength(1);
    expect(session.rows[0]?.currency).toEqual({
      state: "known", code: "EGP", origin: "preferred_omission",
    });
    expect(session.rows[0]?.accountEvidence.state).toBe("absent");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("blocks conflicting v2 Voice currency and keeps a valid financial row", async () => {
    const base = explicitVoiceResponse();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...base,
        suggestedAccounts: [],
        transactions: [{
          ...base.transactions[0],
          suggestionRef: null,
          currency: null,
          currencyEvidence: {
            state: "conflicting", statedCode: null,
            candidateCodes: ["EGP", "USD"], evidenceSpans: [],
          },
        }],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    if (isVoiceParserError(result)) throw new Error("Conflicting advice erased financial row");
    expect(result.transactions[0]?.amount).toBe(50);
    const session = requireReviewSession(result);
    const row = session.rows[0];
    expect(row?.currency.state).toBe("unconfirmed");
    if (row?.currency.state === "unconfirmed") {
      expect(row.currency.reason).toBe("conflicting");
    }
    expect(row?.assignment.state).toBe("unresolved");
    expect(row?.selected).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("keeps no-options v1 Voice parsing unchanged with reviewSession absent", async () => {
    mockInvoke.mockResolvedValueOnce({ data: makeVoiceV1Response(), error: null });
    const result = await parseVoiceWithAi(voiceOptions(false));
    if (isVoiceParserError(result)) throw new Error("Legacy Voice financial row lost");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(50);
    expect(result).not.toHaveProperty("reviewSession");
    expect(appendedValues("reviewContractVersion")).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed core financial data while preserving existing no-retry semantics", async () => {
    const response = explicitVoiceResponse();
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
