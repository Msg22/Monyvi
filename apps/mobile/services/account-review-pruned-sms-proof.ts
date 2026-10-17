/** #395 L4: authenticated, local-only physical SMS history proof.
 * A private postimage alone never authorizes deletion; the original public
 * bookkeeping must name the same physical ID and exact operation/preimage.
 * All reads precede the existing owner's single atomic adapter batch.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import { sanitizedRaw } from "@nozbe/watermelondb/RawRecord";
import type {
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
} from "@monyvi/db";
import {
  decodeSmsReviewDraftPayload,
  serializeCanonicalJsonValue,
  type Sha256Provider,
} from "@monyvi/logic";
import type { AccountReviewLocalSaveSnapshot } from "../../../packages/logic/src/financial-actions/review-local-recovery";
import type { ReviewBatchSavePayload } from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import type { CanonicalJsonValue } from "../../../packages/logic/src/financial-actions/action-registry";
import {
  hashAccountReviewLocalPostimage,
  physicalText,
} from "./account-review-local-snapshot-postimages";
import { assertExpectedCurrentUser, findOwnedById } from "./user-data-access";

type Draft = AccountReviewLocalSaveSnapshot["smsDrafts"][number];
type Physical = Readonly<Model["_raw"]>;
type SmsTable = "sms_review_queues" | "sms_review_draft_items";

export interface VerifiedPruneReviewRoot {
  readonly root: FinancialActionGroup;
  readonly payload: ReviewBatchSavePayload;
  readonly snapshot: AccountReviewLocalSaveSnapshot;
}
export interface HistoricalPruneProofInput {
  readonly database: Database;
  readonly ownerId: string;
  readonly queue: SmsReviewQueue;
  readonly selectedDrafts: readonly SmsReviewDraftItem[];
  readonly roots: readonly VerifiedPruneReviewRoot[];
  readonly hashProvider: Sha256Provider;
}
function refuse(reason: string): never {
  throw new Error("account_review_private_lifecycle_" + reason);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function sameRaw(left: Physical, right: Physical): boolean {
  const stable = (value: Physical): string =>
    JSON.stringify(Object.entries(value).sort(([a], [b]) => compare(a, b)));
  return stable(left) === stable(right);
}

/** Physical scans must be tied to an authenticated owner and one exact
 * queue/root identity. Unrelated shared-device users' SMS payloads are never
 * read. A minimal ID-only probe detects foreign members *inside* the sealed
 * queue; expected immutable draft IDs are probed across queues only for
 * reparenting, never with a payload read outside the owned queue.
 */
