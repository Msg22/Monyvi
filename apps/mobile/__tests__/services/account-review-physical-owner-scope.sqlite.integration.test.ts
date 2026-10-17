/** #395 L4 owner-scoped physical SMS proof, genuine synthetic SQLite.
 * This isolated file does not alter the separately integrated L4 test split.
 * Foreign payload strings exist only in this fixture and must not be fetched
 * through the physical proof's owner/queue-bound full-row query.
 */
import type { Database } from "@nozbe/watermelondb";
import type { SmsReviewDraftItem, SmsReviewQueue } from "@monyvi/db";
import { readPhysicalSmsRows } from "../../services/account-review-pruned-sms-proof";
import {
  createSqliteLedger,
  physicalSaveLedgerSnapshot,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import {
  cache,
  physicalSmsSnapshot,
} from "./account-review-all-dedup-physical-test-helpers";
import {
  OWNER,
  FOREIGN_OWNER,
  testUuid,
} from "./account-review-save-test-fixtures";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@/services/supabase", () => ({
  // Hoist-safe synthetic test owner: testUuid(1) in the shared fixture.
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("018f0c7a-1234-4abc-8def-000000000001"),
  supabase: {},
}));

const QUEUE = testUuid(90101);
const FOREIGN_QUEUE = testUuid(90102);
const DRAFT = testUuid(90103);
const FOREIGN_DRAFT = testUuid(90104);
const DATE = new Date("2026-10-15T12:00:00.000Z");
let ledger: SqliteLedger;
let db: Database;

async function seed(): Promise<{
  readonly owned: SmsReviewDraftItem;
  readonly foreign: SmsReviewDraftItem;
}> {
  const queue = db
    .get<SmsReviewQueue>("sms_review_queues")
    .prepareCreate((record) => {
      record._raw.id = QUEUE;
      record.userId = OWNER;
      record.updatedAt = DATE;
    });
  const foreignQueue = db
    .get<SmsReviewQueue>("sms_review_queues")
    .prepareCreate((record) => {
      record._raw.id = FOREIGN_QUEUE;
      record.userId = FOREIGN_OWNER;
      record.updatedAt = DATE;
    });
  const makeDraft = (
    id: string,
    ownerId: string,
    queueId: string,
    payloadJson: string
  ): SmsReviewDraftItem =>
    db
      .get<SmsReviewDraftItem>("sms_review_draft_items")
      .prepareCreate((record) => {
        record._raw.id = id;
        record.userId = ownerId;
        record.queueId = queueId;
        record.smsFingerprint = id === DRAFT ? "a".repeat(64) : "b".repeat(64);
        record.payloadVersion = 2;
        record.payloadJson = payloadJson;
        record.selectionOverride = false;
        record.position = 0;
        record.parsedAt = DATE;
        record.updatedAt = DATE;
      });
  const owned = makeDraft(DRAFT, OWNER, QUEUE, '{"synthetic":"owned"}');
  const foreign = makeDraft(
    FOREIGN_DRAFT,
    FOREIGN_OWNER,
    FOREIGN_QUEUE,
    '{"synthetic":"foreign-private-must-not-be-read"}'
  );
  await db.write(() => db.batch(queue, foreignQueue, owned, foreign));
  return { owned, foreign };
}
beforeAll(async () => {
  ledger = await createSqliteLedger();
  db = ledger.database;
});
beforeEach(async () => {
  await db.write(() => db.unsafeResetDatabase());
});
afterEach(() => jest.restoreAllMocks());

