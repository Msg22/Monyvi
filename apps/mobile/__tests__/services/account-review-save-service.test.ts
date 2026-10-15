/**
 * #395 T043 US6: service-level behavior Red, BEFORE T048 production.
 * Real missing SUT import; mocks only the platform DB source/actor transport,
 * never the Save service or its canonical reducer/financial math.
 * The registered new financial tuple is not yet implemented: do not report Green.
 */
import { createHash } from "node:crypto";
import type { Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { AccountReviewSession, AccountReviewSaveIntent } from "@monyvi/logic";
import type { Sha256Provider } from "../../../../packages/logic/src/financial-actions";
import { createAccountReviewSaveService } from "../../services/account-review-save-service";
import {
  ACTION, OWNER, FOREIGN_OWNER, BANK, CASH, CATEGORY, FINGERPRINT_A,
  FINGERPRINT_B, GROUP_CIB, makeSaveFixture,
  type SaveFixture,
} from "./account-review-save-test-fixtures";
import {
  clearAndSeed, ledgerState, seedSavedFingerprint,
  seedSmsReviewDrafts,
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
const hashProvider: Sha256Provider = {
  digestUtf8: (text: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(text, "utf8").digest("hex")),
};
let actor = OWNER;
let liveSession: AccountReviewSession = makeSaveFixture().session;
let readCount = 0;
let nextActor: string | null = null;

function service(): ReturnType<typeof createAccountReviewSaveService> {
  return createAccountReviewSaveService({
    database, hashProvider,
    getCurrentOwnerId: (): Promise<string> => {
      readCount += 1;
      return Promise.resolve(nextActor !== null && readCount >= 2 ? nextActor : actor);
    },
    loadCurrentSession: (_ownerId: string, _sessionId: string): Promise<AccountReviewSession> =>
      Promise.resolve(liveSession),
  });
}
function save(fixture: SaveFixture): ReturnType<
  ReturnType<typeof createAccountReviewSaveService>["saveSelectedAccountReview"]
> {
  liveSession = fixture.session;
  return service().saveSelectedAccountReview(fixture);
}
async function expectRejectedAndUnchanged(fixture: SaveFixture): Promise<void> {
  const before = await ledgerState(database);
  await expect(save(fixture)).rejects.toThrow();
  expect(await ledgerState(database)).toEqual(before);
}
function changedIntent(
  fixture: SaveFixture,
  intent: AccountReviewSaveIntent
): SaveFixture {
  return { ...fixture, intent, session: { ...fixture.session, saveIntent: intent } };
}
function staleSelectedRow(fixture: SaveFixture): AccountReviewSession {
  return {
    ...fixture.session,
    rows: fixture.session.rows.map((row, index) =>
      index === 0 ? { ...row, revision: "1" } : row
    ),
  };
}
beforeEach(async (): Promise<void> => {
  await adapter.initializingPromise;
  await clearAndSeed(database);
  actor = OWNER; nextActor = null; readCount = 0;
  liveSession = makeSaveFixture().session;
  jest.restoreAllMocks();
});

describe("T043 frozen SaveIntent, actor and current revision protection", () => {
  it("S01 rejects an intent whose owner is not the canonical session owner", async (): Promise<void> => {
    const f = makeSaveFixture();
    const intent = { ...f.intent, ownerId: FOREIGN_OWNER };
    await expectRejectedAndUnchanged(changedIntent(f, intent));
  });
  it("S02 rejects a stale selected-row revision observed inside the writer", async (): Promise<void> => {
    const f = makeSaveFixture();
    liveSession = staleSelectedRow(f);
    const before = await ledgerState(database);
    await expect(service().saveSelectedAccountReview(f)).rejects.toThrow();
    expect(await ledgerState(database)).toEqual(before);
  });
  it("S03 rejects repeated selected row IDs, not a partial second financial row", async (): Promise<void> => {
    const f = makeSaveFixture();
    const intent = { ...f.intent, selectedRows: [
      ...f.intent.selectedRows, ...f.intent.selectedRows,
    ] };
    await expectRejectedAndUnchanged(changedIntent(f, intent));
  });
  it("S04 rejects stale operation generation even with unchanged financial input", async (): Promise<void> => {
    const f = makeSaveFixture();
    const intent = { ...f.intent, expectedOperationGeneration: "1" };
    await expectRejectedAndUnchanged(changedIntent(f, intent));
  });
  it("S05 rejects an unreferenced/stale group evidence key", async (): Promise<void> => {
    const f = makeSaveFixture("voice-shared");
    const groups = f.intent.confirmedGroups.map((group) => ({
      ...group, evidenceKey: "f".repeat(64),
    }));
    await expectRejectedAndUnchanged(changedIntent(f, {
      ...f.intent, confirmedGroups: groups,
    }));
  });
  it("S06 preserves the frozen planned IDs after rejection and retry", async (): Promise<void> => {
    const f = makeSaveFixture();
    actor = FOREIGN_OWNER;
    await expect(save(f)).rejects.toThrow();
    actor = OWNER;
    expect(f.intent.actionId).toBe(ACTION);
    expect(f.session.saveIntent).toEqual(f.intent);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.actions).toBe(1);
  });
  it("S07 rechecks principal across awaits, not solely before the writer", async (): Promise<void> => {
    const f = makeSaveFixture();
    nextActor = FOREIGN_OWNER;
    const before = await ledgerState(database);
    await expect(save(f)).rejects.toThrow();
    expect(readCount).toBeGreaterThan(1);
    expect(await ledgerState(database)).toEqual(before);
  });
  it("S08 refuses a foreign-current actor without reading other owner's records", async (): Promise<void> => {
    const f = makeSaveFixture();
    actor = FOREIGN_OWNER;
    await expectRejectedAndUnchanged(f);
  });
  it("S09 rejects selected changes while a prior frozen action is pending", async (): Promise<void> => {
    const f = makeSaveFixture("voice-shared");
    const changed = {
      ...f.intent, selectedRows: f.intent.selectedRows.slice(1),
    };
    await expectRejectedAndUnchanged(changedIntent(f, changed));
  });
});

describe("T043 selected-only accounts, children, categories and effects", () => {
  it("S10 creates only the selected referenced QNB group, never unused CIB", async (): Promise<void> => {
    const f = makeSaveFixture("voice-shared");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.accounts).toBe(4);
    expect(state.counts.bankDetails).toBe(1);
    expect(state.counts.senders).toBe(1);
    expect(state.counts.transactions).toBe(2);
    expect(f.intent.confirmedGroups.map((group) => group.groupId))
      .not.toContain(GROUP_CIB);
  });
  it("S11 reuses an existing owned account with no new pending-account child", async (): Promise<void> => {
    await expect(save(makeSaveFixture())).resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.accounts).toBe(3);
    expect(state.counts.bankDetails).toBe(0);
    expect(state.counts.senders).toBe(0);
    expect(state.counts.transactions).toBe(1);
  });
  it("S12 rejects a deleted or unavailable account without creating an action root", async (): Promise<void> => {
    const f = makeSaveFixture();
    await database.write(async (): Promise<void> => {
      const account = await database.get<import("@monyvi/db").Account>("accounts").find(BANK);
      await account.update((record): void => { record.deleted = true; });
    });
    await expectRejectedAndUnchanged(f);
  });
  it("S13 fails closed when an accessible category became deleted before Save", async (): Promise<void> => {
    const f = makeSaveFixture();
    await database.write(async (): Promise<void> => {
      const category = await database.get<import("@monyvi/db").Category>("categories").find(CATEGORY);
      await category.update((record): void => { record.deleted = true; });
    });
    await expectRejectedAndUnchanged(f);
  });
  it("S14 rejects an existing account with incompatible currency", async (): Promise<void> => {
    const f = makeSaveFixture();
    await database.write(async (): Promise<void> => {
      const account = await database.get<import("@monyvi/db").Account>("accounts").find(BANK);
      await account.update((record): void => { record.currency = "USD"; });
    });
    await expectRejectedAndUnchanged(f);
  });
  it("S15 saves the exact SMS new-Bank selected net delta once, no AI opening", async (): Promise<void> => {
    const f = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, f.session);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.accounts).toBe(4);
    expect(state.counts.transactions).toBe(2);
    const created = state.accounts.find((account) => account.id === f.intent.plannedEntityIds
      .find((item) => item.entity === "account")?.id);
    expect(created?.balance).toBe(15);
    expect(created?.financialRevision).toBe("1");
  });
  it("S16 retains nonempty zero-net expense and income with a zero account effect", async (): Promise<void> => {
    await expect(save(makeSaveFixture("voice-zero-net")))
      .resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.transactions).toBe(2);
    expect(state.counts.effects).toBe(1);
    expect(state.accounts.find((account) => account.id === BANK))
      .toMatchObject({ balance: 100, financialRevision: "1" });
  });
  it("S17 processes an SMS ATM withdrawal as one transfer with two account effects", async (): Promise<void> => {
    const f = makeSaveFixture("sms-atm");
    await seedSmsReviewDrafts(database, f.session);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.transactions).toBe(0);
    expect(state.counts.transfers).toBe(1);
    expect(state.counts.effects).toBe(2);
    expect(state.accounts.find((account) => account.id === BANK)?.balance).toBe(74.95);
    expect(state.accounts.find((account) => account.id === CASH)?.balance).toBe(35.05);
  });
  it("S18 permits grounded Voice CASH without bank details or inferred opening balance", async (): Promise<void> => {
    const f = makeSaveFixture("voice-cash");
    await clearAndSeed(database, { onlyCategories: true });
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.accounts).toBe(1);
    expect(state.counts.bankDetails).toBe(0);
    expect(state.counts.senders).toBe(0);
    expect(state.accounts[0]?.isDefault).toBe(true);
  });
});

