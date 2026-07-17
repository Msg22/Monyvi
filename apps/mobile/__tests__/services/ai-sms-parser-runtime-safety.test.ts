import {
  parseSmsWithAi,
  type ParseSmsContext,
  type SmsCandidate,
} from "@/services/ai-sms-parser-service";

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
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const originalEnv = process.env;
const input: SmsCandidate = {
  message: {
    id: "sms-1",
    address: "NBE",
    body: "Purchase EGP 25 at Shop",
    date: 1775658180000,
    read: false,
  },
  smsFingerprint: "fingerprint-1",
};
const context: ParseSmsContext = {
  categories: [],
  supportedCurrencies: ["EGP", "USD"],
};

describe("AI SMS parser runtime safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: "test" };
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("never invokes the real Edge parser in E2E mode", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";

    const result = await parseSmsWithAi([input], context);

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      transactions: [],
      hasError: true,
      isRetryable: false,
    });
  });

  it.each(["fixture", "hybrid-fixture"])(
    "fails closed when %s mode is requested outside E2E",
    async (parserMode) => {
      process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = parserMode;

      const result = await parseSmsWithAi([input], context);

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        transactions: [],
        hasError: true,
        isRetryable: false,
      });
    }
  );
});
