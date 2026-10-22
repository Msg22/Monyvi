/**
 * #395 first-release Cash prerequisites: real SQLite rows and protected
 * action-bundle ordering. External auth and pull transport use the existing
 * lifecycle fixture; no account/transfer writer or collector is mocked.
 */
import { setGenerator } from "@nozbe/watermelondb/utils/common/randomId";
import {
  OWNER,
  FOREIGN,
  Q,
  ledger,
  randomUUID,
  form,
  hashProvider,
  syncFixtureControls,
  realSynchronize,
  createAccountDefaultIntentService,
  getCurrentUserDataScope,
  assertExpectedCurrentUser,
  assertNoDuplicateAddAccountIdentity,
  collectAccountFinancialActionPushBundles,
  type Model,
  type SyncPullResult,
  type SyncPushArgs,
  type SyncTableChangeSet,
  type AccountDefaultPreparedCommand,
  type AccountFormData,
} from "./account-create-default-sync-lifecycle-fixtures";
// Import production consumers AFTER the fixture registers its real SQLite
// @monyvi/db replacement; importing them first initializes the native bridge.
import { ensureCashAccount } from "@/services/account-service";
import { createSmsAtmTransfer } from "@/services/transfer-service";
import type {
  Account,
  AccountFinancialEffect,
  FinancialActionGroup,
} from "@monyvi/db";

const REMOTE_BANK_ID = "1a000000-0000-4000-8000-000000000001";
const BANK_ACTION_LAST = "ffffffff-ffff-4fff-bfff-ffffffffffff";
const CASH_ACTION_FIRST = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-10-18T03:00:00.000Z");

async function seedRemoteBank(): Promise<void> {
  const createdAt = Date.parse("2026-10-14T12:00:00.000Z");
  await realSynchronize(ledger.database, {
    pull: (): Promise<SyncPullResult> =>
      Promise.resolve({
        changes: {
          accounts: {
            created: [
              {
                id: REMOTE_BANK_ID,
                user_id: OWNER,
                name: "Owned remote bank",
                type: "BANK",
                currency: "EGP",
                balance: 100,
                financial_revision: "0",
                is_default: true,
                deleted: false,
                created_at: createdAt,
                updated_at: createdAt,
              },
            ],
            updated: [],
            deleted: [],
          },
        },
        timestamp: ++syncFixtureControls.mockNextWatermark,
      }),
  });
}

async function pendingZeroAdd(
  name: string,
  type: AccountFormData["accountType"],
  actionId: string
): Promise<AccountDefaultPreparedCommand> {
  let ordinal = 0;
  const service = createAccountDefaultIntentService({
    database: ledger.database,
    getCurrentUserDataScope,
    assertExpectedCurrentUser,
    assertNoDuplicateAccountIdentity: assertNoDuplicateAddAccountIdentity,
    createId: (): string => (ordinal++ === 0 ? actionId : randomUUID()),
    now: (): Date => AT,
    hashProvider,
  });
  const command = await service.prepare(OWNER, form(name, "0", false, type));
  expect(command.envelope.actionId).toBe(actionId);
  expect(command.envelope.accountGuards).toEqual([]);
  expect(command.effectId).toBeNull();
  await expect(service.commitPrepared(command)).resolves.toMatchObject({
    kind: "committed",
    accountId: command.accountId,
  });
  return command;
}

/** Feed the real physical dirty Watermelon rows into the production collector. */
async function sqliteDirtyChanges(): Promise<SyncPushArgs["changes"]> {
  const changes: Record<string, SyncTableChangeSet> = {};
  for (const table of [
    "accounts",
    "bank_details",
    "account_sms_senders",
    "transfers",
    "account_financial_effects",
    "financial_action_groups",
  ]) {
    const rows = await ledger.database.get<Model>(table).query().fetch();
    changes[table] = {
      created: rows
        .filter((row) => row._raw._status === "created")
        .map((row) => row._raw),
      updated: rows
        .filter((row) => row._raw._status === "updated")
        .map((row) => row._raw),
      deleted: [],
    };
  }
  return changes;
}

describe("#395 pending Bank/Cash creator prerequisites", () => {
  beforeAll((): void => setGenerator(randomUUID));

  it("orders zero-guard BankAdd -> zero-guard CashAdd -> real ATM despite reversed action IDs", async () => {
    await seedRemoteBank();
    const bank = await pendingZeroAdd("Pending bank", "BANK", BANK_ACTION_LAST);
    const cash = await pendingZeroAdd(
      "Pending cash",
      "CASH",
      CASH_ACTION_FIRST
    );
    expect(cash.snapshot.activeAccountIds).toContain(bank.accountId);
    expect(cash.dependencyActionIds).toContain(bank.envelope.actionId);
    expect(cash.envelope.accountGuards).toEqual([]);
    expect(bank.envelope.accountGuards).toEqual([]);

    await expect(
      createSmsAtmTransfer({
        bankAccountId: REMOTE_BANK_ID,
        amount: 25,
        currency: "EGP",
        date: AT,
        smsFingerprint: "d".repeat(64),
        expectedUserId: OWNER,
      })
    ).resolves.toEqual({ success: true });
    const transfers = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("user_id", OWNER), Q.where("domain", "transfers"))
      .fetch();
    expect(transfers).toHaveLength(1);
    const atmActionId = transfers[0]?.actionId;
    expect(atmActionId).toBeDefined();
    expect(BANK_ACTION_LAST > CASH_ACTION_FIRST).toBe(true);
    expect(BANK_ACTION_LAST > (atmActionId ?? "")).toBe(true);

    const actualBundles = collectAccountFinancialActionPushBundles(
      await sqliteDirtyChanges()
    );
    expect(actualBundles.map((bundle) => bundle.candidate.actionId)).toEqual([
      bank.envelope.actionId,
      cash.envelope.actionId,
      atmActionId,
    ]);
  });

  it("concurrent ensureCash creates one immutable Cash Add and never foreign artifacts", async () => {
    const results = await Promise.all([
      ensureCashAccount(OWNER, "EGP", undefined, OWNER),
      ensureCashAccount(OWNER, "EGP", undefined, OWNER),
    ]);
    expect(
      results.every((result) => result.accountId !== null && !result.error)
    ).toBe(true);
    expect(results[0]?.accountId).toBe(results[1]?.accountId);
    expect(results.filter((result) => result.created)).toHaveLength(1);

    const accounts = await ledger.database
      .get<Account>("accounts")
      .query()
      .fetch();
    const roots = await ledger.database
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    const effects = await ledger.database
      .get<AccountFinancialEffect>("account_financial_effects")
      .query()
      .fetch();
    expect(accounts).toHaveLength(1);
    expect(roots).toHaveLength(1);
    expect(effects).toHaveLength(0);
    expect(accounts[0]).toMatchObject({
      id: results[0]?.accountId,
      userId: OWNER,
      type: "CASH",
      currency: "EGP",
      financialRevision: "0",
    });
    expect(roots[0]).toMatchObject({
      userId: OWNER,
      domain: "accounts",
      kind: "create_with_default",
      domainReferenceId: accounts[0]?.id,
      state: "local_complete",
    });
    expect(roots[0]?.payloadJson).toContain("account.create-default/v1");

    const wrongOwner = await ensureCashAccount(
      FOREIGN,
      "EGP",
      undefined,
      FOREIGN
    );
    expect(wrongOwner).toMatchObject({ created: false, accountId: null });
    expect(
      await ledger.database.get<Account>("accounts").query().fetch()
    ).toHaveLength(1);
    expect(
      await ledger.database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).toHaveLength(1);
  });
});
