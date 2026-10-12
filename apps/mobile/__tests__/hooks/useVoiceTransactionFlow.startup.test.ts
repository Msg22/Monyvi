import { act, renderHook } from "@testing-library/react-native";
import type { VoiceAvailabilitySnapshot } from "@monyvi/logic";
import type { UseVoiceAiAvailabilityResult } from "@/hooks/useVoiceAiAvailability";
import type { MicrophonePermissionStatus } from "@/hooks/useMicrophonePermission";

import { useVoiceTransactionFlow } from "@/hooks/useVoiceTransactionFlow";

interface RecorderStartOptions {
  readonly signal?: AbortSignal;
  readonly onStarted?: () => void;
}

const mockAvailabilityRefresh = jest.fn<
  Promise<VoiceAvailabilitySnapshot | null>,
  []
>();
const mockRefreshPermission = jest.fn<
  Promise<MicrophonePermissionStatus>,
  []
>();
const mockRequestPermissionStatus = jest.fn<
  Promise<MicrophonePermissionStatus>,
  []
>();
const mockRecorderStart = jest.fn<
  Promise<void>,
  [RecorderStartOptions?]
>();
const mockRecorderDiscard = jest.fn<Promise<void>, []>();
const mockRandomUUID = jest.fn<string, []>();
const mockLoggerInfo = jest.fn<
  void,
  [string, Readonly<Record<string, unknown>>]
>();
let mockUserId: string | null = "user-1";

const allowed: VoiceAvailabilitySnapshot = {
  serverNow: "2026-10-12T00:00:00.000Z",
  timeZone: "Africa/Cairo",
  dailyLimit: 5,
  remaining: 5,
  resetAt: "2026-10-12T21:00:00.000Z",
  reason: null,
  availableAt: null,
  burstAvailableAt: null,
  policyVersion: "startup-test",
};

const blocked: VoiceAvailabilitySnapshot = {
  ...allowed,
  remaining: 0,
  reason: "daily_limit",
  availableAt: "2026-10-12T21:00:00.000Z",
};

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

jest.mock("expo-crypto", () => ({
  randomUUID: (): string => mockRandomUUID(),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: (
      event: string,
      payload: Readonly<Record<string, unknown>>
    ): void => {
      mockLoggerInfo(event, payload);
    },
    error: jest.fn(),
    warn: jest.fn(),
  },
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
  parseVoiceWithAi: jest.fn(),
  isVoiceParserError: (): boolean => false,
  isVoiceQuotaParserError: (): boolean => false,
}));

jest.mock("@/hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: (): unknown => ({
    status: "idle",
    durationMs: 0,
    isRecording: false,
    audioUri: null,
    hasPermission: false,
    permissionStatus: "denied",
    refreshPermission: (): Promise<MicrophonePermissionStatus> =>
      mockRefreshPermission(),
    requestPermissionStatus: (): Promise<MicrophonePermissionStatus> =>
      mockRequestPermissionStatus(),
    start: (options?: RecorderStartOptions): Promise<void> =>
      mockRecorderStart(options),
    pause: (): boolean => true,
    resume: (): boolean => true,
    stop: (): Promise<{ readonly uri: string }> =>
      Promise.resolve({ uri: "file://startup.m4a" }),
    discard: (): Promise<void> => mockRecorderDiscard(),
    reset: (): Promise<void> => Promise.resolve(),
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

const voiceAvailability: UseVoiceAiAvailabilityResult = {
  availability: allowed,
  isLoading: false,
  error: null,
  refresh: (): Promise<VoiceAvailabilitySnapshot | null> =>
    mockAvailabilityRefresh(),
  reconcileAuthoritativeSnapshot: (): void => {},
};

function renderStartupFlow(
  ensureAiProcessingConsent: () => boolean | Promise<boolean>
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
      voiceAvailability,
    })
  );
}

async function flush(): Promise<void> {
  await act(async (): Promise<void> => {
    for (let index = 0; index < 8; index += 1) {
      await Promise.resolve();
    }
  });
}

beforeEach((): void => {
  jest.clearAllMocks();
  mockUserId = "user-1";
  mockAvailabilityRefresh.mockReset().mockResolvedValue(allowed);
  mockRefreshPermission.mockReset().mockResolvedValue("granted");
  mockRequestPermissionStatus.mockReset().mockResolvedValue("granted");
  mockRandomUUID
    .mockReset()
    .mockReturnValue("11111111-1111-4111-8111-111111111111");
  mockRecorderDiscard.mockReset().mockResolvedValue(undefined);
  mockRecorderStart
    .mockReset()
    .mockImplementation(
      (options?: RecorderStartOptions): Promise<void> => {
        options?.onStarted?.();
        return Promise.resolve();
      }
    );
  mockLoggerInfo.mockReset();
});

