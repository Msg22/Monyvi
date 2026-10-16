/** #395 T048 selected review Save — one immutable plan, one owned atomic writer. */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type { FinancialActionGroup } from "@monyvi/db";
import {
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
  type Sha256Provider,
  type AccountReviewSession,
} from "@monyvi/logic";
import {
  validateReviewBatchSavePayload,
  type ReviewBatchSavePayload,
} from "../../../packages/logic/src/financial-actions/review-batch-save";
import { commitPreparedBatch } from "./watermelon-atomic-batch";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { createCoreReviewBatchSaveAdapter } from "./core-account-financial-action-service";
import {
  createAccountReviewFinancialCommandService,
  createAccountReviewFinancialRegistry,
} from "./account-review-financial-command-service";
import {
  assertCurrentReviewSession,
  freezeSelectedAccountReview,
  type ReviewSaveInput,
  type FrozenReviewSave,
} from "./account-review-save-preparation";
import {
  constructReviewSave,
  type ReviewPlanDependencies,
  type SaveConstruction,
} from "./account-review-save-plan";
import type { FinancialActionLinkedOperationPlan } from "./financial-action-foundation-contracts";
import type { SmsSaveScope } from "./account-review-save-sms";
import { assertReplayImmutableContent } from "./account-review-save-replay";
import { computeFrozenReviewSaveDigest } from "./account-review-save-digest";
import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "./user-data-access";

export interface AccountReviewSaveDependencies {
  readonly database: Database;
  readonly hashProvider: Sha256Provider;
  readonly getCurrentOwnerId: () => Promise<string>;
  readonly loadCurrentSession: (
    ownerId: string,
    sessionId: string
  ) => Promise<AccountReviewSession>;
}
export type AccountReviewSaveResult =
  | { readonly kind: "committed" | "replay" }
  | { readonly kind: "cleanup_only"; readonly resolvedSmsDraftCount: number };
export interface AccountReviewSaveService {
  readonly saveSelectedAccountReview: (
    input: ReviewSaveInput
  ) => Promise<AccountReviewSaveResult>;
}
function reject(reason: string): never {
  throw new Error("account_review_save_" + reason);
}
function ownerGuard(
  expectedOwnerId: string,
  dep: AccountReviewSaveDependencies
): () => Promise<void> {
  return async (): Promise<void> => {
    if ((await dep.getCurrentOwnerId()) !== expectedOwnerId)
      reject("actor_changed");
  };
}
async function currentOwnedScope(
  frozen: FrozenReviewSave,
  dep: AccountReviewSaveDependencies
): Promise<CurrentUserDataScope> {
  const scope = await getCurrentUserDataScope();
  if (
    scope.userId !== frozen.intent.ownerId ||
    (await dep.getCurrentOwnerId()) !== frozen.intent.ownerId
  )
    reject("actor_changed");
  return scope;
}
async function existingActionRoot(
  db: Database,
  scope: CurrentUserDataScope,
  actionId: string
): Promise<FinancialActionGroup | null> {
  const rows = await scope
    .queryOwned(
      db.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("action_id", actionId)
    )
    .fetch();
  if (rows.length > 1) reject("duplicate_action_identity");
  return rows[0] ?? null;
}
function assertStoredSelectedRefs(
  frozen: FrozenReviewSave,
  payload: ReviewBatchSavePayload,
  planned: ReadonlySet<string>
): void {
  const selected = new Map(frozen.intent.selectedRows.map((r) => [r.rowId, r]));
  const refs = payload.selectedSourceRefs;
  if (
    refs.length === 0 ||
    refs.some(
      (ref) =>
        !selected.has(ref.rowId) ||
        !planned.has(ref.recordId) ||
        frozen.selectedRows.find((r) => r.rowId === ref.rowId)
          ?.sourceFingerprint !== ref.sourceFingerprint
    )
  )
    reject("replay_selection_changed");
}

function assertStoredPlannedRefs(
  frozen: FrozenReviewSave,
  payload: ReviewBatchSavePayload,
  planned: ReadonlySet<string>
): void {
  if (
    payload.domainRecordRefs.some((id) => !planned.has(id)) ||
    payload.confirmedGroupRefs.some(
      (group) =>
        !frozen.intent.confirmedGroups.some(
          (expected) =>
            expected.groupId === group.groupId &&
            expected.revision === group.revision
        ) ||
        !frozen.intent.plannedEntityIds.some(
          (plannedId) =>
            plannedId.entity === "account" &&
            plannedId.localRef === group.groupId &&
            plannedId.id === group.accountId
        )
    )
  ) {
    reject("replay_planned_members_changed");
  }
}