export interface OwnedSmsPhysicalScope {
  readonly ownerId: string;
  readonly queueId: string;
  readonly requiredDraftIds?: readonly string[];
}
export async function readPhysicalSmsRows(
  db: Database,
  table: SmsTable,
  scope: OwnedSmsPhysicalScope
): Promise<readonly Physical[]> {
  if (!scope.ownerId || !scope.queueId) refuse("physical_scope_required");
  await assertExpectedCurrentUser(scope.ownerId);
  if (table === "sms_review_draft_items") {
    // A sealed A-owned root may still have A-owned drafts after the queue
    // itself is reassigned to B. Check the exact parent identity BEFORE
    // selecting draft payloads; never infer parent ownership from children.
    const parents: readonly unknown[] = await db
      .get<Model>("sms_review_queues")
      .query(
        Q.unsafeSqlQuery(
          'select "id", "user_id" from "sms_review_queues" where "id" = ?',
          [scope.queueId]
        )
      )
      .unsafeFetchRaw();
    if (parents.length > 1) refuse("ambiguous_original_parent_queue");
    if (parents.length === 1) {
      const parent = parents[0];
      if (
        typeof parent !== "object" ||
        parent === null ||
        Array.isArray(parent) ||
        !("id" in parent) ||
        parent.id !== scope.queueId ||
        !("user_id" in parent) ||
        parent.user_id !== scope.ownerId
      )
        refuse("foreign_original_parent_queue");
    }
    // A physically absent historical parent is not automatically trusted:
    // the caller still needs authentic root/queue-disposition evidence.
  }
  const sql =
    table === "sms_review_queues"
      ? 'select * from "sms_review_queues" where "id" = ? and "user_id" = ?'
      : 'select * from "sms_review_draft_items" where "queue_id" = ? and "user_id" = ?';
  const raw: readonly unknown[] = await db
    .get<Model>(table)
    .query(Q.unsafeSqlQuery(sql, [scope.queueId, scope.ownerId]))
    .unsafeFetchRaw();

  // Probe only physical identity, not private payload, for a foreign queue
  // or for a foreign draft incorrectly referencing this owned queue ID.
  const foreignSql =
    table === "sms_review_queues"
      ? 'select "id" from "sms_review_queues" where "id" = ? and "user_id" is not ? limit 1'
      : 'select "id" from "sms_review_draft_items" where "queue_id" = ? and "user_id" is not ? limit 1';
  const foreign: readonly unknown[] = await db
    .get<Model>(table)
    .query(Q.unsafeSqlQuery(foreignSql, [scope.queueId, scope.ownerId]))
    .unsafeFetchRaw();
  if (foreign.length > 0) refuse("foreign_member_in_owned_queue");

  if (table === "sms_review_draft_items") {
    const ids = scope.requiredDraftIds ?? [];
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== "string" || id.length === 0)
    )
      refuse("invalid_required_original_ids");
    const owned = new Set(
      raw.map((row) => {
        if (
          typeof row !== "object" ||
          row === null ||
          Array.isArray(row) ||
          !("id" in row) ||
          typeof row.id !== "string"
        )
          return refuse("invalid_owned_physical_identity");
        return row.id;
      })
    );
    for (const requiredId of ids) {
      if (owned.has(requiredId)) continue;
      // A missing original may have been explicitly consumed by an earlier
      // proven retention transition. But a still-physical original moved to a
      // different owner/queue must refuse, even if the owned scan omitted it.
      const moved: readonly unknown[] = await db
        .get<Model>(table)
        .query(
          Q.unsafeSqlQuery(
            'select "id" from "sms_review_draft_items" where "id" = ? and ("queue_id" is not ? or "user_id" is not ?) limit 1',
            [requiredId, scope.queueId, scope.ownerId]
          )
        )
        .unsafeFetchRaw();
      if (moved.length > 0) refuse("required_original_reparented_or_foreign");
    }
  }
  const schema = db.adapter.schema.tables[table];
  if (!schema) refuse("physical_schema_missing");
  const expected = new Set([
    "id",
    "_status",
    "_changed",
    ...schema.columnArray.map((column) => column.name),
  ]);
  const physical = raw.map((row): Physical => {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      return refuse("invalid_physical_sms_record");
    const fields = Object.fromEntries(Object.entries(row));
    if (
      Object.keys(fields).length !== expected.size ||
      Object.keys(fields).some((key) => !expected.has(key)) ||
      typeof fields.id !== "string" ||
      typeof fields._changed !== "string" ||
      !["created", "updated", "synced", "deleted"].includes(
        String(fields._status)
      )
    )
      return refuse("invalid_physical_sms_columns");
    for (const column of schema.columnArray) {
      const field: unknown = fields[column.name];
      if (field === null && column.isOptional) continue;
      if (
        (column.type === "string" && typeof field !== "string") ||
        (column.type === "number" &&
          (typeof field !== "number" || !Number.isFinite(field))) ||
        (column.type === "boolean" &&
          ![0, 1, true, false].includes(field as number | boolean))
      )
        return refuse("invalid_physical_sms_value");
    }
    return sanitizedRaw(fields, schema);
  });
  await assertExpectedCurrentUser(scope.ownerId);
  return physical;
}
function numberField(row: Physical, key: string): string {
  const found = Object.entries(row).find(([name]) => name === key);
  if (
    !found ||
    typeof found[1] !== "number" ||
    !Number.isSafeInteger(found[1]) ||
    found[1] < 0
  )
    return refuse("invalid_original_unsigned");
  return String(found[1]);
}
function originalSelection(row: Physical): boolean | null {
  const value: unknown = Object.entries(row).find(
    ([key]) => key === "selection_override"
  )?.[1];
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  return refuse("invalid_original_selection");
}
function originalParsedDate(row: Physical): string {
  const raw: unknown = Object.entries(row).find(
    ([key]) => key === "parsed_at"
  )?.[1];
  if (typeof raw !== "number" || !Number.isSafeInteger(raw))
    return refuse("invalid_original_parsed_at");
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()))
    return refuse("invalid_original_parsed_at");
  return date.toISOString();
}
async function publicDraftCommitment(
  raw: Physical,
  provider: Sha256Provider
): Promise<string> {
  return provider.digestUtf8(
    serializeCanonicalJsonValue({
      id: physicalText(raw, "id"),
      queueId: physicalText(raw, "queue_id"),
      smsFingerprint: physicalText(raw, "sms_fingerprint"),
      payloadVersion: numberField(raw, "payload_version"),
      position: numberField(raw, "position"),
      selectionOverride: originalSelection(raw),
      payloadJson: physicalText(raw, "payload_json"),
      parsedAt: originalParsedDate(raw),
    })
  );
}
function availablePublicPreimage(
  entry: Extract<Draft, { retentionState: "available" }>
): CanonicalJsonValue {
  return {
    id: entry.id,
    queueId: entry.queueId,
    smsFingerprint: entry.smsFingerprint,
    payloadVersion: entry.payloadVersion,
    position: entry.position,
    selectionOverride: entry.selectionOverride,
    payloadJson: entry.payloadJson,
    parsedAt: entry.parsedAt,
  };
}