describe("useVoiceTransactionFlow startup ordering", () => {
  it("keeps Starting while consent is pending, then starts availability and permission reads together", async (): Promise<void> => {
    const consent = createDeferred<boolean>();
    const availability = createDeferred<VoiceAvailabilitySnapshot | null>();
    const permission = createDeferred<MicrophonePermissionStatus>();
    mockAvailabilityRefresh.mockReturnValue(availability.promise);
    mockRefreshPermission.mockReturnValue(permission.promise);
    const flow = renderStartupFlow(() => consent.promise);

    let pending: ReturnType<typeof flow.result.current.startFlow> | undefined;
    act((): void => {
      pending = flow.result.current.startFlow();
    });
    await flush();

    expect(flow.result.current.flowStatus).toBe("starting");
    expect(mockAvailabilityRefresh).not.toHaveBeenCalled();
    expect(mockRefreshPermission).not.toHaveBeenCalled();

    consent.resolve(true);
    await flush();

    expect(mockAvailabilityRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshPermission).toHaveBeenCalledTimes(1);
    expect(mockRecorderStart).not.toHaveBeenCalled();

    availability.resolve(allowed);
    permission.resolve("granted");
    await act(async (): Promise<void> => {
      await pending;
    });
    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
  });

  it("reads permission concurrently but never opens the OS prompt or recorder when availability is blocked", async (): Promise<void> => {
    const availability = createDeferred<VoiceAvailabilitySnapshot | null>();
    const permission = createDeferred<MicrophonePermissionStatus>();
    mockAvailabilityRefresh.mockReturnValue(availability.promise);
    mockRefreshPermission.mockReturnValue(permission.promise);
    const flow = renderStartupFlow(() => true);

    let pending: ReturnType<typeof flow.result.current.startFlow> | undefined;
    act((): void => {
      pending = flow.result.current.startFlow({
        requestMicrophonePermission: true,
      });
    });
    await flush();

    expect(mockAvailabilityRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshPermission).toHaveBeenCalledTimes(1);

    permission.resolve("denied");
    availability.resolve(blocked);
    let result: Awaited<ReturnType<typeof flow.result.current.startFlow>> | undefined;
    await act(async (): Promise<void> => {
      result = await pending;
    });

    expect(result).toEqual({ kind: "not-started", reason: "availability" });
    expect(mockRequestPermissionStatus).not.toHaveBeenCalled();
    expect(mockRecorderStart).not.toHaveBeenCalled();
    expect(mockRandomUUID).not.toHaveBeenCalled();
  });

  it("waits for eligible availability before issuing one explicit OS permission request", async (): Promise<void> => {
    const availability = createDeferred<VoiceAvailabilitySnapshot | null>();
    mockAvailabilityRefresh.mockReturnValue(availability.promise);
    mockRefreshPermission.mockResolvedValue("denied");
    const flow = renderStartupFlow(() => true);

    let pending: ReturnType<typeof flow.result.current.startFlow> | undefined;
    act((): void => {
      pending = flow.result.current.startFlow({
        requestMicrophonePermission: true,
      });
    });
    await flush();

    expect(mockRefreshPermission).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissionStatus).not.toHaveBeenCalled();
    expect(mockRecorderStart).not.toHaveBeenCalled();

    availability.resolve(allowed);
    await act(async (): Promise<void> => {
      await pending;
    });

    expect(mockRequestPermissionStatus).toHaveBeenCalledTimes(1);
    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
  });

  it("drops both deferred preflight results after actor change without native start or request identity", async (): Promise<void> => {
    const availability = createDeferred<VoiceAvailabilitySnapshot | null>();
    const permission = createDeferred<MicrophonePermissionStatus>();
    mockAvailabilityRefresh.mockReturnValue(availability.promise);
    mockRefreshPermission.mockReturnValue(permission.promise);
    const flow = renderStartupFlow(() => true);

    let pending: ReturnType<typeof flow.result.current.startFlow> | undefined;
    act((): void => {
      pending = flow.result.current.startFlow();
    });
    await flush();
    expect(mockAvailabilityRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshPermission).toHaveBeenCalledTimes(1);

    mockUserId = "user-2";
    flow.rerender(undefined);
    availability.resolve(allowed);
    permission.resolve("granted");

    let result: Awaited<ReturnType<typeof flow.result.current.startFlow>> | undefined;
    await act(async (): Promise<void> => {
      result = await pending;
    });

    expect(result).toEqual({ kind: "not-started", reason: "actor-changed" });
    expect(mockRecorderStart).not.toHaveBeenCalled();
    expect(mockRandomUUID).not.toHaveBeenCalled();
  });

  it("admits at most one operation under rapid duplicate starts", async (): Promise<void> => {
    const availability = createDeferred<VoiceAvailabilitySnapshot | null>();
    const permission = createDeferred<MicrophonePermissionStatus>();
    mockAvailabilityRefresh.mockReturnValue(availability.promise);
    mockRefreshPermission.mockReturnValue(permission.promise);
    const flow = renderStartupFlow(() => true);

    let first: ReturnType<typeof flow.result.current.startFlow> | undefined;
    let duplicate: Awaited<ReturnType<typeof flow.result.current.startFlow>> | undefined;
    act((): void => {
      first = flow.result.current.startFlow();
    });
    await act(async (): Promise<void> => {
      duplicate = await flow.result.current.startFlow();
    });

    expect(duplicate).toEqual({ kind: "not-started", reason: "cancelled" });
    expect(mockAvailabilityRefresh).toHaveBeenCalledTimes(1);

    availability.resolve(allowed);
    permission.resolve("granted");
    await act(async (): Promise<void> => {
      await first;
    });
    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });

  it("does not claim Recording until recorder onStarted reports true capture", async (): Promise<void> => {
    const nativeStart = createDeferred<void>();
    let onStarted: (() => void) | undefined;
    mockRecorderStart.mockImplementationOnce(
      (options?: RecorderStartOptions): Promise<void> => {
        onStarted = options?.onStarted;
        return nativeStart.promise;
      }
    );
    const flow = renderStartupFlow(() => true);

    let pending: ReturnType<typeof flow.result.current.startFlow> | undefined;
    act((): void => {
      pending = flow.result.current.startFlow();
    });
    await flush();

    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    expect(flow.result.current.flowStatus).toBe("starting");

    act((): void => {
      onStarted?.();
    });
    expect(flow.result.current.flowStatus).toBe("recording");

    nativeStart.resolve(undefined);
    await act(async (): Promise<void> => {
      await pending;
    });
    expect(flow.result.current.flowStatus).toBe("recording");
  });

  it("maps native start failure to the existing error without false Recording", async (): Promise<void> => {
    mockRecorderStart.mockRejectedValueOnce(new Error("native start failed"));
    const flow = renderStartupFlow(() => true);

    let result:
      | Awaited<ReturnType<typeof flow.result.current.startFlow>>
      | undefined;
    await act(async (): Promise<void> => {
      result = await flow.result.current.startFlow();
    });

    expect(result).toEqual({ kind: "not-started", reason: "start-failed" });
    expect(flow.result.current.flowStatus).toBe("error");
  });

  it("emits privacy-safe monotonic startup timing records with stage and numeric duration only", async (): Promise<void> => {
    const flow = renderStartupFlow(() => true);

    await act(async (): Promise<void> => {
      await flow.result.current.startFlow();
    });

    const timingCalls = mockLoggerInfo.mock.calls.filter(
      ([event]): boolean => event === "voice.startupTiming"
    );
    expect(timingCalls.length).toBeGreaterThanOrEqual(2);

    const stages = new Set<string>();
    for (const [, payload] of timingCalls) {
      expect(Object.keys(payload).sort()).toEqual(["durationMs", "stage"]);
      expect(typeof payload.stage).toBe("string");
      expect(typeof payload.durationMs).toBe("number");
      if (typeof payload.durationMs !== "number") {
        throw new Error("Expected numeric startup timing duration");
      }
      expect(Number.isFinite(payload.durationMs)).toBe(true);
      expect(payload.durationMs).toBeGreaterThanOrEqual(0);
      stages.add(String(payload.stage));
    }

    // Separate monotonic durations identify whether network or native permission
    // dominates Starting; the combined gate still measures their parallel span.
    expect(stages.has("availability")).toBe(true);
    expect(stages.has("permission")).toBe(true);
    expect(stages.has("availability_permission")).toBe(true);
    expect(stages.has("native_start")).toBe(true);
  });

  it("does not block native recording when optional startup timing logging throws", async (): Promise<void> => {
    mockLoggerInfo.mockImplementation((): void => {
      throw new Error("Startup diagnostic sink unavailable");
    });
    const flow = renderStartupFlow(() => true);

    let result:
      | Awaited<ReturnType<typeof flow.result.current.startFlow>>
      | undefined;
    await act(async (): Promise<void> => {
      result = await flow.result.current.startFlow();
    });

    expect(result).toEqual({ kind: "started" });
    expect(flow.result.current.flowStatus).toBe("recording");
    expect(mockAvailabilityRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefreshPermission).toHaveBeenCalledTimes(1);
    expect(mockRecorderStart).toHaveBeenCalledTimes(1);
    // The diagnostics path is actually exercised; merely omitting logging
    // would not satisfy this positive safety control.
    expect(mockLoggerInfo).toHaveBeenCalled();
  });
});
