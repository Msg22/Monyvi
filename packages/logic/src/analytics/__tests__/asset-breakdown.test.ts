/**
 * Unit Tests: Asset Breakdown
 *
 * Covers calculateAssetBreakdown and calculateAssetBreakdownPercentages.
 */

import type {
  Account,
  AccountType,
  AssetMetal,
  CurrencyType,
  MarketRate,
  MetalType,
} from "@monyvi/db";
import {
  calculateAssetBreakdown,
  calculateAssetBreakdownPercentages,
  type AssetBreakdown,
} from "../asset-breakdown";

// =============================================================================
// Test Helpers
// =============================================================================

interface MockAccountInput {
  balance: number;
  currency?: CurrencyType;
  type?: AccountType;
}

function createMockAccount(input: MockAccountInput): Account {
  return {
    balance: input.balance,
    currency: input.currency ?? "USD",
    type: input.type ?? "CASH",
  } as unknown as Account;
}

interface MockAssetMetalInput {
  weightGrams: number;
  purityFraction?: number;
  metalType?: MetalType;
}

function createMockAssetMetal(input: MockAssetMetalInput): AssetMetal {
  const weightGrams = input.weightGrams;
  const purityFraction = input.purityFraction ?? 1;
  const metalType = input.metalType ?? "GOLD";

  return {
    weightGrams,
    purityFraction,
    metalType,
    calculateValue(pricePerGram: number): number {
      return weightGrams * purityFraction * pricePerGram;
    },
  } as unknown as AssetMetal;
}

/**
 * Create a mock MarketRate with currency and metal price fields.
 */
function createMockMarketRates(overrides?: {
  egpUsd?: number;
  goldUsdPerGram?: number;
  silverUsdPerGram?: number;
  platinumUsdPerGram?: number;
  palladiumUsdPerGram?: number;
}): MarketRate {
  const egpUsd = overrides?.egpUsd ?? 0.02;
  const rates: Partial<MarketRate> = {
    egpUsd,
    goldUsdPerGram: overrides?.goldUsdPerGram ?? 90,
    silverUsdPerGram: overrides?.silverUsdPerGram ?? 1,
    platinumUsdPerGram: overrides?.platinumUsdPerGram ?? 30,
    palladiumUsdPerGram: overrides?.palladiumUsdPerGram ?? 35,
  };

  return rates as MarketRate;
}

// =============================================================================
// calculateAssetBreakdown
// =============================================================================

