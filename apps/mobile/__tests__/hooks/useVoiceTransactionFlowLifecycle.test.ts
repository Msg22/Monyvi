import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import type { VoiceAvailabilitySnapshot } from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import type { MicrophonePermissionStatus } from "@/hooks/useMicrophonePermission";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";

class MockAppStateSubscription {
  constructor(private readonly onRemove: () => void) {}
  remove(): void {
    this.onRemove();
  }
}

let appStateListener: ((state: AppStateStatus) => void) | null = null;
const mockRemoveAppStateListener = jest.fn();
jest
  .spyOn(AppState, "addEventListener")
  .mockImplementation((event, listener) => {
    if (event === "change") {
      appStateListener = listener;
    }
    return new MockAppStateSubscription(
      mockRemoveAppStateListener.mockImplementation(() => {
        appStateListener = null;
      })
    );
  });

interface RecorderStartOptions {
  readonly signal?: AbortSignal;
  readonly onStarted?: () => void;
}

const mockPush = jest.fn();
const mockRecorderStart = jest.fn<Promise<void>, [RecorderStartOptions?]>();
const mockRecorderPause = jest.fn<boolean, []>();
const mockRecorderResume = jest.fn<boolean, []>();
const mockRecorderStop = jest.fn<Promise<{ readonly uri: string }>, []>();
const mockRecorderDiscard = jest.fn<Promise<void>, []>();
const mockRecorderReset = jest.fn<Promise<void>, []>();
const mockRefreshPermission = jest.fn<
  Promise<MicrophonePermissionStatus>,
  []
>();
const mockRequestPermissionStatus = jest.fn<
  Promise<MicrophonePermissionStatus>,
  []
>();
const mockRequestPermission = jest.fn<Promise<boolean>, []>();
const mockAvailabilityRefresh = jest.fn<
  Promise<VoiceAvailabilitySnapshot | null>,
  []
>();
const mockParseVoiceWithAi = jest.fn<Promise<unknown>, [unknown]>();
const mockRandomUUID = jest.fn<string, []>();
let mockUserId: string | null = "user-1";

const allowedSnapshot: VoiceAvailabilitySnapshot = {
  serverNow: "2026-10-12T00:00:00.000Z",
  timeZone: "Africa/Cairo",
  dailyLimit: 5,
  remaining: 5,
  resetAt: "2026-10-12T21:00:00.000Z",
  reason: null,
  availableAt: null,
  burstAvailableAt: null,
  policyVersion: "lifecycle-test",
};

const voiceAvailability: UseVoiceAiAvailabilityResult = {
  availability: allowedSnapshot,
  isLoading: false,
  error: null,
  refresh: (): Promise<VoiceAvailabilitySnapshot | null> =>
    mockAvailabilityRefresh(),
  reconcileAuthoritativeSnapshot: (): void => {},
};

const mockRecorderState = {
  status: "idle" as "idle" | "recording" | "paused" | "completed" | "error",
  durationMs: 0,
  isRecording: false,
  audioUri: null as string | null,
  hasPermission: true,
};

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockRandomUUID(),
}));

jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]): void => {
      mockPush(...args);
    },
  },
}));

jest.mock("@/utils/device-time-zone", () => ({
  getDeviceTimeZone: (): string => "Africa/Cairo",
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

jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: jest.fn().mockResolvedValue({
    consent: {
      consentedAt: "2026-10-12T00:00:00.000Z",
      revokedAt: null,
      version: "2026-07-ai-processing-v1",
    },
    isConsented: true,
    userId: "user-1",
  }),
}));

jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (options: unknown): Promise<unknown> =>
    mockParseVoiceWithAi(options),
  isVoiceParserError: (): boolean => false,
  isVoiceQuotaParserError: (): boolean => false,
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: (): unknown => ({
    ...mockRecorderState,
    permissionStatus: mockRecorderState.hasPermission ? "granted" : "denied",
    refreshPermission: (): Promise<MicrophonePermissionStatus> =>
      mockRefreshPermission(),
    requestPermissionStatus: (): Promise<MicrophonePermissionStatus> =>
      mockRequestPermissionStatus(),
    requestPermission: (): Promise<boolean> => mockRequestPermission(),
    start: (options?: RecorderStartOptions): Promise<void> =>
      mockRecorderStart(options),
    pause: (): boolean => mockRecorderPause(),
    resume: (): boolean => mockRecorderResume(),
    stop: (): Promise<{ readonly uri: string }> => mockRecorderStop(),
    discard: (): Promise<void> => mockRecorderDiscard(),
    reset: (): Promise<void> => mockRecorderReset(),
  }),
}));

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = (): void => {};
  let reject: (reason: unknown) => void = (): void => {};
  const promise = new Promise<T>((promiseResolve, promiseReject): void => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderFlow(
  options: {
    readonly ensureAiProcessingConsent?: () => boolean | Promise<boolean>;
    readonly autoStart?: boolean;
    readonly canAutoStart?: boolean;
  } = {}
): ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceTransactionFlow>, undefined>
> {
  return renderHook(() =>
    useVoiceTransactionFlow({
      preferredCurrency: "EGP",
      categories: "L1: food",
      accounts: [{ id: "acc-1", name: "Cash", currency: "EGP" }],
      categoryRecords: [],
      voiceAvailability,
      ensureAiProcessingConsent:
        options.ensureAiProcessingConsent ?? (() => true),
      autoStart: options.autoStart,
      canAutoStart: options.canAutoStart,
    })
  );
}

describe("useVoiceTransactionFlow AppState and lifecycle transitions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = "user-1";
    mockRecorderState.status = "idle";
    mockRecorderState.durationMs = 0;
    mockRecorderState.isRecording = false;
    mockRecorderState.audioUri = null;
    mockRecorderState.hasPermission = true;

    mockAvailabilityRefresh.mockReset().mockResolvedValue(allowedSnapshot);
    mockRefreshPermission.mockReset().mockResolvedValue("granted");
    mockRequestPermissionStatus.mockReset().mockResolvedValue("granted");
    mockRequestPermission.mockReset().mockResolvedValue(true);
    mockRandomUUID
      .mockReset()
      .mockReturnValue("11111111-1111-4111-8111-111111111111");
    mockRecorderDiscard.mockReset().mockResolvedValue(undefined);
    mockRecorderReset.mockReset().mockResolvedValue(undefined);
    mockRecorderStop.mockReset().mockResolvedValue({ uri: "file://voice.m4a" });
    mockRecorderPause.mockReset().mockReturnValue(true);
    mockRecorderResume.mockReset().mockReturnValue(true);
    mockParseVoiceWithAi.mockReset().mockResolvedValue({
      transactions: [],
      transcript: "sample transcript",
      originalTranscript: "sample transcript",
      detectedLanguage: "en",
    });
    mockRecorderStart
      .mockReset()
      .mockImplementation((options?: RecorderStartOptions) => {
        mockRecorderState.status = "recording";
        mockRecorderState.isRecording = true;
        options?.onStarted?.();
        return Promise.resolve();
      });
  });

  it("cleans up AppState subscription on unmount", () => {
    const { unmount } = renderFlow();
    expect(appStateListener).not.toBeNull();
    unmount();
    expect(mockRemoveAppStateListener).toHaveBeenCalled();
  });

  it("rejects startFlow when AppState is explicitly inactive or background", async () => {
    const { result } = renderFlow();

    act(() => {
      appStateListener?.("background");
    });

    let startResult: unknown;
    await act(async () => {
      startResult = await result.current.startFlow();
    });

    expect(startResult).toEqual({ kind: "not-started", reason: "cancelled" });
    expect(mockRecorderStart).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("idle");
  });

  it("aborts and invalidates deferred availability preflight when AppState becomes inactive or background", async () => {
    const deferredAvailability =
      createDeferred<VoiceAvailabilitySnapshot | null>();
    mockAvailabilityRefresh.mockReturnValue(deferredAvailability.promise);

    const { result } = renderFlow();

    let startPromise: Promise<unknown>;
    act(() => {
      startPromise = result.current.startFlow();
    });

    // Await preflight turn and assert flowStatus is "starting"
    await act(async () => {
      for (let i = 0; i < 3; i++) await Promise.resolve();
    });
    expect(result.current.flowStatus).toBe("starting");

    // App goes to inactive while awaiting availability
    act(() => {
      appStateListener?.("inactive");
    });

    // Resolve availability afterward; should be ignored/invalidated
    await act(async () => {
      deferredAvailability.resolve(allowedSnapshot);
      await startPromise;
    });

    expect(result.current.flowStatus).toBe("idle");
    expect(mockRecorderStart).not.toHaveBeenCalled();
    expect(mockRecorderDiscard).toHaveBeenCalled();
  });

  it("aborts pending native start, signals AbortSignal, and discards stale onStarted when AppState becomes background", async () => {
    let capturedSignal: AbortSignal | undefined;
    let capturedOnStarted: (() => void) | undefined;
    const deferredNativeStart = createDeferred<void>();

    mockRecorderStart.mockImplementation((options?: RecorderStartOptions) => {
      capturedSignal = options?.signal;
      capturedOnStarted = options?.onStarted;
      return deferredNativeStart.promise;
    });

    const { result } = renderFlow();

    let startPromise: Promise<unknown>;
    act(() => {
      startPromise = result.current.startFlow();
    });

    // Await async consent and preflight flush until recorder.start is actually entered
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    expect(result.current.flowStatus).toBe("starting");
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    // App moves to background before native start completes
    act(() => {
      appStateListener?.("background");
    });

    expect(capturedSignal?.aborted).toBe(true);

    // Complete late native start and fire stale onStarted
    await act(async () => {
      deferredNativeStart.resolve();
      capturedOnStarted?.(); // late/stale onStarted callback must not transition to recording!
      await startPromise;
    });

    // Must be back in idle, discard called, and never transitioned to recording
    expect(result.current.flowStatus).toBe("idle");
    expect(mockRecorderDiscard).toHaveBeenCalled();
  });

  it("handles OS permission sheet flow with deferred requestMicrophonePermission: true, inactive during sheet, and explicit retry", async () => {
    mockRecorderState.hasPermission = false;
    mockRefreshPermission.mockResolvedValue("denied");

    const deferredPermission = createDeferred<MicrophonePermissionStatus>();
    mockRequestPermissionStatus.mockReturnValue(deferredPermission.promise);

    const { result } = renderFlow();

    // Start with requestMicrophonePermission: true (user tapped Continue / allow in rationale)
    let startPromise: Promise<unknown>;
    act(() => {
      startPromise = result.current.startFlow({
        requestMicrophonePermission: true,
      });
    });

    // Await preflight turn
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });

    expect(mockRequestPermissionStatus).toHaveBeenCalledTimes(1);

    // OS displays permission sheet, causing AppState "inactive"
    act(() => {
      appStateListener?.("inactive");
    });

    // Permission sheet returns to foreground ("active") and user granted permission
    mockRecorderState.hasPermission = true;
    mockRefreshPermission.mockResolvedValue("granted");

    act(() => {
      appStateListener?.("active");
    });

    await act(async () => {
      deferredPermission.resolve("granted");
      await startPromise;
    });

    // User can now explicitly start fresh
    await act(async () => {
      await result.current.startFlow();
    });

    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    expect(result.current.flowStatus).toBe("recording");
  });

  it("cancels pending resume operation when AppState becomes inactive or background", async () => {
    const { result } = renderFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    // Pause recording
    act(() => {
      result.current.pauseRecording();
    });
    expect(result.current.flowStatus).toBe("paused");

    const deferredPermission = createDeferred<MicrophonePermissionStatus>();
    mockRefreshPermission.mockReturnValue(deferredPermission.promise);

    // Call resumeRecording, which initiates refreshPermission
    act(() => {
      result.current.resumeRecording();
    });

    // App goes to background while refreshPermission is pending
    act(() => {
      appStateListener?.("background");
    });

    // Return to active before permission resolves
    act(() => {
      appStateListener?.("active");
    });

    // Permission resolves granted AFTER returning active
    await act(async () => {
      deferredPermission.resolve("granted");
      await Promise.resolve();
    });

    // Must NOT resume native recorder from the stale/cancelled resume operation
    expect(mockRecorderResume).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("paused");

    // Fresh explicit resume works
    mockRefreshPermission.mockResolvedValue("granted");
    await act(async () => {
      result.current.resumeRecording();
      await Promise.resolve();
    });

    expect(mockRecorderResume).toHaveBeenCalledTimes(1);
    expect(result.current.flowStatus).toBe("recording");
  });

  it("pauses active recording when AppState becomes background, blocks offscreen resume, and does not auto-resume on active", async () => {
    const { result } = renderFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    expect(result.current.flowStatus).toBe("recording");

    // Background transition pauses recording
    act(() => {
      appStateListener?.("background");
    });

    expect(mockRecorderPause).toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("paused");

    // While still offscreen/background, calling resumeRecording must be blocked
    act(() => {
      result.current.resumeRecording();
    });
    expect(mockRecorderResume).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("paused");

    // Returning to active must NEVER auto-resume recording
    act(() => {
      appStateListener?.("active");
    });

    expect(mockRecorderResume).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("paused");
  });

  it("pauses and preserves key during native warmup when AppState becomes background, and deferred start completes without auto-resume", async () => {
    const deferredNativeStart = createDeferred<void>();

    mockRecorderStart.mockImplementation((options?: RecorderStartOptions) => {
      mockRecorderState.status = "recording";
      mockRecorderState.isRecording = true;
      options?.onStarted?.();
      return deferredNativeStart.promise;
    });

    const { result } = renderFlow();

    let startPromise: Promise<unknown>;
    act(() => {
      startPromise = result.current.startFlow();
    });

    await waitFor(() => {
      expect(result.current.flowStatus).toBe("recording");
    });

    // App moves to background during post-onStarted native warmup
    act(() => {
      appStateListener?.("background");
    });

    // Must pause native recorder, preserve requestKey, and NOT abort/discard
    expect(mockRecorderPause).toHaveBeenCalledTimes(1);
    expect(mockRecorderDiscard).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("paused");

    // Warmup completes successfully
    await act(async () => {
      deferredNativeStart.resolve();
      await startPromise;
    });

    // Still paused, not discarded
    expect(result.current.flowStatus).toBe("paused");
    expect(mockRecorderDiscard).not.toHaveBeenCalled();

    // Returning to active must NEVER auto-resume
    act(() => {
      appStateListener?.("active");
    });

    expect(mockRecorderResume).not.toHaveBeenCalled();
    expect(result.current.flowStatus).toBe("paused");
  });

  it("preserves completed audio and does not discard when AppState changes to background", async () => {
    const deferredParse = createDeferred<unknown>();
    mockParseVoiceWithAi.mockReturnValue(deferredParse.promise);

    const { result, rerender } = renderFlow();

    await act(async () => {
      await result.current.startFlow();
    });

    // Transition to completed recording with captured audio
    mockRecorderState.status = "completed";
    mockRecorderState.audioUri = "file://retained-audio.m4a";
    mockRecorderState.durationMs = 5000;
    rerender(undefined);

    expect(result.current.flowStatus).toBe("completed");

    let submitPromise: Promise<void> | undefined;
    act(() => {
      submitPromise = result.current.submitRecording();
    });

    await waitFor(() => {
      expect(result.current.flowStatus).toBe("analyzing");
    });

    // Emit background while analysis is pending in flight
    act(() => {
      appStateListener?.("background");
    });

    // Completed / in-flight audio must NOT be discarded by AppState background!
    expect(mockRecorderDiscard).not.toHaveBeenCalled();

    // Legitimate parse success resolves and navigates
    await act(async () => {
      deferredParse.resolve({
        transactions: [
          {
            amount: 100,
            currency: "EGP",
            type: "expense",
            categoryName: "Food",
            note: "Groceries",
            date: "2026-10-12",
          },
        ],
        transcript: "completed test",
        originalTranscript: "completed test",
        detectedLanguage: "en",
      });
      await submitPromise;
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/voice-review",
      })
    );
    expect(result.current.flowStatus).toBe("idle");
    expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
  });
});
