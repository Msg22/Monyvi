/**
 * #395 T029 TESTS FIRST: ephemeral Undo is bound to an authenticated review
 * lifetime, not merely the same persisted owner/queue/reducer generation.
 *
 * Uses the existing real SQLite namespace harness, published auth callback,
 * canonical SMS v2 codec, reducer and command writer. The logout/reauth tests
 * are intended RED until the command service revokes its stale WeakMap lease.
 * No production source, mock successful writer, or private WeakMap access.
 */
import { type Database, type Model } from "@nozbe/watermelondb";
import type { SmsReviewDraftItem, SmsReviewQueue } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import type { Session } from "@supabase/supabase-js";
import {
  accountReviewCommandSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/schemas";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  decodeSmsReviewDraftPayload,
  encodeSmsReviewDraftV2,
} from "../../../../packages/logic/src/sms-review-drafts/sms-review-draft-codec";
import {
  makeT025ReviewSession,
  makeT025SmsOriginal,
  makeT025StoredReview,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import {
  database,
  adapter,
  OWNER,
  FOREIGN,
  acquire,
  draftItems,
  emitSignOut,
  installSmsReviewSqliteHooks,
  ownedQueues,
  release,
  setCurrentUser,
} from "./sms-review-namespace-test-harness";
import {
  captureSmsReviewNamespaceEpoch,
  observeSmsReviewNamespaceActor,
} from "@/services/sms-review-namespace-state";
import {
  discardAllSmsReviewDrafts,
  mergeSmsReviewDrafts,
} from "@/services/sms-review-draft-repository";
import { executeSmsAccountReviewCommand } from "@/services/account-review-command-service";

const { __modelClasses: modelClasses } = jest.requireMock<{
  readonly __modelClasses: Array<typeof Model>;
}>("@monyvi/db");
const NEW_UNDO_TOKEN = "00000000-0000-4000-8000-000000007654";
const REPLACEMENT_FINGERPRINT = "t029-lifecycle-replacement-001";
const TABLES = [
  "sms_review_queues",
  "sms_review_draft_items",
  "dismissed_sms_fingerprints",
  "accounts",
  "categories",
  "transactions",
  "transfers",
];

interface SeededReview {
  readonly queue: SmsReviewQueue;
  readonly session: AccountReviewSession;
  readonly drafts: readonly SmsReviewDraftItem[];
}
type CommandResult = Awaited<ReturnType<typeof executeSmsAccountReviewCommand>>;
type CoordinatedAuthListener = Parameters<
  (typeof import("@/services/supabase"))["subscribeToCoordinatedAuthStateChange"]
>[0];

async function seedCanonicalReview(
  originals: readonly ParsedSmsTransaction[] = [
    makeT025SmsOriginal(0),
    makeT025SmsOriginal(1),
  ]
): Promise<SeededReview> {
  const parsedAt = new Date("2026-10-14T12:00:00.000Z");
  const merge = await mergeSmsReviewDrafts({
    expectedUserId: OWNER,
    transactions: originals,
    parsedAt,
  });
  expect(merge.insertedCount).toBe(originals.length);
  const queues = await ownedQueues(OWNER);
  expect(queues).toHaveLength(1);
  const queue = queues[0];
  if (!queue) throw new Error("Expected real owned queue");
  const drafts = [...(await draftItems(OWNER))].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const ordered = [...originals].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  if (drafts.length !== ordered.length)
    throw new Error("Expected exact fingerprint-to-draft membership");
  const session = makeT025ReviewSession(
    queue.id,
    ordered,
    drafts.map((draft) => draft.id)
  );
  await database.write(() =>
    database.batch(
      ...drafts.map((draft, index) => {
        const original = ordered[index];
        const row = session.rows[index];
        if (!original || !row) throw new Error("Missing canonical source row");
        const payload = encodeSmsReviewDraftV2({
          transaction: original,
          review: makeT025StoredReview(session, row.rowId),
        });
        return draft.prepareUpdate((item) => {
          item.payloadVersion = payload.version;
          item.payloadJson = payload.json;
          item.selectionOverride = false;
        });
      })
    )
  );
  return { queue, session, drafts };
}

function removeGroupCommand(
  session: AccountReviewSession
): AccountReviewCommand {
  const group = session.groups[0];
  if (!group) throw new Error("Expected pending canonical group");
  return accountReviewCommandSchema.parse({
    kind: "remove_group",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    groupId: group.groupId,
    expectedGroupRevision: group.revision,
  });
}

function undoCommand(
  session: AccountReviewSession,
  token: string
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    kind: "undo_removal",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    undoToken: token,
  });
}

