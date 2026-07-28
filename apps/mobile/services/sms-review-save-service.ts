/**
 * SMS Review Save Service
 *
 * Business logic for the "Save Selected" action in the SMS review page.
 * Orchestrates: validation → pending account persistence → temp→real ID
 * remapping → final payload construction.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service Layer (async function, no React dependencies)
 * - Why: Keeps the review component purely presentational while making
 *   the save orchestration independently testable. The component's
 *   handleSave becomes a thin wrapper that calls this service, shows
 *   toasts based on the result, and calls onSave.
 * - SOLID: SRP — save orchestration only. Delegates account persistence
 *   to pending-account-service.
 *
 * @module sms-review-save-service
 */

import {
  type PendingAccount,
  persistPendingAccounts,
} from "@/services/pending-account-service";
import type { AccountMatch } from "@/services/sms-account-matcher";
import type { TransactionEdits } from "@/services/sms-edit-modal-service";
import { ensureCashAccount } from "@/services/account-service";
import type { ReviewableTransaction } from "@monyvi/logic";
import type { CurrencyType } from "@monyvi/db";
import { isResolvedAccountMatch } from "@/services/transaction-review-selection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrepareSaveInput {
  /** Set of original indices that the user selected for saving */
  readonly selectedIndices: ReadonlySet<number>;
  /** Per-transaction edits from the edit modal (keyed by original index) */
  readonly transactionOverrides: ReadonlyMap<number, TransactionEdits>;
  /** Auto-resolved account matches (keyed by original index) */
  readonly accountMatches: ReadonlyMap<number, AccountMatch>;
  /** In-memory pending accounts created via "Create New" in the edit modal */
  readonly pendingAccounts: readonly PendingAccount[];
  /** The full effective (post-dedup) transactions array */
  readonly effectiveTransactions: readonly ReviewableTransaction[];
  /** The authenticated user's ID (needed for cash account creation) */
  readonly userId: string;
}

interface PrepareSaveSuccess {
  readonly success: true;
  /** The selected transactions in order */
  readonly selected: readonly ReviewableTransaction[];
  /** Sequential index → real account ID (FROM account) */
  readonly transactionAccountMap: Map<number, string>;
  /** Sequential index → real cash account ID (TO account, ATM only) */
  readonly toAccountMap: Map<number, string>;
}

interface PrepareSaveValidationError {
  readonly success: false;
  readonly reason: "missing_accounts";
  /** Original indices of transactions missing an account */
  readonly missingIndices: ReadonlySet<number>;
  readonly message: string;
}

interface PrepareSaveError {
  readonly success: false;
  readonly reason: "persist_error";
  readonly message: string;
}

type PrepareSaveResult =
  | PrepareSaveSuccess
  | PrepareSaveValidationError
  | PrepareSaveError;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Prepare the save payload for the SMS review page.
 *
 * Steps:
 * 1. Collect selected indices in order
 * 2. Build original-index → accountId map from overrides + auto-matches
 * 3. Validate: every selected transaction must have an account
 * 4. Persist referenced pending accounts (if any)
 * 5. Remap temp IDs → real IDs in the account map
 * 6. Build the final selected array + sequential transactionAccountMap
 *
 * @returns A discriminated union indicating success or the specific failure
 */
