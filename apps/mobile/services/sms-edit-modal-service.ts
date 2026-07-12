/**
 * SMS Edit Modal Service
 *
 * Pure business logic extracted from TransactionEditModal.
 * Handles duplicate account detection, pending account construction,
 * and transaction edits building.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service Layer (pure functions, no React dependencies)
 * - Why: Keeps the modal component purely presentational while
 *   making validation and data construction independently testable.
 * - SOLID: SRP — business logic only, no UI concerns.
 *
 * @module sms-edit-modal-service
 */

import type { AccountWithBankDetails } from "@/services/sms-account-matcher";
import type { PendingAccount } from "@/services/pending-account-service";
import {
  isKnownFinancialSender,
  type ParsedSmsTransaction,
} from "@monyvi/logic";
import type { TransactionType } from "@monyvi/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Fields that can be overridden in the edit modal */
interface TransactionEdits {
  readonly amount: number;
  readonly counterparty?: string;
  readonly categoryId: string;
  readonly type: TransactionType;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly accountConfirmed?: boolean;
  readonly categoryConfirmed?: boolean;
  /** Cash account ID for ATM withdrawal destination (optional) */
  readonly toAccountId?: string | null;
  /** Cash account name for ATM withdrawal destination (optional) */
  readonly toAccountName?: string | null;
  readonly toAccountConfirmed?: boolean;
  /** User-edited note (e.g. itemized voice description) */
  readonly note?: string;
}

interface BuildPendingAccountInput {
  readonly name: string;
  readonly currency: ParsedSmsTransaction["currency"];
  readonly senderDisplayName: string;
  readonly cardLast4?: string;
}

interface BuildTransactionEditsInput {
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly accountConfirmed?: boolean;
  readonly counterparty?: string;
  readonly type: TransactionType;
  readonly categoryId: string;
  readonly categoryConfirmed: boolean;
  readonly shouldClearCategoryConfirmation?: boolean;
  readonly amount: number;
  /** Cash account ID for ATM withdrawal destination (optional) */
  readonly toAccountId?: string | null;
  /** Cash account name for ATM withdrawal destination (optional) */
  readonly toAccountName?: string | null;
  readonly toAccountConfirmed?: boolean;
  /** User-edited note (e.g. itemized voice description) */
  readonly note?: string;
}

interface AccountDuplicateIdentity {
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if an account with the same name AND currency already exists
 * (case-insensitive) in either the persisted accounts or the in-memory
 * pending accounts.
 */
function isDuplicateAccount(
  name: string,
  currency: string,
  accounts: readonly AccountWithBankDetails[],
  pendingAccounts: readonly PendingAccount[],
  candidateIdentity: AccountDuplicateIdentity = {}
): boolean {
  const candidateKey = buildAccountDuplicateKey({
    name,
    currency,
    ...candidateIdentity,
  });
  if (!candidateKey) return false;

  const existsInAccounts = accounts.some(
    (acc) =>
      buildAccountDuplicateKey({
        name: acc.name,
        currency: acc.currency,
        institutionId: acc.institutionId,
        providerDisplayName: acc.bankName,
      }) === candidateKey
  );
  const existsInPending = pendingAccounts.some(
    (pa) => buildAccountDuplicateKey(pa) === candidateKey
  );
  return existsInAccounts || existsInPending;
}

/**
 * Generate a unique temporary ID for a pending account.
 */
function generatePendingTempId(): string {
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Build a PendingAccount from the edit modal inputs.
 * Does NOT perform validation — caller should validate first.
 */
function buildPendingAccount(
  tempId: string,
  input: BuildPendingAccountInput
): PendingAccount {
  const knownSender = isKnownFinancialSender(input.senderDisplayName);

  return {
    tempId,
    name: input.name,
    currency: input.currency,
    type: knownSender?.type === "wallet" ? "DIGITAL_WALLET" : "BANK",
    institutionId: knownSender?.selectable ? knownSender.id : undefined,
    providerDisplayName: knownSender?.selectable
      ? knownSender.shortName
      : undefined,
    senderDisplayName: input.senderDisplayName,
    cardLast4: input.cardLast4,
  };
}

/**
 * Build the TransactionEdits payload from the edit modal form state.
 */
function buildTransactionEdits(
  input: BuildTransactionEditsInput
): TransactionEdits {
  return {
    accountId: input.accountId,
    accountName: input.accountName,
    accountConfirmed: input.accountConfirmed === true ? true : undefined,
    counterparty: input.counterparty,
    type: input.type,
    categoryId: input.categoryId,
    categoryConfirmed:
      input.categoryConfirmed === true
        ? true
        : input.shouldClearCategoryConfirmation === true
          ? false
          : undefined,
    amount: input.amount,
    toAccountId: input.toAccountId,
    toAccountName: input.toAccountName,
    toAccountConfirmed: input.toAccountConfirmed === true ? true : undefined,
    note: input.note,
  };
}

function buildAccountDuplicateKey(account: {
  readonly name: string;
  readonly currency: string;
  readonly institutionId?: string | null;
  readonly providerDisplayName?: string | null;
}): string | null {
  const normalizedName = account.name.trim().toLowerCase();
  if (!normalizedName) return null;

  const institutionId = account.institutionId?.trim();
  const providerDisplayName = account.providerDisplayName
    ?.trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  const providerIdentity = institutionId
    ? `institution:${institutionId}`
    : `manual:${providerDisplayName || "__monyvi_no_provider__"}`;

  return [normalizedName, account.currency, providerIdentity].join("|");
}

export {
  isDuplicateAccount,
  generatePendingTempId,
  buildPendingAccount,
  buildTransactionEdits,
};
export type {
  TransactionEdits,
  BuildPendingAccountInput,
  BuildTransactionEditsInput,
};
