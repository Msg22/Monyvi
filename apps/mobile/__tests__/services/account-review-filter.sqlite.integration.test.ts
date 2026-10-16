/**
 * #395 T054 — TESTS-FIRST genuine SMS SQLite filter header/Undo writer.
 * Auth and the native constructor are test-controlled. The real
 * executeSmsAccountReviewCommand, reducer, V2 codec, namespace repo,
 * read-model and SQLite adapter are NEVER mocked.
 *
 * NOT RUN: source contract for set_filter and ten-field V2 is intentionally
 * missing at this immutable parent; Root owns creation/behavioral Red.
 */
import {
  Q, type Database, type Model,
} from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type {
  SmsReviewDraftItem,
  SmsReviewQueue,
  Transaction,
} from "@monyvi/db";
import {
  accountReviewCommandSchema,
  type AccountReviewCommand,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
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
import { makeOwnedContext } from
  "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import {
  rehydrateOwnedSmsReviewGraph,
} from "@/services/account-review-command-snapshots";
import {
  executeSmsAccountReviewCommand,
} from "@/services/account-review-command-service";
import { mergeSmsReviewDrafts } from "@/services/sms-review-draft-repository";
import {
  seedCapturedSmsReviewContext,
} from "./sms-review-real-sqlite-fixture";

interface SqliteModules {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}
let mockCurrentUserId: AccountReviewSession["ownerId"] = T025_IDS.owner;
let nextGeneratedId = 54600;
type AuthCallback = Parameters<
  (typeof import("@/services/supabase"))["subscribeToCoordinatedAuthStateChange"]
>[0];
const mockAuthListeners = new Set<AuthCallback>();

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): unknown => {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const records = [
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/SmsReviewQueue")
    >("../../../../packages/db/src/models/SmsReviewQueue").SmsReviewQueue,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/SmsReviewDraftItem")
    >("../../../../packages/db/src/models/SmsReviewDraftItem").SmsReviewDraftItem,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/DismissedSmsFingerprint")
    >("../../../../packages/db/src/models/DismissedSmsFingerprint").DismissedSmsFingerprint,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Transaction")
    >("../../../../packages/db/src/models/Transaction").Transaction,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Transfer")
    >("../../../../packages/db/src/models/Transfer").Transfer,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Account")
    >("../../../../packages/db/src/models/Account").Account,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/BankDetails")
    >("../../../../packages/db/src/models/BankDetails").BankDetails,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/AccountSmsSender")
    >("../../../../packages/db/src/models/AccountSmsSender").AccountSmsSender,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Profile")
    >("../../../../packages/db/src/models/Profile").Profile,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/Category")
    >("../../../../packages/db/src/models/Category").Category,
  ];
  const adapter = new Adapter({ schema });
  return {
    database: new WatermelonDatabase({ adapter, modelClasses: records }),
    __adapter: adapter,
    __modelClasses: records,
    SmsReviewQueue: records[0], SmsReviewDraftItem: records[1],
    DismissedSmsFingerprint: records[2], Transaction: records[3],
    Transfer: records[4], Account: records[5],
    BankDetails: records[6], AccountSmsSender: records[7],
    Profile: records[8], Category: records[9],
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentUserId),
  subscribeToCoordinatedAuthStateChange: (callback: AuthCallback) => {
    mockAuthListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: (): void => { mockAuthListeners.delete(callback); },
        },
      },
    };
  },
}));

const { database, __adapter: adapter, __modelClasses: classes } =
  jest.requireMock<SqliteModules>("@monyvi/db");

