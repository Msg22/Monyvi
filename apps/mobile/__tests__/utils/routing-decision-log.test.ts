/**
 * Unit tests for buildRoutingDecisionLog helper.
 *
 * Validates the exact payload shape emitted by the routing gate (FR-014):
 * - Contains outcome, onboardingCompleted, syncState — no more, no less.
 * - No PII fields (no userId, email, preference values).
 * - All values are serializable (JSON-safe).
 */

import type {
  RoutingInputs,
  RoutingOutcome,
  RoutingDecisionLog,
} from "@/utils/routing-decision";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInputs(overrides: Partial<RoutingInputs> = {}): RoutingInputs {
  return {
    syncState: "success",
    onboardingCompleted: false,
    initialSyncFailureReason: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("buildRoutingDecisionLog", () => {
  let buildRoutingDecisionLog: (
    inputs: RoutingInputs,
    outcome: RoutingOutcome
  ) => RoutingDecisionLog;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/utils/routing-decision") as {
      buildRoutingDecisionLog: (
        inputs: RoutingInputs,
        outcome: RoutingOutcome
      ) => RoutingDecisionLog;
    };
    buildRoutingDecisionLog = mod.buildRoutingDecisionLog;
  });

  it("produces a serializable object", () => {
    const log = buildRoutingDecisionLog(makeInputs(), "onboarding");
    expect(() => JSON.stringify(log)).not.toThrow();
  });

  it("includes the outcome field", () => {
    const log = buildRoutingDecisionLog(makeInputs(), "dashboard");
    expect(log.outcome).toBe("dashboard");
  });

  it("includes the syncState field", () => {
    const log = buildRoutingDecisionLog(
      makeInputs({ syncState: "failed" }),
      "retry"
    );
    expect(log.syncState).toBe("failed");
  });

  it("includes onboardingCompleted", () => {
    const logTrue = buildRoutingDecisionLog(
      makeInputs({ onboardingCompleted: true }),
      "dashboard"
    );
    const logFalse = buildRoutingDecisionLog(
      makeInputs({ onboardingCompleted: false }),
      "onboarding"
    );
    expect(logTrue.onboardingCompleted).toBe(true);
    expect(logFalse.onboardingCompleted).toBe(false);
  });

  it("includes the startup failure reason without technical details", () => {
    const log = buildRoutingDecisionLog(
      makeInputs({
        syncState: "failed",
        initialSyncFailureReason: "market-rates-unavailable",
      }),
      "retry"
    );

    expect(log.initialSyncFailureReason).toBe("market-rates-unavailable");
  });

  it("contains no PII fields (no userId, email, or preference values)", () => {
    const log = buildRoutingDecisionLog(makeInputs(), "onboarding");
    const serialized = JSON.stringify(log);

    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("preferredCurrency");
    expect(serialized).not.toContain("preferredLanguage");
  });

  it("has exactly the expected top-level keys — nothing more, nothing less", () => {
    const log = buildRoutingDecisionLog(makeInputs(), "loading");
    const keys = Object.keys(log).sort();
    expect(keys).toEqual([
      "initialSyncFailureReason",
      "onboardingCompleted",
      "outcome",
      "syncState",
    ]);
  });
});