function frozenMatchesRoot(
  frozen: FrozenReviewSave,
  root: FinancialActionGroup
): ReturnType<typeof parseFinancialActionEnvelopeJson> {
  const registry = createAccountReviewFinancialRegistry();
  const envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
  const payload = validateReviewBatchSavePayload(envelope.payload);
  if (
    root.actionId !== frozen.intent.actionId ||
    root.userId !== frozen.intent.ownerId ||
    envelope.userId !== frozen.intent.ownerId ||
    envelope.occurredAt !== frozen.intent.occurredAt ||
    envelope.domain !== "transactions" ||
    envelope.kind !== "review_batch_save" ||
    payload.sessionId !== frozen.intent.sessionId ||
    payload.source !== frozen.intent.source
  )
    reject("replay_payload_changed");
  const planned = new Set(frozen.intent.plannedEntityIds.map((p) => p.id));
  assertStoredSelectedRefs(frozen, payload, planned);
  assertStoredPlannedRefs(frozen, payload, planned);
  return envelope;
}
async function replayExistingAction(
  frozen: FrozenReviewSave,
  dep: AccountReviewSaveDependencies,
  root: FinancialActionGroup,
  scope: CurrentUserDataScope
): Promise<AccountReviewSaveResult> {
  const envelope = frozenMatchesRoot(frozen, root);
  if (root.state === "pending_local") reject("previous_action_pending");
  const payload = validateReviewBatchSavePayload(envelope.payload);
  // The historical ORIGINAL request, not current saved SMS/defaults, is bound
  // to the immutable root before any foundation replay is permitted.
  const digest = await computeFrozenReviewSaveDigest(
    frozen,
    payload.creationDefaultSnapshot,
    dep.hashProvider
  );
  if (digest !== payload.frozenIntentDigest)
    reject("replay_frozen_intent_changed");
  await assertReplayImmutableContent({
    frozen,
    payload,
    database: dep.database,
    scope,
    hashProvider: dep.hashProvider,
  });
  await ownerGuard(frozen.intent.ownerId, dep)();
  const reviewCommand = createAccountReviewFinancialCommandService(
    dep.database
  );
  const adapter = createCoreReviewBatchSaveAdapter({
    executeReviewCommand: reviewCommand.execute,
  });
  const outcome = await adapter.execute({
    envelope,
    hashProvider: dep.hashProvider,
    prepareDomainOperationPlan: () =>
      Promise.reject(
        new Error("account_review_save_replay_unexpected_prepare")
      ),
  });
  if (outcome.kind !== "replay") reject("unexpected_duplicate_commit");
  return { kind: "replay" };
}
function assertCleanupSnapshot(
  current: SaveConstruction,
  prepared: SmsSaveScope
): void {
  if (
    current.envelope !== null ||
    current.sms.alreadySaved.length !== prepared.alreadySaved.length ||
    current.sms.selected.some(
      (x, i) =>
        x.draft.id !== prepared.selected[i]?.draft.id ||
        x.draft.payloadJson !== prepared.selected[i]?.draft.payloadJson
    )
  )
    reject("cleanup_snapshot_changed");
}

async function commitCleanupOnlySms(
  dep: AccountReviewSaveDependencies,
  sms: SmsSaveScope,
  assertOwner: () => Promise<void>
): Promise<AccountReviewSaveResult> {
  const selected = new Set(sms.selected.map((entry) => entry.draft.id));
  const drafts = sms.selected.map((entry) => entry.draft);
  const queue = sms.queue;
  const deleteQueue =
    queue !== null && sms.allOwned.every((row) => selected.has(row.id));
  const touched: Model[] = [...drafts];
  if (deleteQueue && queue) touched.push(queue);
  // prepareDestroyPermanently mutates the cached models before adapter.commit.
  const preimages = touched.map(captureCachedModelSnapshot);
  try {
    const operations: Model[] = drafts.map((draft) =>
      draft.prepareDestroyPermanently()
    );
    if (deleteQueue && queue)
      operations.push(queue.prepareDestroyPermanently());
    await assertOwner();
    await commitPreparedBatch(operations, dep.database);
  } catch (error) {
    // The existing atomic helper treats a durable SQLite commit as success.
    // Only prep/owner/precommit failures reach here; restore in-place cache.
    preimages.forEach(restoreCachedModelSnapshot);
    throw error;
  }
  return { kind: "cleanup_only", resolvedSmsDraftCount: selected.size };
}