function command(
  state: AccountReviewSession,
  kind: "set_filter" | "select_ready" | "clear_selection",
  filter: AccountReviewSession["filter"] = state.filter
): AccountReviewCommand {
  return accountReviewCommandSchema.parse({
    kind, ownerId: state.ownerId, sessionId: state.sessionId,
    expectedReviewRevision: state.revision,
    expectedOperationGeneration: state.operationGeneration,
    filter,
  });
}
function removal(state: AccountReviewSession): AccountReviewCommand {
  const group = state.groups[0];
  if (!group) throw new Error("missing_real_group");
  return accountReviewCommandSchema.parse({
    kind: "remove_group",
    ownerId: state.ownerId, sessionId: state.sessionId,
    expectedReviewRevision: state.revision,
    expectedOperationGeneration: state.operationGeneration,
    groupId: group.groupId, expectedGroupRevision: group.revision,
  });
}
async function execute(
  state: AccountReviewSession,
  parsed: AccountReviewCommand,
  nextUndoToken: string | null = null
): ReturnType<typeof executeSmsAccountReviewCommand> {
  return executeSmsAccountReviewCommand({
    queueId: state.sessionId,
    command: parsed,
    accountSnapshots: makeOwnedContext(),
    nextUndoToken,
  });
}
async function ownedDrafts(source: Database = database): Promise<SmsReviewDraftItem[]> {
  return source.get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", T025_IDS.owner)).fetch();
}
async function ownedQueue(source: Database = database): Promise<SmsReviewQueue> {
  const queues = await source.get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", T025_IDS.owner)).fetch();
  if (queues.length !== 1 || !queues[0]) throw new Error("missing_real_owned_queue");
  return queues[0];
}
interface PhysicalDraft {
  readonly id: string;
  readonly json: string;
  readonly revision: string;
  readonly selected: boolean | null;
}
/** Raw physical bytes for intentionally malformed/mixed V2-header tests. */
async function rawStoredPayloads(
  source: Database = database
): Promise<readonly { readonly id: string; readonly json: string }[]> {
  return (await ownedDrafts(source)).map((draft) => ({
    id: draft.id, json: draft.payloadJson,
  })).sort((a, b) => a.id.localeCompare(b.id));
}
async function physicalDrafts(source: Database = database): Promise<PhysicalDraft[]> {
  const drafts = await ownedDrafts(source);
  return drafts.map((draft) => ({
    id: draft.id,
    json: draft.payloadJson,
    revision: decodedReview(draft)?.reviewRevision ?? "",
    selected: draft.selectionOverride,
  })).sort((a,b) => a.id.localeCompare(b.id));
}
function decodedReview(
  draft: SmsReviewDraftItem
): ReturnType<typeof decodeSmsReviewDraftPayload>["review"] {
  return decodeSmsReviewDraftPayload({
    version: draft.payloadVersion,
    json: draft.payloadJson,
    expectedFingerprint: draft.smsFingerprint,
    expectedOwnerId: draft.userId,
    expectedSessionId: draft.queueId,
    selectionOverride: draft.selectionOverride,
  }).review;
}

/**
 * Genuine namespace + two physical draft rows. Start with historical nine-key
 * V2 payloads to prove compatibility; future V2 codec may automatically add
 * its tenth key, which is stripped from this OLD fixture only.
 */
