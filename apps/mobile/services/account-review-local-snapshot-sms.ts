/** Same-writer SMS preimages, bound to the actual prepared local operations. */
import {
  decodeSmsReviewDraftPayload,
  serializeCanonicalJsonValue,
  type Sha256Provider,
} from "@monyvi/logic";
import type { AccountReviewLocalSaveSnapshot } from "../../../packages/logic/src/financial-actions/review-local-recovery";
import type { ReviewBatchSavePayload } from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import type { FinancialActionLinkedOperationPreparedOwnershipInput } from "./financial-action-foundation-contracts";
import type { SmsSaveScope } from "./account-review-save-sms";
import {
  hashAccountReviewLocalPostimage,
  physicalDate,
  physicalRawField,
  physicalText,
  physicalUnsigned,
  requiredPreparedPostimage,
} from "./account-review-local-snapshot-postimages";

type Draft = AccountReviewLocalSaveSnapshot["smsDrafts"][number];
type Queue = AccountReviewLocalSaveSnapshot["queuePreimage"];

function reject(reason: string): never {
  throw new Error("account_review_local_sms_" + reason);
}
function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function selectionValue(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") return reject("invalid_original_selection");
  return value;
}
function queueEvidence(
  input: SmsSaveScope,
  sessionId: string,
  ownerId: string
): NonNullable<SmsSaveScope["queue"]> {
  const queue = input.queue;
  if (!queue || queue.id !== sessionId || queue.userId !== ownerId)
    return reject("queue_session_or_ownership_changed");
  return queue;
}
function draftOperation(
  id: string,
  input: SmsSaveScope,
  payload: ReviewBatchSavePayload
): Draft["operation"] {
  if (input.selected.some((entry) => entry.draft.id === id))
    return "delete_saved";
  if (
    payload.localSmsBookkeeping.some(
      (item) => item.draftId === id && item.operation === "rebind_remaining"
    )
  )
    return "rebind_remaining";
  return reject("unexpected_prepared_sms_draft");
}

async function originalAvailableDraft(input: {
  readonly id: string;
  readonly operation: Draft["operation"];
  readonly evidence: FinancialActionLinkedOperationPreparedOwnershipInput;
  readonly hashProvider: Sha256Provider;
  readonly queueId: string;
}): Promise<Draft> {
  const cached = input.evidence.cachedPreimages.filter(
    (item) => item.table === "sms_review_draft_items" && item.id === input.id
  );
  if (cached.length !== 1 || !cached[0])
    return reject("missing_original_sms_draft");
  const original = cached[0].raw;
  const prepared = requiredPreparedPostimage(
    input.evidence.preparedPostimages,
    "sms_review_draft_items",
    input.id
  );
  if (
    prepared.kind !==
    (input.operation === "delete_saved" ? "markAsDeleted" : "update")
  )
    return reject("incorrect_sms_postimage_operation");
  if (
    physicalText(original, "queue_id") !== input.queueId ||
    physicalText(original, "user_id") !== input.evidence.userId
  )
    return reject("reparented_original_sms_draft");
  return {
    retentionState: "available",
    id: input.id,
    queueId: input.queueId,
    smsFingerprint: physicalText(original, "sms_fingerprint"),
    createdAt: physicalDate(original, "created_at"),
    updatedAt: physicalDate(original, "updated_at"),
    parsedAt: physicalDate(original, "parsed_at"),
    payloadVersion: physicalUnsigned(original, "payload_version"),
    position: physicalUnsigned(original, "position"),
    selectionOverride: selectionValue(
      Object.entries(original).find(
        ([key]) => key === "selection_override"
      )?.[1]
    ),
    payloadJson: physicalText(original, "payload_json"),
    operation: input.operation,
    expectedPostimageHash: await hashAccountReviewLocalPostimage({
      ...prepared,
      hashProvider: input.hashProvider,
    }),
  };
}

/**
 * The wire payload describes every selected SMS cleanup (S), even when only
 * its unsaved subset (U) contributes financial rows. Match S, U and any
 * unselected sibling rebind to the original cached bytes and staged SDK
 * operations. No transitional SMS session is rehydrated after preparation.
 */
