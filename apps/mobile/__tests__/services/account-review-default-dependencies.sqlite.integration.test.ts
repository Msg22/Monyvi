/**
 * #395 T048/T050 TESTS-FIRST — original owned predecessor-root integrity.
 * This suite calls the REAL captureReviewDefaultDependencies() with a real
 * Watermelon/SQLite adapter and authenticated scoped query. It does not
 * substitute a future hash-verification callback or mock the collector.
 *
 * Pro High: persisted Add creator roots need canonical bytes, SHA-256, guards
 * and complete envelope/root identity before they become predecessors.
 * Current source is expected RED for the first three tampering cases.
 */
import { createHash } from "node:crypto";
import type { Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  canonicalizeFinancialActionEnvelope,
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";
import { validateAccountCreateDefaultPayload } from "../../../../packages/logic/src/financial-actions/account-create-default";
import {
  validateReviewBatchSavePayload,
  type ReviewBatchSavePayload,
} from "../../../../packages/logic/src/financial-actions/review-batch-save";
import {
  ADD_DEFAULT_CREATED_AT,
  ADD_DEFAULT_IDS,
  makeAccountCreateDefaultPayload,
} from "../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";
import {
  legacyEditBalanceEnvelope,
  NEW_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  reviewBatchSavePayload,
  smsNewBankEnvelope,
} from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";
import { captureReviewDefaultDependencies } from "@/services/account-review-local-snapshot-defaults";
import { createAccountReviewFinancialRegistry } from "@/services/account-review-financial-command-service";
import { getCurrentUserDataScope } from "@/services/user-data-access";
import {
  clearAndSeed,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import {
  FOREIGN_OWNER,
  OWNER,
  testUuid,
} from "./account-review-save-test-fixtures";

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
  const physical = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  const adapter = new Sqlite({ schema });
  return {
    database: new wm.Database({
      adapter,
      modelClasses: physical.LEDGER_MODEL_CLASSES,
    }),
    __adapter: adapter,
    schema,
    Q: wm.Q,
    Account: physical.Account,
    AccountFinancialEffect: physical.AccountFinancialEffect,
    AccountSmsSender: physical.AccountSmsSender,
    BankDetails: physical.BankDetails,
    Category: physical.Category,
    FinancialActionGroup: physical.FinancialActionGroup,
    Transaction: physical.Transaction,
    Transfer: physical.Transfer,
    SmsReviewQueue: physical.SmsReviewQueue,
    SmsReviewDraftItem: physical.SmsReviewDraftItem,
    DismissedSmsFingerprint: physical.DismissedSmsFingerprint,
  };
});

let mockActiveOwner = OWNER;
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockActiveOwner),
  supabase: {},
}));
jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const mockDb = jest.requireMock<MockDb>("@monyvi/db");
const ledger: SqliteLedger = {
  database: mockDb.database,
  adapter: mockDb.__adapter,
};
const registry = createAccountReviewFinancialRegistry();
const hashProvider: Sha256Provider = {
  digestUtf8: (content: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(content, "utf8").digest("hex")),
};
const REVIEW_ACTION = testUuid(8800);
let nextPhysicalRoot = 8900;

function addEnvelope(userId: string = OWNER): FinancialActionEnvelopeV1 {
  // Existing T064 closed fixture: the old default UUID occurs both in the
  // active snapshot and in an account_default UPDATE, but is not a creator.
  const payload = validateAccountCreateDefaultPayload(
    makeAccountCreateDefaultPayload({
      accountType: "CASH",
      activeAccountIds: [ADD_DEFAULT_IDS.previous],
      currentDefaultId: ADD_DEFAULT_IDS.previous,
      defaultIntent: true,
      withBankDetails: false,
      withSender: false,
    })
  );
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: ADD_DEFAULT_IDS.action,
      accountGuards: [],
      domain: "accounts",
      domainReferenceId: ADD_DEFAULT_IDS.newAccount,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "create_with_default",
      occurredAt: ADD_DEFAULT_CREATED_AT,
      payload,
      payloadVersion: "account.create-default/v1",
      userId,
    },
    registry
  );
}

