/** T029: a complete published WeakMap receipt, never a lookalike DTO. */
import {
  database,
  type SmsReviewDraftItem,
  type SmsReviewQueue,
  type DismissedSmsFingerprint,
} from "@monyvi/db";
import { Q, type Model } from "@nozbe/watermelondb";
import {
  encodeSmsReviewDraft,
  decodeSmsReviewDraft,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import { encodeSmsReviewDraftV2 } from "../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
  type AccountReviewRow,
  type AccountReviewReason,
} from "../../../packages/logic/src/account-review/review-schemas";
import { mergeAccountReviewLateRows } from "../../../packages/logic/src/account-review/reducer";
import {
  assertPublishedSmsReviewSession,
  commitSmsReviewNamespacePublication,
} from "./sms-review-namespace-state";
import {
  rehydrateOwnedSmsReviewGraph,
  encodeOwnedSmsReviewRow,
} from "./account-review-command-snapshots";
import { commitScopedPreparedBatch } from "./sms-review-draft-batch-service";
import { getSavedSmsReviewFingerprints } from "./sms-review-handled-fingerprint-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import type {
  MergeSmsReviewDraftsInput,
  MergeSmsReviewDraftsResult,
} from "./sms-review-draft-repository";

interface PublicationPlan {
  readonly state: AccountReviewSession;
  readonly create: readonly AccountReviewRow[];
  readonly updateIds: ReadonlySet<string>;
}
interface OwnedPublicationRows {
  readonly queue: SmsReviewQueue;
  readonly records: readonly SmsReviewDraftItem[];
  readonly dismissed: ReadonlySet<string>;
}

async function readPublicationRows(
  ownerId: string,
  queueId: string
): Promise<OwnedPublicationRows> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId) throw new Error("account_review_owner_changed");
  const queues = await scope
    .queryOwned(database.get<SmsReviewQueue>("sms_review_queues"))
    .fetch();
  const queue = queues[0];
  if (queues.length !== 1 || !queue || queue.id !== queueId)
    throw new Error("account_review_queue_changed");
  const records = await scope
    .queryOwned(
      database.get<SmsReviewDraftItem>("sms_review_draft_items"),
      Q.where("queue_id", queueId)
    )
    .fetch();
  if (
    new Set(records.map((item) => item.smsFingerprint)).size !== records.length
  )
    throw new Error("account_review_duplicate_source");
  const dismissed = await scope
    .queryOwned(
      database.get<DismissedSmsFingerprint>("dismissed_sms_fingerprints")
    )
    .fetch();
  return {
    queue,
    records,
    dismissed: new Set(dismissed.map((item) => item.smsFingerprint)),
  };
}

function mayPromoteV1(
  record: SmsReviewDraftItem,
  expected: ParsedSmsTransaction,
  baselines: readonly ParsedSmsTransaction[]
): boolean {
  if (record.payloadVersion !== 1 || record.selectionOverride === true)
    return false;
  const prior =
    baselines.find((item) => item.smsFingerprint === record.smsFingerprint) ??
    expected;
  const original = decodeSmsReviewDraft({
    version: record.payloadVersion,
    json: record.payloadJson,
    expectedFingerprint: record.smsFingerprint,
  });
  return (
    encodeSmsReviewDraft(prior).json === record.payloadJson &&
    encodeSmsReviewDraft(original).json === record.payloadJson
  );
}

