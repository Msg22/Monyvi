/**
 * #395 owner-device regression: one selected synthetic Voice draft while a
 * different shared Bank draft and its rows remain pending and unselected.
 * Real fixture launcher/normalizer, canonical commands, runtime capture,
 * guarded Save service and physical WatermelonDB SQLite adapter.
 */
import type { Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountFinancialEffect,
  BankDetails,
  Category,
  Transaction,
} from "@monyvi/db";
import {
  accountReviewCommandSchema,
  accountReviewRequestContextSchema,
  reduceAccountReviewCommand,
  type AccountReviewCommand,
  type AccountReviewOwnedContext,
  type AccountReviewSession,
} from "@monyvi/logic";
import type { AccountReviewAccountSnapshots } from "../../services/account-review-read-model-service";
import { freezeSelectedAccountReview } from "../../services/account-review-save-preparation";
import { loadReviewTranscriptFixturesContext } from "../../services/review-transcript-fixtures-context-service";
import { buildReviewTranscriptFixtureLaunch } from "../../services/review-transcript-fixtures-launcher-service";
import {
  captureAccountReviewRuntimeSave,
  saveCapturedAccountReview,
} from "../../services/account-review-runtime-save";
import {
  clearAndSeed,
  ledgerState,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import { OWNER, testUuid } from "./account-review-save-test-fixtures";

interface MockDb {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

let mockUuidCounter = 9000;
const mockLoadSnapshots = jest.fn<Promise<AccountReviewAccountSnapshots>, []>();

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
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  randomUUID: (): string =>
    "018f0c7a-1234-4abc-8def-" + String(++mockUuidCounter).padStart(12, "0"),
  digestStringAsync: (_algorithm: string, value: string): Promise<string> => {
    const { createHash: hash } =
      jest.requireActual<typeof import("node:crypto")>("node:crypto");
    return Promise.resolve(hash("sha256").update(value, "utf8").digest("hex"));
  },
}));
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> =>
    Promise.resolve("018f0c7a-1234-4abc-8def-000000000001"),
  supabase: {},
}));
jest.mock("../../services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots:
    (): Promise<AccountReviewAccountSnapshots> => mockLoadSnapshots(),
}));

const { database, __adapter: adapter } = jest.requireMock<MockDb>("@monyvi/db");
const ledger: SqliteLedger = { database, adapter };
const SHOPPING_CATEGORY = testUuid(2201);
const priorDevProperty = Object.getOwnPropertyDescriptor(globalThis, "__DEV__");

beforeAll((): void => {
  Object.defineProperty(globalThis, "__DEV__", {
    configurable: true,
    writable: true,
    value: true,
  });
});
afterAll((): void => {
  if (priorDevProperty) {
    Object.defineProperty(globalThis, "__DEV__", priorDevProperty);
  } else {
    Reflect.deleteProperty(globalThis, "__DEV__");
  }
});

function scope(
  session: AccountReviewSession
): Pick<
  AccountReviewCommand,
  | "ownerId"
  | "sessionId"
  | "expectedReviewRevision"
  | "expectedOperationGeneration"
> {
  return {
    ownerId: session.ownerId,
    sessionId: session.sessionId,
    expectedReviewRevision: session.revision,
    expectedOperationGeneration: session.operationGeneration,
  };
}

function apply(
  state: AccountReviewSession,
  command: AccountReviewCommand,
  snapshots: AccountReviewOwnedContext
): AccountReviewSession {
  const result = reduceAccountReviewCommand({
    state,
    command,
    accountSnapshots: snapshots,
    nextUndoToken: null,
    undo: null,
  });
  expect(result.reasonCodes).toEqual([]);
  expect(result.effect).toBe("session_only");
  return result.state;
}

