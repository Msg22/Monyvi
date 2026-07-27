/**
 * Parsed Transaction Account Matcher Service
 *
 * Single source of truth for all SMS → Account matching logic.
 * Both live detection (`resolveAccountForSms`) and batch review-page matching
 * delegate to `matchAccountCore` — a pure function implementing a 5-step
 * resolution chain using `senderDisplayName`.
 *
 * Resolution chain (highest confidence → lowest):
 * 1. Card last 4 + sender match against bank_details
 * 2. Sender match alone against bank_details / account name
 * 3. Name + currency match via bank registry (isKnownFinancialSender)
 * 4. Default bank or wallet account (isDefault flag)
 *
 * Architecture & Design Rationale:
 * - Pattern: Strategy (multi-strategy matching with priority ordering)
 * - Why: Different data quality across SMS sources means no single match
 *   strategy covers all cases. Priority ordering ensures best-match first.
 * - SOLID: SRP — only handles account matching, no transaction creation.
 *   OCP — new matching strategies can be added without modifying existing ones.
 *   DRY — both live and batch paths use the same core function.
 *
 * @module sms-account-matcher
 */

import {
  Account,
  AccountSmsSender,
  AccountType,
  BankDetails,
  database,
  type CurrencyType,
} from "@monyvi/db";
import {
  type ReviewableTransaction,
  getInstitutionById,
  getSenderPatternsForInstitution,
  isKnownFinancialSender,
} from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { queryChildrenOfOwnedParents, queryOwned } from "./user-data-access";
import { normalizeCardLast4ForStorage } from "./card-last4-normalizer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How the match was determined. */
type MatchReason =
  | "card_last4"
  | "sms_sender"
  | "account_name"
  | "bank_registry"
  | "voice_ai"
  | "default"
  | "first_bank"
  | "none";

interface AccountMatch {
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly matchReason: MatchReason;
}

interface AccountWithBankDetails {
  readonly id: string;
  readonly name: string;
  readonly currency: CurrencyType;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly type: AccountType;
  readonly institutionId?: string;
  readonly smsSenderNames: readonly string[];
  readonly bankName?: string;
  readonly cardLast4?: number;
}

/**
 * Input for the pure `matchAccountCore` function.
 * Both live detection and batch matching map their data into this shape.
 */
interface MatchInput {
  readonly senderDisplayName: string;
  readonly cardLast4?: string;
  readonly currency?: CurrencyType;
}

/** Optional filter for `fetchAccountsWithDetails`. */
type AccountTypeFilter = AccountType | undefined;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BATCH_SIZE = 20;

/**
 * Minimum string length for bidirectional substring matching.
 * Prevents short sender names like "I" from matching account names
 * like "CIB" via `includes()`. Direct equality checks are unaffected.
 */
const MIN_SUBSTRING_MATCH_LENGTH = 3;
const MIN_LOOSE_SENDER_CHIP_LENGTH = 4;

/** Escape special regex characters in a string to prevent injection / ReDoS. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTokenBoundaryMatch(
  normalizedSender: string,
  normalizedPattern: string
): boolean {
  return new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(normalizedPattern)}([^a-z0-9]|$)`
  ).test(normalizedSender);
}

/**
 * Regex patterns for extracting card last 4 digits from SMS body.
 * Matches common formats used by Egyptian banks:
 * - *1234 or *XXXX
 * - ending 1234 / ending in 1234
 * - xxxx1234 (masked card numbers)
 */
const CARD_LAST_4_PATTERNS: readonly RegExp[] = [
  /\*(\d{4})/,
  /ending\s+(?:in\s+)?(\d{4})/i,
  /x{4,}(\d{4})/i,
  /card\s+(?:no\.?\s+)?(?:\*+|\d+)(\d{4})/i,
];

// ---------------------------------------------------------------------------
// Internal helpers — card extraction
// ---------------------------------------------------------------------------

/**
 * Extract card last 4 digits from an SMS body.
 * Tries multiple patterns in order; returns first match.
 *
 * @param smsBody - The raw SMS message body
 * @returns The last 4 digits string, or null if not found
 */
