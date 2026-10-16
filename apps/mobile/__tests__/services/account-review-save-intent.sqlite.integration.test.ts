/**
 * #395 T048 TESTS-FIRST: real SQLite original-intent digest / historical replay.
 * The production writer at 5e79a2e does not yet emit frozenIntentDigest.
 * First-write successes are expected integration Red until T048 is granted.
 * No mocked financial action, forged receipts, synthetic DB or native shim.
 */
import { createHash } from "node:crypto";
import type { Database, Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { Account, Category, FinancialActionGroup, Transaction } from "@monyvi/db";
import {
  accountReviewSaveIntentSchema,
  accountReviewSessionSchema,
  computeAccountReviewFrozenIntentDigest,
  parseFinancialActionEnvelopeJson,
  type AccountReviewRow,
  type AccountReviewSession,
  type Sha256Provider,
} from "@monyvi/logic";
import { validateReviewBatchSavePayload } from
  "../../../../packages/logic/src/financial-actions/review-batch-save";
import type { ReviewBatchSavePayload } from
  "../../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { createAccountReviewFinancialRegistry } from
  "../../services/account-review-financial-command-service";
import { createAccountReviewSaveService } from
  "../../services/account-review-save-service";
import {
  ACTION, BANK, FINGERPRINT_A, FINGERPRINT_B,
  FINGERPRINT_C, FOREIGN_OWNER, GROUP_QNB, GROUP_WALLET,
  OWNER, SESSION, TEST_DATE, WALLET, expectedChildLocalRef,
  makeSaveFixture, testUuid, type SaveFixture,
} from "./account-review-save-test-fixtures";
import { smsWithDedupOnlyWalletGroup } from
  "./account-review-save-intent-test-fixtures";
import {
  clearAndSeed, ledgerState, physicalSaveLedgerSnapshot,
  reopenSqliteLedger, seedSavedFingerprint, seedSmsReviewDrafts,
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
let currentSession: AccountReviewSession | null = null;
let sessionReads = 0;

function writer(db: Database): ReturnType<typeof createAccountReviewSaveService> {
  return createAccountReviewSaveService({
    database: db,
    hashProvider,
    getCurrentOwnerId: (): Promise<string> => Promise.resolve(OWNER),
    loadCurrentSession: (): Promise<AccountReviewSession> => {
      sessionReads += 1;
      return currentSession === null
        ? Promise.reject(new Error("review_session_cleared_for_restart"))
        : Promise.resolve(currentSession);
    },
  });
}

function save(fixture: SaveFixture): ReturnType<
  ReturnType<typeof createAccountReviewSaveService>["saveSelectedAccountReview"]
> {
  currentSession = fixture.session;
  return writer(database).saveSelectedAccountReview(fixture);
}

interface SavedAction {
  readonly root: FinancialActionGroup;
  readonly payload: ReviewBatchSavePayload;
}
async function storedAction(db: Database): Promise<SavedAction> {
  const roots = await db.get<FinancialActionGroup>(
    "financial_action_groups"
  ).query().fetch();
  expect(roots).toHaveLength(1);
  const root = roots[0];
  if (!root) throw new Error("Expected one immutable real financial root");
  const envelope = parseFinancialActionEnvelopeJson(
    root.payloadJson, createAccountReviewFinancialRegistry()
  );
  expect(envelope.actionId).toBe(ACTION);
  expect(envelope.userId).toBe(OWNER);
  expect(envelope.kind).toBe("review_batch_save");
  return { root, payload: validateReviewBatchSavePayload(envelope.payload) };
}

function expectedDigest(
  fixture: SaveFixture, payload: ReviewBatchSavePayload
): Promise<string> {
  return computeAccountReviewFrozenIntentDigest({
    session: fixture.session,
    intent: fixture.intent,
    creationDefaultSnapshot: payload.creationDefaultSnapshot,
    hashProvider,
  });
}

const WALLET_SENDER_ALIAS = expectedChildLocalRef(
  OWNER, SESSION, GROUP_WALLET, "account_sms_sender", "wally pay"
);

const TABLES = [
  "accounts", "bank_details", "account_sms_senders", "categories",
  "transactions", "transfers", "financial_action_groups",
  "account_financial_effects", "sms_review_queues",
  "sms_review_draft_items", "dismissed_sms_fingerprints",
];

async function expectRejectedWithoutLedgerChange(
  candidate: SaveFixture, existingRoot = true
): Promise<void> {
  const fresh = await reopenSqliteLedger(ledger);
  const rawBefore = await physicalSaveLedgerSnapshot(fresh);
  const cached = (await Promise.all(TABLES.map((table) =>
    fresh.get<Model>(table).query().fetch()
  ))).flat();
  const cachedBefore = cached.map((model) => JSON.stringify({
    raw: model._raw, prepared: model._preparedState ?? null,
  }));
  const summaryBefore = await ledgerState(fresh);
  expect(summaryBefore.counts.actions).toBe(existingRoot ? 1 : 0);
  await expect(writer(fresh).saveSelectedAccountReview(candidate)).rejects.toThrow();
  expect(await physicalSaveLedgerSnapshot(
    await reopenSqliteLedger(ledger)
  )).toEqual(rawBefore);
  expect(cached.map((model) => JSON.stringify({
    raw: model._raw, prepared: model._preparedState ?? null,
  }))).toEqual(cachedBefore);
  expect(await ledgerState(await reopenSqliteLedger(ledger)))
    .toEqual(summaryBefore);
}

type SmsRow = Extract<AccountReviewRow, { source: "SMS" }>;
function alterSelectedSms(
  fixture: SaveFixture, fingerprint: string,
  change: (row: SmsRow) => SmsRow
): SaveFixture {
  const rows = fixture.session.rows.map((row): AccountReviewRow => {
    if (row.source !== "SMS" || row.sourceFingerprint !== fingerprint) return row;
    return change(row);
  });
  const session = accountReviewSessionSchema.parse({
    ...fixture.session, rows, saveIntent: fixture.intent,
  });
  return { session, intent: fixture.intent };
}

function changeGroupEvidence(fixture: SaveFixture, groupId: string): SaveFixture {
  const changedKey = "f".repeat(64);
  const intent = accountReviewSaveIntentSchema.parse({
    ...fixture.intent,
    confirmedGroups: fixture.intent.confirmedGroups.map((group) =>
      group.groupId === groupId
        ? { ...group, evidenceKey: changedKey } : group
    ),
  });
  const session = accountReviewSessionSchema.parse({
    ...fixture.session,
    groups: fixture.session.groups.map((group) =>
      group.groupId === groupId
        ? { ...group, evidenceKey: changedKey } : group
    ),
    saveIntent: intent,
  });
  return { session, intent };
}

async function seedMixed(): Promise<SaveFixture> {
  const fixture = makeSaveFixture("sms-mixed");
  await seedSmsReviewDrafts(database, fixture.session);
  await seedSavedFingerprint(database, FINGERPRINT_A, "transaction");
  return fixture;
}

/** Actual accessible EXPENSE category, not a mismatched INCOME category. */
async function seedAnotherExpenseCategory(): Promise<void> {
  await database.write(async (): Promise<void> => {
    const category = database.get<Category>("categories").prepareCreate((item) => {
      item._raw.id = testUuid(990);
      item.userId = OWNER;
      item.type = "EXPENSE";
      item.deleted = false;
      item.displayName = "Transport";
      item.systemName = "transport";
      item.isSystem = false;
      item.isHidden = false;
      item.isInternal = false;
      item.icon = "car-outline";
      item.iconLibrary = "Ionicons";
      item.level = 0;
      item.usageCount = 0;
    });
    await database.batch(category);
  });
}

beforeEach(async (): Promise<void> => {
  await adapter.initializingPromise;
  await clearAndSeed(database);
  currentSession = null;
  sessionReads = 0;
  jest.restoreAllMocks();
});

describe("#395 T048 frozen original intent and historical replay, real SQLite", () => {
  it("I01 writes one lowercase original digest inside an authentic immutable root, never raw evidence", async () => {
    const fixture = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, fixture.session);
    await expect(save(fixture)).resolves.toMatchObject({ kind: "committed" });
    const { root, payload } = await storedAction(await reopenSqliteLedger(ledger));
    expect(payload.frozenIntentDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.frozenIntentDigest).toBe(await expectedDigest(fixture, payload));
    expect(root.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(root.payloadHash).not.toBe(payload.frozenIntentDigest);
    expect(root.payloadJson).toContain('"frozenIntentDigest"');
    expect(payload.confirmedGroupRefs).toHaveLength(1);
    expect(payload.creationDefaultSnapshot).toBeDefined();
    expect(root.payloadJson).not.toMatch(
      /rawSmsBody|originalTranscript|evidenceSpans|undoToken|accountReviewSession|selectedRows|rawSms|sourceRef/
    );
  });

  it("I01b Voice keeps its legitimate saved note but never persists the distinct raw transcript", async () => {
    const original = makeSaveFixture("voice-existing");
    const sentinel = "PRIVATE_VOICE_TRANSCRIPT_DO_NOT_PERSIST";
    const session = accountReviewSessionSchema.parse({
      ...original.session,
      rows: original.session.rows.map((row) =>
        row.source === "VOICE"
          ? { ...row, transaction: {
              ...row.transaction, originalTranscript: sentinel,
            } }
          : row
      ),
    });
    const fixture = { session, intent: original.intent };
    await expect(save(fixture)).resolves.toMatchObject({ kind: "committed" });
    const { root, payload } = await storedAction(await reopenSqliteLedger(ledger));
    expect(payload.frozenIntentDigest).toBe(await expectedDigest(fixture, payload));
    expect(root.payloadJson).not.toContain(sentinel);
    expect(root.payloadJson).not.toContain('"originalTranscript"');
    expect(root.payloadJson).toContain('"note"');
  });

  it("I02 binds both original SMS A+B although A is externally saved and only B posts", async () => {
    const fixture = await seedMixed();
    expect(fixture.intent.selectedRows).toHaveLength(2);
    await expect(save(fixture)).resolves.toMatchObject({ kind: "committed" });
    const fresh = await reopenSqliteLedger(ledger);
    const { root, payload } = await storedAction(fresh);
    expect(payload.selectedSourceRefs).toHaveLength(1);
    expect(payload.selectedSourceRefs[0]?.sourceFingerprint).toBe(FINGERPRINT_B);
    expect(payload.selectedSourceRefs.some(
      (ref) => ref.sourceFingerprint === FINGERPRINT_A
    )).toBe(false);
    expect(root.payloadJson).not.toContain(FINGERPRINT_A);
    expect(payload.creationDefaultSnapshot).toBeUndefined();
    expect(payload.frozenIntentDigest).toBe(await expectedDigest(fixture, payload));
    expect((await ledgerState(fresh)).counts).toMatchObject({
      actions: 1, effects: 1, transactions: 2, draftItems: 0,
    });
  });

  it("I03 refuses changes to omitted A's amount, compatible category/type, local date or owned account", async () => {
    const original = await seedMixed();
    await seedAnotherExpenseCategory();
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const variants: ReadonlyArray<{
      readonly field: string;
      readonly change: (row: SmsRow) => SmsRow;
    }> = [
      { field: "amount", change: (row) => ({
        ...row, amountDecimal: "11",
        transaction: { ...row.transaction, amount: 11 },
      }) },
      { field: "category", change: (row) => ({
        ...row, transaction: {
          ...row.transaction, categoryId: testUuid(990),
        },
      }) },
      { field: "local date", change: (row) => ({
        ...row, transaction: {
          ...row.transaction, date: new Date(TEST_DATE.getTime() + 86400000),
        },
      }) },
      { field: "account", change: (row) => {
        if (row.assignment.state !== "existing")
          throw new Error("Expected owned existing Bank assignment");
        return {
          ...row, hasUserAccountOverride: true,
          assignment: { ...row.assignment, accountId: WALLET },
          transaction: { ...row.transaction, accountId: WALLET },
        };
      } },
    ];
    currentSession = null;
    for (const variant of variants) {
      const changed = alterSelectedSms(original, FINGERPRINT_A, variant.change);
      expect(changed.intent).toEqual(original.intent);
      expect(changed.session).not.toEqual(original.session);
      await expectRejectedWithoutLedgerChange(changed);
    }
  });

  it("I04 refuses changed original confirmed QNB evidenceKey with unchanged group ID/revision/physical ID", async () => {
    const original = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, original.session);
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const changed = changeGroupEvidence(original, GROUP_QNB);
    const beforeGroup = original.intent.confirmedGroups[0];
    const afterGroup = changed.intent.confirmedGroups[0];
    expect(afterGroup?.groupId).toBe(beforeGroup?.groupId);
    expect(afterGroup?.revision).toBe(beforeGroup?.revision);
    expect(changed.intent.plannedEntityIds).toEqual(original.intent.plannedEntityIds);
    expect(afterGroup?.evidenceKey).not.toBe(beforeGroup?.evidenceKey);
    currentSession = null;
    await expectRejectedWithoutLedgerChange(changed);
  });

  it("I05 a wholly deduped Wallet group remains in the original digest and complete frozen child plan", async () => {
    const original = smsWithDedupOnlyWalletGroup();
    expect(original.intent.selectedRows).toHaveLength(3);
    expect(original.intent.confirmedGroups).toHaveLength(2);
    await seedSmsReviewDrafts(database, original.session);
    await seedSavedFingerprint(database, FINGERPRINT_C, "transaction");
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const { payload } = await storedAction(await reopenSqliteLedger(ledger));
    const unusedAccount = original.intent.plannedEntityIds.find(
      (item) => item.entity === "account" && item.localRef === GROUP_WALLET
    );
    const unusedSender = original.intent.plannedEntityIds.find(
      (item) => item.entity === "account_sms_sender" &&
        item.localRef === WALLET_SENDER_ALIAS
    );
    expect(unusedAccount).toBeDefined();
    expect(unusedSender).toBeDefined();
    expect(payload.confirmedGroupRefs).toHaveLength(1);
    expect(payload.confirmedGroupRefs[0]?.groupId).toBe(GROUP_QNB);
    expect(payload.selectedSourceRefs).toHaveLength(2);
    expect(payload.domainRecordRefs).not.toContain(unusedAccount?.id);
    expect(payload.domainRecordRefs).not.toContain(unusedSender?.id);
    expect(payload.creationDefaultSnapshot).toBeDefined();
    expect(payload.frozenIntentDigest).toBe(await expectedDigest(original, payload));
    expect((await ledgerState(await reopenSqliteLedger(ledger))).counts)
      .toMatchObject({ accounts: 4, bankDetails: 1, senders: 1, actions: 1 });
    const baseline = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    currentSession = null;
    await expect(writer(await reopenSqliteLedger(ledger))
      .saveSelectedAccountReview(original)).resolves.toEqual({ kind: "replay" });
    expect(await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger)))
      .toEqual(baseline);
  });

  it("I06 rejects changes to a fully omitted group's evidence and original unused sender ID", async () => {
    const original = smsWithDedupOnlyWalletGroup();
    await seedSmsReviewDrafts(database, original.session);
    await seedSavedFingerprint(database, FINGERPRINT_C, "transaction");
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    currentSession = null;
    await expectRejectedWithoutLedgerChange(
      changeGroupEvidence(original, GROUP_WALLET)
    );
    const unused = original.intent.plannedEntityIds.find(
      (item) => item.entity === "account_sms_sender" &&
        item.localRef === WALLET_SENDER_ALIAS
    );
    if (!unused) throw new Error("Missing original sender child");
    const unusedAccount = original.intent.plannedEntityIds.find((item) =>
      item.entity === "account" && item.localRef === GROUP_WALLET
    );
    if (!unusedAccount) throw new Error("Missing original Wallet account");
    for (const [originalId, newId] of [
      [unused.id, testUuid(994)],
      [unusedAccount.id, testUuid(995)],
    ]) {
      const changedPlan = accountReviewSaveIntentSchema.parse({
        ...original.intent,
        plannedEntityIds: original.intent.plannedEntityIds.map((item) =>
          item.id === originalId ? { ...item, id: newId } : item
        ),
      });
      const changedSession = accountReviewSessionSchema.parse({
        ...original.session, saveIntent: changedPlan,
      });
      await expectRejectedWithoutLedgerChange({
        session: changedSession, intent: changedPlan,
      });
    }
  });

  it("I07 rejects reducing original selected membership to posted-only rows", async () => {
    const original = await seedMixed();
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const session = accountReviewSessionSchema.parse({
      ...original.session, saveIntent: null,
      rows: original.session.rows.map((row) =>
        row.source === "SMS" && row.sourceFingerprint === FINGERPRINT_A
          ? { ...row, selected: false } : row
      ),
    });
    const removed = original.session.rows.find((row) =>
      row.source === "SMS" && row.sourceFingerprint === FINGERPRINT_A
    );
    if (!removed) throw new Error("Missing independently deduped selected A");
    const intent = accountReviewSaveIntentSchema.parse({
      ...original.intent,
      selectedRows: original.intent.selectedRows.filter((item) =>
        item.rowId !== removed.rowId
      ),
      plannedEntityIds: original.intent.plannedEntityIds.filter((item) =>
        item.localRef !== removed.rowId
      ),
    });
    const changed = {
      session: accountReviewSessionSchema.parse({ ...session, saveIntent: intent }),
      intent,
    };
    expect(intent.plannedEntityIds.find((item) =>
      item.localRef === original.session.rows[1]?.rowId
    )).toEqual(original.intent.plannedEntityIds.find((item) =>
      item.localRef === original.session.rows[1]?.rowId
    ));
    expect(intent.actionId).toBe(original.intent.actionId);
    expect(intent.selectedRows).toHaveLength(1);
    currentSession = null;
    await expectRejectedWithoutLedgerChange(changed);
  });

  it("I08 identical partial-dedup replay survives edited THEN deleted saved A and cleared session after cold clone", async () => {
    const original = await seedMixed();
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const saved = await database.get<Transaction>("transactions").find(testUuid(900));
    await database.write(async (): Promise<void> => {
      await saved.update((record) => { record.amount = 73; });
    });
    await database.write(async (): Promise<void> => {
      await saved.update((record) => { record.deleted = true; });
    });
    const before = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const state = await ledgerState(await reopenSqliteLedger(ledger));
    currentSession = null;
    sessionReads = 0;
    const fresh = await reopenSqliteLedger(ledger);
    await expect(writer(fresh).saveSelectedAccountReview(original))
      .resolves.toEqual({ kind: "replay" });
    expect(sessionReads).toBe(0);
    expect(await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger)))
      .toEqual(before);
    expect(await ledgerState(await reopenSqliteLedger(ledger))).toEqual(state);
  });

  it("I09 replay uses the original default snapshot despite later owned balance/revision/default changes", async () => {
    const original = makeSaveFixture("sms-new-bank");
    await seedSmsReviewDrafts(database, original.session);
    await seedSavedFingerprint(database, FINGERPRINT_A, "transaction");
    await expect(save(original)).resolves.toMatchObject({ kind: "committed" });
    const { payload } = await storedAction(await reopenSqliteLedger(ledger));
    expect(payload.creationDefaultSnapshot?.defaultAccount?.accountId).toBe(BANK);
    const newAccountId = original.intent.plannedEntityIds.find(
      (item) => item.entity === "account" && item.localRef === GROUP_QNB
    )?.id;
    if (!newAccountId) throw new Error("Missing genuine planned Bank account");
    const bank = await database.get<Account>("accounts").find(BANK);
    const createdBank = await database.get<Account>("accounts").find(newAccountId);
    await database.write(async (): Promise<void> => {
      await database.batch(
        bank.prepareUpdate((record) => {
          record.balance = 155;
          record.financialRevision = "8";
          record.isDefault = false;
        }),
        createdBank.prepareUpdate((record) => {
          record.isDefault = true;
        })
      );
    });
    const before = await physicalSaveLedgerSnapshot(
      await reopenSqliteLedger(ledger)
    );
    const historical = await storedAction(await reopenSqliteLedger(ledger));
    expect(historical.payload.creationDefaultSnapshot)
      .toEqual(payload.creationDefaultSnapshot);
    expect(historical.payload.frozenIntentDigest)
      .toBe(await expectedDigest(original, historical.payload));
    currentSession = null;
    sessionReads = 0;
    await expect(writer(await reopenSqliteLedger(ledger))
      .saveSelectedAccountReview(original)).resolves.toEqual({ kind: "replay" });
    expect(sessionReads).toBe(0);
    expect(await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger)))
      .toEqual(before);
  });

  it("I10 a foreign-owned or deleted-only matching fingerprint cannot authorize first-write dedup", async () => {
    const priorRecords: ReadonlyArray<readonly [string, boolean]> = [
      [FOREIGN_OWNER, false], [OWNER, true],
    ];
    for (const [owner, deleted] of priorRecords) {
      await clearAndSeed(database);
      const fixture = makeSaveFixture("sms-existing");
      await seedSmsReviewDrafts(database, fixture.session);
      await seedSavedFingerprint(database, FINGERPRINT_B, "transaction", owner, deleted);
      await expect(save(fixture)).resolves.toMatchObject({ kind: "committed" });
      const { payload } = await storedAction(await reopenSqliteLedger(ledger));
      expect(payload.selectedSourceRefs).toHaveLength(1);
      expect(payload.selectedSourceRefs[0]?.sourceFingerprint).toBe(FINGERPRINT_B);
      expect(payload.frozenIntentDigest).toBe(await expectedDigest(fixture, payload));
      expect((await ledgerState(await reopenSqliteLedger(ledger))).counts)
        .toMatchObject({ transactions: 2, effects: 1, actions: 1 });
    }
  });

  it("I11 rejects colliding forged selected fingerprint against the real persisted draft snapshot", async () => {
    const original = makeSaveFixture("sms-mixed");
    await seedSmsReviewDrafts(database, original.session);
    const forged = alterSelectedSms(original, FINGERPRINT_B, (row) => ({
      ...row,
      sourceFingerprint: FINGERPRINT_A,
      transaction: { ...row.transaction, smsFingerprint: FINGERPRINT_A },
    }));
    expect(forged.session.rows[0]?.sourceFingerprint)
      .toBe(forged.session.rows[1]?.sourceFingerprint);
    await expectRejectedWithoutLedgerChange(forged, false);
  });
});
