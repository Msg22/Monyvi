/**
 * Asset Breakdown Calculation
 * Calculate the distribution of assets across Bank, Cash, and Metals
 * All values are computed in USD (universal base currency)
 */

import type { Account, AssetMetal, MarketRate } from "@monyvi/db";
import { convertCurrency } from "../utils/currency";
import { getMetalPriceUsd } from "../utils/metal";

export interface AssetBreakdown {
  bank: number;
  cash: number;
  metals: number;
  wallet: number;
  total: number;
}

export interface AssetBreakdownPercentage {
  label: string;
  value: number;
  percentage: number;
}

/**
 * Compute the portfolio breakdown (bank, cash, wallet, metals) with all values in USD.
 *
 * Converts each account balance from its native currency to USD using provided market rates,
 * aggregates balances by account type, converts metal holdings to USD using per-gram USD prices,
 * and computes the total as the sum of all categories.
 *
 * @param accounts - List of accounts whose balances will be converted and aggregated by type
 * @param assetMetals - List of metal holdings; each will be valued in USD per gram
 * @param marketRates - Market rate data used for currency conversion and metal pricing
 * @returns The computed AssetBreakdown containing `bank`, `cash`, `wallet`, `metals`, and `total`, all expressed in USD
 */
export function calculateAssetBreakdown(
  accounts: Account[],
  assetMetals: AssetMetal[],
  marketRates: MarketRate
): AssetBreakdown {
  const breakdown: AssetBreakdown = {
    bank: 0,
    cash: 0,
    metals: 0,
    wallet: 0,
    total: 0,
  };

  // Calculate account balances by type, converting to USD
  accounts.forEach((account) => {
    const balanceUsd = convertCurrency(
      account.balance,
      account.currency,
      "USD",
      marketRates
    );

    switch (account.type) {
      case "BANK":
        breakdown.bank += balanceUsd;
        break;
      case "DIGITAL_WALLET":
        breakdown.wallet += balanceUsd;
        break;
      case "CASH":
      default:
        breakdown.cash += balanceUsd;
        break;
    }
  });

  // Calculate metals value (already in USD per gram)
  assetMetals.forEach((metal) => {
    const pricePerGram = getMetalPriceUsd(metal.metalType, marketRates);
    breakdown.metals += metal.calculateValue(pricePerGram);
  });

  // Total = bank + cash + wallet + metals
  breakdown.total =
    breakdown.bank + breakdown.cash + breakdown.wallet + breakdown.metals;

  return breakdown;
}

/**
 * Calculate asset breakdown as percentages for display.
 * Uses the "largest remainder" method to ensure percentages always sum to 100%.
 * Returns Bank, Cash, Metals (wallet included in total but not displayed).
 */
export function calculateAssetBreakdownPercentages(
  breakdown: AssetBreakdown
): AssetBreakdownPercentage[] {
  const { bank, cash, metals } = breakdown;

  // Use the sum of displayed categories (excludes wallet) so percentages sum to 100%
  const displayedTotal = bank + cash + metals;

  if (displayedTotal === 0) {
    return [
      { label: "Bank", value: 0, percentage: 0 },
      { label: "Cash", value: 0, percentage: 0 },
      { label: "Metals", value: 0, percentage: 0 },
    ];
  }

  // Largest remainder method: floor all percentages, then distribute remaining
  // points to items with the largest fractional remainders
  const items = [
    { label: "Bank", value: bank, rawPct: (bank / displayedTotal) * 100 },
    { label: "Cash", value: cash, rawPct: (cash / displayedTotal) * 100 },
    { label: "Metals", value: metals, rawPct: (metals / displayedTotal) * 100 },
  ];

  const floored = items.map((item) => ({
    ...item,
    percentage: Math.floor(item.rawPct),
    remainder: item.rawPct - Math.floor(item.rawPct),
  }));

  let remaining = 100 - floored.reduce((sum, item) => sum + item.percentage, 0);

  // Sort by remainder descending, distribute 1% to each until remaining is 0
  // Uses immutable map to avoid mutating floored items
  const sorted = [...floored].sort((a, b) => b.remainder - a.remainder);
  const adjusted = sorted.map((item) => {
    if (remaining <= 0) return item;
    remaining -= 1;
    return { ...item, percentage: item.percentage + 1 };
  });

  // Return in original order (Bank, Cash, Metals)
  return items.map((original) => {
    const matched = adjusted.find((f) => f.label === original.label);
    if (!matched) {
      throw new Error(
        `Invariant violation: missing floored percentage for label "${original.label}"`
      );
    }
    return {
      label: matched.label,
      value: matched.value,
      percentage: matched.percentage,
    };
  });
}