function execute(
  queueId: string,
  command: AccountReviewCommand,
  nextUndoToken: string | null = null
): ReturnType<typeof executeSmsAccountReviewCommand> {
  return executeSmsAccountReviewCommand({
    queueId,
    command,
    accountSnapshots: makeOwnedContext(),
    nextUndoToken,
  });
}

async function removeWithUndo(
  seeded: SeededReview,
  token: string = T025_IDS.undoToken
): Promise<CommandResult> {
  const result = await execute(
    seeded.queue.id,
    removeGroupCommand(seeded.session),
    token
  );
  expect(result.effect).toBe("persist_sms");
  expect(result.reasonCodes).toEqual([]);
  expect(result.undoToken).toBe(token);
  expect(result.state.groups[0]?.status).toBe("removed");
  expect(result.state.removedEvidenceKeys).toContain(T025_IDS.evidenceKey);
  return result;
}

async function freshSqlite(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(),
    modelClasses,
  });
}

async function physicalPreimages(): Promise<
  ReadonlyArray<Readonly<{ table: string; records: readonly string[] }>>
> {
  const fresh = await freshSqlite();
  return Promise.all(
    TABLES.map(async (table) => {
      const models = await fresh.get<Model>(table).query().fetch();
      const records = models
        .map((model) =>
          JSON.stringify(
            Object.entries(model._raw).sort(([a], [b]) =>
              a < b ? -1 : a > b ? 1 : 0
            )
          )
        )
        .sort();
      return { table, records };
    })
  );
}

function currentModelPreimages(
  queue: SmsReviewQueue,
  drafts: readonly SmsReviewDraftItem[]
): readonly string[] {
  return [queue, ...drafts].map((model) =>
    JSON.stringify(
      Object.entries(model._raw).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0
      )
    )
  );
}

async function expectInvalidUndoWithoutWrites(
  seeded: SeededReview,
  removed: CommandResult,
  token: string
): Promise<void> {
  const before = await physicalPreimages();
  const cachedBefore = currentModelPreimages(seeded.queue, seeded.drafts);
  const result = await execute(
    seeded.queue.id,
    undoCommand(removed.state, token)
  );
  expect(result).toMatchObject({
    effect: "none",
    reasonCodes: ["review_undo_invalid"],
    affectedGroupIds: [],
    affectedRowIds: [],
    undoToken: null,
  });
  expect(result.state.groups[0]?.status).toBe("removed");
  expect(result.state.removedEvidenceKeys).toContain(T025_IDS.evidenceKey);
  expect(await physicalPreimages()).toEqual(before);
  expect(currentModelPreimages(seeded.queue, seeded.drafts)).toEqual(
    cachedBefore
  );
}

function writerBarrier(): {
  readonly entered: Promise<void>;
  readonly hold: Promise<void>;
  readonly signalEntered: () => void;
  readonly release: () => void;
} {
  let signalEntered = (): void => {};
  let release = (): void => {};
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { entered, hold, signalEntered, release };
}

/**
 * Wrap only the existing coordinated-auth callback boundary, never the
 * reducer, SQLite writer or transient Undo storage. Counts active listeners
 * by their actual unsubscribe contract, including after an injected failure.
 */
function observeAuthSubscriptions(
  failFirst = false
): Set<CoordinatedAuthListener> {
  const auth = jest.requireMock<typeof import("@/services/supabase")>(
    "@/services/supabase"
  );
  const subscribe = auth.subscribeToCoordinatedAuthStateChange;
  const active = new Set<CoordinatedAuthListener>();
  let failNext = failFirst;
  jest
    .spyOn(auth, "subscribeToCoordinatedAuthStateChange")
    .mockImplementation((callback) => {
      if (failNext) {
        failNext = false;
        throw new Error("t029_undo_auth_listener_registration_failed");
      }
      const result = subscribe(callback);
      const actual = result.data.subscription;
      active.add(callback);
      return {
        data: {
          subscription: {
            ...actual,
            unsubscribe: (): void => {
              active.delete(callback);
              actual.unsubscribe();
            },
          },
        },
      };
    });
  return active;
}

installSmsReviewSqliteHooks();

