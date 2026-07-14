/**
 * Unit tests for assets calculation functions.
 *
 * Covers:
 * - calculateTotalAssets: happy path, empty arrays, single asset,
 *   mixed metal types, zero weight, zero purity, missing market rates
 *   (null / non-finite values), unsupported metal types, and
 *   MetalPriceUnavailableError swallowing for partial availability.
 *
 * @module assets-calculations.test
 */

import { calculateTotalAssets } from "../assets-calculations";
import { MetalPriceUnavailableError } from "../../utils/metal";
import type { AssetMetal, MarketRate, MetalType } from "@monyvi/db";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Creates a minimal mock AssetMetal. `calculateValue` uses the standard
 * formula `weight × purityFraction × pricePerGram` (the same one
 * implemented in the real model).
 */
function createMockAssetMetal(
  metalType: MetalType,
  weightGrams: number,
  purityFraction: number
): AssetMetal {
  return {
    metalType,
    weightGrams,
    purityFraction,
    calculateValue: (pricePerGram: number): number =>
      weightGrams * purityFraction * pricePerGram,
  } as unknown as AssetMetal;
}

/**
 * Creates a mock MarketRate with configurable per-gram USD prices.
 * Passing `undefined` (or omitting a field) yields `undefined` so we can
 * test the "missing price" path.
 */
function createMockRates(overrides: {
  gold?: number | null | undefined;
  silver?: number | null | undefined;
  platinum?: number | null | undefined;
  palladium?: number | null | undefined;
}): MarketRate {
  return {
    goldUsdPerGram: overrides.gold ?? undefined,
    silverUsdPerGram: overrides.silver ?? undefined,
    platinumUsdPerGram: overrides.platinum ?? undefined,
    palladiumUsdPerGram: overrides.palladium ?? undefined,
  } as unknown as MarketRate;
}

/** Standard rates: realistic USD per gram prices for all four metals. */
const standardRates = createMockRates({
  gold: 77, // ~$77/g
  silver: 0.95, // ~$0.95/g
  platinum: 30, // ~$30/g
  palladium: 35, // ~$35/g
});

// =============================================================================
// Tests
// =============================================================================

