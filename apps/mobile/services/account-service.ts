/**
 * Account Service
 *
 * Service functions for account management operations.
 * Handles Cash account creation and lookup with idempotency guarantees.
 *
 * Architecture & Design Rationale:
 * - Pattern: Service Layer (plain async functions, no React hooks)
 * - SOLID: SRP — handles account CRUD only, no UI concerns
 * - Currency-aware idempotency: checks both type AND currency to prevent
 *   duplicates while allowing multi-currency cash accounts.
 *
 * @module account-service
 */

import { detectCurrencyFromTimezone } from "@/utils/currency-detection";
import { logger } from "@/utils/logger";
import {
  accountFormSchema,
  type AccountFormData,
} from "@/validation/account-validation";
import enAccounts from "@/locales/en/accounts.json";
import arAccounts from "@/locales/ar/accounts.json";
import {
  Account,
  BankDetails,
  Profile,
  type CurrencyType,
  type PreferredLanguageCode,
  database,
} from "@monyvi/db";
import { roundForCurrency } from "@monyvi/logic";
import { Q } from "@nozbe/watermelondb";
import { readIntroLocaleOverride } from "./intro-flag-service";
import { queryOwned } from "./user-data-access";
import { createAccountSmsSendersWithinWriter } from "./account-sms-sender-service";
import { normalizeCardLast4ForStorage } from "./card-last4-normalizer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of the ensureCashAccount operation. */
export interface EnsureCashAccountResult {
  /** Whether a new Cash account was created (false if one already existed). */
  readonly created: boolean;
  /** The ID of the Cash account (existing or newly created). Null on error. */
  readonly accountId: string | null;
  /** Error message if the operation failed. */
  readonly error?: string;
}

