/**
 * Unit tests for accounts calculation functions.
 *
 * Covers:
 * - calculateAccountsTotalBalance: happy path, empty arrays, single account,
 *   mixed currencies, same currency, zero balances, negative balances,
 *   currency conversion edge cases (missing rates, NaN rates)
 *
 * @module accounts-calculations.test
 */

import { calculateAccountsTotalBalance } from "../accounts-calculations";
import type { Account, MarketRate, CurrencyType } from "@monyvi/db";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Creates a minimal mock Account with only the fields needed by
 * calculateAccountsTotalBalance.
 */
function createMockAccount(balance: number, currency: CurrencyType): Account {
  return { balance, currency } as unknown as Account;
}

function createMockRates(overrides: Partial<MarketRate> = {}): MarketRate {
  return overrides as MarketRate;
}

/** Standard rates: 1 EGP = ~0.02 USD, 1 EUR = ~1.08 USD, 1 GBP = ~1.27 USD */
const standardRates = createMockRates({
  egpUsd: 1 / 49.7,
  eurUsd: 1.08,
  gbpUsd: 1.27,
  sarUsd: 1 / 3.75,
});

/** Rates that return NaN for cross-currency */
const nanRates = createMockRates({ egpUsd: Number.NaN, eurUsd: Number.NaN });

/** Rates that return Infinity for cross-currency */
const infinityRates = createMockRates({
  egpUsd: Number.POSITIVE_INFINITY,
});

// =============================================================================
// calculateAccountsTotalBalance
// =============================================================================

describe("calculateAccountsTotalBalance", () => {
  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it("should return the total balance in USD for multiple accounts in different currencies", () => {
    const accounts = [
      createMockAccount(1000, "USD"),
      createMockAccount(49700, "EGP"), // ~1000 USD
      createMockAccount(500, "EUR"), // ~540 USD
    ];

    const result = calculateAccountsTotalBalance(accounts, standardRates);

    // 1000 + (49700 * 1/49.7) + (500 * 1.08) = 1000 + 1000 + 540 = 2540
    expect(result).toBeCloseTo(2540, 0);
  });

  it("should convert a single non-USD account to USD correctly", () => {
    const accounts = [createMockAccount(100, "EUR")];

    const result = calculateAccountsTotalBalance(accounts, standardRates);

    // 100 * 1.08 = 108
    expect(result).toBeCloseTo(108, 1);
  });

  // ---------------------------------------------------------------------------
  // Empty array
  // ---------------------------------------------------------------------------

  it("should return 0 for an empty accounts array", () => {
    const result = calculateAccountsTotalBalance([], standardRates);

    expect(result).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Single item
  // ---------------------------------------------------------------------------

  it("should return the USD balance unchanged for a single USD account", () => {
    const accounts = [createMockAccount(2500, "USD")];

    const result = calculateAccountsTotalBalance(accounts, standardRates);

    expect(result).toBe(2500);
  });

  // ---------------------------------------------------------------------------
  // Same currency (no conversion needed)
  // ---------------------------------------------------------------------------

  describe("same currency accounts", () => {
    it("should sum balances without conversion when all accounts are USD", () => {
      const accounts = [
        createMockAccount(1000, "USD"),
        createMockAccount(2000, "USD"),
        createMockAccount(3000, "USD"),
      ];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBe(6000);
    });

    it("should convert and sum when all accounts are in the same non-USD currency", () => {
      const accounts = [
        createMockAccount(1000, "EGP"),
        createMockAccount(2000, "EGP"),
      ];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      // (1000 + 2000) * (1/49.7) = 3000/49.7 ~= 60.36
      expect(result).toBeCloseTo(3000 / 49.7, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Zero balances
  // ---------------------------------------------------------------------------

  describe("zero balances", () => {
    it("should return 0 when all accounts have zero balance", () => {
      const accounts = [
        createMockAccount(0, "USD"),
        createMockAccount(0, "EGP"),
        createMockAccount(0, "EUR"),
      ];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBe(0);
    });

    it("should ignore zero-balance accounts in the total", () => {
      const accounts = [
        createMockAccount(500, "USD"),
        createMockAccount(0, "EGP"),
      ];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Negative balances (overdraft / debt)
  // ---------------------------------------------------------------------------

  describe("negative balances", () => {
    it("should handle negative balances correctly", () => {
      const accounts = [createMockAccount(-500, "USD")];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBe(-500);
    });

    it("should correctly net positive and negative balances", () => {
      const accounts = [
        createMockAccount(1000, "USD"),
        createMockAccount(-300, "USD"),
      ];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBe(700);
    });

    it("should convert negative non-USD balances properly", () => {
      const accounts = [createMockAccount(-100, "EUR")];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      // -100 * 1.08 = -108
      expect(result).toBeCloseTo(-108, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Currency conversion edge cases
  // ---------------------------------------------------------------------------

  describe("currency conversion edge cases", () => {
    it("should fail the whole calculation when a rate is NaN", () => {
      const accounts = [
        createMockAccount(1000, "EGP"),
        createMockAccount(500, "EUR"),
      ];

      expect(() => calculateAccountsTotalBalance(accounts, nanRates)).toThrow(
        "Invalid USD market rate"
      );
    });

    it("should fail the whole calculation when a rate is Infinity", () => {
      const accounts = [createMockAccount(1000, "EGP")];

      expect(() =>
        calculateAccountsTotalBalance(accounts, infinityRates)
      ).toThrow("Invalid USD market rate for EGP");
    });

    it("should fail instead of returning a partial total for a missing currency rate", () => {
      const failingRates = createMockRates({ egpUsd: 1 / 49.7 });

      const accounts = [
        createMockAccount(1000, "EGP"), // known rate
        createMockAccount(500, "KWD"), // unknown rate -> 0
      ];

      expect(() =>
        calculateAccountsTotalBalance(accounts, failingRates)
      ).toThrow("Invalid USD market rate for KWD");
    });
  });

  // ---------------------------------------------------------------------------
  // Large account sets
  // ---------------------------------------------------------------------------

  describe("large account sets", () => {
    it("should handle many accounts without precision issues", () => {
      const accounts = Array.from({ length: 100 }, () =>
        createMockAccount(100, "USD")
      );

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBe(10000);
    });
  });

  // ---------------------------------------------------------------------------
  // Fractional balances
  // ---------------------------------------------------------------------------

  describe("fractional balances", () => {
    it("should handle fractional cent amounts", () => {
      const accounts = [
        createMockAccount(100.505, "USD"),
        createMockAccount(200.123, "USD"),
      ];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBeCloseTo(300.628, 3);
    });

    it("should handle very small fractional balances", () => {
      const accounts = [createMockAccount(0.01, "USD")];

      const result = calculateAccountsTotalBalance(accounts, standardRates);

      expect(result).toBeCloseTo(0.01, 5);
    });
  });
});
