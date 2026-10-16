/**
 * #395 T053 TESTS FIRST: dedicated owned-root pull/upsert path.
 *
 * This file intentionally imports the MISSING production owner-scoped
 * financial root pull seam. It is a module-creation Red, not an executable
 * Green or a JSON-only sanitizer test. Every scenario requires real SQLite.
 */
import type { Database, Model } from "@nozbe/watermelondb";
import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import type { FinancialActionGroup } from "@monyvi/db";
import {
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
} from "../../../../packages/logic/src/financial-actions";
import { createAccountReviewFinancialRegistry } from
  "../../services/account-review-financial-command-service";
import { applyOwnedFinancialActionRootPull } from
  "../../services/sync/financial-action-root-pull";
import {
  ACTION, FOREIGN_OWNER, OWNER, makeSaveFixture, testUuid,
} from "./account-review-save-test-fixtures";
import {
  cloneRecoverySqlite, hashProvider, readPrivateOwnedRoot,
  requireActionRoot, resetRecoverySqlite, saveReview, seedBoundSmsReview,
  ownedPhysicalRows,
} from "./account-review-local-recovery-test-harness";
import { physicalSaveLedgerSnapshot } from
  "./account-review-save-sqlite-test-helpers";

const FOREIGN_PRIVATE = '{"untrusted":"raw-private-SMS-exfiltration"}';
const CLOUD_OWNED_ID = testUuid(480);

function fromActualRoot(
  root: FinancialActionGroup,
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  const {
    local_recovery_snapshot_json: _private,
    _status: _status,
    _changed: _changed,
    ...publicRaw
  } = root._raw;
  return { ...publicRaw, ...overrides };
}

function updatedCloudRoot(
  root: FinancialActionGroup,
  overrides: Readonly<Record<string, unknown>> = {}
): SyncTableChangeSet {
  return {
    created: [],
    updated: [fromActualRoot(root, overrides)],
    deleted: [],
  };
}

async function physicalPull(
  db: Database,
  changes: SyncTableChangeSet,
  owner = OWNER
): Promise<void> {
  await applyOwnedFinancialActionRootPull({
    database: db,
    expectedOwnerId: owner,
    changes,
  });
}

async function seededRoot(): Promise<{
  readonly db: Database;
  readonly root: FinancialActionGroup;
  readonly localBytes: string;
}> {
  const fixture = makeSaveFixture("sms-new-bank");
  await seedBoundSmsReview(fixture);
  await expect(saveReview(fixture)).resolves.toMatchObject({
    kind: "committed",
  });
  const db = await cloneRecoverySqlite();
  const root = await requireActionRoot(db);
  const localBytes = root.localRecoverySnapshotJson;
  if (typeof localBytes !== "string")
    throw new Error("missing_actual_private_root_for_pull");
  readPrivateOwnedRoot(root);
  return { db, root, localBytes };
}

async function reloadedRoot(db: Database): Promise<FinancialActionGroup> {
  const rows = await db.get<FinancialActionGroup>(
    "financial_action_groups"
  ).query().fetch();
  if (rows.length !== 1 || !rows[0])
    throw new Error("expected_exact_physical_root_after_pull");
  return rows[0];
}

beforeEach(async (): Promise<void> => {
  await resetRecoverySqlite();
});