/** Result of the create-account operation. */
export interface CreateAccountResult {
  readonly success: boolean;
  readonly accountId?: string;
  readonly created?: boolean;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CASH_ACCOUNT_NAME = "Cash";
const CASH_ACCOUNT_TYPE = "CASH";
const DEFAULT_CASH_ACCOUNT_NAMES: Record<PreferredLanguageCode, string> = {
  en: enAccounts.default_cash_account_name,
  ar: arAccounts.default_cash_account_name,
};

/** Sentinel error code returned when currency cannot be determined. */
export const CURRENCY_UNKNOWN_ERROR = "CURRENCY_UNKNOWN";

export const CREATE_ACCOUNT_ERROR_CODES = {
  USER_ID_REQUIRED: "USER_ID_REQUIRED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  DUPLICATE_ACCOUNT: "DUPLICATE_ACCOUNT",
  DUPLICATE_IN_FLIGHT: "DUPLICATE_IN_FLIGHT",
} as const;

export type CreateAccountErrorCode =
  (typeof CREATE_ACCOUNT_ERROR_CODES)[keyof typeof CREATE_ACCOUNT_ERROR_CODES];

const pendingCreateKeys = new Set<string>();
const NO_PROVIDER_IDENTITY = "none";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSupportedLanguage(value: unknown): value is PreferredLanguageCode {
  return value === "en" || value === "ar";
}

export function getDefaultCashAccountName(
  language: PreferredLanguageCode
): string {
  return DEFAULT_CASH_ACCOUNT_NAMES[language];
}

async function readPreferredLanguageForUser(
  userId: string
): Promise<PreferredLanguageCode | null> {
  try {
    const profilesCollection = database.get<Profile>("profiles");

    const profiles = await queryOwned(
      profilesCollection,
      userId,
      Q.where("deleted", Q.notEq(true))
    ).fetch();

    const language = profiles[0]?.preferredLanguage;
    return isSupportedLanguage(language) ? language : null;
  } catch (error: unknown) {
    logger.warn(
      "cash_account_preferred_language_lookup_failed",
      error instanceof Error ? { message: error.message } : { error }
    );
    return null;
  }
}

async function resolveDefaultCashAccountName(userId: string): Promise<string> {
  const profileLanguage = await readPreferredLanguageForUser(userId);
  if (profileLanguage !== null) {
    return getDefaultCashAccountName(profileLanguage);
  }

  const introLanguage = await readIntroLocaleOverride();
  return getDefaultCashAccountName(introLanguage ?? "en");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check-and-create a Cash account inside an ALREADY-OPEN writer.
 *
 * This is the non-writer helper that `ensureCashAccount` and
 * `confirmCurrencyAndOnboard` share. Callers MUST be inside a
 * `database.write()` block — this function does NOT open its own.
 *
 * @returns The account ID (existing or newly created).
 */
export async function createCashAccountWithinWriter(
  userId: string,
  currency: CurrencyType,
  accountsCollection: ReturnType<typeof database.get<Account>>,
  name?: string
): Promise<{ readonly accountId: string; readonly created: boolean }> {
  const normalizedUserId = userId.trim();

  const existing = await queryOwned(
    accountsCollection,
    normalizedUserId,
    Q.where("type", CASH_ACCOUNT_TYPE),
    Q.where("currency", currency),
    Q.where("deleted", Q.notEq(true)),
    Q.sortBy("created_at", Q.asc)
  ).fetch();

  if (existing.length > 0) {
    return { accountId: existing[0].id, created: false };
  }

  const activeAccountCount = await queryOwned(
    accountsCollection,
    normalizedUserId,
    Q.where("deleted", Q.notEq(true))
  ).fetchCount();
  const isFirstAccount = activeAccountCount === 0;

  const record = await accountsCollection.create((acc) => {
    acc.userId = normalizedUserId;
    acc.name = name?.trim() || CASH_ACCOUNT_NAME;
    acc.type = CASH_ACCOUNT_TYPE;
    acc.currency = currency;
    acc.balance = 0;
    acc.deleted = false;
    acc.isDefault = isFirstAccount;
  });
  return { accountId: record.id, created: true };
}

function buildCreateAccountKey(userId: string, data: AccountFormData): string {
  const providerIdentity = buildProviderIdentity(
    data.institutionId ?? null,
    getProviderDisplayName(data)
  );
  return [
    userId.trim(),
    data.name.trim().toLowerCase(),
    data.currency,
    providerIdentity,
  ].join("|");
}

function getProviderDisplayName(data: AccountFormData): string | undefined {
  return data.providerDisplayName?.trim() || data.bankName?.trim() || undefined;
}

function normalizeProviderDisplayName(value?: string | null): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function buildProviderIdentity(
  institutionId?: string | null,
  providerDisplayName?: string | null
): string {
  const normalizedInstitutionId = institutionId?.trim();
  if (normalizedInstitutionId) {
    return `institution:${normalizedInstitutionId.toLowerCase()}`;
  }

  const normalizedProviderDisplayName =
    normalizeProviderDisplayName(providerDisplayName);
  if (normalizedProviderDisplayName) {
    return `manual:${normalizedProviderDisplayName}`;
  }

  return NO_PROVIDER_IDENTITY;
}

function hasDuplicateAccountIdentity(
  existingAccounts: readonly Account[],
  data: AccountFormData
): boolean {
  const trimmedName = data.name.trim().toLowerCase();
  const providerIdentity = buildProviderIdentity(
    data.institutionId ?? null,
    getProviderDisplayName(data)
  );

  return existingAccounts.some((account) => {
    const hasSameName =
      account.name.trim().toLowerCase() === trimmedName.toLowerCase();
    if (!hasSameName) {
      return false;
    }

    return (
      buildProviderIdentity(
        account.institutionId ?? null,
        account.providerDisplayName
      ) === providerIdentity
    );
  });
}

/**
 * Create a user-owned account and optional bank details with duplicate-submit
 * protection.
 *
 * The UI disables submit while this runs, but this service is the defensive
 * boundary: concurrent creates for the same user/name/currency/type are
 * rejected before they can enqueue another write, and the writer checks
 * existing active accounts again before insert.
 */
export async function createAccountForUser(
  userId: string,
  data: AccountFormData
): Promise<CreateAccountResult> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return {
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.USER_ID_REQUIRED,
    };
  }

  const validation = accountFormSchema.safeParse(data);
  if (!validation.success) {
    return {
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.VALIDATION_FAILED,
    };
  }
  const validatedData = validation.data;

  const createKey = buildCreateAccountKey(normalizedUserId, validatedData);
  if (pendingCreateKeys.has(createKey)) {
    return {
      success: false,
      error: CREATE_ACCOUNT_ERROR_CODES.DUPLICATE_IN_FLIGHT,
    };
  }

  pendingCreateKeys.add(createKey);

