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
import {
  getCurrentUserDataScope,
  getRequiredCurrentUserId,
  type CurrentUserDataScope,
} from "./user-data-access";
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
  INVALID_DEFAULT: "ACCOUNT_REVIEW_INVALID_DEFAULT",
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

  // WatermelonDB values can be malformed at runtime despite generated types.
  const suffix: unknown = details.cardLast4;
  if (suffix === null || suffix === undefined) return null;

  if (typeof suffix !== "number" || !Number.isInteger(suffix) ||
    suffix < 0 || suffix > 9999) {
    throw new Error(READ_MODEL_ERROR_CODES.INVALID_CARD_SUFFIX);
  }

  return String(suffix).padStart(4, "0");
}

/**
 * Accept only real stored aliases; do not create names from provider guesses.
 */
function readPersistedAlias(
  sender: AccountSmsSender
): { readonly normalized: string; readonly displayName: string } {
  const persistedName: unknown = sender.senderName;
  if (typeof persistedName !== "string") {
    throw new Error(READ_MODEL_ERROR_CODES.INVALID_SENDER);
  }
  const displayName = persistedName.trim().replace(/\s+/gu, " ");
  const normalized = normalizeAccountSmsSender(displayName);
  if (!normalized) {
    throw new Error(READ_MODEL_ERROR_CODES.INVALID_SENDER);
  }
  return { normalized, displayName };
}

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

    const { normalized, displayName } = readPersistedAlias(sender);
    const aliases = aliasesByAccount.get(sender.accountId) ?? new Map<string, string>();
    if (!aliases.has(normalized)) aliases.set(normalized, displayName);
    aliasesByAccount.set(sender.accountId, aliases);
  }
  const result = new Map<string, string[]>();
  for (const [accountId, aliases] of aliasesByAccount) {
    result.set(
      accountId,
      [...aliases.entries()]
        .sort(([left], [right]) => compareAscii(left, right))
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


interface OwnedAccountRecords {
  readonly accounts: readonly Account[];
  readonly profiles: readonly Profile[];
}

interface OwnedChildMetadata {
  readonly bankDetailsByAccount: ReadonlyMap<string, BankDetails>;
  readonly senderNamesByAccount: ReadonlyMap<string, string[]>;
}

async function readOwnedAccountsAndProfiles(
  scope: CurrentUserDataScope
): Promise<OwnedAccountRecords> {
  const [accounts, profiles] = await Promise.all([
    scope.queryOwned(database.get<Account>("accounts"), Q.where("deleted", false)).fetch(),
    scope.queryOwned(database.get<Profile>("profiles"), Q.where("deleted", false)).fetch(),
  ]);
  return { accounts, profiles };
}

function requireOwnedActiveProfile(
  profiles: readonly Profile[],
  ownerId: string
): Profile {
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
  return profile;
}

function validateOwnedActiveAccounts(
  accounts: readonly Account[],
  ownerId: string
): Account[] {
  const activeAccounts = [...accounts].sort((a, b) => compareAscii(a.id, b.id));
  if (new Set(activeAccounts.map((account) => account.id)).size !== activeAccounts.length) {
    throw new Error(READ_MODEL_ERROR_CODES.DUPLICATE_ACCOUNT);
  }
  for (const account of activeAccounts) {
    if (account.userId !== ownerId || account.deleted) {
      throw new Error(READ_MODEL_ERROR_CODES.ACCOUNT_OWNER_MISMATCH);
    }
    const persistedDefault: unknown = account.isDefault;
    if (typeof persistedDefault !== "boolean") {
      throw new Error(READ_MODEL_ERROR_CODES.INVALID_DEFAULT);
    }
  }
  return activeAccounts;
}

function fetchOwnedBankDetails(
  scope: CurrentUserDataScope,
  activeAccounts: readonly Account[]
): Promise<readonly BankDetails[]> {
  const banks = activeAccounts.filter((account) => account.type === "BANK");
  if (banks.length === 0) return Promise.resolve<readonly BankDetails[]>([]);

  return scope.queryChildrenOfOwnedParents(
    database.get<BankDetails>("bank_details"),
    banks,
    "account_id",
    Q.where("deleted", false)
  ).fetch();
}

function fetchOwnedSmsSenders(
  scope: CurrentUserDataScope,
  activeAccounts: readonly Account[]
): Promise<readonly AccountSmsSender[]> {
  if (activeAccounts.length === 0) {
    return Promise.resolve<readonly AccountSmsSender[]>([]);
  }
  return scope.queryChildrenOfOwnedParents(
    database.get<AccountSmsSender>("account_sms_senders"),
    activeAccounts,
    "account_id",
    Q.where("deleted", false)
  ).fetch();
}

async function readOwnedChildMetadata(
  scope: CurrentUserDataScope,
  activeAccounts: readonly Account[]
): Promise<OwnedChildMetadata> {
  const [bankDetails, senders] = await Promise.all([
    fetchOwnedBankDetails(scope, activeAccounts),
    fetchOwnedSmsSenders(scope, activeAccounts),
  ]);
  const bankParentIds = new Set(
    activeAccounts.filter((account) => account.type === "BANK").map((account) => account.id)
  );
  const activeAccountIds = new Set(activeAccounts.map((account) => account.id));
  return {
    bankDetailsByAccount: buildBankDetails(bankDetails, bankParentIds),
    senderNamesByAccount: buildSenderNames(senders, activeAccountIds),
  };
}

function buildLocalAccountSnapshots(
  accounts: readonly Account[],
  children: OwnedChildMetadata
): AccountReviewLocalAccountSnapshot[] {
  return accounts.map(
    (account): AccountReviewLocalAccountSnapshot => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      type: account.type,
      institutionId: account.institutionId ?? null,
      providerDisplayName: account.providerDisplayName ?? null,
      cardLast4: account.type === "BANK"
        ? cardSuffixFromBankDetails(children.bankDetailsByAccount.get(account.id))
        : null,
      senderNames: children.senderNamesByAccount.get(account.id) ?? [],
      isDefault: account.isDefault,
    })
  );
}

function createProviderContext(
  currency: AccountReviewRequestContext["preferredCurrency"],
  accounts: readonly AccountReviewLocalAccountSnapshot[]
): AccountReviewRequestContext {
  return accountReviewRequestContextSchema.parse({
    reviewContractVersion: "account-review/v2",
    preferredCurrency: currency,
    accounts: accounts.map(projectProviderAccount),
  });
}

/**
 * Read all current-owner account context locally and in bounded batches.
 * If auth changes while reads are in flight, release no review/provider data.
 */
export async function loadAccountReviewAccountSnapshots(): Promise<AccountReviewAccountSnapshots> {
  const scope = await getCurrentUserDataScope();
  const { accounts, profiles } = await readOwnedAccountsAndProfiles(scope);
  const profile = requireOwnedActiveProfile(profiles, scope.userId);
  const activeAccounts = validateOwnedActiveAccounts(accounts, scope.userId);
  const children = await readOwnedChildMetadata(scope, activeAccounts);
  const localAccounts = buildLocalAccountSnapshots(activeAccounts, children);
  const providerContext = createProviderContext(profile.preferredCurrency, localAccounts);

  // Preserve the captured scope; a late owner change must fail before exposure.
  if ((await getRequiredCurrentUserId()) !== scope.userId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  return {
    ownerId: scope.userId,
    preferredCurrency: providerContext.preferredCurrency,
    accounts: localAccounts,
    providerContext,
  };
}
