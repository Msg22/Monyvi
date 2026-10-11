/**
 * #347 R2 / T069 — test-only typed permission and actor lifecycle RED.
 * Uses the published useVoiceTransactionFlow export, not a proposed module.
 * Do not import real Expo audio, open the OS sheet, or make provider calls.
 *
 * Proposed minimal flow boundary (to reconcile in T070):
 *   { kind: "started" }
 *   { kind: "permission", permissionStatus: "denied" | "blocked" | "unknown" }
 *   { kind: "not-started", reason: "consent" | "availability" |
 *       "cancelled" | "actor-changed" | "start-failed" }
 * Technical result naming may be aligned by the production owner before GREEN;
 * tests intentionally fail against current Promise<void>.
 */
import { act, renderHook } from "@testing-library/react-native";
import type { VoiceAvailabilitySnapshot } from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";

type PermissionStatus = "granted" | "denied" | "blocked" | "unknown";

const mockRecorderStart = jest.fn();
const mockRecorderPause = jest.fn<boolean, []>();
const mockRecorderResume = jest.fn<boolean, []>();
const mockRecorderRefresh = jest.fn<Promise<PermissionStatus>, []>();
const mockRecorderRequest = jest.fn<Promise<boolean>, []>();
const mockRecorderDiscard = jest.fn<Promise<void>, []>();
const mockRecorderStop = jest.fn();
const mockAvailabilityRefresh = jest.fn<Promise<VoiceAvailabilitySnapshot>, []>();
const mockProvider = jest.fn<Promise<unknown>, unknown[]>();
const mockPush = jest.fn();
const mockUUID = jest.fn<string, []>();
let mockUserId: string | null = "user-1";
let mockIsResolvingUser = false;

const recorderState = {
  status: "idle",
  durationMs: 0,
  isRecording: false,
  audioUri: null as string | null,
  hasPermission: true, // stale cached permission MUST NOT bypass fresh read
};

const allowed: VoiceAvailabilitySnapshot = {
  serverNow: "2026-10-11T10:00:00.000Z",
  timeZone: "Africa/Cairo",
  dailyLimit: 5,
  remaining: 3,
  resetAt: "2026-10-11T21:00:00.000Z",
  reason: null,
  availableAt: null,
  burstAvailableAt: null,
  policyVersion: "r2-test",
};

const availability: UseVoiceAiAvailabilityResult = {
  availability: allowed,
  isLoading: false,
  error: null,
  refresh: mockAvailabilityRefresh,
  reconcileAuthoritativeSnapshot: (): void => {},
};

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockUUID(),
}));
jest.mock("expo-router", () => ({
  router: {
    push: (...args: readonly unknown[]): void => {
      mockPush(...args);
    },
  },
}));
jest.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    userId: mockUserId,
    isResolvingUser: mockIsResolvingUser,
  }),
}));
jest.mock("@/utils/device-time-zone", () => ({
  getDeviceTimeZone: (): string => "Africa/Cairo",
}));
jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: () => ({
    ...recorderState,
    refreshPermission: mockRecorderRefresh,
    requestPermission: mockRecorderRequest,
    start: mockRecorderStart,
    pause: mockRecorderPause,
    resume: mockRecorderResume,
    stop: mockRecorderStop,
    discard: mockRecorderDiscard,
    reset: jest.fn(() => Promise.resolve()),
  }),
}));
jest.mock("@/services/profile-service", () => ({
  getAiProcessingConsentStatus: jest.fn(() =>
    Promise.resolve({ consent: null, isConsented: true, userId: mockUserId })
  ),
}));
jest.mock("@/services/ai-voice-parser-service", () => ({
  parseVoiceWithAi: (...args: readonly unknown[]) => mockProvider(...args),
  isVoiceParserError: () => false,
  isVoiceQuotaParserError: () => false,
}));
jest.mock("i18next", () => ({
  t: (key: string): string => key,
}));

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = (): void => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderFlow(
  ensureAiProcessingConsent: () => boolean | Promise<boolean> = () => true
): ReturnType<
  typeof renderHook<ReturnType<typeof useVoiceTransactionFlow>, undefined>
