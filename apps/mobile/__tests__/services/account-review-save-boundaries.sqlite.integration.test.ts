/**
 * #395 T048 independently scoped REAL SQLite Save boundary regressions.
 * Tests only: no fake database, no financial command stub, no production writes.
 * The existing Save SQLite model registry and canonical fixtures are reused.
 */
import { createHash } from "node:crypto";
import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  type AccountReviewSession,
  type AccountReviewSaveIntent,
} from "@monyvi/logic";
import type { Sha256Provider } from "../../../../packages/logic/src/financial-actions";
import { createAccountReviewSaveService } from "../../services/account-review-save-service";
import {
  OWNER,
  makeSaveFixture,
  selectedSmsFingerprint,
  testUuid,
} from "./account-review-save-test-fixtures";
import {
  clearAndSeed,
  ledgerState,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  seedSavedFingerprint,
  seedSmsReviewDrafts,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";

interface MockDb {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual("@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js")
);
jest.mock("@monyvi/db", (): Readonly<Record<string, unknown>> => {
  const wm = jest.requireActual<typeof import("@nozbe/watermelondb")>(
    "@nozbe/watermelondb"
  );
  const Sqlite = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const models = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models").LEDGER_MODEL_CLASSES;
  const adapter = new Sqlite({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database,
    __adapter: adapter,
    schema,
    Q: wm.Q,
    ...Object.fromEntries(models.map((model) => [model.name, model])),
  };
});
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("018f0c7a-1234-4abc-8def-000000000001"),
  supabase: {},
}));

const { database, __adapter: adapter } = jest.requireMock<MockDb>("@monyvi/db");
const ledger: SqliteLedger = { database, adapter };
const hashProvider: Sha256Provider = {
  digestUtf8: (text: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(text, "utf8").digest("hex")),
};
let currentSession: AccountReviewSession = makeSaveFixture().session;

function service(): ReturnType<typeof createAccountReviewSaveService> {
  return createAccountReviewSaveService({
    database,
    hashProvider,
    getCurrentOwnerId: (): Promise<string> => Promise.resolve(OWNER),
    loadCurrentSession: (
      _ownerId: string,
      _sessionId: string
    ): Promise<AccountReviewSession> => Promise.resolve(currentSession),
  });
}

const PHYSICAL_TABLES = [
  "accounts",
  "bank_details",
  "account_sms_senders",
  "categories",
  "transactions",
  "transfers",
  "financial_action_groups",
  "account_financial_effects",
  "sms_review_queues",
  "sms_review_draft_items",
  "dismissed_sms_fingerprints",
] as const;

/** Observe the original actual model instances, not only a fresh SQL clone. */
async function loadCachedModels(): Promise<readonly Model[]> {
  const byTable = await Promise.all(
    PHYSICAL_TABLES.map((table) => database.get<Model>(table).query().fetch())
  );
  return byTable.flat();
}

function cachedPreimages(models: readonly Model[]): readonly string[] {
  return models.map((model) =>
    JSON.stringify({
      table: model.table,
      id: model.id,
      raw: model._raw,
      preparedState: model._preparedState ?? null,
    })
  );
}

async function expectCachedModelsUnchanged(
  originals: readonly Model[],
  before: readonly string[]
): Promise<void> {
  expect(cachedPreimages(originals)).toEqual(before);
  const after = await loadCachedModels();
  expect(cachedPreimages(after)).toEqual(before);
  for (const original of originals) {
    const current = after.find(
      (item) => item.table === original.table && item.id === original.id
    );
    expect(current).toBe(original);
  }
}

beforeEach(async (): Promise<void> => {
  await adapter.initializingPromise;
  await clearAndSeed(database);
  currentSession = makeSaveFixture().session;
  jest.restoreAllMocks();
});