async function assertExactOriginalSmsBookkeeping(input: {
  readonly sms: SmsSaveScope;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly payload: ReviewBatchSavePayload;
  readonly evidence: FinancialActionLinkedOperationPreparedOwnershipInput;
  readonly hashProvider: Sha256Provider;
  readonly captured: readonly Draft[];
}): Promise<void> {
  const { sms, ownerId, sessionId, payload, evidence, hashProvider } = input;
  const entries = payload.localSmsBookkeeping;
  const selected = new Map(
    sms.selected.map((entry) => [entry.draft.id, entry])
  );
  const originals = new Map(input.captured.map((entry) => [entry.id, entry]));
  const physicalIds = new Set(
    evidence.preparedPostimages
      .filter((entry) => entry.table === "sms_review_draft_items")
      .map((entry) => entry.id)
  );
  const unsaved = new Map(sms.unsaved.map((entry) => [entry.row.rowId, entry]));
  if (
    selected.size !== sms.selected.length ||
    unsaved.size !== sms.unsaved.length ||
    entries.length !== input.captured.length ||
    entries.length !== physicalIds.size ||
    originals.size !== input.captured.length ||
    new Set(entries.map((entry) => entry.draftId)).size !== entries.length ||
    entries.some((entry) => !physicalIds.has(entry.draftId)) ||
    payload.selectedSourceRefs.length !== unsaved.size ||
    payload.selectedSourceRefs.some((ref) => {
      const original = unsaved.get(ref.rowId);
      return (
        !original || original.row.sourceFingerprint !== ref.sourceFingerprint
      );
    })
  )
    reject("original_bookkeeping_membership");

  const deletions = entries.filter(
    (entry) => entry.operation === "delete_saved"
  );
  if (
    deletions.length !== selected.size ||
    deletions.some((entry) => !selected.has(entry.draftId)) ||
    [...selected.keys()].some(
      (id) => !deletions.some((entry) => entry.draftId === id)
    )
  )
    reject("original_selected_cleanup_missing");

  for (const entry of entries) {
    const original = originals.get(entry.draftId);
    const chosen = selected.get(entry.draftId);
    const physical = sms.allOwned.filter((draft) => draft.id === entry.draftId);
    if (
      !original ||
      original.retentionState !== "available" ||
      original.queueId !== sessionId ||
      entry.queueId !== sessionId ||
      physical.length !== 1 ||
      physical[0]?.userId !== ownerId ||
      physical[0]?.queueId !== sessionId ||
      original.operation !== entry.operation ||
      entry.operation !== (chosen ? "delete_saved" : "rebind_remaining")
    )
      reject("original_bookkeeping_ownership");

    // Read only the immutable cached V2 source. The live models may already
    // contain prepared tombstones and sibling rebinds, not an active session.
    let decoded: ReturnType<typeof decodeSmsReviewDraftPayload>;
    try {
      decoded = decodeSmsReviewDraftPayload({
        version: Number(original.payloadVersion),
        json: original.payloadJson,
        expectedFingerprint: original.smsFingerprint,
        expectedOwnerId: ownerId,
        expectedSessionId: sessionId,
        selectionOverride: original.selectionOverride,
      });
    } catch {
      reject("original_bookkeeping_source_invalid");
    }
    const row = decoded.review?.row;
    const suggestedGroupId =
      row?.assignment.state === "suggested" ? row.assignment.groupId : null;
    if (
      !row ||
      row.source !== "SMS" ||
      row.sourceFingerprint !== original.smsFingerprint ||
      entry.expectedReviewRevision !== row.revision ||
      (chosen
        ? !row.selected ||
          row.rowId !== chosen.row.rowId ||
          row.revision !== chosen.row.revision ||
          original.smsFingerprint !== chosen.row.sourceFingerprint
        : row.selected ||
          suggestedGroupId === null ||
          !payload.confirmedGroupRefs.some(
            (group) => group.groupId === suggestedGroupId
          ))
    )
      reject("original_bookkeeping_revision");

    // This is the exact canonical preimage commitment used before staging in
    // smsPreimageHash. It cannot be inferred from the prepared postimage hash.
    const originalHash = await hashProvider.digestUtf8(
      serializeCanonicalJsonValue({
        id: original.id,
        queueId: original.queueId,
        smsFingerprint: original.smsFingerprint,
        payloadVersion: original.payloadVersion,
        position: original.position,
        selectionOverride: original.selectionOverride,
        payloadJson: original.payloadJson,
        parsedAt: original.parsedAt,
      })
    );
    if (entry.snapshotHash !== originalHash)
      reject("original_bookkeeping_snapshot_hash");
  }
}

/**
 * Same-writer original queue header and actual prepared absence evidence.
 * The only prunable queue is the one whose CURRENT owned drafts are ALL
 * consumed by this action. Never infer this from a selected-row count alone.
 */
