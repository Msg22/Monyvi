/**
 * Guarded non-zero account creation through `createGuardedAccount`.
 *
 * Behavior contract:
 *
 * 1. A non-zero opening balance never touches the legacy direct-write path:
 *    the account row is prepared and committed together with its opening
 *    effect and metadata inside one guarded group.
 * 2. Duplicate identity is enforced authoritatively inside the guarded writer.
 * 3. A stale provisional default assignment retries with fresh state so
 *    concurrent first-account writers commit exactly one default account.
 * 4. Sibling metadata (SMS senders, bank details) failures fail the whole
 *    create without an account id.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */

import {
  CREATE_ACCOUNT_ERROR_CODES,
  createAccountForUser,
} from "@/services/account-service";

// =============================================================================
// Mocks
// =============================================================================

const mockDatabaseGet = jest.fn();
const mockDatabaseWrite = jest.fn();

async function defaultMockCreateGuardedAccount(input: {
  readonly account: unknown;
  readonly prepareInsideWriter: () => Promise<void>;
  readonly userId: string;
}): Promise<void> {
  await input.prepareInsideWriter();
}

const mockCreateGuardedAccount = jest.fn(defaultMockCreateGuardedAccount);

jest.mock("@monyvi/db", () => ({
  database: {
    get: (collectionName: string): unknown => mockDatabaseGet(collectionName),
    write: (writer: () => Promise<void>): Promise<void> =>
      mockDatabaseWrite(writer) as Promise<void>,
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    where: (..._args: unknown[]) => ({ _kind: "where", _args }),
    notEq: (v: unknown) => ({ _kind: "notEq", _v: v }),
    sortBy: (..._args: unknown[]) => ({ _kind: "sortBy", _args }),
    asc: "asc",
  },
}));

jest.mock("@/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: jest.fn(),
}));

jest.mock("@/services/intro-flag-service", () => ({
  readIntroLocaleOverride: jest.fn(),
}));

jest.mock("@/services/account-core-writer-production", () => ({
  createGuardedAccount: (input: {
    readonly account: unknown;
    readonly prepareInsideWriter: () => Promise<void>;
    readonly userId: string;
  }): Promise<void> => mockCreateGuardedAccount(input),
}));

