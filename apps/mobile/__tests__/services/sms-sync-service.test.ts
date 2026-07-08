/**
 * sms-sync-service.test.ts — T020
 *
 * Tests the `scanAndParseSms` and `cleanupStaleScanState` functions from
 * sms-sync-service.ts.
 *
 * Mock Strategy:
 *   - `sms-reader-service` is mocked to return controlled SMS messages
 *   - `@monyvi/logic` is partially mocked (isKnownFinancialSender + computeSmsFingerprint)
 *   - `ai-sms-parser-service` is mocked to return controlled AI parse results
 *   - `@react-native-async-storage/async-storage` is mocked for scan guard
 *   - `InteractionManager` is mocked via react-native
 *   - `@monyvi/db` is mocked to provide loadExistingSmsFingerprints support
 */

import type {
  ParsedSmsTransaction,
  SmsFingerprintInput,
  SmsMessage,
} from "@monyvi/logic";
import type {
  AiParseResult,
  ParseSmsContext,
} from "@/services/ai-sms-parser-service";

// ---------------------------------------------------------------------------
// Mock: AsyncStorage (inline factory to avoid hoisting issues)
// ---------------------------------------------------------------------------

jest.mock("@react-native-async-storage/async-storage", () => {
  const setItem = jest.fn((): Promise<void> => Promise.resolve());
  const getItem = jest.fn((): Promise<string | null> => Promise.resolve(null));
  const removeItem = jest.fn((): Promise<void> => Promise.resolve());
  return {
    __esModule: true,
    default: { setItem, getItem, removeItem },
    __mocks: { setItem, getItem, removeItem },
  };
});

/** Shape of the mocked AsyncStorage module for typed access. */
interface AsyncStorageMockModule {
  __esModule: boolean;
  default: {
    setItem: jest.Mock;
    getItem: jest.Mock;
    removeItem: jest.Mock;
  };
  __mocks: {
    setItem: jest.Mock;
    getItem: jest.Mock;
    removeItem: jest.Mock;
  };
}

/** Typed access to the AsyncStorage mock fns for assertions. */
function getAsyncStorageMocks(): {
  setItem: jest.Mock;
  getItem: jest.Mock;
  removeItem: jest.Mock;
} {
  return jest.requireMock<AsyncStorageMockModule>(
    "@react-native-async-storage/async-storage"
  ).__mocks;
}

// ---------------------------------------------------------------------------
// Mock: react-native (InteractionManager + Platform)
// ---------------------------------------------------------------------------

jest.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: jest.fn((cb: () => void) => {
      cb();
      return { cancel: jest.fn() };
    }),
  },
  Platform: { OS: "android" },
}));

// ---------------------------------------------------------------------------
// Mock: sms-reader-service
// ---------------------------------------------------------------------------

const mockReadSmsInbox = jest.fn<Promise<readonly SmsMessage[]>, []>(() =>
  Promise.resolve([])
);

jest.mock("@/services/sms-reader-service", () => ({
  readSmsInbox: (...args: unknown[]) => mockReadSmsInbox(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Mock: @monyvi/logic (isKnownFinancialSender + computeSmsFingerprint)
// ---------------------------------------------------------------------------

const mockIsKnownFinancialSender = jest.fn<boolean, [string]>(() => true);
const mockComputeSmsFingerprint = jest.fn<
  Promise<string>,
  [SmsFingerprintInput]
>((input: SmsFingerprintInput) =>
  Promise.resolve(
    `hash-${input.sender}-${input.receivedAtMs}-${input.body.slice(0, 10)}`
  )
);

jest.mock("@monyvi/logic", () => ({
  isKnownFinancialSender: (...args: unknown[]) =>
    mockIsKnownFinancialSender(...(args as [string])),
  computeSmsFingerprint: (...args: unknown[]) =>
    mockComputeSmsFingerprint(...(args as [SmsFingerprintInput])),
}));

// ---------------------------------------------------------------------------
// Mock: @nozbe/watermelondb
// ---------------------------------------------------------------------------

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    unsafeSqlQuery: jest.fn(),
    where: jest.fn(),
    and: jest.fn(),
    or: jest.fn(),
    notEq: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock: ai-sms-parser-service (parseSmsWithAi)
// ---------------------------------------------------------------------------

const mockParseSmsWithAi = jest.fn<Promise<AiParseResult>, unknown[]>(() =>
  Promise.resolve({ transactions: [] })
);

jest.mock("@/services/ai-sms-parser-service", () => ({
  parseSmsWithAi: (...args: unknown[]) => mockParseSmsWithAi(...args),
}));

// ---------------------------------------------------------------------------
// Mock: @monyvi/db (database)
// ---------------------------------------------------------------------------

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn().mockReturnValue({
      query: jest.fn().mockReturnValue({
        unsafeFetchRaw: jest.fn().mockResolvedValue([]),
        fetch: jest.fn().mockResolvedValue([]),
      }),
    }),
  },
  Transaction: {},
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(() =>
    Promise.resolve({
      queryOwned: (
        collection: {
          query: (...conditions: readonly unknown[]) => {
            unsafeFetchRaw: jest.Mock<Promise<readonly unknown[]>, []>;
            fetch: jest.Mock<Promise<readonly unknown[]>, []>;
          };
        },
        ...conditions: unknown[]
      ): {
        unsafeFetchRaw: jest.Mock<Promise<readonly unknown[]>, []>;
        fetch: jest.Mock<Promise<readonly unknown[]>, []>;
      } => collection.query(...conditions),
    })
  ),
}));

