import type {
  AiParseResult,
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";

const mockParseSmsWithAi = jest.fn<Promise<AiParseResult>, unknown[]>();
const mockGetAiProcessingConsentStatus = jest.fn();

jest.mock("@/services/ai-sms-parser-service", () => ({
  parseSmsWithAi: (...args: unknown[]) => mockParseSmsWithAi(...args),
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): unknown =>
    mockGetAiProcessingConsentStatus(),
}));

import type { ParsedSmsTransaction } from "@monyvi/logic";
import { parseSmsWithOrchestrator } from "@/services/sms-parser-orchestrator";

const originalEnv = process.env;
const RECEIVED_AT_MS = new Date(2026, 3, 8, 14, 30).getTime();

const context: ParseSmsContext = {
  categories: [
    {
      id: "cat-other",
      systemName: "other",
      displayName: "Other",
      level: 1,
      type: "EXPENSE",
    },
    {
      id: "cat-shopping",
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      type: "EXPENSE",
    },
    {
      id: "cat-salary",
      systemName: "salary",
      displayName: "Salary",
      level: 1,
      type: "INCOME",
    },
  ],
  supportedCurrencies: ["EGP", "USD"],
};

function candidate(overrides: Partial<SmsCandidate> = {}): SmsCandidate {
  return {
    message: {
      id: "sms-1",
      address: "NBE",
      body: "Purchase EGP 250.00 on card **** 4321 at CARREFOUR CAIRO on 08/04 14:23. Avail bal EGP 12,430.55",
      date: RECEIVED_AT_MS,
      read: false,
    },
    smsFingerprint: "fingerprint-1",
    ...overrides,
  };
}

function parsedTransaction(
  overrides: Partial<ParsedSmsTransaction> = {}
): ParsedSmsTransaction {
  return {
    amount: 12,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "AI Shop",
    date: new Date(RECEIVED_AT_MS),
    categoryId: "cat-shopping",
    categoryDisplayName: "Shopping",
    confidence: 0.3,
    originLabel: "NBE",
    source: "SMS",
    deduplicationHash: "ai-fingerprint",
    smsFingerprint: "ai-fingerprint",
    senderDisplayName: "NBE",
    rawSmsBody: "raw",
    ...overrides,
  };
}

describe("sms-parser-orchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: "test" };
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    mockGetAiProcessingConsentStatus.mockResolvedValue({ isConsented: true });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses local-primary mode without calling AI when configured", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result.transactions[0]).toMatchObject({
      amount: 250,
      counterparty: "CARREFOUR CAIRO",
      smsFingerprint: "fingerprint-1",
      categoryId: "cat-shopping",
    });
    expect(result.diagnostics).toMatchObject({
      mode: "local-primary",
      attemptedAi: false,
      attemptedLocal: true,
    });
  });

  it("preserves local parser review metadata for high-confidence needs-review rows", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator(
      [
        candidate({
          message: {
            id: "sms-cib",
            address: "CIB",
            body: "CIB: EGP 1,299.00 charged on your credit card ending 9988 at AMAZON.EG on 08-APR-2026. Bal: EGP 4,201.00",
            date: RECEIVED_AT_MS,
            read: false,
          },
          smsFingerprint: "fingerprint-cib",
        }),
      ],
      context
    );

    expect(result.transactions[0]).toMatchObject({
      amount: 1299,
      confidence: 0.94,
      reviewStatus: "needs_review",
      reviewReasons: ["low_confidence"],
    });
  });

  it("keeps production/default mode AI-primary and does not call the local parser", async () => {
    const aiTransaction = parsedTransaction({ confidence: 0.2 });
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [aiTransaction],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(mockParseSmsWithAi).toHaveBeenCalledTimes(1);
    expect(result.transactions).toEqual([aiTransaction]);
    expect(result.diagnostics).toMatchObject({
      mode: "ai-primary",
      attemptedAi: true,
      attemptedLocal: false,
    });
    expect(result.diagnostics.matchedPatternIds).toEqual([]);
  });

  it("does not fall back when AI returns usable low-confidence results", async () => {
    const aiTransaction = parsedTransaction({ confidence: 0.2 });
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [aiTransaction],
      hasError: false,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([aiTransaction]);
    expect(result.diagnostics).toMatchObject({
      mode: "ai-primary",
      attemptedLocal: false,
    });
  });

  it("does not use local fallback for retryable unusable AI results in phase 1", async () => {
    mockParseSmsWithAi.mockResolvedValueOnce({
      transactions: [],
      hasError: true,
      isRetryable: true,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(true);
    expect(result.diagnostics).toMatchObject({
      mode: "ai-primary",
      attemptedAi: true,
      attemptedLocal: false,
    });
  });

  it("does not use local fallback when the AI call throws in phase 1", async () => {
    mockParseSmsWithAi.mockRejectedValueOnce(
      new Error("Network request failed")
    );

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.transactions).toEqual([]);
    expect(result.hasError).toBe(true);
    expect(result.isRetryable).toBe(true);
    expect(result.diagnostics).toMatchObject({
      mode: "ai-primary",
      attemptedAi: true,
      attemptedLocal: false,
    });
  });

  it("preserves abort errors without fallback", async () => {
    const error = new Error("SMS parse aborted");
    error.name = "AbortError";
    mockParseSmsWithAi.mockRejectedValueOnce(error);

    await expect(parseSmsWithOrchestrator([candidate()], context)).rejects.toBe(
      error
    );
  });

  it("does not expose raw payload values through diagnostics", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(JSON.stringify(result.diagnostics)).not.toContain("CARREFOUR");
    expect(JSON.stringify(result.diagnostics)).not.toContain("250");
    expect(JSON.stringify(result.diagnostics)).not.toContain("NBE");
  });

  it("returns safe aggregate diagnostics for local-parser mode", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(result.diagnostics).toEqual({
      mode: "local-primary",
      attemptedAi: false,
      attemptedLocal: true,
      candidateCount: 1,
      resultCount: 1,
      matchedPatternIds: ["nbe-debit-purchase"],
      runtimeScopeCounts: { dev_test: 1 },
    });
  });

  it("blocks local-parser mode when AI transaction suggestions are disabled", async () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";
    mockGetAiProcessingConsentStatus.mockResolvedValueOnce({
      isConsented: false,
    });

    const result = await parseSmsWithOrchestrator([candidate()], context);

    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      transactions: [],
      hasError: true,
      isRetryable: false,
    });
    expect(result.diagnostics).toMatchObject({
      mode: "local-primary",
      attemptedAi: false,
      attemptedLocal: false,
    });
  });
});