async function prepareSavePayload(
  input: PrepareSaveInput
): Promise<PrepareSaveResult> {
  const {
    selectedIndices,
    transactionOverrides,
    accountMatches,
    pendingAccounts,
    effectiveTransactions,
    userId,
  } = input;
  const deferAccountPersistence = effectiveTransactions.some(
    (transaction) => transaction.source === "SMS"
  );

  // Step 1: Collect selected original indices in order
  const selectedOriginalIndices = Array.from(selectedIndices).sort(
    (a, b) => a - b
  );

  // Step 2: Build validation map using original indices
  const originalIndexToAccountId = new Map<number, string>();
  const missingIndices = new Set<number>();

  for (const i of selectedOriginalIndices) {
    const override = transactionOverrides.get(i);
    const match = accountMatches.get(i);
    const accountId = resolveSaveAccountId(override, match);
    if (accountId) {
      originalIndexToAccountId.set(i, accountId);
    } else {
      missingIndices.add(i);
    }
  }

  // Step 3: Validate — every selected transaction must have an account
  if (missingIndices.size > 0) {
    const count = missingIndices.size;
    return {
      success: false,
      reason: "missing_accounts",
      missingIndices,
      message: `${count} transaction${count !== 1 ? "s" : ""} still need an account assigned. Tap them to fix.`,
    };
  }

  // Step 4: Persist only referenced pending accounts
  if (!deferAccountPersistence && pendingAccounts.length > 0) {
    const referencedTempIds = new Set(originalIndexToAccountId.values());
    const referencedPending = pendingAccounts.filter((pa) =>
      referencedTempIds.has(pa.tempId)
    );

    if (referencedPending.length > 0) {
      try {
        const persistResult = await persistPendingAccounts(referencedPending);

        if (persistResult.errors.length > 0) {
          return {
            success: false,
            reason: "persist_error",
            message: persistResult.errors.join("; "),
          };
        }

        // Step 5: Remap temp IDs → real IDs
        const referencedPendingIds = new Set(
          referencedPending.map((p) => p.tempId)
        );
        for (const [idx, tempId] of originalIndexToAccountId) {
          const realId = persistResult.tempToRealIdMap.get(tempId);
          if (realId) {
            originalIndexToAccountId.set(idx, realId);
          }
        }

        // Fail fast if any referenced pending ID is still unresolved
        const hasUnresolved = Array.from(
          originalIndexToAccountId.values()
        ).some((id) => referencedPendingIds.has(id));

        if (hasUnresolved) {
          return {
            success: false,
            reason: "persist_error",
            message:
              "One or more pending accounts could not be resolved to persisted IDs.",
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          reason: "persist_error",
          message: `Failed to create accounts: ${message}`,
        };
      }
    }
  }

  // Step 6: Build the final selected array + sequential index map
  const selected: ReviewableTransaction[] = [];
  for (const i of selectedOriginalIndices) {
    const transaction = effectiveTransactions[i];
    if (!transaction) {
      return {
        success: false,
        reason: "persist_error",
        message: `Selected transaction index ${i} is out of bounds.`,
      };
    }
    selected.push(transaction);
  }
  const transactionAccountMap = new Map<number, string>();
  const toAccountMap = new Map<number, string>();

  for (let seqIdx = 0; seqIdx < selectedOriginalIndices.length; seqIdx++) {
    const origIdx = selectedOriginalIndices[seqIdx];
    const accountId = originalIndexToAccountId.get(origIdx);
    if (accountId) {
      transactionAccountMap.set(seqIdx, accountId);
    }
  }

  // ── Resolve TO accounts for ATM withdrawals (deduplicated) ──────────

  // Pass 1: Collect unique (name, currency) pairs that need creation
  const pendingCashKeys = new Map<
    string,
    { readonly name: string; readonly currency: CurrencyType }
  >();
  /** seqIdx → either an existing cash account ID or a dedup key for creation */
  const atmToResolution = new Map<
    number,
    { kind: "existing"; id: string } | { kind: "pending"; key: string }
  >();

  for (let seqIdx = 0; seqIdx < selectedOriginalIndices.length; seqIdx++) {
    const origIdx = selectedOriginalIndices[seqIdx];
    const tx = effectiveTransactions[origIdx];
    const isAtm =
      "isAtmWithdrawal" in tx &&
      (tx as { isAtmWithdrawal?: boolean }).isAtmWithdrawal === true;
    if (!isAtm) continue;

    const override = transactionOverrides.get(origIdx);
    const toId = override?.toAccountId;
    const toName = override?.toAccountName;

    if (toId) {
      // User selected an existing cash account
      atmToResolution.set(seqIdx, { kind: "existing", id: toId });
    } else if (toName) {
      // User typed a new name — deduplicate by (name, currency)
      const key = `${toName.trim().toLowerCase()}|${tx.currency}`;
      if (!pendingCashKeys.has(key)) {
        pendingCashKeys.set(key, {
          name: toName.trim(),
          currency: tx.currency,
        });
      }
      atmToResolution.set(seqIdx, { kind: "pending", key });
    }
    // If neither set, batchCreateSmsTransactions auto-creates via ensureCashAccount
  }

  // Pass 2: Create each unique cash account once
  const resolvedCashIds = new Map<string, string>();
  for (const [key, { name, currency }] of pendingCashKeys) {
    if (deferAccountPersistence) continue;
    try {
      const result = await ensureCashAccount(userId, currency, name);
      if (result.accountId) {
        resolvedCashIds.set(key, result.accountId);
      }
    } catch {
      // Non-fatal: batchCreateSmsTransactions will fall back to ensureCashAccount
    }
  }

  // Pass 3: Map all ATM transactions to their resolved TO account IDs
  for (const [seqIdx, resolution] of atmToResolution) {
    if (resolution.kind === "existing") {
      toAccountMap.set(seqIdx, resolution.id);
    } else {
      const resolvedId = resolvedCashIds.get(resolution.key);
      if (resolvedId) {
        toAccountMap.set(seqIdx, resolvedId);
      }
    }
  }

  return {
    success: true,
    selected,
    transactionAccountMap,
    toAccountMap,
  };
}

function resolveSaveAccountId(
  override: TransactionEdits | undefined,
  match: AccountMatch | undefined
): string | null {
  if (!override) {
    return isResolvedAccountMatch(match) ? match.accountId : null;
  }

  if (!override.accountId) {
    return null;
  }

  if (
    !isResolvedAccountMatch(match) &&
    override.accountId === match?.accountId &&
    override.accountConfirmed !== true
  ) {
    return null;
  }

  return override.accountId;
}

export { prepareSavePayload };
export type {
  PrepareSaveInput,
  PrepareSaveResult,
  PrepareSaveSuccess,
  PrepareSaveValidationError,
  PrepareSaveError,
};
