/**
 * #395 T068 actual internal Add command + real Watermelon/SQLite recovery.
 * No fake business writer or in-memory transactional shortcut.
 * Candidate is NOT formally executable Green without Root's envelope gate.
 */
import { createHash, randomUUID } from "node:crypto";
import { Q, type Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  AccountFinancialEffect,
  BankDetails,
  AccountSmsSender,
  FinancialActionGroup,
  Transaction,
} from "@monyvi/db";
import {
  accountFormSchema,
  type AccountFormData,
} from "@/validation/account-validation";
import { assertNoDuplicateAddAccountIdentity } from "@/services/account-service";
import {
  canonicalizeFinancialActionEnvelope,
  hashFinancialActionEnvelope,
} from "@monyvi/logic";
import { createAccountReviewFinancialRegistry } from "@/services/account-review-financial-command-service";
import { readDefaultCreatorDependencies } from "@/services/account-default-intent-snapshot";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "@/services/user-data-access";
import { createAccountDefaultIntentService } from "@/services/account-default-intent-service";
import type { AccountDefaultPreparedCommand } from "@/services/account-default-intent-command";
import {
  clearAndSeed,
  physicalSaveLedgerSnapshot,
  reopenSqliteLedger,
  type SqliteLedger,
} from "./account-review-save-sqlite-test-helpers";
import { ADD_DEFAULT_IDS } from "../../../../packages/logic/src/financial-actions/__tests__/account-create-default-test-fixtures";
import { validateAccountCreateDefaultPayload } from "../../../../packages/logic/src/financial-actions/account-create-default";

interface MockDatabase {
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
  // Use the real physical Watermelon model classes, not a dynamically
  // constructed raw namespace whose exports lose the authoritative types.
  const physical = jest.requireActual<
    typeof import("./account-review-save-ledger-models")
  >("./account-review-save-ledger-models");
  const adapter = new Sqlite({ schema });
  const database = new wm.Database({
    adapter,
    modelClasses: physical.LEDGER_MODEL_CLASSES,
  });
  return {
    database,
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
jest.mock("expo-crypto", () => ({
  randomUUID: (): string =>
    jest
      .requireActual<typeof import("node:crypto")>("node:crypto")
      .randomUUID(),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (_alg: string, value: string): Promise<string> =>
    Promise.resolve(
      jest
        .requireActual<typeof import("node:crypto")>("node:crypto")
        .createHash("sha256")
        .update(value, "utf8")
        .digest("hex")
    ),
}));
let mockCurrentOwner = ADD_DEFAULT_IDS.owner;
jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve(mockCurrentOwner),
  supabase: {},
}));
jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/intro-flag-service", () => ({
  readIntroLocaleOverride: (): Promise<null> => Promise.resolve(null),
}));

const mock = jest.requireMock<MockDatabase>("@monyvi/db");
const ledger: SqliteLedger = {
  database: mock.database,
  adapter: mock.__adapter,
};

function form(
  name: string,
  amount = "0",
  intent = true,
  accountType: AccountFormData["accountType"] = "BANK"
): AccountFormData {
  return accountFormSchema.parse({
    name,
    balance: amount,
    accountType,
    currency: "EGP",
    defaultIntent: intent,
    institutionId: accountType === "BANK" ? "cib" : null,
    providerDisplayName: accountType === "BANK" ? "CIB" : "",
    senderNames: accountType === "CASH" ? [] : ["CIBEGYPT"],
    cardLast4: accountType === "BANK" ? "1234" : "",
  });
}
function service(): ReturnType<typeof createAccountDefaultIntentService> {
  return createAccountDefaultIntentService({
    database: ledger.database,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
    createId: (): string => randomUUID(),
    now: () => new Date("2026-10-16T11:00:00.000Z"),
    hashProvider: {
      digestUtf8: (bytes: string): Promise<string> =>
        Promise.resolve(
          createHash("sha256").update(bytes, "utf8").digest("hex")
        ),
    },
  });
}
async function seed(
  id: string,
  defaultOn: boolean,
  options: Readonly<{ owner?: string; deleted?: boolean; name?: string }> = {}
): Promise<void> {
  const db = ledger.database;
  await db.write(async (): Promise<void> => {
    const account = db.get<Account>("accounts").prepareCreate((model): void => {
      model._raw.id = id;
      model.userId = options.owner ?? ADD_DEFAULT_IDS.owner;
      model.deleted = options.deleted ?? false;
      model.isDefault = defaultOn;
      model.name = options.name ?? "Previous Cash";
      model.type = "CASH";
      model.currency = "EGP";
      model.balance = 100;
      model.financialRevision = "5";
    });
    await db.batch(account);
  });
}
async function snapshot(): Promise<
  Awaited<ReturnType<typeof physicalSaveLedgerSnapshot>>
