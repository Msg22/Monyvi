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
  readonly status: "ACTIVE" | "SOLD" | "DISPOSED";
  readonly isEffective: boolean;
  readonly isVisible: boolean;
  readonly currentValue: number | null;
}

function buildHolding(overrides: Partial<TestHolding> = {}): TestHolding {
  return {
    id: "holding-gold",
    metalType: "GOLD",
    status: "ACTIVE",
    isEffective: true,
    isVisible: true,
    currentValue: 162317.87,
    ...overrides,
  };
}

describe("net-worth metals contribution read model", () => {
  it("keeps Accounts and effective Active Gold/Silver as the only wealth sources with exact shares", () => {
    expect(
      buildWealthBreakdownReadModel({
        currency: "EGP" as CurrencyType,
        accountsValue: 1062237.75,
        holdings: [
          buildHolding(),
          buildHolding({
            id: "holding-silver",
            metalType: "SILVER",
            currentValue: 19108.3,
          }),
        ],
      })
    ).toEqual({
      accounts: { amount: 1062237.75, shareOfNetWorth: 85.4 },
      metals: {
        amount: 181426.17,
        shareOfNetWorth: 14.6,
        gold: { amount: 162317.87, shareOfMetals: 89.5, holdingCount: 1 },
        silver: { amount: 19108.3, shareOfMetals: 10.5, holdingCount: 1 },
      },
      totalNetWorth: 1243663.92,
    });
  });

  it("excludes Sold, Disposed, ineffective, and invisible holdings so credited sale proceeds remain Accounts only", () => {
    expect(
      buildWealthBreakdownReadModel({
        currency: "EGP" as CurrencyType,
        accountsValue: 1232237.75,
        holdings: [
          buildHolding({ status: "SOLD", currentValue: 162317.87 }),
          buildHolding({
            id: "disposed",
            metalType: "SILVER",
            status: "DISPOSED",
            currentValue: 19108.3,
          }),
          buildHolding({ id: "rejected", isEffective: false }),
          buildHolding({ id: "hidden", isVisible: false }),
        ],
      })
    ).toEqual({
      accounts: { amount: 1232237.75, shareOfNetWorth: 100 },
      metals: {
        amount: 0,
        shareOfNetWorth: 0,
        gold: { amount: 0, shareOfMetals: 0, holdingCount: 0 },
        silver: { amount: 0, shareOfMetals: 0, holdingCount: 0 },
      },
      totalNetWorth: 1232237.75,
    });
  });

  it("keeps owned holding counts and known account value while returning null for every aggregate that needs a missing rate", () => {
    expect(
      buildWealthBreakdownReadModel({
        currency: "EGP" as CurrencyType,
        accountsValue: 1062237.75,
        holdings: [
          buildHolding({ currentValue: null }),
          buildHolding({
            id: "holding-silver",
            metalType: "SILVER",
            currentValue: null,
          }),
        ],
      })
    ).toEqual({
      accounts: { amount: 1062237.75, shareOfNetWorth: null },
      metals: {
        amount: null,
        shareOfNetWorth: null,
        gold: { amount: null, shareOfMetals: null, holdingCount: 1 },
        silver: { amount: null, shareOfMetals: null, holdingCount: 1 },
      },
      totalNetWorth: null,
    });
  });

  it("returns a detached snapshot so later holding mutations cannot alter rendered wealth facts", () => {
    const holdings = [buildHolding()];
    const model = buildWealthBreakdownReadModel({
      currency: "EGP" as CurrencyType,
      accountsValue: 1000,
      holdings,
    });

    (holdings[0] as { currentValue: number | null }).currentValue = 1;

    expect(model.metals.amount).toBe(162317.87);
    expect(model.totalNetWorth).toBe(163317.87);
  });
});
