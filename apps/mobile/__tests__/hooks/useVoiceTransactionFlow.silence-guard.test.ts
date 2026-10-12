import { act, renderHook } from "@testing-library/react-native";
import type {
  AudioMeteringSummary,
  VoiceAvailabilitySnapshot,
} from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";
import { getAiProcessingConsentStatus } from "@/services/profile-service";
import type { VoiceRecorderStopResult } from "@/hooks/useVoiceRecorder";

const mockPush = jest.fn();
const mockRecorderStart = jest.fn(
  (options?: { readonly onStarted?: () => void }): Promise<void> => {
    options?.onStarted?.();
    return Promise.resolve();
  }
);
const mockRecorderPause = jest.fn();
const mockRecorderResume = jest.fn();
const mockRecorderStop = jest.fn<Promise<VoiceRecorderStopResult | null>, []>();
const mockRecorderDiscard = jest.fn().mockResolvedValue(undefined);
const mockRecorderReset = jest.fn();
const mockRequestPermission = jest.fn();
const mockRequestPermissionStatus = jest.fn();
const mockParseVoiceWithAi = jest.fn<Promise<unknown>, unknown[]>();
const mockRefresh = jest.fn();
const mockRandomUUID = jest.fn<string, []>();
let mockUserId: string | null = "user-1";

let mockMeteringSnapshot: AudioMeteringSummary | null = null;
const recorderState = {
  status: "recording",
  durationMs: 2000,
  isRecording: true,
  audioUri: "file:///tmp/recording.m4a",
  hasPermission: true,
};

const alwaysAvailableSnapshot: VoiceAvailabilitySnapshot = {
  serverNow: "2026-07-07T12:00:00.000Z",
  timeZone: "Africa/Cairo",
  dailyLimit: null,
  remaining: null,
  resetAt: null,
  reason: null,
  availableAt: null,
  burstAvailableAt: null,
  policyVersion: "test",
};

const alwaysAvailableVoiceAvailability: UseVoiceAiAvailabilityResult = {
  availability: alwaysAvailableSnapshot,
  isLoading: false,
  error: null,
  refresh: mockRefresh,
  reconcileAuthoritativeSnapshot: (): void => {},
};

jest.mock("i18next", () => ({
  t: (key: string): string => {
    const messages: Record<string, string> = {
      "transactions:voice_recording_silent":
        "We couldn’t hear anything. Please try recording again.",
      "transactions:voice_recording_too_short":
        "Recording too short. Please speak for at least 1.5 seconds.",
      "transactions:voice_recording_finalize_failed":
        "Failed to finalize recording. Please try again.",
    };
    return messages[key] ?? key;
  },
}));

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockRandomUUID(),
}));

jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: (): {
    readonly userId: string | null;
    readonly isResolvingUser: boolean;
  } => ({
    userId: mockUserId,
    isResolvingUser: false,
  }),
}));

jest.mock("@/utils/device-time-zone", () => ({
  getDeviceTimeZone: (): string => "Africa/Cairo",
}));

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
    meteringSnapshot: mockMeteringSnapshot,
    start: mockRecorderStart,
    pause: mockRecorderPause,
    resume: mockRecorderResume,
    stop: mockRecorderStop,
    discard: mockRecorderDiscard,
    reset: mockRecorderReset,
    requestPermission: mockRequestPermission,
    requestPermissionStatus: mockRequestPermissionStatus,
    permissionStatus: "granted",
    refreshPermission: (): Promise<string> => Promise.resolve("granted"),
  }),
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (...args: unknown[]): Promise<unknown> =>
    mockParseVoiceWithAi(...args),
  isVoiceParserError: (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    !("transactions" in value),
  isVoiceQuotaParserError: (value: unknown): boolean =>
    typeof value === "object" && value !== null && "availability" in value,
}));

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: jest.fn(),
}));

const mockGetAiProcessingConsentStatus =
  getAiProcessingConsentStatus as jest.MockedFunction<
    typeof getAiProcessingConsentStatus
  >;

function renderVoiceFlow(): ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceTransactionFlow>, undefined>
> {
  return renderHook(() =>
    useVoiceTransactionFlow({
      preferredCurrency: "EGP",
      categories: "",
      accounts: [],
      categoryRecords: [],
      voiceAvailability: alwaysAvailableVoiceAvailability,
    })
  );
}

