import type { Account, FinancialActionGroup } from "@monyvi/db";
import type { Model } from "@nozbe/watermelondb";
import {
  canonicalizeFinancialActionEnvelope,
  type CanonicalJsonValue,
} from "@monyvi/logic";

import type { ExecuteAccountBalanceCommandInput } from "../../services/account-balance-command-service";
import {
  CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES,
  createCoreAccountFinancialActionService,
  type CoreAccountFinancialActionDependencies,
} from "../../services/core-account-financial-action-service";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACTION_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_A_ID = "30000000-0000-4000-8000-000000000003";
const ACCOUNT_B_ID = "40000000-0000-4000-8000-000000000004";
const TRANSFER_ID = "50000000-0000-4000-8000-000000000005";
const OCCURRED_AT = "2026-09-06T10:00:00.000Z";

interface FakeModel extends Model {
  readonly id: string;
  readonly table: string;
  _raw: Model["_raw"];
}

function fakeModel(
  table: string,
  id: string,
  values: Readonly<Record<string, unknown>>,
  preparedState: "create" | null = null
): FakeModel {
  return {
    id,
    table,
    _isEditing: false,
    _preparedState: preparedState,
    _raw: {
      id,
      _status: preparedState === "create" ? "created" : "synced",
      _changed: "",
      ...values,
    },
  } as unknown as FakeModel;
}

function account(
  id: string,
  balance: number,
  currency: "EGP" | "USD",
  revision: string,
  userId = USER_ID
): Account {
  const model = fakeModel("accounts", id, {
    balance,
    currency,
    deleted: false,
    financial_revision: revision,
    user_id: userId,
  });
  Object.assign(model, {
    balance,
    currency,
    deleted: false,
    financialRevision: revision,
    userId,
  });
  return model as unknown as Account;
}

function transferAfter(): Readonly<Record<string, CanonicalJsonValue>> {
  return {
    amountMinorUnits: "10000",
    convertedAmountMinorUnits: "200",
    createdAt: "2026-09-01T08:00:00.000Z",
    currency: "EGP",
    date: "2026-09-01",
    deleted: false,
    exchangeRate: "50",
    fromAccountId: ACCOUNT_A_ID,
    id: TRANSFER_ID,
    notes: null,
    smsFingerprint: null,
    toAccountId: ACCOUNT_B_ID,
  };
}

function createHarness(input?: {
  readonly execute?: CoreAccountFinancialActionDependencies["executeAccountBalanceCommand"];
}): {
  readonly execute: jest.Mock;
  readonly service: ReturnType<typeof createCoreAccountFinancialActionService>;
} {
  const execute = jest.fn(
    input?.execute ??
      (async (command: ExecuteAccountBalanceCommandInput) => {
        const plan = await command.prepareDomainOperationPlan();
        plan.existingOperations.forEach((operation) => {
          if (operation.kind === "update") operation.update(operation.model);
        });
        return {
          kind: "committed" as const,
          record: fakeModel(
            "financial_action_groups",
            ACTION_ID,
            {}
          ) as unknown as FinancialActionGroup,
        };
      })
  );
  return {
    execute,
    service: createCoreAccountFinancialActionService({
      executeAccountBalanceCommand: execute,
      hashProvider: {
        digestUtf8: jest.fn(() => Promise.resolve("a".repeat(64))),
      },
    }),
  };
}

function readCommandInput(
  execute: jest.Mock
): ExecuteAccountBalanceCommandInput {
  const calls = execute.mock.calls as unknown as readonly (readonly [
    ExecuteAccountBalanceCommandInput,
  ])[];
  const input = calls[0]?.[0];
  if (!input) throw new Error("missing command");
  return input;
}

