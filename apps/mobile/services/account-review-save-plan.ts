/** #395 T048 complete review-only atomic linked plan and canonical envelope. */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type { Account, Category } from "@monyvi/db";
import {
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";
import type {
  ReviewBatchSavePayload,
  ReviewMutation,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import type { FinancialActionLinkedOperationPlan } from "./financial-action-foundation-contracts";
import type { CurrentUserDataScope } from "./user-data-access";
import {
  assertCurrentReviewSession,
  requiredPlannedEntity,
  type FrozenReviewSave,
} from "./account-review-save-preparation";
import {
  buildSelectedFinancialRows,
  buildFinancialPosting,
  type FinancialCreatedRows,
  type FinancialPosting,
} from "./account-review-save-financial";
import {
  buildCreatedReviewAccounts,
  ownedActiveDefaultSnapshot,
  type CreatedReviewAccounts,
} from "./account-review-save-accounts";
import { computeFrozenReviewSaveDigest } from "./account-review-save-digest";
import {
  inspectSmsForSave,
  rebindSiblingOperation,
  reviewRemainingSiblingDrafts,
  smsCleanupOperations,
  smsPreimageHash,
  type SmsSaveScope,
} from "./account-review-save-sms";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import { assertPreparedReviewOwnership } from "./account-review-save-ownership";

type Row = FrozenReviewSave["selectedRows"][number];
type Group = FrozenReviewSave["neededGroups"][number];
export interface SaveConstruction {
  readonly envelope: FinancialActionEnvelopeV1 | null;
  readonly plan: FinancialActionLinkedOperationPlan | null;
  readonly sms: SmsSaveScope;
}
export interface ReviewPlanDependencies {
  readonly database: Database;
  readonly hashProvider: Sha256Provider;
  readonly assertOwner: () => Promise<void>;
  readonly loadCurrentSession: (
    ownerId: string,
    sessionId: string
  ) => Promise<FrozenReviewSave["session"]>;
}
function reject(reason: string): never {
  throw new Error("account_review_save_" + reason);
}
function sortAscii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function neededGroupsForRows(
  frozen: FrozenReviewSave,
  rows: readonly Row[]
): readonly Group[] {
  const ids = new Set(
    rows.flatMap((row) => {
      const result: string[] = [];
      if (row.assignment.state === "suggested")
        result.push(row.assignment.groupId);
      if (row.toAssignment?.state === "suggested")
        result.push(row.toAssignment.groupId);
      return result;
    })
  );
  return frozen.neededGroups.filter((group) => ids.has(group.groupId));
}
function assertExistingAccounts(
  frozen: FrozenReviewSave,
  rows: readonly Row[],
  all: ReadonlyMap<string, Account>
): void {
  for (const row of rows) {
    if (row.currency.state !== "known") reject("currency_unconfirmed");
    const assignments = [row.assignment, row.toAssignment].filter(
      (v) => v !== null
    );
    for (const assignment of assignments) {
      if (!assignment || assignment.state !== "existing") continue;
      const account = all.get(assignment.accountId);
      if (
        !account ||
        account.deleted ||
        account.currency !== row.currency.code ||
        account.currency !== assignment.currency ||
        (row.source === "SMS" &&
          assignment === row.assignment &&
          account.type === "CASH")
      )
        reject("existing_account_ineligible");
      if (assignment === row.toAssignment && account.type !== "CASH")
        reject("destination_not_cash");
    }
  }
}
function assertCreatedGroupRoles(
  frozen: FrozenReviewSave,
  rows: readonly Row[],
  groups: readonly Group[]
): void {
  for (const row of rows) {
    for (const group of groups) {
      const source =
        row.assignment.state === "suggested" &&
        row.assignment.groupId === group.groupId;
      const destination =
        row.toAssignment?.state === "suggested" &&
        row.toAssignment.groupId === group.groupId;
      if (!source && !destination) continue;
      if (
        row.currency.state !== "known" ||
        row.currency.code !== group.currency ||
        !group.linkedRowIds.includes(row.rowId) ||
        (row.source === "SMS" && source && group.type === "CASH") ||
        (destination && (row.source !== "SMS" || group.type !== "CASH"))
      ) {
        reject("created_group_ineligible");
      }
    }
  }
}
async function assertCategories(
  db: Database,
  scope: CurrentUserDataScope,
  rows: readonly Row[]
): Promise<void> {
  for (const row of rows) {
    if (row.source === "SMS" && row.transaction.isAtmWithdrawal === true)
      continue;
    const category = await scope.findAccessibleCategory(
      db.get<Category>("categories"),
      row.transaction.categoryId
    );
    if (
      category.deleted ||
      (category.type && category.type !== row.transaction.type)
    )
      reject("category_stale");
  }
}
async function readOwnedAccounts(
  db: Database,
  scope: CurrentUserDataScope
): Promise<readonly Account[]> {
  return scope
    .queryOwned(db.get<Account>("accounts"), Q.where("deleted", false))
    .fetch();
}
function newCurrencyMap(
  frozen: FrozenReviewSave,
  groups: readonly Group[]
): ReadonlyMap<string, Group["currency"]> {
  return new Map(
    groups.map((group) => [
      requiredPlannedEntity(frozen, "account", group.groupId).id,
      group.currency,
    ])
  );
}
async function localBookkeeping(
  frozen: FrozenReviewSave,
  sms: SmsSaveScope,
  created: ReadonlySet<string>,
  provider: Sha256Provider
): Promise<{
  readonly items: ReviewBatchSavePayload["localSmsBookkeeping"];
  readonly siblingOperations: FinancialActionLinkedOperationPlan["existingOperations"];
}> {
  const siblings = reviewRemainingSiblingDrafts(frozen, sms, created);
  const deletions = await Promise.all(
    sms.unsaved.map(async (entry) => ({
      draftId: entry.draft.id,
      queueId: frozen.intent.sessionId,
      snapshotHash: await smsPreimageHash(entry, provider),
      expectedReviewRevision: entry.row.revision,
      operation: "delete_saved" as const,
    }))
  );
  const rebound = await Promise.all(
    siblings.map(async (entry) => ({
      draftId: entry.draft.id,
      queueId: frozen.intent.sessionId,
      snapshotHash: await smsPreimageHash(entry, provider),
      expectedReviewRevision: entry.row.revision,
      operation: "rebind_remaining" as const,
    }))
  );
  const planned = new Map(
    frozen.neededGroups.map((group) => [group.groupId, group])
  );
  const operations = siblings.map((entry) => {
    if (entry.row.assignment.state !== "suggested")
      reject("sibling_group_stale");
    const group = planned.get(entry.row.assignment.groupId);
    if (!group) reject("sibling_group_absent");
    return rebindSiblingOperation(
      entry,
      requiredPlannedEntity(frozen, "account", group.groupId).id,
      group.currency,
      frozen.intent.sessionId
    );
  });
  const items = [...deletions, ...rebound].sort((a, b) =>
    sortAscii(a.draftId, b.draftId)
  );
  return { items, siblingOperations: operations };
}
function selectedSourceRefs(
  frozen: FrozenReviewSave,
  rows: readonly Row[]
): ReviewBatchSavePayload["selectedSourceRefs"] {
  return rows.map((row) => ({
    rowId: row.rowId,
    recordId: requiredPlannedEntity(
      frozen,
      row.source === "SMS" && row.transaction.isAtmWithdrawal === true
        ? "transfer"
        : "transaction",
      row.rowId
    ).id,
    sourceFingerprint: row.sourceFingerprint,
  })).sort((a, b) => sortAscii(a.rowId, b.rowId));
}

function confirmedGroupRefs(
  frozen: FrozenReviewSave,
  groups: readonly Group[]
): ReviewBatchSavePayload["confirmedGroupRefs"] {
  return groups.map((group) => ({
    groupId: group.groupId,
    revision: group.revision,
    accountId: requiredPlannedEntity(frozen, "account", group.groupId).id,
  })).sort((a, b) => sortAscii(a.groupId, b.groupId));
}

function finalPayload(
  frozen: FrozenReviewSave,
  rows: readonly Row[],
  groups: readonly Group[],
  records: readonly ReviewMutation[],
  effects: Readonly<ReviewBatchSavePayload["accountEffects"]>,
  smsItems: ReviewBatchSavePayload["localSmsBookkeeping"],
  snapshot: ReviewBatchSavePayload["creationDefaultSnapshot"],
  frozenIntentDigest: string
): ReviewBatchSavePayload {
  const sorted = [...records].sort((a, b) =>
    sortAscii(a.entity + ":" + a.after.id, b.entity + ":" + b.after.id)
  );
  const mandatory = {
    schemaVersion: "review.batch-save/v1" as const,
    operationCode: "review.batch-save" as const,
    source: frozen.intent.source,
    sessionId: frozen.intent.sessionId,
    frozenIntentDigest,
    selectedSourceRefs: selectedSourceRefs(frozen, rows),
    confirmedGroupRefs: confirmedGroupRefs(frozen, groups),
    createGuards: sorted.map((record) => ({
      entity: record.entity,
      id: record.after.id,
      expectedAbsent: true as const,
    })),
    accountEffects: [...effects].sort((a, b) =>
      sortAscii(a.accountId, b.accountId)
    ),
    domainRecordRefs: sorted.map((record) => record.after.id).sort(sortAscii),
    domainMutation: { records: sorted },
    localSmsBookkeeping: smsItems,
  };
  return snapshot === undefined
    ? mandatory
    : { ...mandatory, creationDefaultSnapshot: snapshot };
}

function createLinkedReviewPlan(
  frozen: FrozenReviewSave,
  dep: ReviewPlanDependencies,
  payload: ReviewBatchSavePayload,
  preparedCreates: readonly Model[],
  existingOperations: FinancialActionLinkedOperationPlan["existingOperations"],
  balances: ReadonlyMap<string, number>,
  revisions: ReadonlyMap<string, string>
): FinancialActionLinkedOperationPlan {
  const assertSession = async (): Promise<void> => {
    await dep.assertOwner();
    assertCurrentReviewSession(
      frozen,
      await dep.loadCurrentSession(
        frozen.intent.ownerId,
        frozen.intent.sessionId
      )
    );
  };
  return {
    preparedCreates,
    existingOperations,
    assertCachedOwnership: async ({ userId }) => {
      if (userId !== frozen.intent.ownerId) reject("cached_owner_changed");
      await assertSession();
    },
    assertPreparedOwnership: async ({ userId, preparedPostimages }) => {
      if (userId !== frozen.intent.ownerId) reject("prepared_owner_changed");
      assertPreparedReviewOwnership(
        {
          ownerId: frozen.intent.ownerId,
          actionId: frozen.intent.actionId,
          payload,
          plannedCreates: preparedCreates,
          plannedExisting: existingOperations,
          postedBalances: balances,
          postedRevisions: revisions,
        },
        preparedPostimages
      );
      await assertSession();
    },
  };
}
interface PreparedReviewSaveParts {
  readonly financial: FinancialCreatedRows;
  readonly posting: FinancialPosting;
  readonly accounts: CreatedReviewAccounts;
  readonly bookkeeping: Awaited<ReturnType<typeof localBookkeeping>>;
}

async function prepareReviewSaveParts(
  frozen: FrozenReviewSave,
  dep: ReviewPlanDependencies,
  scope: CurrentUserDataScope,
  rows: readonly Row[],
  groups: readonly Group[],
  owned: readonly Account[],
  snapshot: ReviewBatchSavePayload["creationDefaultSnapshot"],
  sms: SmsSaveScope
): Promise<PreparedReviewSaveParts> {
  const existing = new Map(owned.map((account) => [account.id, account]));
  assertExistingAccounts(frozen, rows, existing);
  assertCreatedGroupRoles(frozen, rows, groups);
  await assertCategories(dep.database, scope, rows);
  const financial = buildSelectedFinancialRows(dep.database, frozen, rows);
  const posting = await buildFinancialPosting(
    dep.database, frozen, financial, existing,
    newCurrencyMap(frozen, groups), dep.hashProvider
  );
  const financialIds = new Set(
    financial.records.map((record) => record.after.id)
  );
  const accounts = await buildCreatedReviewAccounts(
    dep.database, frozen, groups, posting.balances, posting.revisions,
    dep.hashProvider, financialIds, snapshot
  );
  const bookkeeping = await localBookkeeping(
    frozen, sms, new Set(groups.map((group) => group.groupId)), dep.hashProvider
  );
  return { financial, posting, accounts, bookkeeping };
}

function canonicalReviewEnvelope(
  frozen: FrozenReviewSave,
  financial: FinancialCreatedRows,
  posting: FinancialPosting,
  payload: ReviewBatchSavePayload
): FinancialActionEnvelopeV1 {
  const primaryId = financial.records.map((r) => r.after.id).sort(sortAscii)[0];
  if (!primaryId) reject("empty_action");
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: frozen.intent.actionId,
      accountGuards: posting.guards,
      domain: "transactions",
      kind: "review_batch_save",
      domainReferenceId: primaryId,
      envelopeVersion: "monyvi.financial-action/v1",
      occurredAt: frozen.intent.occurredAt,
      payloadVersion: "review.batch-save/v1",
      payload,
      userId: frozen.intent.ownerId,
    },
    createAccountReviewFinancialRegistry()
  );
}

