/**
 * #395: diagnostic-only labels for strict financial root refusals.
 * Keep canonical production validators, physical membership and sync ACK real.
 */
import type { Database } from "@nozbe/watermelondb";
import { logger } from "@/utils/logger";
import {
  MALFORMED_ACCOUNT_ACTION_ROOT_CODE,
  malformedAccountActionRoot,
  serializeAccountActionFailureContext,
} from "../../../services/sync/account-action-failure-context";
import { inspectNewFinancialActionPushRoot } from "../../../services/account-review-recovery-protected-push";
import { collectAccountFinancialActionPushBundles } from "../../../services/sync/account-protected-fields";
import {
  createProtectedHistoricalSync,
  type ProtectedHistoricalSyncHooks,
  type ProtectedHistoricalSyncHost,
} from "../../../services/sync/protected-historical-sync";
import {
  canonicalReviewChanges,
  type ReviewSyncFixture,
} from "../account-review-sync-test-fixtures";

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// The orchestration test injects its host. It must not initialize production
// providers, a native bridge, an RPC, or the real protected SDK during import.
jest.mock("../../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
}));
jest.mock("../../../services/legacy-metal-add-repair-service", () => ({
  repairLegacyMetalAdds: jest.fn(),
}));
jest.mock("../../../services/legacy-metal-edit-repair-service", () => ({
  repairLegacyMetalEdits: jest.fn(),
}));
jest.mock("../../../services/sync/atomic-pull-strategies", () => ({
  pullChanges: jest.fn(),
}));
jest.mock("../../../services/sync/push-service", () => ({
  pushChanges: jest.fn(),
}));
jest.mock("../../../services/sync/financial-pull-shaping", () => ({
  hasOwnedUnresolvedFinancialActions: jest.fn(),
}));
jest.mock("../../../services/sync/historical-recovery", () => ({
  isHistoricalRecoveryRequired: jest.fn(),
  markHistoricalRecoveryComplete: jest.fn(),
  removeHistoricalRecoveryReceipt: jest.fn(),
}));

const PRIVATE = "PRIVATE_TRANSCRIPT_SMS_ACCOUNT_AMOUNT_TOKEN";
const OWNER = "synthetic-owner";

function captureError(operation: () => unknown): Error {
  let captured: unknown = null;
  try {
    operation();
  } catch (error) {
    captured = error;
  }
  if (!(captured instanceof Error))
    throw new Error("expected_sync_root_refusal");
  return captured;
}

function diagnostic(error: unknown): unknown {
  const json = serializeAccountActionFailureContext(error);
  if (json === null) throw new Error("missing_tagged_diagnostic");
  return JSON.parse(json) as unknown;
}

function firstRoot(
  fixture: ReviewSyncFixture
): NonNullable<
  ReviewSyncFixture["changes"]["financial_action_groups"]
>["created"][number] {
  const root = fixture.changes.financial_action_groups?.created[0];
  if (!root) throw new Error("missing_canonical_review_root");
  return root;
}

