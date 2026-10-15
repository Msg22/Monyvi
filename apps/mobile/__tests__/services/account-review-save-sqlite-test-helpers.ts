/**
 * #395 T043: physical Watermelon/SQLite multi-model proof helpers.
 * Never substitute mocked database.write() for adapter rollback evidence.
 * Pure test DB, not a remote/hosted database or production seed.
 */
import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { encodeSmsReviewDraft, type AccountReviewSession } from "@monyvi/logic";
import { schema } from "../../../../packages/db/src/schema";
import { Account } from "../../../../packages/db/src/models/Account";
import { AccountFinancialEffect } from "../../../../packages/db/src/models/AccountFinancialEffect";
import { AccountSmsSender } from "../../../../packages/db/src/models/AccountSmsSender";
import { BankDetails } from "../../../../packages/db/src/models/BankDetails";
import { Category } from "../../../../packages/db/src/models/Category";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { Transaction } from "../../../../packages/db/src/models/Transaction";
import { Transfer } from "../../../../packages/db/src/models/Transfer";
import { SmsReviewQueue } from "../../../../packages/db/src/models/SmsReviewQueue";
import { SmsReviewDraftItem } from "../../../../packages/db/src/models/SmsReviewDraftItem";
import { DismissedSmsFingerprint } from "../../../../packages/db/src/models/DismissedSmsFingerprint";
import {
  OWNER, FOREIGN_OWNER, BANK, CASH, WALLET, CATEGORY, INCOME_CATEGORY,
  FINGERPRINT_A, TEST_DATE, testUuid,
} from "./account-review-save-test-fixtures";

export const LEDGER_MODEL_CLASSES: Array<typeof Model> = [
  Account, AccountFinancialEffect, AccountSmsSender, BankDetails,
  Category, FinancialActionGroup, Transaction, Transfer, SmsReviewQueue,
  SmsReviewDraftItem, DismissedSmsFingerprint,
];

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
    accounts: number; bankDetails: number; senders: number;
    actions: number; effects: number; transactions: number;
    transfers: number; queues: number; draftItems: number;
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
export async function reopenSqliteLedger(ledger: SqliteLedger): Promise<Database> {
  const adapter = await ledger.adapter.testClone();
  return new Database({ adapter, modelClasses: LEDGER_MODEL_CLASSES });
}

