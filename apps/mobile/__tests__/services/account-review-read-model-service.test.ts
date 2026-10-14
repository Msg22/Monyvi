import type { Account, AccountSmsSender, BankDetails, Profile } from "@monyvi/db";
import { accountReviewRequestContextSchema } from "@monyvi/logic";
import { loadAccountReviewAccountSnapshots } from "@/services/account-review-read-model-service";

type AccountRecord = Pick<
  Account,
  | "id"
  | "userId"
  | "name"
  | "currency"
  | "type"
  | "institutionId"
  | "providerDisplayName"
  | "isDefault"
  | "deleted"
  | "balance"
>;
type ProfileRecord = Pick<
  Profile,
  "id" | "userId" | "preferredCurrency" | "deleted"
>;
type BankRecord = Pick<
  BankDetails,
  "id" | "accountId" | "deleted" | "cardLast4" | "accountNumber"
>;
type SenderRecord = Pick<
  AccountSmsSender,
  "id" | "accountId" | "senderName" | "deleted"
>;

interface TableRef {
  readonly table: string;
}

interface QueryCall {
  readonly table: string;
  readonly ownerId: string;
  readonly conditions: readonly unknown[];
}

interface ChildQueryCall extends QueryCall {
  readonly parentIds: readonly string[];
  readonly foreignKey: string;
}

const OWNER_ID = "1eea0000-3950-4000-8000-000000000001";
const OTHER_ID = "1eea0000-3950-4000-8000-000000000002";
const BANK_ID = "1eea0000-3950-4000-8000-000000000101";
const CASH_ID = "1eea0000-3950-4000-8000-000000000102";
const WALLET_ID = "1eea0000-3950-4000-8000-000000000103";
const DELETED_ID = "1eea0000-3950-4000-8000-000000000104";
const FOREIGN_ID = "1eea0000-3950-4000-8000-000000000105";

let mockCurrentOwnerId = OWNER_ID;
let accountRows: AccountRecord[] = [];
let profileRows: ProfileRecord[] = [];
let bankRows: BankRecord[] = [];
let senderRows: SenderRecord[] = [];
let failedChildTable: string | null = null;
let mockAccountReadGate: Promise<void> | null = null;
let mockNotifyAccountReadStarted: (() => void) | null = null;

const ownedCalls: QueryCall[] = [];
const childCalls: ChildQueryCall[] = [];
const individualChildCalls: ChildQueryCall[] = [];

const mockDatabaseGet = jest.fn((table: string): TableRef => ({ table }));

function includesDeletedFalse(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(includesDeletedFalse);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (
    "kind" in value &&
    value.kind === "where" &&
    "column" in value &&
    value.column === "deleted" &&
    "value" in value &&
    value.value === false
  ) {
    return true;
  }
  return "conditions" in value && includesDeletedFalse(value.conditions);
}

function makeOwnedQuery(
  table: TableRef,
  ownerId: string,
  conditions: readonly unknown[]
): { fetch: () => Promise<readonly (AccountRecord | ProfileRecord)[]> } {
  ownedCalls.push({ table: table.table, ownerId, conditions });
  return {
    fetch: async (): Promise<readonly (AccountRecord | ProfileRecord)[]> => {
      if (table.table === "accounts" && mockAccountReadGate) {
        mockNotifyAccountReadStarted?.();
        await mockAccountReadGate;
      }
      const records: readonly (AccountRecord | ProfileRecord)[] =
        table.table === "accounts"
          ? accountRows
          : table.table === "profiles"
            ? profileRows
            : [];
      return records.filter(
        (record) =>
          record.userId === ownerId &&
          (!includesDeletedFalse(conditions) || !record.deleted)
      );
    },
  };
}

function makeChildQuery(
  table: TableRef,
  parents: readonly { readonly id: string }[],
  ownerId: string,
  foreignKey: string,
  conditions: readonly unknown[]
): { fetch: () => Promise<readonly (BankRecord | SenderRecord)[]> } {
  const parentIds = parents.map((parent) => parent.id);
  childCalls.push({
    table: table.table,
    parentIds,
    ownerId,
    foreignKey,
    conditions,
  });
  return {
    fetch: async (): Promise<readonly (BankRecord | SenderRecord)[]> => {
      if (failedChildTable === table.table) {
        throw new Error("owned child query failed");
      }
      const records: readonly (BankRecord | SenderRecord)[] =
        table.table === "bank_details"
          ? bankRows
          : table.table === "account_sms_senders"
            ? senderRows
            : [];
      return records.filter(
        (record) =>
          parentIds.includes(record.accountId) &&
          (!includesDeletedFalse(conditions) || !record.deleted)
      );
    },
  };
}

