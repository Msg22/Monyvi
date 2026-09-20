import type { Account, CurrencyType } from "@monyvi/db";
import { formatCurrency } from "@monyvi/logic";

import { convertSelectedCurrentAmount } from "./current-market-snapshot-calculations";
import type { SelectedMarketRateSnapshot } from "./market-rate-snapshot-read-model-service";

const USD_CURRENCY: CurrencyType = "USD";

export interface AccountListConvertedSubtitlesInput {
  readonly accounts: readonly Account[];
  readonly currentSnapshot: SelectedMarketRateSnapshot | null;
}

/**
 * Shapes the nullable approximate-USD subtitle for every non-USD account so
 * presentational account cards receive already-formatted text instead of
 * invoking rate calculations themselves.
 *
 * Accounts whose currency is already USD, whose conversion is unavailable, or
 * whose snapshot is missing are omitted; callers fall back to the account-type
 * label for those.
 */
export function buildAccountConvertedSubtitles(
  input: AccountListConvertedSubtitlesInput
): ReadonlyMap<string, string> {
  const subtitles = new Map<string, string>();
  if (input.currentSnapshot === null) {
    return subtitles;
  }

  for (const account of input.accounts) {
    if (account.currency === USD_CURRENCY) {
      continue;
    }

    const usdValue = convertSelectedCurrentAmount({
      amount: account.balance,
      fromCurrency: account.currency,
      toCurrency: USD_CURRENCY,
      currentSnapshot: input.currentSnapshot,
    });
    if (usdValue === null) {
      continue;
    }

    subtitles.set(
      account.id,
      `≈ ${formatCurrency({ amount: usdValue, currency: USD_CURRENCY })}`
    );
  }

  return subtitles;
}