function prepareAccount(
  database: Database, id: string, type: "BANK" | "CASH" | "DIGITAL_WALLET",
  balance: number, isDefault: boolean, owner = OWNER
): Account {
  return database.get<Account>("accounts").prepareCreate((account): void => {
    account._raw.id = id;
    account.userId = owner;
    account.name = type === "BANK" ? "Existing QNB" : type === "CASH" ? "Cash" : "Wallet";
    account.currency = "EGP"; account.type = type;
    account.balance = balance; account.financialRevision = "0";
    account.isDefault = isDefault; account.deleted = false;
    account.institutionId = type === "BANK" ? "qnb" : undefined;
    account.providerDisplayName = type === "BANK" ? "QNB" : undefined;
  });
}
function prepareCategory(
  database: Database, id: string, type: "EXPENSE" | "INCOME", owner: string
): Category {
  return database.get<Category>("categories").prepareCreate((category): void => {
    category._raw.id = id; category.userId = owner;
    category.type = type; category.deleted = false;
    category.displayName = type === "EXPENSE" ? "Food" : "Salary";
    category.systemName = type === "EXPENSE" ? "food" : "salary";
    category.isSystem = false; category.isHidden = false;
    category.isInternal = false; category.icon = "wallet-outline";
    category.iconLibrary = "Ionicons"; category.level = 0; category.usageCount = 0;
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
    if (options.foreign) ops.push(
      prepareAccount(database, testUuid(90), "BANK", 999, false, FOREIGN_OWNER)
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
      const tx = database.get<Transaction>("transactions").prepareCreate((record): void => {
        record._raw.id = testUuid(900);
        record.userId = owner; record.accountId = BANK;
        record.currency = "EGP"; record.type = "EXPENSE";
        record.amount = 10; record.categoryId = CATEGORY;
        record.source = "SMS"; record.date = new Date(TEST_DATE);
        record.smsFingerprint = fingerprint; record.isDraft = false; record.deleted = deleted;
      });
      await database.batch(tx);
      return;
    }
    const transfer = database.get<Transfer>("transfers").prepareCreate((record): void => {
      record._raw.id = testUuid(901);
      record.userId = owner; record.fromAccountId = BANK; record.toAccountId = CASH;
      record.amount = 10; record.currency = "EGP"; record.date = new Date(TEST_DATE);
      record.smsFingerprint = fingerprint; record.deleted = deleted;
    });
    await database.batch(transfer);
  });
}
export async function seedSmsReviewDrafts(
  database: Database, session: AccountReviewSession
): Promise<void> {
  if (session.source !== "SMS") throw new Error("Expected SMS review session");
  await database.write(async (): Promise<void> => {
    const queue = database.get<SmsReviewQueue>("sms_review_queues")
      .prepareCreate((record): void => {
        record._raw.id = testUuid(950);
        record.userId = OWNER;
      });
    const drafts = session.rows.map((row, index): SmsReviewDraftItem => {
      if (row.source !== "SMS") throw new Error("Mixed SMS fixture source");
      const encoded = encodeSmsReviewDraft(row.transaction);
      return database.get<SmsReviewDraftItem>("sms_review_draft_items")
        .prepareCreate((record): void => {
          record._raw.id = testUuid(951 + index);
          record.userId = OWNER; record.queueId = testUuid(950);
          record.smsFingerprint = row.sourceFingerprint;
          record.payloadVersion = encoded.version; record.payloadJson = encoded.json;
          record.selectionOverride = row.selected;
          record.position = index; record.parsedAt = new Date(TEST_DATE);
        });
    });
    await database.batch(queue, ...drafts);
  });
}
export async function ledgerState(database: Database): Promise<LedgerState> {
  const [accounts, drafts, actions, effects, transactions, transfers, banks, senders, queues] =
    await Promise.all([
      database.get<Account>("accounts").query().fetch(),
      database.get<SmsReviewDraftItem>("sms_review_draft_items").query().fetch(),
      database.get<FinancialActionGroup>("financial_action_groups").query().fetch(),
      database.get<AccountFinancialEffect>("account_financial_effects").query().fetch(),
      database.get<Transaction>("transactions").query().fetch(),
      database.get<Transfer>("transfers").query().fetch(),
      database.get<BankDetails>("bank_details").query().fetch(),
      database.get<AccountSmsSender>("account_sms_senders").query().fetch(),
      database.get<SmsReviewQueue>("sms_review_queues").query().fetch(),
    ]);
  return {
    accounts: accounts.map((account) => ({
      id: account.id, balance: account.balance, financialRevision: account.financialRevision,
      isDefault: account.isDefault, deleted: account.deleted,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    drafts: drafts.map((draft) => ({
      id: draft.id, fingerprint: draft.smsFingerprint,
      payloadJson: draft.payloadJson, selectionOverride: draft.selectionOverride,
      queueId: draft.queueId,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    counts: {
      accounts: accounts.length, draftItems: drafts.length, actions: actions.length,
      effects: effects.length, transactions: transactions.length,
      transfers: transfers.length, bankDetails: banks.length,
      senders: senders.length, queues: queues.length,
    },
  };
}
/**
 * Inject a genuine UNIQUE conflict *inside* the real adapter batch, after
 * preceding create operations; SQLite must roll the complete batch back.
 */
export function injectMidBatchDuplicate(database: Database): () => void {
  const batch = database.adapter.batch.bind(database.adapter);
  const spy = jest.spyOn(database.adapter, "batch").mockImplementation(
    async (operations): Promise<void> => {
      const created = operations.find((operation) =>
        operation[0] === "create" && operation[1] === "transactions"
      );
      if (created?.[0] !== "create" || created[1] !== "transactions") {
        await batch(operations);
        return;
      }
      const duplicate: typeof created = ["create", "transactions", { ...created[2] }];
      await batch([...operations, duplicate]);
    }
  );
  return (): void => { spy.mockRestore(); };
}
