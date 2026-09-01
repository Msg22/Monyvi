import {
  Account,
  Asset,
  AssetMetal,
  DailySnapshotNetWorth,
  database,
  type CurrencyType,
  type MarketRate,
} from "@monyvi/db";
import { Q, type Query } from "@nozbe/watermelondb";
import {
  calculateAccountsTotalBalance,
  calculateNetWorth,
  calculateTotalAssets,
  convertCurrency,
  getSameDayLastMonth,
  parseCanonicalDecimal,
  roundDecimal,
  serializeDecimal,
} from "@monyvi/logic";

import {
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";

export interface ObserveNetWorthAssetMetalsInput {
  readonly userId: string;
  readonly assets: readonly Asset[];
}

export interface BuildNetWorthReadModelInput {
  readonly accounts: readonly Account[];
  readonly assetMetals: readonly AssetMetal[];
  readonly latestRates: MarketRate | null;
  readonly preferredCurrency: CurrencyType;
}

export interface NetWorthReadModel {
  readonly totalNetWorth: number;
  readonly totalNetWorthUsd: number;
  readonly totalAccounts: number;
  readonly totalAssets: number;
}

export interface WealthBreakdownHolding {
  readonly currentValueDecimal: string | null;
  readonly isEffective: boolean;
  readonly isVisible: boolean;
  readonly metalType: "GOLD" | "SILVER";
  readonly status: "active" | "sold" | "disposed";
}

export interface BuildWealthBreakdownReadModelInput {
  readonly accountsValueDecimal: string;
  readonly currency: CurrencyType;
  readonly holdings: readonly WealthBreakdownHolding[];
}

export interface WealthBreakdownAmount {
  readonly amountDecimal: string | null;
  readonly shareOfNetWorth: string | null;
}

export interface WealthBreakdownMetalAmount {
  readonly amountDecimal: string | null;
  readonly holdingCount: number;
  readonly shareOfMetals: string | null;
}

export interface WealthBreakdownReadModel {
  readonly accounts: WealthBreakdownAmount;
  readonly metals: WealthBreakdownAmount & {
    readonly gold: WealthBreakdownMetalAmount;
    readonly silver: WealthBreakdownMetalAmount;
  };
  readonly totalNetWorthDecimal: string | null;
}

export function observeNetWorthAccounts(userId: string): Query<Account> {
  return queryOwned(
    database.get<Account>("accounts"),
    userId,
    Q.where("deleted", false)
  );
}

export function observeNetWorthAssets(userId: string): Query<Asset> {
  return queryOwned(
    database.get<Asset>("assets"),
    userId,
    Q.where("deleted", false)
  );
}

export function observeNetWorthAssetMetals(
  input: ObserveNetWorthAssetMetalsInput
): Query<AssetMetal> | null {
  if (input.assets.length === 0) {
    return null;
  }

  return queryChildrenOfOwnedParents(
    database.get<AssetMetal>("asset_metals"),
    input.assets,
    input.userId,
    "asset_id",
    Q.where("deleted", false)
  );
}

export function observeNetWorthSnapshots(
  userId: string
): Query<DailySnapshotNetWorth> {
  return queryOwned(
    database.get<DailySnapshotNetWorth>("daily_snapshot_net_worth"),
    userId,
    Q.sortBy("snapshot_date", Q.desc)
  );
}

export function buildNetWorthReadModel(
  input: BuildNetWorthReadModelInput
): NetWorthReadModel | null {
  if (!input.latestRates) {
    return null;
  }

  const totalAccountsUsd = calculateAccountsTotalBalance(
    [...input.accounts],
    input.latestRates
  );
  const totalAssetsUsd = calculateTotalAssets(
    [...input.assetMetals],
    input.latestRates
  );
  const totalAccounts = convertCurrency(
    totalAccountsUsd,
    "USD",
    input.preferredCurrency,
    input.latestRates
  );
  const totalAssets = convertCurrency(
    totalAssetsUsd,
    "USD",
    input.preferredCurrency,
    input.latestRates
  );
  const preferredNetWorth = calculateNetWorth(totalAccounts, totalAssets);

  return {
    totalNetWorth: preferredNetWorth.totalNetWorth,
    totalNetWorthUsd: convertCurrency(
      preferredNetWorth.totalNetWorth,
      input.preferredCurrency,
      "USD",
      input.latestRates
    ),
    totalAccounts: preferredNetWorth.totalAccounts,
    totalAssets: preferredNetWorth.totalAssets,
  };
}

export function buildWealthBreakdownReadModel(
  input: BuildWealthBreakdownReadModelInput
): WealthBreakdownReadModel {
  const activeHoldings = input.holdings.filter(isEffectiveVisibleActiveHolding);
  const goldHoldings = activeHoldings.filter(
    (holding) => holding.metalType === "GOLD"
  );
  const silverHoldings = activeHoldings.filter(
    (holding) => holding.metalType === "SILVER"
  );
  const accountsValue = parseAvailableDecimal(input.accountsValueDecimal);
  const goldValue = sumAvailableDecimals(goldHoldings);
  const silverValue = sumAvailableDecimals(silverHoldings);
  const metalsValue = sumAvailableDecimalStrings([goldValue, silverValue]);
  const totalNetWorth = sumAvailableDecimalStrings([
    accountsValue,
    metalsValue,
  ]);

  return {
    accounts: {
      amountDecimal: accountsValue,
      shareOfNetWorth: calculateDisplayedShare(accountsValue, totalNetWorth),
    },
    metals: {
      amountDecimal: metalsValue,
      shareOfNetWorth: calculateDisplayedShare(metalsValue, totalNetWorth),
      gold: {
        amountDecimal: goldValue,
        holdingCount: goldHoldings.length,
        shareOfMetals: calculateDisplayedShare(goldValue, metalsValue),
      },
      silver: {
        amountDecimal: silverValue,
        holdingCount: silverHoldings.length,
        shareOfMetals: calculateDisplayedShare(silverValue, metalsValue),
      },
    },
    totalNetWorthDecimal: totalNetWorth,
  };
}

export function buildMonthlyPercentageChange(
  snapshots: readonly DailySnapshotNetWorth[]
): number | null {
  if (snapshots.length === 0) {
    return null;
  }

  const currentSnapshot = snapshots[0];
  const previousSnapshot = findClosestSnapshot(
    snapshots,
    new Date(getSameDayLastMonth()).getTime()
  );

  if (!previousSnapshot || previousSnapshot.totalNetWorth === 0) {
    return null;
  }

  const change =
    ((currentSnapshot.totalNetWorth - previousSnapshot.totalNetWorth) /
      previousSnapshot.totalNetWorth) *
    100;

  return Math.round(change * 100) / 100;
}

function findClosestSnapshot(
  snapshots: readonly DailySnapshotNetWorth[],
  targetDateMs: number
): DailySnapshotNetWorth | null {
  let closest: DailySnapshotNetWorth | null = null;
  let smallestDiff = Infinity;

  for (const snapshot of snapshots) {
    const diff = Math.abs(snapshot.snapshotDate.getTime() - targetDateMs);

    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = snapshot;
    }
  }

  return closest;
}

