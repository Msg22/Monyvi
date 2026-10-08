/**
 * ai-voice-parser-service.test.ts — T009
 *
 * Tests the exported functions:
 * - parseVoiceWithAi (audio mode, error handling, validation)
 * - isVoiceParserError (type guard)
 *
 * Mock Strategy:
 *   - `supabase.functions.invoke` is mocked to simulate Edge Function responses
 *   - `@monyvi/logic` utilities are partially mocked for category resolution
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports (Jest hoisting)
// ---------------------------------------------------------------------------

interface MockVoiceFunctionResponse {
  readonly data: unknown;
  readonly error: unknown;
}

interface MockVoiceFunctionOptions {
  readonly body: unknown;
  readonly signal?: AbortSignal;
}

const mockInvoke = jest.fn<
  Promise<MockVoiceFunctionResponse>,
  [name: string, options: MockVoiceFunctionOptions]
>();
const mockLoggerError = jest.fn<
  void,
  [message: string, error?: unknown, context?: Record<string, unknown>]
>();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (
        name: string,
        options: MockVoiceFunctionOptions
      ): Promise<MockVoiceFunctionResponse> => mockInvoke(name, options),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: (
      message: string,
      error?: unknown,
      context?: Record<string, unknown>
    ): void => mockLoggerError(message, error, context),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock global fetch for audio mode
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock @monyvi/logic — keep real implementations except parseCategory/buildCategoryMap
jest.mock("@monyvi/logic", () => {
  const actual = jest.requireActual<Record<string, unknown>>("@monyvi/logic");
  return {
    ...actual,
    // parseCategory needs a valid category map to resolve — stub it
    parseCategory: jest.fn().mockReturnValue({
      id: "cat-other",
      displayName: "other",
    }),
    buildCategoryMap: jest
      .fn()
      .mockReturnValue(
        new Map([["other", { name: "Other", id: "cat-other" }]])
      ),
  };
});

// ---------------------------------------------------------------------------
// Imports — module under test
// ---------------------------------------------------------------------------

import {
  parseVoiceWithAi,
  isVoiceParserError,
} from "@/services/ai-voice-parser-service";
import type { Category } from "@monyvi/db";
import { FunctionsFetchError } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readProcessEnvironmentVariable(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Minimal valid options for all tests (matches strict ParseVoiceOptions). */
function makeDefaultOptions(overrides: Record<string, unknown> = {}): {
  audioUri: string;
  preferredCurrency: string;
  categories: string;
  accounts: ReadonlyArray<{ id: string; name: string; currency: string }>;
  categoryRecords: readonly Category[];
  requestKey: string;
  callerTimeZone: string;
  signal?: AbortSignal;
} {
  return {
    audioUri: "file:///tmp/recording.m4a",
    preferredCurrency: "EGP",
    categories: "Food > Coffee",
    accounts: [{ id: "acc-1", name: "Cash EGP", currency: "EGP" }],
    categoryRecords: [] as Category[],
    requestKey: "voice-request-default",
    callerTimeZone: "Africa/Cairo",
    ...overrides,
  };
}

function makeSuccessResponse(
  transactions: ReadonlyArray<Record<string, unknown>>,

  transcript = "test transcript",
  originalTranscript = "test original transcript",
  detectedLanguage = "en"
): { data: Record<string, unknown>; error: null } {
  return {
    data: {
      transactions,
      transcript,
      original_transcript: originalTranscript,
      detected_language: detectedLanguage,
    },
    error: null,
  };
}

