interface MockAccountRow {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly type: "BANK" | "CASH" | "DIGITAL_WALLET";
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string | null;
}

interface MockPreparedRecord {
  readonly id: string;
  [key: string]: unknown;
}

interface MockDbModule {
  readonly __mockDatabase: {
    readonly get: jest.Mock;
    readonly write: jest.Mock;
    readonly batch: jest.Mock;
  };
  readonly __createdRecords: Record<string, MockPreparedRecord[]>;
  readonly __resetMockDb: () => void;
}

const mockOwnedAccounts: MockAccountRow[] = [];

jest.mock("@monyvi/db", () => {
  const createdRecords: Record<string, MockPreparedRecord[]> = {};
  let idCounter = 0;

  const database = {
    get: jest.fn((tableName: string) => ({
      prepareCreate: jest.fn(
        (builder: (record: MockPreparedRecord) => void): MockPreparedRecord => {
          const record: MockPreparedRecord = {
            id: `new-${tableName}-${++idCounter}`,
          };
          builder(record);

          if (!createdRecords[tableName]) {
            createdRecords[tableName] = [];
          }
          createdRecords[tableName].push(record);

          return record;
        }
      ),
    })),
    write: jest.fn((writer: () => Promise<void>): Promise<void> => writer()),
    batch: jest.fn((): Promise<void> => Promise.resolve()),
  };

  return {
    database,
    __mockDatabase: database,
    __createdRecords: createdRecords,
    __resetMockDb: (): void => {
      jest.clearAllMocks();
      for (const key of Object.keys(createdRecords)) {
        delete createdRecords[key];
      }
      idCounter = 0;
    },
  };
});

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: jest.fn((left: string, right: unknown) => ({
      type: "where",
      left,
      right,
    })),
  },
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: (): Promise<string> => Promise.resolve("user-1"),
}));

jest.mock("@/services/user-data-access", () => ({
  assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
  queryOwned: jest.fn(() => ({
    fetch: jest.fn(
      (): Promise<MockAccountRow[]> => Promise.resolve(mockOwnedAccounts)
    ),
  })),
}));

jest.mock("@/services/watermelon-atomic-batch", () => ({
  commitPreparedBatch: (
    operations: readonly MockPreparedRecord[]
  ): Promise<void> => {
    const { database } = jest.requireMock<{
      readonly database: { batch: jest.Mock };
    }>("@monyvi/db");
    database.batch(operations);
    return Promise.resolve();
  },
}));

jest.mock("i18next", () => ({
  t: jest.fn(
    (
      _key: string,
      values: { readonly name: string; readonly currency: string }
    ): string =>
      `An account named ${values.name} already exists in ${values.currency}`
  ),
}));

import {
  persistPendingAccounts,
  preparePendingAccounts,
  type PendingAccount,
} from "@/services/pending-account-service";

const {
  __mockDatabase: mockDatabase,
  __createdRecords: mockCreatedRecords,
  __resetMockDb: resetMockDb,
} = jest.requireMock<MockDbModule>("@monyvi/db");

function buildPendingAccount(
  overrides: Partial<PendingAccount> = {}
): PendingAccount {
  return {
    tempId: "temp-bank-1",
    name: "CIB Bank",
    currency: "EGP",
    type: "BANK",
    senderDisplayName: "CIB-EGYPT",
    ...overrides,
  };
}

function seedExistingAccount(account: MockAccountRow): void {
  mockOwnedAccounts.push(account);
}