describe("#395 financial-action failure context (diagnostic only)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the original public Error.message and serializes only fixed metadata, never cause/stack/payload fields", () => {
    const failure = malformedAccountActionRoot({
      phase: "inspector",
      reason: "dirty_member_missing_or_duplicate",
      table: "accounts",
      rootState: "sync_failed",
    });
    Object.assign(failure, {
      cause: new Error(PRIVATE),
      rawPayload: PRIVATE,
      privateAccountId: PRIVATE,
    });
    failure.stack = "Error: " + PRIVATE + "\n at private/path/" + PRIVATE;
    expect(failure.message).toBe(MALFORMED_ACCOUNT_ACTION_ROOT_CODE);
    expect(Object.keys(failure)).not.toContain("phase");
    expect(Object.keys(failure)).not.toContain("reason");
    const serialized = serializeAccountActionFailureContext(failure);
    expect(serialized).toBe(
      JSON.stringify({
        event: "sync.financialActionRejected",
        code: MALFORMED_ACCOUNT_ACTION_ROOT_CODE,
        phase: "inspector",
        reason: "dirty_member_missing_or_duplicate",
        table: "accounts",
        rootState: "sync_failed",
      })
    );
    expect(serialized).not.toContain(PRIVATE);
    expect(serialized).not.toContain("/private");
  });

  it("drops arbitrary table/status strings and never accepts spoofed same-message errors", () => {
    const tagged = malformedAccountActionRoot({
      phase: "catalog",
      reason: "catalog_binding_mismatch",
      table: PRIVATE,
      rootState: PRIVATE,
    });
    expect(diagnostic(tagged)).toEqual({
      event: "sync.financialActionRejected",
      code: MALFORMED_ACCOUNT_ACTION_ROOT_CODE,
      phase: "catalog",
      reason: "catalog_binding_mismatch",
    });
    expect(serializeAccountActionFailureContext(new Error(PRIVATE))).toBeNull();
    expect(
      serializeAccountActionFailureContext(
        new Error(MALFORMED_ACCOUNT_ACTION_ROOT_CODE)
      )
    ).toBeNull();
    expect(
      serializeAccountActionFailureContext({ message: PRIVATE })
    ).toBeNull();
  });

  it("reads only a bounded tagged cause; private wrapper messages never enter the diagnostic", () => {
    const tagged = malformedAccountActionRoot({
      phase: "collector",
      reason: "root_guards_empty",
    });
    const middle = Object.assign(new Error(PRIVATE), { cause: tagged });
    const outer = Object.assign(new Error(PRIVATE), { cause: middle });
    expect(diagnostic(outer)).toMatchObject({
      event: "sync.financialActionRejected",
      code: MALFORMED_ACCOUNT_ACTION_ROOT_CODE,
      phase: "collector",
      reason: "root_guards_empty",
    });
    expect(serializeAccountActionFailureContext(outer)).not.toContain(PRIVATE);
    const beyondLimit = Object.assign(new Error(PRIVATE), { cause: outer });
    expect(serializeAccountActionFailureContext(beyondLimit)).toBeNull();
  });

  it("identifies missing owned physical member at the genuine strict inspector boundary", async () => {
    const fixture = await canonicalReviewChanges();
    const error = captureError(() =>
      inspectNewFinancialActionPushRoot(firstRoot(fixture), {
        ...fixture.changes,
        accounts: { created: [], updated: [], deleted: [] },
      })
    );
    expect(error.message).toBe(MALFORMED_ACCOUNT_ACTION_ROOT_CODE);
    expect(diagnostic(error)).toMatchObject({
      phase: "inspector",
      reason: "dirty_member_missing_or_duplicate",
      table: "accounts",
    });
    expect(serializeAccountActionFailureContext(error)).not.toContain(
      fixture.payloadJson
    );
  });

  it("distinguishes malformed JSON from a true effect-count mismatch without touching the validator", async () => {
    const fixture = await canonicalReviewChanges();
    const invalidJson = captureError(() =>
      inspectNewFinancialActionPushRoot(
        { ...firstRoot(fixture), payload_json: "{" + PRIVATE },
        fixture.changes
      )
    );
    expect(diagnostic(invalidJson)).toMatchObject({
      phase: "inspector",
      reason: "payload_json_invalid",
    });
    const missingEffect = captureError(() =>
      inspectNewFinancialActionPushRoot(firstRoot(fixture), {
        ...fixture.changes,
        account_financial_effects: {
          created: [],
          updated: [],
          deleted: [],
        },
      })
    );
    expect(diagnostic(missingEffect)).toMatchObject({
      phase: "inspector",
      reason: "effect_count_mismatch",
      table: "account_financial_effects",
    });
    expect(serializeAccountActionFailureContext(invalidJson)).not.toContain(
      PRIVATE
    );
  });

  it("distinguishes an orphan dirty effect from missing root identity; valid Review still collects", async () => {
    const fixture = await canonicalReviewChanges();
    expect(
      collectAccountFinancialActionPushBundles(fixture.changes)
    ).toHaveLength(1);
    const orphan = captureError(() =>
      collectAccountFinancialActionPushBundles({
        ...fixture.changes,
        financial_action_groups: { created: [], updated: [], deleted: [] },
      })
    );
    expect(diagnostic(orphan)).toMatchObject({
      phase: "effects",
      reason: "orphan_effect_unverified",
      table: "account_financial_effects",
    });
    const invalidRoot = captureError(() =>
      collectAccountFinancialActionPushBundles({
        ...fixture.changes,
        financial_action_groups: {
          created: [{ ...firstRoot(fixture), id: "" }],
          updated: [],
          deleted: [],
        },
      })
    );
    expect(diagnostic(invalidRoot)).toMatchObject({
      phase: "collector",
      reason: "root_identity_missing",
      rootState: "local_complete",
    });
  });

  it("outer sync catch prints one dev-only JSON string and rethrows the SAME tagged Error", async () => {
    const failure = malformedAccountActionRoot({
      phase: "effects",
      reason: "effect_immutable_fields_mismatch",
      table: "account_financial_effects",
      rootState: "sync_failed",
    });
    const host: ProtectedHistoricalSyncHost = {
      getOwner: (): Promise<string> => Promise.resolve(OWNER),
      repairAdds: (): ReturnType<ProtectedHistoricalSyncHost["repairAdds"]> =>
        Promise.resolve({ skipped: [] }),
      repairEdits: (): ReturnType<ProtectedHistoricalSyncHost["repairEdits"]> =>
        Promise.resolve({ skipped: [] }),
      historicalRequired: (): ReturnType<
        ProtectedHistoricalSyncHost["historicalRequired"]
      > => Promise.resolve(false),
      hasUnresolved: (): ReturnType<
        ProtectedHistoricalSyncHost["hasUnresolved"]
      > => Promise.resolve(false),
      markComplete: (): ReturnType<
        ProtectedHistoricalSyncHost["markComplete"]
      > => Promise.resolve(),
      removeReceipt: (): ReturnType<
        ProtectedHistoricalSyncHost["removeReceipt"]
      > => Promise.resolve(),
      pull: () => Promise.reject(new Error("unused_test_pull")),
      push: (): ReturnType<ProtectedHistoricalSyncHost["push"]> =>
        Promise.resolve(),
    };
    const hooks: ProtectedHistoricalSyncHooks = {
      synchronize: () => Promise.reject(failure),
      applyDeferred: (): ReturnType<
        ProtectedHistoricalSyncHooks["applyDeferred"]
      > => Promise.resolve(),
      assertOwner: (): ReturnType<
        ProtectedHistoricalSyncHooks["assertOwner"]
      > => Promise.resolve(),
    };
    const db = {
      adapter: {
        getLocal: (): Promise<string> => Promise.resolve(OWNER),
        setLocal: (): Promise<void> => Promise.resolve(),
      },
    } as unknown as Database;
    let caught: unknown = null;
    try {
      await createProtectedHistoricalSync(hooks, host).syncDatabase(db);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
    expect(logger.error).toHaveBeenCalledWith("sync.failed", failure);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect(logger.debug).toHaveBeenCalledWith(
        serializeAccountActionFailureContext(failure)
      );
    } else {
      expect(logger.debug).not.toHaveBeenCalled();
    }
  });
});
