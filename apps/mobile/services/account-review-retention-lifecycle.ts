/**
 * #395 T049 - strictly private, owner-scoped lifecycle edits in an EXISTING
 * queue/draft writer. No separate transaction or public sync field.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type { FinancialActionGroup } from "@monyvi/db";
import {
  accountReviewLocalSaveSnapshotSchema,
  parseAccountReviewLocalSaveSnapshot,
  type AccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import { reviewBatchSaveWireSchema } from
  "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { parseFinancialActionEnvelopeJson } from "@monyvi/logic";
import { createAccountReviewFinancialRegistry } from
  "./account-review-financial-command-service";
import { assertExpectedCurrentUser } from "./user-data-access";

type Draft = AccountReviewLocalSaveSnapshot["smsDrafts"][number];
type Disposition = NonNullable<AccountReviewLocalSaveSnapshot[
  "queuePreimage"
]>["disposition"];

export interface ReviewPrivateLifecycleInput {
  readonly database: Database;
  readonly ownerId: string;
  readonly kind: "discard" | "expire" | "supersede" | "prune_empty";
  readonly queueId?: string;
  readonly draftIds?: ReadonlySet<string>;
  readonly cutoff?: Date;
  readonly queueRemoved?: boolean;
}
export interface PreparedReviewPrivateLifecycle {
  readonly cachedRoots: readonly FinancialActionGroup[];
  readonly prepareOperations: () => readonly Model[];
}

function reject(reason: string): never {
  throw new Error("account_review_private_lifecycle_" + reason);
}
function parseRootSnapshot(
  root: FinancialActionGroup,
  ownerId: string
): AccountReviewLocalSaveSnapshot {
  if (root.userId !== ownerId || !root.localRecoverySnapshotJson)
    return reject("missing_owned_root");
  const envelope = parseFinancialActionEnvelopeJson(
    root.payloadJson, createAccountReviewFinancialRegistry()
  );
  if (envelope.actionId !== root.actionId ||
      envelope.userId !== ownerId ||
      envelope.payloadVersion !== "review.batch-save/v1" ||
      envelope.domain !== "transactions" ||
      envelope.kind !== "review_batch_save")
    return reject("wrong_immutable_action_root");
  const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
  return parseAccountReviewLocalSaveSnapshot({
    json: root.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: root.actionId,
      ownerId,
      sessionId: payload.sessionId,
      source: payload.source,
    },
  });
}
function redact(
  draft: Draft,
  state: "expired" | "superseded"
): Draft {
  return {
    retentionState: state,
    id: draft.id,
    queueId: draft.queueId,
    smsFingerprint: draft.smsFingerprint,
    parsedAt: draft.parsedAt,
    operation: draft.operation,
    expectedPostimageHash: draft.expectedPostimageHash,
  };
}
function transition(
  snapshot: AccountReviewLocalSaveSnapshot,
  input: ReviewPrivateLifecycleInput
): AccountReviewLocalSaveSnapshot | null {
  const originalQueue = snapshot.queuePreimage;
  if (!originalQueue) return null;
  if (input.queueId && originalQueue.id !== input.queueId &&
      input.kind !== "supersede") return null;
  if (input.kind === "supersede" &&
      originalQueue.disposition !== "pruned_empty") return null;
  let changed = false;
  const smsDrafts = snapshot.smsDrafts.map((draft): Draft => {
    if (draft.retentionState !== "available") return draft;
    const shouldRedact =
      input.kind === "supersede" ||
      (input.kind === "discard" && input.queueRemoved === true) ||
      (input.kind === "discard" && input.draftIds?.has(draft.id) === true) ||
      (input.kind === "expire" && input.cutoff !== undefined &&
        Date.parse(draft.parsedAt) <= input.cutoff.getTime());
    if (!shouldRedact) return draft;
    changed = true;
    return redact(draft, input.kind === "expire" ? "expired" : "superseded");
  });
  let disposition: Disposition = originalQueue.disposition;
  if (input.kind === "supersede" ||
      (input.kind === "discard" && (input.queueRemoved === true ||
        input.draftIds === undefined))) {
    disposition = "superseded";
  } else if (input.kind === "prune_empty" &&
      disposition === "present" && input.queueId === originalQueue.id) {
    disposition = "pruned_empty";
  } else if (input.kind === "expire" &&
      snapshot.smsDrafts.length > 0 &&
      smsDrafts.every((draft) => draft.retentionState === "expired")) {
    disposition = "expired";
  }
  if (disposition !== originalQueue.disposition) changed = true;
  if (!changed) return null;
  return accountReviewLocalSaveSnapshotSchema.parse({
    ...snapshot,
    smsDrafts,
    queuePreimage: { ...originalQueue, disposition },
  });
}

/**
 * Must be called INSIDE the existing serialized owner writer. Returned
 * prepared root updates are passed into the SAME adapter.batch as draft/queue
 * mutations, and original roots are included in rollback cache snapshots.
 * No fallback if an unresolved owned root has invalid private evidence.
 */
export async function prepareAccountReviewPrivateLifecycle(
  input: ReviewPrivateLifecycleInput
): Promise<PreparedReviewPrivateLifecycle> {
  await assertExpectedCurrentUser(input.ownerId);
  const roots = await input.database.get<FinancialActionGroup>(
    "financial_action_groups"
  ).query(Q.where("user_id", input.ownerId), Q.where("deleted", false)).fetch();
  const prepared: Array<{
    readonly root: FinancialActionGroup;
    readonly next: AccountReviewLocalSaveSnapshot;
  }> = [];
  for (const root of roots) {
    if (root.state === "accepted" || root.state === "reconciled" ||
        typeof root.localRecoverySnapshotJson !== "string") continue;
    const original = parseRootSnapshot(root, input.ownerId);
    const next = transition(original, input);
    if (next) prepared.push({ root, next });
  }
  await assertExpectedCurrentUser(input.ownerId);
  return {
    cachedRoots: prepared.map(({ root }) => root),
    prepareOperations: () => prepared.map(({ root, next }) =>
      root.prepareUpdate((candidate) => {
        candidate.localRecoverySnapshotJson = JSON.stringify(next);
      })
    ),
  };
}
