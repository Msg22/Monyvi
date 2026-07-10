export type MonyviTestMode = "off" | "e2e";
export type AiSmsParserMode = "edge" | "fixture" | "local";
export type SmsInboxMode = "device" | "fixture";

interface E2eProcessEnv {
  readonly EXPO_PUBLIC_MONYVI_TEST_MODE?: unknown;
  readonly EXPO_PUBLIC_AI_SMS_PARSER_MODE?: unknown;
  readonly EXPO_PUBLIC_SMS_INBOX_MODE?: unknown;
}

interface E2eProcess {
  readonly env?: E2eProcessEnv;
}

function stringEnv(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getProcessEnv(): E2eProcessEnv | undefined {
  return (globalThis as { readonly process?: E2eProcess }).process?.env;
}

const publicMonyviTestModeEnv = stringEnv(
  process.env.EXPO_PUBLIC_MONYVI_TEST_MODE
);
const publicAiSmsParserModeEnv = stringEnv(
  process.env.EXPO_PUBLIC_AI_SMS_PARSER_MODE
);
const publicSmsInboxModeEnv = stringEnv(process.env.EXPO_PUBLIC_SMS_INBOX_MODE);

function getNodeEnv(): string | undefined {
  return stringEnv(process.env.NODE_ENV);
}

function getPublicMonyviTestModeEnv(): string | undefined {
  if (getNodeEnv() === "test") {
    return stringEnv(getProcessEnv()?.EXPO_PUBLIC_MONYVI_TEST_MODE);
  }

  return publicMonyviTestModeEnv;
}

function getPublicAiSmsParserModeEnv(): string | undefined {
  if (getNodeEnv() === "test") {
    return stringEnv(getProcessEnv()?.EXPO_PUBLIC_AI_SMS_PARSER_MODE);
  }

  return publicAiSmsParserModeEnv;
}

function getPublicSmsInboxModeEnv(): string | undefined {
  if (getNodeEnv() === "test") {
    return stringEnv(getProcessEnv()?.EXPO_PUBLIC_SMS_INBOX_MODE);
  }

  return publicSmsInboxModeEnv;
}

export function getMonyviTestMode(): MonyviTestMode {
  return getPublicMonyviTestModeEnv() === "e2e" ? "e2e" : "off";
}

export function getAiSmsParserMode(): AiSmsParserMode {
  const value = getPublicAiSmsParserModeEnv();
  return value === "fixture" || value === "local" ? value : "edge";
}

export function getSmsInboxMode(): SmsInboxMode {
  return getPublicSmsInboxModeEnv() === "fixture" ? "fixture" : "device";
}

export function isE2eTestMode(): boolean {
  return getMonyviTestMode() === "e2e";
}

export function shouldUseFixtureSmsParser(): boolean {
  return (
    getNodeEnv() !== "production" &&
    isE2eTestMode() &&
    getAiSmsParserMode() === "fixture"
  );
}

export function shouldUseFixtureSmsInbox(): boolean {
  const parserMode = getAiSmsParserMode();
  const isE2eFixtureInbox =
    isE2eTestMode() && (parserMode === "fixture" || parserMode === "local");
  const isDevLocalParserFixtureInbox =
    getMonyviTestMode() === "off" &&
    parserMode === "local" &&
    getSmsInboxMode() === "fixture";

  return (
    getNodeEnv() !== "production" &&
    (isE2eFixtureInbox || isDevLocalParserFixtureInbox)
  );
}

export function shouldUseLocalSmsParser(): boolean {
  return getNodeEnv() !== "production" && getAiSmsParserMode() === "local";
}
