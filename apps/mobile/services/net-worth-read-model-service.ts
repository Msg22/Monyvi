import {
  database,
  type Account,
  type Asset,
  type AssetMetal,
  type CurrencyType,
  type DailySnapshotNetWorth,
} from "@monyvi/db";
import { Q, type Query } from "@nozbe/watermelondb";
import {
  convertCurrentAmountExact,
  getMetalUsdPerPureGramDecimal,
  getSameDayLastMonth,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  roundDecimal,
  serializeDecimal,
  type MetalsIsoCurrencyCode,
} from "@monyvi/logic";

import type { SelectedMarketRateSnapshot } from "@/services/market-rate-snapshot-read-model-service";

import {
  queryChildrenOfOwnedParents,
  queryOwned,
} from "@/services/user-data-access";

export interface NetWorthOwnedAssetInput {
  readonly id: string;
  readonly userId: string;
}

export interface ObserveNetWorthAssetMetalsInput {
  readonly userId: string;
  readonly assets: readonly NetWorthOwnedAssetInput[];
}

export interface NetWorthAccountInput {
  readonly balance: number;
  readonly currency: CurrencyType;
}

export interface NetWorthAssetMetalInput {
  readonly metalType: string;
  readonly purityFactorDecimal: string | null;
  readonly purityFraction?: number;
  readonly weightGrams?: number;
  readonly weightGramsDecimal: string | null;
}

export interface NetWorthSnapshotInput {
  readonly snapshotDate: Date;
  readonly totalNetWorth: number;
}

export interface BuildNetWorthReadModelInput {
  readonly accounts: readonly NetWorthAccountInput[];
  readonly assetMetals: readonly NetWorthAssetMetalInput[];
  readonly currentSnapshot: SelectedMarketRateSnapshot | null;
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
  readonly preferredCurrencyUsdPerUnitDecimal?: string | null;
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
  readonly totalNetWorthUsdDecimal?: string | null;
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
  const { currentSnapshot } = input;
  if (!currentSnapshot) {
    return null;
  }
  if (!isSupportedMetalsIsoCurrencyCode(input.preferredCurrency)) {
    return null;
  }
  const preferredCurrency: MetalsIsoCurrencyCode = input.preferredCurrency;

  const rates = currentSnapshot.ratesByInstrument;
  let totalAccountsUsd = parseCanonicalDecimal("0");
  for (const account of input.accounts) {
    if (!isSupportedMetalsIsoCurrencyCode(account.currency)) {
      return null;
    }
    const inUsd = convertCurrentAmountExact({
      amountDecimal: String(account.balance),
      fromCurrency: account.currency,
      toCurrency: "USD",
      rates,
    });
    if (!inUsd.available) {
      return null;
    }
    totalAccountsUsd = totalAccountsUsd.plus(inUsd.value);
  }

  let totalAssetsUsd = parseCanonicalDecimal("0");
  for (const metal of input.assetMetals) {
    if (metal.metalType !== "GOLD" && metal.metalType !== "SILVER") {
      return null;
    }
    const metalUsdPerGram = getMetalUsdPerPureGramDecimal(
      rates,
      metal.metalType
    );
    if (
      metalUsdPerGram === null ||
      metal.weightGramsDecimal === null ||
      metal.purityFactorDecimal === null
    ) {
      return null;
    }
    try {
      totalAssetsUsd = totalAssetsUsd.plus(
        parseCanonicalDecimal(metal.weightGramsDecimal)
          .times(metal.purityFactorDecimal)
          .times(metalUsdPerGram)
      );
    } catch {
      return null;
    }
  }

  const totalAccountsUsdString = serializeDecimal(totalAccountsUsd);
  const totalAssetsUsdString = serializeDecimal(totalAssetsUsd);
  const totalNetWorthUsdString = serializeDecimal(
    totalAccountsUsd.plus(totalAssetsUsd)
  );

  const preferredAccounts = convertCurrentAmountExact({
    amountDecimal: totalAccountsUsdString,
    fromCurrency: "USD",
    toCurrency: preferredCurrency,
    rates,
  });
  const preferredAssets = convertCurrentAmountExact({
    amountDecimal: totalAssetsUsdString,
    fromCurrency: "USD",
    toCurrency: preferredCurrency,
    rates,
  });
  const preferredNetWorth = convertCurrentAmountExact({
    amountDecimal: totalNetWorthUsdString,
    fromCurrency: "USD",
    toCurrency: preferredCurrency,
    rates,
  });
  if (
    !preferredAccounts.available ||
    !preferredAssets.available ||
    !preferredNetWorth.available
  ) {
    return null;
  }

  const backToUsd = convertCurrentAmountExact({
    amountDecimal: preferredNetWorth.value,
    fromCurrency: preferredCurrency,
    toCurrency: "USD",
    rates,
  });
  if (!backToUsd.available) {
    return null;
  }

  return {
    totalNetWorth: Number(preferredNetWorth.value),
    totalNetWorthUsd: Number(backToUsd.value),
    totalAccounts: Number(preferredAccounts.value),
    totalAssets: Number(preferredAssets.value),
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
    ...(input.preferredCurrencyUsdPerUnitDecimal === undefined
      ? {}
      : {
          totalNetWorthUsdDecimal: multiplyAvailableDecimals(
            totalNetWorth,
            input.preferredCurrencyUsdPerUnitDecimal
          ),
        }),
  };
}

function multiplyAvailableDecimals(
  first: string | null,
  second: string | null
): string | null {
  if (first === null || second === null) return null;
  try {
    return serializeDecimal(
      parseCanonicalDecimal(first).times(parseCanonicalDecimal(second))
    );
  } catch {
    return null;
  }
}

export function buildMonthlyPercentageChange(
  snapshots: readonly NetWorthSnapshotInput[]
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
  snapshots: readonly NetWorthSnapshotInput[],
  targetDateMs: number
): NetWorthSnapshotInput | null {
  let closest: NetWorthSnapshotInput | null = null;
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
