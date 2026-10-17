/**
 * #395 FR-019 T054 TESTS FIRST. Real Watermelon SQLite, owned queue,
 * original V2 codec and actual executeSmsAccountReviewCommand service.
 * Edit wire is a deliberately unimplemented Red; NO writer/reducer mock.
 * Root runs this test, not this author.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import type { Category, SmsReviewDraftItem, SmsReviewQueue } from "@monyvi/db";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import {
  accountReviewCommandSchema,
  type AccountReviewSession,
  type AccountReviewCommand,
} from "../../../../packages/logic/src/account-review/schemas";
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
  seedCapturedSmsReviewContext,
  SMS_REVIEW_OTHER_CATEGORY_ID,
} from "./sms-review-real-sqlite-fixture";
import { mergeSmsReviewDrafts } from "@/services/sms-review-draft-repository";
import { makeOwnedContext } from "../../../../packages/logic/src/account-review/__tests__/normalization-fixtures";
import { executeSmsAccountReviewCommand } from "@/services/account-review-command-service";

interface SqliteModules {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

let mockCurrentUserId: string = T025_IDS.owner;
let nextGeneratedId = 25100;
type CoordinatedAuthCallback = Parameters<
  (typeof import("@/services/supabase"))["subscribeToCoordinatedAuthStateChange"]
>[0];
const mockCoordinatedAuthListeners = new Set<CoordinatedAuthCallback>();

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
  const modelClasses = [
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/SmsReviewQueue")
    >("../../../../packages/db/src/models/SmsReviewQueue").SmsReviewQueue,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/SmsReviewDraftItem")
    >("../../../../packages/db/src/models/SmsReviewDraftItem")
      .SmsReviewDraftItem,
    jest.requireActual<
      typeof import("../../../../packages/db/src/models/DismissedSmsFingerprint")
    >("../../../../packages/db/src/models/DismissedSmsFingerprint")
      .DismissedSmsFingerprint,
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
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
    __modelClasses: modelClasses,
    SmsReviewQueue: modelClasses[0],
    SmsReviewDraftItem: modelClasses[1],
    DismissedSmsFingerprint: modelClasses[2],
    Transaction: modelClasses[3],
    Transfer: modelClasses[4],
    Account: modelClasses[5],
    BankDetails: modelClasses[6],
    AccountSmsSender: modelClasses[7],
    Profile: modelClasses[8],
    Category: modelClasses[9],
  };
});

// Authentication is test-controlled but scoped queries use the real collections.
jest.mock("@/services/user-data-access", () => {
  const { Q: scopedQ } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    getRequiredCurrentUserId: (): Promise<string> =>
      Promise.resolve(mockCurrentUserId),
    getCurrentUserDataScope: () => {
      const owner = mockCurrentUserId;
      return Promise.resolve({
        userId: owner,
        queryOwned: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...conditions: unknown[]
        ): unknown =>
          collection.query(scopedQ.where("user_id", owner), ...conditions),
        queryAccessibleCategories: (
          collection: { query: (...clauses: unknown[]) => unknown },
          ...conditions: unknown[]
        ): unknown =>
          collection.query(
            scopedQ.or(
              scopedQ.where("user_id", owner),
              scopedQ.where("user_id", null)
            ),
            ...conditions
          ),
        queryChildrenOfOwnedParents: (
          collection: { query: (...clauses: unknown[]) => unknown },
          parents: ReadonlyArray<{ id: string; userId: string }>,
          foreignKey: string,
          ...conditions: unknown[]
        ): unknown => {
          if (parents.some((p) => p.userId !== owner)) {
            throw new Error("auth_scope_changed");
          }
          return collection.query(
            scopedQ.where(foreignKey, scopedQ.oneOf(parents.map((p) => p.id))),
            ...conditions
          );
        },
        assertOwned: <T extends { readonly userId: string }>(record: T): T => {
          if (record.userId !== owner) throw new Error("auth_scope_changed");
          return record;
        },
      });
    },
    assertExpectedCurrentUser: (expected: string): Promise<void> =>
      expected === mockCurrentUserId
        ? Promise.resolve()
        : Promise.reject(new Error("auth_scope_changed")),
    queryOwned: (
      collection: { query: (...clauses: unknown[]) => unknown },
      userId: string,
      ...conditions: unknown[]
    ): unknown =>
      collection.query(scopedQ.where("user_id", userId), ...conditions),
  };
});

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentUserId),
  subscribeToCoordinatedAuthStateChange: (
    callback: CoordinatedAuthCallback
  ) => {
    mockCoordinatedAuthListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: (): void => {
            mockCoordinatedAuthListeners.delete(callback);
          },
        },
      },
    };
  },
}));

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<SqliteModules>("@monyvi/db");

jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
}));

interface SeededQueue {
  readonly queueId: string;
  readonly session: AccountReviewSession;
  readonly originals: readonly ParsedSmsTransaction[];
  readonly records: readonly SmsReviewDraftItem[];
}

async function ownedQueues(): Promise<SmsReviewQueue[]> {
  return database
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
}

async function ownedDrafts(): Promise<SmsReviewDraftItem[]> {
  return database
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
}

async function seedLinkedV2Queue(
  logicalRowIds?: readonly string[]
): Promise<SeededQueue> {
  const originals = [makeT025SmsOriginal(0), makeT025SmsOriginal(1)];
  const merged = await mergeSmsReviewDrafts({
    transactions: originals,
    expectedUserId: T025_IDS.owner,
    parsedAt: new Date("2026-10-14T12:00:00.000Z"),
  });
  expect(merged.insertedCount).toBe(2);
  const queues = await ownedQueues();
  expect(queues).toHaveLength(1);
  const queue = queues[0];
  if (!queue) throw new Error("Real SQLite queue not created");
  const records = await ownedDrafts();
  expect(records).toHaveLength(2);
  const arranged = [...records].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const sortedOriginals = [...originals].sort((a, b) =>
    a.smsFingerprint.localeCompare(b.smsFingerprint)
  );
  const rowIds = logicalRowIds ?? arranged.map((draft) => draft.id);
  const session = makeT025ReviewSession(queue.id, sortedOriginals, rowIds);
  await database.write(async () => {
    await database.batch(
      ...arranged.map((draft, index) => {
        const original = sortedOriginals.find(
          (item) => item.smsFingerprint === draft.smsFingerprint
        );
        const rowId = rowIds[index];
        if (!original || !rowId)
          throw new Error("Unmatched actual SQLite SMS fingerprint or row ID");
        const encoded = encodeSmsReviewDraftV2({
          transaction: original,
          review: makeT025StoredReview(session, rowId),
        });
        return draft.prepareUpdate((record) => {
          record.payloadVersion = encoded.version;
          record.payloadJson = encoded.json;
          record.selectionOverride = false;
        });
      })
    );
  });
  return {
    queueId: queue.id,
    session,
    originals: sortedOriginals,
    records: arranged,
  };
}

/** Reopen the same SQLite data through independent Watermelon record caches. */
async function openFreshSqliteDatabase(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(),
    modelClasses,
  });
}