async function seedNineHeaderQueue(): Promise<AccountReviewSession> {
  const original = [makeT025SmsOriginal(0), makeT025SmsOriginal(1)];
  const merged = await mergeSmsReviewDrafts({
    transactions: original,
    expectedUserId: T025_IDS.owner,
    parsedAt: new Date("2026-10-14T12:00:00.000Z"),
  });
  expect(merged.insertedCount).toBe(2);
  const queue = await ownedQueue();
  const physical = await ownedDrafts();
  const sorted = [...physical].sort((a,b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const transactions = [...original].sort((a,b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const session = makeT025ReviewSession(
    queue.id, transactions, sorted.map((draft) => draft.id)
  );
  await database.write(async () => {
    const ops = sorted.map((draft, index) => {
      const row = session.rows[index];
      const transaction = transactions[index];
      if (!row || !transaction || row.source !== "SMS")
        throw new Error("missing_genuine_sms_v2_seed_row");
      const encoded = encodeSmsReviewDraftV2({
        transaction, review: makeT025StoredReview(session, row.rowId),
      });
      const parsed: unknown = JSON.parse(encoded.json);
      if (!parsed || typeof parsed !== "object" || !("review" in parsed) ||
          !parsed.review || typeof parsed.review !== "object")
        throw new Error("unexpected_real_sms_codec_bytes");
      const observed = "filter" in parsed.review
        ? parsed.review.filter : undefined;
      if (observed !== undefined && observed !== "all")
        throw new Error("unexpected_filter_on_historical_seed");
      const nine = Object.fromEntries(
        Object.entries(parsed.review).filter(([key]) => key !== "filter")
      );
      const historicalJson = JSON.stringify({ ...parsed, review: nine });
      return draft.prepareUpdate((item) => {
        item.payloadVersion = 2;
        item.payloadJson = historicalJson;
        item.selectionOverride = false;
      });
    });
    await database.batch(...ops);
  });
  return session;
}
async function clone(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(), modelClasses: classes,
  });
}

beforeAll(async () => {
  setGenerator(() =>
    "00000000-0000-4000-8000-" + String(nextGeneratedId++).padStart(12, "0")
  );
  await adapter.initializingPromise;
});
beforeEach(async () => {
  mockCurrentUserId = T025_IDS.owner;
  nextGeneratedId = 54600;
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  await seedCapturedSmsReviewContext(database, T025_IDS.owner);
});
afterEach(() => {
  mockCurrentUserId = T025_IDS.owner;
  for (const callback of [...mockAuthListeners])
    callback("SIGNED_OUT", null);
  expect(mockAuthListeners.size).toBe(0);
  jest.restoreAllMocks();
});

describe("#395 T054 real SQLite canonical SMS filter writer", () => {
  it("S01 persists changed filter/revision to ALL current original V2 headers in one real batch, preserving business fields", async () => {
    const session = await seedNineHeaderQueue();
    const before = await physicalDrafts();
    const originalQueue = await ownedQueue();
    const originalUpdatedAt = originalQueue.updatedAt;
    const batchSpy = jest.spyOn(database, "batch");
    try {
      const result = await execute(session, command(session, "set_filter", "needs_review"));
      expect(result.reasonCodes).toEqual([]);
      expect(result.effect).toBe("persist_sms");
      expect(result.state.filter).toBe("needs_review");
      expect(result.state.operationGeneration).toBe(session.operationGeneration);
      expect(result.state.rows).toEqual(session.rows);
      expect(result.state.groups).toEqual(session.groups);
      expect(BigInt(result.state.revision)).toBe(BigInt(session.revision) + 1n);
      const batches = batchSpy.mock.calls.filter((call) =>
        Array.isArray(call[0]) && call[0].some(
          (model: Model) => model.table === "sms_review_queues"
        )
      );
      expect(batches).toHaveLength(1);
      const committed = batches[0]?.[0];
      if (!Array.isArray(committed)) throw new Error("no_real_sqlite_batch");
      expect(committed.filter((model: Model) =>
        model.table === "sms_review_draft_items"
      )).toHaveLength(2);
      const fresh = await clone();
      const drafts = await physicalDrafts(fresh);
      expect(drafts).toHaveLength(2);
      for (const item of await ownedDrafts(fresh)) {
        expect(decodedReview(item)).toEqual(expect.objectContaining({
          filter: "needs_review",
          reviewRevision: result.state.revision,
          operationGeneration: session.operationGeneration,
        }));
        const raw: unknown = JSON.parse(item.payloadJson);
        if (!raw || typeof raw !== "object" || !("review" in raw) ||
            !raw.review || typeof raw.review !== "object")
          throw new Error("expected_persisted_v2");
        expect(Object.keys(raw.review)).toHaveLength(10);
      }
      expect(drafts.every((item) => !before.some((prior) =>
        prior.id === item.id && prior.json === item.json
      ))).toBe(true);
      expect((await ownedQueue(fresh)).id).toBe(session.sessionId);
      expect((await ownedQueue(fresh)).updatedAt.getTime())
        .toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
      expect(await fresh.get<Transaction>("transactions").query().fetchCount()).toBe(0);
    } finally {
      batchSpy.mockRestore();
    }
  });

  it("S02 rehydrates historical nine-key ALL headers then new Selected headers across a fresh cloned SQLite adapter", async () => {
    const session = await seedNineHeaderQueue();
    const priorRaw = await physicalDrafts();
    const firstClone = await clone();
    const first = rehydrateOwnedSmsReviewGraph(
      await ownedDrafts(firstClone), T025_IDS.owner, session.sessionId
    );
    expect(first.session.filter).toBe("all");
    expect(first.session.rows).toEqual(session.rows);
    expect((await physicalDrafts(firstClone)).map((row) => row.json))
      .toEqual(priorRaw.map((row) => row.json));
    const changed = await execute(session, command(session, "set_filter", "selected"));
    expect(changed.reasonCodes).toEqual([]);
    const secondClone = await clone();
    const after = rehydrateOwnedSmsReviewGraph(
      await ownedDrafts(secondClone), T025_IDS.owner, session.sessionId
    );
    expect(after.session.filter).toBe("selected");
    expect(after.session.operationGeneration).toBe(session.operationGeneration);
    expect(after.session.revision).toBe(changed.state.revision);
    expect(after.session.rows).toEqual(session.rows);
  });

  it("S03 stale and mismatched bulk filter commands are refused even after All→Needs→All ABA", async () => {
    const state = await seedNineHeaderQueue();
    const oldAll = command(state, "select_ready");
    const needs = await execute(state, command(state, "set_filter", "needs_review"));
    expect(needs.reasonCodes).toEqual([]);
    const wrongFilter = await execute(
      needs.state, command(needs.state, "clear_selection", "all")
    );
    expect(wrongFilter.effect).toBe("none");
    expect(wrongFilter.reasonCodes).toContain("review_revision_stale");
    const all = await execute(needs.state, command(needs.state, "set_filter", "all"));
    expect(all.reasonCodes).toEqual([]);
    const before = await physicalDrafts();
    const stale = await execute(all.state, oldAll);
    expect(stale.reasonCodes).toContain("review_revision_stale");
    expect(stale.state).toEqual(all.state);
    expect(await physicalDrafts()).toEqual(before);
  });

  it("S04 same target filter is an identity no-op, including physical queue/header bytes and adapter commit count", async () => {
    const session = await seedNineHeaderQueue();
    const before = await physicalDrafts();
    const queueTimestamp = (await ownedQueue()).updatedAt.getTime();
    const spy = jest.spyOn(database.adapter, "batch");
    try {
      const result = await execute(session, command(session, "set_filter", "all"));
      expect(result.reasonCodes).toEqual([]);
      expect(result.effect).toBe("none");
      expect(result.state).toEqual(session);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    expect(await physicalDrafts()).toEqual(before);
    expect((await ownedQueue()).updatedAt.getTime()).toBe(queueTimestamp);
  });

  it("S05 real adapter failure rolls back ALL owner V2 filter headers + queue and permits a single clean retry", async () => {
    const session = await seedNineHeaderQueue();
    const before = await physicalDrafts();
    const updatedAt = (await ownedQueue()).updatedAt.getTime();
    const spy = jest.spyOn(database.adapter, "batch");
    spy.mockImplementationOnce((): Promise<void> =>
      Promise.reject(new Error("t054_sqlite_precommit_failure"))
    );
    try {
      await expect(execute(
        session, command(session, "set_filter", "needs_review")
      )).rejects.toThrow("t054_sqlite_precommit_failure");
    } finally {
      spy.mockRestore();
    }
    expect(await physicalDrafts()).toEqual(before);
    const fresh = await clone();
    expect(await physicalDrafts(fresh)).toEqual(before);
    expect((await ownedQueue(fresh)).updatedAt.getTime()).toBe(updatedAt);
    const retry = await execute(session, command(session, "set_filter", "needs_review"));
    expect(retry.effect).toBe("persist_sms");
    const after = await physicalDrafts(await clone());
    expect(after).toHaveLength(2);
    expect(after.every((x) => !before.some((y) =>
      x.id === y.id && x.json === y.json
    ))).toBe(true);
  });

  it("S06 rejects inconsistent historical/current V2 filters without rewriting a single sibling or queue", async () => {
    const session = await seedNineHeaderQueue();
    const drafts = await ownedDrafts();
    const first = drafts[0];
    if (!first) throw new Error("missing_real_sms_draft");
    const originalRaw: unknown = JSON.parse(first.payloadJson);
    if (!originalRaw || typeof originalRaw !== "object" ||
        Array.isArray(originalRaw) || !("review" in originalRaw))
      throw new Error("missing_stored_v2_review_header");
    const originalReview: unknown = originalRaw.review;
    if (!originalReview || typeof originalReview !== "object" ||
        Array.isArray(originalReview))
      throw new Error("missing_stored_v2_review_header");
    // Narrow both parsed JSON objects before the asynchronous writer callback.
    // The intentional conflicting filter remains the only changed V2 header.
    const conflictingHeaderJson = JSON.stringify({
      ...originalRaw,
      review: { ...originalReview, filter: "selected" },
    });
    await database.write(async () => {
      await database.batch(first.prepareUpdate((row) => {
        row.payloadJson = conflictingHeaderJson;
      }));
    });
    const before = await rawStoredPayloads();
    const originalTimestamp = (await ownedQueue()).updatedAt.getTime();
    await expect(execute(
      session, command(session, "set_filter", "needs_review")
    )).rejects.toThrow();
    expect(await rawStoredPayloads()).toEqual(before);
    expect((await ownedQueue()).updatedAt.getTime()).toBe(originalTimestamp);
  });

  it("S07 owner change rejects a saved filter without leaking or mutating previous owner rows", async () => {
    const state = await seedNineHeaderQueue();
    const before = await physicalDrafts();
    mockCurrentUserId = T025_IDS.foreignOwner;
    await expect(execute(
      state, command(state, "set_filter", "selected")
    )).rejects.toThrow();
    mockCurrentUserId = T025_IDS.owner;
    expect(await physicalDrafts()).toEqual(before);
    expect((await ownedQueue()).id).toBe(state.sessionId);
  });

  it("S09 a genuine late SMS draft publication does not reset a previously committed canonical filter", async () => {
    const session = await seedNineHeaderQueue();
    const filtered = await execute(
      session, command(session, "set_filter", "needs_review")
    );
    expect(filtered.reasonCodes).toEqual([]);
    const previouslyPublished = await physicalDrafts();
    const newMessage = {
      ...makeT025SmsOriginal(0),
      smsFingerprint: T025_IDS.fingerprintOne + "-late-filter-message",
      rawSmsBody: "QNB purchase EGP 50 (late independent message)",
    };
    const merge = await mergeSmsReviewDrafts({
      transactions: [newMessage],
      expectedUserId: T025_IDS.owner,
      parsedAt: new Date("2026-10-16T13:00:00.000Z"),
    });
    expect(merge.insertedCount).toBe(1);
    const fresh = await clone();
    const draftRows = await ownedDrafts(fresh);
    expect(draftRows).toHaveLength(3);
    const rehydrated = rehydrateOwnedSmsReviewGraph(
      draftRows, T025_IDS.owner, session.sessionId
    );
    expect(rehydrated.session.filter).toBe("needs_review");
    expect(rehydrated.session.operationGeneration).toBe(
      filtered.state.operationGeneration
    );
    expect(rehydrated.session.rows.some((row) =>
      row.source === "SMS" && row.sourceFingerprint === newMessage.smsFingerprint
    )).toBe(true);
    const storedPrior = await physicalDrafts(fresh);
    expect(previouslyPublished.every((entry) =>
      storedPrior.some((row) => row.id === entry.id)
    )).toBe(true);
    expect(await fresh.get<Transaction>("transactions").query().fetchCount()).toBe(0);
  });

  it("S08 Remove→Filter→Undo preserves the active filter and durable business tombstone rules, with NO persisted Undo token", async () => {
    const initial = await seedNineHeaderQueue();
    const removed = await execute(initial, removal(initial), T025_IDS.undoToken);
    expect(removed.reasonCodes).toEqual([]);
    const nav = await execute(
      removed.state, command(removed.state, "set_filter", "selected")
    );
    expect(nav.reasonCodes).toEqual([]);
    expect(nav.state.operationGeneration).toBe(removed.state.operationGeneration);
    const undo = accountReviewCommandSchema.parse({
      kind: "undo_removal",
      ownerId: nav.state.ownerId, sessionId: nav.state.sessionId,
      expectedReviewRevision: nav.state.revision,
      expectedOperationGeneration: nav.state.operationGeneration,
      undoToken: T025_IDS.undoToken,
    });
    const result = await execute(nav.state, undo);
    expect(result.reasonCodes).toEqual([]);
    expect(result.state.filter).toBe("selected");
    expect(result.state.groups[0]?.status).toBe("pending");
    for (const row of await ownedDrafts()) {
      expect(decodedReview(row)).toEqual(expect.objectContaining({
        filter: "selected",
      }));
      expect(row.payloadJson).not.toContain(T025_IDS.undoToken);
      expect(row.payloadJson).not.toContain("previousState");
    }
  });
});
