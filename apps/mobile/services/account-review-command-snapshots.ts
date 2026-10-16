/** Scoped SMS review graph: one canonical session from owner-verified drafts. */
import type { SmsReviewDraftItem } from "@monyvi/db";
import {
  decodeSmsReviewDraftPayload,
  encodeSmsReviewDraftV2,
  migrateSmsReviewDraftV1ToV2,
} from "../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  accountReviewSessionSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
  type AccountReviewSession,
} from "../../../packages/logic/src/account-review/review-schemas";

export interface OwnedReviewGraph {
  readonly session: AccountReviewSession;
  readonly recordsByRow: ReadonlyMap<string, SmsReviewDraftItem>;
}

type ReviewPayload = NonNullable<
  ReturnType<typeof decodeSmsReviewDraftPayload>["review"]
>;

function decodeStoredV2(
  record: SmsReviewDraftItem,
  ownerId: string,
  queueId: string
): ReviewPayload | null {
  const decoded = decodeSmsReviewDraftPayload({
    version: record.payloadVersion,
    json: record.payloadJson,
    expectedFingerprint: record.smsFingerprint,
    expectedOwnerId: ownerId,
    expectedSessionId: queueId,
    selectionOverride: record.selectionOverride,
  });
  return decoded.review;
}

function decodeLegacy(
  record: SmsReviewDraftItem,
  ownerId: string,
  queueId: string,
  baseline: ReviewPayload
): ReviewPayload {
  const payload = migrateSmsReviewDraftV1ToV2({
    version: record.payloadVersion,
    json: record.payloadJson,
    expectedFingerprint: record.smsFingerprint,
    expectedOwnerId: ownerId,
    expectedSessionId: queueId,
    selectionOverride: record.selectionOverride,
    rowId: record.id,
    sourceRevision: baseline.sourceRevision,
    preferredCurrency: baseline.preferredCurrency,
    reviewRevision: baseline.reviewRevision,
    operationGeneration: baseline.operationGeneration,
    // V1 has no filter header; inherit the authentic current V2 authority
    // in memory. Untouched V1 physical payload bytes are never rewritten.
    filter: baseline.filter,
  });
  const reviewed = decodeSmsReviewDraftPayload({
    ...payload,
    expectedFingerprint: record.smsFingerprint,
    expectedOwnerId: ownerId,
    expectedSessionId: queueId,
    selectionOverride: record.selectionOverride,
  }).review;
  if (!reviewed) throw new Error("account_review_legacy_migration_incomplete");
  // An untouched V1 row has no local review revision. Its revision is
  // established at durable genesis and must never track later global edits.
  return {
    ...reviewed,
    row: { ...reviewed.row, revision: "1" },
  };
}

function assertSameHeader(
  current: ReviewPayload,
  reference: ReviewPayload
): void {
  if (
    current.ownerId !== reference.ownerId ||
    current.sessionId !== reference.sessionId ||
    current.sourceRevision !== reference.sourceRevision ||
    current.preferredCurrency !== reference.preferredCurrency ||
    current.reviewRevision !== reference.reviewRevision ||
    current.operationGeneration !== reference.operationGeneration ||
    current.filter !== reference.filter ||
    JSON.stringify(current.removedEvidenceKeys) !==
      JSON.stringify(reference.removedEvidenceKeys)
  ) {
    throw new Error("account_review_global_snapshot_conflict");
  }
}

function combineReferencedGroups(
  views: readonly ReviewPayload[]
): AccountReviewGroup[] {
  const byId = new Map<string, AccountReviewGroup>();
  for (const view of views) {
    for (const group of view.groups) {
      const prior = byId.get(group.groupId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(group))
        throw new Error("account_review_group_snapshot_conflict");
      if (!prior) byId.set(group.groupId, group);
    }
  }
  for (const view of views) {
    for (const group of byId.values()) {
      if (group.status === "removed" &&
          !view.removedEvidenceKeys.includes(group.evidenceKey))
        throw new Error("account_review_tombstone_snapshot_conflict");
    }
  }
  return [...byId.values()];
}

export function rehydrateOwnedSmsReviewGraph(
  records: readonly SmsReviewDraftItem[],
  ownerId: string,
  queueId: string
): OwnedReviewGraph {
  if (records.length === 0) throw new Error("account_review_queue_missing");
  const baseline = records
    .filter((record) => record.payloadVersion === 2)
    .map((record) => decodeStoredV2(record, ownerId, queueId))
    .find((review) => review !== null);
  if (!baseline) throw new Error("account_review_legacy_revision_unproven");
  const views: ReviewPayload[] = [];
  const recordsByRow = new Map<string, SmsReviewDraftItem>();
  const fingerprints = new Set<string>();
  for (const record of records) {
    if (record.userId !== ownerId || record.queueId !== queueId ||
        fingerprints.has(record.smsFingerprint))
      throw new Error("account_review_source_scope_conflict");
    fingerprints.add(record.smsFingerprint);
    const view = decodeStoredV2(record, ownerId, queueId) ??
      decodeLegacy(record, ownerId, queueId, baseline);
    assertSameHeader(view, baseline);
    if (recordsByRow.has(view.row.rowId))
      throw new Error("account_review_row_identity_conflict");
    recordsByRow.set(view.row.rowId, record);
    views.push(view);
  }
  const groups = combineReferencedGroups(views);
  const session = accountReviewSessionSchema.parse({
    ownerId, source: "SMS", sessionId: queueId,
    sourceRevision: baseline.sourceRevision,
    preferredCurrency: baseline.preferredCurrency,
    rows: views.map((view) => view.row),
    groups, removedEvidenceKeys: [...baseline.removedEvidenceKeys],
    filter: baseline.filter, revision: baseline.reviewRevision,
    operationGeneration: baseline.operationGeneration,
    saveIntent: null,
  });
  return { session, recordsByRow };
}

export function encodeOwnedSmsReviewRow(
  state: AccountReviewSession,
  row: AccountReviewRow
): ReturnType<typeof encodeSmsReviewDraftV2> {
  if (row.source !== "SMS")
    throw new Error("account_review_wrong_source");
  return encodeSmsReviewDraftV2({
    transaction: row.transaction,
    review: {
      ownerId: state.ownerId,
      sessionId: state.sessionId,
      sourceRevision: state.sourceRevision,
      preferredCurrency: state.preferredCurrency,
      reviewRevision: state.revision,
      operationGeneration: state.operationGeneration,
      filter: state.filter,
      row,
      groups: state.groups.filter((group) =>
        group.linkedRowIds.includes(row.rowId) ||
        state.removedEvidenceKeys.includes(group.evidenceKey)
      ),
      removedEvidenceKeys: [...state.removedEvidenceKeys],
    },
  });
}
