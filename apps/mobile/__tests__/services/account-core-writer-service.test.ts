import type {
  Account,
  FinancialActionGroup,
  Transaction,
} from "@monyvi/db";
import type { Collection, Model } from "@nozbe/watermelondb";

import {
  ACCOUNT_CORE_WRITER_ERROR_CODES,
  createAccountCoreWriterService,
  type AccountCoreCreateInput,
  type AccountCoreEditInput,
  type AccountCoreWriterService,
  type AccountMetadataProjection,
} from "@/services/account-core-writer-service";
import type {
  ExecuteCoreAccountFinancialActionInput,
  CoreAccountFinancialActionService,
} from "@/services/core-account-financial-action-service";
import type { CommitFinancialActionGroupLocallyResult } from "@/services/financial-action-foundation-repository";

const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-18T12:00:00.000Z");
const TRANSACTION_ID = "40000000-0000-4000-8000-000000000004";
const ADJUSTMENT_CATEGORY_ID = "00000000-0000-0000-0001-000000000200";
const ADJUSTMENT_DATE = new Date(2026, 8, 18, 15, 30, 0);

function account(overrides: Partial<Account> = {}): Account {
  const value = {
    _preparedState: "create",
    balance: 1250.5,
    createdAt: new Date("2026-09-18T10:00:00.000Z"),
    currency: "EGP",
    deleted: false,
    financialRevision: "1",
    id: ACCOUNT_ID,
    institutionId: undefined,
    isDefault: true,
    name: "Everyday",
    providerDisplayName: undefined,
    table: "accounts",
    type: "BANK",
    updatedAt: new Date("2026-09-18T10:00:00.000Z"),
    userId: USER_ID,
    ...overrides,
  };
  return value as Account;
}

function createHarness(): {
  readonly assertExpectedCurrentUser: jest.Mock<Promise<void>, [string]>;
  readonly execute: jest.Mock<
    Promise<CommitFinancialActionGroupLocallyResult>,
    [ExecuteCoreAccountFinancialActionInput]
  >;
  readonly prepareInsideWriter: jest.Mock<Promise<void>, []>;
  readonly service: AccountCoreWriterService;
} {
  const assertExpectedCurrentUser = jest.fn(
    (_userId: string) => Promise.resolve()
  );
  const prepareInsideWriter = jest.fn(() => Promise.resolve());
  const execute = jest.fn<
    Promise<CommitFinancialActionGroupLocallyResult>,
    [ExecuteCoreAccountFinancialActionInput]
  >(async (input) => {
    await input.prepareInsideWriter?.();
    const record = Object.create(null) as FinancialActionGroup;
    return { kind: "committed", record };
  });
  const service = createAccountCoreWriterService({
    assertExpectedCurrentUser,
    createActionId: () => ACTION_ID,
    createTransactionId: () => TRANSACTION_ID,
    executeCoreFinancialAction:
      execute as unknown as CoreAccountFinancialActionService["execute"],
    now: () => NOW,
    transactionsCollection: () =>
      ({
        prepareCreate: (builder: (record: Transaction) => void) => {
          const raw: Record<string, unknown> = {};
          const record = {
            _preparedState: "create",
            _raw: raw,
            createdAt: NOW,
            date: NOW,
            deleted: false,
            isDraft: false,
            table: "transactions",
          };
          builder(record as unknown as Transaction);
          const rawId = record._raw.id;
          return {
            ...record,
            id: typeof rawId === "string" ? rawId : "",
          } as unknown as Transaction;
        },
      }) as unknown as Collection<Transaction>,
  });
  return { assertExpectedCurrentUser, execute, prepareInsideWriter, service };
}

function readExecuteInput(
  execute: jest.Mock<
    Promise<CommitFinancialActionGroupLocallyResult>,
    [ExecuteCoreAccountFinancialActionInput]
  >
): ExecuteCoreAccountFinancialActionInput {
  const input = execute.mock.calls[0]?.[0];
  if (!input) throw new Error("missing core action input");
  return input;
}

