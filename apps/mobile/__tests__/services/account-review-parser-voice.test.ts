/**
 * #395 T007 — tests-first Voice/SMS v2 contract and legacy safeguards.
 *
 * Actual parser and orchestrator functions remain the SUT. Typed canonical
 * advisory is checked only at the raw SMS response boundary; complete review
 * sessions must be validated at the owner-aware parser/orchestrator boundary.
 * No provider, account, SMS queue, or financial database is contacted.
 */
import type { Session } from "@supabase/supabase-js";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "@monyvi/logic";

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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const mockCurrentOwnerId = REVIEW_WIRE_IDS.ownerId;
const mockReadModelAccountSnapshots = makeReviewAccountSnapshots;

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
const mockLoggerDebug = jest.fn<void, [message: string, details?: unknown]>();
const mockLoggerWarn = jest.fn<void, [message: string, details?: unknown]>();
const mockLoggerError = jest.fn<
  void,
  [message: string, error?: unknown, details?: unknown]
>();

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

jest.mock("expo-crypto", () => {
  const crypto =
    jest.requireActual<typeof import("node:crypto")>("node:crypto");
  return {
    randomUUID: (): string => "00000000-0000-4000-8000-000000000199",
    digestStringAsync: (_algorithm: unknown, value: string): Promise<string> =>
      Promise.resolve(
        crypto.createHash("sha256").update(value, "utf8").digest("hex")
      ),
    CryptoDigestAlgorithm: { SHA256: "SHA256" },
  };
});

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
  assertExpectedCurrentUser: (userId: string): Promise<void> =>
    mockScopedUser(userId),
  getRequiredCurrentUserId: (): Promise<string> =>
    Promise.resolve(mockCurrentOwnerId),
  getCurrentUserDataScope: (): Promise<{ readonly userId: string }> =>
    Promise.resolve({ userId: mockCurrentOwnerId }),
}));

// T014-M's real adapter may re-read its current-owner snapshot. Mock ONLY
// that platform read-model boundary, never the adapter, parser or normalizer.
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (): Promise<
    ReturnType<typeof mockReadModelAccountSnapshots>
  > => Promise.resolve(mockReadModelAccountSnapshots()),
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
    debug: (message: string, details?: unknown): void =>
      mockLoggerDebug(message, details),
    info: jest.fn(),
    warn: (message: string, details?: unknown): void =>
      mockLoggerWarn(message, details),
    error: (message: string, error?: unknown, details?: unknown): void =>
      mockLoggerError(message, error, details),
  },
}));

