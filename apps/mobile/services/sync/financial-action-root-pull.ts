/**
 * #395 T053 owned financial-root pull: one projection for global synchronize()
 * and a standalone real SQLite writer. Never perform nested database.write().
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import type { FinancialActionGroup } from "@monyvi/db";
import {
  parseFinancialActionEnvelopeJson,
} from "../../../../packages/logic/src/financial-actions/action-contracts";
import {
  parseAccountReviewLocalSaveSnapshot,
} from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import {
  reviewBatchSaveWireSchema,
} from "../../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { createAccountReviewFinancialRegistry } from
  "../account-review-financial-command-service";
import { getCurrentUserId } from "../supabase";
import { commitPreparedBatch } from "../watermelon-atomic-batch";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "../watermelon-cache-snapshot";
import {
  checkedCloudActionRoot,
  pullRecord,
  type CheckedCloudActionRoot,
} from "./financial-action-root-pull-identity";

const ROOT_TABLE = "financial_action_groups";

function invalid(reason: string): never {
  throw new Error("financial_action_root_pull_" + reason);
}
async function assertUser(ownerId: string): Promise<void> {
  if ((await getCurrentUserId()) !== ownerId) invalid("auth_scope_changed");
}
function requireId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    return invalid("invalid_deleted_id");
  return value;
}
function ownedLocalPrivate(
  local: FinancialActionGroup,
  checked: CheckedCloudActionRoot
): string | null {
  if (local.actionId !== checked.actionId ||
      local.userId !== checked.ownerId ||
      local.kind !== checked.canonical.kind ||
      local.domain !== checked.canonical.domain ||
      local.domainReferenceId !== checked.canonical.domain_reference_id ||
      local.payloadHash !== checked.payloadHash ||
      local.payloadJson !== checked.payloadJson ||
      local.accountGuardsJson !== checked.canonical.account_guards_json)
    return invalid("immutable_action_collision");
  if ((local.state === "accepted" || local.state === "reconciled") &&
      local.state !== checked.state)
    invalid("terminal_state_regression");
  const privateJson = local.localRecoverySnapshotJson;
  if (privateJson === null) return null;
  if (local.kind !== "review_batch_save")
    return invalid("private_evidence_on_legacy_root");
  const registry = createAccountReviewFinancialRegistry();
  const envelope = parseFinancialActionEnvelopeJson(local.payloadJson, registry);
  const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
  try {
    parseAccountReviewLocalSaveSnapshot({
      json: privateJson,
      expectedRoot: {
        ownerId: checked.ownerId,
        actionId: checked.actionId,
        sessionId: payload.sessionId,
        source: payload.source,
      },
    });
  } catch {
    return invalid("invalid_local_private_evidence");
  }
  return privateJson;
}
function rootWriteRecord(
  incoming: CheckedCloudActionRoot,
  current: FinancialActionGroup | undefined
): Record<string, unknown> {
  const privateJson = current ? ownedLocalPrivate(current, incoming) : null;
  if (incoming.isDeleted && privateJson !== null)
    invalid("unresolved_private_root_deletion");
  const terminalAccepted = incoming.state === "accepted";
  return {
    ...incoming.canonical,
    id: current?.id ?? incoming.id,
    local_recovery_snapshot_json: terminalAccepted ? null : privateJson,
  };
}

async function localRootMaps(
  database: Database,
  expectedOwnerId: string,
  incoming: readonly CheckedCloudActionRoot[],
  deletedIds: readonly string[]
): Promise<{
  readonly byAction: ReadonlyMap<string, FinancialActionGroup>;
  readonly byId: ReadonlyMap<string, FinancialActionGroup>;
}> {
  const collection = database.get<FinancialActionGroup>(ROOT_TABLE);
  const actionIds = incoming.map((row) => row.actionId);
  const remoteIds = [...incoming.map((row) => row.id), ...deletedIds];
  const [owned, idRows] = await Promise.all([
    collection.query(Q.where("user_id", expectedOwnerId),
      Q.where("action_id", Q.oneOf(actionIds))).fetch(),
    collection.query(Q.where("id", Q.oneOf(remoteIds))).fetch(),
  ]);
  const byAction = new Map<string, FinancialActionGroup>();
  const byId = new Map<string, FinancialActionGroup>();
  for (const local of owned) {
    if (byAction.has(local.actionId)) invalid("duplicate_local_action");
    byAction.set(local.actionId, local);
  }
  for (const local of idRows) {
    if (byId.has(local.id)) invalid("duplicate_local_id");
    byId.set(local.id, local);
  }
  return { byAction, byId };
}

function projectIncomingRoots(
  incoming: readonly CheckedCloudActionRoot[],
  byAction: ReadonlyMap<string, FinancialActionGroup>,
  byId: ReadonlyMap<string, FinancialActionGroup>
): SyncTableChangeSet {
  const updated: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  for (const remote of incoming) {
    const local = byAction.get(remote.actionId);
    const existingId = byId.get(remote.id);
    if (existingId && existingId.actionId !== remote.actionId)
      invalid("physical_root_id_collision");
    if (existingId && existingId.userId !== remote.ownerId)
      invalid("foreign_root_id_collision");
    const row = rootWriteRecord(remote, local);
    if (remote.isDeleted) deleted.push(requireId(row.id));
    else updated.push(row);
  }
  return { created: [], updated, deleted };
}

/**
 * The network pull calls this during pullChanges, OUTSIDE Watermelon's writer.
 * The returned rows join all other table changes in synchronize's one atomic
 * remote application; this method never writes or advances a checkpoint.
 */
