/**
 * T043 S25–S36: REAL multi-model SQLite ledger, adapter and fresh clones.
 * This test suite deliberately imports the absent future Save SUT.
 * Better-sqlite3 is verified by Root on main, NOT run by this remote worker.
 */
import { createHash } from "node:crypto";
import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  Category,
  FinancialActionGroup,
  Transaction,
  AccountFinancialEffect,
  SmsReviewDraftItem,
} from "@monyvi/db";
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "@monyvi/logic";
import type { Sha256Provider } from "../../../../packages/logic/src/financial-actions";
import { createAccountReviewSaveService } from "../../services/account-review-save-service";
import {
  captureOriginalMixedSmsWitnesses,
  assertMixedSmsOriginalCleanup,
} from "./account-review-mixed-sms-bookkeeping-assertions";
import {
  ACTION,
  OWNER,
  FOREIGN_OWNER,
  BANK,
  CATEGORY,
  GROUP_CIB,
  GROUP_QNB,
  FINGERPRINT_A,
  FINGERPRINT_C,
  makeSaveFixture,
  selectedSmsFingerprint,
  testUuid,
  type SaveFixture,
} from "./account-review-save-test-fixtures";
import {
  clearAndSeed,
  ledgerState,
  reopenSqliteLedger,
  injectMidBatchDuplicate,
  physicalSaveLedgerSnapshot,
  seedOwnedBankWithoutDefault,
  replaceOwnedDraftFingerprint,
  seedSavedFingerprint,
  seedSmsReviewDrafts,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";

interface MockDb {
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
let actor = OWNER;
let reads = 0;
let alternateOwner: string | null = null;
let currentSession: AccountReviewSession = makeSaveFixture().session;
function service(
  db: Database
): ReturnType<typeof createAccountReviewSaveService> {
  return createAccountReviewSaveService({
    database: db,
    hashProvider,
    getCurrentOwnerId: (): Promise<string> => {
      reads += 1;
      return Promise.resolve(
        alternateOwner !== null && reads >= 2 ? alternateOwner : actor
      );
    },
    loadCurrentSession: (
      _owner: string,
      _session: string
    ): Promise<AccountReviewSession> => Promise.resolve(currentSession),
  });
}
function save(
  f: SaveFixture,
  db: Database = database
): ReturnType<
  ReturnType<typeof createAccountReviewSaveService>["saveSelectedAccountReview"]
> {
  currentSession = f.session;
  return service(db).saveSelectedAccountReview(f);
}
async function actionRoots(
  db: Database
): Promise<readonly FinancialActionGroup[]> {
  return db
    .get<FinancialActionGroup>("financial_action_groups")
    .query()
    .fetch();
}
/** Read cross-realm SQLite failures structurally; never accept arbitrary rejection. */
async function expectTransactionIdSqliteConflict(
  action: Promise<unknown>
): Promise<void> {
  let failure: unknown = null;
  try {
    await action;
  } catch (error: unknown) {
    failure = error;
  }
  if (
    typeof failure !== "object" ||
    failure === null ||
    !("code" in failure) ||
    !("message" in failure) ||
    typeof failure.code !== "string" ||
    typeof failure.message !== "string"
  ) {
    throw new Error("Expected SQLite transactions.id constraint error");
  }
  expect(failure.code).toMatch(/^SQLITE_CONSTRAINT_(?:PRIMARYKEY|UNIQUE)$/);
  expect(failure.message).toMatch(/UNIQUE constraint failed: transactions\.id/);
}

/** A rejected replay may not alter physical tables OR already loaded cache models. */
async function expectImmutableRejectedFreshReplay(
  changed: SaveFixture
): Promise<void> {
  const fresh = await reopenSqliteLedger(ledger);
  const before = await physicalSaveLedgerSnapshot(fresh);
  const tables = [
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
  const cachedModels = (
    await Promise.all(
      tables.map((table) => fresh.get<Model>(table).query().fetch())
    )
  ).flat();
  const cachedBefore = cachedModels.map((model) => JSON.stringify(model._raw));
  const ledgerBefore = await ledgerState(fresh);
  expect(ledgerBefore.counts.actions).toBe(1);
  expect(ledgerBefore.counts.effects).toBeGreaterThan(0);
  await expect(save(changed, fresh)).rejects.toThrow();
  expect(
    await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
  ).toEqual(before);
  expect(cachedModels.map((model) => JSON.stringify(model._raw))).toEqual(
    cachedBefore
  );
  expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(
    ledgerBefore
  );
}
beforeEach(async (): Promise<void> => {
  await adapter.initializingPromise;
  await clearAndSeed(database);
  actor = OWNER;
  alternateOwner = null;
  reads = 0;
  currentSession = makeSaveFixture().session;
  jest.restoreAllMocks();
});

describe("T043 physical SQLite selected-save and immutable action", () => {
  it("S25 commits Bank, bank child, sender, two SMS records, effects and draft cleanup together", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const persisted = await ledgerState(await reopenSqliteLedger(ledger));
    expect(persisted.counts).toMatchObject({
      accounts: 4,
      bankDetails: 1,
      senders: 1,
      transactions: 2,
      transfers: 0,
      effects: 1,
      actions: 1,
      draftItems: 0,
    });
    expect(
      persisted.accounts.find(
        (x) =>
          x.id ===
          f.intent.plannedEntityIds.find((id) => id.entity === "account")?.id
      )
    ).toMatchObject({ balance: 15, financialRevision: "1" });
  });

  it("S25b creates one Wallet sender child and no BankDetails in fresh SQLite", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-wallet");
    await seedSmsReviewDrafts(database, f.session);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const state = await ledgerState(fresh);
    expect(state.counts).toMatchObject({
      accounts: 4,
      bankDetails: 0,
      senders: 1,
      transactions: 1,
      transfers: 0,
      effects: 1,
      actions: 1,
      draftItems: 0,
    });
    const planned = f.intent.plannedEntityIds.find(
      (p) => p.entity === "account"
    );
    if (!planned) throw new Error("Missing Wallet account ID");
    const account = await fresh.get<Account>("accounts").find(planned.id);
    expect(account.type).toBe("DIGITAL_WALLET");
    expect(account.balance).toBe(10);
    const senderRows = await fresh
      .get<import("@monyvi/db").AccountSmsSender>("account_sms_senders")
      .query()
      .fetch();
    expect(senderRows).toHaveLength(1);
    expect(senderRows[0]?.accountId).toBe(planned.id);
    expect(senderRows[0]?.normalizedSenderName).toBe("wally pay");
  });

  it("S26 a fresh-instance replay with the same frozen intent applies zero second changes", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const baseline = await ledgerState(fresh);
    await expect(save(f, fresh)).resolves.toMatchObject({ kind: "replay" });
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(
      baseline
    );
    expect((await actionRoots(fresh))[0]?.actionId).toBe(ACTION);
  });

  it("S26b replays an identical partial SMS-dedup intent with omitted saved row and physical plan", async (): Promise<void> => {
    const fixture = makeSaveFixture("sms-mixed");
    expect(fixture.intent.selectedRows).toHaveLength(2);
    expect(
      fixture.intent.plannedEntityIds.filter(
        (item) => item.entity === "transaction"
      )
    ).toHaveLength(2);
    await seedSmsReviewDrafts(database, fixture.session);
    const originalWitness = captureOriginalMixedSmsWitnesses(
      await database
        .get<SmsReviewDraftItem>("sms_review_draft_items")
        .query()
        .fetch()
    );
    const frozenBytes = JSON.stringify(fixture);
    await seedSavedFingerprint(database, FINGERPRINT_A, "transaction");
    await expect(save(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const roots = await actionRoots(fresh);
    expect(roots).toHaveLength(1);
    const root = roots[0];
    if (!root) throw new Error("mixed_sms_action_root_missing");
    assertMixedSmsOriginalCleanup(root, fixture, originalWitness);
    const committed = await physicalSaveLedgerSnapshot(fresh);
    const before = await ledgerState(fresh);
    expect(before.counts).toMatchObject({
      accounts: 3,
      transactions: 2,
      effects: 1,
      actions: 1,
      draftItems: 0,
    });
    await expect(save(fixture, fresh)).resolves.toMatchObject({
      kind: "replay",
    });
    expect(
      await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
    ).toEqual(committed);
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(before);
    expect((await actionRoots(fresh))[0]?.actionId).toBe(ACTION);
    expect(JSON.stringify(fixture)).toBe(frozenBytes);
  });

  it("S27 an identical action ID with altered frozen occurrence/hash is rejected", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const before = await ledgerState(fresh);
    const intent = { ...f.intent, occurredAt: "2026-10-15T12:00:01.000Z" };
    const changed: SaveFixture = {
      session: { ...f.session, saveIntent: intent },
      intent,
    };
    await expect(save(changed, fresh)).rejects.toThrow();
    expect(await ledgerState(fresh)).toEqual(before);
    expect(await actionRoots(fresh)).toHaveLength(1);
  });

  it("S27b rejects a coherent changed amount on fresh-instance replay without touching stored action", async (): Promise<void> => {
    const original = makeSaveFixture("voice-existing");
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const row = original.session.rows[0];
    if (!row || row.source !== "VOICE")
      throw new Error("Expected selected Voice row");
    const changedSession = accountReviewSessionSchema.parse({
      ...original.session,
      rows: original.session.rows.map((item) =>
        item.rowId === row.rowId
          ? {
              ...row,
              amountDecimal: "14",
              transaction: { ...row.transaction, amount: 14 },
            }
          : item
      ),
    });
    const changed: SaveFixture = {
      session: changedSession,
      intent: original.intent,
    };
    expect(changed.intent).toEqual(original.intent);
    expect(changed.session.rows[0]?.amountDecimal).toBe("14");
    expect(changed.session.rows[0]?.transaction.amount).toBe(14);
    await expectImmutableRejectedFreshReplay(changed);
  });

  it("S27c rejects a structurally valid added selection with prior frozen members intact", async (): Promise<void> => {
    const original = makeSaveFixture("voice-shared");
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const extra = original.session.rows.find(
      (row) =>
        !row.selected &&
        row.assignment.state === "suggested" &&
        row.assignment.groupId === GROUP_QNB
    );
    if (!extra) throw new Error("Expected unselected linked QNB row");
    const newIntent = accountReviewSaveIntentSchema.parse({
      ...original.intent,
      expectedReviewRevision: "1",
      expectedOperationGeneration: "1",
      selectedRows: [
        ...original.intent.selectedRows,
        { rowId: extra.rowId, revision: "1" },
      ],
      plannedEntityIds: [
        ...original.intent.plannedEntityIds,
        { entity: "transaction", localRef: extra.rowId, id: testUuid(990) },
      ],
    });
    const session = accountReviewSessionSchema.parse({
      ...original.session,
      revision: "1",
      operationGeneration: "1",
      rows: original.session.rows.map((row) =>
        row.rowId === extra.rowId
          ? { ...row, selected: true, revision: "1" }
          : row
      ),
      saveIntent: newIntent,
    });
    const changed: SaveFixture = { session, intent: newIntent };
    expect(newIntent.actionId).toBe(original.intent.actionId);
    expect(newIntent.occurredAt).toBe(original.intent.occurredAt);
    expect(
      newIntent.plannedEntityIds.slice(
        0,
        original.intent.plannedEntityIds.length
      )
    ).toEqual(original.intent.plannedEntityIds);
    expect(newIntent.selectedRows).toHaveLength(
      original.intent.selectedRows.length + 1
    );
    await expectImmutableRejectedFreshReplay(changed);
  });

  it("S27d rejects changed confirmed-group identity after an SMS action committed", async (): Promise<void> => {
    const original = makeSaveFixture("sms-shared");
    await seedSmsReviewDrafts(database, original.session);
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const initialLedger = await ledgerState(await reopenSqliteLedger(ledger));
    expect(initialLedger.counts.draftItems).toBe(3);
    const qnb = original.session.groups.find(
      (group) => group.groupId === GROUP_QNB
    );
    if (!qnb || qnb.status !== "confirmed")
      throw new Error("Expected confirmed QNB group");
    const session = accountReviewSessionSchema.parse({
      ...original.session,
      groups: original.session.groups.map((group) =>
        group.groupId === qnb.groupId
          ? { ...group, name: "QNB Edited Savings" }
          : group
      ),
    });
    const changed: SaveFixture = { session, intent: original.intent };
    expect(changed.intent).toEqual(original.intent);
    expect(
      session.groups.find((group) => group.groupId === qnb.groupId)
    ).toMatchObject({
      groupId: qnb.groupId,
      revision: qnb.revision,
      evidenceKey: qnb.evidenceKey,
      name: "QNB Edited Savings",
    });
    await expectImmutableRejectedFreshReplay(changed);
  });

  it("S28 a real within-batch SQLite UNIQUE conflict rolls all linked tables back", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    const before = await ledgerState(await reopenSqliteLedger(ledger));
    const physicalBefore = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const nativeFault = injectMidBatchDuplicate(database);
    try {
      await expectTransactionIdSqliteConflict(save(f));
    } finally {
      nativeFault.restore();
    }
    expect(nativeFault.injectedCount()).toBe(1);
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(before);
    expect(
      await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
    ).toEqual(physicalBefore);
    expect(await actionRoots(database)).toHaveLength(0);
  });

  it("S29 after physical rollback the SAME cached service/input retries once", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    currentSession = f.session;
    const writer = service(database);
    const frozenInput: SaveFixture = f;
    const cachedBank = await database.get<Account>("accounts").find(BANK);
    const cachedBefore = JSON.stringify(cachedBank._raw);
    const nativeFault = injectMidBatchDuplicate(database);
    try {
      await expectTransactionIdSqliteConflict(
        writer.saveSelectedAccountReview(frozenInput)
      );
    } finally {
      nativeFault.restore();
    }
    expect(nativeFault.injectedCount()).toBe(1);
    const afterFailure = await ledgerState(await reopenSqliteLedger(ledger));
    expect(afterFailure.counts.actions).toBe(0);
    expect(JSON.stringify(cachedBank._raw)).toBe(cachedBefore);
    await expect(
      writer.saveSelectedAccountReview(frozenInput)
    ).resolves.toMatchObject({ kind: "committed" });
    const afterRetry = await ledgerState(await reopenSqliteLedger(ledger));
    expect(afterRetry.counts.actions).toBe(1);
    expect(afterRetry.counts.transactions).toBe(1);
    expect(afterRetry.counts.effects).toBe(1);
    expect(afterRetry.counts.draftItems).toBe(afterFailure.counts.draftItems);
  });

  it("S30 rejects an already-existing planned financial create ID without overwriting it", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    const planned = f.intent.plannedEntityIds.find(
      (id) => id.entity === "transaction"
    );
    if (!planned) throw new Error("Missing planned transaction ID");
    const selected = f.session.rows[0];
    if (!selected) throw new Error("Missing selected source row");
    await database.write(async (): Promise<void> => {
      const tx = database
        .get<Transaction>("transactions")
        .prepareCreate((record): void => {
          record._raw.id = planned.id;
          record.userId = OWNER;
          record.accountId = BANK;
          record.amount = 7;
          record.currency = "EGP";
          record.type = "EXPENSE";
          record.categoryId = selected.transaction.categoryId;
          record.source = "VOICE";
          record.date = new Date("2026-10-15T12:00:00.000Z");
          record.isDraft = false;
          record.deleted = false;
        });
      await database.batch(tx);
    });
    const before = await ledgerState(await reopenSqliteLedger(ledger));
    await expectTransactionIdSqliteConflict(save(f));
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(before);
  });

  it("S31 the existing account's selected delta posts once without new draft account", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const snapshot = await ledgerState(await reopenSqliteLedger(ledger));
    expect(
      snapshot.accounts.find((account) => account.id === BANK)
    ).toMatchObject({ balance: 90, financialRevision: "1" });
    expect(snapshot.counts.accounts).toBe(3);
    expect(snapshot.counts.bankDetails).toBe(0);
    expect(snapshot.counts.senders).toBe(0);
  });

  it("S32 zero-net creates two real financial rows and advances the unchanged balance's revision", async (): Promise<void> => {
    const f = makeSaveFixture("voice-zero-net");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const persisted = await ledgerState(fresh);
    expect(persisted.counts.transactions).toBe(2);
    expect(persisted.counts.effects).toBe(1);
    expect(
      persisted.accounts.find((account) => account.id === BANK)
    ).toMatchObject({ balance: 100, financialRevision: "1" });
    const effects = await fresh
      .get<AccountFinancialEffect>("account_financial_effects")
      .query()
      .fetch();
    expect(effects[0]?.amountMinorUnits).toBe("0");
    expect(effects[0]?.isEffective).toBe(true);
  });

  it("S33 shared SMS Save rebinds unselected siblings but never auto-selects CIB", async (): Promise<void> => {
    const f = makeSaveFixture("sms-shared");
    await seedSmsReviewDrafts(database, f.session);
    const cib = f.session.rows.find(
      (row) =>
        row.assignment.state === "suggested" &&
        row.assignment.groupId === GROUP_CIB &&
        !row.selected
    );
    if (!cib) throw new Error("Expected independent unchecked CIB review row");
    const prior = await ledgerState(database);
    const untouched = prior.drafts.find(
      (draft) => draft.fingerprint === cib.sourceFingerprint
    );
    if (!untouched)
      throw new Error("Missing independently unselected CIB draft");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const state = await ledgerState(fresh);
    expect(state.counts.accounts).toBe(4);
    expect(state.counts.transactions).toBe(1);
    expect(state.counts.draftItems).toBe(3);
    expect(
      state.drafts.every((draft) => draft.selectionOverride === false)
    ).toBe(true);
    expect(state.drafts.find((draft) => draft.id === untouched.id)).toEqual(
      untouched
    );
    expect(state.counts.queues).toBe(prior.counts.queues);
    const createdId = f.intent.plannedEntityIds.find(
      (x) => x.entity === "account"
    )?.id;
    if (!createdId) throw new Error("Shared group missing planned account");
    const remainingQnb = state.drafts.filter(
      (draft) =>
        draft.fingerprint === f.session.rows[1]?.sourceFingerprint ||
        draft.fingerprint === f.session.rows[2]?.sourceFingerprint
    );
    expect(remainingQnb).toHaveLength(2);
    expect(
      remainingQnb.every((draft) => draft.payloadJson.includes(createdId))
    ).toBe(true);
  });

  it("S34 a throwing postcommit observer cannot turn durable Save into a rollback", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    const account = await database.get<Account>("accounts").find(BANK);
    const unsubscribe = account.experimentalSubscribe((): void => {
      throw new Error("observer failed after adapter commit");
    });
    try {
      await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    } finally {
      unsubscribe();
    }
    const fresh = await reopenSqliteLedger(ledger);
    const state = await ledgerState(fresh);
    expect(state.counts.actions).toBe(1);
    expect(state.counts.transactions).toBe(1);
    expect(state.counts.effects).toBe(1);
    await expect(save(f, fresh)).resolves.toMatchObject({ kind: "replay" });
  });

  it("S35 an all-dedup SMS cleanup survives restart without a fabricated action", async (): Promise<void> => {
    const f = makeSaveFixture("sms-all-dedup");
    await seedSmsReviewDrafts(database, f.session);
    await seedSavedFingerprint(database, selectedSmsFingerprint(f), "transfer");
    await expect(save(f)).resolves.toMatchObject({
      kind: "cleanup_only",
      resolvedSmsDraftCount: 1,
    });
    const snapshot = await ledgerState(await reopenSqliteLedger(ledger));
    expect(snapshot.counts).toMatchObject({
      actions: 0,
      effects: 0,
      draftItems: 0,
      transfers: 1,
      transactions: 0,
    });
  });

  it("S36 canonical cloud payload keeps raw SMS, transcript and local draft snapshots off-wire", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const roots = await actionRoots(fresh);
    expect(roots).toHaveLength(1);
    const payload = roots[0]?.payloadJson ?? "";
    expect(payload).toContain("review.batch-save/v1");
    expect(payload).toContain('"creationDefaultSnapshot"');
    expect(payload).not.toContain('"cashDefaultSnapshot"');
    expect(payload).not.toMatch(
      /rawSmsBody|rawSms|payloadJson|originalTranscript|undoToken|accountReviewSession|evidenceSpans|selectedRows/
    );
    expect(payload).toContain("localSmsBookkeeping");
    expect(roots[0]?.userId).toBe(OWNER);
  });

  it("S37 after a real Bank/child/SMS mid-batch conflict the SAME writer safely retries once", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    currentSession = f.session;
    const writer = service(database);
    const existingBank = await database.get<Account>("accounts").find(BANK);
    const existingCategory = await database
      .get<Category>("categories")
      .find(CATEGORY);
    const cachedBefore = [
      JSON.stringify(existingBank._raw),
      JSON.stringify(existingCategory._raw),
    ];
    const before = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const nativeFault = injectMidBatchDuplicate(database);
    try {
      await expectTransactionIdSqliteConflict(
        writer.saveSelectedAccountReview(f)
      );
    } finally {
      nativeFault.restore();
    }
    expect(nativeFault.injectedCount()).toBe(1);
    expect(
      await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
    ).toEqual(before);
    expect([
      JSON.stringify(existingBank._raw),
      JSON.stringify(existingCategory._raw),
    ]).toEqual(cachedBefore);
    await expect(writer.saveSelectedAccountReview(f)).resolves.toMatchObject({
      kind: "committed",
    });
    const committed = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const state = await ledgerState(await reopenSqliteLedger(ledger));
    expect(state.counts).toMatchObject({
      accounts: 4,
      bankDetails: 1,
      senders: 1,
      transactions: 2,
      actions: 1,
      effects: 1,
      draftItems: 0,
    });
    await expect(writer.saveSelectedAccountReview(f)).resolves.toMatchObject({
      kind: "replay",
    });
    expect(
      await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
    ).toEqual(committed);
  });

  it("S38 a first active review Bank or Wallet gets the only default with type-safe children", async (): Promise<void> => {
    for (const [scenario, kind, bankChild] of [
      ["sms-new-bank", "BANK", 1],
      ["sms-new-wallet", "DIGITAL_WALLET", 0],
    ] as const) {
      await clearAndSeed(database, { onlyCategories: true });
      const f = makeSaveFixture(scenario);
      await seedSmsReviewDrafts(database, f.session);
      await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
      const fresh = await reopenSqliteLedger(ledger);
      const state = await ledgerState(fresh);
      const account = f.intent.plannedEntityIds.find(
        (item) => item.entity === "account"
      );
      if (!account) throw new Error("Missing frozen account-create UUID");
      expect(state.counts.accounts).toBe(1);
      expect(
        state.accounts.find((item) => item.id === account.id)?.isDefault
      ).toBe(true);
      expect(state.counts.bankDetails).toBe(bankChild);
      expect((await fresh.get<Account>("accounts").find(account.id)).type).toBe(
        kind
      );
      const roots = await actionRoots(fresh);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.payloadJson).toContain('"creationDefaultSnapshot"');
    }
  });

  it("S39 review account creation preserves a current nonempty no-default state", async (): Promise<void> => {
    await clearAndSeed(database, { onlyCategories: true });
    await seedOwnedBankWithoutDefault(database);
    const f = makeSaveFixture("voice-cash");
    const old = await ledgerState(database);
    expect(old.counts.accounts).toBe(1);
    expect(old.accounts[0]?.isDefault).toBe(false);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const state = await ledgerState(fresh);
    expect(state.counts.accounts).toBe(2);
    expect(state.accounts.filter((item) => item.isDefault)).toHaveLength(0);
    expect(state.accounts.find((item) => item.id === BANK)).toMatchObject({
      balance: 100,
      financialRevision: "0",
      isDefault: false,
    });
    const accountId = f.intent.plannedEntityIds.find(
      (item) => item.entity === "account"
    )?.id;
    if (!accountId) throw new Error("Missing frozen Cash create ID");
    // voice-cash's canonical row is EXPENSE 11: selected signed delta is -11.
    expect(state.accounts.find((item) => item.id === accountId)).toMatchObject({
      balance: -11,
      financialRevision: "1",
      isDefault: false,
    });
    const roots = await actionRoots(fresh);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.payloadJson).toContain('"creationDefaultSnapshot"');
  });

  it("S40 a replaced owned v2 queue fingerprint cannot save the stale frozen row", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    await replaceOwnedDraftFingerprint(
      database,
      f.session,
      FINGERPRINT_A,
      FINGERPRINT_C
    );
    const before = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const prior = await ledgerState(database);
    expect(
      prior.drafts.some((draft) => draft.fingerprint === FINGERPRINT_C)
    ).toBe(true);
    expect(
      prior.drafts.some((draft) => draft.fingerprint === FINGERPRINT_A)
    ).toBe(false);
    await expect(save(f)).rejects.toThrow();
    expect(
      await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
    ).toEqual(before);
    const after = await ledgerState(await reopenSqliteLedger(ledger));
    expect(after.counts).toMatchObject({
      accounts: 3,
      actions: 0,
      effects: 0,
      transactions: 0,
      draftItems: 2,
      queues: 1,
    });
    expect(after.drafts).toEqual(prior.drafts);
  });

  it("S41 a real queued writer cannot commit after the actor changes across owner checks", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    const before = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    let notify = (): void => {
      throw new Error("Writer not entered");
    };
    let unlock = (): void => {
      throw new Error("Writer not held");
    };
    const entered = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = database.write(async (): Promise<void> => {
      notify();
      await resume;
    });
    await entered;
    currentSession = f.session;
    alternateOwner = FOREIGN_OWNER; // First owner check OWNER, later check FOREIGN.
    const pending = service(database).saveSelectedAccountReview(f);
    const rejected = expect(pending).rejects.toThrow();
    try {
      await Promise.resolve();
      unlock();
      await rejected;
    } finally {
      unlock();
      await blocker;
    }
    expect(reads).toBeGreaterThan(1);
    expect(
      await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
    ).toEqual(before);
  });
});
