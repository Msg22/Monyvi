import { parseCanonicalDecimal } from "./decimal";

export interface RateTrustInput {
  readonly valueDecimal: string | null;
  readonly providerObservedAt?: number | string | null;
  readonly capturedAt: number;
  readonly quality: "valid" | "invalid" | "unknown";
}

export interface RateTrustResult {
  readonly state: "fresh" | "stale" | "unknown" | "missing";
  readonly ageMs: number | null;
}

const RATE_FRESHNESS_WINDOW_MS = 86_400_000;

export function classifyRateTrust(
  reference: RateTrustInput,
  nowMs: number
): RateTrustResult {
  if (!hasUsableRateValue(reference)) {
    return { state: "missing", ageMs: null };
  }
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    return { state: "unknown", ageMs: null };
  }
  if (!Number.isFinite(reference.capturedAt) || reference.capturedAt < 0) {
    return { state: "unknown", ageMs: null };
  }
  if (
    typeof reference.providerObservedAt !== "number" ||
    !Number.isFinite(reference.providerObservedAt) ||
    reference.providerObservedAt < 0 ||
    reference.providerObservedAt > reference.capturedAt
  ) {
    return { state: "unknown", ageMs: null };
  }

  const ageMs = nowMs - reference.providerObservedAt;
  if (ageMs < 0) {
    return { state: "unknown", ageMs: null };
  }
  return ageMs > RATE_FRESHNESS_WINDOW_MS
    ? { state: "stale", ageMs }
    : { state: "fresh", ageMs };
}

function hasUsableRateValue(reference: RateTrustInput): boolean {
  if (reference.quality !== "valid" || reference.valueDecimal === null) {
    return false;
  }

  try {
    return parseCanonicalDecimal(reference.valueDecimal).greaterThan("0");
  } catch {
    return false;
  }
}
