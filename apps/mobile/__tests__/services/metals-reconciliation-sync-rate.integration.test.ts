import {
  classifyMetalServerOutcome,
  createMetalReconciliationService,
} from "../../services/metal-reconciliation-service";
import { createMetalRateReferenceService } from "../../services/metal-rate-reference-service";
import { applyMetalMetadataPatch } from "../../services/metal-metadata-service";

jest.mock("@monyvi/db", (): unknown => {
  const schemaModule: unknown = jest.requireActual("../../../../packages/db/src/schema");
  return schemaModule;
});
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));

import {
  DEDICATED_SYNC_TABLES,
  METALS_ACTION_FRAGMENT_COLUMNS,
} from "../../services/sync/config";
import { stripMetalActionFragments } from "../../services/sync/ownership-guards";
import { runMetalPullStrategy } from "../../services/sync/pull-strategies";
import { runMetalPushStrategy } from "../../services/sync/push-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";

describe("Metals reconciliation, sync, rates, and metadata", () => {
  it("distinguishes stale from incomplete/validation outcomes and rejects foreign evidence", () => {
    expect(
      classifyMetalServerOutcome({
        serverOutcome: "stale",
        actionId: "a",
        userId: USER_ID,
        payloadHashMatches: true,
        canonicalHoldingRevision: "3",
        canonicalHoldingEvidenceId: "event-3",
        canonicalAccountEvidence: [],
      }, USER_ID)
    ).toBe("stale_ready");
    expect(
      classifyMetalServerOutcome({
        serverOutcome: "stale",
        actionId: "a",
        userId: USER_ID,
        payloadHashMatches: true,
        canonicalHoldingRevision: null,
        canonicalHoldingEvidenceId: null,
        canonicalAccountEvidence: [
          { accountId: "account-1", revision: "9", evidenceId: "effect-9" },
        ],
      }, USER_ID)
    ).toBe("account_only_stale_ready");
    expect(
      classifyMetalServerOutcome({
        serverOutcome: "rejected",
        actionId: "a",
        userId: USER_ID,
        payloadHashMatches: true,
        canonicalHoldingRevision: null,
        canonicalHoldingEvidenceId: null,
        canonicalAccountEvidence: [],
      }, USER_ID)
    ).toBe("reconciliation_incomplete");
    expect(() =>
      classifyMetalServerOutcome({
        serverOutcome: "stale",
        actionId: "a",
        userId: "foreign",
        payloadHashMatches: true,
        canonicalHoldingRevision: "3",
        canonicalHoldingEvidenceId: "event-3",
        canonicalAccountEvidence: [],
      }, USER_ID)
    ).toThrow("foreign_canonical_evidence");
    expect(() =>
      classifyMetalServerOutcome({
        serverOutcome: "stale",
        actionId: "a",
        userId: USER_ID,
        payloadHashMatches: false,
        canonicalHoldingRevision: "3",
        canonicalHoldingEvidenceId: "event-3",
        canonicalAccountEvidence: [],
      }, USER_ID)
    ).toThrow("payload_hash_mismatch_non_retryable");
    expect(
      classifyMetalServerOutcome({
        serverOutcome: "stale",
        actionId: "a",
        userId: USER_ID,
        payloadHashMatches: true,
        canonicalHoldingRevision: "3",
        canonicalHoldingEvidenceId: null,
        canonicalAccountEvidence: [],
      }, USER_ID)
    ).toBe("reconciliation_incomplete");
    expect(
      classifyMetalServerOutcome({
        serverOutcome: "stale",
        actionId: "a",
        userId: USER_ID,
        payloadHashMatches: true,
        canonicalHoldingRevision: null,
        canonicalHoldingEvidenceId: null,
        canonicalAccountEvidence: [
          { accountId: "account-2", revision: "10", evidenceId: "effect-10" },
          { accountId: "account-1", revision: "9", evidenceId: "effect-9" },
        ],
      }, USER_ID)
    ).toBe("reconciliation_incomplete");
    expect(
      classifyMetalServerOutcome({
        serverOutcome: "stale",
        actionId: "a",
        userId: USER_ID,
        payloadHashMatches: true,
        canonicalHoldingRevision: null,
        canonicalHoldingEvidenceId: null,
        canonicalAccountEvidence: [
          { accountId: "account-1", revision: "01", evidenceId: "effect-9" },
        ],
      }, USER_ID)
    ).toBe("reconciliation_incomplete");
  });

  it("restores account-only stale from the prior projection exactly once without a holding winner", async () => {
    const calls: string[] = [];
    const service = createMetalReconciliationService({
      withActionLock: async (_actionId, operation) => operation(),
      hasCompensated: () => Promise.resolve(calls.length > 0),
      restorePriorHolding: (_actionId) => {
        calls.push("holding");
        return Promise.resolve();
      },
      restoreCanonicalHolding: () => {
        calls.push("canonical");
        return Promise.resolve();
      },
      restoreAccounts: () => {
        calls.push("accounts");
        return Promise.resolve();
      },
      markReconciled: () => Promise.resolve(),
    });
    const outcome = {
      serverOutcome: "stale" as const,
      actionId: "a",
      userId: USER_ID,
      payloadHashMatches: true,
      canonicalHoldingRevision: null,
      canonicalHoldingEvidenceId: null,
      canonicalAccountEvidence: [
        { accountId: "account-1", revision: "9", evidenceId: "effect-9" },
      ],
    };

    await service.reconcile(outcome, USER_ID);
    const restartedService = createMetalReconciliationService({
      withActionLock: async (_actionId, operation) => operation(),
      hasCompensated: () => Promise.resolve(calls.length > 0),
      restorePriorHolding: () => Promise.reject(new Error("must_not_repeat")),
      restoreCanonicalHolding: () => Promise.reject(new Error("must_not_repeat")),
      restoreAccounts: () => Promise.reject(new Error("must_not_repeat")),
      markReconciled: () => Promise.resolve(),
    });
    await restartedService.reconcile(outcome, USER_ID);
    expect(calls).toEqual(["holding", "accounts"]);
    expect(calls).not.toContain("canonical");
  });

  it("keeps rate references immutable and validates the role/kind matrix", () => {
    const service = createMetalRateReferenceService();
    const reference = service.capture({
      id: "rate-1",
      role: "acquisition_metal",
      kind: "metal",
      instrumentCode: "metal:GOLD",
      valueDecimal: "75.25",
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
      providerObservedAt: Date.parse("2026-08-31T10:00:00.000Z"),
      source: "fixture",
      quality: "valid",
      capturedFreshness: "fresh",
      capturedAt: Date.parse("2026-08-31T10:01:00.000Z"),
    });
    expect(Object.isFrozen(reference)).toBe(true);
    const invalidReference = { ...reference, role: "acquisition_purchase_currency" };
    expect(() => service.capture(invalidReference as never)).toThrow(
      "invalid_metal_rate_reference"
    );
  });

  it("applies LWW only to name and notes", () => {
    expect(
      applyMetalMetadataPatch(
        { name: "Old", notes: "Old note", updatedAt: "2026-08-01T00:00:00.000Z" },
        { name: "New", notes: "New note", updatedAt: "2026-08-02T00:00:00.000Z" }
      )
    ).toEqual({ name: "New", notes: "New note", updatedAt: "2026-08-02T00:00:00.000Z" });
    const invalidMetadata = {
      name: "New",
      notes: null,
      updatedAt: "2026-08-02T00:00:00.000Z",
      status: "sold",
    };
    expect(() =>
      applyMetalMetadataPatch(
        { name: "Old", notes: null, updatedAt: "2026-08-01T00:00:00.000Z" },
        invalidMetadata as never
      )
    ).toThrow("invalid_metal_metadata_patch");
  });

  it("dedicates action-owned tables and strips protected generic fragments", () => {
    expect([...DEDICATED_SYNC_TABLES]).toEqual(
      expect.arrayContaining([
        "financial_action_groups",
        "metal_action_evidence",
        "metal_lifecycle_events",
        "metal_rate_references",
      ])
    );
    expect(METALS_ACTION_FRAGMENT_COLUMNS.assets).toContain("acquisition_action_id");
    expect(METALS_ACTION_FRAGMENT_COLUMNS.asset_metals).toContain("purity_factor_decimal");
    expect(
      stripMetalActionFragments("assets", {
        id: "a",
        name: "Gold",
        acquisition_action_id: "action",
        purchase_price_decimal: "100",
      })
    ).toEqual({ id: "a", name: "Gold" });
  });

  it("propagates pull failures without advancing the watermark", async () => {
    const commitWatermark = jest.fn();
    await expect(
      runMetalPullStrategy({
        pull: () => Promise.reject(new Error("pull_failed")),
        commitWatermark,
      })
    ).rejects.toThrow("pull_failed");
    expect(commitWatermark).not.toHaveBeenCalled();
  });

  it("propagates push failures without marking local changes synced", async () => {
    const markSynced = jest.fn();
    await expect(
      runMetalPushStrategy({
        push: () => Promise.reject(new Error("push_failed")),
        markSynced,
      })
    ).rejects.toThrow("push_failed");
    expect(markSynced).not.toHaveBeenCalled();
  });
});