describe("#395 T029 transient Undo authority across real auth lifetimes", () => {
  it("U01 preserves normal same-session remove/Undo, restoring the exact group once", async () => {
    const seeded = await seedCanonicalReview();
    const removed = await removeWithUndo(seeded);
    const restored = await execute(
      seeded.queue.id,
      undoCommand(removed.state, T025_IDS.undoToken)
    );
    expect(restored.effect).toBe("persist_sms");
    expect(restored.reasonCodes).toEqual([]);
    expect(restored.undoToken).toBeNull();
    expect(restored.state.groups[0]?.status).toBe("pending");
    expect(restored.state.removedEvidenceKeys).toEqual([]);
    const fresh = await freshSqlite();
    const restoredDrafts = await fresh
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .query()
      .fetch();
    expect(restoredDrafts).toHaveLength(2);
    for (const draft of restoredDrafts) {
      const decoded = decodeSmsReviewDraftPayload({
        version: draft.payloadVersion,
        json: draft.payloadJson,
        expectedFingerprint: draft.smsFingerprint,
        expectedOwnerId: OWNER,
        expectedSessionId: seeded.queue.id,
        selectionOverride: draft.selectionOverride,
      });
      expect(decoded.review?.groups[0]?.status).toBe("pending");
      expect(decoded.review?.removedEvidenceKeys).toEqual([]);
      expect(draft.payloadJson).not.toContain(T025_IDS.undoToken);
    }
  });

  it("U02 rejects pre-logout Undo after same-owner reauth on the identical cached queue", async () => {
    const seeded = await seedCanonicalReview();
    const lease = await acquire(OWNER);
    expect(lease.queueId).toBe(seeded.queue.id);
    const removed = await removeWithUndo(seeded);
    const before = await physicalPreimages();
    const epoch = captureSmsReviewNamespaceEpoch();
    emitSignOut();
    expect(captureSmsReviewNamespaceEpoch()).not.toBe(epoch);
    setCurrentUser(OWNER);
    expect((await ownedQueues(OWNER))[0]).toBe(seeded.queue);
    expect(await physicalPreimages()).toEqual(before);
    await expectInvalidUndoWithoutWrites(seeded, removed, T025_IDS.undoToken);
    await release(lease, "cancelled");
  });

  it("U03 rejects owner A's old token after signed-out A → B → signed-out B → A", async () => {
    const seeded = await seedCanonicalReview();
    const leaseA = await acquire(OWNER);
    const removed = await removeWithUndo(seeded);
    const before = await physicalPreimages();
    emitSignOut();
    setCurrentUser(FOREIGN);
    const leaseB = await acquire(FOREIGN);
    expect(leaseB.expectedUserId).toBe(FOREIGN);
    await release(leaseB, "cancelled");
    emitSignOut();
    setCurrentUser(OWNER);
    observeSmsReviewNamespaceActor(OWNER);
    expect((await ownedQueues(OWNER))[0]).toBe(seeded.queue);
    expect(await physicalPreimages()).toEqual(before);
    await expectInvalidUndoWithoutWrites(seeded, removed, T025_IDS.undoToken);
    await release(leaseA, "cancelled");
  });

  it("U04 refuses a queued old Undo if logout and reauth complete while the real writer is blocked", async () => {
    const seeded = await seedCanonicalReview();
    const lease = await acquire(OWNER);
    const removed = await removeWithUndo(seeded);
    const before = await physicalPreimages();
    const cacheBefore = currentModelPreimages(seeded.queue, seeded.drafts);
    const barrier = writerBarrier();
    const blocker = database.write(async (): Promise<void> => {
      barrier.signalEntered();
      await barrier.hold;
    });
    await barrier.entered;
    const pending = execute(
      seeded.queue.id,
      undoCommand(removed.state, T025_IDS.undoToken)
    );
    emitSignOut();
    setCurrentUser(OWNER);
    barrier.release();
    try {
      const result = await pending;
      expect(result.effect).toBe("none");
      expect(result.reasonCodes).toEqual(["review_undo_invalid"]);
      expect(result.state.groups[0]?.status).toBe("removed");
      expect(await physicalPreimages()).toEqual(before);
      expect(currentModelPreimages(seeded.queue, seeded.drafts)).toEqual(
        cacheBefore
      );
    } finally {
      barrier.release();
      await blocker;
      await release(lease, "cancelled");
    }
  });

  it("U05 old Undo cannot cross real queue disposal/replacement; replacement uses its own token", async () => {
    const original = await seedCanonicalReview();
    const removed = await removeWithUndo(original);
    const ids = (await draftItems(OWNER)).map((draft) => draft.id);
    expect(await discardAllSmsReviewDrafts(OWNER, original.queue.id, ids)).toBe(
      ids.length
    );
    expect(await ownedQueues(OWNER)).toHaveLength(0);
    const nextLease = await acquire(OWNER);
    expect(nextLease.queueId).not.toBe(original.queue.id);
    const replacementSource: ParsedSmsTransaction = {
      ...makeT025SmsOriginal(0),
      smsFingerprint: REPLACEMENT_FINGERPRINT,
    };
    const replacement = await seedCanonicalReview([replacementSource]);
    expect(replacement.queue.id).toBe(nextLease.queueId);
    const nextRemoval = await removeWithUndo(replacement, NEW_UNDO_TOKEN);
    await expectInvalidUndoWithoutWrites(
      replacement,
      nextRemoval,
      T025_IDS.undoToken
    );
    const restored = await execute(
      replacement.queue.id,
      undoCommand(nextRemoval.state, NEW_UNDO_TOKEN)
    );
    expect(restored.effect).toBe("persist_sms");
    expect(restored.reasonCodes).toEqual([]);
    await release(nextLease, "cancelled");
    expect(removed.state.groups[0]?.status).toBe("removed");
  });

  it("U06 rejects old Undo after logout when the populated queue has no active namespace lifetime listener", async () => {
    const seeded = await seedCanonicalReview();
    const lease = await acquire(OWNER);
    await release(lease, "cancelled");
    expect((await ownedQueues(OWNER))[0]).toBe(seeded.queue);
    const removed = await removeWithUndo(seeded);
    // The queued review remains locally durable after lease completion.
    // A namespace-only epoch listener is no longer attached here.
    emitSignOut();
    setCurrentUser(OWNER);
    await expectInvalidUndoWithoutWrites(seeded, removed, T025_IDS.undoToken);
  });

  it("U07 same-owner actor observation (token-refresh branch) retains current Undo and auth epoch", async () => {
    const seeded = await seedCanonicalReview();
    const lease = await acquire(OWNER);
    const removed = await removeWithUndo(seeded);
    const beforeEpoch = captureSmsReviewNamespaceEpoch();
    observeSmsReviewNamespaceActor(OWNER);
    expect(captureSmsReviewNamespaceEpoch()).toBe(beforeEpoch);
    expect((await ownedQueues(OWNER))[0]).toBe(seeded.queue);
    const restored = await execute(
      seeded.queue.id,
      undoCommand(removed.state, T025_IDS.undoToken)
    );
    expect(restored.effect).toBe("persist_sms");
    expect(restored.reasonCodes).toEqual([]);
    expect(restored.state.groups[0]?.status).toBe("pending");
    await release(lease, "cancelled");
  });

  it("U08 direct TOKEN_REFRESHED callback preserves current Undo without minting new authority", async () => {
    const seeded = await seedCanonicalReview();
    const active = observeAuthSubscriptions();
    const removed = await removeWithUndo(seeded);
    expect(active.size).toBe(1);
    const refreshed: Session = {
      access_token: "t029-same-owner-refresh",
      refresh_token: "t029-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: OWNER,
        aud: "authenticated",
        role: "authenticated",
        email: "review-fixture@example.com",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-10-16T00:00:00.000Z",
      },
    };
    for (const listener of [...active]) listener("TOKEN_REFRESHED", refreshed);
    expect(active.size).toBe(1);
    const restored = await execute(
      seeded.queue.id,
      undoCommand(removed.state, T025_IDS.undoToken)
    );
    expect(restored.effect).toBe("persist_sms");
    expect(restored.reasonCodes).toEqual([]);
    expect(restored.state.groups[0]?.status).toBe("pending");
    expect(active.size).toBe(0);
  });

  it("U09 real queue disposal revokes the idle Undo auth listener after scoped namespace invalidation", async () => {
    const seeded = await seedCanonicalReview();
    const active = observeAuthSubscriptions();
    await removeWithUndo(seeded);
    expect(active.size).toBe(1);
    const confirmedIds = (await draftItems(OWNER)).map((draft) => draft.id);
    expect(
      await discardAllSmsReviewDrafts(OWNER, seeded.queue.id, confirmedIds)
    ).toBe(confirmedIds.length);
    expect(await ownedQueues(OWNER)).toHaveLength(0);
    expect(await draftItems(OWNER)).toHaveLength(0);
    expect(active.size).toBe(0);
  });

  it("U10 synchronous auth subscription failure rolls back lifetime ownership and lets a valid command recover", async () => {
    const seeded = await seedCanonicalReview();
    const active = observeAuthSubscriptions(true);
    const before = await physicalPreimages();
    const cached = currentModelPreimages(seeded.queue, seeded.drafts);
    await expect(
      execute(
        seeded.queue.id,
        removeGroupCommand(seeded.session),
        T025_IDS.undoToken
      )
    ).rejects.toThrow("t029_undo_auth_listener_registration_failed");
    expect(active.size).toBe(0);
    expect(await physicalPreimages()).toEqual(before);
    expect(currentModelPreimages(seeded.queue, seeded.drafts)).toEqual(cached);
    const removed = await removeWithUndo(seeded);
    expect(active.size).toBe(1);
    const restored = await execute(
      seeded.queue.id,
      undoCommand(removed.state, T025_IDS.undoToken)
    );
    expect(restored.effect).toBe("persist_sms");
    expect(restored.reasonCodes).toEqual([]);
    expect(restored.state.groups[0]?.status).toBe("pending");
    expect(active.size).toBe(0);
  });
});