function reviewPayloadForExisting(accountId: string): ReviewBatchSavePayload {
  // Reuse the real strict zero-net Review fixture, changing only its owned
  // existing account ID. No account create / default snapshot is invented.
  return validateReviewBatchSavePayload({
    ...reviewBatchSavePayload,
    accountEffects: reviewBatchSavePayload.accountEffects.map((effect) => ({
      ...effect,
      accountId,
    })),
    domainMutation: {
      records: reviewBatchSavePayload.domainMutation.records.map((record) => ({
        ...record,
        after: { ...record.after, accountId },
      })),
    },
  });
}

async function seedOwnedAccount(
  id: string,
  ownerId: string,
  isDefault: boolean,
  type: "CASH" | "BANK" = "CASH"
): Promise<void> {
  const db = ledger.database;
  await db.write(async (): Promise<void> => {
    const row = db.get<Account>("accounts").prepareCreate((account) => {
      account._raw.id = id;
      account.userId = ownerId;
      account.name = "Physical predecessor account";
      account.type = type;
      account.currency = "EGP";
      account.balance = 0;
      account.financialRevision = "0";
      account.isDefault = isDefault;
      account.deleted = false;
    });
    await db.batch(row);
  });
}

async function storeRoot(
  envelope: FinancialActionEnvelopeV1,
  state = "local_complete"
): Promise<FinancialActionGroup> {
  const signed = await hashFinancialActionEnvelope(
    envelope,
    hashProvider,
    registry
  );
  const db = ledger.database;
  const physicalId = testUuid(nextPhysicalRoot++);
  const record = db
    .get<FinancialActionGroup>("financial_action_groups")
    .prepareCreate((row) => {
      row._raw.id = physicalId;
      row.actionId = envelope.actionId;
      row.userId = envelope.userId;
      row.domain = envelope.domain;
      row.kind = envelope.kind;
      row.domainReferenceId = envelope.domainReferenceId;
      row.payloadJson = signed.canonicalText;
      row.payloadHash = signed.payloadHash;
      row.accountGuardsJson = JSON.stringify(envelope.accountGuards);
      row.state = state;
      row.serverOutcome = state === "accepted" ? "accepted" : null;
      row.outcomeJson = null;
      row.rejectionCode = null;
      row.deleted = false;
      row.updatedAt = new Date(ADD_DEFAULT_CREATED_AT);
    });
  await db.write(async (): Promise<void> => {
    await db.batch(record);
  });
  return record;
}

async function editRoot(
  root: FinancialActionGroup,
  update: (record: FinancialActionGroup) => void
): Promise<void> {
  await ledger.database.write(async (): Promise<void> => {
    await ledger.database.batch(root.prepareUpdate(update));
  });
}

async function seedPendingAdd(ownerId = OWNER): Promise<FinancialActionGroup> {
  await seedOwnedAccount(ADD_DEFAULT_IDS.previous, ownerId, false);
  await seedOwnedAccount(ADD_DEFAULT_IDS.newAccount, ownerId, true);
  return storeRoot(addEnvelope(ownerId));
}

async function captureForExisting(
  accountId: string
): Promise<readonly string[]> {
  const scope = await getCurrentUserDataScope();
  expect(scope.userId).toBe(OWNER);
  return captureReviewDefaultDependencies({
    database: ledger.database,
    scope,
    ownerId: OWNER,
    actionId: REVIEW_ACTION,
    payload: reviewPayloadForExisting(accountId),
    hashProvider,
  });
}

beforeEach(async (): Promise<void> => {
  mockActiveOwner = OWNER;
  nextPhysicalRoot = 8900;
  await ledger.adapter.initializingPromise;
  await clearAndSeed(ledger.database, { onlyCategories: true });
});
afterEach((): void => {
  mockActiveOwner = OWNER;
});

