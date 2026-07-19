import type { Account, MarketRate } from "@monyvi/db";
import { convertCurrency } from "../utils/currency";

/**
 * Calculate total balance across all accounts in USD.
 * Converts each account's balance from its native currency to USD
 * using market rates. Invalid or missing rates throw instead of returning a
 * partial or unconverted financial total.
 *
 * @param accounts - The accounts whose balances will be converted and summed
 * @param latestMarketRates - Market rates used for currency conversion to USD
 * @returns The sum of all account balances converted to USD
 */
export function calculateAccountsTotalBalance(
  accounts: Account[],
  latestMarketRates: MarketRate
): number {
  return accounts.reduce((total, account) => {
    return (
      total +
      convertCurrency(
        account.balance,
        account.currency,
        "USD",
        latestMarketRates
      )
    );
  }, 0);
}
