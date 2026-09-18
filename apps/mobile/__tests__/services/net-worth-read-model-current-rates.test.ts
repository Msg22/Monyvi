import { Decimal } from "decimal.js";

import {
  buildNetWorthReadModel,
  type NetWorthAccountInput,
  type NetWorthAssetMetalInput,
} from "@/services/net-worth-read-model-service";
import {
  completeFixtureA,
  divergentWideRootFixtureA,
} from "../fixtures/market-rate-snapshot";
import {
  selectMarketRateSnapshot,
  type SelectedMarketRateSnapshot,
} from "@/services/market-rate-snapshot-read-model-service";

const NOW_MS = Date.parse("2026-09-09T11:00:00.000Z");

jest.mock("@monyvi/db", () => ({
  database: {
    get: () => ({
      query: () => ({
        observe: () => ({
          subscribe: () => ({ unsubscribe: () => undefined }),
        }),
        fetch: () => Promise.resolve([]),
      }),
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: () => ({
    observe: () => ({
      subscribe: () => ({ unsubscribe: () => undefined }),
    }),
  }),
  queryOwned: () => ({
    observe: () => ({
      subscribe: () => ({ unsubscribe: () => undefined }),
    }),
  }),
}));

type SnapshotFixture = ReturnType<typeof completeFixtureA>;

function snapshotFor(fixture: SnapshotFixture): SelectedMarketRateSnapshot {
  const selected = selectMarketRateSnapshot(
    fixture.roots,
    fixture.observations,
    NOW_MS
  );
  if (!selected) {
    throw new Error("fixture setup: snapshot must be selectable");
  }
  return selected;
}

function account(
  balance: number,
  currency: NetWorthAccountInput["currency"]
): NetWorthAccountInput {
  return { balance, currency };
}

function goldHolding(weightGramsDecimal: string): NetWorthAssetMetalInput {
  return {
    metalType: "GOLD",
    weightGrams: Number(weightGramsDecimal),
    weightGramsDecimal,
    purityFraction: 1,
    purityFactorDecimal: "1",
  };
}

describe("net-worth current rates consume the exact selected snapshot", () => {
  it("converts account balances with exact snapshot decimals", () => {
    const snapshot = snapshotFor(completeFixtureA());
    const result = buildNetWorthReadModel({
      accounts: [account(1000, "EGP"), account(100, "USD")],
      assetMetals: [],
      currentSnapshot: snapshot,
      preferredCurrency: "EGP",
    });

    expect(result).not.toBeNull();
    const expectedUsd = new Decimal("1000").times("0.0210523309").plus(100);
    expect(result?.totalNetWorthUsd).toBeCloseTo(Number(expectedUsd), 8);
  });

  it("values metal holdings from exact metal USD-per-gram decimals", () => {
    const snapshot = snapshotFor(completeFixtureA());
    const result = buildNetWorthReadModel({
      accounts: [],
      assetMetals: [goldHolding("10")],
      currentSnapshot: snapshot,
      preferredCurrency: "USD",
    });

    expect(result?.totalAssets).toBeCloseTo(
      Number(new Decimal("3738.74000000").times("10").times("1")),
      8
    );
  });

  it("cannot be influenced by divergent wide-root numeric compatibility values", () => {
    const exact = buildNetWorthReadModel({
      accounts: [account(1000, "EGP")],
      assetMetals: [goldHolding("2")],
      currentSnapshot: snapshotFor(completeFixtureA()),
      preferredCurrency: "USD",
    });
    const divergent = buildNetWorthReadModel({
      accounts: [account(1000, "EGP")],
      assetMetals: [goldHolding("2")],
      currentSnapshot: snapshotFor(divergentWideRootFixtureA()),
      preferredCurrency: "USD",
    });

    expect(divergent).toEqual(exact);
  });

  it("returns unavailable rather than zero when no snapshot is selected", () => {
    expect(
      buildNetWorthReadModel({
        accounts: [account(1000, "EGP")],
        assetMetals: [goldHolding("2")],
        currentSnapshot: null,
        preferredCurrency: "EGP",
      })
    ).toBeNull();
  });

  it("fails closed for currencies outside the trusted snapshot set", () => {
    expect(
      buildNetWorthReadModel({
        accounts: [account(1, "BTC")],
        assetMetals: [],
        currentSnapshot: snapshotFor(completeFixtureA()),
        preferredCurrency: "USD",
      })
    ).toBeNull();
  });

  it("does not recover missing exact holding facts from legacy number fields", () => {
    const missingExactFacts: NetWorthAssetMetalInput = {
      metalType: "GOLD",
      weightGrams: 2,
      weightGramsDecimal: null,
      purityFraction: 1,
      purityFactorDecimal: null,
    };

    expect(
      buildNetWorthReadModel({
        accounts: [],
        assetMetals: [missingExactFacts],
        currentSnapshot: snapshotFor(completeFixtureA()),
        preferredCurrency: "USD",
      })
    ).toBeNull();
  });

  it("never consults MarketRate numeric fields for current conversion", () => {
    const result = buildNetWorthReadModel({
      accounts: [account(21.0523309, "USD")],
      assetMetals: [],
      currentSnapshot: snapshotFor(completeFixtureA()),
      preferredCurrency: "EGP",
    });

    expect(result?.totalAccounts ?? Number.NaN).toBeCloseTo(
      new Decimal("21.0523309").div("0.0210523309").toNumber(),
      6
    );
  });
});