function isEffectiveVisibleActiveHolding(
  holding: WealthBreakdownHolding
): boolean {
  return (
    holding.isEffective && holding.isVisible && holding.status === "active"
  );
}

function sumAvailableDecimals(
  holdings: readonly WealthBreakdownHolding[]
): string | null {
  return sumAvailableDecimalStrings(
    holdings.map((holding) => holding.currentValueDecimal)
  );
}

function sumAvailableDecimalStrings(
  values: readonly (string | null)[]
): string | null {
  let total = parseCanonicalDecimal("0");

  for (const value of values) {
    const decimal = value === null ? null : parseAvailableDecimal(value);
    if (decimal === null) {
      return null;
    }
    total = total.plus(decimal);
  }

  return serializeDecimal(total);
}

function parseAvailableDecimal(value: string): string | null {
  try {
    return serializeDecimal(parseCanonicalDecimal(value));
  } catch {
    return null;
  }
}

function calculateDisplayedShare(
  amountDecimal: string | null,
  totalDecimal: string | null
): string | null {
  if (amountDecimal === null || totalDecimal === null) {
    return null;
  }

  const total = parseCanonicalDecimal(totalDecimal);
  if (total.isZero()) {
    return "0";
  }

  const share = parseCanonicalDecimal(amountDecimal)
    .times("100")
    .dividedBy(total);
  return serializeDecimal(parseCanonicalDecimal(roundDecimal(share, 1)));
}