describe("#395 T053 actual dedicated owned financial-root SQLite pull", () => {
  it("P01 exact owner/action/immutable envelope retains unresolved private evidence on cloud refresh", async () => {
    const { db, root, localBytes } = await seededRoot();
    const before = await physicalSaveLedgerSnapshot(db);
    await physicalPull(db, updatedCloudRoot(root, {
      id: CLOUD_OWNED_ID,
      updated_at: root.updatedAt.getTime() + 1000,
      state: "sync_pending",
    }));
    const persisted = await reloadedRoot(db);
    expect(persisted.id).toBe(root.id);
    expect(persisted.actionId).toBe(ACTION);
    expect(persisted.localRecoverySnapshotJson).toBe(localBytes);
    expect(readPrivateOwnedRoot(persisted).ownerId).toBe(OWNER);
    const after = await physicalSaveLedgerSnapshot(db);
    expect(after.filter((table) => table.table !== "financial_action_groups"))
      .toEqual(before.filter((table) => table.table !== "financial_action_groups"));
  });

  it("P02 a malicious remote private column cannot replace local evidence or reach other owners", async () => {
    const { db, root, localBytes } = await seededRoot();
    await physicalPull(db, updatedCloudRoot(root, {
      local_recovery_snapshot_json: FOREIGN_PRIVATE,
    }));
    const persisted = await reloadedRoot(db);
    expect(persisted.localRecoverySnapshotJson).toBe(localBytes);
    expect(persisted.localRecoverySnapshotJson).not.toBe(FOREIGN_PRIVATE);
    expect(readPrivateOwnedRoot(persisted).actionId).toBe(ACTION);
  });

  it("P03 canonical accepted outcome clears the private carrier in the same physical write", async () => {
    const { db, root } = await seededRoot();
    const before = await ownedPhysicalRows(db, "account_financial_effects");
    await physicalPull(db, updatedCloudRoot(root, {
      state: "accepted",
      server_outcome: "accepted",
      outcome_json: '{"status":"accepted"}',
      rejection_code: null,
    }));
    const persisted = await reloadedRoot(db);
    expect(persisted.state).toBe("accepted");
    expect(persisted.localRecoverySnapshotJson).toBeNull();
    expect((await ownedPhysicalRows(db, "account_financial_effects")).map(
      (effect: Model) => JSON.stringify(effect._raw)
    )).toEqual(before.map((effect) => JSON.stringify(effect._raw)));
  });

  it("P04 foreign owner data never copies or reveals local private bytes", async () => {
    const { db, root, localBytes } = await seededRoot();
    const foreign = updatedCloudRoot(root, {
      user_id: FOREIGN_OWNER,
      local_recovery_snapshot_json: FOREIGN_PRIVATE,
    });
    await expect(physicalPull(db, foreign)).rejects.toThrow();
    const persisted = await reloadedRoot(db);
    expect(persisted.userId).toBe(OWNER);
    expect(persisted.localRecoverySnapshotJson).toBe(localBytes);
    expect(persisted.localRecoverySnapshotJson).not.toBe(FOREIGN_PRIVATE);
  });

  it("P05 action-id reuse with a mismatched immutable hash never retains recovery under substituted authority", async () => {
    const { db, root } = await seededRoot();
    const forged = updatedCloudRoot(root, {
      payload_hash: "b".repeat(64),
      payload_json: '{"schemaVersion":"forged"}',
    });
    await expect(physicalPull(db, forged)).rejects.toThrow();
    const local = await reloadedRoot(db);
    expect(local.payloadHash).toBe(root.payloadHash);
    expect(local.payloadJson).toBe(root.payloadJson);
    // A mismatch must not be silently treated as a matching canonical root.
    expect(local.state).not.toBe("accepted");
  });

  it("P06 an unrelated new cloud action never inherits an older private snapshot", async () => {
    const { db, root, localBytes } = await seededRoot();
    const registry = createAccountReviewFinancialRegistry();
    const canonical = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
    const separateAction = {
      ...canonical,
      actionId: testUuid(481),
      domainReferenceId: testUuid(482),
    };
    const hashed = await hashFinancialActionEnvelope(
      separateAction, hashProvider, registry
    );
    const unrelated = updatedCloudRoot(root, {
      id: CLOUD_OWNED_ID,
      action_id: separateAction.actionId,
      domain_reference_id: separateAction.domainReferenceId,
      payload_json: hashed.canonicalText,
      payload_hash: hashed.payloadHash,
    });
    await physicalPull(db, unrelated);
    const roots = await db.get<FinancialActionGroup>(
      "financial_action_groups"
    ).query().fetch();
    const introduced = roots.find((item) => item.actionId === testUuid(481));
    expect(introduced).toBeDefined();
    expect(introduced?.localRecoverySnapshotJson).toBeNull();
    expect(roots.find((item) => item.actionId === ACTION)
      ?.localRecoverySnapshotJson).toBe(localBytes);
  });

  it("P07 a failed dedicated pull leaves the already stored SQLite root and private evidence unchanged", async () => {
    const { db, root } = await seededRoot();
    const before = await physicalSaveLedgerSnapshot(db);
    await expect(physicalPull(db, updatedCloudRoot(root, {
      action_id: null,
      local_recovery_snapshot_json: FOREIGN_PRIVATE,
    }))).rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(db)).toEqual(before);
  });
});
