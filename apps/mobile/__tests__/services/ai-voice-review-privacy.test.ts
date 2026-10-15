/**
 * #395 independent P2-03 privacy Red on the REAL parseVoiceWithAi path.
 * Shared parseCategory, buildCategoryMap, original parser and T014 normalizer
 * are unmocked. The synthetic category model only supplies platform input data.
 * No provider, hosted DB, additional parse request or device execution.
 */
import type { Category } from "@monyvi/db";
import {
  makeVoiceV1Response, makeVoiceV2Response,
  REVIEW_VOICE_TRANSCRIPT, REVIEW_WIRE_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/fixtures";
import {
  makeOwnedContext, NORMALIZATION_IDS,
} from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  isVoiceParserError, parseVoiceWithAi,
  type AiVoiceParserOptions,
} from "@/services/ai-voice-parser-service";

interface FunctionResponse {
  readonly data: unknown;
  readonly error: unknown;
}
interface FunctionOptions {
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}
const mockInvoke = jest.fn<
  Promise<FunctionResponse>, [name: string, options: FunctionOptions]
>();
const mockScopedUser = jest.fn<Promise<void>, [ownerId: string]>();
const mockLoadSnapshots = jest.fn<
  Promise<NonNullable<AiVoiceParserOptions["reviewAccountSnapshots"]>>, []
>();
const mockWarn = jest.fn<void, [message: string, details?: unknown]>();
const mockError = jest.fn<
  void, [message: string, error?: unknown, details?: unknown]
>();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (
        name: string, options: FunctionOptions
      ): Promise<FunctionResponse> => mockInvoke(name, options),
    },
  },
}));
jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (ownerId: string): Promise<void> =>
    mockScopedUser(ownerId),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: () => mockLoadSnapshots(),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: (): string => "00000000-0000-4000-8000-000000000199",
  digestStringAsync: (): Promise<string> => Promise.resolve("f".repeat(64)),
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
}));
// Output sink only: capture actual parser emissions; never mock its logic.
jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(), info: jest.fn(),
    warn: (message: string, details?: unknown): void => mockWarn(message, details),
    error: (message: string, error?: unknown, details?: unknown): void =>
      mockError(message, error, details),
  },
}));
// Platform Category model is used solely as a typed in-memory input fixture;
// buildCategoryMap/parseCategory retain their REAL implementations.
jest.mock("@monyvi/db", () => {
  class TestCategoryRecord {
    readonly id: string;
    readonly systemName: string;
    readonly displayName: string;

    constructor(id: string, systemName: string, displayName: string) {
      this.id = id;
      this.systemName = systemName;
      this.displayName = displayName;
    }
  }
  return { Category: TestCategoryRecord };
});

const { Category: TestCategoryRecord } = jest.requireMock<{
  Category: new (id: string, systemName: string, displayName: string) => Category;
}>("@monyvi/db");

const PRIVATE_CATEGORY = "private_category_DO_NOT_LOG_6b8c";
const PRIVATE_TYPE = "PRIVATE_TYPE_DO_NOT_LOG_319a";
const PRIVATE_COUNTERPARTY = "private_counterparty_DO_NOT_LOG_74c1";
const PRIVATE_DESCRIPTION = "private_note_DO_NOT_LOG_22e7";
const PRIVATE_AMOUNT = 85637.41;