> {
  return renderHook(() =>
    useVoiceTransactionFlow({
      preferredCurrency: "EGP",
      categories: "",
      accounts: [],
      categoryRecords: [],
      voiceAvailability: availability,
      ensureAiProcessingConsent,
    })
  );
}

beforeEach((): void => {
  jest.clearAllMocks();
  mockUserId = "user-1";
  mockIsResolvingUser = false;
  recorderState.status = "idle";
  recorderState.durationMs = 0;
  recorderState.isRecording = false;
  recorderState.audioUri = null;
  recorderState.hasPermission = true;
  mockAvailabilityRefresh.mockResolvedValue(allowed);
  mockRecorderRefresh.mockResolvedValue("granted");
  mockRecorderPause.mockReturnValue(true);
  mockRecorderResume.mockReturnValue(true);
  mockRecorderRequest.mockResolvedValue(false);
  mockRecorderDiscard.mockResolvedValue(undefined);
  mockRecorderStop.mockResolvedValue(null);
  mockUUID.mockReturnValue("d741e457-4e2d-449d-b7ec-7ce355a00001");
  mockRecorderStart.mockImplementation(
    (options: { readonly onStarted?: () => void }): Promise<void> => {
      options?.onStarted?.();
      return Promise.resolve();
    }
  );
});

/** Native auto-cap outcome: finalized URI is retained, never parsed by the cap. */
async function startAndCompleteAtCap(): Promise<ReturnType<typeof renderFlow>> {
  const flow = renderFlow();
  await act(async (): Promise<void> => {
    expect(await flow.result.current.startFlow()).toEqual({ kind: "started" });
  });
  expect(flow.result.current.flowStatus).toBe("recording");
  expect(mockRecorderStart).toHaveBeenCalledTimes(1);

  recorderState.status = "completed";
  recorderState.durationMs = 30_000;
  recorderState.isRecording = false;
  recorderState.audioUri = "file://r2-cap-retained.m4a";
  flow.rerender(undefined);
  expect(flow.result.current.flowStatus).toBe("completed");
  return flow;
}