  try {
    let accountId: string | undefined;

    await database.write(async () => {
      const accountsCollection = database.get<Account>("accounts");
      const existingAccounts = await queryOwned(
        accountsCollection,
        normalizedUserId,
        Q.where("currency", validatedData.currency),
        Q.where("deleted", Q.notEq(true))
      ).fetch();

      if (hasDuplicateAccountIdentity(existingAccounts, validatedData)) {
        throw new Error(CREATE_ACCOUNT_ERROR_CODES.DUPLICATE_ACCOUNT);
      }

      const activeAccountCount = await queryOwned(
        accountsCollection,
        normalizedUserId,
        Q.where("deleted", Q.notEq(true))
      ).fetchCount();
      const isFirstAccount = activeAccountCount === 0;

      const account = await accountsCollection.create((acc) => {
        acc.userId = normalizedUserId;
        acc.name = validatedData.name.trim();
        acc.type = validatedData.accountType;
        acc.institutionId = validatedData.institutionId ?? undefined;
        acc.providerDisplayName = getProviderDisplayName(validatedData);
        acc.balance = roundForCurrency(
          parseFloat(validatedData.balance),
          validatedData.currency
        );
        acc.currency = validatedData.currency;
        acc.deleted = false;
        acc.isDefault = isFirstAccount;
      });
      accountId = account.id;

      await createAccountSmsSendersWithinWriter(
        account.id,
        validatedData.senderNames ?? []
      );

      if (validatedData.accountType === "BANK") {
        await database.get<BankDetails>("bank_details").create((details) => {
          details.accountId = account.id;
          details.cardLast4 = normalizeCardLast4ForStorage(
            validatedData.cardLast4
          );
          details.deleted = false;
        });
      }
    });

    return { success: true, accountId, created: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === CREATE_ACCOUNT_ERROR_CODES.DUPLICATE_ACCOUNT) {
      return {
        success: false,
        error: CREATE_ACCOUNT_ERROR_CODES.DUPLICATE_ACCOUNT,
      };
    }

    logger.error("createAccountForUser_failed", error);
    return { success: false, error: message };
  } finally {
    pendingCreateKeys.delete(createKey);
  }
}

/**
 * Ensure a Cash account exists for the given user in the specified currency.
 *
 * Idempotent: if a CASH-type account in the same currency already exists,
 * returns it without creating a duplicate.
 *
 * This function never throws — errors are captured in the result
 * object to support retry-safe fire-and-forget usage.
 *
 * @param userId - The authenticated user's ID
 * @param currency - Optional explicit currency. Falls back to timezone detection.
 *                   Returns CURRENCY_UNKNOWN error if both are null.
 * @param name - Optional custom name for the cash account (defaults to 'Cash').
 *               Only used during creation — existing accounts are returned as-is.
 * @returns Result with created flag and account ID
 */
export async function ensureCashAccount(
  userId: string,
  currency?: CurrencyType | null,
  name?: string
): Promise<EnsureCashAccountResult> {
  try {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return { created: false, accountId: null, error: "USER_ID_REQUIRED" };
    }

    // Resolve currency: explicit param > timezone detection
    const resolvedCurrency = currency ?? detectCurrencyFromTimezone();
    if (!resolvedCurrency) {
      return {
        created: false,
        accountId: null,
        error: CURRENCY_UNKNOWN_ERROR,
      };
    }

    const accountName = name?.trim()
      ? name.trim()
      : await resolveDefaultCashAccountName(normalizedUserId);
    let accountId: string | null = null;
    let created = false;

    await database.write(async () => {
      const accountsCollection = database.get<Account>("accounts");
      const result = await createCashAccountWithinWriter(
        normalizedUserId,
        resolvedCurrency,
        accountsCollection,
        accountName
      );
      accountId = result.accountId;
      created = result.created;
    });

    return { created, accountId };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error creating Cash account";
    logger.error("ensureCashAccount failed", { message });
    return { created: false, accountId: null, error: message };
  }
}

/**
 * Look up the first existing Cash account for the given user.
 *
 * Does NOT create a new account — use {@link ensureCashAccount}
 * for create-if-missing semantics.
 *
 * @param userId - The authenticated user's ID
 * @returns The Cash account ID, or null if none exists
 * Note: Unlike ensureCashAccount, this returns the first Cash account
 * regardless of currency (sorted by created_at ascending).
 */
export async function findCashAccount(userId: string): Promise<string | null> {
  try {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return null;
    }

    const accountsCollection = database.get<Account>("accounts");
    const existing = await queryOwned(
      accountsCollection,
      normalizedUserId,
      Q.where("type", CASH_ACCOUNT_TYPE),
      Q.where("deleted", Q.notEq(true)),
      Q.sortBy("created_at", Q.asc)
    ).fetch();

    return existing.length > 0 ? existing[0].id : null;
  } catch (error: unknown) {
    logger.error(
      "findCashAccount failed",
      error instanceof Error ? { message: error.message } : { error }
    );
    return null;
  }
}
