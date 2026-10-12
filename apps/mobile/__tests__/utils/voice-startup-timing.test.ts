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

        let operationCalls = 0;
        const granted = await timeVoiceStartupStage("consent", async () => {
          operationCalls += 1;
          return "granted";
        });
        const preflight = await runVoiceStartupPreflight(
          async () => "allowed",
          async () => "granted"
        );

        expect(granted).toBe("granted");
        expect(preflight).toEqual(["allowed", "granted"]);
        expect(operationCalls).toBe(1);
        expect(mockLoggerInfo).not.toHaveBeenCalled();
      } finally {
        clock.mockRestore();
      }
    }
  );

  it("ignores an optional logger failure without changing a successful operation", async (): Promise<void> => {
    mockLoggerInfo.mockImplementationOnce((): void => {
      throw new Error("Diagnostic logger unavailable");
    });

    const result = await timeVoiceStartupStage(
      "consent",
      async (): Promise<boolean> => true
    );

    expect(result).toBe(true);
    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    const [, payload] = mockLoggerInfo.mock.calls[0];
    expect(Object.keys(payload).sort()).toEqual(["durationMs", "stage"]);
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