/** Exact public ↔ private membership (including independently deduped SMS).
 * The positive original preimage hash and the prepared physical postimage
 * are separate SHA-256 commitments and are never interchanged.
 */
export async function assertReviewSmsBookkeepingAuthority(input: {
  readonly database: Database;
  readonly root: VerifiedPruneReviewRoot;
  readonly ownerId: string;
  readonly hashProvider: Sha256Provider;
}): Promise<void> {
  const { payload, snapshot } = input.root;
  if (payload.source === "VOICE") {
    if (
      snapshot.queuePreimage !== null ||
      snapshot.smsDrafts.length !== 0 ||
      payload.localSmsBookkeeping.length !== 0
    )
      refuse("voice_sms_private_membership");
    return;
  }
  if (
    snapshot.ownerId !== input.ownerId ||
    !snapshot.queuePreimage ||
    snapshot.queuePreimage.id !== payload.sessionId ||
    snapshot.queuePreimage.userId !== input.ownerId
  )
    refuse("private_queue_membership_changed");
  const publicItems = payload.localSmsBookkeeping;
  if (publicItems.length !== snapshot.smsDrafts.length)
    refuse("public_private_sms_membership_changed");
  const byId = new Map(publicItems.map((entry) => [entry.draftId, entry]));
  if (byId.size !== publicItems.length) refuse("public_sms_duplicate_id");
  const matchedFinancial = new Set<string>();
  for (const entry of snapshot.smsDrafts) {
    const book = byId.get(entry.id);
    if (
      !book ||
      entry.queueId !== payload.sessionId ||
      book.queueId !== entry.queueId ||
      book.operation !== entry.operation
    )
      refuse("public_private_sms_operation_changed");
    if (entry.operation === "delete_saved") {
      const ref = payload.selectedSourceRefs.filter(
        (ref) => ref.sourceFingerprint === entry.smsFingerprint
      );
      if (ref.length > 1) refuse("financial_sms_fingerprint_duplicate");
      if (ref.length === 1) matchedFinancial.add(ref[0].rowId);
    }
    if (entry.retentionState === "available") {
      const encoded = serializeCanonicalJsonValue(
        availablePublicPreimage(entry)
      );
      if ((await input.hashProvider.digestUtf8(encoded)) !== book.snapshotHash)
        refuse("public_original_sms_hash_changed");
      const parsed = decodeSmsReviewDraftPayload({
        version: Number(entry.payloadVersion),
        json: entry.payloadJson,
        expectedFingerprint: entry.smsFingerprint,
        expectedOwnerId: input.ownerId,
        expectedSessionId: entry.queueId,
        selectionOverride: entry.selectionOverride,
      });
      if (
        parsed.review &&
        parsed.review.row.revision !== book.expectedReviewRevision
      )
        refuse("public_original_review_revision_changed");
    } else {
      // Retention redactions intentionally removed payload and selection
      // bytes. A physical deleted original can still prove its PUBLIC hash;
      // absent redacted originals cannot authorize a future deletion.
      const possible = await readPhysicalSmsRows(
        input.database,
        "sms_review_draft_items",
        {
          ownerId: input.ownerId,
          queueId: entry.queueId,
          requiredDraftIds: [entry.id],
        }
      );
      const original = possible.filter((row) => row.id === entry.id);
      if (original.length > 1) refuse("duplicate_original_physical_id");
      if (
        entry.operation === "delete_saved" &&
        original[0] &&
        original[0]._status === "deleted" &&
        (await publicDraftCommitment(original[0], input.hashProvider)) !==
          book.snapshotHash
      )
        refuse("redacted_public_original_hash_changed");
    }
  }
  if (matchedFinancial.size !== payload.selectedSourceRefs.length)
    refuse("financial_sms_selected_not_deletable");
}

