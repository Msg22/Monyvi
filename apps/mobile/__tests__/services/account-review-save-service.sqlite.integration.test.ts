/**
 * T043 S25–S36: REAL multi-model SQLite ledger, adapter and fresh clones.
 * This test suite deliberately imports the absent future Save SUT.
 * Better-sqlite3 is verified by Root on main, NOT run by this remote worker.
 */
import { createHash } from "node:crypto";
import type { Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { Account, FinancialActionGroup, Transaction, AccountFinancialEffect } from "@monyvi/db";
import type { AccountReviewSession } from "@monyvi/logic";
import type { Sha256Provider } from "../../../../packages/logic/src/financial-actions";
import { createAccountReviewSaveService } from "../../services/account-review-save-service";
import {
  ACTION, OWNER, FOREIGN_OWNER, BANK, CASH, FINGERPRINT_B,
  makeSaveFixture, selectedSmsFingerprint, type SaveFixture,
} from "./account-review-save-test-fixtures";
import {
  clearAndSeed, ledgerState, reopenSqliteLedger, injectMidBatchDuplicate,
  seedSavedFingerprint, seedSmsReviewDrafts, type SqliteLedger,
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
    typeof import("./account-review-save-sqlite-test-helpers")
  >("./account-review-save-sqlite-test-helpers").LEDGER_MODEL_CLASSES;
  const adapter = new Sqlite({ schema });
  const database = new wm.Database({ adapter, modelClasses: models });
  return {
    database, __adapter: adapter, schema, Q: wm.Q,
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
function service(db: Database): ReturnType<typeof createAccountReviewSaveService> {
  return createAccountReviewSaveService({
    database: db, hashProvider,
    getCurrentOwnerId: (): Promise<string> => {
      reads += 1;
      return Promise.resolve(alternateOwner !== null && reads >= 2
        ? alternateOwner : actor);
    },
    loadCurrentSession: (_owner: string, _session: string): Promise<AccountReviewSession> =>
      Promise.resolve(currentSession),
  });
}
function save(
  f: SaveFixture, db: Database = database
): ReturnType<ReturnType<typeof createAccountReviewSaveService>["saveSelectedAccountReview"]> {
  currentSession = f.session;
  return service(db).saveSelectedAccountReview(f);
}
async function actionRoots(db: Database): Promise<readonly FinancialActionGroup[]> {
  return db.get<FinancialActionGroup>("financial_action_groups").query().fetch();
}
beforeEach(async (): Promise<void> => {
  await adapter.initializingPromise;
  await clearAndSeed(database);
  actor = OWNER; alternateOwner = null; reads = 0;
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
      accounts: 4, bankDetails: 1, senders: 1,
      transactions: 2, transfers: 0, effects: 1,
      actions: 1, draftItems: 0,
    });
    expect(persisted.accounts.find((x) => x.id === f.intent.plannedEntityIds
      .find((id) => id.entity === "account")?.id))
      .toMatchObject({ balance: 15, financialRevision: "1" });
  });

  it("S25b creates one Wallet sender child and no BankDetails in fresh SQLite", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-wallet");
    await seedSmsReviewDrafts(database, f.session);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const state = await ledgerState(fresh);
    expect(state.counts).toMatchObject({
      accounts: 4, bankDetails: 0, senders: 1,
      transactions: 1, transfers: 0, effects: 1,
      actions: 1, draftItems: 0,
    });
    const planned = f.intent.plannedEntityIds.find((p) => p.entity === "account");
    if (!planned) throw new Error("Missing Wallet account ID");
    const account = await fresh.get<Account>("accounts").find(planned.id);
    expect(account.type).toBe("DIGITAL_WALLET");
    expect(account.balance).toBe(10);
    const senderRows = await fresh.get<import("@monyvi/db").AccountSmsSender>(
      "account_sms_senders"
    ).query().fetch();
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
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(baseline);
    expect((await actionRoots(fresh))[0]?.actionId).toBe(ACTION);
  });

  it("S27 an identical action ID with altered frozen occurrence/hash is rejected", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const before = await ledgerState(fresh);
    const intent = { ...f.intent, occurredAt: "2026-10-15T12:00:01.000Z" };
    const changed: SaveFixture = {
      session: { ...f.session, saveIntent: intent }, intent,
    };
    await expect(save(changed, fresh)).rejects.toThrow();
    expect(await ledgerState(fresh)).toEqual(before);
    expect((await actionRoots(fresh))).toHaveLength(1);
  });

  it("S28 a real within-batch SQLite UNIQUE conflict rolls all linked tables back", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    const before = await ledgerState(await reopenSqliteLedger(ledger));
    const release = injectMidBatchDuplicate(database);
    try {
      await expect(save(f)).rejects.toThrow();
    } finally {
      release();
    }
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(before);
    expect((await actionRoots(database))).toHaveLength(0);
  });

  it("S29 after physical rollback the SAME cached service/input retries once", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    currentSession = f.session;
    const writer = service(database);
    const frozenInput: SaveFixture = f;
    const release = injectMidBatchDuplicate(database);
    try {
      await expect(writer.saveSelectedAccountReview(frozenInput)).rejects.toThrow();
    } finally {
      release();
    }
    const afterFailure = await ledgerState(await reopenSqliteLedger(ledger));
    expect(afterFailure.counts.actions).toBe(0);
    await expect(writer.saveSelectedAccountReview(frozenInput))
      .resolves.toMatchObject({ kind: "committed" });
    const afterRetry = await ledgerState(await reopenSqliteLedger(ledger));
    expect(afterRetry.counts.actions).toBe(1);
    expect(afterRetry.counts.transactions).toBe(1);
    expect(afterRetry.counts.effects).toBe(1);
    expect(afterRetry.counts.draftItems).toBe(afterFailure.counts.draftItems);
  });

  it("S30 rejects an already-existing planned financial create ID without overwriting it", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    const planned = f.intent.plannedEntityIds.find((id) => id.entity === "transaction");
    if (!planned) throw new Error("Missing planned transaction ID");
    const selected = f.session.rows[0];
    if (!selected) throw new Error("Missing selected source row");
    await database.write(async (): Promise<void> => {
      const tx = database.get<Transaction>("transactions").prepareCreate((record): void => {
        record._raw.id = planned.id;
        record.userId = OWNER; record.accountId = BANK;
        record.amount = 7; record.currency = "EGP";
        record.type = "EXPENSE"; record.categoryId = selected.transaction.categoryId;
        record.source = "VOICE"; record.date = new Date("2026-10-15T12:00:00.000Z");
        record.isDraft = false; record.deleted = false;
      });
      await database.batch(tx);
    });
    const before = await ledgerState(await reopenSqliteLedger(ledger));
    await expect(save(f)).rejects.toThrow();
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(before);
  });

  it("S31 the existing account's selected delta posts once without new draft account", async (): Promise<void> => {
    const f = makeSaveFixture("voice-existing");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const snapshot = await ledgerState(await reopenSqliteLedger(ledger));
    expect(snapshot.accounts.find((account) => account.id === BANK))
      .toMatchObject({ balance: 90, financialRevision: "1" });
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
    expect(persisted.accounts.find((account) => account.id === BANK))
      .toMatchObject({ balance: 100, financialRevision: "1" });
    const effects = await fresh.get<AccountFinancialEffect>("account_financial_effects").query().fetch();
    expect(effects[0]?.amountMinorUnits).toBe("0");
    expect(effects[0]?.isEffective).toBe(true);
  });

  it("S33 shared SMS Save rebinds unselected siblings but never auto-selects CIB", async (): Promise<void> => {
    const f = makeSaveFixture("sms-shared");
    await seedSmsReviewDrafts(database, f.session);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const state = await ledgerState(fresh);
    expect(state.counts.accounts).toBe(4);
    expect(state.counts.transactions).toBe(1);
    expect(state.counts.draftItems).toBe(3);
    expect(state.drafts.every((draft) => draft.selectionOverride === false)).toBe(true);
    const createdId = f.intent.plannedEntityIds.find((x) => x.entity === "account")?.id;
    if (!createdId) throw new Error("Shared group missing planned account");
    const remainingQnb = state.drafts.filter((draft) =>
      draft.fingerprint === f.session.rows[1]?.sourceFingerprint ||
      draft.fingerprint === f.session.rows[2]?.sourceFingerprint
    );
    expect(remainingQnb).toHaveLength(2);
    expect(remainingQnb.every((draft) => draft.payloadJson.includes(createdId))).toBe(true);
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
      kind: "cleanup_only", resolvedSmsDraftCount: 1,
    });
    const snapshot = await ledgerState(await reopenSqliteLedger(ledger));
    expect(snapshot.counts).toMatchObject({
      actions: 0, effects: 0, draftItems: 0, transfers: 1, transactions: 0,
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
    expect(payload).not.toMatch(/rawSmsBody|rawSms|payloadJson|originalTranscript|undoToken|accountReviewSession|evidenceSpans|selectedRows/);
    expect(payload).toContain("localSmsBookkeeping");
    expect(roots[0]?.userId).toBe(OWNER);
  });
});