describe("L4 owned-queue physical reads", () => {
  it("reads only authenticated owner + sealed queue, never another user's SMS payload", async () => {
    await seed();
    const dispatcher = ledger.adapter._dispatcher;
    const originalCall = dispatcher.call.bind(dispatcher);
    const sql: string[] = [];
    const spy = jest
      .spyOn(dispatcher, "call")
      .mockImplementation((method, args, callback): void => {
        if (method === "unsafeQueryRaw" && typeof args[0] === "string")
          sql.push(args[0]);
        originalCall(method, args, callback);
      });
    let physical;
    try {
      physical = await readPhysicalSmsRows(db, "sms_review_draft_items", {
        ownerId: OWNER,
        queueId: QUEUE,
        requiredDraftIds: [DRAFT],
      });
    } finally {
      spy.mockRestore();
    }
    expect(physical.map((row) => row.id)).toEqual([DRAFT]);
    expect(JSON.stringify(physical)).not.toContain("foreign-private");
    expect(sql.length).toBeGreaterThan(0);
    expect(
      sql.every(
        (statement) =>
          !statement.includes('select * from "sms_review_draft_items"') ||
          (statement.includes('"queue_id" = ?') &&
            statement.includes('"user_id" = ?'))
      )
    ).toBe(true);
  });

  it("refuses a foreign draft reparented into the owned queue using identity-only evidence", async () => {
    const seeded = await seed();
    await db.write(() =>
      db.batch(
        seeded.foreign.prepareUpdate((row) => {
          row.queueId = QUEUE;
        })
      )
    );
    await expect(
      readPhysicalSmsRows(db, "sms_review_draft_items", {
        ownerId: OWNER,
        queueId: QUEUE,
      })
    ).rejects.toThrow(
      "account_review_private_lifecycle_foreign_member_in_owned_queue"
    );
    expect(seeded.foreign.userId).toBe(FOREIGN_OWNER);
    expect(seeded.foreign.queueId).toBe(QUEUE);
  });

  it("refuses an original moved outside its sealed queue by exact ID without reading foreign payload", async () => {
    const seeded = await seed();
    await db.write(() =>
      db.batch(
        seeded.owned.prepareUpdate((row) => {
          row.queueId = FOREIGN_QUEUE;
        })
      )
    );
    await expect(
      readPhysicalSmsRows(db, "sms_review_draft_items", {
        ownerId: OWNER,
        queueId: QUEUE,
        requiredDraftIds: [DRAFT],
      })
    ).rejects.toThrow(
      "account_review_private_lifecycle_required_original_reparented_or_foreign"
    );
    expect(seeded.owned.queueId).toBe(FOREIGN_QUEUE);
  });

  it("refuses a B-owned physical parent even while its draft remains A-owned, with zero deletion or cache mutation", async () => {
    const seeded = await seed();
    const parent = await db
      .get<SmsReviewQueue>("sms_review_queues")
      .find(QUEUE);
    const unrelatedQueue = await db
      .get<SmsReviewQueue>("sms_review_queues")
      .find(FOREIGN_QUEUE);

    // Genuine SQLite postimage: the original parent alone changes ownership.
    // Its A-owned child deliberately remains bound to the original queue ID.
    await db.write(() =>
      db.batch(
        parent.prepareUpdate((row) => {
          row.userId = FOREIGN_OWNER;
        })
      )
    );

    const models = [parent, unrelatedQueue, seeded.owned, seeded.foreign];
    const beforeCache = cache(models);
    const beforePhysical = await physicalSmsSnapshot(db);
    const beforeLedger = await physicalSaveLedgerSnapshot(db);
    expect(beforePhysical.queues.find((row) => row.id === QUEUE)?.user_id).toBe(
      FOREIGN_OWNER
    );
    expect(beforePhysical.drafts.find((row) => row.id === DRAFT)?.user_id).toBe(
      OWNER
    );
    expect(
      beforePhysical.drafts.find((row) => row.id === DRAFT)?.queue_id
    ).toBe(QUEUE);

    const dispatcher = ledger.adapter._dispatcher;
    const realCall = dispatcher.call.bind(dispatcher);
    const sql: string[] = [];
    const spy = jest
      .spyOn(dispatcher, "call")
      .mockImplementation((method, args, callback): void => {
        if (method === "unsafeQueryRaw" && typeof args[0] === "string")
          sql.push(args[0]);
        realCall(method, args, callback);
      });
    try {
      await expect(
        readPhysicalSmsRows(db, "sms_review_draft_items", {
          ownerId: OWNER,
          queueId: QUEUE,
          requiredDraftIds: [DRAFT],
        })
      ).rejects.toThrow(
        "account_review_private_lifecycle_foreign_original_parent_queue"
      );
    } finally {
      spy.mockRestore();
    }

    // Refusal must occur at the identity-only parent query, BEFORE any draft
    // payload is loaded. Neither user may lose records or cached state.
    expect(sql).toContain(
      'select "id", "user_id" from "sms_review_queues" where "id" = ?'
    );
    expect(
      sql.some((statement) =>
        statement.includes('select * from "sms_review_draft_items"')
      )
    ).toBe(false);
    expect(await physicalSmsSnapshot(db)).toEqual(beforePhysical);
    expect(await physicalSaveLedgerSnapshot(db)).toEqual(beforeLedger);
    expect(cache(models)).toEqual(beforeCache);
    expect(
      (await physicalSmsSnapshot(db)).drafts.map((row) => row.id).sort()
    ).toEqual([DRAFT, FOREIGN_DRAFT].sort());
  });
});
