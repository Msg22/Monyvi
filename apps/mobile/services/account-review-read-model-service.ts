/**
 * #395 T010 — one owner-scoped, offline account snapshot for review.
 *
 * Keep local default eligibility separate from the closed provider-facing
 * request context. No database writes, provider requests or persisted metadata.
 */
import { Q } from "@nozbe/watermelondb";
import {
  accountReviewRequestContextSchema,
  type AccountReviewAccountContext,
  type AccountReviewRequestContext,
} from "@monyvi/logic";
import {
  database,
  type Account,
  type AccountSmsSender,
  type BankDetails,
  type Profile,
} from "@monyvi/db";

import { normalizeAccountSmsSender } from "./account-sms-sender-service";
import { getCurrentUserDataScope, getRequiredCurrentUserId } from "./user-data-access";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";

/** Local-only account identity with the persisted default marker retained. */
export interface AccountReviewLocalAccountSnapshot
  extends AccountReviewAccountContext {
  readonly isDefault: Account["isDefault"];
}

/** The public projection must never contain owner/default or financial data. */
export interface AccountReviewAccountSnapshots {
  readonly ownerId: string;
  readonly preferredCurrency: AccountReviewRequestContext["preferredCurrency"];
  readonly accounts: readonly AccountReviewLocalAccountSnapshot[];
  readonly providerContext: AccountReviewRequestContext;
}

const READ_MODEL_ERROR_CODES = {
  ACCOUNT_OWNER_MISMATCH: "ACCOUNT_REVIEW_ACCOUNT_OWNER_MISMATCH",
  PROFILE_UNAVAILABLE: "ACCOUNT_REVIEW_PROFILE_UNAVAILABLE",
  PROFILE_CONFLICT: "ACCOUNT_REVIEW_PROFILE_CONFLICT",
  DUPLICATE_ACCOUNT: "ACCOUNT_REVIEW_DUPLICATE_ACCOUNT",
  BANK_CHILD_SCOPE: "ACCOUNT_REVIEW_BANK_CHILD_SCOPE",
  BANK_DETAILS_CONFLICT: "ACCOUNT_REVIEW_BANK_DETAILS_CONFLICT",
  INVALID_CARD_SUFFIX: "ACCOUNT_REVIEW_INVALID_CARD_SUFFIX",
  SENDER_CHILD_SCOPE: "ACCOUNT_REVIEW_SENDER_CHILD_SCOPE",
  INVALID_SENDER: "ACCOUNT_REVIEW_INVALID_SENDER",
} as const;

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cardSuffixFromBankDetails(
  details: BankDetails | undefined
): AccountReviewAccountContext["cardLast4"] {
  if (details === undefined) return null;

  const suffix = details.cardLast4;
  if (suffix === null || suffix === undefined) return null;

  if (typeof suffix !== "number" || !Number.isInteger(suffix) ||
    suffix < 0 || suffix > 9999) {
    throw new Error(READ_MODEL_ERROR_CODES.INVALID_CARD_SUFFIX);
  }

  return String(suffix).padStart(4, "0");
}

/**
 * Only approved stored sender names become aliases. Normalize for stable
 * case-insensitive deduplication but preserve safe user-visible spelling.
 */
function buildSenderNames(
  senders: readonly AccountSmsSender[],
  allowedParentIds: ReadonlySet<string>
): ReadonlyMap<string, string[]> {
  const aliasesByAccount = new Map<string, Map<string, string>>();

  for (const sender of [...senders].sort((a, b) => compareAscii(a.id, b.id))) {
    if (!allowedParentIds.has(sender.accountId)) {
      throw new Error(READ_MODEL_ERROR_CODES.SENDER_CHILD_SCOPE);
    }
    if (sender.deleted) continue;

    if (typeof sender.senderName !== "string") {
      throw new Error(READ_MODEL_ERROR_CODES.INVALID_SENDER);
    }
    const displayName = sender.senderName.trim().replace(/\s+/gu, " ");
    const normalizedName = normalizeAccountSmsSender(displayName);
    if (!normalizedName) {
      throw new Error(READ_MODEL_ERROR_CODES.INVALID_SENDER);
    }

    const names = aliasesByAccount.get(sender.accountId) ?? new Map<string, string>();
    if (!names.has(normalizedName)) names.set(normalizedName, displayName);
    aliasesByAccount.set(sender.accountId, names);
  }

  const result = new Map<string, string[]>();
  for (const [accountId, names] of aliasesByAccount) {
    result.set(
      accountId,
      [...names.entries()]
        .sort(([a], [b]) => compareAscii(a, b))
        .map(([, displayName]) => displayName)
    );
  }
  return result;
}