describe("account core writer service", () => {
  it("creates a non-zero opening balance through one guarded account action", async () => {
    const harness = createHarness();
    const created = account();
    const input: AccountCoreCreateInput = {
      account: created,
      prepareInsideWriter: harness.prepareInsideWriter,
      userId: USER_ID,
    };

    await harness.service.create(input);

    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(readExecuteInput(harness.execute)).toEqual({
      accountEffects: [{ account: created, amountMinorUnits: "125050" }],
      actionId: ACTION_ID,
      domain: "accounts",
      domainReferenceId: ACCOUNT_ID,
      kind: "create",
      mutationRecords: [
        expect.objectContaining({
          after: {
            createdAt: "2026-09-18T10:00:00.000Z",
            currency: "EGP",
            deleted: false,
            id: ACCOUNT_ID,
            institutionId: null,
            isDefault: true,
            name: "Everyday",
            openingBalanceMinorUnits: "125050",
            providerDisplayName: null,
            targetBalanceMinorUnits: null,
            type: "BANK",
          },
          entity: "account",
          expectedUpdatedAt: null,
          mode: "create",
          model: created,
        }),
      ],
      occurredAt: NOW.toISOString(),
      operationCode: "account.create",
      prepareInsideWriter: harness.prepareInsideWriter,
      userId: USER_ID,
    });
    expect(harness.prepareInsideWriter).toHaveBeenCalledTimes(1);
    expect(harness.assertExpectedCurrentUser).toHaveBeenNthCalledWith(
      1,
      USER_ID
    );
    expect(harness.assertExpectedCurrentUser).toHaveBeenNthCalledWith(
      2,
      USER_ID
    );
  });

  it("rejects a zero opening balance so zero creation stays effect-free", async () => {
    const harness = createHarness();
    const created = account({ balance: 0, financialRevision: "0" });

    await expect(
      harness.service.create({
        account: created,
        prepareInsideWriter: harness.prepareInsideWriter,
        userId: USER_ID,
      })
    ).rejects.toThrow(ACCOUNT_CORE_WRITER_ERROR_CODES.ZERO_DELTA);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("rejects a create for an already committed account row", async () => {
    const harness = createHarness();
    const committed = account({
      _preparedState: null,
      balance: 100,
      financialRevision: "3",
    });

    await expect(
      harness.service.create({
        account: committed,
        prepareInsideWriter: harness.prepareInsideWriter,
        userId: USER_ID,
      })
    ).rejects.toThrow(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_PLAN);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("updates row metadata and balance delta in the same guarded action", async () => {
    const harness = createHarness();
    const existing = account({
      _preparedState: null,
      balance: 100,
      financialRevision: "7",
      name: "Old",
    });
    let capturedProjection: AccountMetadataProjection | undefined;
    const input: AccountCoreEditInput = {
      account: existing,
      nextBalance: 125,
      prepareInsideWriter: harness.prepareInsideWriter,
      updateMetadata: (projection): void => {
        capturedProjection = { ...projection };
        projection.name = "New";
      },
      userId: USER_ID,
    };

    await harness.service.edit(input);

    const command = readExecuteInput(harness.execute);
    expect(command).toEqual(
      expect.objectContaining({
        accountEffects: [{ account: existing, amountMinorUnits: "2500" }],
        actionId: ACTION_ID,
        domain: "accounts",
        domainReferenceId: ACCOUNT_ID,
        kind: "edit_balance",
        occurredAt: NOW.toISOString(),
        operationCode: "account.edit-balance",
        prepareInsideWriter: harness.prepareInsideWriter,
        userId: USER_ID,
      })
    );
    const mutation = command.mutationRecords[0];
    expect(mutation).toEqual(
      expect.objectContaining({
        entity: "account",
        expectedUpdatedAt: "2026-09-18T10:00:00.000Z",
        mode: "update",
        model: existing,
      })
    );
    expect(mutation?.after).toEqual(
      expect.objectContaining({
        currency: "EGP",
        name: "New",
        targetBalanceMinorUnits: "12500",
        type: "BANK",
      })
    );
    expect(capturedProjection).toEqual({
      institutionId: undefined,
      isDefault: true,
      name: "Old",
      providerDisplayName: undefined,
    });
    expect(capturedProjection).not.toHaveProperty("currency");
    expect(capturedProjection).not.toHaveProperty("type");
    expect(capturedProjection).not.toHaveProperty("balance");
    expect(capturedProjection).not.toHaveProperty("financialRevision");
  });

  it("applies whitelisted metadata fields through the mutation update", async () => {
    const harness = createHarness();
    const existing = account({
      _preparedState: null,
      balance: 100,
      financialRevision: "7",
      name: "Old",
    });

    await harness.service.edit({
      account: existing,
      nextBalance: 125,
      prepareInsideWriter: harness.prepareInsideWriter,
      updateMetadata: (projection): void => {
        projection.name = "New";
        projection.isDefault = false;
        projection.institutionId = "bank-misr";
        projection.providerDisplayName = "Banque Misr";
      },
      userId: USER_ID,
    });

    const mutation = readExecuteInput(harness.execute).mutationRecords[0];
    expect(typeof mutation?.update).toBe("function");
    mutation?.update?.(existing as unknown as Model);
    expect(existing.name).toBe("New");
    expect(existing.isDefault).toBe(false);
    expect(existing.institutionId).toBe("bank-misr");
    expect(existing.providerDisplayName).toBe("Banque Misr");
    expect(existing.balance).toBe(100);
    expect(existing.currency).toBe("EGP");
  });

  it("rejects a mutation update against a foreign or non-account model", async () => {
    const harness = createHarness();
    const existing = account({
      _preparedState: null,
      balance: 100,
      financialRevision: "7",
    });

    await harness.service.edit({
      account: existing,
      nextBalance: 125,
      prepareInsideWriter: harness.prepareInsideWriter,
      updateMetadata: (): void => {},
      userId: USER_ID,
    });

    const mutation = readExecuteInput(harness.execute).mutationRecords[0];
    const foreign = account({ id: "other-account" });
    expect(() =>
      mutation?.update?.(foreign as unknown as Model)
    ).toThrow(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_PLAN);
    const wrongTable = account({ table: "transactions" });
    expect(() =>
      mutation?.update?.(wrongTable as unknown as Model)
    ).toThrow(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_PLAN);
  });

  it("rejects a zero-delta edit so metadata-only writes stay outside the financial boundary", async () => {
    const harness = createHarness();
    const existing = account({ _preparedState: null, balance: 100 });

    await expect(
      harness.service.edit({
        account: existing,
        nextBalance: 100,
        prepareInsideWriter: harness.prepareInsideWriter,
        updateMetadata: jest.fn(),
        userId: USER_ID,
      })
    ).rejects.toThrow(ACCOUNT_CORE_WRITER_ERROR_CODES.ZERO_DELTA);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("validates timestamps before serializing them", async () => {
    const harness = createHarness();
    const existing = account({
      _preparedState: null,
      balance: 100,
      updatedAt: new Date(Number.NaN),
    });

    await expect(
      harness.service.edit({
        account: existing,
        nextBalance: 125,
        prepareInsideWriter: harness.prepareInsideWriter,
        updateMetadata: jest.fn(),
        userId: USER_ID,
      })
    ).rejects.toThrow(ACCOUNT_CORE_WRITER_ERROR_CODES.INVALID_PLAN);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("propagates inside-writer failures without committing", async () => {
    const harness = createHarness();
    const created = account();
    const failure = new Error("sibling write failed");
    harness.prepareInsideWriter.mockRejectedValueOnce(failure);

    await expect(
      harness.service.create({
        account: created,
        prepareInsideWriter: harness.prepareInsideWriter,
        userId: USER_ID,
      })
    ).rejects.toThrow("sibling write failed");
  });

  it("includes the adjustment transaction as envelope evidence in the same guarded group", async () => {
    const harness = createHarness();
    const existing = account({
      _preparedState: null,
      balance: 100,
      financialRevision: "7",
      name: "Old",
    });

    await harness.service.edit({
      account: existing,
      adjustmentTransaction: {
        accountId: ACCOUNT_ID,
        amount: 25,
        categoryId: ADJUSTMENT_CATEGORY_ID,
        currency: "EGP",
        date: ADJUSTMENT_DATE,
        note: "Balance adjustment: 100 → 125",
        source: "MANUAL",
        type: "INCOME",
      },
      nextBalance: 125,
      prepareInsideWriter: harness.prepareInsideWriter,
      updateMetadata: (projection): void => {
        projection.name = "New";
      },
      userId: USER_ID,
    });

    const command = readExecuteInput(harness.execute);
    expect(command.mutationRecords).toHaveLength(2);
    const adjustment = command.mutationRecords[1];
    expect(adjustment).toEqual(
      expect.objectContaining({
        entity: "transaction",
        expectedUpdatedAt: null,
        mode: "create",
      })
    );
    expect(adjustment?.after).toEqual(
      expect.objectContaining({
        accountId: ACCOUNT_ID,
        amountMinorUnits: "2500",
        categoryId: ADJUSTMENT_CATEGORY_ID,
        currency: "EGP",
        date: "2026-09-18",
        deleted: false,
        id: TRANSACTION_ID,
        isDraft: false,
        note: "Balance adjustment: 100 → 125",
        source: "MANUAL",
        type: "INCOME",
      })
    );
    expect(typeof adjustment?.assertPostimage).toBe("function");
    const prepared = adjustment?.model as unknown as Record<string, unknown>;
    expect(prepared.accountId).toBe(ACCOUNT_ID);
    expect(prepared.amount).toBe(25);
    expect(prepared.userId).toBe(USER_ID);
  });

  it("omits adjustment evidence when no adjustment applies", async () => {
    const harness = createHarness();
    const existing = account({
      _preparedState: null,
      balance: 100,
      financialRevision: "7",
    });

    await harness.service.edit({
      account: existing,
      nextBalance: 125,
      prepareInsideWriter: harness.prepareInsideWriter,
      updateMetadata: (): void => {},
      userId: USER_ID,
    });

    expect(readExecuteInput(harness.execute).mutationRecords).toHaveLength(1);
  });
});
