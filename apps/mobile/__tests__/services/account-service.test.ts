/**
 * Unit tests for `createCashAccountWithinWriter` — the idempotent core of
 * `confirmCurrencyAndOnboard`'s cash-account write.
 *
 * Behavior contract (per spec 026 + 2026-04-26 user requirement):
 *
 *  1. Same currency, existing non-deleted CASH account → reuse, no
 *     duplicate. `created: false`.
 *  2. Different currency, existing CASH account in another currency →
 *     create a NEW CASH account in the selected currency. The prior
 *     account row is left untouched. `created: true`.
 *  3. No existing CASH accounts → create a new one. `created: true`.
 *  4. Existing CASH account in same currency but `deleted = true` → the
 *     soft-deleted row is filtered out by the query, so a fresh CASH
 *     account is created. `created: true`.
 *
 * The function is `await`-driven against a mocked WatermelonDB collection —
 * we don't spin up a real DB, just verify the query shape and return
 * value paths.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */

import {
  createCashAccountWithinWriter,
  ensureCashAccount,
  getDefaultCashAccountName,
} from "@/services/account-service";

// =============================================================================
// Mocks
// =============================================================================

// `@monyvi/db` is shared between source and tests. We don't need its real
// `database` here — `createCashAccountWithinWriter` accepts the collection as
// a parameter and never touches `database.write`. Mocking the module shape
// satisfies the `import` chain without bringing the runtime in.
const mockDatabaseGet = jest.fn();
const mockDatabaseWrite = jest.fn();
const mockCreateGuardedAccount = jest.fn(
  async (input: {
    readonly account: unknown;
    readonly prepareInsideWriter: () => Promise<void>;
    readonly userId: string;
  }): Promise<void> => {
    await input.prepareInsideWriter();
  }
);

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

jest.mock("@/utils/currency-detection", () => ({
  detectCurrencyFromTimezone: jest.fn(),
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

// =============================================================================
// Helpers
// =============================================================================

interface MockAccountRow {
  readonly id: string;
  readonly type: string;
  readonly userId: string;
  readonly currency: string;
  readonly deleted: boolean;
  readonly isDefault?: boolean;
  readonly name?: string;
}

function getIntroFlagMocks(): { readIntroLocaleOverride: jest.Mock } {
  return jest.requireMock<{ readIntroLocaleOverride: jest.Mock }>(
    "@/services/intro-flag-service"
  );
}

/**
 * Build a stub of a WatermelonDB collection that returns the given seed
 * rows from `query(...).fetch()` and records `create()` calls.
 */
function buildCollectionStub(seed: MockAccountRow[]): {
  collection: any;
  createCalls: Array<Record<string, unknown>>;
} {
  const createCalls: Array<Record<string, unknown>> = [];
  const activeAccountCount = seed.filter((r) => r.deleted !== true).length;

  const collection = {
    query: jest.fn().mockReturnValue({
      fetch: jest
        .fn()
        .mockResolvedValue(
          seed.filter((r) => r.type === "CASH" && r.deleted !== true)
        ),
      fetchCount: jest.fn().mockResolvedValue(activeAccountCount),
    }),
    create: jest.fn(async (writer: (acc: Record<string, unknown>) => void) => {
      const acc: Record<string, unknown> = {};
      writer(acc);
      const id = `new-acct-${createCalls.length + 1}`;
      createCalls.push({ ...acc });
      return { id, ...acc };
    }),
  };

  return { collection, createCalls };
}

// =============================================================================
// Tests
// =============================================================================

describe("createCashAccountWithinWriter — cash-account idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reuses an existing non-deleted CASH account in the same currency (no duplicate)", async () => {
    const seed: MockAccountRow[] = [
      {
        id: "existing-egp-cash",
        type: "CASH",
        userId: "user-1",
        currency: "EGP",
        deleted: false,
      },
    ];
    const { collection, createCalls } = buildCollectionStub(seed);

    // Ensure the query stub honors currency / deleted filter — our stub
    // already returns only CASH+!deleted rows, so the inner `currency`
    // filter is inferred from the test setup. Re-stub fetch to apply the
    // currency filter explicitly:
    collection.query.mockReturnValue({
      fetch: jest
        .fn()
        .mockResolvedValue(
          seed.filter(
            (r) => r.type === "CASH" && !r.deleted && r.currency === "EGP"
          )
        ),
      fetchCount: jest.fn().mockResolvedValue(1),
    });

    const result = await createCashAccountWithinWriter(
      "user-1",
      "EGP",
      collection
    );

    expect(result).toEqual({
      accountId: "existing-egp-cash",
      created: false,
    });
    expect(collection.create).not.toHaveBeenCalled();
    expect(createCalls).toHaveLength(0);
  });

  it("creates a NEW CASH account when only an account in a DIFFERENT currency exists; the prior account is untouched", async () => {
    const seed: MockAccountRow[] = [
      {
        id: "existing-usd-cash",
        type: "CASH",
        userId: "user-1",
        currency: "USD",
        deleted: false,
      },
    ];
    const { collection, createCalls } = buildCollectionStub(seed);
    // Currency-filtered query for "EGP" → returns nothing because the
    // existing account is USD.
    collection.query.mockReturnValue({
      fetch: jest
        .fn()
        .mockResolvedValue(
          seed.filter(
            (r) => r.type === "CASH" && !r.deleted && r.currency === "EGP"
          )
        ),
      fetchCount: jest.fn().mockResolvedValue(1),
    });

    const result = await createCashAccountWithinWriter(
      "user-1",
      "EGP",
      collection
    );

    expect(result.created).toBe(true);
    expect(result.accountId).toBe("new-acct-1");
    // A new row was inserted with the SELECTED currency.
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      type: "CASH",
      currency: "EGP",
      userId: "user-1",
      deleted: false,
      balance: 0,
    });
    // No mutation pretends the existing USD row was touched: we never
    // looked it up via collection.update — only collection.create was
    // called with brand-new fields, and the seed is unchanged.
    expect(seed[0]).toEqual({
      id: "existing-usd-cash",
      type: "CASH",
      userId: "user-1",
      currency: "USD",
      deleted: false,
    });
  });

  it("creates a new CASH account when no CASH accounts exist", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });

    const result = await createCashAccountWithinWriter(
      "user-1",
      "EGP",
      collection
    );

    expect(result.created).toBe(true);
    expect(result.accountId).toBe("new-acct-1");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      type: "CASH",
      currency: "EGP",
      userId: "user-1",
      deleted: false,
      balance: 0,
      name: "Cash",
    });
  });

  it("marks a newly seeded CASH account as default when it is the user's first active account", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });

    const result = await createCashAccountWithinWriter(
      "user-1",
      "EGP",
      collection
    );

    expect(result.created).toBe(true);
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      type: "CASH",
      currency: "EGP",
      isDefault: true,
    });
  });

  it("does not make an auto-created CASH account default when another active account already exists", async () => {
    const seed: MockAccountRow[] = [
      {
        id: "existing-bank-account",
        type: "BANK",
        userId: "user-1",
        currency: "EGP",
        deleted: false,
        isDefault: true,
      },
    ];
    const { collection, createCalls } = buildCollectionStub(seed);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(1),
    });

    const result = await createCashAccountWithinWriter(
      "user-1",
      "EGP",
      collection
    );

    expect(result.created).toBe(true);
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]).toMatchObject({
      type: "CASH",
      currency: "EGP",
      isDefault: false,
    });
  });

  it("creates a fresh CASH account when only a SOFT-DELETED account in the same currency exists (deleted rows are filtered)", async () => {
    const seed: MockAccountRow[] = [
      {
        id: "old-deleted-egp",
        type: "CASH",
        userId: "user-1",
        currency: "EGP",
        deleted: true,
      },
    ];
    const { collection, createCalls } = buildCollectionStub(seed);
    // The query in account-service uses `Q.where("deleted", Q.notEq(true))`,
    // so the soft-deleted row is filtered out at the DB layer. Mirror that
    // here so the test reflects production behavior.
    collection.query.mockReturnValue({
      fetch: jest
        .fn()
        .mockResolvedValue(
          seed.filter(
            (r) =>
              r.type === "CASH" && r.deleted === false && r.currency === "EGP"
          )
        ),
      fetchCount: jest.fn().mockResolvedValue(0),
    });

    const result = await createCashAccountWithinWriter(
      "user-1",
      "EGP",
      collection
    );

    expect(result.created).toBe(true);
    expect(result.accountId).toBe("new-acct-1");
    expect(createCalls).toHaveLength(1);
  });

  it("trims whitespace on userId before persisting (safety against caller error)", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });

    await createCashAccountWithinWriter("  user-1  ", "EGP", collection);

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].userId).toBe("user-1");
  });

  it("uses the optional custom name when provided, falling back to default 'Cash' otherwise", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });

    await createCashAccountWithinWriter(
      "user-1",
      "EGP",
      collection,
      "Pocket Money"
    );

    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].name).toBe("Pocket Money");
  });
});