function buildBankDetails(
  details: readonly BankDetails[],
  allowedParentIds: ReadonlySet<string>
): ReadonlyMap<string, BankDetails> {
  const byAccountId = new Map<string, BankDetails>();

  for (const detail of details) {
    if (!allowedParentIds.has(detail.accountId)) {
      throw new Error(READ_MODEL_ERROR_CODES.BANK_CHILD_SCOPE);
    }
    if (detail.deleted) continue;

    // A second live bank child is ambiguous even if its card suffix happens
    // to match. Never choose one by insertion order or overwrite silently.
    if (byAccountId.has(detail.accountId)) {
      throw new Error(READ_MODEL_ERROR_CODES.BANK_DETAILS_CONFLICT);
    }
    cardSuffixFromBankDetails(detail);
    byAccountId.set(detail.accountId, detail);
  }
  return byAccountId;
}

function projectProviderAccount(
  account: AccountReviewLocalAccountSnapshot
): AccountReviewAccountContext {
  // Explicit whitelist: never spread a database model or a local snapshot.
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    type: account.type,
    institutionId: account.institutionId,
    providerDisplayName: account.providerDisplayName,
    cardLast4: account.cardLast4,
    senderNames: [...account.senderNames],
  };
}

/**
 * Read all current-owner account context locally and in bounded batches.
 * If auth changes while reads are in flight, release no review/provider data.
 */
export async function loadAccountReviewAccountSnapshots(): Promise<AccountReviewAccountSnapshots> {
  const scope = await getCurrentUserDataScope();
  const ownerId = scope.userId;

  const [accounts, profiles] = await Promise.all([
    scope.queryOwned(database.get<Account>("accounts"), Q.where("deleted", false)).fetch(),
    scope.queryOwned(database.get<Profile>("profiles"), Q.where("deleted", false)).fetch(),
  ]);

  if (profiles.length === 0) {
    throw new Error(READ_MODEL_ERROR_CODES.PROFILE_UNAVAILABLE);
  }
  if (profiles.length !== 1) {
    throw new Error(READ_MODEL_ERROR_CODES.PROFILE_CONFLICT);
  }
  const profile = profiles[0];
  if (profile === undefined || profile.userId !== ownerId || profile.deleted) {
    throw new Error(READ_MODEL_ERROR_CODES.PROFILE_UNAVAILABLE);
  }

  const activeAccounts = [...accounts].sort((a, b) => compareAscii(a.id, b.id));
  if (new Set(activeAccounts.map((account) => account.id)).size !== activeAccounts.length) {
    throw new Error(READ_MODEL_ERROR_CODES.DUPLICATE_ACCOUNT);
  }
  for (const account of activeAccounts) {
    if (account.userId !== ownerId || account.deleted) {
      throw new Error(READ_MODEL_ERROR_CODES.ACCOUNT_OWNER_MISMATCH);
    }
  }

  const activeBankAccounts = activeAccounts.filter((account) => account.type === "BANK");
  const bankParentIds = new Set(activeBankAccounts.map((account) => account.id));
  const activeAccountIds = new Set(activeAccounts.map((account) => account.id));

  const bankDetailsPromise = activeBankAccounts.length > 0
    ? scope.queryChildrenOfOwnedParents(
        database.get<BankDetails>("bank_details"),
        activeBankAccounts,
        "account_id",
        Q.where("deleted", false)
      ).fetch()
    : Promise.resolve<BankDetails[]>([]);
  const senderPromise = activeAccounts.length > 0
    ? scope.queryChildrenOfOwnedParents(
        database.get<AccountSmsSender>("account_sms_senders"),
        activeAccounts,
        "account_id",
        Q.where("deleted", false)
      ).fetch()
    : Promise.resolve<AccountSmsSender[]>([]);
  const [bankDetails, senders] = await Promise.all([bankDetailsPromise, senderPromise]);

  const detailsByAccount = buildBankDetails(bankDetails, bankParentIds);
  const senderNamesByAccount = buildSenderNames(senders, activeAccountIds);

  const localAccounts: AccountReviewLocalAccountSnapshot[] = activeAccounts.map(
    (account): AccountReviewLocalAccountSnapshot => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      type: account.type,
      institutionId: account.institutionId ?? null,
      providerDisplayName: account.providerDisplayName ?? null,
      cardLast4: account.type === "BANK"
        ? cardSuffixFromBankDetails(detailsByAccount.get(account.id))
        : null,
      senderNames: senderNamesByAccount.get(account.id) ?? [],
      isDefault: account.isDefault,
    })
  );

  const providerContext = accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2",
    preferredCurrency: profile.preferredCurrency,
    accounts: localAccounts.map(projectProviderAccount),
  });

  // A scope is captured once; its queries must never be rebound to another
  // user. Recheck live authentication only AFTER all awaited reads and shaping.
  if ((await getRequiredCurrentUserId()) !== ownerId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }

  return {
    ownerId,
    preferredCurrency: providerContext.preferredCurrency,
    accounts: localAccounts,
    providerContext,
  };
}