describe("calculateTotalAssets", () => {
  describe("happy path", () => {
    it("should return 0 for an empty asset list", () => {
      const result = calculateTotalAssets([], standardRates);
      expect(result).toBe(0);
    });

    it("should compute value for a single gold holding (10g pure 24K)", () => {
      // 10g × 1.0 × $77 = $770
      const assets = [createMockAssetMetal("GOLD", 10, 1.0)];
      const result = calculateTotalAssets(assets, standardRates);
      expect(result).toBeCloseTo(770);
    });

    it("should compute value for 21K gold using purity fraction", () => {
      // 10g × 0.875 (21/24) × $77 = $673.75
      const assets = [createMockAssetMetal("GOLD", 10, 0.875)];
      const result = calculateTotalAssets(assets, standardRates);
      expect(result).toBeCloseTo(673.75);
    });

    it("should sum multiple holdings across different metals", () => {
      const assets = [
        createMockAssetMetal("GOLD", 10, 1.0), // 770
        createMockAssetMetal("SILVER", 100, 0.925), // 100 × 0.925 × 0.95 = 87.875
        createMockAssetMetal("PLATINUM", 5, 0.95), // 5 × 0.95 × 30 = 142.5
        createMockAssetMetal("PALLADIUM", 2, 0.999), // 2 × 0.999 × 35 = 69.93
      ];
      const result = calculateTotalAssets(assets, standardRates);
      expect(result).toBeCloseTo(770 + 87.875 + 142.5 + 69.93);
    });

    it("should sum multiple holdings of the same metal type", () => {
      const assets = [
        createMockAssetMetal("GOLD", 10, 1.0), // 770
        createMockAssetMetal("GOLD", 5, 0.875), // 5 × 0.875 × 77 = 336.875
        createMockAssetMetal("GOLD", 20, 0.75), // 20 × 0.75 × 77 = 1155
      ];
      const result = calculateTotalAssets(assets, standardRates);
      expect(result).toBeCloseTo(770 + 336.875 + 1155);
    });
  });

  describe("zero / empty inputs", () => {
    it("should return 0 when all holdings have zero weight", () => {
      const assets = [
        createMockAssetMetal("GOLD", 0, 1.0),
        createMockAssetMetal("SILVER", 0, 0.925),
      ];
      const result = calculateTotalAssets(assets, standardRates);
      expect(result).toBe(0);
    });

    it("should return 0 when all holdings have zero purity", () => {
      const assets = [
        createMockAssetMetal("GOLD", 10, 0),
        createMockAssetMetal("SILVER", 5, 0),
      ];
      const result = calculateTotalAssets(assets, standardRates);
      expect(result).toBe(0);
    });

    it("should handle very small fractional weights", () => {
      // 0.001g × 1.0 × $77 = $0.077
      const assets = [createMockAssetMetal("GOLD", 0.001, 1.0)];
      const result = calculateTotalAssets(assets, standardRates);
      expect(result).toBeCloseTo(0.077);
    });
  });

  describe("null / missing market rates", () => {
    it("should fail loudly when marketRates is null", () => {
      const assets = [createMockAssetMetal("GOLD", 10, 1.0)];
      // @ts-expect-error — testing runtime guard for null input
      expect(() => calculateTotalAssets(assets, null)).toThrow();
    });

    it("should fail when a metal price is undefined", () => {
      // Gold has no price → its entry contributes 0 but silver still contributes.
      const rates = createMockRates({ silver: 0.95 /* gold undefined */ });
      const assets = [
        createMockAssetMetal("GOLD", 10, 1.0), // skipped
        createMockAssetMetal("SILVER", 100, 0.925), // 87.875
      ];
      expect(() => calculateTotalAssets(assets, rates)).toThrow(
        "Metal price unavailable for GOLD"
      );
    });

    it("should fail when a metal price is NaN", () => {
      const rates = createMockRates({
        gold: Number.NaN,
        silver: 0.95,
      });
      const assets = [
        createMockAssetMetal("GOLD", 10, 1.0), // skipped
        createMockAssetMetal("SILVER", 100, 0.925), // 87.875
      ];
      expect(() => calculateTotalAssets(assets, rates)).toThrow(
        "Metal price unavailable for GOLD"
      );
    });

    it("should fail when a metal price is Infinity", () => {
      const rates = createMockRates({
        gold: Number.POSITIVE_INFINITY,
        silver: 0.95,
      });
      const assets = [
        createMockAssetMetal("GOLD", 10, 1.0),
        createMockAssetMetal("SILVER", 100, 0.925),
      ];
      expect(() => calculateTotalAssets(assets, rates)).toThrow(
        "Metal price unavailable for GOLD"
      );
    });

    it("should fail when every metal price is unavailable", () => {
      const rates = createMockRates({}); // all undefined
      const assets = [
        createMockAssetMetal("GOLD", 10, 1.0),
        createMockAssetMetal("SILVER", 100, 0.925),
        createMockAssetMetal("PLATINUM", 5, 0.95),
      ];
      expect(() => calculateTotalAssets(assets, rates)).toThrow(
        "Metal price unavailable for GOLD"
      );
    });

    it("should catch MetalPriceUnavailableError specifically and re-throw other errors", () => {
      // Sanity check: the error class is exported so callers can identify it.
      expect(MetalPriceUnavailableError).toBeDefined();

      // Simulate a holding whose calculateValue throws a non-price error.
      const throwingAsset = {
        metalType: "GOLD",
        weightGrams: 10,
        purityFraction: 1.0,
        calculateValue: () => {
          throw new Error("Unexpected bug in model");
        },
      } as unknown as AssetMetal;

      expect(() =>
        calculateTotalAssets([throwingAsset], standardRates)
      ).toThrow("Unexpected bug in model");
    });
  });

  describe("unsupported metal types", () => {
    it("should fail for an unknown metal type", () => {
      // getMetalPriceUsd returns 0 for unknown types (not an error), so the
      // asset simply evaluates to 0 without affecting other holdings.
      const unknownMetal = createMockAssetMetal(
        "UNOBTAINIUM" as MetalType,
        10,
        1.0
      );
      const assets = [
        unknownMetal,
        createMockAssetMetal("SILVER", 100, 0.925), // 87.875
      ];
      expect(() => calculateTotalAssets(assets, standardRates)).toThrow(
        "Metal price unavailable for UNOBTAINIUM"
      );
    });
  });

  describe("precision", () => {
    it("should produce deterministic results regardless of holding order", () => {
      const orderA = [
        createMockAssetMetal("GOLD", 10, 1.0),
        createMockAssetMetal("SILVER", 100, 0.925),
        createMockAssetMetal("PLATINUM", 5, 0.95),
      ];
      const orderB = [...orderA].reverse();
      const resultA = calculateTotalAssets(orderA, standardRates);
      const resultB = calculateTotalAssets(orderB, standardRates);
      expect(resultA).toBeCloseTo(resultB);
    });

    it("should return a finite number even with many holdings", () => {
      const assets = Array.from({ length: 500 }, () =>
        createMockAssetMetal("GOLD", 1, 0.875)
      );
      const result = calculateTotalAssets(assets, standardRates);
      expect(Number.isFinite(result)).toBe(true);
      // 500 × 1 × 0.875 × 77 = 33687.5
      expect(result).toBeCloseTo(33687.5);
    });
  });
});
