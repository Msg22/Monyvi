import type { Account, CurrencyType, MetalType } from "@monyvi/db";
import {
  convertCurrentAmountExact,
  getMetalUsdPerPureGramDecimal,
  isSupportedMetalsIsoCurrencyCode,
  parseCanonicalDecimal,
  serializeDecimal,
  type AssetBreakdown,
} from "@monyvi/logic";

import type { SelectedMarketRateSnapshot } from "./market-rate-snapshot-read-model-service";

export interface CurrentAmountInput {
  readonly amount: number;
  readonly fromCurrency: CurrencyType;
  readonly toCurrency: CurrencyType;
  readonly currentSnapshot: SelectedMarketRateSnapshot | null;
}

export interface CurrentAmountDecimalInput {
  readonly amountDecimal: string;
  readonly fromCurrency: CurrencyType;
  readonly toCurrency: CurrencyType;
  readonly currentSnapshot: SelectedMarketRateSnapshot | null;
}

export interface CurrentAmountEntry {
  readonly amount: number;
  readonly currency: CurrencyType;
}

export interface SumCurrentAmountsInput {
  readonly entries: readonly CurrentAmountEntry[];
  readonly toCurrency: CurrencyType;
  readonly currentSnapshot: SelectedMarketRateSnapshot | null;
}

export interface CurrentMetalPriceInput {
  readonly metal: MetalType;
  readonly toCurrency: CurrencyType;
  readonly currentSnapshot: SelectedMarketRateSnapshot | null;
}

export interface CurrentAssetBreakdownAccount {
  readonly balance: number;
  readonly currency: CurrencyType;
  readonly type: Account["type"];
}

export interface CurrentAssetBreakdownMetal {
  readonly metalType: MetalType;
  readonly purityFactorDecimal: string | null;
  readonly weightGramsDecimal: string | null;
}

export interface CurrentAssetBreakdownInput {
  readonly accounts: readonly CurrentAssetBreakdownAccount[];
  readonly metals: readonly CurrentAssetBreakdownMetal[];
  readonly currentSnapshot: SelectedMarketRateSnapshot | null;
}

export function convertSelectedCurrentAmountDecimal(
  input: CurrentAmountDecimalInput
): string | null {
  const { currentSnapshot } = input;
  if (
    currentSnapshot === null ||
    !isSupportedMetalsIsoCurrencyCode(input.fromCurrency) ||
    !isSupportedMetalsIsoCurrencyCode(input.toCurrency)
  ) {
    return null;
  }

  const converted = convertCurrentAmountExact({
    amountDecimal: input.amountDecimal,
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    rates: currentSnapshot.ratesByInstrument,
  });
  return converted.available ? converted.value : null;
}

export function convertSelectedCurrentAmount(
  input: CurrentAmountInput
): number | null {
  if (!Number.isFinite(input.amount)) {
    return null;
  }

  const value = convertSelectedCurrentAmountDecimal({
    amountDecimal: String(input.amount),
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    currentSnapshot: input.currentSnapshot,
  });
  return value === null ? null : Number(value);
}

export function getSelectedCurrentCurrencyRate(
  input: Omit<CurrentAmountInput, "amount">
): number | null {
  return convertSelectedCurrentAmount({ ...input, amount: 1 });
}

export function sumSelectedCurrentAmounts(
  input: SumCurrentAmountsInput
): number | null {
  let total = parseCanonicalDecimal("0");

  for (const entry of input.entries) {
    if (!Number.isFinite(entry.amount)) {
      return null;
    }
    const converted = convertSelectedCurrentAmountDecimal({
      amountDecimal: String(entry.amount),
      fromCurrency: entry.currency,
      toCurrency: input.toCurrency,
      currentSnapshot: input.currentSnapshot,
    });
    if (converted === null) {
      return null;
    }
    total = total.plus(converted);
  }

  return Number(serializeDecimal(total));
}

export function getSelectedCurrentMetalPrice(
  input: CurrentMetalPriceInput
): number | null {
  if (
    input.currentSnapshot === null ||
    (input.metal !== "GOLD" && input.metal !== "SILVER")
  ) {
    return null;
  }

  const usdPerPureGram = getMetalUsdPerPureGramDecimal(
    input.currentSnapshot.ratesByInstrument,
    input.metal
  );
  if (usdPerPureGram === null) {
    return null;
  }

  const converted = convertSelectedCurrentAmountDecimal({
    amountDecimal: usdPerPureGram,
    fromCurrency: "USD",
    toCurrency: input.toCurrency,
    currentSnapshot: input.currentSnapshot,
  });
  return converted === null ? null : Number(converted);
}

export function calculateSelectedCurrentAssetBreakdown(
  input: CurrentAssetBreakdownInput
): AssetBreakdown | null {
  if (input.currentSnapshot === null) {
    return null;
  }

  let bank = parseCanonicalDecimal("0");
  let cash = parseCanonicalDecimal("0");
  let wallet = parseCanonicalDecimal("0");
  let metals = parseCanonicalDecimal("0");

  for (const account of input.accounts) {
    const balanceUsd = convertSelectedCurrentAmountDecimal({
      amountDecimal: String(account.balance),
      fromCurrency: account.currency,
      toCurrency: "USD",
      currentSnapshot: input.currentSnapshot,
    });
    if (balanceUsd === null) {
      return null;
    }
    if (account.type === "BANK") {
      bank = bank.plus(balanceUsd);
    } else if (account.type === "DIGITAL_WALLET") {
      wallet = wallet.plus(balanceUsd);
    } else {
      cash = cash.plus(balanceUsd);
    }
  }

  for (const metal of input.metals) {
    if (
      (metal.metalType !== "GOLD" && metal.metalType !== "SILVER") ||
      metal.weightGramsDecimal === null ||
      metal.purityFactorDecimal === null
    ) {
      return null;
    }
    const usdPerPureGram = getMetalUsdPerPureGramDecimal(
      input.currentSnapshot.ratesByInstrument,
      metal.metalType
    );
    if (usdPerPureGram === null) {
      return null;
    }
    try {
      metals = metals.plus(
        parseCanonicalDecimal(metal.weightGramsDecimal)
          .times(metal.purityFactorDecimal)
          .times(usdPerPureGram)
      );
    } catch {
      return null;
    }
  }

  const total = bank.plus(cash).plus(wallet).plus(metals);
  return {
    bank: Number(serializeDecimal(bank)),
    cash: Number(serializeDecimal(cash)),
    wallet: Number(serializeDecimal(wallet)),
    metals: Number(serializeDecimal(metals)),
    total: Number(serializeDecimal(total)),
  };
}
