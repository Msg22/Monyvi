import {
  getAiSmsParserMode,
  getMonyviTestMode,
  getSmsInboxMode,
  isE2eTestMode,
  shouldUseFixtureSmsInbox,
  shouldUseFixtureSmsParser,
  shouldUseHybridSmsParser,
  shouldUseLocalSmsParser,
  shouldBlockEdgeSmsParserInE2e,
} from "@/config/e2e-test-config";

const originalEnv = process.env;

describe("e2e-test-config", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_MONYVI_TEST_MODE;
    delete process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE;
    delete process.env.EXPO_PUBLIC_SMS_INBOX_MODE;
    process.env = { ...process.env, NODE_ENV: "test" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to production-safe mode", () => {
    expect(getMonyviTestMode()).toBe("off");
    expect(getAiSmsParserMode()).toBe("edge");
    expect(getSmsInboxMode()).toBe("device");
    expect(isE2eTestMode()).toBe(false);
    expect(shouldUseFixtureSmsInbox()).toBe(false);
    expect(shouldUseFixtureSmsParser()).toBe(false);
    expect(shouldUseLocalSmsParser()).toBe(false);
  });

  it("enables fixture parser only inside explicit E2E mode", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    expect(getMonyviTestMode()).toBe("e2e");
    expect(getAiSmsParserMode()).toBe("fixture");
    expect(isE2eTestMode()).toBe(true);
    expect(shouldUseFixtureSmsInbox()).toBe(true);
    expect(shouldUseFixtureSmsParser()).toBe(true);
  });

  it("uses fixture inbox but not fixture parser in local-parser E2E mode", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    expect(shouldUseFixtureSmsInbox()).toBe(true);
    expect(shouldUseFixtureSmsParser()).toBe(false);
    expect(shouldUseLocalSmsParser()).toBe(true);
  });

  it("uses the fixture AI behind real hybrid routing only in explicit E2E mode", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "hybrid-fixture";

    expect(getAiSmsParserMode()).toBe("hybrid-fixture");
    expect(shouldUseFixtureSmsInbox()).toBe(true);
    expect(shouldUseFixtureSmsParser()).toBe(true);
    expect(shouldUseHybridSmsParser()).toBe(true);
    expect(shouldUseLocalSmsParser()).toBe(false);
    expect(shouldBlockEdgeSmsParserInE2e()).toBe(false);
  });

  it("blocks the real Edge SMS parser in E2E mode", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";

    expect(getAiSmsParserMode()).toBe("edge");
    expect(shouldBlockEdgeSmsParserInE2e()).toBe(true);
  });

  it("fails closed when hybrid fixture mode is requested outside E2E", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "off";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "hybrid-fixture";

    expect(shouldUseFixtureSmsInbox()).toBe(false);
    expect(shouldUseFixtureSmsParser()).toBe(false);
    expect(shouldUseHybridSmsParser()).toBe(false);
  });

  it("fails closed when fixture parser is requested outside E2E mode", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "off";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "fixture";

    expect(shouldUseFixtureSmsInbox()).toBe(false);
    expect(shouldUseFixtureSmsParser()).toBe(false);
  });

  it("allows fixture inbox in normal dev only with local parser mode", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "off";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";
    process.env.EXPO_PUBLIC_SMS_INBOX_MODE = "fixture";

    expect(getSmsInboxMode()).toBe("fixture");
    expect(shouldUseFixtureSmsInbox()).toBe(true);
    expect(shouldUseLocalSmsParser()).toBe(true);
    expect(shouldUseFixtureSmsParser()).toBe(false);
  });

  it("does not allow fixture inbox in normal dev with edge parser mode", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "off";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "edge";
    process.env.EXPO_PUBLIC_SMS_INBOX_MODE = "fixture";

    expect(getSmsInboxMode()).toBe("fixture");
    expect(shouldUseFixtureSmsInbox()).toBe(false);
    expect(shouldUseLocalSmsParser()).toBe(false);
  });

  it("fails closed in production even when fixture mode is requested", () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
      EXPO_PUBLIC_MONYVI_TEST_MODE: "e2e",
      EXPO_PUBLIC_AI_SMS_PARSER_MODE: "fixture",
      EXPO_PUBLIC_SMS_INBOX_MODE: "fixture",
    };

    expect(shouldUseFixtureSmsInbox()).toBe(false);
    expect(shouldUseFixtureSmsParser()).toBe(false);
  });

  it("ignores unknown environment values", () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "staging";
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "mock";

    expect(getMonyviTestMode()).toBe("off");
    expect(getAiSmsParserMode()).toBe("edge");
  });

  it("enables local parser mode outside production", () => {
    process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE = "local";

    expect(getAiSmsParserMode()).toBe("local");
    expect(shouldUseLocalSmsParser()).toBe(true);
  });

  it("fails closed for local parser mode in production", () => {
    process.env = {
      ...process.env,
      NODE_ENV: "production",
      EXPO_PUBLIC_AI_SMS_PARSER_MODE: "local",
    };

    expect(getAiSmsParserMode()).toBe("edge");
    expect(shouldUseLocalSmsParser()).toBe(false);
  });
});