describe("core account financial action service", () => {
  it("treats a prepared account create as revision zero without adding a duplicate update", async () => {
    const created = account(ACCOUNT_A_ID, 10, "USD", "1");
    Object.assign(created, { _preparedState: "create" });
    const harness = createHarness();

    await harness.service.execute({
      accountEffects: [{ account: created, amountMinorUnits: "1000" }],
      actionId: ACTION_ID,
      domain: "accounts",
      domainReferenceId: ACCOUNT_A_ID,
      kind: "create",
      mutationRecords: [
        {
          after: {
            createdAt: OCCURRED_AT,
            currency: "USD",
            deleted: false,
            id: ACCOUNT_A_ID,
            institutionId: null,
            isDefault: false,
            name: "Savings",
            openingBalanceMinorUnits: "1000",
            providerDisplayName: null,
            targetBalanceMinorUnits: null,
            type: "CASH",
          },
          entity: "account",
          expectedUpdatedAt: null,
          mode: "create",
          model: created,
        },
      ],
      occurredAt: OCCURRED_AT,
      operationCode: "account.create",
      userId: USER_ID,
    });

    const input = readCommandInput(harness.execute);
    const plan = await input.prepareDomainOperationPlan();
    expect(input.envelope.accountGuards).toEqual([
      { accountId: ACCOUNT_A_ID, expectedRevision: "0" },
    ]);
    expect(plan.preparedCreates).toEqual([created]);
    expect(plan.existingOperations).toEqual([]);
  });

  it("merges same-account metadata and balance changes into one prepared update", async () => {
    const existing = account(ACCOUNT_A_ID, 100, "EGP", "7");
    Object.assign(existing, { name: "Old" });
    const harness = createHarness();

    await harness.service.execute({
      accountEffects: [{ account: existing, amountMinorUnits: "1000" }],
      actionId: ACTION_ID,
      domain: "accounts",
      domainReferenceId: ACCOUNT_A_ID,
      kind: "edit_balance",
      mutationRecords: [
        {
          after: {
            createdAt: OCCURRED_AT,
            currency: "EGP",
            deleted: false,
            id: ACCOUNT_A_ID,
            institutionId: null,
            isDefault: false,
            name: "New",
            openingBalanceMinorUnits: null,
            providerDisplayName: null,
            targetBalanceMinorUnits: "11000",
            type: "CASH",
          },
          entity: "account",
          expectedUpdatedAt: OCCURRED_AT,
          mode: "update",
          model: existing,
          update: (model): void => {
            Object.assign(model, { name: "New" });
          },
        },
      ],
      occurredAt: OCCURRED_AT,
      operationCode: "account.edit-balance",
      userId: USER_ID,
    });

    const input = readCommandInput(harness.execute);
    const plan = await input.prepareDomainOperationPlan();
    expect(plan.existingOperations).toHaveLength(1);
    expect(existing.name).toBe("New");
    expect(existing.balance).toBe(110);
    expect(existing.financialRevision).toBe("8");
  });

  it("sorts account guards, applies exact destination precision, and increments each revision once", async () => {
    const accountA = account(ACCOUNT_A_ID, 900, "EGP", "7");
    const accountB = account(ACCOUNT_B_ID, 10, "USD", "11");
    const transfer = fakeModel("transfers", TRANSFER_ID, {
      user_id: USER_ID,
      updated_at: Date.parse("2026-09-01T09:00:00.000Z"),
    });
    const harness = createHarness();

    await harness.service.execute({
      accountEffects: [
        { account: accountB, amountMinorUnits: "200" },
        { account: accountA, amountMinorUnits: "-10000" },
      ],
      actionId: ACTION_ID,
      domain: "transfers",
      domainReferenceId: TRANSFER_ID,
      kind: "update",
      mutationRecords: [
        {
          after: transferAfter(),
          entity: "transfer",
          expectedUpdatedAt: "2026-09-01T09:00:00.000Z",
          mode: "update",
          model: transfer,
          update: (): void => {},
        },
      ],
      occurredAt: OCCURRED_AT,
      operationCode: "transfer.update",
      userId: USER_ID,
    });

    const command = readCommandInput(harness.execute);
    const envelope = canonicalizeFinancialActionEnvelope(command.envelope);

    expect(envelope.accountGuards).toEqual([
      { accountId: ACCOUNT_A_ID, expectedRevision: "7" },
      { accountId: ACCOUNT_B_ID, expectedRevision: "11" },
    ]);
    expect(envelope.payload.accountEffects).toEqual([
      {
        accountId: ACCOUNT_A_ID,
        amountMinorUnits: "-10000",
        currency: "EGP",
      },
      {
        accountId: ACCOUNT_B_ID,
        amountMinorUnits: "200",
        currency: "USD",
      },
    ]);
    expect(accountA.balance).toBe(800);
    expect(accountA.financialRevision).toBe("8");
    expect(accountB.balance).toBe(12);
    expect(accountB.financialRevision).toBe("12");
  });

  it("combines repeated account deltas and omits an exact zero net effect", async () => {
    const accountA = account(ACCOUNT_A_ID, 900, "EGP", "7");
    const accountB = account(ACCOUNT_B_ID, 10, "USD", "11");
    const transfer = fakeModel("transfers", TRANSFER_ID, {
      user_id: USER_ID,
      updated_at: Date.parse("2026-09-01T09:00:00.000Z"),
    });
    const harness = createHarness();

    await harness.service.execute({
      accountEffects: [
        { account: accountA, amountMinorUnits: "10000" },
        { account: accountB, amountMinorUnits: "-200" },
        { account: accountA, amountMinorUnits: "-10000" },
      ],
      actionId: ACTION_ID,
      domain: "transfers",
      domainReferenceId: TRANSFER_ID,
      kind: "delete",
      mutationRecords: [
        {
          after: { ...transferAfter(), deleted: true },
          entity: "transfer",
          expectedUpdatedAt: "2026-09-01T09:00:00.000Z",
          mode: "delete",
          model: transfer,
          update: (): void => {},
        },
      ],
      occurredAt: OCCURRED_AT,
      operationCode: "transfer.delete",
      userId: USER_ID,
    });

    const command = readCommandInput(harness.execute);
    expect(command.envelope.accountGuards).toEqual([
      { accountId: ACCOUNT_B_ID, expectedRevision: "11" },
    ]);
    expect(accountA.financialRevision).toBe("7");
    expect(accountB.balance).toBe(8);
  });

  it("fails closed before command execution for a foreign account", async () => {
    const foreignAccount = account(
      ACCOUNT_A_ID,
      900,
      "EGP",
      "7",
      "60000000-0000-4000-8000-000000000006"
    );
    const harness = createHarness();

    await expect(
      harness.service.execute({
        accountEffects: [
          { account: foreignAccount, amountMinorUnits: "-10000" },
        ],
        actionId: ACTION_ID,
        domain: "transfers",
        domainReferenceId: TRANSFER_ID,
        kind: "delete",
        mutationRecords: [],
        occurredAt: OCCURRED_AT,
        operationCode: "transfer.delete",
        userId: USER_ID,
      })
    ).rejects.toThrow(CORE_ACCOUNT_FINANCIAL_ACTION_ERROR_CODES.NOT_OWNED);

    expect(harness.execute).not.toHaveBeenCalled();
    expect(foreignAccount.balance).toBe(900);
  });

  it("passes replay through without preparing or applying linked mutations", async () => {
    const accountA = account(ACCOUNT_A_ID, 900, "EGP", "7");
    const execute = jest.fn(
      (): Promise<{
        readonly kind: "replay";
        readonly record: FinancialActionGroup;
      }> =>
        Promise.resolve({
          kind: "replay",
          record: fakeModel(
            "financial_action_groups",
            ACTION_ID,
            {}
          ) as unknown as FinancialActionGroup,
        })
    );
    const harness = createHarness({ execute });

    await expect(
      harness.service.execute({
        accountEffects: [{ account: accountA, amountMinorUnits: "-10000" }],
        actionId: ACTION_ID,
        domain: "transactions",
        domainReferenceId: TRANSFER_ID,
        kind: "delete",
        mutationRecords: [],
        occurredAt: OCCURRED_AT,
        operationCode: "transaction.delete",
        userId: USER_ID,
      })
    ).resolves.toMatchObject({ kind: "replay" });

    expect(accountA.balance).toBe(900);
    expect(accountA.financialRevision).toBe("7");
  });
});