function planInitial(
  state: AccountReviewSession,
  records: readonly SmsReviewDraftItem[],
  submitted: readonly ParsedSmsTransaction[],
  baselines: readonly ParsedSmsTransaction[],
  handled: ReadonlySet<string>
): PublicationPlan {
  const byFp = new Map<string, SmsReviewDraftItem>();
  for (const record of records) byFp.set(record.smsFingerprint, record);
  const bySubmitted = new Map<string, ParsedSmsTransaction>();
  for (const item of submitted) bySubmitted.set(item.smsFingerprint, item);
  const updateIds = new Set<string>();
  const create: AccountReviewRow[] = [];
  for (const row of state.rows) {
    if (row.source !== "SMS") throw new Error("account_review_wrong_source");
    const record = byFp.get(row.sourceFingerprint);
    if (record) {
      const original = bySubmitted.get(row.sourceFingerprint);
      if (original && mayPromoteV1(record, original, baselines))
        updateIds.add(record.id);
    } else if (!handled.has(row.sourceFingerprint)) {
      if (row.selected) throw new Error("account_review_new_row_selected");
      create.push(row);
    }
  }
  // An old/edited V1 queue cannot acquire an initial parser's revision "0".
  // Only exact unchanged progress rows from THIS complete publication may
  // promote directly. Other legacy rows need the authenticated 1/1 anchor.
  if (records.some((record) => !updateIds.has(record.id)))
    throw new Error("account_review_legacy_bootstrap_required");
  return { state, create, updateIds };
}

function assertCompleteGroupWrites(
  plan: PublicationPlan,
  records: readonly SmsReviewDraftItem[]
): void {
  const updating = new Set(
    records
      .filter((item) => plan.updateIds.has(item.id))
      .map((item) => item.smsFingerprint)
  );
  const covered = new Set(
    plan.state.rows
      .filter(
        (row) => row.source === "SMS" && updating.has(row.sourceFingerprint)
      )
      .map((row) => row.rowId)
  );
  for (const row of plan.create) covered.add(row.rowId);
  for (const row of plan.state.rows) {
    if (!covered.has(row.rowId)) continue;
    const active = plan.state.groups.find(
      (group) =>
        group.status !== "removed" && group.linkedRowIds.includes(row.rowId)
    );
    if (active?.linkedRowIds.some((id) => !covered.has(id)))
      throw new Error("account_review_partial_group_publication");
  }
}

function assertExistingFingerprintProof(
  current: AccountReviewSession,
  incoming: AccountReviewSession,
  handled: ReadonlySet<string>
): void {
  const known = new Map(
    current.rows
      .filter((row) => row.source === "SMS")
      .map((row) => [row.sourceFingerprint, row])
  );
  for (const row of incoming.rows) {
    if (row.source !== "SMS") throw new Error("account_review_wrong_source");
    const previous = known.get(row.sourceFingerprint);
    if (!previous) {
      if (handled.has(row.sourceFingerprint)) continue;
      if (current.rows.some((item) => item.rowId === row.rowId))
        throw new Error("account_review_late_source_conflict");
      continue;
    }
    if (
      previous.rowId !== row.rowId &&
      !previous.sourceRef.startsWith("legacy-local:")
    )
      throw new Error("account_review_row_identity_conflict");
    if (
      previous.assignment.state !== "suggested" ||
      row.assignment.state !== "suggested"
    )
      continue;
    if (previous.assignment.groupId !== row.assignment.groupId) {
      throw new Error("account_review_group_identity_conflict");
    }
  }
}

/** Incoming parser evidence cannot claim a committed identity revision. */
function unprovenConfirmationIds(
  current: AccountReviewSession,
  incoming: AccountReviewSession
): ReadonlySet<string> {
  const unsafe = new Set<string>();
  for (const group of incoming.groups) {
    const prior = current.groups.find(
      (item) => item.groupId === group.groupId && item.status === "confirmed"
    );
    if (!prior) continue;
    if (
      prior.status !== group.status ||
      prior.revision !== group.revision ||
      prior.evidenceKey !== group.evidenceKey ||
      prior.name !== group.name ||
      prior.type !== group.type ||
      prior.currency !== group.currency ||
      prior.institutionId !== group.institutionId ||
      prior.providerDisplayName !== group.providerDisplayName ||
      prior.cardLast4 !== group.cardLast4 ||
      JSON.stringify(prior.senderNames) !== JSON.stringify(group.senderNames)
    )
      unsafe.add(group.groupId);
  }
  return unsafe;
}
function detachUnprovenLateGroup(row: AccountReviewRow): AccountReviewRow {
  const reason: AccountReviewReason = "account_group_snapshot_conflict";
  return {
    ...row,
    selected: false,
    assignment: {
      state: "unresolved",
      accountId: null,
      reasonCode: reason,
      candidateAccountIds: [],
    },
    reviewReasons: [
      ...new Set([
        ...row.reviewReasons.filter(
          (reason) => reason !== "account_group_unconfirmed"
        ),
        reason,
      ]),
    ],
  };
}