function decodeOwnedV2(
  item: SmsReviewDraftItem,
  queueId: string
): ReturnType<typeof decodeSmsReviewDraftPayload> {
  return decodeSmsReviewDraftPayload({
    version: item.payloadVersion,
    json: item.payloadJson,
    expectedFingerprint: item.smsFingerprint,
    expectedOwnerId: item.userId,
    expectedSessionId: queueId,
    selectionOverride: item.selectionOverride,
  });
}

beforeAll(async () => {
  setGenerator(
    () =>
      "00000000-0000-4000-8000-" + String(nextGeneratedId++).padStart(12, "0")
  );
  await adapter.initializingPromise;
});

beforeEach(async () => {
  mockCurrentUserId = T025_IDS.owner;
  nextGeneratedId = 25100;
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  await seedCapturedSmsReviewContext(database, T025_IDS.owner);
});

afterEach(() => {
  mockCurrentUserId = T025_IDS.owner;
  for (const callback of [...mockCoordinatedAuthListeners]) {
    callback("SIGNED_OUT", null);
  }
  expect(mockCoordinatedAuthListeners.size).toBe(0);
  jest.restoreAllMocks();
});

interface PhysicalSnapshot {
  readonly queues: readonly string[];
  readonly drafts: readonly string[];
}

function rawPhysicalModel(model: Model): string {
  return JSON.stringify(
    Object.entries(model._raw).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  );
}

async function readPhysicalSnapshot(
  source: Database
): Promise<PhysicalSnapshot> {
  const queues = await source
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
  const drafts = await source
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(Q.where("user_id", T025_IDS.owner))
    .fetch();
  const stable = (models: readonly Model[]): string[] =>
    models.map(rawPhysicalModel).sort();
  return { queues: stable(queues), drafts: stable(drafts) };
}

function setFilterCommand(
  session: AccountReviewSession,
  filter: AccountReviewSession["filter"]
): ReturnType<typeof accountReviewCommandSchema.parse> {
  return accountReviewCommandSchema.parse({
    kind: "set_filter",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    filter,
  });
}

/**
 * Test-only wire injection into the live service. The currently closed
 * TypeScript union does not include edit_row_transaction, so schema.parse
 * here would prevent the real SQLite writer from ever seeing it.
 * No runtime application code may use this cast.
 */
