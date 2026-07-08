import type { ParsedSmsTransaction, SmsFingerprintInput } from "@monyvi/logic";
import type {
  AiParseResult,
  ParseSmsContext,
  SmsCandidate,
} from "@/services/ai-sms-parser-service";

const mockReconcileLiveDetectionPreference = jest.fn<Promise<boolean>, []>();
const mockSetLiveDetectionEnabled = jest.fn<Promise<void>, [boolean]>();
const mockSetAutoConfirm = jest.fn<Promise<void>, [boolean]>();
const mockGetAiProcessingConsentStatus = jest.fn<
  Promise<{ isConsented: boolean }>,
  []
>();
const mockHasExistingSmsFingerprint = jest.fn<Promise<boolean>, [string]>();
const mockParseSmsWithAi = jest.fn<
  Promise<AiParseResult>,
  [readonly SmsCandidate[], ParseSmsContext]
>();
const mockComputeSmsFingerprint = jest.fn<
  Promise<string>,
  [SmsFingerprintInput]
>();
const mockIsLikelyFinancialSms = jest.fn<boolean, [string]>();

jest.mock("@monyvi/logic", () => ({
  computeSmsFingerprint: (input: SmsFingerprintInput): Promise<string> =>
    mockComputeSmsFingerprint(input),
  isLikelyFinancialSms: (body: string): boolean =>
    mockIsLikelyFinancialSms(body),
  SUPPORTED_CURRENCIES: [{ code: "EGP" }],
}));

jest.mock("@/services/sms-live-detection-handler", () => ({
  reconcileLiveDetectionPreference: (): Promise<boolean> =>
    mockReconcileLiveDetectionPreference(),
  setLiveDetectionEnabled: (enabled: boolean): Promise<void> =>
    mockSetLiveDetectionEnabled(enabled),
  setAutoConfirm: (enabled: boolean): Promise<void> =>
    mockSetAutoConfirm(enabled),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: (): Promise<{ isConsented: boolean }> =>
    mockGetAiProcessingConsentStatus(),
}));

jest.mock("@/services/sms-dedup-service", () => ({
  hasExistingSmsFingerprint: (smsFingerprint: string): Promise<boolean> =>
    mockHasExistingSmsFingerprint(smsFingerprint),
}));

jest.mock("@/services/ai-sms-parser-service", () => ({
  parseSmsWithAi: (
    ...args: [readonly SmsCandidate[], ParseSmsContext]
  ): Promise<AiParseResult> => mockParseSmsWithAi(...args),
  isAiConsentRequiredError: (error: unknown): boolean =>
    error instanceof Error && error.name === "AiConsentRequiredError",
}));