/** Only new owned source rows enter the pure late-arrival reducer. */
function newSourceProjection(
  current: AccountReviewSession,
  incoming: AccountReviewSession,
  handled: ReadonlySet<string>
): AccountReviewSession {
  const known = new Set(
    current.rows
      .filter((row) => row.source === "SMS")
      .map((row) => row.sourceFingerprint)
  );
  const unproven = unprovenConfirmationIds(current, incoming);
  const rows = incoming.rows
    .filter(
      (row) =>
        row.source === "SMS" &&
        !known.has(row.sourceFingerprint) &&
        !handled.has(row.sourceFingerprint)
    )
    .map((row) =>
      row.assignment.state === "suggested" &&
      unproven.has(row.assignment.groupId)
        ? detachUnprovenLateGroup(row)
        : row
    );
  const newIds = new Set(rows.map((row) => row.rowId));
  const groups = incoming.groups.flatMap((group) => {
    if (unproven.has(group.groupId)) return [];
    const linkedRowIds = group.linkedRowIds.filter((id) => newIds.has(id));
    return linkedRowIds.length > 0 ? [{ ...group, linkedRowIds }] : [];
  });
  return accountReviewSessionSchema.parse({
    ...incoming,
    rows,
    groups,
  });
}

function changedGroupRowIds(
  current: AccountReviewSession,
  next: AccountReviewSession
): ReadonlySet<string> {
  const changed = new Set<string>();
  const oldGroups = new Map(
    current.groups.map((group) => [group.groupId, group])
  );
  for (const group of next.groups) {
    const previous = oldGroups.get(group.groupId);
    if (JSON.stringify(previous) === JSON.stringify(group)) continue;
    for (const id of group.linkedRowIds) changed.add(id);
    for (const id of previous?.linkedRowIds ?? []) changed.add(id);
  }
  return changed;
}

function mixedLateUpdateIds(
  current: AccountReviewSession,
  next: AccountReviewSession,
  records: readonly SmsReviewDraftItem[]
): ReadonlySet<string> {
  const byId = new Map(current.rows.map((row) => [row.rowId, row]));
  const fingerprintToRow = new Map(
    next.rows
      .filter((row) => row.source === "SMS")
      .map((row) => [row.sourceFingerprint, row])
  );
  const grouped = changedGroupRowIds(current, next);
  const ids = new Set<string>();
  for (const record of records) {
    const row = fingerprintToRow.get(record.smsFingerprint);
    if (!row) throw new Error("account_review_late_row_missing");
    if (record.payloadVersion === 2) {
      ids.add(record.id);
      continue;
    }
    const prior = byId.get(row.rowId);
    if (
      !prior ||
      grouped.has(row.rowId) ||
      JSON.stringify(prior) !== JSON.stringify(row)
    )
      ids.add(record.id);
  }
  return ids;
}

