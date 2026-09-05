import type { CurrencyType } from "@monyvi/db";

jest.mock("@monyvi/db", () => ({
  database: { get: jest.fn() },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {},
}));

jest.mock("@/services/user-data-access", () => ({
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: jest.fn(),
}));

import { buildWealthBreakdownReadModel } from "@/services/net-worth-read-model-service";

interface TestHolding {
  readonly id: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly status: "active" | "sold" | "disposed";
  readonly isEffective: boolean;
  readonly isVisible: boolean;
  readonly currentValueDecimal: string | null;
}

function buildHolding(overrides: Partial<TestHolding> = {}): TestHolding {
  return {
    id: "holding-gold",
    metalType: "GOLD",
    status: "active",
    isEffective: true,
    isVisible: true,
    currentValueDecimal: "162317.87",
    ...overrides,
  };
}

describe("net-worth metals contribution read model", () => {
  it("keeps Accounts and effective Active Gold/Silver as the only wealth sources with exact shares", () => {
    expect(
      buildWealthBreakdownReadModel({
        currency: "EGP" as CurrencyType,
        accountsValueDecimal: "1062237.75",
        holdings: [
          buildHolding(),
          buildHolding({
            id: "holding-silver",
            metalType: "SILVER",
            currentValueDecimal: "19108.30",
          }),
        ],
      })
    ).toEqual({
      accounts: { amountDecimal: "1062237.75", shareOfNetWorth: "85.4" },
      metals: {
        amountDecimal: "181426.17",
        shareOfNetWorth: "14.6",
        gold: {
          amountDecimal: "162317.87",
          shareOfMetals: "89.5",
          holdingCount: 1,
        },
        silver: {
          amountDecimal: "19108.3",
          shareOfMetals: "10.5",
          holdingCount: 1,
        },
      },
      totalNetWorthDecimal: "1243663.92",
    });
  });

  it("excludes Sold, Disposed, ineffective, and invisible holdings so credited sale proceeds remain Accounts only", () => {
    expect(
      buildWealthBreakdownReadModel({
        currency: "EGP" as CurrencyType,
        accountsValueDecimal: "1232237.75",
        holdings: [
          buildHolding({ status: "sold", currentValueDecimal: "162317.87" }),
          buildHolding({
            id: "disposed",
            metalType: "SILVER",
            status: "disposed",
            currentValueDecimal: "19108.3",
          }),
          buildHolding({ id: "rejected", isEffective: false }),
          buildHolding({ id: "hidden", isVisible: false }),
        ],
      })
    ).toEqual({
      accounts: { amountDecimal: "1232237.75", shareOfNetWorth: "100" },
      metals: {
        amountDecimal: "0",
        shareOfNetWorth: "0",
        gold: { amountDecimal: "0", shareOfMetals: "0", holdingCount: 0 },
        silver: { amountDecimal: "0", shareOfMetals: "0", holdingCount: 0 },
      },
      totalNetWorthDecimal: "1232237.75",
    });
  });

  it("keeps owned holding counts and known account value while returning null for every aggregate that needs a missing rate", () => {
    expect(
      buildWealthBreakdownReadModel({
        currency: "EGP" as CurrencyType,
        accountsValueDecimal: "1062237.75",
        holdings: [
          buildHolding({ currentValueDecimal: null }),
          buildHolding({
            id: "holding-silver",
            metalType: "SILVER",
            currentValueDecimal: null,
          }),
        ],
      })
    ).toEqual({
      accounts: { amountDecimal: "1062237.75", shareOfNetWorth: null },
      metals: {
        amountDecimal: null,
        shareOfNetWorth: null,
        gold: { amountDecimal: null, shareOfMetals: null, holdingCount: 1 },
        silver: { amountDecimal: null, shareOfMetals: null, holdingCount: 1 },
      },
      totalNetWorthDecimal: null,
    });
  });

  it("uses exact decimal arithmetic without retaining input references", () => {
    const holdings = [buildHolding({ currentValueDecimal: "0.2" })];
    const model = buildWealthBreakdownReadModel({
      currency: "EGP" as CurrencyType,
      accountsValueDecimal: "0.1",
      holdings,
    });

    expect(model.metals.amountDecimal).toBe("0.2");
    expect(model.totalNetWorthDecimal).toBe("0.3");
    expect(model.accounts.shareOfNetWorth).toBe("33.3");

    (
      holdings[0] as { currentValueDecimal: string | null }
    ).currentValueDecimal = "1";

    expect(model.metals.amountDecimal).toBe("0.2");
  });
});
