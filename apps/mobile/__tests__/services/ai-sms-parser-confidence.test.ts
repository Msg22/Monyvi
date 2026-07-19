const mockInvoke = jest.fn();

jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: readonly unknown[]): unknown => mockInvoke(...args),
    },
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import {
  parseSmsWithAi,
  type ParseSmsContext,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";

const context: ParseSmsContext = {
  categories: [
    {
      id: "category-other",
      systemName: "other",
      displayName: "Other",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
    {
      id: "category-shopping",
      systemName: "shopping",
      displayName: "Shopping",
      level: 1,
      type: "EXPENSE",
      isSystem: true,
    },
  ],
  supportedCurrencies: ["EGP"],
};

const input: SmsCandidate = {
  message: {
    id: "sms-low-confidence",
    address: "BANK",
    body: "Purchase message",
    date: new Date(2026, 3, 8, 12).getTime(),
    read: false,
  },
  smsFingerprint: "fingerprint-low-confidence",
};

describe("AI SMS parser confidence handling", () => {
  it("keeps trusted low-confidence transactions visible for review", async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        transactions: [
          {
            messageId: input.message.id,
            amount: 25,
            currency: "EGP",
            type: "EXPENSE",
            counterparty: "Shop",
            date: "2026-04-08T12:00:00.000Z",
            categorySystemName: "shopping",
            confidenceScore: 0.3,
            isTrusted: true,
          },
        ],
      },
      error: null,
    });

    const result = await parseSmsWithAi([input], context);

    expect(result.transactions).toEqual([
      expect.objectContaining({ confidence: 0.3, counterparty: "Shop" }),
    ]);
  });
});