describe("createAccountForUser guarded non-zero creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateGuardedAccount.mockImplementation(
      defaultMockCreateGuardedAccount
    );
    mockDatabaseWrite.mockImplementation((writer: () => Promise<void>) =>
      writer()
    );
  });

  it("creates one non-zero account through the guarded writer with provider metadata, sender rows, and bank details", async () => {
    const preparedAccounts: Array<Record<string, unknown>> = [];
    const bankDetailsCreateCalls: Array<Record<string, unknown>> = [];
    const senderCreateCalls: Array<Record<string, unknown>> = [];
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
        fetchCount: jest.fn().mockResolvedValue(0),
      }),
      create: jest.fn(),
      prepareCreate: jest.fn(
        (populate: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {
            _preparedState: "create",
            id: `prepared-${preparedAccounts.length + 1}`,
          };
          populate(acc);
          preparedAccounts.push({ ...acc });
          return acc;
        }
      ),
    };
    const bankDetailsCollection = {
      create: jest.fn(
        async (writer: (details: Record<string, unknown>) => void) => {
          const details: Record<string, unknown> = {};
          writer(details);
          bankDetailsCreateCalls.push({ ...details });
          return { id: "bank-details-1", ...details };
        }
      ),
      prepareCreate: jest.fn(
        (writer: (details: Record<string, unknown>) => void) => {
          const details: Record<string, unknown> = {};
          writer(details);
          bankDetailsCreateCalls.push({ ...details });
          return { id: "bank-details-1", ...details };
        }
      ),
    };
    const accountSmsSendersCollection = {
      create: jest.fn(
        async (writer: (sender: Record<string, unknown>) => void) => {
          const sender: Record<string, unknown> = {};
          writer(sender);
          senderCreateCalls.push({ ...sender });
          return { id: `sender-${senderCreateCalls.length}`, ...sender };
        }
      ),
      prepareCreate: jest.fn(
        (writer: (sender: Record<string, unknown>) => void) => {
          const sender: Record<string, unknown> = {};
          writer(sender);
          senderCreateCalls.push({ ...sender });
          return { id: `sender-${senderCreateCalls.length}`, ...sender };
        }
      ),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      if (collectionName === "bank_details") return bankDetailsCollection;
      if (collectionName === "account_sms_senders")
        return accountSmsSendersCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: " CIB ",
      accountType: "BANK",
      currency: "EGP",
      balance: "100",
      institutionId: "cib",
      providerDisplayName: "CIB",
      senderNames: [" CIB ", "CIBEGYPT"],
      bankName: " CIB ",
      cardLast4: "1234",
      smsSenderName: " CIBSMS ",
    });

    expect(result).toEqual({
      success: true,
      accountId: "prepared-1",
      created: true,
    });
    expect(accountsCollection.create).not.toHaveBeenCalled();
    expect(preparedAccounts).toEqual([
      expect.objectContaining({
        userId: "user-1",
        name: "CIB",
        type: "BANK",
        balance: 100,
        currency: "EGP",
        financialRevision: "1",
        institutionId: "cib",
        isDefault: true,
        providerDisplayName: "CIB",
        deleted: false,
      }),
    ]);
    expect(mockCreateGuardedAccount).toHaveBeenCalledTimes(1);
    expect(mockCreateGuardedAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ id: "prepared-1", balance: 100 }),
        userId: "user-1",
      })
    );
    expect(bankDetailsCreateCalls).toEqual([
      expect.objectContaining({
        accountId: "prepared-1",
        cardLast4: 1234,
        deleted: false,
      }),
    ]);
    expect(senderCreateCalls).toEqual([
      expect.objectContaining({
        accountId: "prepared-1",
        senderName: "CIB",
        normalizedSenderName: "cib",
        deleted: false,
      }),
      expect.objectContaining({
        accountId: "prepared-1",
        senderName: "CIBEGYPT",
        normalizedSenderName: "cibegypt",
        deleted: false,
      }),
    ]);
    expect(accountsCollection.query).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ _args: ["user_id", "user-1"] }),
      expect.objectContaining({
        _args: [
          "deleted",
          expect.objectContaining({ _kind: "notEq", _v: true }),
        ],
      })
    );
  });

  it("fails closed without creating when an active account with the same name and currency already exists", async () => {
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([
          {
            id: "existing-account",
            name: "Cash",
            type: "CASH",
            userId: "user-1",
            currency: "EGP",
            deleted: false,
          },
        ]),
        fetchCount: jest.fn().mockResolvedValue(1),
      }),
      create: jest.fn(),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: " cash ",
      accountType: "CASH",
      currency: "EGP",
      balance: "0",
    });

    expect(result).toEqual({
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.DUPLICATE_ACCOUNT,
    });
    expect(accountsCollection.create).not.toHaveBeenCalled();
  });

  it("allows the same account name and currency when the known provider differs", async () => {
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([
          {
            id: "cash-1",
            name: "Main",
            type: "CASH",
            userId: "user-1",
            currency: "EGP",
            deleted: false,
            institutionId: undefined,
          },
        ]),
        fetchCount: jest.fn().mockResolvedValue(1),
      }),
      create: jest.fn(
        async (writer: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {};
          writer(acc);
          return { id: "bank-1", ...acc };
        }
      ),
    };
    const accountSmsSendersCollection = {
      create: jest.fn(),
    };
    const bankDetailsCollection = {
      create: jest.fn(
        async (writer: (details: Record<string, unknown>) => void) => {
          const details: Record<string, unknown> = {};
          writer(details);
          return { id: "bank-details-1", ...details };
        }
      ),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      if (collectionName === "account_sms_senders")
        return accountSmsSendersCollection;
      if (collectionName === "bank_details") return bankDetailsCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: "Main",
      accountType: "BANK",
      currency: "EGP",
      balance: "0",
      institutionId: "cib",
      providerDisplayName: "CIB",
      senderNames: [],
    });

    expect(result).toEqual({
      success: true,
      accountId: "bank-1",
      created: true,
    });
    expect(accountsCollection.create).toHaveBeenCalledTimes(1);
  });

  it("fails closed without writing when the balance format is invalid", async () => {
    const accountsCollection = {
      query: jest.fn(),
      create: jest.fn(),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: "Cash",
      accountType: "CASH",
      currency: "EGP",
      balance: "00056465",
    });

    expect(result).toEqual({
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.VALIDATION_FAILED,
    });
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
    expect(accountsCollection.create).not.toHaveBeenCalled();
  });

  it("saves manual wallet provider display with a null institution id and sender rows", async () => {
    const accountCreateCalls: Array<Record<string, unknown>> = [];
    const senderCreateCalls: Array<Record<string, unknown>> = [];
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
        fetchCount: jest.fn().mockResolvedValue(0),
      }),
      create: jest.fn(
        async (writer: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {};
          writer(acc);
          accountCreateCalls.push({ ...acc });
          return { id: "wallet-1", ...acc };
        }
      ),
    };
    const accountSmsSendersCollection = {
      create: jest.fn(
        async (writer: (sender: Record<string, unknown>) => void) => {
          const sender: Record<string, unknown> = {};
          writer(sender);
          senderCreateCalls.push({ ...sender });
          return { id: `sender-${senderCreateCalls.length}`, ...sender };
        }
      ),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      if (collectionName === "account_sms_senders")
        return accountSmsSendersCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: "Family Wallet",
      accountType: "DIGITAL_WALLET",
      currency: "EGP",
      balance: "0",
      institutionId: null,
      providerDisplayName: "Family Wallet Provider",
      senderNames: ["FamilySMS"],
    });

    expect(result).toEqual({
      success: true,
      accountId: "wallet-1",
      created: true,
    });
    expect(accountCreateCalls[0]).toEqual(
      expect.objectContaining({
        type: "DIGITAL_WALLET",
        institutionId: undefined,
        providerDisplayName: "Family Wallet Provider",
      })
    );
    expect(senderCreateCalls).toEqual([
      expect.objectContaining({
        accountId: "wallet-1",
        senderName: "FamilySMS",
        normalizedSenderName: "familysms",
      }),
    ]);
  });

  it("allows the same account name and currency for a different known provider", async () => {
    const accountCreateCalls: Array<Record<string, unknown>> = [];
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([
          {
            id: "existing-account",
            name: "Savings",
            userId: "user-1",
            currency: "EGP",
            deleted: false,
            institutionId: "nbe",
          },
        ]),
        fetchCount: jest.fn().mockResolvedValue(1),
      }),
      create: jest.fn(
        async (writer: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {};
          writer(acc);
          accountCreateCalls.push({ ...acc });
          return { id: "account-1", ...acc };
        }
      ),
    };
    const bankDetailsCollection = {
      create: jest.fn(
        async (writer: (details: Record<string, unknown>) => void) => {
          const details: Record<string, unknown> = {};
          writer(details);
          return { id: "bank-details-1", ...details };
        }
      ),
    };
    const accountSmsSendersCollection = {
      create: jest.fn(
        async (writer: (sender: Record<string, unknown>) => void) => {
          const sender: Record<string, unknown> = {};
          writer(sender);
          return { id: "sender-1", ...sender };
        }
      ),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      if (collectionName === "bank_details") return bankDetailsCollection;
      if (collectionName === "account_sms_senders")
        return accountSmsSendersCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: "Savings",
      accountType: "BANK",
      currency: "EGP",
      balance: "0",
      institutionId: "cib",
      providerDisplayName: "CIB",
      senderNames: ["CIB"],
    });

    expect(result).toEqual({
      success: true,
      accountId: "account-1",
      created: true,
    });
    expect(accountCreateCalls[0]).toEqual(
      expect.objectContaining({ institutionId: "cib" })
    );
  });

  it("fails closed without writing when a create balance has multiple decimal points", async () => {
    const result = await createAccountForUser("user-1", {
      name: "Cash",
      accountType: "CASH",
      currency: "EGP",
      balance: "1654.65.",
    });

    expect(result).toEqual({
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.VALIDATION_FAILED,
    });
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
  });

  it("rejects concurrent duplicate create requests before the second write starts", async () => {
    let releaseWriter: () => void = () => undefined;
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
        fetchCount: jest.fn().mockResolvedValue(0),
      }),
      create: jest.fn(
        async (writer: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {};
          writer(acc);
          return { id: "account-1", ...acc };
        }
      ),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });
    mockDatabaseWrite.mockImplementationOnce(
      async (writer: () => Promise<void>) => {
        await writerGate;
        await writer();
      }
    );

    const data = {
      name: "Cash",
      accountType: "CASH" as const,
      currency: "EGP" as const,
      balance: "0",
    };

    const firstCreate = createAccountForUser("user-1", data);
    const secondCreate = await createAccountForUser("user-1", data);

    expect(secondCreate).toEqual({
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.DUPLICATE_IN_FLIGHT,
    });
    expect(mockDatabaseWrite).toHaveBeenCalledTimes(1);

    releaseWriter();
    await expect(firstCreate).resolves.toEqual({
      success: true,
      accountId: "account-1",
      created: true,
    });
    expect(accountsCollection.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-zero duplicate identity discovered inside the guarded writer", async () => {
    const preparedAccounts: Array<Record<string, unknown>> = [];
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([
          {
            id: "existing-account",
            name: "Cash",
            type: "CASH",
            userId: "user-1",
            currency: "EGP",
            deleted: false,
          },
        ]),
        fetchCount: jest.fn().mockResolvedValue(1),
      }),
      create: jest.fn(),
      prepareCreate: jest.fn(
        (populate: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {
            _preparedState: "create",
            id: `prepared-${preparedAccounts.length + 1}`,
          };
          populate(acc);
          preparedAccounts.push({ ...acc });
          return acc;
        }
      ),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: " cash ",
      accountType: "CASH",
      currency: "EGP",
      balance: "50",
    });

    expect(result).toEqual({
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.DUPLICATE_ACCOUNT,
    });
    expect(mockCreateGuardedAccount).toHaveBeenCalledTimes(1);
  });

  it("retries a stale provisional default so the second writer does not steal default", async () => {
    const preparedAccounts: Array<Record<string, unknown>> = [];
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
        fetchCount: jest
          .fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1)
          .mockResolvedValue(1),
      }),
      create: jest.fn(),
      prepareCreate: jest.fn(
        (populate: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {
            _preparedState: "create",
            id: `prepared-${preparedAccounts.length + 1}`,
          };
          populate(acc);
          preparedAccounts.push({ ...acc });
          return acc;
        }
      ),
    };
    const accountSmsSendersCollection = { create: jest.fn() };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      if (collectionName === "account_sms_senders")
        return accountSmsSendersCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: "Cash",
      accountType: "CASH",
      currency: "EGP",
      balance: "50",
    });

    expect(result).toEqual({
      success: true,
      accountId: "prepared-2",
      created: true,
    });
    expect(mockCreateGuardedAccount).toHaveBeenCalledTimes(2);
    expect(preparedAccounts.map((acc) => acc.isDefault)).toEqual([true, false]);
  });

  it("commits exactly one default across concurrent first-account creates", async () => {
    let committedCount = 0;
    let executeTail: Promise<void> = Promise.resolve();
    const preparedAccounts: Array<Record<string, unknown>> = [];
    const committedDefaults: unknown[] = [];
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
        fetchCount: jest.fn(() => Promise.resolve(committedCount)),
      }),
      create: jest.fn(),
      prepareCreate: jest.fn(
        (populate: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {
            _preparedState: "create",
            id: `prepared-${preparedAccounts.length + 1}`,
          };
          populate(acc);
          preparedAccounts.push({ ...acc });
          return acc;
        }
      ),
    };
    const accountSmsSendersCollection = { create: jest.fn() };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      if (collectionName === "account_sms_senders")
        return accountSmsSendersCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });
    mockCreateGuardedAccount.mockImplementation(
      (input: {
        readonly account: unknown;
        readonly prepareInsideWriter: () => Promise<void>;
        readonly userId: string;
      }): Promise<void> => {
        const run = executeTail.then(async (): Promise<void> => {
          await input.prepareInsideWriter();
          committedCount += 1;
          committedDefaults.push(
            (input.account as Record<string, unknown>).isDefault
          );
        });
        executeTail = run.then(
          (): void => undefined,
          (): void => undefined
        );
        return run;
      }
    );

    const data = {
      name: "Cash",
      accountType: "CASH" as const,
      currency: "EGP" as const,
      balance: "50",
    };
    const [first, second] = await Promise.all([
      createAccountForUser("user-1", data),
      createAccountForUser("user-1", { ...data, name: "Wallet" }),
    ]);

    expect(first).toEqual({
      success: true,
      accountId: "prepared-1",
      created: true,
    });
    expect(second).toEqual({
      success: true,
      accountId: "prepared-3",
      created: true,
    });
    expect(committedDefaults).toEqual([true, false]);
    expect(mockCreateGuardedAccount).toHaveBeenCalledTimes(3);
  });

  it("fails closed without an account id when guarded metadata writes fail", async () => {
    const accountsCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
        fetchCount: jest.fn().mockResolvedValue(0),
      }),
      create: jest.fn(),
      prepareCreate: jest.fn(
        (populate: (acc: Record<string, unknown>) => void) => {
          const acc: Record<string, unknown> = {
            _preparedState: "create",
            id: "prepared-1",
          };
          populate(acc);
          return acc;
        }
      ),
    };
    const bankDetailsCollection = {
      create: jest.fn().mockRejectedValue(new Error("bank details failed")),
      prepareCreate: jest.fn(() => {
        throw new Error("bank details failed");
      }),
    };
    const accountSmsSendersCollection = { create: jest.fn() };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return accountsCollection;
      if (collectionName === "bank_details") return bankDetailsCollection;
      if (collectionName === "account_sms_senders")
        return accountSmsSendersCollection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await createAccountForUser("user-1", {
      name: "CIB",
      accountType: "BANK",
      currency: "EGP",
      balance: "100",
      cardLast4: "1234",
    });

    expect(result.success).toBe(false);
    expect(result.accountId).toBeUndefined();
    expect(mockCreateGuardedAccount).toHaveBeenCalledTimes(1);
  });
});