const mockQueryOwned = jest.fn(
  (
    table: TableRef,
    ownerId: string,
    ...conditions: readonly unknown[]
  ): ReturnType<typeof makeOwnedQuery> =>
    makeOwnedQuery(table, ownerId, conditions)
);

const mockQueryChildrenOfOwnedParents = jest.fn(
  (
    table: TableRef,
    parents: readonly { readonly id: string }[],
    ownerId: string,
    foreignKey: string,
    ...conditions: readonly unknown[]
  ): ReturnType<typeof makeChildQuery> =>
    makeChildQuery(table, parents, ownerId, foreignKey, conditions)
);

const mockQueryChildrenOfOwnedParent = jest.fn(
  (
    table: TableRef,
    parent: { readonly id: string },
    ownerId: string,
    foreignKey: string,
    ...conditions: readonly unknown[]
  ): ReturnType<typeof makeChildQuery> => {
    individualChildCalls.push({
      table: table.table,
      ownerId,
      foreignKey,
      parentIds: [parent.id],
      conditions,
    });
    return makeChildQuery(table, [parent], ownerId, foreignKey, conditions);
  }
);

const mockGetCurrentUserDataScope = jest.fn(
  async (): Promise<{
    readonly userId: string;
    readonly queryOwned: (
      table: TableRef,
      ...conditions: readonly unknown[]
    ) => ReturnType<typeof makeOwnedQuery>;
    readonly queryChildrenOfOwnedParents: (
      table: TableRef,
      parents: readonly { readonly id: string }[],
      foreignKey: string,
      ...conditions: readonly unknown[]
    ) => ReturnType<typeof makeChildQuery>;
    readonly queryChildrenOfOwnedParent: (
      table: TableRef,
      parent: { readonly id: string },
      foreignKey: string,
      ...conditions: readonly unknown[]
    ) => ReturnType<typeof makeChildQuery>;
  }> => {
    // A scope is a captured immutable user identity, not a live global getter.
    const scopedOwnerId = mockCurrentOwnerId;
    return {
      userId: scopedOwnerId,
      queryOwned: (
        table: TableRef,
        ...conditions: readonly unknown[]
      ): ReturnType<typeof makeOwnedQuery> =>
        mockQueryOwned(table, scopedOwnerId, ...conditions),
      queryChildrenOfOwnedParents: (
        table: TableRef,
        parents: readonly { readonly id: string }[],
        foreignKey: string,
        ...conditions: readonly unknown[]
      ): ReturnType<typeof makeChildQuery> =>
        mockQueryChildrenOfOwnedParents(
          table,
          parents,
          scopedOwnerId,
          foreignKey,
          ...conditions
        ),
      queryChildrenOfOwnedParent: (
        table: TableRef,
        parent: { readonly id: string },
        foreignKey: string,
        ...conditions: readonly unknown[]
      ): ReturnType<typeof makeChildQuery> =>
        mockQueryChildrenOfOwnedParent(
          table,
          parent,
          scopedOwnerId,
          foreignKey,
          ...conditions
        ),
    };
  }
);

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): { readonly table: string } => mockDatabaseGet(table),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (column: string, value: unknown): object => ({
      kind: "where",
      column,
      value,
    }),
    oneOf: (values: readonly string[]): object => ({ kind: "oneOf", values }),
    and: (...conditions: readonly unknown[]): object => ({
      kind: "and",
      conditions,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  // All test-module state is captured lazily after Jest hoists mock factories.
  getCurrentUserDataScope: (): ReturnType<typeof mockGetCurrentUserDataScope> =>
    mockGetCurrentUserDataScope(),
  getRequiredCurrentUserId: async (): Promise<string> => mockCurrentOwnerId,
  queryOwned: (
    ...args: Parameters<typeof mockQueryOwned>
  ): ReturnType<typeof mockQueryOwned> => mockQueryOwned(...args),
  queryChildrenOfOwnedParents: (
    ...args: Parameters<typeof mockQueryChildrenOfOwnedParents>
  ): ReturnType<typeof mockQueryChildrenOfOwnedParents> =>
    mockQueryChildrenOfOwnedParents(...args),
  queryChildrenOfOwnedParent: (
    ...args: Parameters<typeof mockQueryChildrenOfOwnedParent>
  ): ReturnType<typeof mockQueryChildrenOfOwnedParent> =>
    mockQueryChildrenOfOwnedParent(...args),
}));