jest.mock("@monyvi/logic", () => {
  const real =
    jest.requireActual<typeof import("@monyvi/logic")>("@monyvi/logic");
  return {
    ...real,
    buildCategoryMap: jest.fn().mockImplementation(
      (
        records: ReadonlyArray<{
          readonly id: string;
          readonly systemName: string;
          readonly displayName: string;
        }>
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
      }
    ),
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
  if (!isRecord(result))
    throw new Error("Expected typed review parser success");
  const parsed = accountReviewSessionSchema.safeParse(result.reviewSession);
  if (!parsed.success) {
    throw new Error(
      "Missing complete canonical reviewSession on review-mode success"
    );
  }
  return parsed.data;
}

function assertSessionBasics(
  session: AccountReviewSession,
  source: "VOICE" | "SMS"
): void {
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
    mockInvoke.mockResolvedValueOnce({
      data: explicitVoiceResponse(),
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-voice");
    expect(appendedValues("requestKey")).toEqual([mockVoiceRequestKey]);
    expect(appendedValues("reviewContractVersion")).toEqual([
      "account-review/v2",
    ]);
    const values = appendedValues("accounts");
    expect(values).toHaveLength(1);
    const submitted: unknown = JSON.parse(String(values[0]));
    expect(submitted).toEqual(
      makeReviewAccountSnapshots().providerContext.accounts
    );
    const text = String(values[0]);
    expect(text).toContain('"cardLast4":"0007"');
    expect(text).not.toMatch(
      /"balance"|"financial_revision"|"accountNumber"|"cardNumber"|"isDefault"|"ownerId"/
    );
    requireReviewSession(result);
  });
  it("keeps valid financial content plus exact explicit evidence and a shared suggestion", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: explicitVoiceResponse(),
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result))
      throw new Error("Expected accepted Voice financial row");
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
    expect(row.accountEvidence.evidenceSpans[0]?.sourceRef).toBe(
      mockVoiceRequestKey
    );
    for (const span of row.accountEvidence.evidenceSpans) {
      expect(REVIEW_VOICE_TRANSCRIPT.slice(span.start, span.end)).toBe(
        span.text
      );
    }
    expect(row.currency).toEqual({
      state: "known",
      code: "EGP",
      origin: "explicit",
    });
    expect(row.sourceFingerprint).toBeNull();
    expect(
      session.groups.every((group) => /^[0-9a-f]{64}$/.test(group.evidenceKey))
    ).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
  it("preserves ambiguous Voice currency as unconfirmed instead of applying preferred EGP", async () => {
    const base = explicitVoiceResponse();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...base,
        suggestedAccounts: [],
        transactions: [
          {
            ...base.transactions[0],
            suggestionRef: null,
            currency: null,
            currencyEvidence: {
              state: "ambiguous",
              statedCode: null,
              candidateCodes: ["EGP", "USD"],
              evidenceSpans: [],
            },
          },
        ],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result))
      throw new Error("Valid uncertain financial row was lost");
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
    expect(
      session.groups.filter((group) => group.status === "confirmed")
    ).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
  it("does not interpret old-server v1 null provenance as confirmed v2 omission", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: makeVoiceV1Response(),
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result))
      throw new Error("Legacy financial response was lost");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(50);
    const session = requireReviewSession(result);
    assertSessionBasics(session, "VOICE");
    expect(session.rows[0]?.currency.state).toBe("unconfirmed");
    if (session.rows[0]?.currency.state === "unconfirmed") {
      expect(session.rows[0].currency.reason).toBe("legacy_unknown");
    }
    expect(session.rows[0]?.assignment.state).toBe("unresolved");
    expect(session.rows[0]?.reviewReasons).toContain(
      "currency_confirmation_needed"
    );
    expect(session.rows[0]?.selected).toBe(false);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
  it("keeps a valid financial row unresolved on malformed advisory evidence without another Gemini call", async () => {
    const response = explicitVoiceResponse();
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...response,
        transactions: [
          {
            ...response.transactions[0],
            accountEvidence: {
              ...response.transactions[0].accountEvidence,
              evidenceSpans: [
                {
                  sourceRef: "wrong",
                  field: "transcript",
                  start: 1,
                  end: 3,
                  text: "QNB",
                },
              ],
            },
            currencyEvidence: {
              state: "omitted",
              statedCode: "EGP",
              candidateCodes: ["EGP"],
              evidenceSpans: [],
            },
          },
        ],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result))
      throw new Error("Malformed advisory erased valid finance");
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
    const logged = JSON.stringify([
      ...mockLoggerError.mock.calls,
      ...mockLoggerWarn.mock.calls,
    ]);
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
        transactions: [
          {
            ...response.transactions[0],
            suggestionRef: null,
            currency: null,
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
          },
        ],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    const session = requireReviewSession(result);
    expect(session.rows).toHaveLength(1);
    expect(session.rows[0]?.currency).toEqual({
      state: "known",
      code: "EGP",
      origin: "preferred_omission",
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
        transactions: [
          {
            ...base.transactions[0],
            suggestionRef: null,
            currency: null,
            currencyEvidence: {
              state: "conflicting",
              statedCode: null,
              candidateCodes: ["EGP", "USD"],
              evidenceSpans: [],
            },
          },
        ],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    if (isVoiceParserError(result))
      throw new Error("Conflicting advice erased financial row");
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

  it("two distinct Arabic amounts have independently grounded Egyptian جنيه proof, never display fallback", async () => {
    const privateMarker = "PRIVATE_SYNTHETIC_VOICE_MARKER";
    // Emoji before the denominations makes JS indexOf exercise UTF-16 offsets.
    const original =
      "🛒 " + privateMarker + " دفعت ١٢٠ جنيه مواصلات و٧٥ جنيه أكل";
    const firstOffset = original.indexOf("جنيه");
    const secondOffset = original.lastIndexOf("جنيه");
    if (firstOffset < 0 || secondOffset <= firstOffset)
      throw new Error("Missing distinct synthetic Egyptian-pound witnesses");
    const base = explicitVoiceResponse();
    const first = base.transactions[0];
    if (!first) throw new Error("Missing synthetic v2 financial row");
    const currencyRow = (
      amount: number,
      start: number,
      index: number
    ): ReturnType<typeof explicitVoiceResponse>["transactions"][number] => ({
      ...first,
      transactionRef: "synthetic-egp-row-" + index,
      amount,
      description: "Synthetic Arabic purchase " + index,
      counterparty: null,
      accountId: null,
      currency: "EGP",
      suggestionRef: null,
      toAccountEvidence: null,
      accountEvidence: {
        state: "absent" as const,
        name: null,
        type: null,
        institutionId: null,
        providerDisplayName: null,
        cardLast4: null,
        evidenceSpans: [],
        candidateAccountIds: [],
      },
      currencyEvidence: {
        state: "explicit" as const,
        statedCode: "EGP",
        candidateCodes: ["EGP"],
        evidenceSpans: [
          {
            sourceRef: mockVoiceRequestKey,
            field: "transcript" as const,
            start,
            end: start + "جنيه".length,
            text: "جنيه",
          },
        ],
      },
    });
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...base,
        transcript: "I paid 120 Egyptian pounds for transport and 75 for food",
        original_transcript: original,
        detected_language: "ar",
        transactions: [
          currencyRow(120, firstOffset, 0),
          currencyRow(75, secondOffset, 1),
        ],
        suggestedAccounts: [],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    if (isVoiceParserError(result))
      throw new Error("Grounded synthetic Arabic Voice rows rejected");
    expect(result.transactions.map((row) => row.amount)).toEqual([120, 75]);
    expect(result.transactions.map((row) => row.currency)).toEqual([
      "EGP",
      "EGP",
    ]);
    const session = requireReviewSession(result);
    expect(session.rows).toHaveLength(2);
    expect(session.rows.map((row) => row.transaction.amount)).toEqual([
      120, 75,
    ]);
    for (const [index, row] of session.rows.entries()) {
      expect(row.currency).toEqual({
        state: "known",
        code: "EGP",
        origin: "explicit",
      });
      expect(row.reviewReasons).not.toContain("currency_confirmation_needed");
      const expectedStart = index === 0 ? firstOffset : secondOffset;
      expect(original.slice(expectedStart, expectedStart + 4)).toBe("جنيه");
    }
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    if (__DEV__) {
      expect(mockLoggerDebug).toHaveBeenCalledTimes(1);
      const diagnostic = mockLoggerDebug.mock.calls[0]?.[1];
      expect(diagnostic).toMatchObject({
        classifier: "v2",
        financialCount: 2,
        advisoryCount: 2,
        transcriptEqual: true,
        evidenceStates: { explicit: 2 },
        spans: { checked: 2, sourceMatches: 2, utf16Matches: 2, bothMatch: 2 },
        normalized: { knownExplicit: 2 },
      });
      const safePayload = JSON.stringify(mockLoggerDebug.mock.calls);
      expect(safePayload).not.toContain(privateMarker);
      expect(safePayload).not.toContain(mockVoiceRequestKey);
      expect(safePayload).not.toContain("١٢٠");
      expect(safePayload).not.toContain("جنيه");
    } else {
      expect(mockLoggerDebug).not.toHaveBeenCalled();
    }
  });

  it("keeps opted-in Voice success but emits no currency diagnostics when __DEV__ is false", async () => {
    const previousDev = __DEV__;
    try {
      expect(Reflect.set(globalThis, "__DEV__", false)).toBe(true);
      expect(__DEV__).toBe(false);
      mockInvoke.mockResolvedValueOnce({
        data: explicitVoiceResponse(),
        error: null,
      });
      const result = await parseVoiceWithAi(voiceOptions());
      if (isVoiceParserError(result))
        throw new Error("Valid opted-in Voice response must succeed");
      expect(result.transactions).toHaveLength(1);
      expect(requireReviewSession(result).rows[0]?.currency).toEqual({
        state: "known",
        code: "EGP",
        origin: "explicit",
      });
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockLoggerDebug).not.toHaveBeenCalled();
    } finally {
      Reflect.set(globalThis, "__DEV__", previousDev);
    }
  });

  it("unsupported Voice denomination remains blocked while mapped financial EGP is only display", async () => {
    const base = explicitVoiceResponse();
    const first = base.transactions[0];
    if (!first) throw new Error("Missing synthetic v2 row");
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...base,
        suggestedAccounts: [],
        transactions: [
          {
            ...first,
            suggestionRef: null,
            currency: null,
            currencyEvidence: {
              state: "unsupported",
              statedCode: "XYZ",
              candidateCodes: [],
              evidenceSpans: [],
            },
          },
        ],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    if (isVoiceParserError(result))
      throw new Error("Unsupported currency erased finance");
    expect(result.transactions[0]?.currency).toBe("EGP");
    const row = requireReviewSession(result).rows[0];
    expect(row?.currency).toMatchObject({
      state: "unconfirmed",
      reason: "unsupported",
    });
    expect(row?.reviewReasons).toContain("currency_confirmation_needed");
    expect(row?.assignment.state).toBe("unresolved");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("malformed Voice currency span rejects the advisory without silently confirming EGP", async () => {
    const base = explicitVoiceResponse();
    const first = base.transactions[0];
    const span = first?.currencyEvidence.evidenceSpans[0];
    if (!first || !span)
      throw new Error("Missing synthetic grounded currency span");
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...base,
        transactions: [
          {
            ...first,
            currencyEvidence: {
              ...first.currencyEvidence,
              evidenceSpans: [{ ...span, text: "WRONG_PRIVATE_SPAN_MARKER" }],
            },
          },
        ],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    if (isVoiceParserError(result))
      throw new Error("Malformed advisory erased finance");
    const row = requireReviewSession(result).rows[0];
    expect(row?.currency).toMatchObject({
      state: "unconfirmed",
      reason: "legacy_unknown",
    });
    expect(row?.reviewReasons).toContain("currency_confirmation_needed");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    if (__DEV__) {
      const diagnostic = mockLoggerDebug.mock.calls[0]?.[1];
      expect(diagnostic).toMatchObject({
        classifier: "malformed_advisory",
        normalized: { unconfirmed: { legacy_unknown: 1 } },
      });
      const safePayload = JSON.stringify(mockLoggerDebug.mock.calls);
      expect(safePayload).not.toContain("WRONG_PRIVATE_SPAN_MARKER");
      expect(safePayload).not.toContain(REVIEW_VOICE_TRANSCRIPT);
      expect(safePayload).not.toContain(mockVoiceRequestKey);
    } else {
      expect(mockLoggerDebug).not.toHaveBeenCalled();
    }
  });

  it("keeps no-options v1 Voice parsing unchanged with reviewSession absent", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: makeVoiceV1Response(),
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions(false));
    if (isVoiceParserError(result))
      throw new Error("Legacy Voice financial row lost");
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
        transactions: [
          { ...response.transactions[0], amount: Number.POSITIVE_INFINITY },
        ],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(voiceOptions());
    expect(isVoiceParserError(result)).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
