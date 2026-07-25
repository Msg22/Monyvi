export type SmsScanKind = "initial" | "incremental" | "history" | "live";

interface ScanBoundaryCheckpoint {
  readonly boundaryReceivedAtMs: number;
}

interface CalculateEffectiveScanBoundaryInput {
  readonly scanKind: SmsScanKind;
  readonly scanStartedAtMs: number;
  readonly lookbackDays: number;
  readonly overlapMs: number;
  readonly checkpoint: ScanBoundaryCheckpoint | null;
}

export interface DurableCandidateState {
  readonly fingerprint: string;
  readonly receivedAtMs: number;
  readonly isDurable: boolean;
}

export interface DurableCheckpointBoundary {
  readonly boundaryFingerprint: string;
  readonly boundaryReceivedAtMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateEffectiveScanBoundary(
  input: CalculateEffectiveScanBoundaryInput
): number {
  const rollingBoundary = input.scanStartedAtMs - input.lookbackDays * DAY_MS;
  if (input.scanKind !== "incremental" || input.checkpoint === null) {
    return rollingBoundary;
  }

  return Math.max(
    rollingBoundary,
    input.checkpoint.boundaryReceivedAtMs - input.overlapMs
  );
}

export function findContiguousDurableCheckpoint(
  states: readonly DurableCandidateState[]
): DurableCheckpointBoundary | null {
  const ordered = [...states].sort((left, right) => {
    if (left.receivedAtMs !== right.receivedAtMs) {
      return left.receivedAtMs - right.receivedAtMs;
    }
    return left.fingerprint.localeCompare(right.fingerprint);
  });

  let latest: DurableCandidateState | null = null;
  for (const state of ordered) {
    if (!state.isDurable) break;
    latest = state;
  }

  return latest === null
    ? null
    : {
        boundaryFingerprint: latest.fingerprint,
        boundaryReceivedAtMs: latest.receivedAtMs,
      };
}
