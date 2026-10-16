/**
 * #395 T046 — immutable original selected review intent digest (pure).
 * It binds the entire frozen request, including SMS rows later deduplicated.
 * Only a lowercase SHA-256 commitment, never this projection, enters the
 * unshipped review.batch-save/v1 financial action payload.
 */
import {
  accountReviewSaveIntentSchema, accountReviewSessionSchema,
  type AccountReviewSaveIntent, type AccountReviewSession,
} from "../account-review/review-schemas";
import { hash } from "../account-review/schema-primitives";
import { serializeCanonicalJsonValue, type Sha256Provider } from "./action-contracts";
import type { CanonicalJsonValue } from "./action-registry";
import { accountDefaultSnapshotSchema, type ReviewBatchSavePayload } from
  "./review-batch-save-shapes";
import { projectSelectedReviewRow } from "./review-intent-digest-rows";
import {
  completeOriginalPlannedMembers, originalConfirmedGroups,
} from "./review-intent-digest-groups";

const DOMAIN = "monyvi.account-review.frozen-intent";
const VERSION = "v1";

export interface ComputeAccountReviewFrozenIntentDigestInput {
  readonly session: AccountReviewSession;
  readonly intent: AccountReviewSaveIntent;
  readonly creationDefaultSnapshot:
    ReviewBatchSavePayload["creationDefaultSnapshot"];
  readonly hashProvider: Sha256Provider;
}

function refuse(reason: string): never {
  throw new Error("account_review_intent_digest_" + reason);
}

function ascii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function intentProjection(intent: AccountReviewSaveIntent): CanonicalJsonValue {
  return {
    actionId: intent.actionId,
    ownerId: intent.ownerId,
    source: intent.source,
    sessionId: intent.sessionId,
    occurredAt: intent.occurredAt,
    expectedReviewRevision: intent.expectedReviewRevision,
    expectedOperationGeneration: intent.expectedOperationGeneration,
    selectedRows: [...intent.selectedRows]
      .sort((a, b) => ascii(a.rowId, b.rowId))
      .map((item) => ({ rowId: item.rowId, revision: item.revision })),
    confirmedGroups: [...intent.confirmedGroups]
      .sort((a, b) => ascii(a.groupId, b.groupId))
      .map((item) => ({
        groupId: item.groupId, revision: item.revision,
        evidenceKey: item.evidenceKey,
      })),
    plannedEntityIds: [...intent.plannedEntityIds]
      .sort((a, b) => ascii(
        a.entity + ":" + a.localRef + ":" + a.id,
        b.entity + ":" + b.localRef + ":" + b.id
      )).map((item) => ({
        entity: item.entity, localRef: item.localRef, id: item.id,
      })),
  };
}

function assertFrozenScope(
  state: AccountReviewSession, intent: AccountReviewSaveIntent
): void {
  if (state.saveIntent === null ||
      state.ownerId !== intent.ownerId ||
      state.source !== intent.source ||
      state.sessionId !== intent.sessionId ||
      state.revision !== intent.expectedReviewRevision ||
      state.operationGeneration !== intent.expectedOperationGeneration ||
      serializeCanonicalJsonValue(intentProjection(state.saveIntent)) !==
        serializeCanonicalJsonValue(intentProjection(intent))) {
    refuse("intent_stale");
  }
}

function selectedOriginalRows(
  state: AccountReviewSession, intent: AccountReviewSaveIntent
): AccountReviewSession["rows"] {
  const selected = state.rows.filter((row) => row.selected)
    .sort((a, b) => ascii(a.rowId, b.rowId));
  if (selected.length === 0 ||
      selected.length !== intent.selectedRows.length ||
      selected.some((row) => !intent.selectedRows.some(
        (item) => item.rowId === row.rowId && item.revision === row.revision
      ))) {
    refuse("selected_rows_changed");
  }
  return selected;
}

/**
 * Snapshot describes historical first-write state. It may be absent even
 * with an originally confirmed group when every SMS member was deduplicated.
 * The actual payload validator—not this pure input hash—requires it iff
 * any account was ACTUALLY created after deduplication.
 */
function originalDefaultSnapshot(
  snapshot: ReviewBatchSavePayload["creationDefaultSnapshot"]
): CanonicalJsonValue {
  if (snapshot === undefined) return null;
  const parsed = accountDefaultSnapshotSchema.parse(snapshot);
  const ids = [...parsed.activeAccountIds].sort(ascii);
  if (new Set(ids).size !== ids.length ||
      (parsed.defaultAccount !== null &&
        !ids.includes(parsed.defaultAccount.accountId))) {
    refuse("captured_default_snapshot_invalid");
  }
  return {
    activeAccountIds: ids,
    defaultAccount: parsed.defaultAccount === null ? null : {
      accountId: parsed.defaultAccount.accountId,
      isDefault: true,
    },
  };
}

function frozenScopeProjection(
  state: AccountReviewSession, intent: AccountReviewSaveIntent
): CanonicalJsonValue {
  return {
    ownerId: intent.ownerId,
    source: intent.source,
    sessionId: intent.sessionId,
    sourceRevision: state.sourceRevision,
    actionId: intent.actionId,
    occurredAt: intent.occurredAt,
    expectedReviewRevision: intent.expectedReviewRevision,
    expectedOperationGeneration: intent.expectedOperationGeneration,
  };
}

/**
 * Versioned canonical original-input commitment. No clocks, persistence,
 * provider calls beyond the supplied SHA-256 hash, or app-specific DTOs.
 */
export async function computeAccountReviewFrozenIntentDigest(
  input: ComputeAccountReviewFrozenIntentDigestInput
): Promise<string> {
  const session = accountReviewSessionSchema.parse(input.session);
  const intent = accountReviewSaveIntentSchema.parse(input.intent);
  assertFrozenScope(session, intent);
  const selected = selectedOriginalRows(session, intent);
  // Reject invalid financial rows and capture supplied historical defaults
  // before asynchronous planned-child alias hashing invokes the provider.
  const selectedRows = selected.map(projectSelectedReviewRow);
  const creationDefaultSnapshot =
    originalDefaultSnapshot(input.creationDefaultSnapshot);
  const groups = originalConfirmedGroups(session, intent, selected);
  const planned = await completeOriginalPlannedMembers(
    session, intent, selected, groups.groups, input.hashProvider
  );
  const projection: CanonicalJsonValue = {
    scope: frozenScopeProjection(session, intent),
    selectedRows,
    confirmedGroups: groups.projected,
    plannedEntityIds: planned,
    creationDefaultSnapshot,
  };
  const canonicalText = serializeCanonicalJsonValue([DOMAIN, VERSION, projection]);
  return hash.parse(await input.hashProvider.digestUtf8(canonicalText));
}