function account(
  id: string,
  ownerId: string,
  overrides: Partial<AccountRecord> = {}
): AccountRecord {
  return {
    id,
    userId: ownerId,
    name: "QNB Everyday",
    currency: "EGP",
    type: "BANK",
    institutionId: "qnb",
    providerDisplayName: "QNB",
    isDefault: false,
    deleted: false,
    balance: 910024.25,
    ...overrides,
  };
}

describe("T006 owned account review snapshot / provider context", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
    mockCurrentOwnerId = OWNER_ID;
    failedChildTable = null;
    mockAccountReadGate = null;
    mockNotifyAccountReadStarted = null;
    ownedCalls.length = 0;
    childCalls.length = 0;
    individualChildCalls.length = 0;
    profileRows = [
      {
        id: "1eea0000-3950-4000-8000-000000000201",
        userId: OWNER_ID,
        preferredCurrency: "EGP",
        deleted: false,
      },
      {
        id: "1eea0000-3950-4000-8000-000000000202",
        userId: OTHER_ID,
        preferredCurrency: "USD",
        deleted: false,
      },
    ];
    accountRows = [
      account(BANK_ID, OWNER_ID, { isDefault: true }),
      account(CASH_ID, OWNER_ID, {
        name: "Cash",
        type: "CASH",
        institutionId: undefined,
        providerDisplayName: undefined,
      }),
      account(WALLET_ID, OWNER_ID, {
        name: "Mobile Wallet",
        type: "DIGITAL_WALLET",
        currency: "USD",
        institutionId: undefined,
        providerDisplayName: "Mobile Wallet",
      }),
      account(DELETED_ID, OWNER_ID, {
        name: "Deleted QNB",
        deleted: true,
      }),
      account(FOREIGN_ID, OTHER_ID, {
        name: "Foreign Bank",
        isDefault: true,
      }),
    ];
    bankRows = [
      {
        id: "1eea0000-3950-4000-8000-000000000301",
        accountId: BANK_ID,
        cardLast4: 7,
        accountNumber: "1234567890123456",
        deleted: false,
      },
      {
        id: "1eea0000-3950-4000-8000-000000000302",
        accountId: DELETED_ID,
        cardLast4: 4411,
        accountNumber: "PRIVATE-DELETED-ACCOUNT",
        deleted: false,
      },
      {
        id: "1eea0000-3950-4000-8000-000000000303",
        accountId: FOREIGN_ID,
        cardLast4: 8877,
        accountNumber: "PRIVATE-FOREIGN-ACCOUNT",
        deleted: false,
      },
      {
        id: "1eea0000-3950-4000-8000-000000000304",
        accountId: BANK_ID,
        cardLast4: 3322,
        accountNumber: "PRIVATE-SOFT-DELETED-CARD",
        deleted: true,
      },
    ];
    senderRows = [
      {
        id: "1eea0000-3950-4000-8000-000000000401",
        accountId: BANK_ID,
        senderName: "QNB",
        deleted: false,
      },
      {
        id: "1eea0000-3950-4000-8000-000000000402",
        accountId: BANK_ID,
        senderName: "PRIVATE-DELETED-SENDER",
        deleted: true,
      },
      {
        id: "1eea0000-3950-4000-8000-000000000403",
        accountId: FOREIGN_ID,
        senderName: "PRIVATE-FOREIGN-SENDER",
        deleted: false,
      },
    ];
  });

  it("returns F01 owned local snapshots plus a strict, separate provider context", async () => {
    const snapshots = await loadAccountReviewAccountSnapshots();
    const providerContext = accountReviewRequestContextSchema.parse(
      snapshots.providerContext
    );

    expect(snapshots.ownerId).toBe(OWNER_ID);
    expect(snapshots.preferredCurrency).toBe("EGP");
    expect(snapshots.accounts).toEqual(
      expect.arrayContaining([
        {
          id: BANK_ID,
          name: "QNB Everyday",
          type: "BANK",
          currency: "EGP",
          institutionId: "qnb",
          providerDisplayName: "QNB",
          cardLast4: "0007",
          senderNames: ["QNB"],
          isDefault: true,
        },
        {
          id: CASH_ID,
          name: "Cash",
          type: "CASH",
          currency: "EGP",
          institutionId: null,
          providerDisplayName: null,
          cardLast4: null,
          senderNames: [],
          isDefault: false,
        },
        {
          id: WALLET_ID,
          name: "Mobile Wallet",
          type: "DIGITAL_WALLET",
          currency: "USD",
          institutionId: null,
          providerDisplayName: "Mobile Wallet",
          cardLast4: null,
          senderNames: [],
          isDefault: false,
        },
      ])
    );
    expect(snapshots.accounts).toHaveLength(3);
    expect(snapshots.accounts.map((value) => value.id)).not.toContain(DELETED_ID);
    expect(snapshots.accounts.map((value) => value.id)).not.toContain(FOREIGN_ID);

    expect(providerContext).toMatchObject({
      reviewContractVersion: "account-review/v2",
      preferredCurrency: "EGP",
      accounts: expect.arrayContaining([
        {
          id: BANK_ID,
          name: "QNB Everyday",
          type: "BANK",
          currency: "EGP",
          institutionId: "qnb",
          providerDisplayName: "QNB",
          cardLast4: "0007",
          senderNames: ["QNB"],
        },
      ]),
    });
    expect(providerContext.accounts).toHaveLength(3);
    expect(Object.keys(snapshots.providerContext).sort()).toEqual([
      "accounts",
      "preferredCurrency",
      "reviewContractVersion",
    ]);
    // The local read model adds ONLY isDefault to the canonical account projection.
    expect(Object.keys(snapshots.accounts[0] ?? {}).sort()).toEqual(
      [...Object.keys(providerContext.accounts[0] ?? {}), "isDefault"].sort()
    );
    expect(providerContext.accounts.map((value) => value.id).sort()).toEqual(
      snapshots.accounts.map((value) => value.id).sort()
    );
  });

  it("never sends balances, full identifiers or excluded child records into provider context", async () => {
    const snapshots = await loadAccountReviewAccountSnapshots();
    const providerContext = accountReviewRequestContextSchema.parse(
      snapshots.providerContext
    );
    const serialized = JSON.stringify(snapshots.providerContext);
    expect(snapshots.accounts.find((value) => value.id === BANK_ID)?.isDefault)
      .toBe(true);
    expect(providerContext.accounts).toHaveLength(3);

    expect(serialized).not.toContain("910024.25");
    expect(serialized).not.toContain("1234567890123456");
    expect(serialized).not.toContain("PRIVATE-");
    expect(serialized).not.toContain("balance");
    expect(serialized).not.toContain("accountNumber");
    expect(serialized).not.toContain("isDefault");
    expect(serialized).not.toContain("ownerId");
    expect(Object.keys(snapshots.providerContext).sort()).toEqual([
      "accounts",
      "preferredCurrency",
      "reviewContractVersion",
    ]);
    expect(serialized).not.toContain(FOREIGN_ID);
    expect(serialized).not.toContain(DELETED_ID);
    expect(serialized).toContain('"cardLast4":"0007"');
  });

  it("uses one owned accounts query and batched bank/sender queries, not per-account N+1 reads", async () => {
    await loadAccountReviewAccountSnapshots();

    const accountCalls = ownedCalls.filter((call) => call.table === "accounts");
    const profileCalls = ownedCalls.filter((call) => call.table === "profiles");
    const bankCalls = childCalls.filter((call) => call.table === "bank_details");
    const senderCalls = childCalls.filter(
      (call) => call.table === "account_sms_senders"
    );

    expect(accountCalls).toHaveLength(1);
    expect(profileCalls).toHaveLength(1);
    expect(accountCalls[0]?.ownerId).toBe(OWNER_ID);
    expect(profileCalls[0]?.ownerId).toBe(OWNER_ID);
    expect(includesDeletedFalse(accountCalls[0]?.conditions)).toBe(true);
    expect(includesDeletedFalse(profileCalls[0]?.conditions)).toBe(true);
    expect(bankCalls).toHaveLength(1);
    expect(senderCalls).toHaveLength(1);
    expect(bankCalls[0]?.foreignKey).toBe("account_id");
    expect(senderCalls[0]?.foreignKey).toBe("account_id");
    expect(bankCalls[0]?.parentIds).not.toContain(DELETED_ID);
    expect(bankCalls[0]?.parentIds).not.toContain(FOREIGN_ID);
    expect(senderCalls[0]?.parentIds).not.toContain(DELETED_ID);
    expect(senderCalls[0]?.parentIds).not.toContain(FOREIGN_ID);
    expect(includesDeletedFalse(bankCalls[0]?.conditions)).toBe(true);
    expect(includesDeletedFalse(senderCalls[0]?.conditions)).toBe(true);
    expect(individualChildCalls).toHaveLength(0);
  });

  it("returns an empty account context safely without probing child rows per account", async () => {
    accountRows = [];
    const snapshots = await loadAccountReviewAccountSnapshots();
    const context = accountReviewRequestContextSchema.parse(
      snapshots.providerContext
    );

    expect(snapshots.ownerId).toBe(OWNER_ID);
    expect(snapshots.accounts).toEqual([]);
    expect(context.accounts).toEqual([]);
    expect(snapshots.preferredCurrency).toBe("EGP");
    expect(context.preferredCurrency).toBe("EGP");
    expect(individualChildCalls).toHaveLength(0);
    expect(childCalls.filter((call) => call.table === "bank_details").length).toBeLessThanOrEqual(1);
    expect(childCalls.filter((call) => call.table === "account_sms_senders").length).toBeLessThanOrEqual(1);
  });

  it("does not leak cached first-owner results across an authenticated owner switch", async () => {
    const first = await loadAccountReviewAccountSnapshots();
    expect(first.ownerId).toBe(OWNER_ID);
    expect(first.accounts.map((value) => value.id)).toContain(BANK_ID);

    mockCurrentOwnerId = OTHER_ID;
    const second = await loadAccountReviewAccountSnapshots();
    const providerContext = accountReviewRequestContextSchema.parse(
      second.providerContext
    );
    expect(second.ownerId).toBe(OTHER_ID);
    expect(second.preferredCurrency).toBe("USD");
    expect(second.accounts.map((value) => value.id)).toEqual([FOREIGN_ID]);
    expect(providerContext.accounts.map((value) => value.id)).toEqual([FOREIGN_ID]);
    expect(second.accounts.map((value) => value.id)).not.toContain(BANK_ID);
    expect(ownedCalls.filter((call) => call.table === "accounts").map((call) => call.ownerId)).toEqual([OWNER_ID, OTHER_ID]);
  });

  it("preserves zero or multiple inconsistent local defaults without choosing for the resolver", async () => {
    accountRows = accountRows.map((row) => ({ ...row, isDefault: false }));

    const none = await loadAccountReviewAccountSnapshots();
    expect(none.accounts.filter((value) => value.isDefault)).toEqual([]);
    expect(accountReviewRequestContextSchema.parse(none.providerContext)
      .accounts).toHaveLength(3);

    accountRows = accountRows.map((row) => ({
      ...row,
      isDefault: row.id === BANK_ID || row.id === CASH_ID,
    }));
    const inconsistent = await loadAccountReviewAccountSnapshots();
    expect(
      inconsistent.accounts
        .filter((value) => value.isDefault)
        .map((value) => value.id)
        .sort()
    ).toEqual([BANK_ID, CASH_ID].sort());
    expect(JSON.stringify(inconsistent.providerContext)).not.toContain("isDefault");
  });

  it("captures F07 scoped identity immutably before deferred reads change active user", async () => {
    const scope = await mockGetCurrentUserDataScope();
    mockCurrentOwnerId = OTHER_ID;

    const query = scope.queryOwned(
      { table: "accounts" },
      { kind: "where", column: "deleted", value: false }
    );
    const rows = await query.fetch();

    expect(scope.userId).toBe(OWNER_ID);
    expect(ownedCalls[ownedCalls.length - 1]?.ownerId).toBe(OWNER_ID);
    expect(rows.map((row) => row.id)).toEqual([BANK_ID, CASH_ID, WALLET_ID]);
  });

  it("rejects an in-flight account read if the authenticated owner changes before final validation", async () => {
    let release: () => void = () => undefined;
    let signalRead: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      signalRead = resolve;
    });
    mockAccountReadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockNotifyAccountReadStarted = signalRead;

    const inFlight = loadAccountReviewAccountSnapshots();
    const firstEvent = await Promise.race([
      started.then(() => "account_read_started"),
      inFlight.then(() => "resolved_before_read", () => "rejected_before_read"),
    ]);

    try {
      expect(firstEvent).toBe("account_read_started");
      mockCurrentOwnerId = OTHER_ID;
    } finally {
      release();
    }
    await expect(inFlight).rejects.toThrow("AUTH_SCOPE_CHANGED");
    expect(ownedCalls.filter((value) => value.table === "accounts")
      .every((value) => value.ownerId === OWNER_ID)).toBe(true);
  });

  it("does not select an arbitrary profile when multiple active owned profiles exist", async () => {
    profileRows.push({
      id: "1eea0000-3950-4000-8000-000000000203",
      userId: OWNER_ID,
      preferredCurrency: "USD",
      deleted: false,
    });

    await expect(loadAccountReviewAccountSnapshots()).rejects.toThrow(
      "ACCOUNT_REVIEW_PROFILE_CONFLICT"
    );
  });

  it.each([-1, 7.5, 10000, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid live bank card suffix %s rather than projecting an invented identity",
    async (cardLast4) => {
      bankRows = bankRows.map((detail) =>
        detail.accountId === BANK_ID && !detail.deleted
          ? { ...detail, cardLast4 }
          : detail
      );

      await expect(loadAccountReviewAccountSnapshots()).rejects.toThrow(
        "ACCOUNT_REVIEW_INVALID_CARD_SUFFIX"
      );
    }
  );

  it.each([7, 2211])(
    "rejects duplicate live bank details with suffix %s instead of picking one",
    async (cardLast4) => {
      bankRows.push({
        id: "1eea0000-3950-4000-8000-000000000305",
        accountId: BANK_ID,
        cardLast4,
        accountNumber: "PRIVATE-EXTRA-CARD",
        deleted: false,
      });

      await expect(loadAccountReviewAccountSnapshots()).rejects.toThrow(
        "ACCOUNT_REVIEW_BANK_DETAILS_CONFLICT"
      );
    }
  );

  it("preserves a missing bank card suffix as null, without inventing masked digits", async () => {
    bankRows = bankRows.filter((detail) => detail.accountId !== BANK_ID);

    const snapshot = await loadAccountReviewAccountSnapshots();
    expect(snapshot.accounts.find((account) => account.id === BANK_ID)?.cardLast4)
      .toBeNull();
    expect(
      snapshot.providerContext.accounts.find((account) => account.id === BANK_ID)
        ?.cardLast4
    ).toBeNull();
  });

  it("deduplicates persisted sender aliases by the existing normalizer and sorts deterministically", async () => {
    senderRows.push(
      {
        id: "1eea0000-3950-4000-8000-000000000404",
        accountId: BANK_ID,
        senderName: " qNb ",
        deleted: false,
      },
      {
        id: "1eea0000-3950-4000-8000-000000000405",
        accountId: BANK_ID,
        senderName: " BANQUE  ",
        deleted: false,
      }
    );

    const snapshot = await loadAccountReviewAccountSnapshots();
    expect(snapshot.accounts.find((account) => account.id === BANK_ID)?.senderNames)
      .toEqual(["BANQUE", "QNB"]);
    expect(snapshot.providerContext.accounts.find((account) => account.id === BANK_ID)
      ?.senderNames).toEqual(["BANQUE", "QNB"]);
    expect(JSON.stringify(snapshot.providerContext)).not.toContain("PRIVATE-");
  });

  it("fails closed on a blank active sender instead of silently dropping identity evidence", async () => {
    senderRows.push({
      id: "1eea0000-3950-4000-8000-000000000406",
      accountId: BANK_ID,
      senderName: " \t  ",
      deleted: false,
    });

    await expect(loadAccountReviewAccountSnapshots()).rejects.toThrow(
      "ACCOUNT_REVIEW_INVALID_SENDER"
    );
  });

  it("fails closed rather than choosing an arbitrary currency when the owned profile is missing", async () => {
    profileRows = profileRows.filter((profile) => profile.userId !== OWNER_ID);

    await expect(loadAccountReviewAccountSnapshots()).rejects.toThrow();
  });

  it("propagates a failed scoped child read instead of treating missing metadata as valid", async () => {
    failedChildTable = "bank_details";

    await expect(loadAccountReviewAccountSnapshots()).rejects.toThrow(
      "owned child query failed"
    );
  });
});
