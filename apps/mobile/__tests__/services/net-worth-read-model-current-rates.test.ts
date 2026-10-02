import { Decimal } from "decimal.js";
import { convertCurrentAmountExact } from "@monyvi/logic";

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

function goldHolding(
  weightGramsDecimal: string,
  purityCode = "gold-999",
  purityFactorDecimal = "0.999"
): NetWorthAssetMetalInput {
  return {
    metalType: "GOLD",
    purityCode,
    weightGrams: Number(weightGramsDecimal),
    weightGramsDecimal,
    purityFraction: Number(purityFactorDecimal),
    purityFactorDecimal,
  };
}

describe("net-worth current rates consume the exact selected snapshot", () => {
  it("retains the full canonical account total for downstream wealth calculations", () => {
    const snapshot = snapshotFor(completeFixtureA());
    const expected = convertCurrentAmountExact({
      amountDecimal: "100",
      fromCurrency: "USD",
      toCurrency: "EGP",
      rates: snapshot.ratesByInstrument,
    });
    if (!expected.available) throw new Error("Expected convertible fixture");
    expect(String(Number(expected.value))).not.toBe(expected.value);
    expect(
      buildNetWorthReadModel({
        accounts: [account(100, "USD")],
        assetMetals: [],
        currentSnapshot: snapshot,
        preferredCurrency: "EGP",
      })
    ).toHaveProperty("totalAccountsDecimal", expected.value);
  });

  it.each(["PLATINUM", "PALLADIUM"] as const)(
    "ignores unsupported legacy %s without hiding supported balances",
    (metalType) => {
      const input = {
        accounts: [account(100, "USD")],
        currentSnapshot: snapshotFor(completeFixtureA()),
        preferredCurrency: "USD" as const,
      };
      const supported = goldHolding("2");
      expect(
        buildNetWorthReadModel({
          ...input,
          assetMetals: [supported, { ...supported, metalType }],
        })
      ).toEqual(buildNetWorthReadModel({ ...input, assetMetals: [supported] }));
    }
  );
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

  it("accepts a finite balance whose JavaScript string uses exponent notation", () => {
    expect(() =>
      buildNetWorthReadModel({
        accounts: [account(1e-7, "USD")],
        assetMetals: [],
        currentSnapshot: snapshotFor(completeFixtureA()),
        preferredCurrency: "USD",
      })
    ).not.toThrow();
    expect(
      buildNetWorthReadModel({
        accounts: [account(1e-7, "USD")],
        assetMetals: [],
        currentSnapshot: snapshotFor(completeFixtureA()),
        preferredCurrency: "USD",
      })?.totalNetWorthUsd
    ).toBe(1e-7);
  });

  it("uses the selected quoted 24K rate directly for gold-999 net worth", () => {
    const snapshot = snapshotFor(completeFixtureA());
    const result = buildNetWorthReadModel({
      accounts: [],
      assetMetals: [goldHolding("10")],
      currentSnapshot: snapshot,
      preferredCurrency: "USD",
    });

    expect(result?.totalAssets).toBeCloseTo(
      Number(new Decimal("3738.74000000").times("10")),
      8
    );
  });

  it("retains the catalog-factor basis for Gold 21K current net worth", () => {
    const result = buildNetWorthReadModel({
      accounts: [],
      assetMetals: [goldHolding("10", "gold-875", "0.875")],
      currentSnapshot: snapshotFor(completeFixtureA()),
      preferredCurrency: "USD",
    });

    expect(result?.totalAssets).toBeCloseTo(
      Number(new Decimal("3738.74000000").times("10").times("0.875")),
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

  it("includes BTC accounts from the exact trusted observation", () => {
    const result = buildNetWorthReadModel({
      accounts: [account(0.03, "BTC"), account(1000, "EGP")],
      assetMetals: [],
      currentSnapshot: snapshotFor(completeFixtureA()),
      preferredCurrency: "EGP",
    });

    const expectedUsd = new Decimal("0.03")
      .times("95000.5000000000")
      .plus(new Decimal("1000").times("0.0210523309"));
    expect(result?.totalNetWorthUsd).toBeCloseTo(Number(expectedUsd), 8);
    expect(result?.totalAccounts).toBeCloseTo(
      expectedUsd.div("0.0210523309").toNumber(),
      6
    );
  });

  it("does not recover missing exact holding facts from legacy number fields", () => {
    const missingExactFacts: NetWorthAssetMetalInput = {
      metalType: "GOLD",
      purityCode: null,
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
