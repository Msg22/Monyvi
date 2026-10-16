/**
 * #395 T043/T053 physical recovery harness.
 * Only @monyvi/db is rebound to actual WatermelonDB + SQLite models;
 * the Save, foundation, parser, reconciliation and sync services are real.
 */
import { createHash } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { FinancialActionGroup } from "@monyvi/db";
import type { AccountReviewSession } from "@monyvi/logic";
import {
  parseFinancialActionEnvelopeJson,
  type Sha256Provider,
} from "../../../../packages/logic/src/financial-actions";
import {
  reviewBatchSaveWireSchema,
} from "../../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import {
  parseAccountReviewLocalSaveSnapshot,
} from "../../../../packages/logic/src/financial-actions/review-local-recovery";
import { createAccountReviewFinancialRegistry } from
  "../../services/account-review-financial-command-service";
import { createAccountReviewSaveService } from
  "../../services/account-review-save-service";
import {
  SmsReviewQueue,
  SmsReviewDraftItem,
} from "./account-review-save-ledger-models";
import {
  clearAndSeed,
  reopenSqliteLedger,
  seedSmsReviewDrafts,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import {
  makeSaveFixture,
  OWNER,
  type SaveFixture,
} from "./account-review-save-test-fixtures";

interface ActualTestDb {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Adapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const { LEDGER_MODEL_CLASSES } = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  const adapter = new Adapter({ schema });
  const database = new wm.Database({
    adapter,
    modelClasses: LEDGER_MODEL_CLASSES,
  });
  return {
    database, __adapter: adapter, schema, Q: wm.Q,
    ...Object.fromEntries(
      LEDGER_MODEL_CLASSES.map((model) => [model.name, model])
    ),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("018f0c7a-1234-4abc-8def-000000000001"),
  supabase: {},
}));

export const { database, __adapter: adapter } =
  jest.requireMock<ActualTestDb>("@monyvi/db");
export const ledger: SqliteLedger = { database, adapter };
export const hashProvider: Sha256Provider = {
  digestUtf8: (input: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(input, "utf8").digest("hex")),
};
let ownerId = OWNER;
let currentSession: AccountReviewSession = makeSaveFixture().session;

export function setActiveReview(fixture: SaveFixture): void {
  currentSession = fixture.session;
}
export function setReviewOwner(owner: string): void {
  ownerId = owner;
}

export function realSaveService(
  db: Database = database
): ReturnType<typeof createAccountReviewSaveService> {
  return createAccountReviewSaveService({
    database: db,
    hashProvider,
    getCurrentOwnerId: (): Promise<string> => Promise.resolve(ownerId),
    loadCurrentSession: (
      _owner: string, _session: string
    ): Promise<AccountReviewSession> => Promise.resolve(currentSession),
  });
}

export function saveReview(
  fixture: SaveFixture,
  db: Database = database
): ReturnType<ReturnType<typeof createAccountReviewSaveService>["saveSelectedAccountReview"]> {
  setActiveReview(fixture);
  return realSaveService(db).saveSelectedAccountReview(fixture);
}

export async function resetRecoverySqlite(): Promise<void> {
  await adapter.initializingPromise;
  jest.restoreAllMocks();
  ownerId = OWNER;
  currentSession = makeSaveFixture().session;
  await clearAndSeed(database);
}

export async function cloneRecoverySqlite(): Promise<Database> {
  return reopenSqliteLedger(ledger);
}

export async function requireActionRoot(
  db: Database = database
): Promise<FinancialActionGroup> {
  const roots = await db.get<FinancialActionGroup>(
    "financial_action_groups"
  ).query(Q.where("user_id", OWNER)).fetch();
  expect(roots).toHaveLength(1);
  const root = roots[0];
  if (!root) throw new Error("missing_physical_action_root");
  return root;
}

/** Derive the private reader's expected scope from the stored PUBLIC envelope. */
export function readPrivateOwnedRoot(root: FinancialActionGroup): ReturnType<
  typeof parseAccountReviewLocalSaveSnapshot
> {
  const envelope = parseFinancialActionEnvelopeJson(
    root.payloadJson, createAccountReviewFinancialRegistry()
  );
  const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
  if (!root.localRecoverySnapshotJson)
    throw new Error("missing_device_local_recovery_snapshot");
  return parseAccountReviewLocalSaveSnapshot({
    json: root.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: root.actionId,
      ownerId: root.userId,
      sessionId: payload.sessionId,
      source: payload.source,
    },
  });
}

/** Convert only this suite's old Save queue fixture into true session identity. */
export async function seedBoundSmsReview(
  fixture: SaveFixture,
  db: Database = database
): Promise<void> {
  if (fixture.session.source !== "SMS")
    throw new Error("sms_recovery_fixture_required");
  await seedSmsReviewDrafts(db, fixture.session);
  const queues = await db.get<SmsReviewQueue>("sms_review_queues").query().fetch();
  const original = queues[0];
  if (queues.length !== 1 || !original)
    throw new Error("expected_single_real_sms_queue");
  if (original.id === fixture.session.sessionId) return;
  const drafts = await db.get<SmsReviewDraftItem>(
    "sms_review_draft_items"
  ).query().fetch();
  await db.write(async (): Promise<void> => {
    const replacement = db.get<SmsReviewQueue>(
      "sms_review_queues"
    ).prepareCreate((row): void => {
      row._raw.id = fixture.session.sessionId;
      row.userId = fixture.session.ownerId;
    });
    const linked = drafts.map((draft) =>
      draft.prepareUpdate((row): void => {
        row.queueId = fixture.session.sessionId;
      })
    );
    await db.batch(original.prepareDestroyPermanently(), replacement, ...linked);
  });
}

export async function ownedPhysicalRows(
  db: Database,
  table: string
): Promise<readonly Model[]> {
  return db.get<Model>(table).query().fetch();
}