describe("#395 Save: real SQLite rejection and frozen membership boundaries", () => {
  it("S42 all-dedup cleanup restores prepared cached deletes after precommit failure and retries once", async (): Promise<void> => {
    const fixture = makeSaveFixture("sms-all-dedup");
    await seedSmsReviewDrafts(database, fixture.session);
    await seedSavedFingerprint(
      database,
      selectedSmsFingerprint(fixture),
      "transfer"
    );
    currentSession = fixture.session;
    const writer = service();
    const beforeSql = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const beforeState = await ledgerState(await reopenSqliteLedger(ledger));
    expect(beforeState.counts).toMatchObject({
      draftItems: 1,
      queues: 1,
      transfers: 1,
      actions: 0,
      effects: 0,
    });
    const cached = await loadCachedModels();
    expect(cached.filter((model) =>
      model.table === "sms_review_draft_items"
    )).toHaveLength(1);
    expect(cached.filter((model) =>
      model.table === "sms_review_queues"
    )).toHaveLength(1);
    const beforeCache = cachedPreimages(cached);
    const deletedTables: string[] = [];
    const precommitFailure = jest.spyOn(adapter, "batch").mockImplementation(
      (operations, callback): void => {
        deletedTables.push(
          ...operations.filter(
            (operation) => operation[0] === "destroyPermanently"
          ).map((operation) => operation[1])
        );
        // SQLiteAdapter.batch uses ResultCallback<void>, not a Promise return.
        callback({ error: new Error("injected_review_cleanup_precommit_failure") });
      }
    );
    try {
      await expect(writer.saveSelectedAccountReview(fixture))
        .rejects.toThrow("injected_review_cleanup_precommit_failure");
    } finally {
      precommitFailure.mockRestore();
    }
    expect([...deletedTables].sort()).toEqual(
      ["sms_review_draft_items", "sms_review_queues"].sort()
    );
    expect(await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger)))
      .toEqual(beforeSql);
    await expectCachedModelsUnchanged(cached, beforeCache);
    expect(await ledgerState(await reopenSqliteLedger(ledger)))
      .toEqual(beforeState);

    await expect(writer.saveSelectedAccountReview(fixture)).resolves.toEqual({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    const after = await ledgerState(await reopenSqliteLedger(ledger));
    expect(after.counts).toMatchObject({
      draftItems: 0,
      queues: 0,
      transfers: 1,
      transactions: 0,
      actions: 0,
      effects: 0,
      bankDetails: 0,
      senders: 0,
    });
  });

  it("S43 rejects an extra unused schema-valid frozen Bank sender member without any write", async (): Promise<void> => {
    const original = makeSaveFixture("sms-new-bank");
    expect(accountReviewSessionSchema.parse(original.session).saveIntent)
      .toEqual(original.intent);
    await seedSmsReviewDrafts(database, original.session);
    const unusedSender: AccountReviewSaveIntent["plannedEntityIds"][number] = {
      entity: "account_sms_sender",
      id: testUuid(980),
      localRef: testUuid(981),
    };
    expect(original.intent.plannedEntityIds).not.toContainEqual(unusedSender);
    const intent = accountReviewSaveIntentSchema.parse({
      ...original.intent,
      plannedEntityIds: [...original.intent.plannedEntityIds, unusedSender],
    });
    const session = accountReviewSessionSchema.parse({
      ...original.session,
      saveIntent: intent,
    });
    expect(intent.plannedEntityIds).toHaveLength(
      original.intent.plannedEntityIds.length + 1
    );
    currentSession = session;
    const writer = service();
    const beforeSql = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const beforeState = await ledgerState(await reopenSqliteLedger(ledger));
    const cached = await loadCachedModels();
    const beforeCache = cachedPreimages(cached);

    await expect(writer.saveSelectedAccountReview({ session, intent }))
      .rejects.toThrow();
    expect(await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger)))
      .toEqual(beforeSql);
    await expectCachedModelsUnchanged(cached, beforeCache);
    expect(await ledgerState(await reopenSqliteLedger(ledger)))
      .toEqual(beforeState);
    expect(beforeState.counts).toMatchObject({
      accounts: 3,
      bankDetails: 0,
      senders: 0,
      transactions: 0,
      transfers: 0,
      effects: 0,
      actions: 0,
      draftItems: 2,
    });

    // Positive control: reject only the extra child, not the complete
    // original frozen selected Bank plan and its legitimate physical members.
    currentSession = original.session;
    await expect(writer.saveSelectedAccountReview(original))
      .resolves.toMatchObject({ kind: "committed" });
    const accepted = await ledgerState(await reopenSqliteLedger(ledger));
    expect(accepted.counts).toMatchObject({
      accounts: 4,
      bankDetails: 1,
      senders: 1,
      transactions: 2,
      transfers: 0,
      actions: 1,
      effects: 1,
      draftItems: 0,
    });
  });
});