function planFromV2(
  incoming: AccountReviewSession,
  records: readonly SmsReviewDraftItem[],
  handled: ReadonlySet<string>
): PublicationPlan {
  const current = rehydrateOwnedSmsReviewGraph(
    records,
    incoming.ownerId,
    incoming.sessionId
  ).session;
  assertExistingFingerprintProof(current, incoming, handled);
  const incomingNew = newSourceProjection(current, incoming, handled);
  if (incomingNew.rows.length === 0)
    return { state: current, create: [], updateIds: new Set() };
  const state = mergeAccountReviewLateRows({
    current,
    incoming: incomingNew,
  });
  if (state === current)
    throw new Error("account_review_late_rows_uncommitted");
  const known = new Set(records.map((record) => record.smsFingerprint));
  const create = state.rows.filter(
    (row) => row.source === "SMS" && !known.has(row.sourceFingerprint)
  );
  if (
    create.length !== incomingNew.rows.length ||
    create.some((row) => row.selected)
  )
    throw new Error("account_review_late_selection_conflict");
  const updateIds = mixedLateUpdateIds(current, state, records);
  return { state, create, updateIds };
}

function createPublicationPlan(
  session: AccountReviewSession,
  records: readonly SmsReviewDraftItem[],
  submitted: readonly ParsedSmsTransaction[],
  baselines: readonly ParsedSmsTransaction[],
  handled: ReadonlySet<string>
): PublicationPlan {
  const hasV2 = records.some((record) => record.payloadVersion === 2);
  if (hasV2) return planFromV2(session, records, handled);
  const plan = planInitial(session, records, submitted, baselines, handled);
  assertCompleteGroupWrites(plan, records);
  return plan;
}

function assertOriginalFinance(
  state: AccountReviewSession,
  originals: readonly ParsedSmsTransaction[]
): void {
  for (const row of state.rows) {
    if (row.source !== "SMS") throw new Error("account_review_wrong_source");
    const original = originals.find(
      (item) => item.smsFingerprint === row.sourceFingerprint
    );
    if (!original) throw new Error("account_review_original_missing");
    encodeSmsReviewDraftV2({
      transaction: original,
      review: {
        ownerId: state.ownerId,
        sessionId: state.sessionId,
        sourceRevision: state.sourceRevision,
        preferredCurrency: state.preferredCurrency,
        reviewRevision: state.revision,
        operationGeneration: state.operationGeneration,
        row,
        groups: state.groups.filter(
          (group) =>
            group.linkedRowIds.includes(row.rowId) ||
            state.removedEvidenceKeys.includes(group.evidenceKey)
        ),
        removedEvidenceKeys: state.removedEvidenceKeys,
      },
    });
  }
}

function prepareExistingPublicationUpdates(
  plan: PublicationPlan,
  records: readonly SmsReviewDraftItem[],
  now: Date
): Model[] {
  return records
    .filter((item) => plan.updateIds.has(item.id))
    .map((record) => {
      const row = plan.state.rows.find(
        (item) =>
          item.source === "SMS" &&
          item.sourceFingerprint === record.smsFingerprint
      );
      if (!row) throw new Error("account_review_published_row_missing");
      const payload = encodeOwnedSmsReviewRow(plan.state, row);
      return record.prepareUpdate((item) => {
        item.payloadVersion = payload.version;
        item.payloadJson = payload.json;
        if (
          record.selectionOverride !== row.selected &&
          (record.payloadVersion === 1 || record.selectionOverride !== null)
        )
          item.selectionOverride = row.selected;
        item.updatedAt = now;
      });
    });
}

function prepareNewPublicationRows(
  plan: PublicationPlan,
  queue: SmsReviewQueue,
  records: readonly SmsReviewDraftItem[],
  receivedAt: Date,
  now: Date
): Model[] {
  let position = records.reduce(
    (max, item) => Math.max(max, item.position),
    -1
  );
  return plan.create.map((row) => {
    if (row.source !== "SMS") throw new Error("account_review_wrong_source");
    const payload = encodeOwnedSmsReviewRow(plan.state, row);
    position += 1;
    const nextPosition = position;
    return database
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .prepareCreate((item) => {
        item.queueId = queue.id;
        item.userId = plan.state.ownerId;
        item.smsFingerprint = row.sourceFingerprint;
        item.payloadVersion = payload.version;
        item.payloadJson = payload.json;
        item.selectionOverride = false;
        item.position = nextPosition;
        item.parsedAt = receivedAt;
        item.updatedAt = now;
      });
  });
}