describe("calculateAssetBreakdown", () => {
  it("calculates breakdown for mixed account types in USD", () => {
    const accounts = [
      createMockAccount({ balance: 5000, type: "BANK" }),
      createMockAccount({ balance: 1000, type: "CASH" }),
      createMockAccount({ balance: 500, type: "DIGITAL_WALLET" }),
    ];

    const marketRates = createMockMarketRates();
    const result = calculateAssetBreakdown(accounts, [], marketRates);

    expect(result.bank).toBe(5000);
    expect(result.cash).toBe(1000);
    expect(result.wallet).toBe(500);
    expect(result.metals).toBe(0);
    expect(result.total).toBe(6500);
  });

  it("fails loudly when a caller bypasses the non-null rate contract", () => {
    const accounts = [
      createMockAccount({ balance: 5000, currency: "EGP", type: "BANK" }),
    ];

    expect(() =>
      calculateAssetBreakdown(accounts, [], null as unknown as MarketRate)
    ).toThrow();
  });

  it("returns all zeros for empty accounts and metals", () => {
    const marketRates = createMockMarketRates();
    const result = calculateAssetBreakdown([], [], marketRates);

    expect(result.total).toBe(0);
    expect(result.bank).toBe(0);
    expect(result.cash).toBe(0);
    expect(result.wallet).toBe(0);
    expect(result.metals).toBe(0);
  });

  it("converts non-USD account balances using market rates", () => {
    const accounts = [
      createMockAccount({ balance: 10000, currency: "EGP", type: "BANK" }),
    ];

    const marketRates = createMockMarketRates({ egpUsd: 0.02 });
    const result = calculateAssetBreakdown(accounts, [], marketRates);

    // 10000 EGP * 0.02 = 200 USD
    expect(result.bank).toBe(200);
    expect(result.total).toBe(200);
  });

  it("calculates metal values based on weight, purity, and market price", () => {
    const metals = [
      createMockAssetMetal({
        weightGrams: 10,
        purityFraction: 0.999,
        metalType: "GOLD",
      }),
    ];

    const marketRates = createMockMarketRates({ goldUsdPerGram: 90 });
    const result = calculateAssetBreakdown([], metals, marketRates);

    // 10 * 0.999 * 90 = 899.1
    expect(result.metals).toBeCloseTo(899.1, 2);
    expect(result.total).toBeCloseTo(899.1, 2);
  });

  it("handles multiple metals of different types", () => {
    const metals = [
      createMockAssetMetal({
        weightGrams: 10,
        purityFraction: 1,
        metalType: "GOLD",
      }),
      createMockAssetMetal({
        weightGrams: 100,
        purityFraction: 1,
        metalType: "SILVER",
      }),
    ];

    const marketRates = createMockMarketRates({
      goldUsdPerGram: 90,
      silverUsdPerGram: 1,
    });
    const result = calculateAssetBreakdown([], metals, marketRates);

    // Gold: 10 * 1 * 90 = 900; Silver: 100 * 1 * 1 = 100
    expect(result.metals).toBe(1000);
    expect(result.total).toBe(1000);
  });

  it("sums accounts and metals for the total", () => {
    const accounts = [
      createMockAccount({ balance: 1000, type: "BANK" }),
      createMockAccount({ balance: 500, type: "CASH" }),
    ];

    const metals = [
      createMockAssetMetal({
        weightGrams: 5,
        purityFraction: 1,
        metalType: "GOLD",
      }),
    ];

    const marketRates = createMockMarketRates({ goldUsdPerGram: 100 });
    const result = calculateAssetBreakdown(accounts, metals, marketRates);

    // Bank: 1000, Cash: 500, Metals: 5 * 1 * 100 = 500
    expect(result.total).toBe(2000);
  });

  it("handles zero-balance accounts", () => {
    const accounts = [
      createMockAccount({ balance: 0, type: "BANK" }),
      createMockAccount({ balance: 0, type: "CASH" }),
    ];

    const marketRates = createMockMarketRates();
    const result = calculateAssetBreakdown(accounts, [], marketRates);

    expect(result.bank).toBe(0);
    expect(result.cash).toBe(0);
    expect(result.total).toBe(0);
  });

  it("handles zero-weight metals", () => {
    const metals = [
      createMockAssetMetal({ weightGrams: 0, metalType: "GOLD" }),
    ];

    const marketRates = createMockMarketRates({ goldUsdPerGram: 90 });
    const result = calculateAssetBreakdown([], metals, marketRates);

    expect(result.metals).toBe(0);
    expect(result.total).toBe(0);
  });

  it("treats unknown account types as CASH (default case)", () => {
    const accounts = [
      { balance: 300, currency: "USD", type: "UNKNOWN_TYPE" },
    ] as unknown as Account[];

    const marketRates = createMockMarketRates();
    const result = calculateAssetBreakdown(accounts, [], marketRates);

    expect(result.cash).toBe(300);
    expect(result.bank).toBe(0);
    expect(result.wallet).toBe(0);
  });

  it("accumulates multiple accounts of the same type", () => {
    const accounts = [
      createMockAccount({ balance: 1000, type: "BANK" }),
      createMockAccount({ balance: 2000, type: "BANK" }),
      createMockAccount({ balance: 3000, type: "BANK" }),
    ];

    const marketRates = createMockMarketRates();
    const result = calculateAssetBreakdown(accounts, [], marketRates);

    expect(result.bank).toBe(6000);
  });
});

// =============================================================================
// calculateAssetBreakdownPercentages
// =============================================================================

