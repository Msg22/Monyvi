import { act, renderHook } from "@testing-library/react-native";
import { Linking } from "react-native";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";
import { getAiProcessingConsentStatus } from "@/services/profile-service";

const mockPush = jest.fn();
const mockRecorderStart = jest.fn();
const mockRecorderPause = jest.fn();
const mockRecorderResume = jest.fn();
const mockRecorderStop = jest.fn();
const mockRecorderDiscard = jest.fn();
const mockRecorderReset = jest.fn();
const mockRequestPermission = jest.fn();
const mockParseVoiceWithAi = jest.fn();
const mockOpenSettings = jest.fn();

jest.mock("i18next", () => ({
  t: (key: string): string => {
    const messages: Record<string, string> = {
      "common:voice_microphone_permission_error":
        "Microphone permission is required for voice recording. Please enable it in Settings.",
      "common:voice_recording_start_failed":
        "Couldn't start recording. Please try again.",
      "common:voice_settings_open_failed":
        "Couldn't open Settings. Please open it from your device.",
    };
    return messages[key] ?? key;
  },
}));

const recorderState = {
  status: "idle",
  durationMs: 0,
  isRecording: false,
  audioUri: null as string | null,
  hasPermission: false,
};

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]): void => {
      mockPush(...args);
    },
  },
}));

jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: (): unknown => ({
    ...recorderState,
    start: mockRecorderStart,
    pause: mockRecorderPause,
    resume: mockRecorderResume,
    stop: mockRecorderStop,
    discard: mockRecorderDiscard,
    reset: mockRecorderReset,
    requestPermission: mockRequestPermission,
  }),
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (...args: unknown[]): unknown =>
    mockParseVoiceWithAi(...args),
  isVoiceParserError: (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    !("transactions" in value),
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: jest.fn(),
}));

const mockGetAiProcessingConsentStatus =
  getAiProcessingConsentStatus as jest.MockedFunction<
    typeof getAiProcessingConsentStatus
  >;

function renderVoiceFlow(
  ensureAiProcessingConsent?: () => boolean | Promise<boolean>
): ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceTransactionFlow>, undefined>
> {
  return renderHook(() =>
    useVoiceTransactionFlow({
      preferredCurrency: "EGP",
      categories: "",
      accounts: [],
      categoryRecords: [],
      ensureAiProcessingConsent,
    })
  );
}

function mockActiveAiConsent(): void {
  mockGetAiProcessingConsentStatus.mockResolvedValue({
    consent: {
      consentedAt: "2026-07-07T12:00:00.000Z",
      revokedAt: null,
      version: 1,
    },
    isConsented: true,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, "openSettings").mockImplementation(mockOpenSettings);
  recorderState.status = "idle";
  recorderState.durationMs = 0;
  recorderState.isRecording = false;
  recorderState.audioUri = null;
  recorderState.hasPermission = false;
  mockRecorderStart.mockResolvedValue(undefined);
  mockRecorderDiscard.mockResolvedValue(undefined);
  mockRecorderReset.mockResolvedValue(undefined);
  mockRecorderStop.mockResolvedValue({ uri: "file://stopped.m4a" });
  mockRequestPermission.mockResolvedValue(false);
  mockOpenSettings.mockResolvedValue(undefined);
  mockActiveAiConsent();
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

describe("useVoiceTransactionFlow", () => {
  it("does not start recording from retry when microphone permission is still denied", async (): Promise<void> => {
    const { result } = renderVoiceFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.errorMessage).toContain("Microphone permission");
    expect(result.current.isMicrophonePermissionError).toBe(true);
    expect(mockRecorderStart).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retryRecording();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.errorMessage).toContain("Microphone permission");
    expect(result.current.isMicrophonePermissionError).toBe(true);
    expect(mockRecorderStart).not.toHaveBeenCalled();
  });

  it("opens device settings for microphone permission recovery", async (): Promise<void> => {
    const { result } = renderVoiceFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    await act(async () => {
      await result.current.openMicrophoneSettings();
    });

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(result.current.flowStatus).toBe("idle");
    expect(result.current.isOverlayVisible).toBe(false);
    expect(result.current.errorMessage).toBeNull();
  });

  it("shows a recovery error when opening device settings fails", async (): Promise<void> => {
    mockOpenSettings.mockRejectedValueOnce(new Error("settings unavailable"));
    const { result } = renderVoiceFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    await act(async () => {
      await result.current.openMicrophoneSettings();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.isOverlayVisible).toBe(true);
    expect(result.current.errorMessage).toBe(
      "Couldn't open Settings. Please open it from your device."
    );
    expect(result.current.isMicrophonePermissionError).toBe(false);
  });

  it("prevents overlapping retry recording starts", async (): Promise<void> => {
    const { result, rerender } = renderVoiceFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    recorderState.hasPermission = true;
    rerender(undefined);

    await act(async () => {
      const firstRetry = result.current.retryRecording();
      const secondRetry = result.current.retryRecording();
      await Promise.all([firstRetry, secondRetry]);
    });

    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
  });

  it("surfaces recorder start failures during retry", async (): Promise<void> => {
    mockRecorderStart.mockRejectedValueOnce(new Error("recorder failed"));
    const { result, rerender } = renderVoiceFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    recorderState.hasPermission = true;
    rerender(undefined);

    await act(async () => {
      await result.current.retryRecording();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.errorMessage).toBe(
      "Couldn't start recording. Please try again."
    );
  });

  it("does not navigate with AI results when consent is revoked during parsing", async (): Promise<void> => {
    recorderState.status = "completed";
    recorderState.durationMs = 2000;
    recorderState.audioUri = "file://completed.m4a";
    recorderState.hasPermission = true;
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
    const { result } = renderVoiceFlow(ensureAiProcessingConsent);

    await act(async () => {
      await result.current.submitRecording();
    });

    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    expect(ensureAiProcessingConsent).not.toHaveBeenCalled();
    expect(mockGetAiProcessingConsentStatus).toHaveBeenCalledTimes(2);
    expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("idle");
  });
});
