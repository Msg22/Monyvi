/**
 * Pure routing-decision function for the post-sign-in onboarding gate.
 *
 * No I/O, React lifecycle, or market-rate availability participates here.
 * Rate-dependent screens fail closed independently while recorded user facts
 * and authenticated navigation remain available offline.
 */

export type InitialSyncState = "in-progress" | "success" | "failed" | "timeout";

/**
 * No market-rate condition is essential authenticated startup data. The field
 * remains in the context shape for compatibility with the existing route gate.
 */
export type InitialSyncFailureReason = "market-rates-unavailable" | null;

export type RoutingOutcome = "loading" | "dashboard" | "onboarding" | "retry";

export interface RoutingInputs {
  readonly syncState: InitialSyncState;
  readonly onboardingCompleted: boolean;
  readonly initialSyncFailureReason: InitialSyncFailureReason;
}

export interface RoutingDecisionLog {
  readonly outcome: RoutingOutcome;
  readonly onboardingCompleted: boolean;
  readonly syncState: InitialSyncState;
  readonly initialSyncFailureReason: InitialSyncFailureReason;
}

/**
 * Maps profile-sync state plus `profile.onboarding_completed` to the next route.
 * Existing onboarded data remains usable when background sync fails; only a new
 * or unresolved profile needs the retry route.
 */
export function getRoutingDecision(inputs: RoutingInputs): RoutingOutcome {
  if (inputs.syncState === "in-progress") return "loading";
  if (inputs.onboardingCompleted) return "dashboard";
  if (inputs.syncState !== "success") return "retry";
  return "onboarding";
}

export function buildRoutingDecisionLog(
  inputs: RoutingInputs,
  outcome: RoutingOutcome
): RoutingDecisionLog {
  return {
    outcome,
    onboardingCompleted: inputs.onboardingCompleted,
    syncState: inputs.syncState,
    initialSyncFailureReason: inputs.initialSyncFailureReason,
  };
}
