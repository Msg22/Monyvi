/**
 * SMS Account Resolver
 *
 * Thin wrapper for live SMS detection (single incoming SMS).
 * Fetches accounts, extracts cardLast4 from raw SMS body,
 * and delegates to `matchAccountCore` for the actual resolution.
 *
 * Architecture & Design Rationale:
 * - Pattern: Adapter — maps raw SMS data (senderDisplayName, smsBody) into
 *   the `MatchInput` interface expected by `matchAccountCore`.
 * - Why: Live detection receives raw SMS data, while the core matcher
 *   works with a normalized input. This adapter bridges the gap.
 * - SOLID: SRP — only handles data preparation for live detection.
 *   DIP — depends on the `matchAccountCore` abstraction, not concrete DB queries.
 *
 * @module sms-account-resolver
 */

import type { CurrencyType } from "@monyvi/db";
import { getCurrentUserId } from "./supabase";
import {
  matchAccountCore,
  fetchAccountsWithDetails,
  extractCardLast4,
  type MatchInput,
} from "./sms-account-matcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of account resolution */
export interface ResolvedAccount {
  readonly accountId: string;
  readonly accountName: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve which account an incoming SMS transaction belongs to.
 *
 * This is a thin wrapper that:
 * 1. Gets the current user ID
 * 2. Fetches all accounts with bank details
 * 3. Uses the parser's cardLast4 hint or extracts it from the raw SMS body
 * 4. Delegates to `matchAccountCore` for the 5-step resolution chain
 *
 * @param senderDisplayName - The SMS sender display name (e.g., "CIB", "NBE")
 * @param smsBody           - The raw SMS body text
 * @param currency          - Optional transaction currency for name+currency matching
 * @param parsedCardLast4   - Optional card hint already extracted by the parser
 * @returns Resolved account with match details, or null if no match
 */
export async function resolveAccountForSms(
  senderDisplayName: string,
  smsBody: string,
  currency?: CurrencyType,
  parsedCardLast4?: string
): Promise<ResolvedAccount | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.warn(
      "[sms-resolver] No authenticated user — cannot resolve account"
    );
    return null;
  }

  const accounts = (await fetchAccountsWithDetails(userId)).filter(
    (account) => account.type === "BANK" || account.type === "DIGITAL_WALLET"
  );

  // Extract card last 4 from raw SMS body for Step 1 matching
  const cardFromSms = parsedCardLast4 ?? extractCardLast4(smsBody);

  const input: MatchInput = {
    senderDisplayName,
    cardLast4: cardFromSms ?? undefined,
    currency,
  };

  const result = matchAccountCore(input, accounts);

  // Return null when no match found (backward-compatible with callers)
  if (
    result.matchReason === "none" ||
    !result.accountId ||
    !result.accountName
  ) {
    return null;
  }

  return {
    accountId: result.accountId,
    accountName: result.accountName,
  };
}
