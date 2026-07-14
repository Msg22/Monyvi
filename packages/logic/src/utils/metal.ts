import type { CurrencyType, MarketRate, MetalType } from "@monyvi/db";
import { convertCurrency } from "./currency";

/**
 * Error thrown when a metal's market price is unavailable (null, NaN, Infinity).
 * Callers can use `instanceof` to selectively catch this vs unexpected errors.
 */
export class MetalPriceUnavailableError extends Error {
  constructor(metalType: MetalType, rawValue: unknown) {
    super(
      `Metal price unavailable for ${metalType}: expected a positive finite number, got ${String(rawValue)}`
    );
    this.name = "MetalPriceUnavailableError";
  }
}

/**
 * Retrieve the current price per gram for a specified metal in USD.
 *
 * @param marketRates - Market rates object containing USD-per-gram prices for supported metals
 * @returns The price in USD per gram for the given metal, or `0` if the metal type is unrecognized
 */
export function getMetalPriceUsd(
  metalType: MetalType,
  marketRates: NonNullable<MarketRate>
): number {
  let price: number;
  switch (metalType) {
    case "GOLD":
      price = marketRates.goldUsdPerGram;
      break;
    case "SILVER":
      price = marketRates.silverUsdPerGram;
      break;
    case "PLATINUM":
      price = marketRates.platinumUsdPerGram;
      break;
    case "PALLADIUM":
      price = marketRates.palladiumUsdPerGram;
      break;
    default:
      throw new MetalPriceUnavailableError(metalType, undefined);
  }
  // Fail explicitly when rate data is missing — callers should handle the error
  // rather than silently propagating a zero price through net worth calculations.
  if (!Number.isFinite(price) || price <= 0) {
    throw new MetalPriceUnavailableError(metalType, price);
  }
  return price;
}

/**
 * Retrieve the current price per gram for a metal in the specified currency.
 *
 * @param metalType - The metal to get the price for
 * @param marketRates - Market rate data containing USD-per-gram prices
 * @param targetCurrency - Currency to return the price in (defaults to "USD")
 * @returns Price per gram expressed in `targetCurrency`
 */
export function getMetalPrice(
  metalType: MetalType,
  marketRates: NonNullable<MarketRate>,
  targetCurrency: CurrencyType = "USD"
): number {
  const priceUsd = getMetalPriceUsd(metalType, marketRates);
  if (targetCurrency === "USD") return priceUsd;
  return convertCurrency(priceUsd, "USD", targetCurrency, marketRates);
}

/**
 * Calculate the gold price for a specific purity (karat) level.
 *
 * Derives sub-24K prices by multiplying the pure (24K) gold price
 * by the purity fraction (e.g., 21K = 24K × 0.875, 18K = 24K × 0.75).
 *
 * @param purityFraction - The purity as a fraction of pure gold (e.g., 0.875 for 21K)
 * @param marketRates - Market rate data containing the 24K gold USD price
 * @param targetCurrency - Currency to return the price in (defaults to "USD")
 * @returns Price per gram for the given purity, expressed in `targetCurrency`
 */
export function getGoldPurityPrice(
  purityFraction: number,
  marketRates: NonNullable<MarketRate>,
  targetCurrency: CurrencyType = "USD"
): number {
  if (purityFraction < 0 || purityFraction > 1) {
    throw new RangeError("purityFraction must be between 0 and 1");
  }
  const pure24kPrice = getMetalPrice("GOLD", marketRates, targetCurrency);
  return pure24kPrice * purityFraction;
}