/** Never silently ignore a tombstone merely because it is not in a normal
 * owner-scoped query. Unknown, foreign and replaced physical rows refuse.
 */
export async function provePrunedSmsTombstones(
  input: HistoricalPruneProofInput
): Promise<readonly SmsReviewDraftItem[]> {
  const { database, ownerId, queue, hashProvider } = input;
  if (queue.userId !== ownerId || queue._preparedState !== null)
    refuse("prune_queue_owner_or_writer_changed");
  const physicalQueue = await readPhysicalSmsRows(
    database,
    "sms_review_queues",
    {
      ownerId,
      queueId: queue.id,
    }
  );
  if (
    physicalQueue.length !== 1 ||
    !physicalQueue[0] ||
    physicalQueue[0]._status === "deleted" ||
    physicalText(physicalQueue[0], "user_id") !== ownerId ||
    !sameRaw(physicalQueue[0], queue._raw)
  )
    refuse("prune_original_queue_changed");
  const originals = new Map<string, Draft>();
  for (const root of input.roots) {
    const { payload, snapshot } = root;
    await assertReviewSmsBookkeepingAuthority({
      database,
      root,
      ownerId,
      hashProvider,
    });
    const header = snapshot.queuePreimage;
    if (payload.source !== "SMS" || !header || header.id !== queue.id) continue;
    if (header.disposition !== "present")
      refuse("prune_original_queue_not_present");
    if (
      (await hashAccountReviewLocalPostimage({
        table: "sms_review_queues",
        id: queue.id,
        raw: physicalQueue[0],
        hashProvider,
      })) !== header.expectedPostimageHash
    )
      refuse("prune_original_queue_hash_changed");
    for (const entry of snapshot.smsDrafts) {
      if (entry.operation !== "delete_saved") continue;
      const existing = originals.get(entry.id);
      if (
        existing &&
        (existing.smsFingerprint !== entry.smsFingerprint ||
          existing.expectedPostimageHash !== entry.expectedPostimageHash)
      )
        refuse("conflicting_historical_original_receipt");
      originals.set(entry.id, entry);
    }
  }
  const selected = new Map<string, SmsReviewDraftItem>();
  for (const draft of input.selectedDrafts) {
    if (
      selected.has(draft.id) ||
      draft.userId !== ownerId ||
      draft.queueId !== queue.id ||
      draft._preparedState !== null ||
      draft._raw._status === "deleted"
    )
      refuse("prune_selected_current_membership");
    selected.set(draft.id, draft);
  }
  const rows = await readPhysicalSmsRows(database, "sms_review_draft_items", {
    ownerId,
    queueId: queue.id,
    requiredDraftIds: [...originals.keys(), ...selected.keys()],
  });
  const observed = new Set<string>();
  const removable: SmsReviewDraftItem[] = [];
  for (const row of rows) {
    if (
      observed.has(row.id) ||
      physicalText(row, "user_id") !== ownerId ||
      physicalText(row, "queue_id") !== queue.id
    )
      refuse("prune_foreign_or_duplicate_physical_row");
    observed.add(row.id);
    const current = selected.get(row.id);
    if (current) {
      if (row._status === "deleted" || !sameRaw(row, current._raw))
        refuse("prune_current_draft_postimage_changed");
      continue;
    }
    const prior = originals.get(row.id);
    if (
      !prior ||
      row._status !== "deleted" ||
      physicalText(row, "sms_fingerprint") !== prior.smsFingerprint
    )
      refuse("prune_unknown_or_replaced_tombstone");
    const physicalHash = await hashAccountReviewLocalPostimage({
      table: "sms_review_draft_items",
      id: row.id,
      raw: row,
      hashProvider,
    });
    if (physicalHash !== prior.expectedPostimageHash)
      refuse("prune_sealed_tombstone_changed");
    const model = await findOwnedById(
      database.get<SmsReviewDraftItem>("sms_review_draft_items"),
      row.id,
      ownerId
    );
    if (
      model._preparedState !== null ||
      model.userId !== ownerId ||
      model.queueId !== queue.id ||
      !sameRaw(model._raw, row)
    )
      refuse("prune_hydrated_original_mismatch");
    removable.push(model);
  }
  for (const [id, entry] of originals) {
    if (!observed.has(id) && entry.retentionState === "available")
      refuse("prune_missing_original_tombstone");
  }
  if (
    rows.length !== selected.size + removable.length ||
    [...selected.keys()].some((id) => !observed.has(id))
  )
    refuse("prune_physical_membership_mismatch");
  return removable;
}

