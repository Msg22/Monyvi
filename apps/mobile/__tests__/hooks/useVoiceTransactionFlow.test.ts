import { act, renderHook } from "@testing-library/react-native";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";
import { parseVoiceWithAi } from "@/services/ai-voice-parser-service";
import { getAiProcessingConsentStatus } from "@/services/profile-service";
import { router } from "expo-router";

const mockRecorder = {
  audioUri: "file://completed.m4a",
  discard: jest.fn<Promise<void>, []>(),
  durationMs: 2000,
  hasPermission: true,
  pause: jest.fn<void, []>(),
  requestPermission: jest.fn<Promise<boolean>, []>(),
  reset: jest.fn<Promise<void>, []>(),
  resume: jest.fn<void, []>(),
  start: jest.fn<Promise<void>, []>(),
  status: "completed",
  stop: jest.fn<Promise<{ uri: string }>, []>(),
};

jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: () => mockRecorder,
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  isVoiceParserError: (result: object): boolean => "kind" in result,
  parseVoiceWithAi: jest.fn(),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
}));

const mockParseVoiceWithAi = parseVoiceWithAi as jest.MockedFunction<
  typeof parseVoiceWithAi
>;
const mockGetAiProcessingConsentStatus =
  getAiProcessingConsentStatus as jest.MockedFunction<
    typeof getAiProcessingConsentStatus
  >;
const mockRouterPush = router.push as jest.Mock;

describe("useVoiceTransactionFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.discard.mockResolvedValue(undefined);
    mockRecorder.reset.mockResolvedValue(undefined);
    mockRecorder.requestPermission.mockResolvedValue(true);
    mockRecorder.start.mockResolvedValue(undefined);
    mockRecorder.stop.mockResolvedValue({ uri: "file://stopped.m4a" });
    mockGetAiProcessingConsentStatus.mockResolvedValue({
      consent: {
        consentedAt: "2026-07-07T12:00:00.000Z",
        revokedAt: null,
        version: 1,
      },
      isConsented: true,
    });
    mockParseVoiceWithAi.mockResolvedValue({
      detectedLanguage: "en",
      originalTranscript: "paid 20",
      transcript: "paid 20",
      transactions: [
        {
          amount: 20,
          currency: "EGP",
          type: "EXPENSE",
          date: new Date("2026-07-07T12:00:00.000Z"),
          categoryId: "category-1",
          categoryDisplayName: "Shopping",
          confidence: 0.9,
          originLabel: "Voice",
          source: "VOICE",
        },
      ],
    });
  });

  it("does not navigate with AI results when consent is revoked during parsing", async () => {
    const ensureAiProcessingConsent = jest.fn<Promise<boolean>, []>();
    mockGetAiProcessingConsentStatus
      .mockResolvedValueOnce({
        consent: {
          consentedAt: "2026-07-07T12:00:00.000Z",
          revokedAt: null,
          version: 1,
        },
        isConsented: true,
      })
      .mockResolvedValueOnce({
        consent: {
          consentedAt: "2026-07-07T12:00:00.000Z",
          revokedAt: "2026-07-07T12:01:00.000Z",
          version: 1,
        },
        isConsented: false,
      });
    const { result } = renderHook(() =>
      useVoiceTransactionFlow({
        accounts: [],
        categories: "",
        categoryRecords: [],
        ensureAiProcessingConsent,
        preferredCurrency: "EGP",
      })
    );

    await act(async () => {
      await result.current.submitRecording();
    });

    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    expect(ensureAiProcessingConsent).not.toHaveBeenCalled();
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(2);
    expect(mockRecorder.discard).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("idle");
  });
});
