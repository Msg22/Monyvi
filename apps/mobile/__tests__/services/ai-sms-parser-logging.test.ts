import type { CategoryTreeSource } from "@monyvi/logic";
import {
  parseSmsWithAi,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";

const mockInvoke = jest.fn();

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => "logging-test-request-id",
}));
const mockLoggerWarn = jest.fn<
  void,
  [message: string, context?: Readonly<Record<string, unknown>>]
>();
const mockLoggerInfo = jest.fn<
  void,
  [message: string, context?: Readonly<Record<string, unknown>>]
>();
const mockLoggerError = jest.fn<
  void,
  [
    message: string,
    error?: unknown,
    context?: Readonly<Record<string, unknown>>,
  ]
>();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: readonly unknown[]): unknown => mockInvoke(...args),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    error: (
      message: string,
      error?: unknown,
      context?: Readonly<Record<string, unknown>>
    ): void => mockLoggerError(message, error, context),
    warn: (
      message: string,
      context?: Readonly<Record<string, unknown>>
    ): void => mockLoggerWarn(message, context),
    info: (
      message: string,
      context?: Readonly<Record<string, unknown>>
    ): void => mockLoggerInfo(message, context),
    debug: jest.fn(),
  },
}));

const context = {
  categories: [
    {
      id: "cat-other",
      systemName: "other",
      displayName: "Other",
      level: 1,
      type: "EXPENSE",
    } satisfies CategoryTreeSource,
  ],
  supportedCurrencies: ["EGP", "USD"],
};

function candidate(): SmsCandidate {
  return {
    message: {
      id: "sms-1",
      address: "NBE",
      body: "Private SMS body",
      date: 1775658180000,
      read: false,
    },
    smsFingerprint: "private-fingerprint",
  };
}

describe("ai-sms-parser-service safe logging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not forward payload-bearing unexpected errors to the logger", async () => {
    const privateBody = "PRIVATE SMS BODY EGP 999";
    mockInvoke.mockRejectedValueOnce(new Error(privateBody));

    await parseSmsWithAi([candidate()], context);

    const logged = JSON.stringify(mockLoggerError.mock.calls);
    expect(logged).not.toContain(privateBody);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "[ai-sms-parser] Unexpected error during parseSmsWithAi",
      expect.objectContaining({ message: "SMS AI parser unexpected failure" }),
      expect.objectContaining({ errorName: "Error", candidateCount: 1 })
    );
  });

  it("logs only safe reason codes for malformed and untrusted AI results", async () => {
    mockInvoke
      .mockResolvedValueOnce({
        data: { privateResponseKey: "secret" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          transactions: [
            {
              messageId: "private-missing-message-id",
              amount: 25,
              currency: "EGP",
              type: "EXPENSE",
              counterparty: "Private Merchant",
              date: "2026-04-08T12:00:00.000Z",
              categorySystemName: "shopping",
              confidenceScore: 0.9,
              isTrusted: true,
            },
            {
              messageId: "sms-1",
              amount: 25,
              currency: "USD",
              type: "EXPENSE",
              counterparty: "Private Merchant",
              date: "2026-04-08T12:00:00.000Z",
              categorySystemName: "shopping",
              confidenceScore: 0.9,
              isTrusted: false,
            },
          ],
        },
        error: null,
      });

    await parseSmsWithAi([candidate()], context);
    await parseSmsWithAi([candidate()], context);

    const logs = JSON.stringify([
      ...mockLoggerWarn.mock.calls,
      ...mockLoggerInfo.mock.calls,
    ]);
    expect(logs).toContain("transactions_array_missing");
    expect(logs).toContain("candidate_identity_unknown");
    expect(logs).toContain("ai_result_untrusted");
    expect(logs).not.toContain("privateResponseKey");
    expect(logs).not.toContain("private-missing-message-id");
    expect(logs).not.toContain("Private Merchant");
    expect(logs).not.toContain("USD");
  });
});