describe("R2 typed single just-in-time microphone permission ownership", () => {
  it("starts only after consent and authoritative availability, reading permission once", async (): Promise<void> => {
    const stages: string[] = [];
    const ensureConsent = jest.fn((): Promise<boolean> => {
      stages.push("consent");
      return Promise.resolve(true);
    });
    mockAvailabilityRefresh.mockImplementation((): Promise<VoiceAvailabilitySnapshot> => {
      stages.push("availability");
      return Promise.resolve(allowed);
    });
    mockRecorderRefresh.mockImplementation((): Promise<PermissionStatus> => {
      stages.push("permission");
      return Promise.resolve("granted");
    });
    mockRecorderStart.mockImplementation((options: { readonly onStarted?: () => void }): Promise<void> => {
      stages.push("native-record");
      options.onStarted?.();
      return Promise.resolve();
    });
    const flow = renderFlow(ensureConsent);
    let outcome: unknown;
    await act(async (): Promise<void> => {
      outcome = await flow.result.current.startFlow();
    });
    expect(stages).toEqual(["consent", "availability", "permission", "native-record"]);
    expect(outcome).toEqual({ kind: "started" });
    expect(mockRecorderRefresh).toHaveBeenCalledTimes(1);
    expect(mockRecorderRequest).not.toHaveBeenCalled();
    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    expect(mockProvider).not.toHaveBeenCalled();
    expect(flow.result.current.flowStatus).toBe("recording");
  });

  it.each(["denied", "blocked", "unknown"] as const)(
    "returns typed %s without native request, UUID, capture, or false Listening",
    async (permissionStatus): Promise<void> => {
      mockRecorderRefresh.mockResolvedValue(permissionStatus);
      const flow = renderFlow();
      let outcome: unknown;
      await act(async (): Promise<void> => {
        outcome = await flow.result.current.startFlow();
      });
      expect(outcome).toEqual({ kind: "permission", permissionStatus });
      expect(mockAvailabilityRefresh).toHaveBeenCalledTimes(1);
      expect(mockRecorderRefresh).toHaveBeenCalledTimes(1);
      expect(mockRecorderRequest).not.toHaveBeenCalled();
      expect(mockRecorderStart).not.toHaveBeenCalled();
      expect(mockUUID).not.toHaveBeenCalled();
      expect(mockProvider).not.toHaveBeenCalled();
      expect(flow.result.current.flowStatus).toBe("idle");
    }
  );

  it("does not trust stale granted cache when permission was revoked before capture", async (): Promise<void> => {
    recorderState.hasPermission = true;
    mockRecorderRefresh.mockResolvedValue("denied");
    const flow = renderFlow();
    let outcome: unknown;
    await act(async (): Promise<void> => {
      outcome = await flow.result.current.startFlow();
    });
    expect(outcome).toEqual({ kind: "permission", permissionStatus: "denied" });
    expect(mockRecorderRefresh).toHaveBeenCalledTimes(1);
    expect(mockRecorderStart).not.toHaveBeenCalled();
    expect(mockRecorderRequest).not.toHaveBeenCalled();
  });

  it("requests OS permission only on explicit inline-Continue attempt and only after its one fresh read", async (): Promise<void> => {
    mockRecorderRefresh.mockResolvedValue("denied");
    mockRecorderRequest.mockResolvedValue(true);
    const flow = renderFlow();
    let outcome: unknown;
    await act(async (): Promise<void> => {
      outcome = await flow.result.current.startFlow({
        requestMicrophonePermission: true,
      });
    });
    expect(outcome).toEqual({ kind: "started" });
    expect(mockRecorderRefresh).toHaveBeenCalledTimes(1);
    expect(mockRecorderRequest).toHaveBeenCalledTimes(1);
    expect(mockRecorderRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecorderRequest.mock.invocationCallOrder[0]
    );
    expect(mockRecorderRequest.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecorderStart.mock.invocationCallOrder[0]
    );
  });

  it.each(["consent", "availability"] as const)(
    "short-circuits %s before the native permission read",
    async (stage): Promise<void> => {
      const ensureConsent = (): boolean => stage !== "consent";
      if (stage === "availability") {
        mockAvailabilityRefresh.mockResolvedValue({
          ...allowed,
          remaining: 0,
          reason: "daily_limit",
        });
      }
      const flow = renderFlow(ensureConsent);
      let outcome: unknown;
      await act(async (): Promise<void> => {
        outcome = await flow.result.current.startFlow();
      });
      expect(outcome).toEqual({ kind: "not-started", reason: stage });
      expect(mockRecorderRefresh).not.toHaveBeenCalled();
      expect(mockRecorderRequest).not.toHaveBeenCalled();
      expect(mockRecorderStart).not.toHaveBeenCalled();
    }
  );

  it("invalidates a pending permission result on Cancel; never resumes late recording", async (): Promise<void> => {
    const pendingPermission = deferred<PermissionStatus>();
    mockRecorderRefresh.mockReturnValueOnce(pendingPermission.promise);
    const flow = renderFlow();
    let pending: Promise<unknown> = Promise.resolve();
    await act(async (): Promise<void> => {
      pending = flow.result.current.startFlow();
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(flow.result.current.flowStatus).toBe("starting");
    await act(async (): Promise<void> => {
      await flow.result.current.discardRecording();
    });
    let outcome: unknown;
    await act(async (): Promise<void> => {
      pendingPermission.resolve("granted");
      outcome = await pending;
    });
    expect(outcome).toEqual({ kind: "not-started", reason: "cancelled" });
    expect(mockRecorderStart).not.toHaveBeenCalled();
    expect(mockRecorderRequest).not.toHaveBeenCalled();
    expect(mockProvider).not.toHaveBeenCalled();
    expect(flow.result.current.flowStatus).toBe("idle");
  });

  it("invalidates a pending permission read when the authenticated actor changes", async (): Promise<void> => {
    const pendingPermission = deferred<PermissionStatus>();
    mockRecorderRefresh.mockReturnValueOnce(pendingPermission.promise);
    const flow = renderFlow();
    let pending: Promise<unknown> = Promise.resolve();
    await act(async (): Promise<void> => {
      pending = flow.result.current.startFlow();
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    mockUserId = "user-2";
    flow.rerender(undefined);
    let outcome: unknown;
    await act(async (): Promise<void> => {
      pendingPermission.resolve("granted");
      outcome = await pending;
    });
    expect(outcome).toEqual({ kind: "not-started", reason: "actor-changed" });
    expect(mockRecorderStart).not.toHaveBeenCalled();
    expect(mockRecorderRequest).not.toHaveBeenCalled();
    expect(mockProvider).not.toHaveBeenCalled();
    expect(flow.result.current.flowStatus).toBe("idle");
  });

  it("never shows Listening while native record has not reported success", async (): Promise<void> => {
    const nativeCapture = deferred<void>();
    mockRecorderStart.mockReturnValueOnce(nativeCapture.promise);
    const flow = renderFlow();
    let pending: Promise<unknown> = Promise.resolve();
    await act(async (): Promise<void> => {
      pending = flow.result.current.startFlow();
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    expect(flow.result.current.flowStatus).toBe("starting");
    expect(flow.result.current.durationMs).toBe(0);
    let outcome: unknown;
    await act(async (): Promise<void> => {
      nativeCapture.resolve(undefined);
      outcome = await pending;
    });
    // The native mock intentionally never fired onStarted. A resolved promise
    // alone is not evidence that AudioRecorder.record() actually started.
    expect(outcome).toEqual({ kind: "not-started", reason: "start-failed" });
    expect(flow.result.current.flowStatus).not.toBe("recording");
    expect(mockProvider).not.toHaveBeenCalled();
  });

  it("rechecks native permission before Resume and refuses a revoked microphone without restarting capture", async (): Promise<void> => {
    const flow = renderFlow();
    await act(async (): Promise<void> => {
      await flow.result.current.startFlow();
    });
    act((): void => {
      flow.result.current.pauseRecording();
    });
    expect(flow.result.current.flowStatus).toBe("paused");
    mockRecorderRefresh.mockClear();
    mockRecorderRefresh.mockResolvedValueOnce("denied");
    act((): void => {
      flow.result.current.resumeRecording();
    });
    await act(async (): Promise<void> => {
      await Promise.resolve();
    });
    expect(mockRecorderRefresh).toHaveBeenCalledTimes(1);
    expect(mockRecorderResume).not.toHaveBeenCalled();
    expect(flow.result.current.flowStatus).toBe("error");
    expect(flow.result.current.isMicrophonePermissionError).toBe(true);
    expect(mockRecorderRequest).not.toHaveBeenCalled();
    expect(mockProvider).not.toHaveBeenCalled();
  });

  it("allows Resume only after the new granted permission read, without allocating a new request key", async (): Promise<void> => {
    const flow = renderFlow();
    await act(async (): Promise<void> => {
      await flow.result.current.startFlow();
    });
    act((): void => {
      flow.result.current.pauseRecording();
    });
    mockRecorderRefresh.mockClear();
    const pending = deferred<PermissionStatus>();
    mockRecorderRefresh.mockReturnValueOnce(pending.promise);
    act((): void => {
      flow.result.current.resumeRecording();
      flow.result.current.resumeRecording();
    });
    expect(flow.result.current.flowStatus).toBe("paused");
    expect(mockRecorderResume).not.toHaveBeenCalled();
    await act(async (): Promise<void> => {
      pending.resolve("granted");
      await pending.promise;
    });
    expect(mockRecorderRefresh).toHaveBeenCalledTimes(1);
    expect(mockRecorderResume).toHaveBeenCalledTimes(1);
    expect(flow.result.current.flowStatus).toBe("recording");
    expect(mockUUID).toHaveBeenCalledTimes(1);
  });

  it("ignores a late granted Resume after Discard changes the operation generation", async (): Promise<void> => {
    const flow = renderFlow();
    await act(async (): Promise<void> => {
      await flow.result.current.startFlow();
    });
    act((): void => {
      flow.result.current.pauseRecording();
    });
    const pending = deferred<PermissionStatus>();
    mockRecorderRefresh.mockReturnValueOnce(pending.promise);
    act((): void => {
      flow.result.current.resumeRecording();
    });
    await act(async (): Promise<void> => {
      await flow.result.current.discardRecording();
      pending.resolve("granted");
      await pending.promise;
    });
    expect(mockRecorderResume).not.toHaveBeenCalled();
    expect(flow.result.current.flowStatus).toBe("idle");
    expect(mockProvider).not.toHaveBeenCalled();
  });


  describe("R218 / FR046 — retained audio at the native 30-second cap", () => {
    it("stays completed and mode-locked without provider or navigation until Submit", async (): Promise<void> => {
      const flow = await startAndCompleteAtCap();

      expect(flow.result.current.durationMs).toBe(30_000);
      expect(flow.result.current.isModeSwitchLocked).toBe(true);
      expect(mockRecorderStart).toHaveBeenCalledTimes(1);
      expect(mockRecorderStop).not.toHaveBeenCalled();
      expect(mockRecorderDiscard).not.toHaveBeenCalled();
      expect(mockUUID).toHaveBeenCalledTimes(1);
      expect(mockProvider).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();

      await act(async (): Promise<void> => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(flow.result.current.flowStatus).toBe("completed");
      expect(flow.result.current.isModeSwitchLocked).toBe(true);
      expect(mockRecorderStart).toHaveBeenCalledTimes(1);
      expect(mockProvider).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("Submit twice concurrently parses the retained URI and original request key only once", async (): Promise<void> => {
      const flow = await startAndCompleteAtCap();
      const pendingParse = deferred<unknown>();
      mockProvider.mockReturnValueOnce(pendingParse.promise);

      let first: Promise<void> = Promise.resolve();
      let second: Promise<void> = Promise.resolve();
      await act(async (): Promise<void> => {
        first = flow.result.current.submitRecording();
        second = flow.result.current.submitRecording();
        for (let index = 0; index < 10; index += 1) {
          await Promise.resolve();
        }
      });

      expect(mockProvider).toHaveBeenCalledTimes(1);
      expect(mockProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          audioUri: "file://r2-cap-retained.m4a",
          requestKey: "d741e457-4e2d-449d-b7ec-7ce355a00001",
          callerTimeZone: "Africa/Cairo",
        })
      );
      expect(mockUUID).toHaveBeenCalledTimes(1);
      expect(mockRecorderStart).toHaveBeenCalledTimes(1);
      expect(mockRecorderStop).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();

      await act(async (): Promise<void> => {
        pendingParse.resolve({
          detectedLanguage: "en",
          originalTranscript: "paid 20",
          transcript: "paid 20",
          transactions: [{ amount: 20, currency: "EGP", type: "EXPENSE" }],
        });
        await Promise.all([first, second]);
      });

      expect(mockProvider).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
      expect(mockRecorderStop).not.toHaveBeenCalled();
      expect(mockUUID).toHaveBeenCalledTimes(1);

      await act(async (): Promise<void> => {
        await flow.result.current.submitRecording();
      });
      expect(mockProvider).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it("Discard after the cap clears retained audio without provider or navigation", async (): Promise<void> => {
      const flow = await startAndCompleteAtCap();
      expect(mockProvider).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();

      await act(async (): Promise<void> => {
        await flow.result.current.discardRecording();
      });
      expect(flow.result.current.flowStatus).toBe("idle");
      expect(flow.result.current.isModeSwitchLocked).toBe(false);
      expect(mockRecorderDiscard).toHaveBeenCalledTimes(1);
      expect(mockRecorderStop).not.toHaveBeenCalled();

      await act(async (): Promise<void> => {
        await flow.result.current.submitRecording();
      });
      expect(mockProvider).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockUUID).toHaveBeenCalledTimes(1);
      expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    });
  });

});