async function persistPublishedPlan(
  ownerId: string,
  queue: SmsReviewQueue,
  records: readonly SmsReviewDraftItem[],
  plan: PublicationPlan,
  receivedAt: Date,
  guard: () => void
): Promise<void> {
  const affected = records.filter((item) => plan.updateIds.has(item.id));
  const now = new Date();
  await commitScopedPreparedBatch(ownerId, [queue, ...affected], () => {
    guard();
    // The existing queue is an immutable physical recovery header.
    // Keep it cached for scoped rollback, but stage only actual draft writes.
    return [
      ...prepareExistingPublicationUpdates(plan, records, now),
      ...prepareNewPublicationRows(plan, queue, records, receivedAt, now),
    ];
  });
}

function settlePublicationResult(
  ownerId: string,
  queueId: string,
  plan: PublicationPlan,
  records: readonly SmsReviewDraftItem[],
  transactions: readonly ParsedSmsTransaction[],
  handled: ReadonlySet<string>
): MergeSmsReviewDraftsResult {
  const inserted = new Set(
    plan.create
      .filter((row) => row.source === "SMS")
      .map((row) => row.sourceFingerprint)
  );
  const promoted = new Set(
    records
      .filter((item) => plan.updateIds.has(item.id))
      .map((item) => item.smsFingerprint)
  );
  const admitted = transactions.filter(
    (item) =>
      inserted.has(item.smsFingerprint) || promoted.has(item.smsFingerprint)
  );
  const terminal = transactions.filter((item) => !admitted.includes(item));
  commitSmsReviewNamespacePublication(ownerId, queueId, admitted, terminal);
  return {
    insertedCount: plan.create.length,
    existingCount: transactions.length - plan.create.length,
    rejectedCount: 0,
    reviewableFingerprints: transactions
      .map((item) => item.smsFingerprint)
      .filter((fingerprint) => !handled.has(fingerprint)),
  };
}

/** Keep the complete publication admission and commit inside one DB writer. */
async function mergePublishedSmsReviewInWriter(
  ownerId: string,
  input: MergeSmsReviewDraftsInput,
  session: AccountReviewSession,
  guard: () => void
): Promise<MergeSmsReviewDraftsResult> {
  await assertExpectedCurrentUser(ownerId);
  const { queue, records, dismissed } = await readPublicationRows(
    ownerId,
    session.sessionId
  );
  guard();
  const saved = await getSavedSmsReviewFingerprints(ownerId);
  const handled = new Set([...dismissed, ...saved]);
  const plan = createPublicationPlan(
    session,
    records,
    input.transactions,
    input.baselineTransactions ?? [],
    handled
  );
  if (plan.create.length > 0 || plan.updateIds.size > 0) {
    await persistPublishedPlan(
      ownerId,
      queue,
      records,
      plan,
      input.parsedAt ?? new Date(),
      guard
    );
  } else {
    await assertExpectedCurrentUser(ownerId);
    guard();
  }
  return settlePublicationResult(
    ownerId,
    queue.id,
    plan,
    records,
    input.transactions,
    handled
  );
}

export async function mergePublishedSmsReviewDrafts(
  input: MergeSmsReviewDraftsInput,
  published: AccountReviewSession
): Promise<MergeSmsReviewDraftsResult> {
  const ownerId = input.expectedUserId;
  await assertExpectedCurrentUser(ownerId);
  const guard = (): void =>
    assertPublishedSmsReviewSession(
      published,
      ownerId,
      published.sessionId,
      input.transactions
    );
  guard();
  const session = accountReviewSessionSchema.parse(published);
  assertOriginalFinance(session, input.transactions);
  return database.write(() =>
    mergePublishedSmsReviewInWriter(ownerId, input, session, guard)
  );
}
