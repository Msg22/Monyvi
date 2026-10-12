import {
  act,
  actAsync,
  mockGetStatus,
  mockRelease,
  mountedUnmounts,
  renderHook,
  startRecordingWithFlush,
  unwrap,
  useVoiceRecorder,
} from "./voice-recorder-fixtures";
import { AudioModule } from "expo-audio";
import type { VoiceRecorderStopResult } from "@/hooks/useVoiceRecorder";

describe("useVoiceRecorder — Metering lifecycle and isolation", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockGetStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 1000,
      metering: -75.0,
      mediaServicesDidReset: false,
    });
  });

  afterEach((): void => {
    mountedUnmounts.splice(0).forEach((fn) => fn());
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("explicitly enables isMeteringEnabled in AudioRecorder options", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);

    expect(AudioModule.AudioRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        isMeteringEnabled: true,
      })
    );

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });
  });

  it("samples exactly once per 100ms tick, never at start/stop/pause, and freezes snapshot on stop", async (): Promise<void> => {
    mockGetStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 1000,
      metering: -75.0,
      mediaServicesDidReset: false,
    });

    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);

    // startRecordingWithFlush advances 300ms stabilization delay during active capture:
    // exactly 3 ticks ran at 100ms, 200ms, 300ms.
    expect(mockGetStatus).toHaveBeenCalledTimes(3);

    // Advance 5 ticks (500 ms)
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 3 initial + 5 ticks = 8 calls
    expect(mockGetStatus).toHaveBeenCalledTimes(8);

    const stopHolder: { current: VoiceRecorderStopResult | null } = {
      current: null,
    };

    await actAsync(async (): Promise<void> => {
      stopHolder.current = await unwrap(result).stop();
    });

    // No additional getStatus reads inside stop()
    expect(mockGetStatus).toHaveBeenCalledTimes(8);
    expect(stopHolder.current).not.toBeNull();
    expect(unwrap(result).status).toBe("completed");

    const snapshot =
      stopHolder.current?.metering ?? unwrap(result).meteringSnapshot;
    expect(snapshot).not.toBeNull();
    expect(snapshot?.validSampleCount).toBe(8);
    expect(snapshot?.hasAudibleSample).toBe(false);
    expect(snapshot?.hasSentinelOrPoison).toBe(false);

    // Repeated stop() while completed returns null (already completed)
    await actAsync(async (): Promise<void> => {
      const secondStop = await unwrap(result).stop();
      expect(secondStop).toBeNull();
    });

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });
  });

  it("excludes paused time from metering ticks and active duration without getStatus reads during pause", async (): Promise<void> => {
    mockGetStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 1000,
      metering: -75.0,
      mediaServicesDidReset: false,
    });

    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);

    // 3 ticks during stabilization delay
    expect(mockGetStatus).toHaveBeenCalledTimes(3);

    // Active for another 300 ms (3 ticks) -> 3 + 3 = 6
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(mockGetStatus).toHaveBeenCalledTimes(6);

    // Pause recording
    act(() => {
      unwrap(result).pause();
    });
    expect(unwrap(result).status).toBe("paused");
    const pausedDuration = unwrap(result).durationMs;

    // Advance 2000 ms while paused: NO extra getStatus calls!
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(mockGetStatus).toHaveBeenCalledTimes(6);
    expect(unwrap(result).durationMs).toBe(pausedDuration);

    // Resume recording
    act(() => {
      unwrap(result).resume();
    });
    expect(unwrap(result).status).toBe("recording");

    // Active for another 200 ms (2 ticks) -> 6 + 2 = 8
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockGetStatus).toHaveBeenCalledTimes(8);

    const stopHolder: { current: VoiceRecorderStopResult | null } = {
      current: null,
    };

    await actAsync(async (): Promise<void> => {
      stopHolder.current = await unwrap(result).stop();
    });

    expect(stopHolder.current).not.toBeNull();
    expect(stopHolder.current?.durationMs).toBeLessThan(1000);
    expect(stopHolder.current?.metering?.validSampleCount).toBe(8);
    expect(stopHolder.current?.metering?.activeDurationMs).toBeLessThan(1000);
    expect(stopHolder.current?.metering?.maxActiveGapMs).toBeLessThanOrEqual(
      250
    );

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });
  });

  it("freezes snapshot once at 30s cap before native release and deduplicates stop", async (): Promise<void> => {
    mockGetStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 1000,
      metering: -75.0,
      mediaServicesDidReset: false,
    });

    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);

    // Advance to active cap (30,000 ms)
    await actAsync(async (): Promise<void> => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(unwrap(result).status).toBe("completed");
    expect(unwrap(result).durationMs).toBe(30_000);

    const snapshot = unwrap(result).meteringSnapshot;
    expect(snapshot).not.toBeNull();
    expect(snapshot?.activeDurationMs).toBe(30_000);

    // Native release must not have happened yet (file is retained for review/submit)
    expect(mockRelease).not.toHaveBeenCalled();

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });
    expect(mockRelease).toHaveBeenCalled();
  });

  it("poisons snapshot when metering is missing or non-finite", async (): Promise<void> => {
    // Missing metering field
    mockGetStatus.mockReturnValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 1000,
      mediaServicesDidReset: false,
    });

    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    const stopHolder: { current: VoiceRecorderStopResult | null } = {
      current: null,
    };

    await actAsync(async (): Promise<void> => {
      stopHolder.current = await unwrap(result).stop();
    });

    expect(stopHolder.current?.metering?.hasSentinelOrPoison).toBe(true);

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });
  });

  it("flushes and resets metering snapshot on discard and new recording start", async (): Promise<void> => {
    const { result } = renderHook(() => useVoiceRecorder());
    await startRecordingWithFlush(result);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });

    expect(unwrap(result).status).toBe("idle");
    expect(unwrap(result).meteringSnapshot).toBeNull();

    // Start fresh recording session: accumulator is fresh, snapshot is null
    await startRecordingWithFlush(result);
    expect(unwrap(result).status).toBe("recording");
    expect(unwrap(result).meteringSnapshot).toBeNull();

    await actAsync(async (): Promise<void> => {
      await unwrap(result).discard();
    });
  });
});
