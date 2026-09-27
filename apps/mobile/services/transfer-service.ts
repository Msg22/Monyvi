import { getCurrentUserId } from "./supabase";
import {
  CurrencyType,
  database,
  Transfer,
  type TransactionType,
} from "@monyvi/db";
import { ensureCashAccount } from "./account-service";
import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "@/services/user-data-access";
import { isValidTransactionAmount } from "@monyvi/logic";
import {
  convertGuardedTransferToTransaction,
  createGuardedTransfer,
  deleteGuardedTransfer,
  updateGuardedTransfer,
} from "./transfer-core-writer-production";

export interface TransferData {
  amount: number;
  convertedAmount?: number;
  currency: CurrencyType;
  fromAccountId: string;
  toAccountId: string;
  date?: Date;
  notes?: string;
  exchangeRate?: number;
  /** SMS fingerprint for deduplication (persisted in DB) */
  smsFingerprint?: string;
}

export const INVALID_TRANSFER_AMOUNT_ERROR_CODE = "INVALID_TRANSACTION_AMOUNT";

function transfersCollection(): ReturnType<typeof database.get<Transfer>> {
  return database.get<Transfer>("transfers");
}

async function getOwnedTransfer(
  transferId: string,
  scope: CurrentUserDataScope
): Promise<Transfer> {
  return scope.findOwned(transfersCollection(), transferId);
}

function assertValidTransferAmount(amount: number): void {
  if (!isValidTransactionAmount(Math.abs(amount))) {
    throw new Error(INVALID_TRANSFER_AMOUNT_ERROR_CODE);
  }
}

// ---------------------------------------------------------------------------
// SMS ATM Transfer
// ---------------------------------------------------------------------------

const ATM_WITHDRAWAL_NOTE_PREFIX = "ATM Withdrawal" as const;

/**
 * Input for creating an ATM withdrawal transfer from a live-detected SMS.
 *
 * Architecture & Design Rationale:
 * - Pattern: Facade — wraps `ensureCashAccount` + `createTransfer` into a
 *   single domain-specific call for ATM withdrawals.
 * - Why: Both the live detection handler and future callers need the same
 *   "ensure cash account → create bank→cash transfer" sequence.
 *   Centralising it here prevents DRY violations and ensures consistent
 *   ATM handling across all SMS entry points.
 * - SOLID: SRP — `createSmsAtmTransfer` only handles ATM routing.
 *   OCP — new transfer types can be added as separate functions.
 */
interface SmsAtmTransferInput {
  /** Bank account ID to debit */
  readonly bankAccountId: string;
  /** Withdrawal amount (always positive) */
  readonly amount: number;
  /** Currency of the transaction */
  readonly currency: CurrencyType;
  /** Transaction date */
  readonly date: Date;
  /** SMS fingerprint for deduplication */
  readonly smsFingerprint?: string;
  /** Sender display name for notes */
  readonly senderDisplayName?: string;
  /** Authenticated user who initiated live parsing */
  readonly expectedUserId: string;
}

