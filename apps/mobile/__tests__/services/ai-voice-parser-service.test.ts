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

const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]): unknown => mockInvoke(...args) as unknown,
    },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid options for all tests (matches strict ParseVoiceOptions). */
function makeDefaultOptions(overrides: Record<string, unknown> = {}): {
  audioUri: string;
  preferredCurrency: string;
  categories: string;
  accounts: ReadonlyArray<{ id: string; name: string; currency: string }>;
  categoryRecords: readonly Category[];
} {
  return {
    audioUri: "file:///tmp/recording.m4a",
    preferredCurrency: "EGP",
    categories: "Food > Coffee",
    accounts: [{ id: "acc-1", name: "Cash EGP", currency: "EGP" }],
    categoryRecords: [] as Category[],
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
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("network");
        expect(result.message).not.toContain("Edge Function");
        expect(result.message).toBe(
          "We couldn't reach voice analysis right now. Please check your connection and try again."
        );
      }
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

    it("should return 'timeout' error on AbortError", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockInvoke.mockRejectedValueOnce(abortError);

      const result = await parseVoiceWithAi(makeDefaultOptions());

      expect(isVoiceParserError(result)).toBe(true);
      if (isVoiceParserError(result)) {
        expect(result.kind).toBe("timeout");
        expect(result.message).toContain("took too long");
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
