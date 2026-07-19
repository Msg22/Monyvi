/**
 * Unit tests for metal price utilities.
 *
 * Covers:
 * - getMetalPriceUsd: all metal types, undefined/NaN guard, zero values, unknown type
 * - getMetalPrice: USD passthrough, currency conversion delegation
 * - getGoldPurityPrice: purity fraction scaling, boundary validation
 *
 * @module metal.test
 */

import { getMetalPriceUsd, getMetalPrice, getGoldPurityPrice } from "../metal";
import { convertCurrency } from "../currency";
import type { MarketRate, MetalType } from "@monyvi/db";

// =============================================================================
// MOCKS
// =============================================================================

jest.mock("../currency", () => ({
  convertCurrency: jest.fn(),
}));

const mockedConvertCurrency = convertCurrency as jest.MockedFunction<
  typeof convertCurrency
>;

/**
 * Factory to create a mock MarketRate with configurable metal prices.
 * Only the fields consumed by getMetalPriceUsd are populated.
 */
function createMockRates(
  overrides: Partial<{
    goldUsdPerGram: number;
    silverUsdPerGram: number;
    platinumUsdPerGram: number;
    palladiumUsdPerGram: number;
  }> = {}
): NonNullable<MarketRate> {
  return {
    goldUsdPerGram: 85.5,
    silverUsdPerGram: 1.05,
    platinumUsdPerGram: 32.0,
    palladiumUsdPerGram: 30.5,
    ...overrides,
  } as unknown as NonNullable<MarketRate>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =============================================================================
// getMetalPriceUsd
// =============================================================================

describe("getMetalPriceUsd", () => {
  it("returns the gold price per gram", () => {
    const rates = createMockRates({ goldUsdPerGram: 85.5 });
    expect(getMetalPriceUsd("GOLD", rates)).toBe(85.5);
  });

  it("returns the silver price per gram", () => {
    const rates = createMockRates({ silverUsdPerGram: 1.05 });
    expect(getMetalPriceUsd("SILVER", rates)).toBe(1.05);
  });

  it("returns the platinum price per gram", () => {
    const rates = createMockRates({ platinumUsdPerGram: 32.0 });
    expect(getMetalPriceUsd("PLATINUM", rates)).toBe(32.0);
  });

  it("returns the palladium price per gram", () => {
    const rates = createMockRates({ palladiumUsdPerGram: 30.5 });
    expect(getMetalPriceUsd("PALLADIUM", rates)).toBe(30.5);
  });

  it("throws for an unrecognized metal type", () => {
    const rates = createMockRates();
    expect(() => getMetalPriceUsd("COPPER" as MetalType, rates)).toThrow(
      "Metal price unavailable for COPPER"
    );
  });

  // -------------------------------------------------------------------------
  // Throws on invalid price data — callers must handle the error
  // -------------------------------------------------------------------------

  it("throws when goldUsdPerGram is undefined", () => {
    const rates = createMockRates({
      goldUsdPerGram: undefined as unknown as number,
    });
    expect(() => getMetalPriceUsd("GOLD", rates)).toThrow(
      "Metal price unavailable for GOLD"
    );
  });

  it("throws when silverUsdPerGram is undefined", () => {
    const rates = createMockRates({
      silverUsdPerGram: undefined as unknown as number,
    });
    expect(() => getMetalPriceUsd("SILVER", rates)).toThrow(
      "Metal price unavailable for SILVER"
    );
  });

  it("throws when platinumUsdPerGram is undefined", () => {
    const rates = createMockRates({
      platinumUsdPerGram: undefined as unknown as number,
    });
    expect(() => getMetalPriceUsd("PLATINUM", rates)).toThrow(
      "Metal price unavailable for PLATINUM"
    );
  });

  it("throws when palladiumUsdPerGram is undefined", () => {
    const rates = createMockRates({
      palladiumUsdPerGram: undefined as unknown as number,
    });
    expect(() => getMetalPriceUsd("PALLADIUM", rates)).toThrow(
      "Metal price unavailable for PALLADIUM"
    );
  });

  it("throws when the price field is NaN", () => {
    const rates = createMockRates({ goldUsdPerGram: NaN });
    expect(() => getMetalPriceUsd("GOLD", rates)).toThrow(
      "Metal price unavailable for GOLD"
    );
  });

  it("throws when the price field is Infinity", () => {
    const rates = createMockRates({ silverUsdPerGram: Infinity });
    expect(() => getMetalPriceUsd("SILVER", rates)).toThrow(
      "Metal price unavailable for SILVER"
    );
  });

  it("throws when the price field is -Infinity", () => {
    const rates = createMockRates({ platinumUsdPerGram: -Infinity });
    expect(() => getMetalPriceUsd("PLATINUM", rates)).toThrow(
      "Metal price unavailable for PLATINUM"
    );
  });

  // -------------------------------------------------------------------------
  // Zero and boundary values
  // -------------------------------------------------------------------------

  it("throws when the price is explicitly zero", () => {
    const rates = createMockRates({ goldUsdPerGram: 0 });
    expect(() => getMetalPriceUsd("GOLD", rates)).toThrow(
      "Metal price unavailable for GOLD"
    );
  });

  it("handles very small fractional prices", () => {
    const rates = createMockRates({ silverUsdPerGram: 0.0001 });
    expect(getMetalPriceUsd("SILVER", rates)).toBe(0.0001);
  });

  it("handles very large prices", () => {
    const rates = createMockRates({ goldUsdPerGram: 999_999.99 });
    expect(getMetalPriceUsd("GOLD", rates)).toBe(999_999.99);
  });

  it("throws for negative prices", () => {
    const rates = createMockRates({ palladiumUsdPerGram: -5 });
    expect(() => getMetalPriceUsd("PALLADIUM", rates)).toThrow(
      "Metal price unavailable for PALLADIUM"
    );
  });
});

// =============================================================================
// getMetalPrice
// =============================================================================

describe("getMetalPrice", () => {
  it("returns the USD price directly when targetCurrency is USD", () => {
    const rates = createMockRates({ goldUsdPerGram: 85.5 });
    expect(getMetalPrice("GOLD", rates, "USD")).toBe(85.5);
    expect(mockedConvertCurrency).not.toHaveBeenCalled();
  });

  it("defaults to USD when no targetCurrency is provided", () => {
    const rates = createMockRates({ silverUsdPerGram: 1.05 });
    expect(getMetalPrice("SILVER", rates)).toBe(1.05);
    expect(mockedConvertCurrency).not.toHaveBeenCalled();
  });

  it("delegates to convertCurrency for non-USD currencies", () => {
    const rates = createMockRates({ goldUsdPerGram: 85.5 });
    mockedConvertCurrency.mockReturnValue(4275.0);

    const result = getMetalPrice("GOLD", rates, "EGP");

    expect(result).toBe(4275.0);
    expect(mockedConvertCurrency).toHaveBeenCalledWith(
      85.5,
      "USD",
      "EGP",
      rates
    );
  });

  it("throws when the USD price is unavailable (undefined)", () => {
    const rates = createMockRates({
      goldUsdPerGram: undefined as unknown as number,
    });

    expect(() => getMetalPrice("GOLD", rates, "EGP")).toThrow(
      "Metal price unavailable for GOLD"
    );
    expect(mockedConvertCurrency).not.toHaveBeenCalled();
  });

  it("converts all metal types to a non-USD currency", () => {
    const rates = createMockRates();
    mockedConvertCurrency.mockReturnValue(100);

    const metals: MetalType[] = ["GOLD", "SILVER", "PLATINUM", "PALLADIUM"];
    for (const metal of metals) {
      const result = getMetalPrice(metal, rates, "SAR");
      expect(result).toBe(100);
    }
    expect(mockedConvertCurrency).toHaveBeenCalledTimes(4);
  });
});

// =============================================================================
// getGoldPurityPrice
// =============================================================================

describe("getGoldPurityPrice", () => {
  it("returns the full 24K price when purityFraction is 1.0", () => {
    const rates = createMockRates({ goldUsdPerGram: 85.5 });
    expect(getGoldPurityPrice(1.0, rates, "USD")).toBe(85.5);
  });

  it("scales by purity fraction for 21K gold (0.875)", () => {
    const rates = createMockRates({ goldUsdPerGram: 80.0 });
    expect(getGoldPurityPrice(0.875, rates, "USD")).toBeCloseTo(70.0, 5);
  });

  it("scales by purity fraction for 18K gold (0.75)", () => {
    const rates = createMockRates({ goldUsdPerGram: 100.0 });
    expect(getGoldPurityPrice(0.75, rates, "USD")).toBeCloseTo(75.0, 5);
  });

  it("returns 0 when purityFraction is 0", () => {
    const rates = createMockRates({ goldUsdPerGram: 85.5 });
    expect(getGoldPurityPrice(0, rates, "USD")).toBe(0);
  });

  it("defaults targetCurrency to USD", () => {
    const rates = createMockRates({ goldUsdPerGram: 85.5 });
    expect(getGoldPurityPrice(1.0, rates)).toBe(85.5);
  });

  it("converts to a non-USD currency before applying purity", () => {
    const rates = createMockRates({ goldUsdPerGram: 85.5 });
    mockedConvertCurrency.mockReturnValue(4275.0);

    const result = getGoldPurityPrice(0.875, rates, "EGP");

    // 4275.0 (EGP 24K) * 0.875 = 3740.625
    expect(result).toBeCloseTo(3740.625, 5);
  });

  // -------------------------------------------------------------------------
  // Boundary validation
  // -------------------------------------------------------------------------

  it("throws RangeError when purityFraction is greater than 1", () => {
    const rates = createMockRates();
    expect(() => getGoldPurityPrice(1.01, rates)).toThrow(RangeError);
    expect(() => getGoldPurityPrice(1.01, rates)).toThrow(
      "purityFraction must be between 0 and 1"
    );
  });

  it("throws RangeError when purityFraction is negative", () => {
    const rates = createMockRates();
    expect(() => getGoldPurityPrice(-0.1, rates)).toThrow(RangeError);
    expect(() => getGoldPurityPrice(-0.1, rates)).toThrow(
      "purityFraction must be between 0 and 1"
    );
  });

  it("does not throw for boundary value 0", () => {
    const rates = createMockRates();
    expect(() => getGoldPurityPrice(0, rates)).not.toThrow();
  });

  it("does not throw for boundary value 1", () => {
    const rates = createMockRates();
    expect(() => getGoldPurityPrice(1, rates)).not.toThrow();
  });
});
