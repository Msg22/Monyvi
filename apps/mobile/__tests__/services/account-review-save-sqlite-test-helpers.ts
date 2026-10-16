/**
 * #395 T043: physical Watermelon/SQLite multi-model proof helpers.
 * Never substitute mocked database.write() for adapter rollback evidence.
 * Pure test DB, not a remote/hosted database or production seed.
 */
import { Database, Q, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  encodeSmsReviewDraft,
  encodeSmsReviewDraftV2,
  smsReviewDraftPayloadV2Schema,
  accountReviewSessionSchema,
  type AccountReviewRow,
  type AccountReviewSession,
} from "@monyvi/logic";
import { schema } from "../../../../packages/db/src/schema";
import {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  Category,
  FinancialActionGroup,
  Transaction,
  Transfer,
  SmsReviewQueue,
  SmsReviewDraftItem,
  DismissedSmsFingerprint,
  LEDGER_MODEL_CLASSES,
} from "./account-review-save-ledger-models";
import {
  OWNER,
  FOREIGN_OWNER,
  BANK,
  CASH,
  WALLET,
  CATEGORY,
  INCOME_CATEGORY,
  FINGERPRINT_A,
  TEST_DATE,
  testUuid,
} from "./account-review-save-test-fixtures";

export { LEDGER_MODEL_CLASSES };

export interface SqliteLedger {
  readonly database: Database;
  readonly adapter: SQLiteAdapter;
}
export interface LedgerAccountView {
  readonly id: string;
  readonly balance: number;
  readonly financialRevision: string;
  readonly isDefault: boolean;
  readonly deleted: boolean;
}
export interface LedgerDraftView {
  readonly id: string;
  readonly fingerprint: string;
  readonly payloadJson: string;
  readonly selectionOverride: boolean | null;
  readonly queueId: string;
}
export interface LedgerState {
  readonly accounts: readonly LedgerAccountView[];
  readonly drafts: readonly LedgerDraftView[];
  readonly counts: Readonly<{
    accounts: number;
    bankDetails: number;
    senders: number;
    actions: number;
    effects: number;
    transactions: number;
    transfers: number;
    queues: number;
    draftItems: number;
  }>;
}

export async function createSqliteLedger(): Promise<SqliteLedger> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  return {
    adapter,
    database: new Database({ adapter, modelClasses: LEDGER_MODEL_CLASSES }),
  };
}
export async function reopenSqliteLedger(
  ledger: SqliteLedger
): Promise<Database> {
  const adapter = await ledger.adapter.testClone();
  return new Database({ adapter, modelClasses: LEDGER_MODEL_CLASSES });
}