function makeValidTransaction(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    amount: 50,
    type: "EXPENSE",
    counterparty: "Coffee Shop",
    categorySystemName: "coffee_tea",
    description: "Morning coffee",
    accountId: "acc-1",
    currency: "EGP",
    date: "2026-01-15",
    confidenceScore: 0.9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ai-voice-parser-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  // =========================================================================
  // isVoiceParserError
  // =========================================================================
  describe("isVoiceParserError", () => {
    it("should return true for error objects with 'kind' property", () => {
      const error = { kind: "timeout" as const, message: "Too slow" };
      expect(isVoiceParserError(error)).toBe(true);
    });

    it("should return false for success results with 'transactions'", () => {
      const success = {
        transactions: [],
        transcript: "",
        originalTranscript: "",
        detectedLanguage: "en",
      };
      expect(isVoiceParserError(success)).toBe(false);
    });
  });

  // =========================================================================
  // parseVoiceWithAi — Audio mode (primary mode)
  // =========================================================================
  describe("parseVoiceWithAi — audio mode", () => {
    let appendSpy: jest.SpyInstance;

    beforeEach(() => {
      appendSpy = jest.spyOn(FormData.prototype, "append");
    });

    afterEach(() => {
      appendSpy.mockRestore();
    });

    /** Extracts the "audio" entry from the spied FormData.append calls. */
    function getAppendedAudioFile(): Record<string, unknown> | undefined {
      const audioCall = appendSpy.mock.calls.find(
        (call: unknown[]) => call[0] === "audio"
      ) as [string, Record<string, unknown>] | undefined;
      return audioCall?.[1];
    }

    function getAppendedStringValues(field: string): readonly string[] {
      return appendSpy.mock.calls
        .filter((call: unknown[]) => call[0] === field)
        .map((call: unknown[]) => call[1])
        .filter((value: unknown): value is string => typeof value === "string");
    }

    it("should return parsed transactions for valid response", async () => {
      const tx = makeValidTransaction();
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(false);
      if (!isVoiceParserError(result)) {
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].amount).toBe(50);
        expect(result.transactions[0].currency).toBe("EGP");
        expect(result.transactions[0].type).toBe("EXPENSE");
        expect(result.transactions[0].counterparty).toBe("Coffee Shop");
        expect(result.transcript).toBe("test transcript");
      }
    });

    it("keeps voice parsing available when every SMS AI capability is disabled", async () => {
      const originalFullParserFlag = readProcessEnvironmentVariable(
        process.env.EXPO_PUBLIC_SMS_FULL_PARSER_ENABLED
      );
      const originalEnrichmentFlag = readProcessEnvironmentVariable(
        process.env.EXPO_PUBLIC_SMS_CATEGORY_ENRICHMENT_ENABLED
      );
      const originalQaProfile = readProcessEnvironmentVariable(
        process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE
      );
      process.env.EXPO_PUBLIC_SMS_FULL_PARSER_ENABLED = "false";
      process.env.EXPO_PUBLIC_SMS_CATEGORY_ENRICHMENT_ENABLED = "false";
      process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = "quota-exhaustion-v1";
      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([makeValidTransaction()])
      );

      try {
        const result = await parseVoiceWithAi(makeDefaultOptions());

        expect(isVoiceParserError(result)).toBe(false);
        expect(mockInvoke.mock.calls[0]?.[0]).toBe("parse-voice");
        expect(mockInvoke.mock.calls[0]?.[1].body).toBeInstanceOf(FormData);
      } finally {
        if (originalFullParserFlag === undefined) {
          delete process.env.EXPO_PUBLIC_SMS_FULL_PARSER_ENABLED;
        } else {
          process.env.EXPO_PUBLIC_SMS_FULL_PARSER_ENABLED =
            originalFullParserFlag;
        }
        if (originalEnrichmentFlag === undefined) {
          delete process.env.EXPO_PUBLIC_SMS_CATEGORY_ENRICHMENT_ENABLED;
        } else {
          process.env.EXPO_PUBLIC_SMS_CATEGORY_ENRICHMENT_ENABLED =
            originalEnrichmentFlag;
        }
        if (originalQaProfile === undefined) {
          delete process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE;
        } else {
          process.env.EXPO_PUBLIC_SMS_SAFEGUARD_QA_PROFILE = originalQaProfile;
        }
      }
    });

    it("should pass categories and accounts to the Edge Function via FormData", async () => {
      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([makeValidTransaction()])
      );

      const opts = makeDefaultOptions();
      await parseVoiceWithAi(opts);

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const callArgs = mockInvoke.mock.calls[0] as unknown[];
      expect(callArgs[0]).toBe("parse-voice");
      const body = (callArgs[1] as { body: FormData }).body;
      expect(body).toBeInstanceOf(FormData);

      // Verify required fields are appended to FormData
      const categoriesCall = appendSpy.mock.calls.find(
        (call: unknown[]) => call[0] === "categories"
      ) as [string, string] | undefined;
      expect(categoriesCall).toBeDefined();
      expect(categoriesCall?.[1]).toBe(opts.categories);

      const accountsCall = appendSpy.mock.calls.find(
        (call: unknown[]) => call[0] === "accounts"
      ) as [string, string] | undefined;
      expect(accountsCall).toBeDefined();
      expect(accountsCall?.[1]).toBe(JSON.stringify(opts.accounts));
    });

    it("submits the same caller-provided request key for the same logical replay", async () => {
      const requestKey = "voice-logical-request-347";
      const opts = makeDefaultOptions({ requestKey });

      mockInvoke
        .mockResolvedValueOnce(makeSuccessResponse([makeValidTransaction()]))
        .mockResolvedValueOnce(makeSuccessResponse([makeValidTransaction()]));

      await parseVoiceWithAi(opts);
      await parseVoiceWithAi(opts);

      // Preserve the existing relative-date context while adding logical
      // request identity. This is expected to remain Green in the Red run.
      expect(getAppendedStringValues("callerLocalDate")).toHaveLength(2);
      expect(getAppendedStringValues("requestKey")).toEqual([
        requestKey,
        requestKey,
      ]);
    });

    it("submits the caller-provided device timezone independently", async () => {
      const callerTimeZone = "Africa/Cairo";
      const opts = makeDefaultOptions({ callerTimeZone });

      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([makeValidTransaction()])
      );

      await parseVoiceWithAi(opts);

      expect(getAppendedStringValues("callerTimeZone")).toEqual([
        callerTimeZone,
      ]);
    });

    it("should return multiple parsed transactions", async () => {
      const txs = [
        makeValidTransaction({ amount: 5, counterparty: "Foul" }),
        makeValidTransaction({ amount: 10, counterparty: "Taamia" }),
        makeValidTransaction({ amount: 5000, counterparty: "Shopping" }),
      ];
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse(txs));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(false);
      if (!isVoiceParserError(result)) {
        expect(result.transactions).toHaveLength(3);
        expect(result.transactions[0].amount).toBe(5);
        expect(result.transactions[1].amount).toBe(10);
        expect(result.transactions[2].amount).toBe(5000);
      }
    });

    it("should normalize INCOME type correctly", async () => {
      const tx = makeValidTransaction({ type: "INCOME" });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      if (!isVoiceParserError(result)) {
        expect(result.transactions[0].type).toBe("INCOME");
      }
    });

    it("should skip transactions with invalid types (normalizeType throws)", async () => {
      // normalizeType now throws on invalid types instead of defaulting.
      // The per-item try/catch in the mapper skips the invalid tx.
      const validTx = makeValidTransaction({ amount: 100 });
      const invalidTx = makeValidTransaction({ type: "DEBIT", amount: 50 });
      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([validTx, invalidTx])
      );

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(false);
      if (!isVoiceParserError(result)) {
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].amount).toBe(100);
      }
    });

    it("should reject negative AI amounts", async () => {
      const tx = makeValidTransaction({ amount: -50 });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("empty");
      }
    });

    it("should reject non-finite AI amounts", async () => {
      const tx = makeValidTransaction({ amount: Number.POSITIVE_INFINITY });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("empty");
      }
    });

    it("should populate note from AI description field", async () => {
      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([
          makeValidTransaction({ description: "Morning coffee" }),
        ])
      );

      const result = await parseVoiceWithAi(makeDefaultOptions());

      if (!isVoiceParserError(result)) {
        const firstTx = result.transactions[0];
        expect(
          "note" in firstTx ? (firstTx as { note: string }).note : undefined
        ).toBe("Morning coffee");
        expect(result.originalTranscript).toBe("test original transcript");
        expect(result.detectedLanguage).toBe("en");
      }
    });

    it("should send audio as FormData with ReactNativeFormDataFile", async () => {
      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([makeValidTransaction()])
      );

      const result = await parseVoiceWithAi(makeDefaultOptions());

      // No fetch() call — ReactNativeFormDataFile pattern reads files natively
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledTimes(1);

      const callArgs = mockInvoke.mock.calls[0] as unknown[];
      expect(callArgs[0]).toBe("parse-voice");
      const body = (callArgs[1] as { body: FormData }).body;
      expect(body).toBeInstanceOf(FormData);

      // Verify the appended audio file has the correct URI
      const audioFile = getAppendedAudioFile();
      expect(audioFile).toBeDefined();
      expect(audioFile?.uri).toBe("file:///tmp/recording.m4a");
      expect(audioFile?.type).toBe("audio/mp4");
      expect(audioFile?.name).toBe("recording.m4a");

      expect(isVoiceParserError(result)).toBe(false);
    });

    it("should normalize bare file paths by prepending file:// prefix", async () => {
      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([makeValidTransaction()])
      );

      await parseVoiceWithAi(
        makeDefaultOptions({
          audioUri: "/data/user/0/com.app/cache/recording.m4a",
        })
      );

      // Verify the URI was normalized with file:// prefix
      const audioFile = getAppendedAudioFile();
      expect(audioFile).toBeDefined();
      expect(audioFile?.uri).toBe(
        "file:///data/user/0/com.app/cache/recording.m4a"
      );
    });

    it("should preserve content:// URIs without prepending file://", async () => {
      mockInvoke.mockResolvedValueOnce(
        makeSuccessResponse([makeValidTransaction()])
      );

      await parseVoiceWithAi(
        makeDefaultOptions({
          audioUri: "content://com.android.providers.media/recording.m4a",
        })
      );

      // Verify the content:// URI was NOT modified
      const audioFile = getAppendedAudioFile();
      expect(audioFile).toBeDefined();
      expect(audioFile?.uri).toBe(
        "content://com.android.providers.media/recording.m4a"
      );
    });
  });

  // =========================================================================
  // parseVoiceWithAi — Error handling
  // =========================================================================
  describe("parseVoiceWithAi — error handling", () => {
    it("should return 'unknown' error when audioUri is missing", async () => {
      // Cast to bypass TS check — testing runtime guard
      const result = await parseVoiceWithAi(
        makeDefaultOptions({ audioUri: "" })
      );

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("unknown");
      }
    });

    it("should return a friendly 'network' error on Edge Function error", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: "Failed to send a request to the Edge Function" },
      });

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      expect(result).toEqual(
        expect.objectContaining({ kind: "network", retryableSameRequest: true })
      );
      if (isVoiceParserError(result) && !("availability" in result)) {
        expect(result.kind).toBe("network");
        expect(result.message).not.toContain("Edge Function");
        expect(result.message).toBe(
          "We couldn't reach voice analysis right now. Please check your connection and try again."
        );
        expect(result.retryableSameRequest).toBe(true);
      }
    });

    it("keeps the same request retryable for an ambiguous authoritative 503", async () => {
      const errorWithContext = new Error("FunctionsHttpError") as Error & {
        context: Response;
      };
      errorWithContext.context = new Response(
        JSON.stringify({
          error: "Authoritative voice availability unavailable",
          code: 503,
        }),
        { status: 503 }
      );
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: errorWithContext,
      });

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      expect(result).toEqual(
        expect.objectContaining({ kind: "network", retryableSameRequest: true })
      );
      if (isVoiceParserError(result) && !("availability" in result)) {
        expect(result.kind).toBe("network");
        expect(result.retryableSameRequest).toBe(true);
      }
    });

    it("does not reuse the same request key after a confirmed HTTP 500", async () => {
      const errorWithContext = new Error("FunctionsHttpError") as Error & {
        context: Response;
      };
      errorWithContext.context = new Response(
        JSON.stringify({
          error: "Internal server error",
          code: 500,
        }),
        { status: 500 }
      );
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: errorWithContext,
      });

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      expect(result).toEqual(
        expect.objectContaining({
          kind: "network",
          retryableSameRequest: false,
        })
      );
      if (isVoiceParserError(result) && !("availability" in result)) {
        expect(result.kind).toBe("network");
        expect(result.retryableSameRequest).toBe(false);
      }
    });

    it("should not log Edge Function response bodies on voice parser errors", async () => {
      const sensitiveBody =
        "provider response includes private transcript and account name";
      const errorWithContext = new Error("FunctionsHttpError") as Error & {
        context: Response;
      };
      errorWithContext.context = new Response(sensitiveBody, { status: 502 });
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: errorWithContext,
      });

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      expect(mockLoggerError).toHaveBeenCalledWith(
        "[ai-voice-parser] parse-voice Edge Function error",
        expect.any(Error),
        expect.objectContaining({
          status: 502,
          bodyLength: sensitiveBody.length,
        })
      );
      const loggedError = mockLoggerError.mock.calls[0]?.[1] as
        | (Error & { readonly context?: unknown })
        | undefined;
      expect(loggedError).not.toBe(errorWithContext);
      expect(loggedError).not.toHaveProperty("context");
      const loggerContext = mockLoggerError.mock.calls[0]?.[2];
      expect(loggerContext).not.toHaveProperty("body");
    });

    it("should return consent_required when the Edge Function requires AI consent", async () => {
      const errorWithContext = new Error("FunctionsHttpError") as Error & {
        context: Response;
      };
      errorWithContext.context = new Response(
        "AI processing consent required",
        {
          status: 403,
        }
      );
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: errorWithContext,
      });

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("consent_required");
        expect(result.message).toBe("AI processing consent is required.");
      }
      expect(mockLoggerError).not.toHaveBeenCalledWith(
        "[ai-voice-parser] parse-voice Edge Function error",
        expect.any(Error),
        expect.any(Object)
      );
    });

    it("should return 'schema' error when response is missing required fields", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { transcript: "test" },
        error: null,
      });

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("schema");
      }
    });

    it("should return 'empty' when all transactions fail validation", async () => {
      const badTx = { invalid: "data" }; // Missing required `amount` and `type`
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([badTx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("empty");
      }
    });

    it("should skip malformed entries but keep valid ones", async () => {
      const valid = makeValidTransaction({ amount: 100 });
      const invalid = { noAmount: true };
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([valid, invalid]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(false);
      if (!isVoiceParserError(result)) {
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].amount).toBe(100);
      }
    });

    it("should return 'unknown' error on unexpected exception", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Network failure"));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("unknown");
        expect(result.message).toBe("Network failure");
      }
    });

    it("returns retryable timeout when the SDK returns a fetch error after the owned timer", async () => {
      jest.useFakeTimers();

      try {
        mockInvoke.mockImplementationOnce(
          (
            _name: string,
            options: MockVoiceFunctionOptions
          ): Promise<MockVoiceFunctionResponse> =>
            new Promise<MockVoiceFunctionResponse>((resolve) => {
              options.signal?.addEventListener(
                "abort",
                (): void => {
                  const abortError = new Error("Aborted");
                  abortError.name = "AbortError";
                  resolve({
                    data: null,
                    error: new FunctionsFetchError(abortError),
                  });
                },
                { once: true }
              );
            })
        );

        const resultPromise = parseVoiceWithAi(makeDefaultOptions());

        jest.advanceTimersByTime(30_000);
        await Promise.resolve();

        const result = await resultPromise;

        expect(isVoiceParserError(result)).toBe(true);
        expect(result).toEqual(
          expect.objectContaining({
            kind: "timeout",
            retryableSameRequest: true,
          })
        );
        if (isVoiceParserError(result) && !("availability" in result)) {
          expect(result.kind).toBe("timeout");
          expect(result.message).toContain("took too long");
          expect(result.retryableSameRequest).toBe(true);
        }
      } finally {
        jest.useRealTimers();
      }
    });

    it("does not retain a request when the SDK returns a fetch error after external cancellation", async () => {
      const operationController = new AbortController();
      mockInvoke.mockImplementationOnce(
        (
          _name: string,
          options: MockVoiceFunctionOptions
        ): Promise<MockVoiceFunctionResponse> =>
          new Promise<MockVoiceFunctionResponse>((resolve) => {
            options.signal?.addEventListener(
              "abort",
              (): void => {
                const abortError = new Error("Aborted");
                abortError.name = "AbortError";
                resolve({
                  data: null,
                  error: new FunctionsFetchError(abortError),
                });
              },
              { once: true }
            );
          })
      );

      const resultPromise = parseVoiceWithAi(
        makeDefaultOptions({
          signal: operationController.signal,
        })
      );

      operationController.abort();
      const result = await resultPromise;

      expect(isVoiceParserError(result)).toBe(true);
      expect(result).toEqual(
        expect.objectContaining({
          kind: "network",
          retryableSameRequest: false,
        })
      );
      if (isVoiceParserError(result) && !("availability" in result)) {
        expect(result.kind).toBe("network");
        expect(result.retryableSameRequest).toBe(false);
      }
    });
  });

  // =========================================================================
  // parseVoiceWithAi — Date parsing
  // =========================================================================
  describe("parseVoiceWithAi — date parsing", () => {
    it("should parse valid ISO date string", async () => {
      const tx = makeValidTransaction({ date: "2026-03-15" });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      if (!isVoiceParserError(result)) {
        const txDate = result.transactions[0].date;
        expect(txDate).toBeInstanceOf(Date);
        expect(new Date(txDate).getFullYear()).toBe(2026);
      }
    });

    it("should fall back to current date for empty date string", async () => {
      const tx = makeValidTransaction({ date: "" });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));
      const before = Date.now();

      const result = await parseVoiceWithAi(makeDefaultOptions());

      if (!isVoiceParserError(result)) {
        const txDate = new Date(result.transactions[0].date);
        expect(txDate.getTime()).toBeGreaterThanOrEqual(before);
      }
    });

    it("should fall back to current date for invalid date string", async () => {
      const tx = makeValidTransaction({ date: "not-a-date" });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));
      const before = Date.now();

      const result = await parseVoiceWithAi(makeDefaultOptions());

      if (!isVoiceParserError(result)) {
        const txDate = new Date(result.transactions[0].date);
        expect(txDate.getTime()).toBeGreaterThanOrEqual(before);
      }
    });
  });

  // =========================================================================
  // parseVoiceWithAi — Counterparty nullability
  // =========================================================================
  describe("parseVoiceWithAi — counterparty handling", () => {
    it("should convert null counterparty to undefined", async () => {
      const tx = makeValidTransaction({ counterparty: null });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      if (!isVoiceParserError(result)) {
        // null from AI is converted to undefined via ?? undefined
        // because ReviewableTransaction.counterparty is string | undefined
        expect(result.transactions[0].counterparty).toBeUndefined();
      }
    });

    it("should pass through string counterparty", async () => {
      const tx = makeValidTransaction({ counterparty: "Starbucks" });
      mockInvoke.mockResolvedValueOnce(makeSuccessResponse([tx]));

      const result = await parseVoiceWithAi(makeDefaultOptions());

      if (!isVoiceParserError(result)) {
        expect(result.transactions[0].counterparty).toBe("Starbucks");
      }
    });
  });
});
