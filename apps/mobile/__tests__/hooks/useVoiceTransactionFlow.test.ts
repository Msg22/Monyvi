import { act, renderHook } from "@testing-library/react-native";
import { Linking } from "react-native";
import type { VoiceAvailabilitySnapshot } from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
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
const mockParseVoiceWithAi = jest.fn<
  Promise<unknown>,
  Parameters<
    typeof import("@/services/ai-voice-parser-service").parseVoiceWithAi
  >
>();
const mockOpenSettings = jest.fn();
const mockRefresh = jest.fn<Promise<VoiceAvailabilitySnapshot>, []>();
const mockRandomUUID = jest.fn<string, []>();
let mockRecorderDiscardCallback = mockRecorderDiscard;
let mockUserId: string | null = "user-1";

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
    start: mockRecorderStart,
    pause: mockRecorderPause,
    resume: mockRecorderResume,
    stop: mockRecorderStop,
    discard: mockRecorderDiscardCallback,
    reset: mockRecorderReset,
    requestPermission: mockRequestPermission,
  }),
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (
    ...args: Parameters<
      typeof import("@/services/ai-voice-parser-service").parseVoiceWithAi
    >
  ): Promise<unknown> => mockParseVoiceWithAi(...args),
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

function renderVoiceFlow(
  ensureAiProcessingConsent?: () => boolean | Promise<boolean>,
  hasFreshAiProcessingConsent?: () => boolean | Promise<boolean>,
  onAiProcessingConsentRequired?: () => void | Promise<void>
): ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceTransactionFlow>, undefined>
> {
  return renderHook(() =>
    useVoiceTransactionFlow({
      preferredCurrency: "EGP",
      categories: "",
      accounts: [],
      categoryRecords: [],
      voiceAvailability: alwaysAvailableVoiceAvailability,
      ensureAiProcessingConsent,
      hasFreshAiProcessingConsent,
      onAiProcessingConsentRequired,
    })
  );
}

