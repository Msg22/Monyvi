import {
  calculateEffectiveScanBoundary,
  findContiguousDurableCheckpoint,
} from "../sms-scan-boundary";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("SMS scan boundaries", () => {
  it("uses the inclusive rolling lookback for initial and history scans", () => {
    expect(
      calculateEffectiveScanBoundary({
        scanKind: "history",
        scanStartedAtMs: 40 * DAY_MS,
        lookbackDays: 30,
        overlapMs: 5 * 60 * 1000,
        checkpoint: null,
      })
    ).toBe(10 * DAY_MS);
  });

  it("uses the checkpoint overlap without escaping the rolling window", () => {
    expect(
      calculateEffectiveScanBoundary({
        scanKind: "incremental",
        scanStartedAtMs: 40 * DAY_MS,
        lookbackDays: 30,
        overlapMs: 5 * 60 * 1000,
        checkpoint: {
          boundaryReceivedAtMs: 39 * DAY_MS,
        },
      })
    ).toBe(39 * DAY_MS - 5 * 60 * 1000);
  });

  it("falls back to the rolling boundary when an incremental scan has no checkpoint", () => {
    expect(
      calculateEffectiveScanBoundary({
        scanKind: "incremental",
        scanStartedAtMs: 40 * DAY_MS,
        lookbackDays: 30,
        overlapMs: 5 * 60 * 1000,
        checkpoint: null,
      })
    ).toBe(10 * DAY_MS);
  });

  it("stops the checkpoint before the first unresolved candidate", () => {
    const checkpoint = findContiguousDurableCheckpoint([
      { fingerprint: "a", receivedAtMs: 1, isDurable: true },
      { fingerprint: "b", receivedAtMs: 2, isDurable: false },
      { fingerprint: "c", receivedAtMs: 3, isDurable: true },
    ]);

    expect(checkpoint).toEqual({
      boundaryFingerprint: "a",
      boundaryReceivedAtMs: 1,
    });
  });

  it("uses the fingerprint tie-breaker for messages sharing a timestamp", () => {
    const checkpoint = findContiguousDurableCheckpoint([
      { fingerprint: "c", receivedAtMs: 1, isDurable: true },
      { fingerprint: "a", receivedAtMs: 1, isDurable: true },
      { fingerprint: "b", receivedAtMs: 1, isDurable: false },
    ]);

    expect(checkpoint).toEqual({
      boundaryFingerprint: "a",
      boundaryReceivedAtMs: 1,
    });
  });
});