export async function prepareOwnedFinancialActionRootPull(input: {
  readonly database: Database;
  readonly expectedOwnerId: string;
  readonly changes: SyncTableChangeSet;
}): Promise<SyncTableChangeSet> {
  await assertUser(input.expectedOwnerId);
  const incoming = await Promise.all([
    ...Array.from<unknown>(input.changes.created),
    ...Array.from<unknown>(input.changes.updated),
  ].map((row) => checkedCloudActionRoot(row, input.expectedOwnerId)));
  if (incoming.length === 0 && input.changes.deleted.length === 0) {
    await assertUser(input.expectedOwnerId);
    return { created: [], updated: [], deleted: [] };
  }
  const ids = incoming.map((row) => row.id);
  const actions = incoming.map((row) => row.actionId);
  if (new Set(ids).size !== ids.length ||
      new Set(actions).size !== actions.length)
    invalid("duplicate_server_action_or_id");
  const additionalDeleted = Array.from<unknown>(input.changes.deleted)
    .map(requireId);
  const used = [...ids, ...additionalDeleted];
  if (new Set(used).size !== used.length)
    invalid("duplicate_server_root_id");
  const maps = await localRootMaps(
    input.database, input.expectedOwnerId, incoming, additionalDeleted
  );
  const result = projectIncomingRoots(incoming, maps.byAction, maps.byId);
  const deleted = [...result.deleted];
  for (const id of additionalDeleted) {
    const local = maps.byId.get(id);
    if (local?.userId !== undefined && local.userId !== input.expectedOwnerId)
      invalid("foreign_root_tombstone");
    if (local?.localRecoverySnapshotJson)
      invalid("unresolved_private_root_deletion");
    deleted.push(id);
  }
  await assertUser(input.expectedOwnerId);
  return { ...result, deleted };
}

async function prepareStandaloneOperations(
  db: Database,
  changes: SyncTableChangeSet,
  ownerId: string
): Promise<{
  readonly operations: readonly Model[];
  readonly originals: readonly ReturnType<typeof captureCachedModelSnapshot>[];
}> {
  const collection = db.get<FinancialActionGroup>(ROOT_TABLE);
  const operations: Model[] = [];
  const originals: ReturnType<typeof captureCachedModelSnapshot>[] = [];
  const records = Array.from<unknown>(changes.updated).map(pullRecord);
  try {
    for (const row of records) {
      const id = requireId(row.id);
      const existing = await collection.query(Q.where("id", id)).fetch();
      if (existing.length > 1) invalid("duplicate_physical_root");
      const record = existing[0];
      if (!record) {
        operations.push(collection.prepareCreate((candidate) => {
          Object.assign(candidate._raw, row);
        }));
      } else {
        if (record.userId !== ownerId) invalid("foreign_physical_root");
        originals.push(captureCachedModelSnapshot(record));
        operations.push(record.prepareUpdate((candidate) => {
          Object.assign(candidate._raw, row);
        }));
      }
    }
    for (const rawId of Array.from<unknown>(changes.deleted)) {
      const id = requireId(rawId);
      const found = await collection.query(Q.where("id", id)).fetch();
      if (found.length > 1) invalid("duplicate_physical_root");
      const row = found[0];
      if (!row) continue;
      if (row.userId !== ownerId || row.localRecoverySnapshotJson)
        invalid("unsafe_root_tombstone");
      originals.push(captureCachedModelSnapshot(row));
      operations.push(row.prepareMarkAsDeleted());
    }
    return { operations, originals };
  } catch (error) {
    originals.forEach(restoreCachedModelSnapshot);
    throw error;
  }
}

/** Standalone, owner-scoped, one-writer physical application for T053/P01–P07. */
export async function applyOwnedFinancialActionRootPull(input: {
  readonly database: Database;
  readonly expectedOwnerId: string;
  readonly changes: SyncTableChangeSet;
}): Promise<void> {
  await assertUser(input.expectedOwnerId);
  await input.database.write(async (): Promise<void> => {
    const projected = await prepareOwnedFinancialActionRootPull(input);
    const prepared = await prepareStandaloneOperations(
      input.database, projected, input.expectedOwnerId
    );
    try {
      await assertUser(input.expectedOwnerId);
      if (prepared.operations.length > 0)
        await commitPreparedBatch(prepared.operations, input.database);
    } catch (error) {
      prepared.originals.forEach(restoreCachedModelSnapshot);
      throw error;
    }
  });
}