async function captureQueueHeader(input: {
  readonly sms: SmsSaveScope;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly evidence: FinancialActionLinkedOperationPreparedOwnershipInput;
  readonly payload: ReviewBatchSavePayload;
  readonly hashProvider: Sha256Provider;
}): Promise<Queue> {
  const queue = queueEvidence(input.sms, input.sessionId, input.ownerId);
  if (
    input.evidence.userId !== input.ownerId ||
    input.payload.source !== "SMS" ||
    input.payload.sessionId !== input.sessionId
  )
    reject("queue_root_or_source_mismatch");
  const all = input.sms.allOwned;
  const selected = input.sms.selected;
  const selectedIds = new Set(selected.map(({ draft }) => draft.id));
  const allIds = new Set(all.map((draft) => draft.id));
  if (
    selected.length === 0 ||
    selectedIds.size !== selected.length ||
    allIds.size !== all.length ||
    all.some(
      (draft) => draft.userId !== input.ownerId || draft.queueId !== queue.id
    ) ||
    selected.some(
      ({ draft, queue: current }) =>
        current !== queue ||
        draft.userId !== input.ownerId ||
        draft.queueId !== queue.id ||
        !allIds.has(draft.id)
    )
  )
    reject("queue_current_owned_draft_membership");
  const fullyConsumed =
    all.length === selected.length &&
    all.every((draft) => selectedIds.has(draft.id));
  const before = input.evidence.cachedPreimages.filter(
    (row) => row.table === "sms_review_queues"
  );
  const after = input.evidence.preparedPostimages.filter(
    (row) => row.table === "sms_review_queues"
  );
  if (
    before.length !== after.length ||
    before.length > 1 ||
    fullyConsumed !== (after.length === 1) ||
    input.payload.localSmsBookkeeping.some(
      (entry) =>
        entry.queueId !== input.sessionId ||
        (fullyConsumed && entry.operation === "rebind_remaining")
    )
  )
    reject("queue_prepared_membership");
  const prior = before[0];
  const prepared = after[0];
  if (
    fullyConsumed &&
    (!prior ||
      !prepared ||
      prior.id !== queue.id ||
      prepared.id !== queue.id ||
      prior.kind !== "markAsDeleted" ||
      prepared.kind !== "markAsDeleted" ||
      queue._preparedState !== "markAsDeleted" ||
      physicalRawField(prior.raw, "_status") === "deleted" ||
      physicalRawField(prepared.raw, "_status") !== "deleted")
  )
    reject("queue_destructive_proof_missing");
  if (!fullyConsumed && queue._preparedState !== null)
    reject("queue_not_pruned_but_prepared");
  const original = prior?.raw ?? queue._raw;
  const physicalPost = prepared?.raw ?? queue._raw;
  const createdAt = physicalDate(original, "created_at");
  const updatedAt = physicalDate(original, "updated_at");
  if (
    physicalText(original, "user_id") !== input.ownerId ||
    physicalText(physicalPost, "user_id") !== input.ownerId ||
    physicalDate(physicalPost, "created_at") !== createdAt ||
    physicalDate(physicalPost, "updated_at") !== updatedAt ||
    physicalDate(queue._raw, "created_at") !== createdAt ||
    physicalDate(queue._raw, "updated_at") !== updatedAt ||
    queue.createdAt.toISOString() !== createdAt ||
    queue.updatedAt.toISOString() !== updatedAt
  )
    reject("queue_original_header_rebound");
  if (fullyConsumed) {
    const physicalDrafts = input.evidence.preparedPostimages.filter(
      (row) => row.table === "sms_review_draft_items"
    );
    if (
      physicalDrafts.length !== all.length ||
      physicalDrafts.some(
        (row) => row.kind !== "markAsDeleted" || !selectedIds.has(row.id)
      )
    )
      reject("queue_unconsumed_draft_or_rebind");
  }
  return {
    id: queue.id,
    userId: input.ownerId,
    createdAt,
    updatedAt,
    disposition: fullyConsumed ? "pruned_empty" : "present",
    expectedPostimageHash: await hashAccountReviewLocalPostimage({
      table: queue.table,
      id: queue.id,
      raw: physicalPost,
      hashProvider: input.hashProvider,
    }),
  };
}

export async function captureReviewSmsEvidence(input: {
  readonly sms: SmsSaveScope;
  readonly source: "SMS" | "VOICE";
  readonly sessionId: string;
  readonly ownerId: string;
  readonly payload: ReviewBatchSavePayload;
  readonly evidence: FinancialActionLinkedOperationPreparedOwnershipInput;
  readonly hashProvider: Sha256Provider;
}): Promise<
  Pick<AccountReviewLocalSaveSnapshot, "smsDrafts" | "queuePreimage">
> {
  if (input.source === "VOICE") {
    if (
      input.sms.queue !== null ||
      input.sms.selected.length !== 0 ||
      input.evidence.preparedPostimages.some(
        (row) => row.table === "sms_review_draft_items"
      )
    )
      reject("voice_contains_sms_evidence");
    return { smsDrafts: [], queuePreimage: null };
  }
  const queue = await captureQueueHeader(input);
  const changed = input.evidence.preparedPostimages.filter(
    (item) => item.table === "sms_review_draft_items"
  );
  const smsDrafts = await Promise.all(
    changed.map((item) =>
      originalAvailableDraft({
        id: item.id,
        operation: draftOperation(item.id, input.sms, input.payload),
        evidence: input.evidence,
        hashProvider: input.hashProvider,
        queueId: input.sessionId,
      })
    )
  );
  const ids = smsDrafts.map((draft) => draft.id);
  if (
    new Set(ids).size !== ids.length ||
    input.sms.selected.some((row) => !ids.includes(row.draft.id)) ||
    input.payload.localSmsBookkeeping.some((row) => !ids.includes(row.draftId))
  )
    reject("sms_draft_coverage_mismatch");
  await assertExactOriginalSmsBookkeeping({
    sms: input.sms,
    ownerId: input.ownerId,
    sessionId: input.sessionId,
    payload: input.payload,
    evidence: input.evidence,
    hashProvider: input.hashProvider,
    captured: smsDrafts,
  });
  return {
    smsDrafts: smsDrafts.sort((a, b) => compareAscii(a.id, b.id)),
    queuePreimage: queue,
  };
}
