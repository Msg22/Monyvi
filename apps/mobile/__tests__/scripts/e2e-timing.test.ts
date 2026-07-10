interface E2eTimingModule {
  formatDurationMs(durationMs: number): string;
}

const e2eTiming = jest.requireActual(
  "../../scripts/e2e-timing"
) as E2eTimingModule;

describe("e2e timing", () => {
  it("formats short and multi-minute flow durations for CI logs", () => {
    expect(e2eTiming.formatDurationMs(1_250)).toBe("1.3s");
    expect(e2eTiming.formatDurationMs(61_400)).toBe("1m 1s");
  });
});