> {
  return physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger));
}
async function current(): Promise<Database> {
  return reopenSqliteLedger(ledger);
}
async function roots(): Promise<readonly FinancialActionGroup[]> {
  return (await current())
    .get<FinancialActionGroup>("financial_action_groups")
    .query()
    .fetch();
}
async function rows(): Promise<readonly Account[]> {
  return (await current()).get<Account>("accounts").query().fetch();
}
beforeEach(async (): Promise<void> => {
  mockCurrentOwner = ADD_DEFAULT_IDS.owner;
  jest.restoreAllMocks();
  await ledger.adapter.initializingPromise;
  await clearAndSeed(ledger.database, { onlyCategories: true });
});

async function seedUnrelatedMetalsRoot(
  disposalDate = "2026-08-31"
): Promise<FinancialActionGroup> {
  const registry = createAccountReviewFinancialRegistry();
  const holdingId = randomUUID();
  const validationInput = { latestAllowedCalendarDate: disposalDate };
  const envelope = canonicalizeFinancialActionEnvelope(
    {
      actionId: randomUUID(),
      accountGuards: [],
      domain: "metals",
      domainReferenceId: holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      occurredAt: "2026-09-01T12:00:00.000Z",
      kind: "dispose",
      payloadVersion: "metals.dispose/v1",
      userId: ADD_DEFAULT_IDS.owner,
      payload: {
        holdingId,
        expectedHoldingRevision: "7",
        predecessorEventId: randomUUID(),
        reversesEventId: null,
        disposalDate,
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
      digestUtf8: (text: string): Promise<string> =>
        Promise.resolve(
          createHash("sha256").update(text, "utf8").digest("hex")
        ),
    },
    registry,
    validationInput
  );
  return ledger.database.write(async (): Promise<FinancialActionGroup> => {
    const root = ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .prepareCreate((row): void => {
        row.actionId = envelope.actionId;
        row.userId = envelope.userId;
        row.domain = envelope.domain;
        row.kind = envelope.kind;
        row.domainReferenceId = envelope.domainReferenceId;
        row.payloadJson = signed.canonicalText;
        row.payloadHash = signed.payloadHash;
        row.accountGuardsJson = JSON.stringify(envelope.accountGuards);
        row.state = "local_complete";
        row.serverOutcome = null;
        row.outcomeJson = null;
        row.rejectionCode = null;
        row.deleted = false;
      });
    await ledger.database.batch(root);
    return root;
  });
}

describe("#395 prepared Add default command — physical SQLite boundary", () => {
  it("prepares and creates a zero-balance test account after an unrelated valid Metals action without altering the default or Metals root", async (): Promise<void> => {
    await seed(ADD_DEFAULT_IDS.previous, true);
    const metals = await seedUnrelatedMetalsRoot();
    const originalMetalsRaw = { ...metals._raw };
    const scope = await getCurrentUserDataScope();
    await expect(
      readDefaultCreatorDependencies(ledger.database, scope, {
        activeAccountIds: [ADD_DEFAULT_IDS.previous],
        defaultAccount: {
          accountId: ADD_DEFAULT_IDS.previous,
          isDefault: true,
        },
      })
    ).resolves.toEqual([]);
    const svc = service();
    const command = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("TEST after Metals", "0", false)
    );
    expect(command.dependencyActionIds).toEqual([]);
    await expect(svc.commitPrepared(command)).resolves.toMatchObject({
      kind: "committed",
      accountId: command.accountId,
    });
    await expect(svc.commitPrepared(command)).resolves.toMatchObject({
      kind: "replay",
      accountId: command.accountId,
    });
    const db = await current();
    const accounts = await db.get<Account>("accounts").query().fetch();
    expect(accounts).toHaveLength(2);
    expect(
      accounts.find((account) => account.id === command.accountId)
    ).toMatchObject({
      name: "TEST after Metals",
      balance: 0,
      isDefault: false,
    });
    expect(
      accounts.find((account) => account.id === ADD_DEFAULT_IDS.previous)
    ).toMatchObject({
      balance: 100,
      isDefault: true,
    });
    expect(
      (
        await db
          .get<FinancialActionGroup>("financial_action_groups")
          .find(metals.id)
      )._raw
    ).toEqual(originalMetalsRaw);
    expect(
      await db
        .get<AccountFinancialEffect>("account_financial_effects")
        .query()
        .fetch()
    ).toHaveLength(0);
    expect(
      await db.get<Transaction>("transactions").query().fetch()
    ).toHaveLength(0);
  });

  it.each(["malformed", "future"] as const)(
    "still refuses an unrelated %s Metals root before creating any account",
    async (variant): Promise<void> => {
      await seed(ADD_DEFAULT_IDS.previous, true);
      const metals = await seedUnrelatedMetalsRoot(
        variant === "future" ? "2999-01-01" : undefined
      );
      if (variant === "malformed") {
        await ledger.database.write(async (): Promise<void> => {
          await ledger.database.batch(
            metals.prepareUpdate((root): void => {
              root.payloadJson = "{";
            })
          );
        });
      }
      const before = await snapshot();
      await expect(
        service().prepare(
          ADD_DEFAULT_IDS.owner,
          form("TEST rejected Metals", "0", false)
        )
      ).rejects.toThrow("account_default_unparseable_creator_root");
      expect(await snapshot()).toEqual(before);
    }
  );

  it("validates explicit Add intent without accepting a string toggle or altering old optional callers", (): void => {
    expect(
      accountFormSchema.safeParse({
        ...form("Intent", "0", true),
        defaultIntent: "yes",
      }).success
    ).toBe(false);
    expect(
      accountFormSchema.safeParse({
        ...form("Legacy form", "0", true),
        defaultIntent: undefined,
      }).success
    ).toBe(true);
  });

  it("retains optional Bank account number and card/sender metadata in immutable intent and physical rows", async (): Promise<void> => {
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      accountFormSchema.parse({
        ...form("Bank with number", "0", true),
        accountNumber: " 001234567 ",
      })
    );
    const records = prepared.envelope.payload.domainMutation;
    expect(JSON.stringify(records)).toContain('"accountNumber":"001234567"');
    await svc.commitPrepared(prepared);
    const db = await current();
    const details = await db.get<BankDetails>("bank_details").query().fetch();
    expect(details).toHaveLength(1);
    expect(details[0]?.accountNumber).toBe("001234567");
    expect(details[0]?.cardLast4).toBe(1234);
  });

  it("keeps original immutable card 0003 and Bank account-number leading zeros while physical numeric card storage stays canonical", async (): Promise<void> => {
    const svc = service();
    const original = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      accountFormSchema.parse({
        ...form("Card 003 unchanged", "0", true),
        accountNumber: " 000123456 ",
        cardLast4: "0003",
      })
    );
    const payload = JSON.stringify(original.envelope.payload.domainMutation);
    expect(payload).toContain('"accountNumber":"000123456"');
    expect(payload).toContain('"cardLast4":"0003"');
    await expect(svc.commitPrepared(original)).resolves.toMatchObject({
      kind: "committed",
      accountId: original.accountId,
    });
    const db = await current();
    const bank = await db.get<BankDetails>("bank_details").query().fetch();
    expect(bank).toHaveLength(1);
    expect(bank[0]?.accountNumber).toBe("000123456");
    expect(bank[0]?.cardLast4).toBe(3);
    const action = await db
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", original.envelope.actionId))
      .fetch();
    expect(action).toHaveLength(1);
    expect(action[0]?.payloadJson).toContain('"cardLast4":"0003"');
  });

  it("prepares a frozen first-account OFF intent with only one default and no fabricated financial effect", async (): Promise<void> => {
    const svc = service();
    const command = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("First Cash", "0", false, "CASH")
    );
    expect(command.snapshot).toEqual({
      activeAccountIds: [],
      defaultAccount: null,
    });
    expect(command.envelope).toMatchObject({
      domain: "accounts",
      kind: "create_with_default",
      payloadVersion: "account.create-default/v1",
      domainReferenceId: command.accountId,
      accountGuards: [],
      payload: {
        defaultIntent: false,
        accountEffects: [],
      },
    });
    // Inspect the real strictly parsed Add mutation instead of assigning
    // Jest's untyped nested objectContaining result to a record array.
    const mutations = validateAccountCreateDefaultPayload(
      command.envelope.payload
    ).domainMutation.records;
    expect(mutations).toHaveLength(1);
    const accountCreate = mutations[0];
    expect(accountCreate?.entity).toBe("account");
    if (!accountCreate || accountCreate.entity !== "account")
      throw new Error("Expected one canonical new-account mutation");
    expect(accountCreate.mode).toBe("create");
    expect(accountCreate.after.isDefault).toBe(true);
    expect(Object.isFrozen(command.envelope)).toBe(true);
    expect(Object.isFrozen(command.envelope.payload)).toBe(true);
    const result = await svc.commitPrepared(command);
    expect(result).toEqual({ kind: "committed", accountId: command.accountId });
    const db = await current();
    const all = await db.get<Account>("accounts").query().fetch();
    const effects = await db
      .get<AccountFinancialEffect>("account_financial_effects")
      .query()
      .fetch();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: command.accountId,
      isDefault: true,
      balance: 0,
      financialRevision: "0",
    });
    expect(effects).toHaveLength(0);
    const actionRoots = await roots();
    expect(actionRoots).toHaveLength(1);
    expect(actionRoots[0]).toMatchObject({
      kind: "create_with_default",
      domain: "accounts",
      domainReferenceId: command.accountId,
    });
  });

  it("commits later ON, previous-default clear and exact bank/card/sender children in one action", async (): Promise<void> => {
    await seed(ADD_DEFAULT_IDS.previous, true);
    const svc = service();
    const command = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Bank Later", "0", true)
    );
    const result = await svc.commitPrepared(command);
    expect(result.kind).toBe("committed");
    const db = await current();
    const accounts = await db.get<Account>("accounts").query().fetch();
    expect(
      accounts.find((a) => a.id === ADD_DEFAULT_IDS.previous)?.isDefault
    ).toBe(false);
    expect(accounts.find((a) => a.id === command.accountId)?.isDefault).toBe(
      true
    );
    expect(accounts.filter((a) => !a.deleted && a.isDefault)).toHaveLength(1);
    const details = await db.get<BankDetails>("bank_details").query().fetch();
    const senders = await db
      .get<AccountSmsSender>("account_sms_senders")
      .query()
      .fetch();
    expect(details).toHaveLength(1);
    expect(details[0]?.accountId).toBe(command.accountId);
    expect(details[0]?.cardLast4).toBe(1234);
    expect(senders).toHaveLength(1);
    expect(senders[0]?.normalizedSenderName).toBe("cibegypt");
    expect(senders[0]?.accountId).toBe(command.accountId);
    expect(
      await db
        .get<AccountFinancialEffect>("account_financial_effects")
        .query()
        .fetch()
    ).toHaveLength(0);
    expect(await roots()).toHaveLength(1);
  });

  it("rejects the second of two independently prepared first-account commands with the same frozen empty snapshot", async (): Promise<void> => {
    const svc = service();
    // Both plans deliberately capture BEFORE either local commit; this is
    // deterministic, unlike entrypoint Promise.all scheduling.
    const first = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Frozen First Cash", "0", false, "CASH")
    );
    const second = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Frozen Second Bank", "0", false, "BANK")
    );
    const emptyDefaultSnapshot = {
      activeAccountIds: [],
      defaultAccount: null,
    };
    expect(first.snapshot).toEqual(emptyDefaultSnapshot);
    expect(second.snapshot).toEqual(emptyDefaultSnapshot);
    expect(first.accountId).not.toBe(second.accountId);
    expect(first.envelope.actionId).not.toBe(second.envelope.actionId);
    const secondRootId = second.envelope.actionId;
    const secondNewAccountId = second.accountId;
    const originalSecondEnvelope = second.envelope;

    expect((await svc.commitPrepared(first)).kind).toBe("committed");
    const committed = await snapshot();
    const rootsAfterFirst = await roots();
    expect(rootsAfterFirst).toHaveLength(1);
    expect(rootsAfterFirst[0]?.actionId).toBe(first.envelope.actionId);

    await expect(svc.commitPrepared(second)).rejects.toThrow(
      "account_default_stale_default_snapshot"
    );
    expect(second.envelope).toBe(originalSecondEnvelope);
    expect(second.snapshot).toEqual(emptyDefaultSnapshot);
    // Failed stale intent may not leave even a pending root or orphan child.
    expect(await snapshot()).toEqual(committed);
    const db = await current();
    const accounts = await db.get<Account>("accounts").query().fetch();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      id: first.accountId,
      isDefault: true,
      financialRevision: "0",
    });
    expect(accounts.some((account) => account.id === secondNewAccountId)).toBe(
      false
    );
    const actualRoots = await roots();
    expect(actualRoots).toHaveLength(1);
    expect(actualRoots.some((root) => root.actionId === secondRootId)).toBe(
      false
    );
    expect(
      await db.get<BankDetails>("bank_details").query().fetch()
    ).toHaveLength(0);
    expect(
      await db.get<AccountSmsSender>("account_sms_senders").query().fetch()
    ).toHaveLength(0);
    expect(
      await db
        .get<AccountFinancialEffect>("account_financial_effects")
        .query()
        .fetch()
    ).toHaveLength(0);
  });

  it("rejects a newly created owned account after the original active-ID snapshot was captured", async (): Promise<void> => {
    await seed(ADD_DEFAULT_IDS.previous, true);
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Stale Added Member")
    );
    await seed(ADD_DEFAULT_IDS.other, false, { name: "New active member" });
    const before = await snapshot();
    await expect(svc.commitPrepared(prepared)).rejects.toThrow(
      "account_default_stale_default_snapshot"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("rejects a changed current default without overwriting the new choice", async (): Promise<void> => {
    await seed(ADD_DEFAULT_IDS.previous, true);
    await seed(ADD_DEFAULT_IDS.other, false, { name: "Another account" });
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Stale Previous Default")
    );
    await ledger.database.write(async (): Promise<void> => {
      const old = await ledger.database
        .get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.previous);
      const replacement = await ledger.database
        .get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.other);
      await ledger.database.batch(
        old.prepareUpdate((account) => {
          account.isDefault = false;
        }),
        replacement.prepareUpdate((account) => {
          account.isDefault = true;
        })
      );
    });
    const before = await snapshot();
    await expect(svc.commitPrepared(prepared)).rejects.toThrow(
      "account_default_stale_default_snapshot"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("accepts equivalent historical A→B→A logical default set, without timestamp-based staleness", async (): Promise<void> => {
    await seed(ADD_DEFAULT_IDS.previous, true);
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Equivalent Default")
    );
    await ledger.database.write(async (): Promise<void> => {
      const a = await ledger.database
        .get<Account>("accounts")
        .find(ADD_DEFAULT_IDS.previous);
      await a.update((account) => {
        account.isDefault = false;
      });
      await a.update((account) => {
        account.isDefault = true;
      });
    });
    await expect(svc.commitPrepared(prepared)).resolves.toMatchObject({
      kind: "committed",
      accountId: prepared.accountId,
    });
  });

  it("rejects a changed authenticated actor after prepare before any local mutation", async (): Promise<void> => {
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Actor Switch", "0")
    );
    const before = await snapshot();
    mockCurrentOwner = ADD_DEFAULT_IDS.foreignOwner;
    await expect(svc.commitPrepared(prepared)).rejects.toThrow();
    mockCurrentOwner = ADD_DEFAULT_IDS.owner;
    expect(await snapshot()).toEqual(before);
  });

  it("replays the SAME original envelope without generating new account, sender, child or root IDs", async (): Promise<void> => {
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Replay Bank", "0")
    );
    expect((await svc.commitPrepared(prepared)).kind).toBe("committed");
    const before = await snapshot();
    const oldRoots = await roots();
    const second = await svc.commitPrepared(prepared);
    expect(second).toEqual({ kind: "replay", accountId: prepared.accountId });
    expect(await snapshot()).toEqual(before);
    expect((await roots()).map((root) => root.actionId)).toEqual(
      oldRoots.map((root) => root.actionId)
    );
  });

  it("same action ID with a different otherwise-valid immutable command fails payload-hash matching", async (): Promise<void> => {
    const svc = service();
    const initial = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Action Hash One", "0")
    );
    await svc.commitPrepared(initial);
    const changed = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Action Hash Two", "0", false)
    );
    const conflict: AccountDefaultPreparedCommand = {
      ...changed,
      envelope: {
        ...changed.envelope,
        actionId: initial.envelope.actionId,
      },
    };
    const before = await snapshot();
    await expect(svc.commitPrepared(conflict)).rejects.toThrow(
      "action_id_payload_mismatch"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("physical commit failure restores pre-default, account, child, root and financial cache together", async (): Promise<void> => {
    await seed(ADD_DEFAULT_IDS.previous, true);
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Atomic Error", "0", true)
    );
    const before = await snapshot();
    const failure = new Error("injected_real_atomic_batch_failure");
    const atomic = jest
      .spyOn(ledger.database, "batch")
      .mockRejectedValueOnce(failure);
    await expect(svc.commitPrepared(prepared)).rejects.toThrow(
      "injected_real_atomic_batch_failure"
    );
    expect(atomic).toHaveBeenCalledTimes(1);
    expect(await snapshot()).toEqual(before);
    expect(
      (await rows()).find((a) => a.id === ADD_DEFAULT_IDS.previous)?.isDefault
    ).toBe(true);
    expect(await roots()).toHaveLength(0);
  });

  it("keeps a deleted/foreign physical UUID collision out of new account create, without owner leakage", async (): Promise<void> => {
    const svc = service();
    const prepared = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Foreign Collision", "0")
    );
    await seed(prepared.accountId, false, {
      owner: ADD_DEFAULT_IDS.foreignOwner,
      deleted: true,
    });
    const before = await snapshot();
    await expect(svc.commitPrepared(prepared)).rejects.toThrow(
      "account_default_writer_create_id_collision"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("nonzero opening must eventually commit exact +1001 effect and revision1 under the new guard", async (): Promise<void> => {
    const svc = service();
    const command = await svc.prepare(
      ADD_DEFAULT_IDS.owner,
      form("Opening 10.01", "10.01")
    );
    expect(command.envelope.accountGuards).toEqual([
      { accountId: command.accountId, expectedRevision: "0" },
    ]);
    expect(command.envelope.payload.accountEffects).toEqual([
      {
        accountId: command.accountId,
        amountMinorUnits: "1001",
        currency: "EGP",
        effectId: command.effectId,
      },
    ]);
    // Current shared action-contracts.ts gate rejects new-tuple nonempty
    // guards until Root explicitly grants its separate narrow change.
    await svc.commitPrepared(command);
    const db = await current();
    const account = await db.get<Account>("accounts").find(command.accountId);
    expect(account.balance).toBe(10.01);
    expect(account.financialRevision).toBe("1");
    const effects = await db
      .get<AccountFinancialEffect>("account_financial_effects")
      .query()
      .fetch();
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      amountMinorUnits: "1001",
      acceptedAccountRevision: "1",
      accountId: command.accountId,
      actionId: command.envelope.actionId,
    });
    expect(
      await db.get<Transaction>("transactions").query().fetch()
    ).toHaveLength(0);
  });
});