function prepareAccount(
  database: Database,
  id: string,
  type: "BANK" | "CASH" | "DIGITAL_WALLET",
  balance: number,
  isDefault: boolean,
  owner = OWNER
): Account {
  return database.get<Account>("accounts").prepareCreate((account): void => {
    account._raw.id = id;
    account.userId = owner;
    account.name =
      type === "BANK" ? "Existing QNB" : type === "CASH" ? "Cash" : "Wallet";
    account.currency = "EGP";
    account.type = type;
    account.balance = balance;
    account.financialRevision = "0";
    account.isDefault = isDefault;
    account.deleted = false;
    account.institutionId = type === "BANK" ? "qnb" : undefined;
    account.providerDisplayName = type === "BANK" ? "QNB" : undefined;
  });
}
function prepareCategory(
  database: Database,
  id: string,
  type: "EXPENSE" | "INCOME",
  owner: string
): Category {
  return database
    .get<Category>("categories")
    .prepareCreate((category): void => {
      category._raw.id = id;
      category.userId = owner;
      category.type = type;
      category.deleted = false;
      category.displayName = type === "EXPENSE" ? "Food" : "Salary";
      category.systemName = type === "EXPENSE" ? "food" : "salary";
      category.isSystem = false;
      category.isHidden = false;
      category.isInternal = false;
      category.icon = "wallet-outline";
      category.iconLibrary = "Ionicons";
      category.level = 0;
      category.usageCount = 0;
    });
}
export async function seedLedger(
  database: Database,
  options: Readonly<{ onlyCategories?: boolean; foreign?: boolean }> = {}
): Promise<void> {
  await database.write(async (): Promise<void> => {
    const ops: Model[] = [
      prepareCategory(database, CATEGORY, "EXPENSE", OWNER),
      prepareCategory(database, INCOME_CATEGORY, "INCOME", OWNER),
    ];
    if (!options.onlyCategories) {
      ops.push(
        prepareAccount(database, BANK, "BANK", 100, true),
        prepareAccount(database, CASH, "CASH", 10, false),
        prepareAccount(database, WALLET, "DIGITAL_WALLET", 35, false)
      );
    }
    if (options.foreign)
      ops.push(
        prepareAccount(
          database,
          testUuid(90),
          "BANK",
          999,
          false,
          FOREIGN_OWNER
        )
      );
    await database.batch(...ops);
  });
}
export async function clearAndSeed(
  database: Database,
  options: Readonly<{ onlyCategories?: boolean; foreign?: boolean }> = {}
): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database.unsafeResetDatabase();
  });
  await seedLedger(database, options);
}
export async function seedSavedFingerprint(
  database: Database,
  fingerprint = FINGERPRINT_A,
  kind: "transaction" | "transfer" = "transaction",
  owner = OWNER,
  deleted = false
): Promise<void> {
  await database.write(async (): Promise<void> => {
    if (kind === "transaction") {
      const tx = database
        .get<Transaction>("transactions")
        .prepareCreate((record): void => {
          record._raw.id = testUuid(900);
          record.userId = owner;
          record.accountId = BANK;
          record.currency = "EGP";
          record.type = "EXPENSE";
          record.amount = 10;
          record.categoryId = CATEGORY;
          record.source = "SMS";
          record.date = new Date(TEST_DATE);
          record.smsFingerprint = fingerprint;
          record.isDraft = false;
          record.deleted = deleted;
        });
      await database.batch(tx);
      return;
    }
    const transfer = database
      .get<Transfer>("transfers")
      .prepareCreate((record): void => {
        record._raw.id = testUuid(901);
        record.userId = owner;
        record.fromAccountId = BANK;
        record.toAccountId = CASH;
        record.amount = 10;
        record.currency = "EGP";
        record.date = new Date(TEST_DATE);
        record.smsFingerprint = fingerprint;
        record.deleted = deleted;
      });
    await database.batch(transfer);
  });
}
interface EncodedDraft {
  readonly version: number;
  readonly json: string;
}
function requireSmsRow(
  row: AccountReviewRow
): Extract<AccountReviewRow, { readonly source: "SMS" }> {
  if (row.source !== "SMS") throw new Error("Mixed SMS fixture source");
  return row;
}
function encodeV2ReviewDraft(
  row: Extract<AccountReviewRow, { readonly source: "SMS" }>,
  session: AccountReviewSession
): EncodedDraft {
  const groups = session.groups.filter((group) =>
    group.linkedRowIds.includes(row.rowId)
  );
  const tombstones = groups
    .filter((group) => group.status === "removed")
    .map((group) => group.evidenceKey);
  const review = {
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    sourceRevision: session.sourceRevision,
    preferredCurrency: session.preferredCurrency,
    reviewRevision: session.revision,
    operationGeneration: session.operationGeneration,
    row,
    groups,
    removedEvidenceKeys: session.removedEvidenceKeys.filter((key) =>
      tombstones.includes(key)
    ),
  };
  // Frozen v2 root is {version:2,transaction,review}; T025 codec export
  // is intentionally not yet present on this branch. Never fall back to v1.
  const encoded = encodeSmsReviewDraftV2({
    transaction: row.transaction,
    review,
  });
  const raw: unknown = JSON.parse(encoded.json);
  const checked = smsReviewDraftPayloadV2Schema.parse(raw);
  if (encoded.version !== 2 || checked.version !== 2) {
    throw new Error("Expected canonical account-review SMS v2 payload");
  }
  return encoded;
}
function encodeLegacyV1Draft(
  row: Extract<AccountReviewRow, { readonly source: "SMS" }>
): EncodedDraft {
  return encodeSmsReviewDraft(row.transaction);
}
async function seedDraftsWithVersion(
  database: Database,
  session: AccountReviewSession,
  version: "v2" | "v1"
): Promise<void> {
  if (session.source !== "SMS") throw new Error("Expected SMS review session");
  await database.write(async (): Promise<void> => {
    const queue = database
      .get<SmsReviewQueue>("sms_review_queues")
      .prepareCreate((record): void => {
        record._raw.id = session.sessionId;
        record.userId = session.ownerId;
      });
    const drafts = session.rows.map((rawRow, index): SmsReviewDraftItem => {
      const row = requireSmsRow(rawRow);
      const encoded =
        version === "v2"
          ? encodeV2ReviewDraft(row, session)
          : encodeLegacyV1Draft(row);
      return database
        .get<SmsReviewDraftItem>("sms_review_draft_items")
        .prepareCreate((record): void => {
          record._raw.id = testUuid(951 + index);
          record.userId = session.ownerId;
          record.queueId = session.sessionId;
          record.smsFingerprint = row.sourceFingerprint;
          record.payloadVersion = encoded.version;
          record.payloadJson = encoded.json;
          record.selectionOverride = row.selected;
          record.position = index;
          record.parsedAt = new Date(TEST_DATE);
        });
    });
    await database.batch(queue, ...drafts);
  });
}
/** All T043 happy-path SMS cases use canonical v2, never implicit v1 migration. */
export async function seedSmsReviewDrafts(
  database: Database,
  session: AccountReviewSession
): Promise<void> {
  await seedDraftsWithVersion(database, session, "v2");
}
/** Explicit legacy-only harness for separately tested T025 v1 -> v2 migration. */
export async function seedLegacySmsReviewDraftsV1(
  database: Database,
  session: AccountReviewSession
): Promise<void> {
  await seedDraftsWithVersion(database, session, "v1");
}
export async function ledgerState(database: Database): Promise<LedgerState> {
  const [
    accounts,
    drafts,
    actions,
    effects,
    transactions,
    transfers,
    banks,
    senders,
    queues,
  ] = await Promise.all([
    database.get<Account>("accounts").query().fetch(),
    database.get<SmsReviewDraftItem>("sms_review_draft_items").query().fetch(),
    database
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch(),
    database
      .get<AccountFinancialEffect>("account_financial_effects")
      .query()
      .fetch(),
    database.get<Transaction>("transactions").query().fetch(),
    database.get<Transfer>("transfers").query().fetch(),
    database.get<BankDetails>("bank_details").query().fetch(),
    database.get<AccountSmsSender>("account_sms_senders").query().fetch(),
    database.get<SmsReviewQueue>("sms_review_queues").query().fetch(),
  ]);
  return {
    accounts: accounts
      .map((account) => ({
        id: account.id,
        balance: account.balance,
        financialRevision: account.financialRevision,
        isDefault: account.isDefault,
        deleted: account.deleted,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    drafts: drafts
      .map((draft) => ({
        id: draft.id,
        fingerprint: draft.smsFingerprint,
        payloadJson: draft.payloadJson,
        selectionOverride: draft.selectionOverride,
        queueId: draft.queueId,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    counts: {
      accounts: accounts.length,
      draftItems: drafts.length,
      actions: actions.length,
      effects: effects.length,
      transactions: transactions.length,
      transfers: transfers.length,
      bankDetails: banks.length,
      senders: senders.length,
      queues: queues.length,
    },
  };
}

/** Raw persisted all-table snapshot: catch partial account, child, action,
 * effect, category, outbox root and queue mutations hidden by count-only tests. */
export async function physicalSaveLedgerSnapshot(database: Database): Promise<
  readonly Readonly<{
    table: string;
    rows: readonly string[];
  }>[]
> {
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
  return Promise.all(
    tables.map(async (table) => {
      const models = await database.get<Model>(table).query().fetch();
      return {
        table,
        rows: models
          .map((model) =>
            JSON.stringify(
              Object.entries(model._raw).sort(([a], [b]) => a.localeCompare(b))
            )
          )
          .sort(),
      };
    })
  );
}

/** Real owned account with no previous default; valid when seeded categories
 * already exist and no other account was created by the current test. */
export async function seedOwnedBankWithoutDefault(
  database: Database
): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database.batch(prepareAccount(database, BANK, "BANK", 100, false));
  });
}

/** Genuine replacement of an owned persisted v2 draft: update its canonical
 * selected row, source fingerprint, revision and encoded payload together.
 * The caller's old frozen SaveIntent stays deliberately unchanged. */
export async function replaceOwnedDraftFingerprint(
  database: Database,
  session: AccountReviewSession,
  originalFingerprint: string,
  changedFingerprint: string
): Promise<void> {
  const drafts = await database
    .get<SmsReviewDraftItem>("sms_review_draft_items")
    .query(
      Q.where("user_id", OWNER),
      Q.where("sms_fingerprint", originalFingerprint)
    )
    .fetch();
  const draft = drafts[0];
  if (drafts.length !== 1 || !draft)
    throw new Error("Expected one owned v2 draft");
  const rows = session.rows.map((rawRow): AccountReviewRow => {
    if (
      rawRow.source !== "SMS" ||
      rawRow.sourceFingerprint !== originalFingerprint
    )
      return rawRow;
    return {
      ...rawRow,
      revision: "1",
      sourceFingerprint: changedFingerprint,
      transaction: {
        ...rawRow.transaction,
        smsFingerprint: changedFingerprint,
      },
    };
  });
  const updated = accountReviewSessionSchema.parse({
    ...session,
    rows,
    revision: "1",
    operationGeneration: "1",
    saveIntent: null,
  });
  const changed = updated.rows.find(
    (row) =>
      row.source === "SMS" && row.sourceFingerprint === changedFingerprint
  );
  if (!changed || changed.source !== "SMS")
    throw new Error("Missing new selected SMS row");
  const encoded = encodeV2ReviewDraft(changed, updated);
  await database.write(async (): Promise<void> => {
    await draft.update((record): void => {
      record.smsFingerprint = changedFingerprint;
      record.payloadJson = encoded.json;
      record.payloadVersion = encoded.version;
    });
  });
}

/**
 * Inject a genuine UNIQUE conflict *inside* the real adapter batch, after
 * preceding create operations; SQLite must roll the complete batch back.
 */
export function injectMidBatchDuplicate(database: Database): () => void {
  const batch = database.adapter.batch.bind(database.adapter);
  const spy = jest
    .spyOn(database.adapter, "batch")
    .mockImplementation(async (operations): Promise<void> => {
      const created = operations.find(
        (operation) =>
          operation[0] === "create" && operation[1] === "transactions"
      );
      if (created?.[0] !== "create" || created[1] !== "transactions") {
        await batch(operations);
        return;
      }
      const duplicate: typeof created = [
        "create",
        "transactions",
        { ...created[2] },
      ];
      await batch([...operations, duplicate]);
    });
  return (): void => {
    spy.mockRestore();
  };
}
