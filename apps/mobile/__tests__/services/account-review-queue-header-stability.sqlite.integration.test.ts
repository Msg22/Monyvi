/**
 * #395 queue header conservation — real WatermelonDB/SQLite, canonical
 * review commands, published SMS merge and undo/restore. TESTS FIRST, NOT RUN.
 * Device-local queue header is the original financial recovery preimage;
 * draft-level edits advance freshness without rebasing that commitment.
 */
import { createHash } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type { SmsReviewDraftItem, SmsReviewQueue } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  makeT025StoredReview,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import { encodeSmsReviewDraftV2 } from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  confirmedCommand,
  selectCommand,
} from "./account-review-t029-test-builders";
import {
  database,
  adapter,
  OWNER,
  acquire,
  release,
  draftItems,
  installSmsReviewSqliteHooks,
} from "./sms-review-namespace-test-harness";
import {
  mergeSmsReviewDrafts,
  discardSmsReviewDraft,
  restoreSmsReviewDraft,
  getSmsReviewDraftQueueSnapshot,
} from "@/services/sms-review-draft-repository";
import { executeSmsAccountReviewCommand } from "@/services/account-review-command-service";
import { hashAccountReviewLocalPostimage } from "@/services/account-review-local-snapshot-postimages";
import {
  bindSmsReviewNamespaceCandidates,
  bindSmsReviewNamespacePublishedSession,
} from "@/services/sms-review-namespace-state";

const { __modelClasses: modelClasses } = jest.requireMock<{
  readonly __modelClasses: Array<typeof Model>;
}>("@monyvi/db");
const OLD_DRAFT_TIME = new Date("2026-10-10T12:00:00.000Z");
// Receipt/candidate lineage is object-identity bound in a WeakMap. Keep the
// same objects within each current Review, but never replay a retired prior
// test's published source objects into a new namespace.
let originals: ParsedSmsTransaction[] = [];

async function sqliteReopen(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(),
    modelClasses,
  });
}

async function ownedQueue(
  source: Database = database
): Promise<SmsReviewQueue> {
  const rows = await source
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", OWNER))
    .fetch();
  if (rows.length !== 1 || !rows[0])
    throw new Error("missing_exact_owned_queue");
  return rows[0];
}

/** Original full physical header, INCLUDING Watermelon sync fields. */
function fullHeader(queue: SmsReviewQueue): string {
  return JSON.stringify(
    Object.entries(queue._raw).sort(([a], [b]) => a.localeCompare(b))
  );
}

async function originalQueueHash(queue: SmsReviewQueue): Promise<string> {
  return hashAccountReviewLocalPostimage({
    table: "sms_review_queues",
    id: queue.id,
    raw: queue._raw,
    hashProvider: {
      digestUtf8: (input: string): Promise<string> =>
        Promise.resolve(createHash("sha256").update(input).digest("hex")),
    },
  });
}

async function seedExistingQueue(): Promise<SmsReviewQueue> {
  const merge = await mergeSmsReviewDrafts({
    expectedUserId: OWNER,
    transactions: originals,
    parsedAt: OLD_DRAFT_TIME,
  });
  expect(merge.insertedCount).toBe(2);
  const queue = await ownedQueue();
  const drafts = await draftItems(OWNER);
  expect(drafts).toHaveLength(2);
  // Historical original metadata is captured using a genuine SQLite writer.
  await database.write(() =>
    database.batch(
      queue.prepareUpdate((item) => {
        item.updatedAt = OLD_DRAFT_TIME;
      }),
      ...drafts.map((draft) =>
        draft.prepareUpdate((item) => {
          item.updatedAt = OLD_DRAFT_TIME;
        })
      )
    )
  );
  return queue;
}

async function seedCanonicalReview(): Promise<{
  readonly queue: SmsReviewQueue;
  readonly session: ReturnType<typeof makeT025ReviewSession>;
}> {
  const queue = await seedExistingQueue();
  const drafts = [...(await draftItems(OWNER))].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const sorted = [...originals].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const session = makeT025ReviewSession(
    queue.id,
    sorted,
    drafts.map((item) => item.id)
  );
  await database.write(() =>
    database.batch(
      ...drafts.map((draft, index) => {
        const transaction = sorted[index];
        const row = session.rows[index];
        if (!transaction || !row) throw new Error("invalid_canonical_source");
        const encoded = encodeSmsReviewDraftV2({
          transaction,
          review: makeT025StoredReview(session, row.rowId),
        });
        return draft.prepareUpdate((item) => {
          item.payloadVersion = encoded.version;
          item.payloadJson = encoded.json;
          item.selectionOverride = false;
          item.updatedAt = OLD_DRAFT_TIME;
        });
      })
    )
  );
  return { queue, session };
}