function mockActiveAiConsent(): void {
  mockGetAiProcessingConsentStatus.mockResolvedValue({
    consent: {
      consentedAt: "2026-07-07T12:00:00.000Z",
      revokedAt: null,
      version: "2026-07-ai-processing-v1",
    },
    isConsented: true,
    userId: "user-1",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParseVoiceWithAi.mockReset();
  mockRefresh.mockReset().mockResolvedValue(alwaysAvailableSnapshot);
  mockRandomUUID
    .mockReset()
    .mockReturnValue("11111111-1111-4111-8111-111111111111");
  mockRecorderDiscardCallback = mockRecorderDiscard;
  mockUserId = "user-1";
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

  it("prevents overlapping recording starts while AI consent is pending", async (): Promise<void> => {
    recorderState.hasPermission = true;
    const consent = createDeferred<boolean>();
    const ensureAiProcessingConsent = jest.fn(() => consent.promise);
    const { result } = renderVoiceFlow(ensureAiProcessingConsent);

    await act(async () => {
      const firstStart = result.current.startFlow();
      const secondStart = result.current.startFlow();
      consent.resolve(true);
      await Promise.all([firstStart, secondStart]);
    });

    expect(ensureAiProcessingConsent).toHaveBeenCalledTimes(1);
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
    const hasFreshAiProcessingConsent = jest
      .fn<Promise<boolean>, []>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const { result } = renderVoiceFlow(
      ensureAiProcessingConsent,
      hasFreshAiProcessingConsent
    );

    await act(async () => {
      await result.current.startFlow({ skipAiProcessingConsent: true });
      await result.current.submitRecording();
    });

    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    expect(ensureAiProcessingConsent).not.toHaveBeenCalled();
    expect(hasFreshAiProcessingConsent).toHaveBeenCalledTimes(2);
    expect(mockGetAiProcessingConsentStatus).not.toHaveBeenCalled();
    expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("idle");
  });

  it("closes the overlay when voice parsing reports missing AI consent", async (): Promise<void> => {
    recorderState.status = "completed";
    recorderState.durationMs = 2000;
    recorderState.audioUri = "file://completed.m4a";
    recorderState.hasPermission = true;
    mockParseVoiceWithAi.mockResolvedValueOnce({
      kind: "consent_required",
      message: "AI processing consent is required.",
    });
    const onAiProcessingConsentRequired = jest.fn();
    const { result } = renderVoiceFlow(
      jest.fn(),
      jest.fn(() => true),
      onAiProcessingConsentRequired
    );

    await act(async () => {
      await result.current.startFlow({ skipAiProcessingConsent: true });
      await result.current.submitRecording();
    });

    expect(result.current.flowStatus).toBe("idle");
    expect(result.current.isOverlayVisible).toBe(false);
    expect(result.current.errorMessage).toBeNull();
    expect(onAiProcessingConsentRequired).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("locks mode switching while consent awaits and releases it after refusal", async (): Promise<void> => {
    const consent = createDeferred<boolean>();
    const flow = renderVoiceFlow(() => consent.promise);
    let pending = Promise.resolve();
    act((): void => {
      pending = flow.result.current.startFlow();
    });
    expect(flow.result.current.isModeSwitchLocked).toBe(true);
    expect(mockRecorderStart).not.toHaveBeenCalled();
    await act(async (): Promise<void> => {
      consent.resolve(false);
      await pending;
    });
    expect(flow.result.current.isModeSwitchLocked).toBe(false);
  });

  it("preserves an active recording when the recorder discard callback changes", async (): Promise<void> => {
    const flow = renderVoiceFlow();
    await prepareCompletedRecording(flow);
    const latestDiscard = jest.fn<Promise<void>, []>().mockResolvedValue();
    mockRecorderDiscardCallback = latestDiscard;
    flow.rerender(undefined);
    expect(mockRecorderDiscard).not.toHaveBeenCalled();
    expect(latestDiscard).not.toHaveBeenCalled();
    await act(async (): Promise<void> => {
      await flow.result.current.submitRecording();
    });
    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    expect(latestDiscard).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("discards the recording file before navigating to successful results", async (): Promise<void> => {
    const flow = renderVoiceFlow();
    await prepareCompletedRecording(flow);
    await act(async (): Promise<void> => {
      await flow.result.current.submitRecording();
    });
    expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
    expect(mockRecorderReset).not.toHaveBeenCalled();
    expect(mockRecorderDiscard.mock.invocationCallOrder[0]).toBeLessThan(
      mockPush.mock.invocationCallOrder[0]
    );
    expect(flow.result.current.canRetrySubmission).toBe(false);
  });

  it.each(["daily_limit", "burst_limit"] as const)(
    "replays the exact retained request despite fresh %s availability",
    async (reason): Promise<void> => {
      mockParseVoiceWithAi.mockResolvedValueOnce({
        kind: "network",
        message: "Connection interrupted",
        retryableSameRequest: true,
      });
      const flow = renderVoiceFlow();
      await prepareCompletedRecording(flow);
      await act(async (): Promise<void> => {
        await flow.result.current.submitRecording();
      });
      expect(flow.result.current.canRetrySubmission).toBe(true);
      expect(mockRecorderDiscard).not.toHaveBeenCalled();
      const firstOptions: unknown = mockParseVoiceWithAi.mock.calls[0]?.[0];
      mockRefresh.mockResolvedValue({
        ...alwaysAvailableSnapshot,
        reason,
        dailyLimit: 5,
        remaining: 0,
        availableAt: "2026-07-07T21:00:00.000Z",
      });
      await act(async (): Promise<void> => {
        await flow.result.current.retrySubmission();
      });
      expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(2);
      expect(mockParseVoiceWithAi.mock.calls[1]?.[0]).toEqual(
        expect.objectContaining({
          audioUri: "file://completed.m4a",
          requestKey: "11111111-1111-4111-8111-111111111111",
          callerTimeZone: "Africa/Cairo",
        })
      );
      expect(firstOptions).toEqual(
        expect.objectContaining({
          audioUri: "file://completed.m4a",
          requestKey: "11111111-1111-4111-8111-111111111111",
        })
      );
      expect(mockRandomUUID).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(4);
      expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["confirmed provider failure", "network"],
    ["external cancellation", "network"],
  ] as const)(
    "clears retained audio and identity after %s",
    async (_label, kind): Promise<void> => {
      mockParseVoiceWithAi.mockResolvedValueOnce({
        kind,
        message: "Request ended",
        retryableSameRequest: false,
      });
      const flow = renderVoiceFlow();
      await prepareCompletedRecording(flow);
      await act(async (): Promise<void> => {
        await flow.result.current.submitRecording();
      });
      expect(flow.result.current.canRetrySubmission).toBe(false);
      expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
      await act(async (): Promise<void> => {
        await flow.result.current.retrySubmission();
      });
      expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      mockRandomUUID.mockReturnValue("22222222-2222-4222-8222-222222222222");
      await act(async (): Promise<void> => {
        await flow.result.current.retryRecording();
      });
      await act(async (): Promise<void> => {
        await flow.result.current.submitRecording();
      });
      expect(mockParseVoiceWithAi).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requestKey: "22222222-2222-4222-8222-222222222222",
        })
      );
    }
  );

  it("cancels an in-flight finalization when Back discards the recording", async (): Promise<void> => {
    const finalized = createDeferred<{ readonly uri: string }>();
    const flow = renderVoiceFlow();
    await prepareCompletedRecording(flow);
    recorderState.status = "recording";
    recorderState.audioUri = null;
    flow.rerender(undefined);
    mockRecorderStop.mockReturnValueOnce(finalized.promise);
    let pending = Promise.resolve();
    act((): void => {
      pending = flow.result.current.submitRecording();
    });
    expect(flow.result.current.isFinalizing).toBe(true);
    await act(async (): Promise<void> => {
      await flow.result.current.discardRecording();
    });
    await act(async (): Promise<void> => {
      finalized.resolve({ uri: "file://late.m4a" });
      await pending;
    });
    expect(mockParseVoiceWithAi).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(flow.result.current.canRetrySubmission).toBe(false);
    expect(flow.result.current.flowStatus).toBe("idle");
  });

  it("aborts parsing on unmount and ignores its late result", async (): Promise<void> => {
    const parsed = createDeferred<unknown>();
    mockParseVoiceWithAi.mockReturnValueOnce(parsed.promise);
    const flow = renderVoiceFlow();
    await prepareCompletedRecording(flow);
    let pending = Promise.resolve();
    await act(async (): Promise<void> => {
      pending = flow.result.current.submitRecording();
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    const options: unknown = mockParseVoiceWithAi.mock.calls[0]?.[0];
    if (
      typeof options !== "object" ||
      options === null ||
      !("signal" in options) ||
      !(options.signal instanceof AbortSignal)
    ) {
      throw new Error("Parser must receive the operation cancellation signal");
    }
    flow.unmount();
    expect(options.signal.aborted).toBe(true);
    await act(async (): Promise<void> => {
      parsed.resolve({ transactions: [], transcript: "" });
      await pending;
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("discards a retained submission when the authenticated actor changes", async (): Promise<void> => {
    mockParseVoiceWithAi.mockResolvedValueOnce({
      kind: "timeout",
      message: "Connection interrupted",
      retryableSameRequest: true,
    });
    const flow = renderVoiceFlow();
    await prepareCompletedRecording(flow);
    await act(async (): Promise<void> => {
      await flow.result.current.submitRecording();
    });
    expect(flow.result.current.canRetrySubmission).toBe(true);
    mockUserId = "user-2";
    flow.rerender(undefined);
    expect(flow.result.current.canRetrySubmission).toBe(false);
    expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
    await act(async (): Promise<void> => {
      await flow.result.current.retrySubmission();
    });
    expect(mockParseVoiceWithAi).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

async function prepareCompletedRecording(
  flow: ReturnType<typeof renderVoiceFlow>
): Promise<void> {
  recorderState.hasPermission = true;
  flow.rerender(undefined);
  await act(async (): Promise<void> => {
    await flow.result.current.startFlow();
  });
  recorderState.status = "completed";
  recorderState.durationMs = 2000;
  recorderState.audioUri = "file://completed.m4a";
  flow.rerender(undefined);
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}