function makeOptions(review: boolean): AiVoiceParserOptions {
  const snapshot = makeOwnedContext();
  const options: AiVoiceParserOptions = {
    audioUri: "file:///synthetic/voice-privacy.m4a",
    requestKey: REVIEW_WIRE_IDS.voiceRequestKey,
    callerTimeZone: "Africa/Cairo",
    categories: "EXPENSE categories:\nL1: food",
    accounts: snapshot.providerContext.accounts,
    preferredCurrency: snapshot.preferredCurrency,
    // Nonempty REAL categoryMap with NO "other" fallback, deliberately.
    categoryRecords: [
      new TestCategoryRecord(NORMALIZATION_IDS.foodCategory, "food", "Food"),
    ],
    ...(review ? { reviewAccountSnapshots: snapshot } : {}),
  };
  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allDiagnostics(): readonly (readonly unknown[])[] {
  return [...mockWarn.mock.calls, ...mockError.mock.calls];
}

function safeLogSnapshot(): string {
  return JSON.stringify(allDiagnostics(), (_key: string, value: unknown): unknown =>
    value instanceof Error ? { name: value.name, message: value.message } : value
  );
}

/** Only bounded reason, error-class and count fields may leave this catch. */
function assertPrivacySafeDiagnostics(privateSpans: readonly string[]): void {
  const calls = allDiagnostics();
  expect(calls.length).toBeGreaterThan(0);
  const emitted = safeLogSnapshot();
  for (const secret of privateSpans) expect(emitted).not.toContain(secret);
  const allowed = new Set([
    "reasonCode", "errorName", "errorType", "issueCount", "invalidCount",
    "rejectedCount", "skippedCount", "categoryCount", "categorySystemNameLength",
  ]);
  for (const call of calls) {
    expect(typeof call[0]).toBe("string");
    for (const detail of call.slice(1)) {
      expect(detail).not.toBeInstanceOf(Error);
      expect(isRecord(detail)).toBe(true);
      if (!isRecord(detail)) continue;
      expect("reasonCode" in detail || "errorName" in detail).toBe(true);
      for (const [field, value] of Object.entries(detail)) {
        expect(allowed.has(field)).toBe(true);
        if (field.endsWith("Count") || field.endsWith("Length")) {
          expect(typeof value).toBe("number");
          if (typeof value !== "number") continue;
          expect(Number.isSafeInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
        } else {
          expect(typeof value).toBe("string");
          if (typeof value !== "string") continue;
          expect(value).toMatch(/^[a-z][a-z0-9_.-]{0,80}$/i);
        }
      }
    }
  }
}

describe("#395 P2-03 — original Voice semantic-map diagnostics privacy", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockScopedUser.mockResolvedValue(undefined);
    mockLoadSnapshots.mockResolvedValue(makeOwnedContext());
  });

  it("RED: v2 invalid private category cannot leak while valid finance survives", async () => {
    const original = makeVoiceV2Response();
    const good = original.transactions[0];
    if (!good) throw new Error("Missing canonical Voice financial fixture");
    const invalid = {
      ...good,
      transactionRef: "privacy-invalid-voice-row",
      suggestionRef: null,
      categorySystemName: PRIVATE_CATEGORY,
      counterparty: PRIVATE_COUNTERPARTY,
      description: PRIVATE_DESCRIPTION,
      amount: PRIVATE_AMOUNT,
    };
    mockInvoke.mockResolvedValueOnce({
      data: { ...original, transactions: [good, invalid] }, error: null,
    });
    const result = await parseVoiceWithAi(makeOptions(true));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-voice");
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Valid Voice row lost");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.amount).toBe(good.amount);
    expect(result.transactions[0]?.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(result.reviewSession?.rows).toHaveLength(1);
    assertPrivacySafeDiagnostics([
      PRIVATE_CATEGORY, PRIVATE_COUNTERPARTY, PRIVATE_DESCRIPTION,
      String(PRIVATE_AMOUNT), REVIEW_VOICE_TRANSCRIPT,
    ]);
  });

  it("RED: legacy invalid type error.message cannot leak arbitrary model text", async () => {
    const original = makeVoiceV1Response();
    const financial = original.transactions[0];
    if (!financial) throw new Error("Missing canonical legacy Voice financial fixture");
    mockInvoke.mockResolvedValueOnce({
      data: {
        ...original,
        transactions: [{
          ...financial, categorySystemName: "food",
          type: PRIVATE_TYPE, counterparty: PRIVATE_COUNTERPARTY,
          amount: PRIVATE_AMOUNT, description: PRIVATE_DESCRIPTION,
        }],
      },
      error: null,
    });
    const result = await parseVoiceWithAi(makeOptions(false));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "empty" });
    assertPrivacySafeDiagnostics([
      PRIVATE_TYPE, PRIVATE_COUNTERPARTY, PRIVATE_DESCRIPTION,
      String(PRIVATE_AMOUNT), REVIEW_VOICE_TRANSCRIPT,
    ]);
  });

  it("unchanged legacy valid finance uses one parse call and no diagnostics", async () => {
    const response = makeVoiceV1Response();
    mockInvoke.mockResolvedValueOnce({ data: response, error: null });
    const result = await parseVoiceWithAi(makeOptions(false));
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(isVoiceParserError(result)).toBe(false);
    if (isVoiceParserError(result)) throw new Error("Unexpected legacy regression");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]?.categoryId).toBe(NORMALIZATION_IDS.foodCategory);
    expect(result.reviewSession).toBeUndefined();
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
  });
});
