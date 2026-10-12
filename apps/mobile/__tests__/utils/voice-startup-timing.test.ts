/**
 * Startup diagnostic clock tests are deliberately outside React render/act.
 * Mocking global performance during React state transitions corrupts the
 * scheduler and does not test the public Voice timing utility accurately.
 */
import {
  finishVoiceStartupStage,
  runVoiceStartupPreflight,
  timeVoiceStartupStage,
  voiceStartupClock,
} from "@/utils/voice-startup-timing";

const mockLoggerInfo = jest.fn<
  void,
  [string, Readonly<Record<string, unknown>>]
>();

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

beforeEach((): void => {
  jest.clearAllMocks();
});

afterEach((): void => {
  jest.restoreAllMocks();
});

describe("Voice startup monotonic diagnostic safety", () => {
  it.each([
    {
      behavior: "throws",
      failingNow: (): number => {
        throw new Error("Monotonic clock unavailable");
      },
    },
    {
      behavior: "returns NaN",
      failingNow: (): number => Number.NaN,
    },
    {
      behavior: "returns infinity",
      failingNow: (): number => Number.POSITIVE_INFINITY,
    },
  ])(
    "preserves successful async operations when performance.now $behavior",
    async ({ failingNow }): Promise<void> => {
      // No renderHook or React state updates occur while this clock is broken.
      const clock = jest
        .spyOn(globalThis.performance, "now")
        .mockImplementation(failingNow);
      try {
        expect(voiceStartupClock()).toBeNull();
        expect(clock).toHaveBeenCalled();

        let operationCalls = 0;
        const granted = await timeVoiceStartupStage("consent", (): Promise<string> => {
          operationCalls += 1;
          return Promise.resolve("granted");
        });
        const preflight = await runVoiceStartupPreflight(
          (): Promise<string> => Promise.resolve("allowed"),
          (): Promise<string> => Promise.resolve("granted")
        );

        expect(granted).toBe("granted");
        expect(preflight).toEqual(["allowed", "granted"]);
        expect(operationCalls).toBe(1);
        // Exercise both standalone and wrapped clock reads, not a
        // vacuous always-null fallback that never calls performance.now.
        expect(clock.mock.calls.length).toBeGreaterThan(1);
        expect(mockLoggerInfo).not.toHaveBeenCalled();
      } finally {
        clock.mockRestore();
      }
    }
  );

  it("ignores an optional logger failure without changing a successful operation", async (): Promise<void> => {
    const clock = jest
      .spyOn(globalThis.performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110);
    mockLoggerInfo.mockImplementationOnce((): void => {
      throw new Error("Diagnostic logger unavailable");
    });
    try {
      const result = await timeVoiceStartupStage(
        "consent",
        (): Promise<boolean> => Promise.resolve(true)
      );

      expect(result).toBe(true);
      expect(clock).toHaveBeenCalledTimes(2);
      // The sink really throws, but the caller still completes successfully.
      expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
      const [, payload] = mockLoggerInfo.mock.calls[0];
      expect(Object.keys(payload).sort()).toEqual(["durationMs", "stage"]);
      expect(mockLoggerInfo).toHaveBeenCalledWith("voice.startupTiming", {
        stage: "consent",
        durationMs: 10,
      });
    } finally {
      clock.mockRestore();
    }
  });

  it("clamps a backwards clock to a finite stage-only duration", (): void => {
    const clock = jest
      .spyOn(globalThis.performance, "now")
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(150);
    try {
      const startedAt = voiceStartupClock();
      finishVoiceStartupStage("native_start", startedAt);
      expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
      expect(mockLoggerInfo).toHaveBeenCalledWith("voice.startupTiming", {
        stage: "native_start",
        durationMs: 0,
      });
    } finally {
      clock.mockRestore();
    }
  });
});