/** Terminal acceptance alone must never erase an original physical tombstone.
 * A retained carrier may be cleared only after there are no remaining device
 * rows in the same original queue with status deleted.
 */
export async function hasRetainedPhysicalTombstones(input: {
  readonly database: Database;
  readonly ownerId: string;
  readonly snapshot: AccountReviewLocalSaveSnapshot;
}): Promise<boolean> {
  if (!input.snapshot.queuePreimage) return false;
  const physical = await readPhysicalSmsRows(
    input.database,
    "sms_review_draft_items",
    {
      ownerId: input.ownerId,
      queueId: input.snapshot.queuePreimage.id,
      requiredDraftIds: input.snapshot.smsDrafts.map((entry) => entry.id),
    }
  );
  const rows = physical.filter(
    (row) =>
      row._status === "deleted" &&
      physicalText(row, "queue_id") === input.snapshot.queuePreimage?.id
  );
  // Foreign-owned tombstones must not be destroyed by this user; do not
  // clear evidence and silently orphan them in an ambiguous shared namespace.
  if (rows.some((row) => physicalText(row, "user_id") !== input.ownerId))
    refuse("terminal_foreign_original_tombstone");
  return rows.length > 0;
}

/** Accepted-only finalization of a wholly consumed original SMS queue.
 * A normal Watermelon query cannot see this original queue (all records are
 * _status=deleted). Acceptance closes compensation rights, so atomically
 * consume exactly sealed original tombstones and then clear the private root.
 * Return null when an active/partial queue still needs its retained proof.
 */