describe("useVoiceTransactionFlow — On-Device Silence Guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "user-1";
    mockMeteringSnapshot = null;
    recorderState.status = "recording";
    recorderState.durationMs = 2000;
    mockRandomUUID.mockReturnValue("11111111-1111-4111-8111-111111111111");
    mockGetAiProcessingConsentStatus.mockResolvedValue({
      consent: {
        consentedAt: "2026-07-07T12:00:00.000Z",
        revokedAt: null,
        version: "2026-07-ai-processing-v1",
      },
      isConsented: true,
      userId: "user-1",
    });
    mockRefresh.mockResolvedValue(alwaysAvailableSnapshot);
    mockRecorderStart.mockImplementation(
      (options?: { readonly onStarted?: () => void }): Promise<void> => {
        options?.onStarted?.();
        return Promise.resolve();
      }
    );
    mockRecorderStop.mockImplementation(
      (): Promise<VoiceRecorderStopResult | null> =>
        Promise.resolve({
          uri: "file:///tmp/recording.m4a",
          durationMs: 2000,
          metering: mockMeteringSnapshot,
        })
    );
  });

  const createDenseSilentMetering = (): AudioMeteringSummary => ({
    validSampleCount: 15,
    hasAudibleSample: false,
    hasSentinelOrPoison: false,
    firstSampleActiveMs: 50,
    lastSampleActiveMs: 1950,
    maxActiveGapMs: 100,
    activeDurationMs: 2000,
  });

  it("locally rejects clear silence, cleans audio, clears identity, sets approved copy, and invokes ZERO parser calls", async (): Promise<void> => {
    mockMeteringSnapshot = createDenseSilentMetering();

    const { result } = renderVoiceFlow();

    // Start flow with approved availabilitySnapshot to avoid startup refresh
    await act(async (): Promise<void> => {
      await result.current.startFlow({
        availabilitySnapshot: alwaysAvailableSnapshot,
      });
    });

    // Submit the recording
    await act(async (): Promise<void> => {
      await result.current.submitRecording();
    });

    // Must discard the temporary audio file
    expect(mockRecorderDiscard).toHaveBeenCalled();

    // Status becomes error with the approved localized message
    expect(result.current.flowStatus).toBe("error");
    expect(result.current.errorMessage).toBe(
      "We couldn’t hear anything. Please try recording again."
    );

    // ZERO calls to parseVoiceWithAi!
    expect(mockParseVoiceWithAi).not.toHaveBeenCalled();

    // ZERO calls to pre-provider availability refresh attributable to rejected audio
    expect(mockRefresh).not.toHaveBeenCalled();

    // Submission retry is not allowed for silence reject (user should do a fresh recording or use manual)
    expect(result.current.canRetrySubmission).toBe(false);
  });

  it("fails open and submits to server when an audible sample (>= -70.0 dBFS) was observed", async (): Promise<void> => {
    mockMeteringSnapshot = {
      ...createDenseSilentMetering(),
      hasAudibleSample: true, // Audio contained audible speech or noise
    };

    mockParseVoiceWithAi.mockResolvedValue({
      transactions: [{ id: "tx-1", amount: 50 }],
      transcript: "spent 50 pounds",
      originalTranscript: "spent 50 pounds",
      detectedLanguage: "en",
    });

    const { result } = renderVoiceFlow();

    await act(async (): Promise<void> => {
      await result.current.startFlow({
        availabilitySnapshot: alwaysAvailableSnapshot,
      });
    });

    await act(async (): Promise<void> => {
      await result.current.submitRecording();
    });

    // Proceeded to parser!
    expect(mockParseVoiceWithAi).toHaveBeenCalled();
  });

  it("fails open and submits to server when Android sentinel -160.0 dBFS poisoned the capture", async (): Promise<void> => {
    mockMeteringSnapshot = {
      ...createDenseSilentMetering(),
      hasSentinelOrPoison: true, // Floor or driver error
    };

    mockParseVoiceWithAi.mockResolvedValue({
      transactions: [],
      transcript: "",
      originalTranscript: "",
      detectedLanguage: "en",
    });

    const { result } = renderVoiceFlow();

    await act(async (): Promise<void> => {
      await result.current.startFlow({
        availabilitySnapshot: alwaysAvailableSnapshot,
      });
    });

    await act(async (): Promise<void> => {
      await result.current.submitRecording();
    });

    // Proceeded to parser!
    expect(mockParseVoiceWithAi).toHaveBeenCalled();
  });

  it("fails open when metering snapshot is null or unmetered (legacy / mock recorder compatibility)", async (): Promise<void> => {
    mockMeteringSnapshot = null; // No metering data

    mockParseVoiceWithAi.mockResolvedValue({
      transactions: [{ id: "tx-1", amount: 100 }],
      transcript: "groceries 100",
      originalTranscript: "groceries 100",
      detectedLanguage: "en",
    });

    const { result } = renderVoiceFlow();

    await act(async (): Promise<void> => {
      await result.current.startFlow({
        availabilitySnapshot: alwaysAvailableSnapshot,
      });
    });

    await act(async (): Promise<void> => {
      await result.current.submitRecording();
    });

    // Proceeded to parser safely!
    expect(mockParseVoiceWithAi).toHaveBeenCalled();
  });

  it("allows fresh retry after silence rejection with clean new identity and unblocks Manual mode", async (): Promise<void> => {
    mockMeteringSnapshot = createDenseSilentMetering();

    const { result } = renderVoiceFlow();

    await act(async (): Promise<void> => {
      await result.current.startFlow({
        availabilitySnapshot: alwaysAvailableSnapshot,
      });
    });

    await act(async (): Promise<void> => {
      await result.current.submitRecording();
    });

    expect(result.current.flowStatus).toBe("error");
    // Manual navigation is unblocked (not locked in recording/analyzing)
    expect(result.current.isModeSwitchLocked).toBe(false);

    // Fresh retry with new UUID
    mockRandomUUID.mockReturnValue("22222222-2222-4222-8222-222222222222");
    await act(async (): Promise<void> => {
      await result.current.retryRecording();
    });

    // Started fresh recording with new identity
    expect(mockRecorderStart).toHaveBeenCalledTimes(2);

    // Now submit the new recording with an audible capture
    mockMeteringSnapshot = {
      ...createDenseSilentMetering(),
      hasAudibleSample: true,
    };
    mockParseVoiceWithAi.mockResolvedValueOnce({
      transactions: [{ id: "tx-retry-audible", amount: 150 }],
      transcript: "salary 150",
      originalTranscript: "salary 150",
      detectedLanguage: "en",
    });

    await act(async (): Promise<void> => {
      await result.current.submitRecording();
    });

    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    const parsedPayload = (
      mockParseVoiceWithAi.mock.calls[0] as [{ requestKey: string }]
    )[0];
    expect(parsedPayload.requestKey).toBe(
      "22222222-2222-4222-8222-222222222222"
    );
  });

  it("retains key and does not re-meter on parser network retry for audible captures", async (): Promise<void> => {
    mockMeteringSnapshot = {
      ...createDenseSilentMetering(),
      hasAudibleSample: true,
    };

    mockParseVoiceWithAi.mockResolvedValueOnce({
      kind: "network",
      message: "Network connection lost. Please try again.",
      retryableSameRequest: true,
    });

    const { result } = renderVoiceFlow();

    await act(async (): Promise<void> => {
      await result.current.startFlow({
        availabilitySnapshot: alwaysAvailableSnapshot,
      });
    });

    await act(async (): Promise<void> => {
      await result.current.submitRecording();
    });

    expect(result.current.flowStatus).toBe("error");
    expect(result.current.canRetrySubmission).toBe(true);

    // Initial submission called parser once
    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    const initialRequestKey = (
      mockParseVoiceWithAi.mock.calls[0] as [{ requestKey: string }]
    )[0].requestKey;

    mockParseVoiceWithAi.mockResolvedValueOnce({
      transactions: [{ id: "tx-retry", amount: 25 }],
      transcript: "coffee 25",
      originalTranscript: "coffee 25",
      detectedLanguage: "en",
    });

    // Retry submission reuses retained audio and key without starting another recording
    await act(async (): Promise<void> => {
      await result.current.retrySubmission();
    });

    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(2);
    const retryRequestKey = (
      mockParseVoiceWithAi.mock.calls[1] as [{ requestKey: string }]
    )[0].requestKey;
    expect(retryRequestKey).toBe(initialRequestKey);
    // Did not invoke native record start again
    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
  });

  it("aborts cleanly without showing error or uploading if account switched during finalization", async (): Promise<void> => {
    mockMeteringSnapshot = createDenseSilentMetering();

    let resolveStop: (
      result: VoiceRecorderStopResult | null
    ) => void = () => {};
    const deferredStopPromise = new Promise<VoiceRecorderStopResult | null>(
      (resolve) => {
        resolveStop = resolve;
      }
    );

    mockRecorderStop.mockImplementationOnce(() => deferredStopPromise);

    const { result, rerender } = renderVoiceFlow();

    await act(async (): Promise<void> => {
      await result.current.startFlow({
        availabilitySnapshot: alwaysAvailableSnapshot,
      });
    });

    let submitPromise: Promise<void> | null = null;
    act((): void => {
      submitPromise = result.current.submitRecording();
    });

    // Switch account and rerender while stop() is pending
    mockUserId = "user-2";
    rerender(undefined);

    // Now resolve deferred stop
    await act(async (): Promise<void> => {
      resolveStop({
        uri: "file:///tmp/recording.m4a",
        durationMs: 2000,
        metering: mockMeteringSnapshot,
      });
      await submitPromise;
    });

    // Must NOT call parseVoiceWithAi
    expect(mockParseVoiceWithAi).not.toHaveBeenCalled();
    // Must NOT set silence error for wrong account
    expect(result.current.errorMessage).toBeNull();
    // Audio was discarded
    expect(mockRecorderDiscard).toHaveBeenCalled();
  });
});