describe("calculateAssetBreakdownPercentages", () => {
  it("returns correct percentages for a balanced breakdown", () => {
    const breakdown: AssetBreakdown = {
      bank: 500,
      cash: 300,
      metals: 200,
      wallet: 0,
      total: 1000,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ label: "Bank", value: 500, percentage: 50 });
    expect(result[1]).toEqual({ label: "Cash", value: 300, percentage: 30 });
    expect(result[2]).toEqual({ label: "Metals", value: 200, percentage: 20 });
  });

  it("returns all zeros when total is 0", () => {
    const breakdown: AssetBreakdown = {
      bank: 0,
      cash: 0,
      metals: 0,
      wallet: 0,
      total: 0,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);

    expect(result).toHaveLength(3);
    result.forEach((item) => {
      expect(item.value).toBe(0);
      expect(item.percentage).toBe(0);
    });
  });

  it("percentages always sum to exactly 100%", () => {
    const breakdown: AssetBreakdown = {
      bank: 333,
      cash: 333,
      metals: 334,
      wallet: 0,
      total: 1000,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);
    const sum = result.reduce((acc, item) => acc + item.percentage, 0);

    expect(sum).toBe(100);
  });

  it("uses largest remainder method so percentages sum to 100% with uneven splits", () => {
    // 1/3 each => 33.33% each => floor to 33, 33, 33 = 99 => remainder 1 distributed
    const breakdown: AssetBreakdown = {
      bank: 100,
      cash: 100,
      metals: 100,
      wallet: 0,
      total: 300,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);
    const sum = result.reduce((acc, item) => acc + item.percentage, 0);

    expect(sum).toBe(100);
    // Each should be either 33 or 34
    result.forEach((item) => {
      expect(item.percentage).toBeGreaterThanOrEqual(33);
      expect(item.percentage).toBeLessThanOrEqual(34);
    });
  });

  it("handles one category having 100% of the total", () => {
    const breakdown: AssetBreakdown = {
      bank: 5000,
      cash: 0,
      metals: 0,
      wallet: 0,
      total: 5000,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);
    const sum = result.reduce((acc, item) => acc + item.percentage, 0);

    expect(sum).toBe(100);
    expect(result[0]).toEqual({ label: "Bank", value: 5000, percentage: 100 });
    expect(result[1].percentage).toBe(0);
    expect(result[2].percentage).toBe(0);
  });

  it("handles very small values that round to 0% individually", () => {
    const breakdown: AssetBreakdown = {
      bank: 9990,
      cash: 5,
      metals: 5,
      wallet: 0,
      total: 10000,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);
    const sum = result.reduce((acc, item) => acc + item.percentage, 0);

    expect(sum).toBe(100);
  });

  it("returns labels in fixed order: Bank, Cash, Metals", () => {
    const breakdown: AssetBreakdown = {
      bank: 100,
      cash: 200,
      metals: 300,
      wallet: 0,
      total: 600,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);

    expect(result[0].label).toBe("Bank");
    expect(result[1].label).toBe("Cash");
    expect(result[2].label).toBe("Metals");
  });

  it("does not include wallet in the percentage output", () => {
    const breakdown: AssetBreakdown = {
      bank: 100,
      cash: 100,
      metals: 100,
      wallet: 1000,
      total: 1300,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);

    expect(result).toHaveLength(3);
    const labels = result.map((r) => r.label);
    expect(labels).not.toContain("Wallet");
  });

  it("handles extremely large values", () => {
    const breakdown: AssetBreakdown = {
      bank: 1_000_000_000,
      cash: 500_000_000,
      metals: 500_000_000,
      wallet: 0,
      total: 2_000_000_000,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);
    const sum = result.reduce((acc, item) => acc + item.percentage, 0);

    expect(sum).toBe(100);
    expect(result[0].percentage).toBe(50);
    expect(result[1].percentage).toBe(25);
    expect(result[2].percentage).toBe(25);
  });

  it("largest remainder distributes extra points to highest remainders first", () => {
    // bank: 50.6%, cash: 30.2%, metals: 19.2%
    // floor: 50 + 30 + 19 = 99, need 1 more
    // remainders: bank=0.6, cash=0.2, metals=0.2
    // bank gets the extra 1%
    const breakdown: AssetBreakdown = {
      bank: 506,
      cash: 302,
      metals: 192,
      wallet: 0,
      total: 1000,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);
    const sum = result.reduce((acc, item) => acc + item.percentage, 0);

    expect(sum).toBe(100);
    expect(result[0].percentage).toBe(51); // bank gets the extra point
    expect(result[1].percentage).toBe(30);
    expect(result[2].percentage).toBe(19);
  });

  it("preserves value fields unchanged", () => {
    const breakdown: AssetBreakdown = {
      bank: 1234.56,
      cash: 789.01,
      metals: 456.78,
      wallet: 100,
      total: 2580.35,
    };

    const result = calculateAssetBreakdownPercentages(breakdown);

    expect(result[0].value).toBe(1234.56);
    expect(result[1].value).toBe(789.01);
    expect(result[2].value).toBe(456.78);
  });
});
