/**
 * #395 T044 physical recovery helpers: read genuine SQLite preimages and
 * canonical root evidence. Do not synthesize postimage hashes or stub the SUT.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
} from "@monyvi/db";
import type {
  AccountReviewLocalSaveSnapshot,
} from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import { createAccountReviewFinancialRegistry } from
  "../../services/account-review-financial-command-service";
import { physicalBoolean } from
  "../../services/account-review-local-snapshot-postimages";
import { createFinancialActionFoundationRepository } from
  "../../services/financial-action-foundation-repository";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "../../services/user-data-access";
import { readPrivateOwnedRoot, requireActionRoot } from
  "./account-review-local-recovery-test-harness";
import { ACTION, OWNER, SESSION } from
  "./account-review-save-test-fixtures";

export interface HistoricalDraft {
  readonly id: string;
  readonly queueId: string;
  readonly smsFingerprint: string;
  readonly parsedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly payloadVersion: number;
  readonly position: number;
  readonly selectionOverride: boolean | null;
  readonly payloadJson: string;
}

export interface HistoricalQueue {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface HistoricalSmsRows {
  readonly queue: HistoricalQueue;
  readonly drafts: readonly HistoricalDraft[];
}

function orderDrafts(
  left: HistoricalDraft,
  right: HistoricalDraft
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export async function captureHistoricalSmsRows(
  db: Database
): Promise<HistoricalSmsRows> {
  const queues = await db.get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", OWNER)).fetch();
  const queue = queues[0];
  if (queues.length !== 1 || !queue || queue.id !== SESSION)
    throw new Error("expected_original_owned_review_queue");
  const originals = await db.get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", OWNER), Q.where("queue_id", queue.id)).fetch();
  if (originals.length === 0)
    throw new Error("missing_original_draft_preimages");
  return {
    queue: {
      id: queue.id,
      userId: queue.userId,
      createdAt: queue.createdAt.toISOString(),
      updatedAt: queue.updatedAt.toISOString(),
    },
    drafts: originals.map((draft) => ({
      id: draft.id,
      queueId: draft.queueId,
      smsFingerprint: draft.smsFingerprint,
      parsedAt: draft.parsedAt.toISOString(),
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
      payloadVersion: draft.payloadVersion,
      position: draft.position,
      selectionOverride: draft.selectionOverride,
      payloadJson: draft.payloadJson,
    })).sort(orderDrafts),
  };
}

export async function readPhysicalPrivateSnapshot(
  db: Database
): Promise<AccountReviewLocalSaveSnapshot> {
  const root = await requireActionRoot(db);
  if (root.userId !== OWNER || root.actionId !== ACTION)
    throw new Error("foreign_or_mismatched_recovery_root");
  return readPrivateOwnedRoot(root);
}

export function financialRepository(
  db: Database
): ReturnType<typeof createFinancialActionFoundationRepository> {
  return createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    registry: createAccountReviewFinancialRegistry(),
  });
}

/**
 * A deterministic *local* rejected-outcome injection. This does not claim
 * that PostgreSQL returned it: T045 SQL/pgTAP proves the server contract.
 * The canonical absent IDs are derived exclusively from the REAL Save root.
 */
export async function stageRejectedRoot(db: Database): Promise<void> {
  const root = await requireActionRoot(db);
  const snapshot = readPrivateOwnedRoot(root);
  const canonicalAbsentAccountIds = snapshot.createdEntityRefs
    .filter((ref) => ref.entity === "account")
    .map((ref) => ref.id)
    .sort();
  const repository = financialRepository(db);
  await repository.markFinancialActionGroupSyncPending(ACTION);
  await repository.recordFinancialActionGroupServerOutcome(
    ACTION,
    "stale",
    JSON.stringify({
      actionId: ACTION,
      status: "stale",
      code: "REVISION_STALE",
      accountRevisions: [],
      canonicalAccounts: [],
      canonicalAbsentAccountIds,
    }),
    "REVISION_STALE"
  );
  const rejected = await repository.getFinancialActionGroup(ACTION);
  if (!rejected || rejected.state !== "rejected_compensating")
    throw new Error("rejected_root_not_persisted");
}

export async function activeActionCreatedIds(
  db: Database,
  snapshot: AccountReviewLocalSaveSnapshot
): Promise<readonly string[]> {
  const tables: Readonly<Record<
    AccountReviewLocalSaveSnapshot["createdEntityRefs"][number]["entity"],
    string
  >> = {
    account: "accounts",
    bank_details: "bank_details",
    account_sms_sender: "account_sms_senders",
    transaction: "transactions",
    transfer: "transfers",
  };
  const active: string[] = [];
  for (const ref of snapshot.createdEntityRefs) {
    const rows = await db.get<Model>(tables[ref.entity])
      .query(Q.where("id", ref.id)).fetch();
    if (rows.length > 1)
      throw new Error("duplicate_physical_created_identity");
    if (rows.some((row) => physicalBoolean(row._raw, "deleted") !== true))
      active.push(ref.entity + ":" + ref.id);
  }
  return active.sort();
}

export async function actionRoot(
  db: Database
): Promise<FinancialActionGroup> {
  return requireActionRoot(db);
}
