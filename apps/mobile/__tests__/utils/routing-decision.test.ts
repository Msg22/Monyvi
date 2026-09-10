/**
 * Unit tests for the pure post-sign-in routing decision.
 * Market-rate availability is deliberately absent: current rate-dependent
 * values fail closed inside their screens and never gate authenticated startup.
 */

import {
  getRoutingDecision,
  type RoutingInputs,
  type RoutingOutcome,
} from "@/utils/routing-decision";

type SyncState = RoutingInputs["syncState"];

function makeInputs(overrides: Partial<RoutingInputs> = {}): RoutingInputs {
  return {
    syncState: "success",
    onboardingCompleted: false,
    initialSyncFailureReason: null,
    ...overrides,
  };
}

const ALL_SYNC_STATES: readonly SyncState[] = [
  "in-progress",
  "success",
  "failed",
  "timeout",
];

const ALL_OUTCOMES: readonly RoutingOutcome[] = [
  "loading",
  "dashboard",
  "onboarding",
  "retry",
];

describe("getRoutingDecision", () => {
  it('returns "loading" while the initial profile sync is in progress', () => {
    expect(getRoutingDecision(makeInputs({ syncState: "in-progress" }))).toBe(
      "loading"
    );
  });

  it.each(["failed", "timeout"] as const)(
    'returns "retry" when syncState is "%s" and onboarding is unresolved',
    (syncState) => {
      expect(
        getRoutingDecision(
          makeInputs({ syncState, onboardingCompleted: false })
        )
      ).toBe("retry");
    }
  );

  it.each(["failed", "timeout"] as const)(
    'keeps an onboarded user on the dashboard when background sync is "%s"',
    (syncState) => {
      expect(
        getRoutingDecision(
          makeInputs({ syncState, onboardingCompleted: true })
        )
      ).toBe("dashboard");
    }
  );

  it('returns "dashboard" after successful startup for an onboarded user', () => {
    expect(
      getRoutingDecision(
        makeInputs({ syncState: "success", onboardingCompleted: true })
      )
    ).toBe("dashboard");
  });

  it('returns "onboarding" after successful startup for a new user', () => {
    expect(
      getRoutingDecision(
        makeInputs({ syncState: "success", onboardingCompleted: false })
      )
    ).toBe("onboarding");
  });

  it.each(ALL_SYNC_STATES)(
    "returns a valid outcome for syncState=%s, onboardingCompleted=false",
    (syncState) => {
      expect(ALL_OUTCOMES).toContain(
        getRoutingDecision(
          makeInputs({ syncState, onboardingCompleted: false })
        )
      );
    }
  );

  it.each(ALL_SYNC_STATES)(
    "returns a valid outcome for syncState=%s, onboardingCompleted=true",
    (syncState) => {
      expect(ALL_OUTCOMES).toContain(
        getRoutingDecision(
          makeInputs({ syncState, onboardingCompleted: true })
        )
      );
    }
  );
});