describe("T043 SMS deduplication, cleanup-only and safe partial selection", () => {
  it("S19 deduplicates against an existing owned active transaction", async (): Promise<void> => {
    const f = makeSaveFixture("sms-all-dedup");
    await seedSmsReviewDrafts(database, f.session);
    await seedSavedFingerprint(database, FINGERPRINT_B, "transaction");
    const result = await save(f);
    expect(result).toMatchObject({ kind: "cleanup_only", resolvedSmsDraftCount: 1 });
    const state = await ledgerState(database);
    expect(state.counts.transactions).toBe(1);
    expect(state.counts.actions).toBe(0);
    expect(state.counts.effects).toBe(0);
    expect(state.counts.draftItems).toBe(0);
  });
  it("S20 deduplicates an SMS fingerprint saved as a transfer, not just transactions", async (): Promise<void> => {
    const f = makeSaveFixture("sms-all-dedup");
    await seedSmsReviewDrafts(database, f.session);
    await seedSavedFingerprint(database, FINGERPRINT_B, "transfer");
    await expect(save(f)).resolves.toMatchObject({
      kind: "cleanup_only", resolvedSmsDraftCount: 1,
    });
    const state = await ledgerState(database);
    expect(state.counts.transfers).toBe(1);
    expect(state.counts.transactions).toBe(0);
    expect(state.counts.actions).toBe(0);
  });
  it("S21 does not confuse a deleted transaction fingerprint with a completed Save", async (): Promise<void> => {
    const f = makeSaveFixture("sms-existing");
    await seedSmsReviewDrafts(database, f.session);
    await seedSavedFingerprint(database, FINGERPRINT_B, "transaction", OWNER, true);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    expect((await ledgerState(database)).counts.actions).toBe(1);
  });
  it("S22 does not treat a foreign owner's fingerprint as an owned duplicate", async (): Promise<void> => {
    const f = makeSaveFixture("sms-existing");
    await seedSmsReviewDrafts(database, f.session);
    await seedSavedFingerprint(database, FINGERPRINT_B, "transaction", FOREIGN_OWNER);
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    expect((await ledgerState(database)).counts.actions).toBe(1);
  });
  it("S23 cleans already-saved SMS drafts while creating only the remaining unsaved row", async (): Promise<void> => {
    const f = makeSaveFixture("sms-mixed");
    await seedSmsReviewDrafts(database, f.session);
    await seedSavedFingerprint(database, FINGERPRINT_A, "transaction");
    await expect(save(f)).resolves.toMatchObject({ kind: "committed" });
    const state = await ledgerState(database);
    expect(state.counts.actions).toBe(1);
    expect(state.counts.transactions).toBe(2);
    expect(state.counts.draftItems).toBe(0);
    expect(state.counts.effects).toBe(1);
  });
  it("S24 never creates a fake financial action when every SMS selection is deduped", async (): Promise<void> => {
    const f = makeSaveFixture("sms-all-dedup");
    await seedSmsReviewDrafts(database, f.session);
    await seedSavedFingerprint(database, FINGERPRINT_B);
    await expect(save(f)).resolves.toMatchObject({ kind: "cleanup_only" });
    const state = await ledgerState(database);
    expect(state.counts.actions).toBe(0);
    expect(state.counts.effects).toBe(0);
    expect(state.counts.bankDetails).toBe(0);
    expect(state.counts.senders).toBe(0);
  });
});
