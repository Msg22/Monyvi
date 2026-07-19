/**
 * Unit tests for getRoutingDecision and buildRoutingDecisionLog.
 *
 * These are pure functions — no React, no WatermelonDB, no network.
 * The routing decision is the binary core of the onboarding gate:
 * dashboard-vs-onboarding. Per-step resume is handled inside onboarding.tsx
 * via the AsyncStorage cursor and is NOT tested here.
 */

import type { RoutingInputs, RoutingOutcome } from "@/utils/routing-decision";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SyncState = RoutingInputs["syncState"];

/** Build a complete RoutingInputs object with sensible defaults. */
function makeInputs(overrides: Partial<RoutingInputs> = {}): RoutingInputs {
  return {
    syncState: "success",
    onboardingCompleted: false,
    initialSyncFailureReason: null,
    ...overrides,
  };
}

/** All four sync states exercised by the tests. */
const ALL_SYNC_STATES: SyncState[] = [
  "in-progress",
  "success",
  "failed",
  "timeout",
];

const ALL_OUTCOMES: RoutingOutcome[] = [
  "loading",
  "dashboard",
  "onboarding",
  "retry",
];

// ---------------------------------------------------------------------------

describe("getRoutingDecision", () => {
  let getRoutingDecision: (inputs: RoutingInputs) => RoutingOutcome;

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/utils/routing-decision") as {
      getRoutingDecision: (inputs: RoutingInputs) => RoutingOutcome;
    };
    getRoutingDecision = mod.getRoutingDecision;
  });

  // =========================================================================
  // Sync-state gate (highest priority)
  // =========================================================================

  describe("sync state gating", () => {
    it('returns "loading" when syncState is "in-progress"', () => {
      expect(getRoutingDecision(makeInputs({ syncState: "in-progress" }))).toBe(
        "loading"
      );
    });

    describe("required startup data gating", () => {
      it.each(["failed", "timeout"] as SyncState[])(
        'returns "retry" when syncState is "%s" and onboardingCompleted=false',
        (syncState) => {
          expect(
            getRoutingDecision(
              makeInputs({ syncState, onboardingCompleted: false })
            )
          ).toBe("retry");
        }
      );

      it("still renders the loading backdrop when sync is in-progress even if onboardingCompleted=true", () => {
        expect(
          getRoutingDecision(
            makeInputs({ syncState: "in-progress", onboardingCompleted: true })
          )
        ).toBe("loading");
      });

      it("routes the already-onboarded user to dashboard when sync failed — WatermelonDB is authoritative offline (Constitution I; CR review on routing-decision.ts)", () => {
        expect(
          getRoutingDecision(
            makeInputs({ syncState: "failed", onboardingCompleted: true })
          )
        ).toBe("dashboard");
      });

      it("routes the already-onboarded user to dashboard when sync timed out — same rationale, offline-first", () => {
        expect(
          getRoutingDecision(
            makeInputs({ syncState: "timeout", onboardingCompleted: true })
          )
        ).toBe("dashboard");
      });
    });

    it.each(["failed", "timeout"] as SyncState[])(
      'returns "retry" for an onboarded user when required market rates remain unavailable after sync %s',
      (syncState) => {
        expect(
          getRoutingDecision(
            makeInputs({
              syncState,
              onboardingCompleted: true,
              initialSyncFailureReason: "market-rates-unavailable",
            })
          )
        ).toBe("retry");
      }
    );
  });

  // =========================================================================
  // Dashboard vs onboarding (sync=success path)
  // =========================================================================

  describe("sync=success path", () => {
    it('returns "dashboard" when onboardingCompleted=true', () => {
      expect(
        getRoutingDecision(
          makeInputs({ syncState: "success", onboardingCompleted: true })
        )
      ).toBe("dashboard");
    });

    it('returns "onboarding" when onboardingCompleted=false', () => {
      expect(
        getRoutingDecision(
          makeInputs({ syncState: "success", onboardingCompleted: false })
        )
      ).toBe("onboarding");
    });
  });

  // =========================================================================
  // Exhaustive: every sync-state × onboardingCompleted combination
  // =========================================================================

  describe("exhaustive sync-state combinations", () => {
    it.each(ALL_SYNC_STATES)(
      "returns a valid outcome for syncState=%s, onboardingCompleted=false",
      (syncState) => {
        const result = getRoutingDecision(
          makeInputs({ syncState, onboardingCompleted: false })
        );
        expect(ALL_OUTCOMES).toContain(result);
      }
    );

    it.each(ALL_SYNC_STATES)(
      "returns a valid outcome for syncState=%s, onboardingCompleted=true",
      (syncState) => {
        const result = getRoutingDecision(
          makeInputs({ syncState, onboardingCompleted: true })
        );
        expect(ALL_OUTCOMES).toContain(result);
      }
    );
  });
});