// ---------------------------------------------------------------------------
// Import module under test (after mocks)
// ---------------------------------------------------------------------------

import {
  scanAndParseSms,
  cleanupStaleScanState,
} from "@/services/sms-sync-service";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createSmsMessage(overrides: Partial<SmsMessage> = {}): SmsMessage {
  return {
    id: `sms-${Date.now()}-${Math.random()}`,
    address: "NBE",
    body: "Purchase of EGP 100.00 at TestShop on card ending 1234",
    date: Date.now(),
    read: true,
    ...overrides,
  };
}

function createParsedTransaction(
  overrides: Partial<ParsedSmsTransaction> = {}
): ParsedSmsTransaction {
  return {
    amount: 100,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "TestShop",
    date: new Date(),
    smsFingerprint: "",
    senderDisplayName: "NBE",
    categoryId: "cat-bank-fees-id",
    categoryDisplayName: "bank_fees",
    rawSmsBody: "Purchase of EGP 100.00 at TestShop",
    confidence: 0.85,
    source: "SMS",
    originLabel: "NBE",
    ...overrides,
  };
}

/** Stub ParseSmsContext for tests — minimal valid context */
const stubAiContext: ParseSmsContext = {
  categories: [],
  supportedCurrencies: ["EGP"],
};

/** Default ScanOptions with required aiContext */
function defaultOptions(overrides: Record<string, unknown> = {}): {
  aiContext: ParseSmsContext;
  [key: string]: unknown;
} {
  return { aiContext: stubAiContext, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sms-sync-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSmsInbox.mockResolvedValue([]);
    mockIsKnownFinancialSender.mockReturnValue(true);
    mockComputeSmsFingerprint.mockImplementation((input: SmsFingerprintInput) =>
      Promise.resolve(
        `hash-${input.sender}-${input.receivedAtMs}-${input.body.slice(0, 10)}`
      )
    );
    mockParseSmsWithAi.mockResolvedValue({ transactions: [] });
  });

  // =========================================================================
  // scanAndParseSms — Core Pipeline
  // =========================================================================
  describe("scanAndParseSms", () => {
    it("should return empty result for an empty inbox", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toHaveLength(0);
      expect(result.totalScanned).toBe(0);
      expect(result.totalFound).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should parse financial SMS and include in results", async () => {
      const sms1 = createSmsMessage({
        body: "Purchase of EGP 100.00 at Carrefour",
      });
      const sms2 = createSmsMessage({
        address: "VF",
        body: "Sent EGP 500 to 01012345678",
      });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      const parsed1 = createParsedTransaction({
        amount: 100,
        counterparty: "Carrefour",
        rawSmsBody: sms1.body,
        smsFingerprint: "hash-carrefour",
        deduplicationHash: "hash-carrefour",
      });
      const parsed2 = createParsedTransaction({
        amount: 500,
        type: "EXPENSE",
        senderDisplayName: "VF",
        rawSmsBody: sms2.body,
        smsFingerprint: "hash-vf",
        deduplicationHash: "hash-vf",
      });
      mockParseSmsWithAi.mockResolvedValue({
        transactions: [parsed1, parsed2],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.totalScanned).toBe(2);
      expect(result.totalFound).toBe(2);
      expect(result.transactions).toHaveLength(2);
    });

    it("should skip SMS from non-financial senders", async () => {
      const financial = createSmsMessage({
        address: "NBE",
        body: "Purchase of EGP 200 at Shop",
      });
      const promo = createSmsMessage({
        address: "UNKNOWN",
        body: "Click here for a special offer!",
      });
      mockReadSmsInbox.mockResolvedValue([financial, promo]);

      // Only NBE is a known financial sender
      mockIsKnownFinancialSender
        .mockReturnValueOnce(true) // financial → passes filter
        .mockReturnValueOnce(false); // promo → filtered out

      const parsed = createParsedTransaction({ amount: 200 });
      mockParseSmsWithAi.mockResolvedValue({ transactions: [parsed] });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.totalScanned).toBe(2);
      expect(result.totalFound).toBe(1);
      expect(result.transactions).toHaveLength(1);
    });

    it("should deduplicate against existing fingerprints", async () => {
      const sms1 = createSmsMessage({ body: "Debit EGP 100" });
      const sms2 = createSmsMessage({ body: "Debit EGP 200" });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      // Fingerprint for sms1 matches an existing fingerprint.
      mockComputeSmsFingerprint
        .mockResolvedValueOnce("existing-hash-1")
        .mockResolvedValueOnce("new-hash-2");

      const existingFingerprints = new Set(["existing-hash-1"]);

      // Only sms2 should reach AI (sms1 was deduped)
      const parsed = createParsedTransaction({ amount: 200 });
      mockParseSmsWithAi.mockResolvedValue({ transactions: [parsed] });

      const result = await scanAndParseSms(
        defaultOptions({ existingFingerprints })
      );

      // Only 1 candidate should have been sent to AI
      expect(mockParseSmsWithAi).toHaveBeenCalledTimes(1);
      expect(result.totalFound).toBe(1);
      expect(result.transactions).toHaveLength(1);
    });

    it("includes sender, body, and received timestamp when fingerprinting SMS", async () => {
      const sms1 = createSmsMessage({
        id: "sms-1",
        address: "NBE",
        body: "Debit EGP 100 at Shop",
        date: 1778414400000,
      });
      const sms2 = createSmsMessage({
        id: "sms-2",
        address: "NBE",
        body: "Debit EGP 100 at Shop",
        date: 1778418000000,
      });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      await scanAndParseSms(defaultOptions());

      expect(mockComputeSmsFingerprint).toHaveBeenNthCalledWith(1, {
        sender: "NBE",
        body: "Debit EGP 100 at Shop",
        receivedAtMs: 1778414400000,
      });
      expect(mockComputeSmsFingerprint).toHaveBeenNthCalledWith(2, {
        sender: "NBE",
        body: "Debit EGP 100 at Shop",
        receivedAtMs: 1778418000000,
      });

      const candidates = mockParseSmsWithAi.mock.calls[0]?.[0] as
        | ReadonlyArray<{ readonly smsFingerprint: string }>
        | undefined;

      expect(candidates).toHaveLength(2);
      expect(candidates?.map((candidate) => candidate.smsFingerprint)).toEqual([
        "hash-NBE-1778414400000-Debit EGP ",
        "hash-NBE-1778418000000-Debit EGP ",
      ]);
    });

    it("should deduplicate duplicate fingerprints within the same scan before AI parsing", async () => {
      const sms1 = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      const sms2 = createSmsMessage({
        id: "sms-2",
        body: "Debit EGP 100 at Shop",
      });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);
      mockComputeSmsFingerprint.mockResolvedValue("same-sms-hash");

      await scanAndParseSms(defaultOptions());

      const candidates = mockParseSmsWithAi.mock.calls[0]?.[0] as
        | ReadonlyArray<{ readonly smsFingerprint: string }>
        | undefined;

      expect(candidates).toHaveLength(1);
      expect(candidates?.[0]?.smsFingerprint).toBe("same-sms-hash");
    });

    it("does not send SMS candidates to AI when the scan is aborted first", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      const abortController = new AbortController();
      mockReadSmsInbox.mockResolvedValue([sms]);
      abortController.abort();

      await expect(
        scanAndParseSms(
          defaultOptions({ abortSignal: abortController.signal })
        )
      ).rejects.toThrow("SMS scan aborted");

      expect(mockReadSmsInbox).not.toHaveBeenCalled();
      expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    });

    it("does not complete the scan when AI parsing returns a non-retryable error", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockParseSmsWithAi.mockResolvedValue({
        transactions: [],
        hasError: true,
        isRetryable: false,
      });

      const onProgress = jest.fn();
      await expect(
        scanAndParseSms(defaultOptions(), onProgress)
      ).rejects.toThrow("SMS AI parsing failed");

      expect(
        onProgress.mock.calls.some(
          (call: [Record<string, unknown>]) =>
            call[0].currentPhase === "complete"
        )
      ).toBe(false);
    });

    it("should deduplicate exact duplicate AI results before review", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockComputeSmsFingerprint.mockResolvedValue("same-sms-hash");

      const parsed = createParsedTransaction({
        amount: 100,
        smsFingerprint: "same-sms-hash",
        deduplicationHash: "same-sms-hash",
      });
      mockParseSmsWithAi.mockResolvedValue({
        transactions: [parsed, parsed],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toHaveLength(1);
      expect(result.totalFound).toBe(1);
      expect(result.transactions[0]?.counterparty).toBe("TestShop");
    });

    it("should keep distinct AI results from the same SMS fingerprint", async () => {
      const sms = createSmsMessage({
        id: "sms-1",
        body: "Debit EGP 100 at Shop plus EGP 5 fee",
      });
      mockReadSmsInbox.mockResolvedValue([sms]);
      mockComputeSmsFingerprint.mockResolvedValue("same-sms-hash");

      const purchase = createParsedTransaction({
        amount: 100,
        counterparty: "Shop",
        smsFingerprint: "same-sms-hash",
        deduplicationHash: "same-sms-hash",
      });
      const fee = createParsedTransaction({
        amount: 5,
        counterparty: "Card fee",
        smsFingerprint: "same-sms-hash",
        deduplicationHash: "same-sms-hash",
      });
      mockParseSmsWithAi.mockResolvedValue({
        transactions: [purchase, fee],
      });

      const result = await scanAndParseSms(defaultOptions());

      expect(result.transactions).toHaveLength(2);
      expect(result.totalFound).toBe(2);
      expect(
        result.transactions.map((transaction) => transaction.amount)
      ).toEqual([100, 5]);
    });

    it("loads current-user fingerprints when existing fingerprints are not supplied", async () => {
      const userDataAccessMock = jest.requireMock<{
        getCurrentUserDataScope: jest.Mock;
      }>("@/services/user-data-access");
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      expect(userDataAccessMock.getCurrentUserDataScope).toHaveBeenCalledTimes(
        1
      );
    });

    it("should pass maxCount and minDate to readSmsInbox", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      const minDate = Date.now() - 86_400_000;
      await scanAndParseSms(defaultOptions({ maxCount: 100, minDate }));

      expect(mockReadSmsInbox).toHaveBeenCalledWith({
        maxCount: 100,
        minDate,
      });
    });

    it("should use default maxCount (2000) when not specified", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      expect(mockReadSmsInbox).toHaveBeenCalledWith(
        expect.objectContaining({ maxCount: 2000 })
      );
    });
  });

  // =========================================================================
  // scanAndParseSms — Progress Callback
  // =========================================================================
  describe("progress callback", () => {
    it("should invoke onProgress after each batch", async () => {
      // Create 3 SMS; batchSize=2 → 2 filtering progress calls + ai-parsing + complete
      const messages = [
        createSmsMessage({ body: "SMS 1" }),
        createSmsMessage({ body: "SMS 2" }),
        createSmsMessage({ body: "SMS 3" }),
      ];
      mockReadSmsInbox.mockResolvedValue(messages);

      const onProgress = jest.fn();
      await scanAndParseSms(defaultOptions({ batchSize: 2 }), onProgress);

      // At minimum: 2 filtering batches + 1 ai-parsing start + 1 complete
      expect(onProgress).toHaveBeenCalled();
      expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("should report accurate progress values", async () => {
      const sms1 = createSmsMessage({
        address: "NBE",
        body: "Purchase EGP 100 at Shop",
      });
      const sms2 = createSmsMessage({ address: "CIB", body: "Random promo" });
      mockReadSmsInbox.mockResolvedValue([sms1, sms2]);

      const parsed = createParsedTransaction({ amount: 100 });
      mockParseSmsWithAi.mockResolvedValue({ transactions: [parsed] });

      const onProgress = jest.fn();
      await scanAndParseSms(defaultOptions({ batchSize: 2 }), onProgress);

      // The "complete" phase should report transactionsFound = 1
      const completeCalls = onProgress.mock.calls.filter(
        (call: [Record<string, unknown>]) => call[0].currentPhase === "complete"
      ) as Array<[Record<string, unknown>]>;
      expect(completeCalls.length).toBeGreaterThanOrEqual(1);
      expect(completeCalls[0][0]).toEqual(
        expect.objectContaining({
          totalMessages: 2,
          messagesScanned: 2,
          transactionsFound: 1,
        })
      );
    });

    it("should not throw if onProgress is undefined", async () => {
      mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);

      await expect(scanAndParseSms(defaultOptions())).resolves.toBeDefined();
    });
  });

  // =========================================================================
  // scanAndParseSms — UI Thread Yielding
  // =========================================================================
  describe("UI thread yielding", () => {
    it("should yield to InteractionManager after yieldInterval batches", async () => {
      const { InteractionManager } = jest.requireMock<{
        InteractionManager: { runAfterInteractions: jest.Mock };
      }>("react-native");

      // 6 messages, batchSize=1, yieldInterval=2 → yield at batch 2, 4, 6
      const messages = Array.from({ length: 6 }, (_, i) =>
        createSmsMessage({ body: `SMS ${i}` })
      );
      mockReadSmsInbox.mockResolvedValue(messages);

      await scanAndParseSms(defaultOptions({ batchSize: 1, yieldInterval: 2 }));

      expect(InteractionManager.runAfterInteractions).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // scanAndParseSms — Scan Guard (AsyncStorage flag)
  // =========================================================================
  describe("scan guard", () => {
    it("should set scan-in-progress flag before scanning", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      const { setItem } = getAsyncStorageMocks();
      expect(setItem).toHaveBeenCalledWith(
        "@monyvi/sms_scan_in_progress",
        "true"
      );
    });

    it("should clear scan-in-progress flag after successful scan", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      await scanAndParseSms(defaultOptions());

      const { removeItem } = getAsyncStorageMocks();
      expect(removeItem).toHaveBeenCalledWith("@monyvi/sms_scan_in_progress");
    });

    it("should clear scan-in-progress flag even if scan throws", async () => {
      mockReadSmsInbox.mockRejectedValue(new Error("SMS read failed"));

      await expect(scanAndParseSms(defaultOptions())).rejects.toThrow(
        "SMS read failed"
      );

      const { removeItem } = getAsyncStorageMocks();
      expect(removeItem).toHaveBeenCalledWith("@monyvi/sms_scan_in_progress");
    });
  });

  // =========================================================================
  // cleanupStaleScanState
  // =========================================================================
  describe("cleanupStaleScanState", () => {
    it("should return true and remove flag when stale state exists", async () => {
      const { getItem, removeItem } = getAsyncStorageMocks();
      getItem.mockResolvedValueOnce("true");

      const wasStale = await cleanupStaleScanState();

      expect(wasStale).toBe(true);
      expect(removeItem).toHaveBeenCalledWith("@monyvi/sms_scan_in_progress");
    });

    it("should return false when no stale state", async () => {
      const { getItem, removeItem } = getAsyncStorageMocks();
      getItem.mockResolvedValueOnce(null);

      const wasStale = await cleanupStaleScanState();

      expect(wasStale).toBe(false);
      expect(removeItem).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // scanAndParseSms — Result Shape
  // =========================================================================
  describe("result shape", () => {
    it("should return readonly transactions array", async () => {
      const parsed = createParsedTransaction();
      mockReadSmsInbox.mockResolvedValue([createSmsMessage()]);
      mockParseSmsWithAi.mockResolvedValue({ transactions: [parsed] });

      const result = await scanAndParseSms(defaultOptions());

      expect(Array.isArray(result.transactions)).toBe(true);
      expect(typeof result.totalScanned).toBe("number");
      expect(typeof result.totalFound).toBe("number");
      expect(typeof result.durationMs).toBe("number");
    });

    it("should measure duration in milliseconds", async () => {
      mockReadSmsInbox.mockResolvedValue([]);

      const result = await scanAndParseSms(defaultOptions());

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThan(5000); // sanity bound
    });
  });
});
