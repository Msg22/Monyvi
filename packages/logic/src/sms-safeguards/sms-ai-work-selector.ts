export interface SmsAiWorkCandidate {
  readonly fingerprint: string;
  readonly receivedAtMs: number;
}

export interface SmsAiWorkSelection<TCandidate extends SmsAiWorkCandidate> {
  readonly admitted: readonly TCandidate[];
  readonly deferred: readonly TCandidate[];
}

function compareCandidates(
  left: SmsAiWorkCandidate,
  right: SmsAiWorkCandidate
): number {
  if (left.receivedAtMs !== right.receivedAtMs) {
    return right.receivedAtMs - left.receivedAtMs;
  }
  return left.fingerprint.localeCompare(right.fingerprint);
}

export function selectSmsAiWork<TCandidate extends SmsAiWorkCandidate>(
  candidates: readonly TCandidate[],
  availableUnits: number
): SmsAiWorkSelection<TCandidate> {
  const safeAvailableUnits = Math.max(0, Math.floor(availableUnits));
  const ordered = [...candidates].sort(compareCandidates);
  return {
    admitted: ordered.slice(0, safeAvailableUnits),
    deferred: ordered.slice(safeAvailableUnits),
  };
}