function extractCardLast4(smsBody: string): string | null {
  for (const pattern of CARD_LAST_4_PATTERNS) {
    const match = pattern.exec(smsBody);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers — sender matching
// ---------------------------------------------------------------------------

/**
 * Check if an SMS sender address matches account-level bank details.
 *
 * Uses case-insensitive bidirectional substring matching to handle
 * variations in how carrier/bank SMS sender names appear.
 *
 * @param smsSenderDisplayName - The sender address from the SMS
 * @param fields - The comparison targets from bank_details and account
 * @returns Whether the sender matches
 */
function isSenderMatch(
  smsSenderDisplayName: string,
  {
    bankSmsSenderName,
    bankName,
    accountName,
  }: {
    readonly bankSmsSenderName?: string;
    readonly bankName?: string;
    readonly accountName?: string;
  }
): boolean {
  if (!bankSmsSenderName && !bankName && !accountName) {
    return false;
  }

  const normalizedSender = smsSenderDisplayName.toLowerCase().trim();
  if (!normalizedSender) {
    return false;
  }
  const normalizedBankSmsSenderName = bankSmsSenderName?.toLowerCase().trim();
  const normalizedBankName = bankName?.toLowerCase().trim();
  const normalizedAccountName = accountName?.toLowerCase().trim();

  // Direct equality check first (fastest path)
  if (
    normalizedSender === normalizedBankSmsSenderName ||
    normalizedSender === normalizedBankName ||
    normalizedSender === normalizedAccountName
  ) {
    return true;
  }

  // Bidirectional substring match — sender contained in target or vice versa
  // Guard: both sides must be at least MIN_SUBSTRING_MATCH_LENGTH chars
  // to prevent false positives from very short strings (e.g., "I" matching "CIB")
  if (
    normalizedBankSmsSenderName &&
    normalizedSender.length >= MIN_SUBSTRING_MATCH_LENGTH &&
    normalizedBankSmsSenderName.length >= MIN_SUBSTRING_MATCH_LENGTH
  ) {
    if (
      normalizedBankSmsSenderName.length < MIN_LOOSE_SENDER_CHIP_LENGTH &&
      isTokenBoundaryMatch(normalizedSender, normalizedBankSmsSenderName)
    ) {
      return true;
    }

    if (
      normalizedBankSmsSenderName.length >= MIN_LOOSE_SENDER_CHIP_LENGTH &&
      (normalizedSender.includes(normalizedBankSmsSenderName) ||
        normalizedBankSmsSenderName.includes(normalizedSender))
    ) {
      return true;
    }
  }

  if (
    normalizedBankName &&
    normalizedSender.length >= MIN_SUBSTRING_MATCH_LENGTH &&
    normalizedBankName.length >= MIN_SUBSTRING_MATCH_LENGTH
  ) {
    if (
      normalizedSender.includes(normalizedBankName) ||
      normalizedBankName.includes(normalizedSender)
    ) {
      return true;
    }
  }

  if (
    normalizedAccountName &&
    normalizedSender.length >= MIN_SUBSTRING_MATCH_LENGTH &&
    normalizedAccountName.length >= MIN_SUBSTRING_MATCH_LENGTH
  ) {
    if (
      normalizedSender.includes(normalizedAccountName) ||
      normalizedAccountName.includes(normalizedSender)
    ) {
      return true;
    }
  }

  return false;
}

function doesAccountMatchSender(
  senderDisplayName: string,
  account: AccountWithBankDetails
): boolean {
  const registrySenderNames =
    account.institutionId && getInstitutionById(account.institutionId)
      ? getSenderPatternsForInstitution(account.institutionId)
      : [];
  const senderNames = [...registrySenderNames, ...account.smsSenderNames];

  if (senderNames.length === 0) {
    return isSenderMatch(senderDisplayName, {
      bankName: account.bankName,
      accountName: account.name,
    });
  }

  const hasSenderNameMatch = senderNames.some((senderName) =>
    isSenderMatch(senderDisplayName, {
      bankSmsSenderName: senderName,
    })
  );

  if (hasSenderNameMatch) {
    return true;
  }

  if (account.institutionId && getInstitutionById(account.institutionId)) {
    return false;
  }

  return isSenderMatch(senderDisplayName, {
    bankName: account.bankName,
    accountName: account.name,
  });
}

// ---------------------------------------------------------------------------
// Data Access
// ---------------------------------------------------------------------------

/**
 * Fetches all non-deleted accounts with their bank details for the current user.
 * Optionally filtered by account type (e.g., BANK only for review page).
 *
 * @param userId - The current user's ID
 * @param accountType - Optional filter: "BANK", "CASH", or undefined for all
 * @returns Accounts enriched with bank_details data, sorted by created_at ASC
 */
async function fetchAccountsWithDetails(
  userId: string,
  accountType?: AccountTypeFilter
): Promise<readonly AccountWithBankDetails[]> {
  const clauses = [Q.where("deleted", false)];

  if (accountType) {
    clauses.push(Q.where("type", accountType));
  }

  const accounts = await queryOwned(
    database.get<Account>("accounts"),
    userId,
    ...clauses
  ).fetch();

  const results: AccountWithBankDetails[] = [];

  // Batch-fetch all bank_details to avoid N+1 per-account queries
  const accountIds = accounts.map((a) => a.id);
  const allBankDetails =
    accountIds.length === 0
      ? []
      : await queryChildrenOfOwnedParents(
          database.get<BankDetails>("bank_details"),
          accounts,
          userId,
          "account_id",
          Q.where("deleted", false)
        ).fetch();
  const allSenderRows =
    accountIds.length === 0
      ? []
      : await queryChildrenOfOwnedParents(
          database.get<AccountSmsSender>("account_sms_senders"),
          accounts,
          userId,
          "account_id",
          Q.where("deleted", false)
        ).fetch();

  const bankDetailsByAccountId = new Map<string, BankDetails>();
  for (const row of allBankDetails) {
    bankDetailsByAccountId.set(row.accountId, row);
  }
  const senderNamesByAccountId = new Map<string, string[]>();
  for (const row of allSenderRows) {
    const senderNames = senderNamesByAccountId.get(row.accountId) ?? [];
    senderNames.push(row.senderName);
    senderNamesByAccountId.set(row.accountId, senderNames);
  }

  function pushAccountWithDetails(
    account: Account,
    bankDetails?: BankDetails
  ): void {
    results.push({
      id: account.id,
      name: account.name,
      currency: account.currency,
      isDefault: account.isDefault,
      createdAt: account.createdAt,
      type: account.type,
      institutionId: account.institutionId,
      smsSenderNames: senderNamesByAccountId.get(account.id) ?? [],
      bankName: account.providerDisplayName ?? undefined,
      cardLast4: normalizeCardLast4ForStorage(bankDetails?.cardLast4),
    });
  }

  for (const account of accounts) {
    pushAccountWithDetails(account, bankDetailsByAccountId.get(account.id));
  }

  // Sort by created_at ASC for deterministic fallback ordering
  results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return results;
}

// ---------------------------------------------------------------------------
// Core matching logic — PURE FUNCTION
// ---------------------------------------------------------------------------

/**
 * Pure function implementing the 5-step account resolution chain.
 * Uses `senderDisplayName` only.
 *
 * This is the single source of truth used by both:
 * - `resolveAccountForSms` (live detection, single SMS)
 * - `matchTransactionsBatched` (review page, batch processing)
 *
 * @param input - The match criteria (senderDisplayName, cardLast4, currency)
 * @param accounts - Pre-fetched accounts with bank details
 * @returns The best match, or a "none" match if nothing fits
 */
function matchAccountCore(
  input: MatchInput,
  accounts: readonly AccountWithBankDetails[]
): AccountMatch {
  const { senderDisplayName, cardLast4, currency } = input;
  const normalizedCardLast4 = normalizeCardLast4ForStorage(cardLast4);
  const currencyCompatibleAccounts = currency
    ? accounts.filter((account) => account.currency === currency)
    : accounts;

  // Step 1: Card last 4 + sender match (highest confidence)
  if (normalizedCardLast4 !== undefined) {
    const cardAndSenderMatches = currencyCompatibleAccounts.filter(
      (acc) =>
        acc.cardLast4 === normalizedCardLast4 &&
        doesAccountMatchSender(senderDisplayName, acc)
    );
    if (cardAndSenderMatches.length === 1) {
      const [matchedAccount] = cardAndSenderMatches;
      return {
        accountId: matchedAccount.id,
        accountName: matchedAccount.name,
        matchReason: "card_last4",
      };
    }
    if (cardAndSenderMatches.length > 1) {
      return { accountId: null, accountName: null, matchReason: "none" };
    }

    // A stored card suffix can be stale or represent another card from the same
    // provider. Fall through to sender-only matching, which is still safe only
    // when it identifies exactly one accessible account.
  }

  // Step 2: Sender match alone against bank_details / account name
  const senderMatches = currencyCompatibleAccounts.filter((account) =>
    doesAccountMatchSender(senderDisplayName, account)
  );
  if (senderMatches.length === 1) {
    const [matchedAccount] = senderMatches;
    return {
      accountId: matchedAccount.id,
      accountName: matchedAccount.name,
      matchReason: "sms_sender",
    };
  }
  if (senderMatches.length > 1) {
    return { accountId: null, accountName: null, matchReason: "none" };
  }
  if (normalizedCardLast4 !== undefined) {
    return { accountId: null, accountName: null, matchReason: "none" };
  }

  const senderInstitution = isKnownFinancialSender(senderDisplayName);

  // Step 3: Name + currency match via Egyptian institution registry
  if (currency) {
    // This should return institution info for supported Egyptian providers
    // since we already filter the sms based on this registry
    if (senderInstitution) {
      for (const acc of currencyCompatibleAccounts) {
        if (!doesAccountMatchInstitutionType(acc, senderInstitution.type)) {
          continue;
        }

        if (acc.institutionId === senderInstitution.id) {
          return {
            accountId: acc.id,
            accountName: acc.name,
            matchReason: "bank_registry",
          };
        }

        const normalizedBankName = senderInstitution.shortName
          .toLowerCase()
          .trim();
        const existingName = acc.name.toLowerCase().trim();
        if (
          existingName === normalizedBankName ||
          // Word boundary match: "CIB" matches "CIB Egypt" but not "NCIB"
          new RegExp(`\\b${escapeRegExp(normalizedBankName)}\\b`).test(
            existingName
          ) ||
          new RegExp(`\\b${escapeRegExp(existingName)}\\b`).test(
            normalizedBankName
          )
        ) {
          return {
            accountId: acc.id,
            accountName: acc.name,
            matchReason: "bank_registry",
          };
        }
      }
    }
  }

  // Step 4: Default account fallback
  const defaultAcc = currencyCompatibleAccounts.find(
    (account) =>
      account.isDefault &&
      (!senderInstitution ||
        doesAccountMatchInstitutionType(account, senderInstitution.type))
  );
  if (defaultAcc) {
    return {
      accountId: defaultAcc.id,
      accountName: defaultAcc.name,
      matchReason: "default",
    };
  }

  // No match at all
  return { accountId: null, accountName: null, matchReason: "none" };
}

function doesAccountMatchInstitutionType(
  account: AccountWithBankDetails,
  institutionType: string
): boolean {
  if (institutionType === "bank") {
    return account.type === "BANK";
  }

  if (institutionType === "wallet") {
    return account.type === "DIGITAL_WALLET";
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API — single transaction matching
// ---------------------------------------------------------------------------

/**
 * Matches a single parsed transaction to the best-fit user account.
 * Maps `ReviewableTransaction` → `MatchInput` and delegates to `matchAccountCore`.
 *
 * @param transaction - The parsed transaction
 * @param accounts - Pre-fetched list of accounts with bank details
 * @returns The best match, or a "none" match if nothing fits
 */
function matchTransaction(
  transaction: ReviewableTransaction,
  accounts: readonly AccountWithBankDetails[]
): AccountMatch {
  if (transaction.source === "VOICE") {
    return matchVoiceTransaction(transaction, accounts);
  }

  const smsMatchableAccounts = accounts.filter(
    (acc) => acc.type === "BANK" || acc.type === "DIGITAL_WALLET"
  );
  const input: MatchInput = {
    // Use originLabel as the sender identifier (SMS: sender address)
    senderDisplayName: transaction.originLabel ?? "",
    cardLast4:
      "cardLast4" in transaction
        ? ((transaction as { cardLast4?: string }).cardLast4 ?? undefined)
        : undefined,
    currency: transaction.currency ?? undefined,
  };

  return matchAccountCore(input, smsMatchableAccounts);
}

function matchVoiceTransaction(
  transaction: ReviewableTransaction,
  accounts: readonly AccountWithBankDetails[]
): AccountMatch {
  if (transaction.accountId) {
    const aiMatchedAccount = accounts.find(
      (account) => account.id === transaction.accountId
    );
    if (aiMatchedAccount) {
      return {
        accountId: aiMatchedAccount.id,
        accountName: aiMatchedAccount.name,
        matchReason: "voice_ai",
      };
    }
  }

  const defaultAcc = accounts.find((account) => account.isDefault);
  if (defaultAcc) {
    return {
      accountId: defaultAcc.id,
      accountName: defaultAcc.name,
      matchReason: "default",
    };
  }

  return { accountId: null, accountName: null, matchReason: "none" };
}

// ---------------------------------------------------------------------------
// Public API — batched matching for review page
// ---------------------------------------------------------------------------

/**
 * Matches parsed review transactions to user accounts in batches.
 * Fetches accounts once, then processes ~20 txns/batch, calling
 * source-aware matching for each. Yields results via callback for
 * progressive rendering.
 *
 * @param transactions - Array of parsed review transactions
 * @param userId - Current user's ID
 * @param batchSize - Number of transactions per batch (default: 20)
 * @param onBatchComplete - Called after each batch with index → match map
 */
async function matchTransactionsBatched(
  transactions: readonly ReviewableTransaction[],
  userId: string,
  batchSize: number = DEFAULT_BATCH_SIZE,
  onBatchComplete: (batch: ReadonlyMap<number, AccountMatch>) => void,
  preloadedAccounts?: readonly AccountWithBankDetails[]
): Promise<void> {
  // Guard against non-positive batchSize which would cause an infinite loop
  const safeBatchSize =
    Number.isInteger(batchSize) && batchSize > 0
      ? batchSize
      : DEFAULT_BATCH_SIZE;

  // Review is shared by SMS and voice. Load all account types once; each
  // transaction is source-gated in `matchTransaction` before fallback runs.
  const accounts =
    preloadedAccounts ?? (await fetchAccountsWithDetails(userId));

  for (let start = 0; start < transactions.length; start += safeBatchSize) {
    const end = Math.min(start + safeBatchSize, transactions.length);
    const batchResults = new Map<number, AccountMatch>();

    for (let i = start; i < end; i++) {
      batchResults.set(i, matchTransaction(transactions[i], accounts));
    }

    onBatchComplete(batchResults);

    // Yield to the event loop between batches for progressive rendering
    if (end < transactions.length) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — legacy bulk matching (kept for backward compatibility)
// ---------------------------------------------------------------------------

/**
 * Matches all parsed SMS transactions to user accounts.
 *
 * @param transactions - Array of parsed SMS transactions
 * @param userId - Current user's ID
 * @returns Map of transaction index → AccountMatch
 */
async function matchAllTransactions(
  transactions: readonly ReviewableTransaction[],
  userId: string
): Promise<ReadonlyMap<number, AccountMatch>> {
  const accounts = await fetchAccountsWithDetails(userId);
  const matches = new Map<number, AccountMatch>();

  for (let i = 0; i < transactions.length; i++) {
    matches.set(i, matchTransaction(transactions[i], accounts));
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  CARD_LAST_4_PATTERNS,
  extractCardLast4,
  fetchAccountsWithDetails,
  isSenderMatch,
  matchAccountCore,
  matchAllTransactions,
  matchTransaction,
  matchTransactionsBatched,
};

export type {
  AccountMatch,
  AccountTypeFilter,
  AccountWithBankDetails,
  MatchInput,
  MatchReason,
};