jest.mock("@monyvi/db", () => ({
  database: {
    get: jest.fn(() => ({})),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: jest.fn(),
    notEq: jest.fn(),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(() =>
    Promise.resolve({
      queryAccessibleCategories: () => ({
        fetch: jest.fn(() => Promise.resolve([])),
      }),
    })
  ),
}));

import { processLiveSmsEvent } from "@/services/sms-live-processor";

function createParsedTransaction(
  smsFingerprint = "hash-live"
): ParsedSmsTransaction {
  return {
    amount: 850,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Hyper Market",
    date: new Date("2026-05-10T12:00:00.000Z"),
    categoryId: "category-1",
    categoryDisplayName: "Shopping",
    confidence: 0.94,
    originLabel: "QNB",
    source: "SMS",
    smsFingerprint,
    senderDisplayName: "QNB",
    rawSmsBody: "Purchase EGP 850 at Hyper Market using card ending 1234",
  };
}

describe("sms-live-processor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReconcileLiveDetectionPreference.mockResolvedValue(true);
    mockSetLiveDetectionEnabled.mockResolvedValue(undefined);
    mockSetAutoConfirm.mockResolvedValue(undefined);
    mockGetAiProcessingConsentStatus.mockResolvedValue({ isConsented: true });
    mockHasExistingSmsFingerprint.mockResolvedValue(false);
    mockComputeSmsFingerprint.mockResolvedValue("hash-live");
    mockIsLikelyFinancialSms.mockReturnValue(true);
    mockParseSmsWithAi.mockResolvedValue({
      transactions: [createParsedTransaction()],
      hasError: false,
    });
  });

  it("uses AI parsing and preserves the computed SMS fingerprint", async () => {
    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    expect(result.status).toBe("parsed");
    expect(result.smsFingerprint).toBe("hash-live");
    expect(result.transactions).toEqual([
      expect.objectContaining({ smsFingerprint: "hash-live" }),
    ]);
    expect(mockComputeSmsFingerprint).toHaveBeenCalledWith({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      receivedAtMs: 1778414400000,
    });
    const parseCall = mockParseSmsWithAi.mock.calls[0];
    expect(parseCall).toBeDefined();

    const [candidates, context] = parseCall;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      smsFingerprint: "hash-live",
      message: {
        address: "QNB",
        body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      },
    });
    expect(context.supportedCurrencies).toEqual(["EGP"]);
  });

  it("skips AI when the SMS fingerprint already exists locally", async () => {
    mockHasExistingSmsFingerprint.mockResolvedValue(true);

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "headless",
    });

    expect(result.status).toBe("duplicate");
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent events with the same SMS fingerprint before AI parsing", async () => {
    const releaseDedupChecks: Array<() => void> = [];
    mockHasExistingSmsFingerprint.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releaseDedupChecks.push(() => resolve(false));
        })
    );

    const first = processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });
    const second = processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (releaseDedupChecks.length > 0) break;
      await Promise.resolve();
    }
    for (const releaseDedupCheck of releaseDedupChecks) {
      releaseDedupCheck();
    }

    const results = await Promise.all([first, second]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "duplicate",
      "parsed",
    ]);
    expect(mockParseSmsWithAi).toHaveBeenCalledTimes(1);
  });

  it("returns ai_failed when the AI parser reports a recoverable failure", async () => {
    mockParseSmsWithAi.mockResolvedValue({
      transactions: [],
      hasError: true,
    });

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "headless",
    });

    expect(result.status).toBe("ai_failed");
  });

  it("disables live detection when the Edge parser rejects for missing AI consent", async () => {
    const consentError = new Error("AI processing consent required");
    consentError.name = "AiConsentRequiredError";
    mockParseSmsWithAi.mockRejectedValueOnce(consentError);

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    expect(result.status).toBe("disabled");
    expect(result.isRetryable).toBeUndefined();
    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoConfirm).toHaveBeenCalledWith(false);
  });

  it("returns infrastructure_error when consent-required cleanup fails", async () => {
    const consentError = new Error("AI processing consent required");
    consentError.name = "AiConsentRequiredError";
    mockParseSmsWithAi.mockRejectedValueOnce(consentError);
    mockSetLiveDetectionEnabled.mockRejectedValueOnce(
      new Error("settings write failed")
    );

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    expect(result.status).toBe("infrastructure_error");
    expect(result.smsFingerprint).toBe("hash-live");
    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoConfirm).not.toHaveBeenCalledWith(false);
  });

  it("returns infrastructure_error when local deduplication fails", async () => {
    mockHasExistingSmsFingerprint.mockRejectedValue(
      new Error("database failed")
    );

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "headless",
    });

    expect(result.status).toBe("infrastructure_error");
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("does not parse when live detection is no longer enabled", async () => {
    mockReconcileLiveDetectionPreference.mockResolvedValue(false);

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "headless",
    });

    expect(result.status).toBe("disabled");
    expect(mockComputeSmsFingerprint).not.toHaveBeenCalled();
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("ignores non-financial SMS only after live detection consent is valid", async () => {
    mockIsLikelyFinancialSms.mockReturnValue(false);

    const result = await processLiveSmsEvent({
      sender: "FRIEND",
      body: "Dinner tonight?",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    expect(result.status).toBe("ignored");
    expect(mockReconcileLiveDetectionPreference).toHaveBeenCalledTimes(1);
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(1);
    expect(mockIsLikelyFinancialSms).toHaveBeenCalledWith("Dinner tonight?");
    expect(mockComputeSmsFingerprint).not.toHaveBeenCalled();
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("disables stale live detection before filtering SMS bodies after consent revocation", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValue({ isConsented: false });
    mockIsLikelyFinancialSms.mockReturnValue(false);

    const result = await processLiveSmsEvent({
      sender: "FRIEND",
      body: "Dinner tonight?",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    expect(result.status).toBe("disabled");
    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoConfirm).toHaveBeenCalledWith(false);
    expect(mockIsLikelyFinancialSms).not.toHaveBeenCalled();
    expect(mockComputeSmsFingerprint).not.toHaveBeenCalled();
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("does not parse and disables live detection when AI consent is revoked", async () => {
    mockGetAiProcessingConsentStatus.mockResolvedValue({ isConsented: false });

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "headless",
    });

    expect(result.status).toBe("disabled");
    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoConfirm).toHaveBeenCalledWith(false);
    expect(mockComputeSmsFingerprint).not.toHaveBeenCalled();
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("rechecks AI consent before parsing the SMS body", async () => {
    mockGetAiProcessingConsentStatus
      .mockResolvedValueOnce({ isConsented: true })
      .mockResolvedValueOnce({ isConsented: false });

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    expect(result.status).toBe("disabled");
    expect(result.smsFingerprint).toBe("hash-live");
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(2);
    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoConfirm).toHaveBeenCalledWith(false);
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });

  it("does not return parsed live SMS when AI consent is revoked during parsing", async () => {
    mockGetAiProcessingConsentStatus
      .mockResolvedValueOnce({ isConsented: true })
      .mockResolvedValueOnce({ isConsented: true })
      .mockResolvedValueOnce({ isConsented: false });

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "foreground",
    });

    expect(result.status).toBe("disabled");
    expect(result.transactions).toEqual([]);
    expect(mockParseSmsWithAi).toHaveBeenCalledTimes(1);
    expect(mockSetLiveDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockSetAutoConfirm).toHaveBeenCalledWith(false);
  });

  it("returns infrastructure_error when AI consent lookup fails", async () => {
    mockGetAiProcessingConsentStatus.mockRejectedValue(
      new Error("profile unavailable")
    );

    const result = await processLiveSmsEvent({
      sender: "QNB",
      body: "Purchase EGP 850 at Hyper Market using card ending 1234",
      timestamp: 1778414400000,
      deliveryMode: "headless",
    });

    expect(result.status).toBe("infrastructure_error");
    expect(mockComputeSmsFingerprint).not.toHaveBeenCalled();
    expect(mockParseSmsWithAi).not.toHaveBeenCalled();
  });
});