function editCommand(
  session: AccountReviewSession,
  rowId: string,
  patch: Readonly<Record<string, unknown>>,
  expectedRowRevision?: string
): AccountReviewCommand {
  const row = session.rows.find((candidate) => candidate.rowId === rowId);
  if (!row) throw new Error("Expected genuine SQLite-backed review row");
  const wire: Record<string, unknown> = {
    kind: "edit_row_transaction",
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
    rowId,
    expectedRowRevision: expectedRowRevision ?? row.revision,
    patch,
  };
  return wire as unknown as AccountReviewCommand;
}

function runCommand(
  session: AccountReviewSession,
  command: AccountReviewCommand
): ReturnType<typeof executeSmsAccountReviewCommand> {
  return executeSmsAccountReviewCommand({
    queueId: session.sessionId,
    command,
    accountSnapshots: makeOwnedContext(),
    nextUndoToken: null,
  });
}

describe("#395 FR-019 T054 edited transaction — actual SMS SQLite writer", () => {
  it("S00 existing set_filter writes through the real owned V2 service and fresh adapter (positive control)", async () => {
    const seeded = await seedLinkedV2Queue();
    const accepted = await runCommand(
      seeded.session,
      setFilterCommand(seeded.session, "needs_review")
    );
    expect(accepted.reasonCodes).toEqual([]);
    expect(accepted.effect).toBe("persist_sms");
    expect(accepted.state.filter).toBe("needs_review");
    const committed = await readPhysicalSnapshot(database);
    const fresh = await openFreshSqliteDatabase();
    expect(await readPhysicalSnapshot(fresh)).toEqual(committed);
    expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
      seeded.queueId,
    ]);
  });

  it("S01 actual service edits amount/category/counterparty, durable top-level and nested V2 finance, with original source and sibling preserved", async () => {
    const seeded = await seedLinkedV2Queue();
    const before = await readPhysicalSnapshot(database);
    const row = seeded.session.rows[0];
    const sibling = seeded.session.rows[1];
    if (!row || row.source !== "SMS" || !sibling || sibling.source !== "SMS")
      throw new Error("Actual linked SMS review rows unavailable");
    const patch = {
      amountDecimal: "60.25",
      categoryId: SMS_REVIEW_OTHER_CATEGORY_ID,
      counterparty: "Corrected shop name",
    };
    // Calls CURRENT production service; currently returns an unknown-command
    // rejection, making the persistence assertion a meaningful behavioral Red.
    const accepted = await runCommand(
      seeded.session,
      editCommand(seeded.session, row.rowId, patch)
    );
    expect(accepted.reasonCodes).toEqual([]);
    expect(accepted.effect).toBe("persist_sms");
    expect(accepted.affectedRowIds).toEqual([row.rowId]);
    const changed = accepted.state.rows.find((r) => r.rowId === row.rowId);
    if (!changed || changed.source !== "SMS")
      throw new Error("Accepted SMS edit lost original row identity");
    expect(changed.amountDecimal).toBe("60.25");
    expect(changed.transaction.amount).toBe(60.25);
    expect(changed.transaction.categoryId).toBe(SMS_REVIEW_OTHER_CATEGORY_ID);
    expect(changed.transaction.categoryDisplayName).toBe("Other");
    expect(changed.transaction.counterparty).toBe(patch.counterparty);
    expect(changed.transaction.date).toEqual(row.transaction.date);
    expect(changed.transaction.rawSmsBody).toBe(row.transaction.rawSmsBody);
    expect(changed.sourceFingerprint).toBe(row.sourceFingerprint);
    expect(changed.accountEvidence).toEqual(row.accountEvidence);
    expect(changed.assignment).toEqual(row.assignment);
    expect(accepted.state.groups).toEqual(seeded.session.groups);
    const records = await ownedDrafts();
    expect(records).toHaveLength(2);
    const saved = records.find((record) => record.id === row.rowId);
    const unrelated = records.find((record) => record.id === sibling.rowId);
    if (!saved || !unrelated)
      throw new Error("Real persisted draft disappeared");
    const decoded = decodeOwnedV2(saved, seeded.queueId);
    const decodedSibling = decodeOwnedV2(unrelated, seeded.queueId);
    expect(decoded.transaction.amount).toBe(60.25);
    expect(decoded.transaction.categoryId).toBe(SMS_REVIEW_OTHER_CATEGORY_ID);
    expect(decoded.review?.row.amountDecimal).toBe("60.25");
    expect(decoded.review?.row.sourceFingerprint).toBe(row.sourceFingerprint);
    expect(decoded.review?.reviewRevision).toBe(accepted.state.revision);
    expect(decodedSibling.transaction).toEqual(sibling.transaction);
    expect(decodedSibling.review?.row.selected).toBe(sibling.selected);
    expect(decodedSibling.review?.groups).toEqual(
      seeded.session.groups.filter((group) =>
        group.linkedRowIds.includes(sibling.rowId)
      )
    );
    const after = await readPhysicalSnapshot(database);
    expect(after).not.toEqual(before);
    const reopened = await openFreshSqliteDatabase();
    expect(await readPhysicalSnapshot(reopened)).toEqual(after);
    const reloaded = (
      await reopened
        .get<SmsReviewDraftItem>("sms_review_draft_items")
        .query(Q.where("user_id", T025_IDS.owner))
        .fetch()
    ).find((record) => record.id === row.rowId);
    if (!reloaded) throw new Error("No edited row after SQLite restart");
    expect(decodeOwnedV2(reloaded, seeded.queueId).transaction.amount).toBe(
      60.25
    );
  });

  it("S02 stale expected row revision refuses with no physical draft/queue write", async () => {
    const seeded = await seedLinkedV2Queue();
    const before = await readPhysicalSnapshot(database);
    const row = seeded.session.rows[0];
    if (!row) throw new Error("Missing actual review row");
    const rejected = await runCommand(
      seeded.session,
      editCommand(seeded.session, row.rowId, { amountDecimal: "60" }, "999")
    );
    expect(rejected.effect).toBe("none");
    expect(rejected.reasonCodes).toContain("review_revision_stale");
    expect(await readPhysicalSnapshot(database)).toEqual(before);
  });

  it.each([
    ["EGP overprecision", { amountDecimal: "50.005" }],
    [
      "foreign/unknown category",
      {
        categoryId: "00000000-0000-4000-8000-000000009999",
      },
    ],
    ["SMS type read-only", { type: "INCOME" }],
    ["immutable source fingerprint", { sourceFingerprint: "forged" }],
  ])(
    "S03 refuses %s without a batch write, even in a fresh adapter",
    async (_label, patch) => {
      const seeded = await seedLinkedV2Queue();
      const before = await readPhysicalSnapshot(database);
      const row = seeded.session.rows[0];
      if (!row) throw new Error("Missing persisted original");
      const rejected = await runCommand(
        seeded.session,
        editCommand(seeded.session, row.rowId, patch)
      );
      expect(rejected.effect).toBe("none");
      expect(rejected.reasonCodes.length).toBeGreaterThan(0);
      expect(await readPhysicalSnapshot(database)).toEqual(before);
      const reopened = await openFreshSqliteDatabase();
      expect(await readPhysicalSnapshot(reopened)).toEqual(before);
    }
  );

  it("S04 original filter writer still works after a rejected edit (positive control)", async () => {
    const seeded = await seedLinkedV2Queue();
    const row = seeded.session.rows[0];
    if (!row) throw new Error("Expected SMS row");
    const denied = await runCommand(
      seeded.session,
      editCommand(seeded.session, row.rowId, { amountDecimal: "60" }, "999")
    );
    expect(denied.effect).toBe("none");
    const filter = await runCommand(
      seeded.session,
      setFilterCommand(seeded.session, "selected")
    );
    expect(filter.reasonCodes).toEqual([]);
    expect(filter.effect).toBe("persist_sms");
    expect(filter.state.filter).toBe("selected");
  });
  it("S05 refuses a category deleted after the editor opened, with no draft or queue mutations", async () => {
    const seeded = await seedLinkedV2Queue();
    const row = seeded.session.rows[0];
    if (!row) throw new Error("Expected original persisted review row");
    const category = await database
      .get<Category>("categories")
      .find(SMS_REVIEW_OTHER_CATEGORY_ID);
    await database.write(async () => {
      await database.batch(
        category.prepareUpdate((item) => {
          item.deleted = true;
        })
      );
    });
    const before = await readPhysicalSnapshot(database);
    const result = await runCommand(
      seeded.session,
      editCommand(seeded.session, row.rowId, {
        categoryId: SMS_REVIEW_OTHER_CATEGORY_ID,
      })
    );
    expect(result.effect).toBe("none");
    expect(result.reasonCodes).toContain("category_needed");
    expect(await readPhysicalSnapshot(database)).toEqual(before);
    const fresh = await openFreshSqliteDatabase();
    expect(await readPhysicalSnapshot(fresh)).toEqual(before);
  });

  it("S06 refuses a UI-supplied category display name, preserving the original journal bytes", async () => {
    const seeded = await seedLinkedV2Queue();
    const row = seeded.session.rows[0];
    if (!row) throw new Error("Expected original stored row");
    const before = await readPhysicalSnapshot(database);
    const result = await runCommand(
      seeded.session,
      editCommand(seeded.session, row.rowId, {
        categoryId: SMS_REVIEW_OTHER_CATEGORY_ID,
        categoryDisplayName: "Forged UI label",
      })
    );
    expect(result.effect).toBe("none");
    expect(result.reasonCodes.length).toBeGreaterThan(0);
    expect(await readPhysicalSnapshot(database)).toEqual(before);
  });
});