interface SmsAtmTransferResult {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Create an ATM withdrawal as a bank → cash transfer.
 *
 * Ensures the cash account exists, then atomically creates the transfer
 * and updates both account balances. Used by the live SMS detection handler.
 *
 * The batch flow (`batch-create-transactions.ts`) uses `prepareCreate`
 * for atomic batch writes and calls `ensureCashAccount` separately,
 * so it does NOT use this function.
 *
 * @param input - ATM transfer parameters
 * @returns Result with success flag and optional error
 */
export async function createSmsAtmTransfer(
  input: SmsAtmTransferInput
): Promise<SmsAtmTransferResult> {
  const userId = await getCurrentUserId();
  if (!userId || userId !== input.expectedUserId) {
    return { success: false, error: "User not authenticated" };
  }

  const cashResult = await ensureCashAccount(
    userId,
    input.currency,
    undefined,
    input.expectedUserId
  );
  if (!cashResult.accountId) {
    return {
      success: false,
      error: `Failed to resolve Cash account in ${input.currency}: ${cashResult.error ?? "unknown"}`,
    };
  }

  try {
    await createTransfer(
      {
        fromAccountId: input.bankAccountId,
        toAccountId: cashResult.accountId,
        amount: input.amount,
        currency: input.currency,
        date: input.date,
        notes: `${ATM_WITHDRAWAL_NOTE_PREFIX}${input.senderDisplayName ? ` — ${input.senderDisplayName}` : ""}`,
        smsFingerprint: input.smsFingerprint,
      },
      input.expectedUserId
    );

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to create ATM transfer: ${errorMessage}`,
    };
  }
}

/**
 * Create a new transfer between accounts.
 * Atomically creates the Transfer record and updates both account balances.
 */
export async function createTransfer(
  data: TransferData,
  expectedUserId?: string
): Promise<void> {
  assertValidTransferAmount(data.amount);
  if (data.convertedAmount !== undefined) {
    assertValidTransferAmount(data.convertedAmount);
  }

  await createGuardedTransfer(
    {
      ...data,
      amount: Math.abs(data.amount),
      convertedAmount:
        data.convertedAmount === undefined
          ? undefined
          : Math.abs(data.convertedAmount),
    },
    expectedUserId
  );
}

/**
 * Update an existing transfer.
 *
 * Supports editing: amount, notes, date, fromAccountId, toAccountId.
 *
 * Balance adjustment strategies:
 * - **Amount only**: revert old amounts on both accounts, apply new amounts
 * - **Account swap**: revert old accounts, apply to new accounts
 * - **Combined**: both can change simultaneously in a single atomic write
 */
export async function updateTransfer(
  transferId: string,
  updates: {
    readonly amount?: number;
    readonly convertedAmount?: number;
    readonly notes?: string;
    readonly date?: Date;
    readonly fromAccountId?: string;
    readonly toAccountId?: string;
  }
): Promise<void> {
  if (updates.amount !== undefined) {
    assertValidTransferAmount(updates.amount);
  }
  if (updates.convertedAmount !== undefined) {
    assertValidTransferAmount(updates.convertedAmount);
  }

  const hasFinancialUpdate =
    updates.amount !== undefined ||
    updates.convertedAmount !== undefined ||
    updates.fromAccountId !== undefined ||
    updates.toAccountId !== undefined;
  if (hasFinancialUpdate) {
    await updateGuardedTransfer(transferId, {
      ...updates,
      amount:
        updates.amount === undefined ? undefined : Math.abs(updates.amount),
      convertedAmount:
        updates.convertedAmount === undefined
          ? undefined
          : Math.abs(updates.convertedAmount),
    });
    return;
  }
  const scope = await getCurrentUserDataScope();
  await database.write(async () => {
    const transfer = await getOwnedTransfer(transferId, scope);
    await transfer.update((record) => {
      if (updates.notes !== undefined) record.notes = updates.notes;
      if (updates.date !== undefined) record.date = updates.date;
    });
  });
}

// =============================================================================
// Delete
// =============================================================================

/**
 * Mark a transfer as deleted (soft delete).
 * Atomically reverses both account balance changes and soft-deletes the record.
 */
export async function deleteTransfer(transferId: string): Promise<void> {
  await deleteGuardedTransfer(transferId);
}

// =============================================================================
// Conversion: Transfer → Transaction
// =============================================================================

interface ConvertToTransactionPayload {
  readonly transferId: string;
  readonly accountId: string;
  readonly type: TransactionType;
  readonly categoryId: string;
  readonly counterparty?: string;
}

/**
 * Converts a Transfer into a Transaction.
 *
 * Atomic operation:
 * 1. Soft-delete the transfer and revert both account balances
 * 2. Create a new transaction using the transfer's data
 * 3. Apply the transaction's balance effect on the chosen account
 *
 * The user picks which account (defaults to fromAccountId) and
 * must provide a type (EXPENSE/INCOME) and categoryId.
 */
export async function convertTransferToTransaction(
  payload: ConvertToTransactionPayload
): Promise<void> {
  await convertGuardedTransferToTransaction(payload);
}