async function cleanupOnlySms(
  frozen: FrozenReviewSave,
  dep: AccountReviewSaveDependencies,
  prepared: SmsSaveScope,
  assertOwner: () => Promise<void>
): Promise<AccountReviewSaveResult> {
  if (frozen.intent.source !== "SMS" || prepared.selected.length === 0)
    reject("empty_financial_selection");
  return dep.database.write(async () => {
    await assertOwner();
    assertCurrentReviewSession(
      frozen,
      await dep.loadCurrentSession(
        frozen.intent.ownerId,
        frozen.intent.sessionId
      )
    );
    const scope = await currentOwnedScope(frozen, dep);
    const current = await constructReviewSave(
      frozen,
      {
        database: dep.database,
        hashProvider: dep.hashProvider,
        assertOwner,
        loadCurrentSession: dep.loadCurrentSession,
      },
      scope
    );
    assertCleanupSnapshot(current, prepared);
    return commitCleanupOnlySms(dep, current.sms, assertOwner);
  });
}
async function revalidateReviewPlanInsideWriter(
  frozen: FrozenReviewSave,
  dep: AccountReviewSaveDependencies,
  plan: ReviewPlanDependencies,
  assertOwner: () => Promise<void>,
  registry: ReturnType<typeof createAccountReviewFinancialRegistry>,
  initialHashText: string
): Promise<FinancialActionLinkedOperationPlan> {
  await assertOwner();
  const currentScope = await currentOwnedScope(frozen, dep);
  assertCurrentReviewSession(
    frozen,
    await dep.loadCurrentSession(frozen.intent.ownerId, frozen.intent.sessionId)
  );
  const current = await constructReviewSave(frozen, plan, currentScope);
  if (
    !current.envelope ||
    !current.plan ||
    serializeFinancialActionEnvelope(current.envelope, registry) !==
      initialHashText
  )
    reject("writer_snapshot_stale");
  return current.plan;
}

async function commitNewReviewAction(
  frozen: FrozenReviewSave,
  dep: AccountReviewSaveDependencies,
  plan: ReviewPlanDependencies,
  assertOwner: () => Promise<void>
): Promise<AccountReviewSaveResult> {
  const scope = await currentOwnedScope(frozen, dep);
  assertCurrentReviewSession(
    frozen,
    await dep.loadCurrentSession(frozen.intent.ownerId, frozen.intent.sessionId)
  );
  const initial = await constructReviewSave(frozen, plan, scope);
  if (initial.envelope === null) {
    return cleanupOnlySms(frozen, dep, initial.sms, assertOwner);
  }
  await assertOwner();
  const originalRoot = await existingActionRoot(
    dep.database,
    scope,
    frozen.intent.actionId
  );
  if (originalRoot)
    return replayExistingAction(frozen, dep, originalRoot, scope);
  const registry = createAccountReviewFinancialRegistry();
  const initialHashText = serializeFinancialActionEnvelope(
    initial.envelope,
    registry
  );
  const reviewCommand = createAccountReviewFinancialCommandService(
    dep.database
  );
  const adapter = createCoreReviewBatchSaveAdapter({
    executeReviewCommand: reviewCommand.execute,
  });
  const result = await adapter.execute({
    envelope: initial.envelope,
    hashProvider: dep.hashProvider,
    prepareDomainOperationPlan: () =>
      revalidateReviewPlanInsideWriter(
        frozen,
        dep,
        plan,
        assertOwner,
        registry,
        initialHashText
      ),
  });
  return { kind: result.kind };
}
export function createAccountReviewSaveService(
  dep: AccountReviewSaveDependencies
): AccountReviewSaveService {
  return {
    saveSelectedAccountReview: async (input: ReviewSaveInput) => {
      const frozen = freezeSelectedAccountReview(input);
      const assertOwner = ownerGuard(frozen.intent.ownerId, dep);
      await assertOwner();
      // The pure digest authority validates the complete original plan on
      // first write, historical replay and action-free all-dedup cleanup.
      const scope = await currentOwnedScope(frozen, dep);
      const root = await existingActionRoot(
        dep.database,
        scope,
        frozen.intent.actionId
      );
      if (root) return replayExistingAction(frozen, dep, root, scope);
      const plan: ReviewPlanDependencies = {
        database: dep.database,
        hashProvider: dep.hashProvider,
        assertOwner,
        loadCurrentSession: dep.loadCurrentSession,
      };
      return commitNewReviewAction(frozen, dep, plan, assertOwner);
    },
  };
}
