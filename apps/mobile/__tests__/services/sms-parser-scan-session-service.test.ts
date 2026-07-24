const mockInitializeSmsAiScanSession = jest.fn<Promise<void>, unknown[]>();

jest.mock("@/config/e2e-test-config", () => ({
  shouldUseFixtureSmsParser: (): boolean => false,
  shouldUseLocalSmsParser: (): boolean => false,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock("@/services/ai-sms-parser-service", () => ({
  initializeSmsAiScanSession: (...args: unknown[]): Promise<void> =>
    mockInitializeSmsAiScanSession(...args),
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

import { initializeSmsParserScanSession } from "@/services/sms-parser-scan-session-service";

const context = {
  categories: [],
  supportedCurrencies: ["EGP"],
};
const requestContext = {
  scanSessionId: "scan-session-1",
  scanKind: "incremental" as const,
  scanStartedAtMs: new Date(2026, 3, 8, 14, 30).getTime(),
};

describe("sms-parser-scan-session-service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitializeSmsAiScanSession.mockResolvedValue(undefined);
  });

  it("continues local parsing when remote scan-session initialization is unavailable", async () => {
    mockInitializeSmsAiScanSession.mockRejectedValueOnce(
      new Error("SMS scan session initialization failed")
    );

    await expect(
      initializeSmsParserScanSession(
        context,
        requestContext,
        undefined,
        "user-1"
      )
    ).resolves.toBeUndefined();
  });

  it("does not swallow scan-session consent control flow", async () => {
    const consentError = new Error("AI processing consent required");
    consentError.name = "AiConsentRequiredError";
    mockInitializeSmsAiScanSession.mockRejectedValueOnce(consentError);

    await expect(
      initializeSmsParserScanSession(
        context,
        requestContext,
        undefined,
        "user-1"
      )
    ).rejects.toBe(consentError);
  });
});