describe("persistPendingAccounts", () => {
  beforeEach(() => {
    resetMockDb();
    mockOwnedAccounts.length = 0;
  });

  it("reuses an existing manual bank account with the same name and currency", async () => {
    seedExistingAccount({
      id: "existing-bank-1",
      name: "CIB Bank",
      currency: "EGP",
      type: "BANK",
    });

    const result = await persistPendingAccounts([buildPendingAccount()]);

    expect(result.errors).toEqual([]);
    expect(result.createdCount).toBe(0);
    expect(result.tempToRealIdMap.get("temp-bank-1")).toBe("existing-bank-1");
    expect(mockDatabase.batch).not.toHaveBeenCalled();
    expect(mockCreatedRecords.accounts ?? []).toHaveLength(0);
  });

  it("does not map a pending SMS bank account to a cash account with the same name and currency", async () => {
    seedExistingAccount({
      id: "existing-cash-1",
      name: "CIB Bank",
      currency: "EGP",
      type: "CASH",
    });

    const result = await persistPendingAccounts([buildPendingAccount()]);

    expect(result.errors).toEqual([expect.stringContaining("CIB Bank")]);
    expect(result.createdCount).toBe(0);
    expect(result.tempToRealIdMap.get("temp-bank-1")).toBeUndefined();
    expect(mockDatabase.batch).not.toHaveBeenCalled();
    expect(mockCreatedRecords.accounts ?? []).toHaveLength(0);
  });

  it("persists a pending wallet account without bank details", async () => {
    const result = await persistPendingAccounts([
      buildPendingAccount({
        tempId: "temp-wallet-1",
        name: "Vodafone Cash",
        type: "DIGITAL_WALLET",
        institutionId: "vodafone-cash",
        providerDisplayName: "Vodafone Cash",
        senderDisplayName: "VodafoneCash",
      }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.createdCount).toBe(1);
    expect(result.tempToRealIdMap.get("temp-wallet-1")).toBe("new-accounts-1");
    expect(mockCreatedRecords.accounts?.[0]).toEqual(
      expect.objectContaining({
        name: "Vodafone Cash",
        type: "DIGITAL_WALLET",
        institutionId: "vodafone-cash",
        providerDisplayName: "Vodafone Cash",
      })
    );
    expect(mockCreatedRecords.account_sms_senders?.[0]).toEqual(
      expect.objectContaining({
        accountId: "new-accounts-1",
        senderName: "VodafoneCash",
      })
    );
    expect(mockCreatedRecords.bank_details ?? []).toHaveLength(0);
  });

  it("reuses an existing manual wallet account with the same name and currency", async () => {
    seedExistingAccount({
      id: "existing-wallet-1",
      name: "Vodafone Cash",
      currency: "EGP",
      type: "DIGITAL_WALLET",
    });

    const result = await persistPendingAccounts([
      buildPendingAccount({
        tempId: "temp-wallet-1",
        name: "Vodafone Cash",
        type: "DIGITAL_WALLET",
        senderDisplayName: "VodafoneCash",
      }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.createdCount).toBe(0);
    expect(result.tempToRealIdMap.get("temp-wallet-1")).toBe(
      "existing-wallet-1"
    );
    expect(mockDatabase.batch).not.toHaveBeenCalled();
  });

  it("does not map a pending SMS wallet account to a bank account with the same name and currency", async () => {
    seedExistingAccount({
      id: "existing-bank-1",
      name: "Vodafone Cash",
      currency: "EGP",
      type: "BANK",
    });

    const result = await persistPendingAccounts([
      buildPendingAccount({
        tempId: "temp-wallet-1",
        name: "Vodafone Cash",
        type: "DIGITAL_WALLET",
        senderDisplayName: "VodafoneCash",
      }),
    ]);

    expect(result.errors).toEqual([expect.stringContaining("Vodafone Cash")]);
    expect(result.createdCount).toBe(0);
    expect(result.tempToRealIdMap.get("temp-wallet-1")).toBeUndefined();
    expect(mockDatabase.batch).not.toHaveBeenCalled();
  });

  it("persists same-name pending accounts when known provider identities differ", async () => {
    const result = await persistPendingAccounts([
      buildPendingAccount({
        tempId: "temp-cib-1",
        name: "Main",
        type: "BANK",
        institutionId: "cib",
        providerDisplayName: "CIB",
        senderDisplayName: "CIB-EGYPT",
      }),
      buildPendingAccount({
        tempId: "temp-qnb-1",
        name: "Main",
        type: "BANK",
        institutionId: "qnb-egypt",
        providerDisplayName: "QNB",
        senderDisplayName: "QNB",
      }),
    ]);

    expect(result.errors).toEqual([]);
    expect(result.createdCount).toBe(2);
    expect(result.tempToRealIdMap.get("temp-cib-1")).toBe("new-accounts-1");
    expect(result.tempToRealIdMap.get("temp-qnb-1")).toBe("new-accounts-4");
  });

  it("aggregates initial balances when duplicate pending accounts share one prepared account", async () => {
    const result = await preparePendingAccounts(
      [
        buildPendingAccount({ tempId: "temp-bank-1" }),
        buildPendingAccount({ tempId: "temp-bank-2" }),
      ],
      {
        initialBalanceByTempId: new Map([
          ["temp-bank-1", -100],
          ["temp-bank-2", -200],
        ]),
      }
    );

    expect(result.errors).toEqual([]);
    expect(result.createdCount).toBe(1);
    expect(result.tempToRealIdMap.get("temp-bank-1")).toBe("new-accounts-1");
    expect(result.tempToRealIdMap.get("temp-bank-2")).toBe("new-accounts-1");
    expect(mockCreatedRecords.accounts?.[0]).toEqual(
      expect.objectContaining({ balance: -300 })
    );
  });

  it("rejects intra-batch manual accounts with the same name and currency but different types", async () => {
    const result = await persistPendingAccounts([
      buildPendingAccount({
        tempId: "temp-bank-1",
        name: "Main",
        type: "BANK",
        senderDisplayName: "BANKSMS",
      }),
      buildPendingAccount({
        tempId: "temp-wallet-1",
        name: "Main",
        type: "DIGITAL_WALLET",
        senderDisplayName: "WALLETSMS",
      }),
    ]);

    expect(result.errors).toEqual([expect.stringContaining("Main")]);
    expect(result.createdCount).toBe(0);
    expect(result.tempToRealIdMap.get("temp-bank-1")).toBeUndefined();
    expect(result.tempToRealIdMap.get("temp-wallet-1")).toBeUndefined();
    expect(mockDatabase.batch).not.toHaveBeenCalled();
  });
});
