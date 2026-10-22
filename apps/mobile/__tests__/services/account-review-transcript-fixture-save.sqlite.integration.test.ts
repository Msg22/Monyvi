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
  FinancialActionGroup,
  Transaction,
} from "@monyvi/db";
import {
  canonicalizeFinancialActionEnvelope,
  hashFinancialActionEnvelope,
  accountReviewCommandSchema,
  accountReviewRequestContextSchema,
  reduceAccountReviewCommand,
  type AccountReviewCommand,
  type AccountReviewOwnedContext,
  type AccountReviewSession,
} from "@monyvi/logic";
import type { AccountReviewAccountSnapshots } from "../../services/account-review-read-model-service";
import { sanitizeReviewFailure } from "../../services/account-review-feedback-diagnostics";
import { reviewSaveFailurePhases } from "../../services/account-review-save-failure-context";
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
  it.each([
    {
      hasExistingDefault: false,
      hasInvalidPriorAction: false,
      hasPendingMetals: false,
      editCurrency: false,
    },
    {
      hasExistingDefault: true,
      hasInvalidPriorAction: false,
      hasPendingMetals: false,
      editCurrency: false,
    },
    {
      hasExistingDefault: true,
      hasInvalidPriorAction: false,
      hasPendingMetals: true,
      editCurrency: false,
    },
    {
      hasExistingDefault: true,
      hasInvalidPriorAction: true,
      hasPendingMetals: false,
      editCurrency: false,
    },
    {
      hasExistingDefault: true,
      hasInvalidPriorAction: false,
      hasPendingMetals: false,
      editCurrency: true,
    },
  ])(
    "selected CIB/Game with default=$hasExistingDefault and invalid prior action=$hasInvalidPriorAction and pending Metals=$hasPendingMetals and edited currency=$editCurrency",
    async ({
      hasExistingDefault,
      hasInvalidPriorAction,
      hasPendingMetals,
      editCurrency,
    }) => {
      const saveCurrency = editCurrency ? "USD" : "EGP";
      if (hasExistingDefault) {
        await database.write(async () => {
          const cash = database
            .get<Account>("accounts")
            .prepareCreate((account) => {
              account._raw.id = testUuid(2301);
              account.userId = OWNER;
              account.name = "Existing cash";
              account.type = "CASH";
              account.currency = "EGP";
              account.balance = 100;
              account.financialRevision = "0";
              account.isDefault = true;
              account.deleted = false;
            });
          await database.batch(cash);
        });
      }
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
        throw new Error(
          "Fixture launcher did not return its canonical session"
        );
      expect(initial.rows).toHaveLength(6);
      const game = initial.rows.find(
        (row) => row.transaction.counterparty === "[TEST] Game"
      );
      const cib = initial.groups.find((group) => group.name === "TEST CIB");
      const qnb = initial.groups.find((group) => group.name === "TEST NEW QNB");
      if (!game || !cib || !qnb)
        throw new Error("Missing grounded Game/CIB/QNB");
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
          ...(editCurrency
            ? {
                ...scope(initial),
                kind: "edit_group",
                groupId: cib.groupId,
                expectedGroupRevision: cib.revision,
                reconfirm: true,
                identity: {
                  name: cib.name,
                  type: cib.type,
                  currency: saveCurrency,
                  institutionId: cib.institutionId,
                  providerDisplayName: cib.providerDisplayName,
                  cardLast4: cib.cardLast4,
                  senderNames: cib.senderNames,
                },
              }
            : {
                ...scope(initial),
                kind: "confirm_group",
                groupId: cib.groupId,
                expectedGroupRevision: cib.revision,
              }),
        }),
        snapshots
      );
      const confirmedGame = confirmed.rows.find(
        (row) => row.rowId === game.rowId
      );
      if (!confirmedGame) throw new Error("Confirmed Game row disappeared");
      expect(confirmedGame.currency).toMatchObject({
        state: "known",
        code: saveCurrency,
      });
      expect(confirmedGame.transaction.amount).toBe(game.transaction.amount);
      expect(confirmedGame.accountEvidence).toEqual(game.accountEvidence);
      if (editCurrency)
        expect(confirmedGame.hasUserCurrencyOverride).toBe(true);
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
        (entity) =>
          entity.entity === "account" && entity.localRef === cib.groupId
      )?.id;
      if (!createdId)
        throw new Error("CIB was not frozen into its selected Save");
      expect(
        prepared.intent.plannedEntityIds.some(
          (entity) => entity.localRef === qnb.groupId
        )
      ).toBe(false);
      expect((await ledgerState(database)).counts).toMatchObject({
        accounts: hasExistingDefault ? 1 : 0,
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
      if (hasPendingMetals) {
        const { createHash } =
          jest.requireActual<typeof import("node:crypto")>("node:crypto");
        const registry = (
          await import("../../services/account-review-financial-command-service")
        ).createAccountReviewFinancialRegistry();
        const validationInput = { latestAllowedCalendarDate: "2026-09-01" };
        const envelope = canonicalizeFinancialActionEnvelope(
          {
            actionId: testUuid(2450),
            accountGuards: [],
            domain: "metals",
            domainReferenceId: testUuid(2451),
            envelopeVersion: "monyvi.financial-action/v1",
            occurredAt: "2026-09-01T12:00:00.000Z",
            kind: "dispose",
            payloadVersion: "metals.dispose/v1",
            userId: OWNER,
            payload: {
              holdingId: testUuid(2451),
              expectedHoldingRevision: "7",
              predecessorEventId: testUuid(2452),
              reversesEventId: null,
              disposalDate: "2026-08-31",
              reason: "lost_or_stolen",
              notes: null,
              rateSnapshots: [],
            },
          },
          registry,
          validationInput
        );
        const signed = await hashFinancialActionEnvelope(
          envelope,
          {
            digestUtf8: (text: string) =>
              Promise.resolve(
                createHash("sha256").update(text, "utf8").digest("hex")
              ),
          },
          registry,
          validationInput
        );
        await database.write(async () => {
          const prior = database
            .get<FinancialActionGroup>("financial_action_groups")
            .prepareCreate((record) => {
              record._raw.id = testUuid(2453);
              record.actionId = envelope.actionId;
              record.userId = OWNER;
              record.domain = envelope.domain;
              record.kind = envelope.kind;
              record.domainReferenceId = envelope.domainReferenceId;
              record.payloadJson = signed.canonicalText;
              record.payloadHash = signed.payloadHash;
              record.accountGuardsJson = "[]";
              record.state = "local_complete";
              record.serverOutcome = null;
              record.outcomeJson = null;
              record.rejectionCode = null;
              record.deleted = false;
              record.updatedAt = new Date();
            });
          await database.batch(prior);
        });
      }
      if (hasInvalidPriorAction) {
        await database.write(async () => {
          const previous = database
            .get<FinancialActionGroup>("financial_action_groups")
            .prepareCreate((record) => {
              record._raw.id = testUuid(2401);
              record.actionId = testUuid(2402);
              record.userId = OWNER;
              record.domain = "transactions";
              record.kind = "review_batch_save";
              record.domainReferenceId = testUuid(2403);
              record.payloadJson = "{}";
              record.payloadHash = "0".repeat(64);
              record.accountGuardsJson = "[]";
              record.state = "local_complete";
              record.serverOutcome = null;
              record.outcomeJson = null;
              record.rejectionCode = null;
              record.deleted = false;
              record.updatedAt = new Date();
            });
          await database.batch(previous);
        });
        const beforeAttempt = await physicalSaveLedgerSnapshot(database);
        let failure: unknown;
        try {
          await saveCapturedAccountReview(capture, readCurrent);
        } catch (error: unknown) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(Error);
        expect(
          sanitizeReviewFailure({
            source: "VOICE",
            stage: "save_invocation",
            error: failure,
          }).code
        ).toBe("account_review_local_default_invalid_prior_action_identity");
        expect(reviewSaveFailurePhases(failure)).toContain(
          "capture_recovery_snapshot"
        );
        expect(
          await physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))
        ).toEqual(beforeAttempt);
        expect(JSON.stringify(selected)).toBe(sourceBeforeSave);
        return;
      }
      await expect(
        saveCapturedAccountReview(capture, readCurrent)
      ).resolves.toMatchObject({ kind: "committed" });
      const persisted = await reopenSqliteLedger(ledger);
      const state = await ledgerState(persisted);
      expect(state.counts).toMatchObject({
        accounts: hasExistingDefault ? 2 : 1,
        bankDetails: 1,
        senders: 0,
        transactions: 1,
        transfers: 0,
        effects: 1,
        actions: hasPendingMetals ? 2 : 1,
      });
      const savedAccount = await persisted
        .get<Account>("accounts")
        .find(createdId);
      expect(savedAccount.name).toBe("TEST CIB");
      expect(savedAccount.type).toBe("BANK");
      expect(savedAccount.currency).toBe(saveCurrency);
      expect(savedAccount.balance).toBe(-50);
      expect(savedAccount.financialRevision).toBe("1");
      expect(savedAccount.isDefault).toBe(!hasExistingDefault);
      if (hasExistingDefault) {
        const prior = await persisted
          .get<Account>("accounts")
          .find(testUuid(2301));
        expect(prior.balance).toBe(100);
        expect(prior.financialRevision).toBe("0");
        expect(prior.isDefault).toBe(true);
      }
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
      expect(transactions[0]?.currency).toBe(saveCurrency);
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
    }
  );
});
