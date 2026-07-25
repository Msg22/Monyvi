export interface SmsAiAvailabilityBlocker {
  readonly reason: string;
  readonly availableAt: string | null;
}

export interface SmsAiAvailability {
  readonly reason: string | null;
  readonly availableAt: string | null;
}

export interface ResolveSmsAiAvailabilityInput {
  readonly serverNow: string;
  readonly blockers: readonly SmsAiAvailabilityBlocker[];
}

function parseTimestamp(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return timestamp;
}

export function resolveSmsAiAvailability(
  input: ResolveSmsAiAvailabilityInput
): SmsAiAvailability {
  const serverNowMs = parseTimestamp(input.serverNow, "serverNow");
  let latestBlocker: SmsAiAvailabilityBlocker | null = null;
  let latestAvailableAtMs = serverNowMs;

  for (const blocker of input.blockers) {
    if (blocker.availableAt === null) {
      continue;
    }

    const availableAtMs = parseTimestamp(blocker.availableAt, "availableAt");
    if (availableAtMs <= serverNowMs || availableAtMs <= latestAvailableAtMs) {
      continue;
    }

    latestAvailableAtMs = availableAtMs;
    latestBlocker = blocker;
  }

  return latestBlocker === null
    ? { reason: null, availableAt: null }
    : {
        reason: latestBlocker.reason,
        availableAt: latestBlocker.availableAt,
      };
}