function linkedSaveConstruction(
  frozen: FrozenReviewSave,
  dep: ReviewPlanDependencies,
  sms: SmsSaveScope,
  parts: PreparedReviewSaveParts,
  payload: ReviewBatchSavePayload,
  envelope: FinancialActionEnvelopeV1
): SaveConstruction {
  const preparedCreates = [
    ...parts.accounts.prepared,
    ...parts.financial.prepared,
    ...parts.posting.preparedEffects,
  ];
  const existingOperations = [
    ...parts.posting.existingAccountOperations,
    ...parts.bookkeeping.siblingOperations,
    ...smsCleanupOperations(sms),
  ];
  return {
    envelope,
    sms,
    plan: createLinkedReviewPlan(
      frozen, dep, payload, preparedCreates, existingOperations,
      parts.posting.balances, parts.posting.revisions
    ),
  };
}

async function authorPlan(
  frozen: FrozenReviewSave,
  dep: ReviewPlanDependencies,
  scope: CurrentUserDataScope,
  rows: readonly Row[],
  groups: readonly Group[],
  sms: SmsSaveScope
): Promise<SaveConstruction> {
  const owned = await readOwnedAccounts(dep.database, scope);
  // Only actual post-dedup creates need defaults; capture before preparing
  // models and never re-sample this historical snapshot downstream.
  const snapshot = groups.length > 0
    ? ownedActiveDefaultSnapshot(owned)
    : undefined;
  const frozenIntentDigest = await computeFrozenReviewSaveDigest(
    frozen, snapshot, dep.hashProvider
  );
  const parts = await prepareReviewSaveParts(
    frozen, dep, scope, rows, groups, owned, snapshot, sms
  );
  const payload = finalPayload(
    frozen, rows, groups,
    [...parts.accounts.records, ...parts.financial.records],
    parts.posting.effects, parts.bookkeeping.items,
    snapshot, frozenIntentDigest
  );
  const envelope = canonicalReviewEnvelope(
    frozen, parts.financial, parts.posting, payload
  );
  return linkedSaveConstruction(frozen, dep, sms, parts, payload, envelope);
}

export async function constructReviewSave(
  frozen: FrozenReviewSave,
  dep: ReviewPlanDependencies,
  scope: CurrentUserDataScope
): Promise<SaveConstruction> {
  await dep.assertOwner();
  const sms = await inspectSmsForSave(dep.database, scope, frozen);
  const rows =
    frozen.intent.source === "SMS"
      ? sms.unsaved.map((entry) => entry.row)
      : frozen.selectedRows;
  if (rows.length === 0) {
    // Validate the complete ORIGINAL plan even when every SMS was deduplicated.
    await computeFrozenReviewSaveDigest(frozen, undefined, dep.hashProvider);
    return { envelope: null, plan: null, sms };
  }
  const groups = neededGroupsForRows(frozen, rows);
  return authorPlan(frozen, dep, scope, rows, groups, sms);
}
