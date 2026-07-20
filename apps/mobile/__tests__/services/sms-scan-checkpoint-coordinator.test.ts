const mockLoadCheckpoint = jest.fn();
const mockSaveCheckpoint = jest.fn();
const mockGetProcessingOutcomes = jest.fn();
const mockGetOversizedFingerprints = jest.fn();

jest.mock("@/services/sms-scan-checkpoint-service", () => ({
  loadSmsScanCheckpoint: (...args: readonly unknown[]): unknown =>
    mockLoadCheckpoint(...args),
  saveSmsScanCheckpoint: (...args: readonly unknown[]): unknown =>
    mockSaveCheckpoint(...args),
}));
jest.mock("@/services/sms-processing-outcome-service", () => ({
  getSmsProcessingOutcomes: (...args: readonly unknown[]): unknown =>
    mockGetProcessingOutcomes(...args),
}));
jest.mock("@/services/sms-oversized-outcome-service", () => ({
  getOversizedSmsFingerprints: (...args: readonly unknown[]): unknown =>
    mockGetOversizedFingerprints(...args),
}));

import {
  finalizeSmsScanCheckpoint,
  loadSmsScanSafeguardState,
  type SmsCheckpointMessageState,
} from "@/services/sms-scan-checkpoint-coordinator";

const durableOutcomes = [
  "saved",
  "local_excluded",
  "ai_negative",
  "candidate_too_large",
  "future_durable",
] as const;
const nonDurableOutcomes = [
  "memory_suggestion",
  "unresolved",
  "cancelled",
  "failed",
] as const;

function state(
  fingerprint: string,
  receivedAtMs: number,
  outcome: SmsCheckpointMessageState["outcome"]
): SmsCheckpointMessageState {
  return { fingerprint, receivedAtMs, outcome };
}

describe("sms-scan-checkpoint-coordinator", (): void => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockLoadCheckpoint.mockResolvedValue(null);
    mockSaveCheckpoint.mockImplementation((input) => Promise.resolve(input));
    mockGetProcessingOutcomes.mockResolvedValue([]);
    mockGetOversizedFingerprints.mockResolvedValue(new Set<string>());
  });

  it.each(durableOutcomes)(
    "advances through durable %s outcomes",
    async (outcome) => {
      await finalizeSmsScanCheckpoint({
        userId: "user-a",
        processingPolicyVersion: 1,
        nowMs: 10,
        states: [state("a", 1, outcome), state("b", 2, "saved")],
      });

      expect(mockSaveCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          boundaryFingerprint: "b",
          boundaryReceivedAtMs: 2,
        })
      );
    }
  );

  it.each(nonDurableOutcomes)(
    "stops before non-durable %s outcomes",
    async (outcome) => {
      await finalizeSmsScanCheckpoint({
        userId: "user-a",
        processingPolicyVersion: 1,
        nowMs: 10,
        states: [
          state("a", 1, "saved"),
          state("b", 2, outcome),
          state("c", 3, "saved"),
        ],
      });

      expect(mockSaveCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          boundaryFingerprint: "a",
          boundaryReceivedAtMs: 1,
        })
      );
    }
  );

  it("does not create a checkpoint when the oldest state is unresolved", async () => {
    await finalizeSmsScanCheckpoint({
      userId: "user-a",
      processingPolicyVersion: 1,
      nowMs: 10,
      states: [state("a", 1, "unresolved")],
    });

    expect(mockSaveCheckpoint).not.toHaveBeenCalled();
  });

  it("treats non-terminal AI negatives as known only for ordinary scans", async () => {
    mockGetProcessingOutcomes.mockResolvedValue([
      { smsFingerprint: "strike-1", strikeCount: 1, isTerminal: false },
      { smsFingerprint: "terminal", strikeCount: 3, isTerminal: true },
    ]);

    const incremental = await loadSmsScanSafeguardState({
      userId: "user-a",
      scanKind: "incremental",
      scanStartedAtMs: 10,
      fingerprints: ["strike-1", "terminal"],
      savedFingerprints: new Set(),
    });
    const history = await loadSmsScanSafeguardState({
      userId: "user-a",
      scanKind: "history",
      scanStartedAtMs: 10,
      fingerprints: ["strike-1", "terminal"],
      savedFingerprints: new Set(),
    });

    expect(incremental.durableKnownFingerprints).toEqual(
      new Set(["strike-1", "terminal"])
    );
    expect(history.durableKnownFingerprints).toEqual(new Set(["terminal"]));
  });

  it("combines saved, oversized, and future durable adapter identities", async () => {
    mockGetOversizedFingerprints.mockResolvedValue(new Set(["oversized"]));

    const result = await loadSmsScanSafeguardState({
      userId: "user-a",
      scanKind: "incremental",
      scanStartedAtMs: 10,
      fingerprints: ["saved", "oversized", "future"],
      savedFingerprints: new Set(["saved"]),
      additionalDurableFingerprints: new Set(["future"]),
    });

    expect(result.durableKnownFingerprints).toEqual(
      new Set(["saved", "oversized", "future"])
    );
  });
});