export async function proveAcceptedTerminalSmsCleanup(input: {
  readonly database: Database;
  readonly ownerId: string;
  readonly payload: ReviewBatchSavePayload;
  readonly snapshot: AccountReviewLocalSaveSnapshot;
  readonly hashProvider: Sha256Provider;
}): Promise<readonly Model[] | null> {
  const { database, ownerId, payload, snapshot, hashProvider } = input;
  if (payload.source !== "SMS" || snapshot.queuePreimage === null) return [];
  const queue = snapshot.queuePreimage;
  if (queue.disposition !== "pruned_empty") {
    return (await hasRetainedPhysicalTombstones({
      database,
      ownerId,
      snapshot,
    }))
      ? null
      : [];
  }
  const physicalQueues = await readPhysicalSmsRows(
    database,
    "sms_review_queues",
    { ownerId, queueId: queue.id }
  );
  const physicalDrafts = await readPhysicalSmsRows(
    database,
    "sms_review_draft_items",
    {
      ownerId,
      queueId: queue.id,
      requiredDraftIds: snapshot.smsDrafts.map((entry) => entry.id),
    }
  );
  if (physicalQueues.length === 0) {
    if (physicalDrafts.length > 0) refuse("terminal_orphaned_original_draft");
    return [];
  }
  const queued = physicalQueues[0];
  if (
    physicalQueues.length !== 1 ||
    !queued ||
    queued._status !== "deleted" ||
    physicalText(queued, "user_id") !== ownerId ||
    (await hashAccountReviewLocalPostimage({
      table: "sms_review_queues",
      id: queue.id,
      raw: queued,
      hashProvider,
    })) !== queue.expectedPostimageHash
  )
    refuse("terminal_original_queue_postimage_changed");
  const expected = new Map(
    snapshot.smsDrafts.map((entry) => [entry.id, entry])
  );
  const bookkeeping = new Map(
    payload.localSmsBookkeeping.map((entry) => [entry.draftId, entry])
  );
  const consumed: Model[] = [];
  const observed = new Set<string>();
  for (const raw of physicalDrafts) {
    if (
      observed.has(raw.id) ||
      raw._status !== "deleted" ||
      physicalText(raw, "user_id") !== ownerId
    )
      refuse("terminal_unknown_original_sms");
    observed.add(raw.id);
    const entry = expected.get(raw.id);
    const publicRow = bookkeeping.get(raw.id);
    if (
      !entry ||
      !publicRow ||
      entry.operation !== "delete_saved" ||
      publicRow.operation !== "delete_saved" ||
      entry.retentionState !== "available" ||
      entry.smsFingerprint !== physicalText(raw, "sms_fingerprint") ||
      (await publicDraftCommitment(raw, hashProvider)) !==
        publicRow.snapshotHash ||
      (await hashAccountReviewLocalPostimage({
        table: "sms_review_draft_items",
        id: raw.id,
        raw,
        hashProvider,
      })) !== entry.expectedPostimageHash
    )
      refuse("terminal_unverified_original_sms");
    const model = await findOwnedById(
      database.get<SmsReviewDraftItem>("sms_review_draft_items"),
      raw.id,
      ownerId
    );
    if (
      model._preparedState !== null ||
      model.userId !== ownerId ||
      !sameRaw(model._raw, raw)
    )
      refuse("terminal_original_cache_changed");
    consumed.push(model);
  }
  if (
    expected.size !== observed.size ||
    [...expected.keys()].some((id) => !observed.has(id))
  )
    refuse("terminal_original_sms_membership_changed");
  const queueModel = await findOwnedById(
    database.get<SmsReviewQueue>("sms_review_queues"),
    queue.id,
    ownerId
  );
  if (
    queueModel._preparedState !== null ||
    queueModel.userId !== ownerId ||
    !sameRaw(queueModel._raw, queued)
  )
    refuse("terminal_original_queue_cache_changed");
  return [...consumed, queueModel];
}