describe("ensureCashAccount - localized seed name", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabaseWrite.mockImplementation((writer: () => Promise<void>) =>
      writer()
    );
    const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
      "@/services/supabase"
    );
    supabaseMock.getCurrentUserId.mockResolvedValue("user-1");
  });

  it("does not create an ATM cash account after the authenticated user changes", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });
    mockDatabaseGet.mockReturnValue(collection);
    const supabaseMock = jest.requireMock<{ getCurrentUserId: jest.Mock }>(
      "@/services/supabase"
    );
    supabaseMock.getCurrentUserId.mockResolvedValueOnce("next-user-id");

    const result = await ensureCashAccount(
      "user-1",
      "EGP",
      undefined,
      "user-1"
    );

    expect(result).toMatchObject({
      created: false,
      accountId: null,
      error: "AUTH_SCOPE_CHANGED",
    });
    expect(createCalls).toHaveLength(0);
  });

  it("stores the default Cash account name using the user's preferred language", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });
    const profilesCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([{ preferredLanguage: "ar" }]),
      }),
    };
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "profiles") return profilesCollection;
      if (collectionName === "accounts") return collection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    const result = await ensureCashAccount("user-1", "EGP");

    expect(result.created).toBe(true);
    expect(createCalls[0].name).toBe(getDefaultCashAccountName("ar"));
  });

  it("falls back to the pre-auth intro locale when no profile language exists", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });
    const profilesCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
      }),
    };
    const { readIntroLocaleOverride } = getIntroFlagMocks();
    readIntroLocaleOverride.mockResolvedValue("ar");
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "profiles") return profilesCollection;
      if (collectionName === "accounts") return collection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await ensureCashAccount("user-1", "EGP");

    expect(createCalls[0].name).toBe(getDefaultCashAccountName("ar"));
  });

  it("keeps an explicit caller-provided cash account name as-is", async () => {
    const { collection, createCalls } = buildCollectionStub([]);
    collection.query.mockReturnValue({
      fetch: jest.fn().mockResolvedValue([]),
      fetchCount: jest.fn().mockResolvedValue(0),
    });
    mockDatabaseGet.mockImplementation((collectionName: string) => {
      if (collectionName === "accounts") return collection;
      throw new Error(`Unexpected collection: ${collectionName}`);
    });

    await ensureCashAccount("user-1", "EGP", "Cash");

    expect(createCalls[0].name).toBe("Cash");
  });
});