installSmsReviewSqliteHooks();
beforeEach(() => {
  // Fresh canonical parser-source identities for the current owned queue and
  // lease. Published tests bind and merge THESE same objects, not stale ones.
  originals = [makeT025SmsOriginal(0), makeT025SmsOriginal(1)];
});

describe("#395 durable original SMS queue header with draft-only freshness", () => {
  it("preserves full queue bytes on merge of fresh and baseline-enriched drafts; freshness follows draft timestamps", async () => {
    const queue = await seedExistingQueue();
    const original = fullHeader(queue);
    const originalHash = await originalQueueHash(queue);
    const enhanced = {
      ...originals[0],
      categoryDisplayName: "Changed merchant",
    };
    const incoming: ParsedSmsTransaction = {
      ...originals[1],
      smsFingerprint: "c".repeat(64),
      rawSmsBody: "QNB next purchase EGP 25",
    };
    const outcome = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: [enhanced, incoming],
      baselineTransactions: [originals[0]],
      parsedAt: OLD_DRAFT_TIME,
    });
    expect(outcome.insertedCount).toBe(1);
    const fresh = await sqliteReopen();
    const persistedQueue = await ownedQueue(fresh);
    expect(fullHeader(persistedQueue)).toBe(original);
    expect(await originalQueueHash(persistedQueue)).toBe(originalHash);
    const drafts = await draftItems(OWNER);
    expect(drafts).toHaveLength(3);
    const updated = drafts.find(
      (item) => item.smsFingerprint === enhanced.smsFingerprint
    );
    if (!updated) throw new Error("missing_actual_refreshed_draft");
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      OLD_DRAFT_TIME.getTime()
    );
    expect(updated.payloadJson).toContain("Changed merchant");
    const snapshot = await getSmsReviewDraftQueueSnapshot(OWNER);
    expect(snapshot?.latestUpdatedAt.getTime()).toBe(
      Math.max(
        persistedQueue.updatedAt.getTime(),
        ...drafts.map((item) => item.updatedAt.getTime())
      )
    );
  });

  it("retains original partial-Save queue hash through genuine confirm then selectLast and SQLite reopen", async () => {
    const { queue, session } = await seedCanonicalReview();
    const original = fullHeader(queue);
    const originalHash = await originalQueueHash(queue);
    const confirmed = await executeSmsAccountReviewCommand({
      queueId: queue.id,
      command: confirmedCommand(session),
      accountSnapshots: makeOwnedContext(),
    });
    expect(confirmed.effect).toBe("persist_sms");
    expect(fullHeader(queue)).toBe(original);
    const selectLast = confirmed.state.rows[confirmed.state.rows.length - 1];
    if (!selectLast) throw new Error("missing_real_last_review_row");
    const selected = await executeSmsAccountReviewCommand({
      queueId: queue.id,
      command: selectCommand(confirmed.state, selectLast.rowId),
      accountSnapshots: makeOwnedContext(),
    });
    expect(selected.effect).toBe("persist_sms");
    expect(
      selected.state.rows.filter((row) => row.selected).map((row) => row.rowId)
    ).toEqual([selectLast.rowId]);
    const reopened = await sqliteReopen();
    const durableQueue = await ownedQueue(reopened);
    expect(fullHeader(durableQueue)).toBe(original);
    expect(await originalQueueHash(durableQueue)).toBe(originalHash);
    expect(durableQueue._raw._status).toBe(queue._raw._status);
    expect(durableQueue._raw._changed).toBe(queue._raw._changed);
    const persisted = await reopened
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query(Q.where("user_id", OWNER))
      .fetch();
    expect(persisted).toHaveLength(2);
    expect(
      persisted.some(
        (item) => item.updatedAt.getTime() > OLD_DRAFT_TIME.getTime()
      )
    ).toBe(true);
    const snapshot = await getSmsReviewDraftQueueSnapshot(OWNER);
    expect(snapshot?.latestUpdatedAt.getTime()).toBe(
      Math.max(
        queue.updatedAt.getTime(),
        ...persisted.map((item) => item.updatedAt.getTime())
      )
    );
  });

  it("preserves the original queue during genuine published-session V2 promotion", async () => {
    const queue = await seedExistingQueue();
    const header = fullHeader(queue);
    const originalRaw = { ...queue._raw };
    const originalHash = await originalQueueHash(queue);
    const drafts = [...(await draftItems(OWNER))].sort((a, b) =>
      a.smsFingerprint.localeCompare(b.smsFingerprint)
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.every((draft) => draft.payloadVersion === 1)).toBe(true);
    // Capture primitive preimages; Watermelon prepares updates on cached models.
    const originalDraftBytes = drafts.map((draft) => ({
      id: draft.id,
      payloadJson: draft.payloadJson,
    }));
    const submitted = [...originals].sort((a, b) =>
      a.smsFingerprint.localeCompare(b.smsFingerprint)
    );
    const session = makeT025ReviewSession(
      queue.id,
      submitted,
      drafts.map((draft) => draft.id)
    );
    const lease = await acquire(OWNER);
    bindSmsReviewNamespaceCandidates(lease, submitted);
    await release(lease, "published");
    bindSmsReviewNamespacePublishedSession(lease, session);
    const result = await mergeSmsReviewDrafts({
      expectedUserId: OWNER,
      transactions: submitted,
      baselineTransactions: submitted,
      reviewSession: session,
      parsedAt: OLD_DRAFT_TIME,
    });
    expect(result.insertedCount).toBe(0);
    expect(result.existingCount).toBe(2);

    const reopened = await sqliteReopen();
    const persistedQueue = await ownedQueue(reopened);
    expect(fullHeader(queue)).toBe(header);
    expect(fullHeader(persistedQueue)).toBe(header);
    expect(persistedQueue._raw).toEqual(originalRaw);
    expect(persistedQueue._raw._status).toBe(originalRaw._status);
    expect(persistedQueue._raw._changed).toBe(originalRaw._changed);
    expect(await originalQueueHash(persistedQueue)).toBe(originalHash);
    const persisted = await reopened
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query(Q.where("user_id", OWNER))
      .fetch();
    expect(persisted).toHaveLength(2);
    expect(persisted.map((draft) => draft.id).sort()).toEqual(
      drafts.map((draft) => draft.id).sort()
    );
    expect(
      persisted.every(
        (draft) =>
          draft.payloadVersion === 2 &&
          draft.payloadJson.includes('"review"') &&
          draft.updatedAt.getTime() > OLD_DRAFT_TIME.getTime() &&
          originalDraftBytes.some(
            (prior) =>
              prior.id === draft.id && prior.payloadJson !== draft.payloadJson
          )
      )
    ).toBe(true);
    const snapshot = await getSmsReviewDraftQueueSnapshot(OWNER);
    expect(snapshot?.itemCount).toBe(2);
    expect(snapshot?.latestUpdatedAt.getTime()).toBe(
      Math.max(
        persistedQueue.updatedAt.getTime(),
        ...persisted.map((draft) => draft.updatedAt.getTime())
      )
    );
  });

  it("restores a genuinely discarded draft into the existing queue without changing original header", async () => {
    const queue = await seedExistingQueue();
    const original = fullHeader(queue);
    const originalHash = await originalQueueHash(queue);
    const draft = (await draftItems(OWNER))[0];
    if (!draft) throw new Error("missing_original_draft_to_discard");
    const undo = await discardSmsReviewDraft(draft.id, OWNER);
    expect(await draftItems(OWNER)).toHaveLength(1);
    expect(fullHeader(await ownedQueue())).toBe(original);
    await restoreSmsReviewDraft(undo);
    const fresh = await sqliteReopen();
    const durableQueue = await ownedQueue(fresh);
    expect(fullHeader(durableQueue)).toBe(original);
    expect(await originalQueueHash(durableQueue)).toBe(originalHash);
    const restored = await fresh
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query(Q.where("user_id", OWNER))
      .fetch();
    expect(restored).toHaveLength(2);
    const revived = restored.find(
      (item) => item.smsFingerprint === undo.smsFingerprint
    );
    if (!revived) throw new Error("original_draft_not_restored");
    expect(revived.updatedAt.getTime()).toBeGreaterThan(
      OLD_DRAFT_TIME.getTime()
    );
    expect(revived.position).toBe(undo.position);
  });
});