beforeEach(async (): Promise<void> => {
  await adapter.initializingPromise;
  await clearAndSeed(database, { onlyCategories: true });
  // Ground "shopping" in a real owned EXPENSE category, not a fake category ID.
  await database.write(async (): Promise<void> => {
    const shopping = database
      .get<Category>("categories")
      .prepareCreate((item): void => {
        item._raw.id = SHOPPING_CATEGORY;
        item.userId = OWNER;
        item.type = "EXPENSE";
        item.deleted = false;
        item.displayName = "Shopping";
        item.systemName = "shopping";
        item.isSystem = false;
        item.isHidden = false;
        item.isInternal = false;
        item.icon = "pricetag-outline";
        item.iconLibrary = "Ionicons";
        item.level = 0;
        item.usageCount = 0;
      });
    await database.batch(shopping);
  });
  mockUuidCounter = 9000;
  mockLoadSnapshots.mockReset();
  mockLoadSnapshots.mockResolvedValue({
    ownerId: OWNER,
    preferredCurrency: "EGP",
    accounts: [],
    providerContext: accountReviewRequestContextSchema.parse({
      reviewContractVersion: "account-review/v2",
      preferredCurrency: "EGP",
      accounts: [],
    }),
  });
});

describe("#395 actual Voice TEST Game/CIB selected-only SQLite Save", () => {
  it("creates only the confirmed CIB Bank/child and one Game financial effect; pending QNB survives replay", async () => {
    const context = await loadReviewTranscriptFixturesContext();
    expect(context.ownerId).toBe(OWNER);
    expect(context.categoryIdsBySystemName.get("shopping")).toBe(
      SHOPPING_CATEGORY
    );
    const launch = await buildReviewTranscriptFixtureLaunch({
      scenarioId: "voice-shared-drafts-qnb-cib",
      context,
    });
    expect(launch.status).toBe("launched");
    const initial = launch.session;
    if (!initial)
      throw new Error("Fixture launcher did not return its canonical session");
    expect(initial.rows).toHaveLength(6);
    const game = initial.rows.find(
      (row) => row.transaction.counterparty === "[TEST] Game"
    );
    const cib = initial.groups.find((group) => group.name === "TEST CIB");
    const qnb = initial.groups.find((group) => group.name === "TEST NEW QNB");
    if (!game || !cib || !qnb) throw new Error("Missing grounded Game/CIB/QNB");
    expect(cib).toMatchObject({
      status: "pending",
      type: "BANK",
      currency: "EGP",
    });
    expect(qnb).toMatchObject({
      status: "pending",
      type: "BANK",
      currency: "EGP",
    });
    expect(game.assignment).toMatchObject({
      state: "suggested",
      groupId: cib.groupId,
      confirmation: "pending",
    });

    const snapshots: AccountReviewOwnedContext = {
      ownerId: context.ownerId,
      preferredCurrency: context.preferredCurrency,
      accounts: context.accounts,
      providerContext: context.providerContext,
    };
    const confirmed = apply(
      initial,
      accountReviewCommandSchema.parse({
        ...scope(initial),
        kind: "confirm_group",
        groupId: cib.groupId,
        expectedGroupRevision: cib.revision,
      }),
      snapshots
    );
    const confirmedGame = confirmed.rows.find(
      (row) => row.rowId === game.rowId
    );
    if (!confirmedGame) throw new Error("Confirmed Game row disappeared");
    const selected = apply(
      confirmed,
      accountReviewCommandSchema.parse({
        ...scope(confirmed),
        kind: "select_row",
        rowId: game.rowId,
        expectedRowRevision: confirmedGame.revision,
        groupId: null,
        expectedGroupRevision: null,
        hasSharedConfirmationDisclosure: false,
      }),
      snapshots
    );
    expect(
      selected.rows.filter((row) => row.selected).map((row) => row.rowId)
    ).toEqual([game.rowId]);
    const pendingQnb = selected.groups.find(
      (group) => group.groupId === qnb.groupId
    );
    expect(pendingQnb).toEqual(qnb);
    const untouchedQnbRows = selected.rows.filter(
      (row) =>
        row.assignment.state === "suggested" &&
        row.assignment.groupId === qnb.groupId
    );
    expect(untouchedQnbRows).toHaveLength(3);
    expect(untouchedQnbRows.every((row) => !row.selected)).toBe(true);
    expect(
      untouchedQnbRows.every(
        (row) =>
          row.assignment.state === "suggested" &&
          row.assignment.confirmation === "pending"
      )
    ).toBe(true);

    const sourceBeforeSave = JSON.stringify(selected);
    const capture = captureAccountReviewRuntimeSave(selected, null);
    const prepared = await capture.prepared;
    const frozen = freezeSelectedAccountReview(prepared);
    expect(frozen.selectedRows.map((row) => row.rowId)).toEqual([game.rowId]);
    expect(frozen.neededGroups.map((group) => group.groupId)).toEqual([
      cib.groupId,
    ]);
    expect(
      prepared.intent.plannedEntityIds.map((entity) => entity.entity).sort()
    ).toEqual(["account", "bank_details", "transaction"]);
    const createdId = prepared.intent.plannedEntityIds.find(
      (entity) => entity.entity === "account" && entity.localRef === cib.groupId
    )?.id;
    if (!createdId)
      throw new Error("CIB was not frozen into its selected Save");
    expect(
      prepared.intent.plannedEntityIds.some(
        (entity) => entity.localRef === qnb.groupId
      )
    ).toBe(false);
    expect((await ledgerState(database)).counts).toMatchObject({
      accounts: 0,
      bankDetails: 0,
      transactions: 0,
      effects: 0,
      actions: 0,
    });

    const readCurrent = (
      ownerId: string,
      sessionId: string
    ): Promise<AccountReviewSession> => {
      expect(ownerId).toBe(OWNER);
      expect(sessionId).toBe(selected.sessionId);
      return Promise.resolve(selected);
    };
    await expect(
      saveCapturedAccountReview(capture, readCurrent)
    ).resolves.toMatchObject({ kind: "committed" });
    const persisted = await reopenSqliteLedger(ledger);
    const state = await ledgerState(persisted);
    expect(state.counts).toMatchObject({
      accounts: 1,
      bankDetails: 1,
      senders: 0,
      transactions: 1,
      transfers: 0,
      effects: 1,
      actions: 1,
    });
    const savedAccount = await persisted
      .get<Account>("accounts")
      .find(createdId);
    expect(savedAccount.name).toBe("TEST CIB");
    expect(savedAccount.type).toBe("BANK");
    expect(savedAccount.currency).toBe("EGP");
    expect(savedAccount.balance).toBe(-50);
    expect(savedAccount.financialRevision).toBe("1");
    const bankChildren = await persisted
      .get<BankDetails>("bank_details")
      .query()
      .fetch();
    expect(bankChildren.map((child) => child.accountId)).toEqual([createdId]);
    const transactions = await persisted
      .get<Transaction>("transactions")
      .query()
      .fetch();
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.accountId).toBe(createdId);
    expect(transactions[0]?.amount).toBe(50);
    expect(transactions[0]?.currency).toBe("EGP");
    expect(transactions[0]?.categoryId).toBe(SHOPPING_CATEGORY);
    const effects = await persisted
      .get<AccountFinancialEffect>("account_financial_effects")
      .query()
      .fetch();
    expect(effects).toHaveLength(1);
    expect(effects[0]?.accountId).toBe(createdId);
    expect(effects[0]?.amountMinorUnits).toBe("-5000");

    const firstPhysical = await physicalSaveLedgerSnapshot(persisted);
    await expect(
      saveCapturedAccountReview(capture, readCurrent)
    ).resolves.toMatchObject({ kind: "replay" });
    expect(
      await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
    ).toEqual(firstPhysical);
    expect(JSON.stringify(selected)).toBe(sourceBeforeSave);
    expect(
      selected.groups.find((group) => group.groupId === qnb.groupId)
    ).toEqual(pendingQnb);
    expect(
      selected.rows.filter((row) => row.selected).map((row) => row.rowId)
    ).toEqual([game.rowId]);
  });
});
