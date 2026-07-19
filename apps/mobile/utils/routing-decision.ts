/**
 * Pure routing-decision function for the post-sign-in onboarding gate.
 *
 * No I/O, no React, no side effects. Maps sync state + the single DB flag
 * to the next screen the user should see. Unit-testable in isolation.
 *
 * Binary gate per spec (simplified 2026-04-18): the router only decides
 * dashboard-vs-onboarding. Per-step resume within the onboarding flow is
 * resolved inside `onboarding.tsx` via the AsyncStorage cursor
 * (`onboarding:<userId>:step`) — not here.
 *
 * @module routing-decision
 */

// =============================================================================
// Types
// =============================================================================

/** The sync state owned by SyncProvider, read by the gate. */
export type InitialSyncState = "in-progress" | "success" | "failed" | "timeout";

/** Essential startup data that remains unavailable after a blocking sync. */
export type InitialSyncFailureReason = "market-rates-unavailable" | null;

/** Possible outcomes of the routing decision. */
export type RoutingOutcome = "loading" | "dashboard" | "onboarding" | "retry";

/** Inputs to the routing decision. */
export interface RoutingInputs {
  readonly syncState: InitialSyncState;
  readonly onboardingCompleted: boolean;
  readonly initialSyncFailureReason: InitialSyncFailureReason;
}

/** Log payload emitted per routing-gate evaluation (FR-014). No PII. */
export interface RoutingDecisionLog {
  readonly outcome: RoutingOutcome;
  readonly onboardingCompleted: boolean;
  readonly syncState: InitialSyncState;
  readonly initialSyncFailureReason: InitialSyncFailureReason;
}

// =============================================================================
// Pure routing function
// =============================================================================

/**
 * Maps sync state + `profile.onboarding_completed` to the next route.
 *
 * Priority order:
 * 1. Sync still in progress → loading (splash / neutral backdrop)
 * 2. Required market rates still unavailable → retry. Financial totals
 *    cannot render safely without one valid cached rate row.
 * 3. Already-onboarded user (flag = true) → dashboard for generic sync
 *    failures. Per Constitution I, valid WatermelonDB state remains the
 *    offline source of truth and background retries recover sync.
 * 4. Sync succeeded AND flag = false → onboarding (the onboarding screen
 *    resolves the exact phase from its per-user AsyncStorage cursor).
 * 5. Sync failed/timeout AND flag = false → retry. A not-yet-onboarded
 *    user has no local state yet, and without a successful initial pull
 *    we can't route them safely into the onboarding flow.
 */
export function getRoutingDecision(inputs: RoutingInputs): RoutingOutcome {
  if (inputs.syncState === "in-progress") return "loading";
  if (inputs.initialSyncFailureReason === "market-rates-unavailable") {
    return "retry";
  }
  if (inputs.onboardingCompleted) return "dashboard";
  if (inputs.syncState !== "success") return "retry";
  return "onboarding";
}

// =============================================================================
// Log helper
// =============================================================================

/**
 * Builds a structured, serializable log payload for the routing decision.
 * Contains no PII — no user ID, email, preference values, or IP.
 */
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