describe("#395 T048 original owned Add predecessor evidence (real SQLite)", () => {
  it("accepts one genuinely related, canonical, pending Add creator root", async (): Promise<void> => {
    const root = await seedPendingAdd();
    const envelope = parseFinancialActionEnvelopeJson(
      root.payloadJson,
      registry
    );
    const signed = await hashFinancialActionEnvelope(
      envelope,
      hashProvider,
      registry
    );
    expect(root.payloadJson).toBe(signed.canonicalText);
    expect(root.payloadHash).toBe(signed.payloadHash);
    expect(root.accountGuardsJson).toBe(JSON.stringify(envelope.accountGuards));
    expect(await captureForExisting(ADD_DEFAULT_IDS.newAccount)).toEqual([
      ADD_DEFAULT_IDS.action,
    ]);
  });

  it("RED: rejects a related pending Add with an unrelated stored payloadHash", async (): Promise<void> => {
    const root = await seedPendingAdd();
    const originalJson = root.payloadJson;
    const falseHash = "0".repeat(64);
    expect(falseHash).not.toBe(root.payloadHash);
    await editRoot(root, (row) => {
      row.payloadHash = falseHash;
    });
    expect(root.payloadJson).toBe(originalJson);
    // Current Pro source only parses the registered envelope/identity.
    // The real collector must additionally verify stored canonical SHA-256.
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow();
  });

  it("RED: rejects a valid Add envelope whose stored accountGuardsJson lies", async (): Promise<void> => {
    const root = await seedPendingAdd();
    const parsed = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
    expect(parsed.accountGuards).toEqual([]);
    await editRoot(root, (row) => {
      row.accountGuardsJson = JSON.stringify([
        {
          accountId: ADD_DEFAULT_IDS.newAccount,
          expectedRevision: "0",
        },
      ]);
    });
    // Syntactically valid guards JSON, but it contradicts the zero-effect Add
    // envelope. Do not accept it as a creator merely from kind/UUID equality.
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow();
  });

  it("RED: rejects noncanonical stored envelope text even when its own raw SHA-256 matches", async (): Promise<void> => {
    const root = await seedPendingAdd();
    const noncanonical = "\n" + root.payloadJson + "\n";
    const rawSha256 = await hashProvider.digestUtf8(noncanonical);
    const parsed = parseFinancialActionEnvelopeJson(noncanonical, registry);
    const canonical = await hashFinancialActionEnvelope(
      parsed,
      hashProvider,
      registry
    );
    expect(canonical.canonicalText).not.toBe(noncanonical);
    expect(canonical.payloadHash).not.toBe(rawSha256);
    await editRoot(root, (row) => {
      row.payloadJson = noncanonical;
      row.payloadHash = rawSha256;
    });
    expect(root.payloadHash).toBe(
      await hashProvider.digestUtf8(root.payloadJson)
    );
    // Only a canonical-text equality check distinguishes these two hashes.
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow();
  });

  it("rejects a stored root/actionId mismatch despite a valid canonical payload", async (): Promise<void> => {
    const root = await seedPendingAdd();
    await editRoot(root, (row) => {
      row.actionId = testUuid(8901);
    });
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow("invalid_prior_action_identity");
  });

  it("rejects a root/domainReferenceId mismatch with the exact prior-default update ID", async (): Promise<void> => {
    const root = await seedPendingAdd();
    await editRoot(root, (row) => {
      row.domainReferenceId = ADD_DEFAULT_IDS.previous;
    });
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow("invalid_prior_action_identity");
  });

  it("RED: rejects a stored Add creator disguised as edit_balance instead of skipping it", async (): Promise<void> => {
    const root = await seedPendingAdd();
    await editRoot(root, (row) => {
      row.kind = "edit_balance";
    });
    // The stored canonical envelope still says create_with_default; treating
    // the root as an unrelated legacy edit would erase a true predecessor.
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow();
  });

  it("RED: rejects a stored Add creator with an unrelated domain instead of silently ignoring it", async (): Promise<void> => {
    const root = await seedPendingAdd();
    await editRoot(root, (row) => {
      row.domain = "transactions";
    });
    // A row/envelope domain mismatch must not bypass creator discovery.
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow();
  });

  it("rejects a root/envelope owner mismatch even if the altered envelope is correctly rehashed", async (): Promise<void> => {
    const root = await seedPendingAdd();
    const foreignEnvelope = canonicalizeFinancialActionEnvelope(
      {
        ...addEnvelope(),
        userId: FOREIGN_OWNER,
      },
      registry
    );
    const signed = await hashFinancialActionEnvelope(
      foreignEnvelope,
      hashProvider,
      registry
    );
    await editRoot(root, (row) => {
      row.payloadJson = signed.canonicalText;
      row.payloadHash = signed.payloadHash;
    });
    await expect(
      captureForExisting(ADD_DEFAULT_IDS.newAccount)
    ).rejects.toThrow("invalid_prior_action_identity");
  });

  it("ignores a valid unrelated pending Add even when an owned account is affected", async (): Promise<void> => {
    await seedPendingAdd();
    await seedOwnedAccount(ADD_DEFAULT_IDS.other, OWNER, false);
    expect(await captureForExisting(ADD_DEFAULT_IDS.other)).toEqual([]);
  });

  it("never treats a captured previous-default UPDATE ref as an account creator", async (): Promise<void> => {
    const root = await seedPendingAdd();
    const envelope = parseFinancialActionEnvelopeJson(
      root.payloadJson,
      registry
    );
    const payload = validateAccountCreateDefaultPayload(envelope.payload);
    expect(payload.domainRecordRefs).toContain(ADD_DEFAULT_IDS.previous);
    expect(payload.domainMutation.records).toContainEqual({
      entity: "account_default",
      mode: "update",
      expectedIsDefault: true,
      after: { id: ADD_DEFAULT_IDS.previous, isDefault: false },
    });
    expect(await captureForExisting(ADD_DEFAULT_IDS.previous)).toEqual([]);
  });

  it("keeps canonical pending Review account creators as predecessors", async (): Promise<void> => {
    await seedOwnedAccount(REVIEW_ACCOUNT_ID, OWNER, false);
    await seedOwnedAccount(NEW_BANK_ACCOUNT_ID, OWNER, false, "BANK");
    const reviewEnvelope = canonicalizeFinancialActionEnvelope(
      {
        ...smsNewBankEnvelope,
        actionId: testUuid(8902),
        userId: OWNER,
      },
      registry
    );
    const reviewRoot = await storeRoot(reviewEnvelope);
    expect(await captureForExisting(NEW_BANK_ACCOUNT_ID)).toEqual([
      reviewRoot.actionId,
    ]);
  });

  it("ignores a canonical legacy edit_balance action with no account creation", async (): Promise<void> => {
    await seedOwnedAccount(REVIEW_ACCOUNT_ID, OWNER, true);
    const legacy = canonicalizeFinancialActionEnvelope(
      {
        ...legacyEditBalanceEnvelope,
        actionId: testUuid(8903),
        userId: OWNER,
      },
      registry
    );
    await storeRoot(legacy);
    expect(await captureForExisting(REVIEW_ACCOUNT_ID)).toEqual([]);
  });

  it("continues to reject an unsupported account predecessor tuple", async (): Promise<void> => {
    await seedOwnedAccount(REVIEW_ACCOUNT_ID, OWNER, true);
    const legacy = canonicalizeFinancialActionEnvelope(
      {
        ...legacyEditBalanceEnvelope,
        actionId: testUuid(8904),
        userId: OWNER,
      },
      registry
    );
    const root = await storeRoot(legacy);
    await editRoot(root, (row) => {
      row.kind = "unsupported_account_tuple";
    });
    await expect(captureForExisting(REVIEW_ACCOUNT_ID)).rejects.toThrow(
      "unprovable_account_predecessor"
    );
  });

  it("never reads another owner's pending Add root as a predecessor", async (): Promise<void> => {
    await seedOwnedAccount(ADD_DEFAULT_IDS.newAccount, OWNER, true);
    await storeRoot(addEnvelope(FOREIGN_OWNER));
    expect(await captureForExisting(ADD_DEFAULT_IDS.newAccount)).toEqual([]);
  });
});
