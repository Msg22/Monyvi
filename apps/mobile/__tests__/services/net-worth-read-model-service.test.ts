import type {
  Account,
  Asset,
  AssetMetal,
  DailySnapshotNetWorth,
} from "@monyvi/db";
import { Decimal } from "decimal.js";
import { getSameDayLastMonth } from "@monyvi/logic";

import { selectMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";
import { completeFixtureA } from "../fixtures/market-rate-snapshot";

const mockAccountsCollection = { table: "accounts" };
const mockAssetsCollection = { table: "assets" };
const mockAssetMetalsCollection = { table: "asset_metals" };
const mockSnapshotsCollection = { table: "daily_snapshot_net_worth" };
const mockAccountsQuery = { kind: "accounts-query" };
const mockAssetsQuery = { kind: "assets-query" };
const mockAssetMetalsQuery = { kind: "asset-metals-query" };
const mockSnapshotsQuery = { kind: "snapshots-query" };
const mockDatabaseGet = jest.fn((tableName: string): unknown => {
  if (tableName === "accounts") return mockAccountsCollection;
  if (tableName === "assets") return mockAssetsCollection;
  if (tableName === "asset_metals") return mockAssetMetalsCollection;
  if (tableName === "daily_snapshot_net_worth") return mockSnapshotsCollection;
  throw new Error(`Unexpected table: ${tableName}`);
});
const mockQueryOwned = jest.fn();
const mockQueryChildrenOfOwnedParents = jest.fn();

interface QueryCondition {
  readonly kind: "where" | "sortBy";
  readonly column?: string;
  readonly value: unknown;
}

jest.mock("@monyvi/db", () => ({
  database: {
    get: (tableName: string): unknown => mockDatabaseGet(tableName),
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    desc: "desc",
    sortBy: (column: string, value: unknown): QueryCondition => ({
      kind: "sortBy",
      column,
      value,
    }),
    where: (column: string, value: unknown): QueryCondition => ({
      kind: "where",
      column,
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: (...args: readonly unknown[]): unknown =>
    mockQueryChildrenOfOwnedParents(...args),
  queryOwned: (...args: readonly unknown[]): unknown => mockQueryOwned(...args),
}));

import {
  buildMonthlyPercentageChange,
  buildNetWorthReadModel,
  observeNetWorthAccounts,
  observeNetWorthAssetMetals,
  observeNetWorthAssets,
  observeNetWorthSnapshots,
} from "@/services/net-worth-read-model-service";

function createAccount(balance: number, currency: "EGP" | "USD"): Account {
  return { balance, currency } as unknown as Account;
}

function createAssetMetal(
  weightGramsDecimal: string,
  metalType: "GOLD" | "SILVER" = "GOLD"
): AssetMetal {
  return {
    metalType,
    purityFactorDecimal: "1",
    purityFraction: 1,
    weightGrams: Number(weightGramsDecimal),
    weightGramsDecimal,
  } as unknown as AssetMetal;
}

function createSnapshot(
  date: string,
  totalNetWorth: number
): DailySnapshotNetWorth {
  return {
    snapshotDate: new Date(date),
    totalNetWorth,
  } as unknown as DailySnapshotNetWorth;
}

describe("net-worth-read-model-service", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-15T12:00:00.000Z"));
    jest.clearAllMocks();
    mockQueryOwned.mockImplementation((collection: unknown): unknown => {
      if (collection === mockAccountsCollection) return mockAccountsQuery;
      if (collection === mockAssetsCollection) return mockAssetsQuery;
      if (collection === mockSnapshotsCollection) return mockSnapshotsQuery;
      throw new Error("Unexpected queryOwned collection");
    });
    mockQueryChildrenOfOwnedParents.mockReturnValue(mockAssetMetalsQuery);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("builds scoped net-worth source queries", () => {
    expect(observeNetWorthAccounts("user-1")).toBe(mockAccountsQuery);
    expect(observeNetWorthAssets("user-1")).toBe(mockAssetsQuery);
    expect(observeNetWorthSnapshots("user-1")).toBe(mockSnapshotsQuery);

    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockAccountsCollection,
      "user-1",
      { kind: "where", column: "deleted", value: false }
    );
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockAssetsCollection,
      "user-1",
      { kind: "where", column: "deleted", value: false }
    );
    expect(mockQueryOwned).toHaveBeenCalledWith(
      mockSnapshotsCollection,
      "user-1",
      { kind: "sortBy", column: "snapshot_date", value: "desc" }
    );
  });

  it("builds a child asset-metal query only when scoped assets exist", () => {
    const asset = { id: "asset-1" } as unknown as Asset;

    expect(
      observeNetWorthAssetMetals({ userId: "user-1", assets: [asset] })
    ).toBe(mockAssetMetalsQuery);
    expect(mockQueryChildrenOfOwnedParents).toHaveBeenCalledWith(
      mockAssetMetalsCollection,
      [asset],
      "user-1",
      "asset_id",
      { kind: "where", column: "deleted", value: false }
    );

    expect(observeNetWorthAssetMetals({ userId: "user-1", assets: [] })).toBe(
      null
    );
  });

  it("builds preferred-currency and USD net-worth totals from the exact selected snapshot", () => {
    const snapshot = selectMarketRateSnapshot(
      completeFixtureA().roots as never,
      completeFixtureA().observations as never,
      Date.parse("2026-09-09T11:00:00.000Z")
    );
    if (!snapshot) {
      throw new Error("fixture setup: snapshot A must be selectable");
    }

    const model = buildNetWorthReadModel({
      accounts: [createAccount(1000, "EGP"), createAccount(10, "USD")],
      assetMetals: [createAssetMetal("10")],
      currentSnapshot: snapshot,
      preferredCurrency: "EGP",
    });

    const accountsUsd = new Decimal("1000").times("0.0210523309").plus(10);
    const assetsUsd = new Decimal("10").times("3738.74000000").times("1");
    const totalUsd = accountsUsd.plus(assetsUsd);

    expect(model).not.toBeNull();
    expect(model?.totalNetWorthUsd).toBeCloseTo(totalUsd.toNumber(), 6);
    expect(model?.totalAccounts).toBeCloseTo(
      accountsUsd.div("0.0210523309").toNumber(),
      4
    );
    expect(model?.totalAssets).toBeCloseTo(
      assetsUsd.div("0.0210523309").toNumber(),
      4
    );
    expect(model?.totalNetWorth).toBeCloseTo(
      totalUsd.div("0.0210523309").toNumber(),
      4
    );
  });

  it("returns null when no complete snapshot is selected", () => {
    expect(
      buildNetWorthReadModel({
        accounts: [createAccount(1000, "EGP")],
        assetMetals: [],
        currentSnapshot: null,
        preferredCurrency: "EGP",
      })
    ).toBeNull();
  });

  it("calculates month-over-month percentage change from same-day previous snapshot", () => {
    const sameDayLastMonth = getSameDayLastMonth();

    const change = buildMonthlyPercentageChange([
      createSnapshot("2026-05-15T00:00:00.000Z", 1200),
      createSnapshot(`${sameDayLastMonth}T00:00:00.000Z`, 1000),
      createSnapshot("2026-04-01T00:00:00.000Z", 900),
    ]);

    expect(change).toBe(20);
  });

  it("returns null for missing or zero previous snapshots", () => {
    expect(buildMonthlyPercentageChange([])).toBeNull();
    expect(
      buildMonthlyPercentageChange([
        createSnapshot("2026-05-15T00:00:00.000Z", 1200),
        createSnapshot("2026-04-15T00:00:00.000Z", 0),
      ])
    ).toBeNull();
  });
});
