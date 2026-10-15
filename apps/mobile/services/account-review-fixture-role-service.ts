/**
 * #395 T015 — strict current-owner E2E account/category bindings.
 * Descriptor IDs are aliases only; never persisted financial identities.
 * All reads use T010 or the current-user accessible category scope.
 */
import { Q } from "@nozbe/watermelondb";
import { database, type Category } from "@monyvi/db";
import {
  accountReviewRequestContextSchema,
  type AccountReviewAccountContext,
} from "@monyvi/logic";
import manifest from "../e2e/fixtures/shared-account-review.json";
import {
  loadAccountReviewAccountSnapshots,
  type AccountReviewAccountSnapshots,
  type AccountReviewLocalAccountSnapshot,
} from "./account-review-read-model-service";
import { getCurrentUserDataScope, getRequiredCurrentUserId } from "./user-data-access";
import { USER_DATA_ACCESS_ERROR_CODES } from "./user-data-access-error-codes";

export interface FixtureBindings {
  readonly ownerId: string;
  readonly snapshots: AccountReviewAccountSnapshots;
  readonly accountByDescriptorId: ReadonlyMap<string, AccountReviewLocalAccountSnapshot>;
  readonly category: Category;
}

function equalSenderNames(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

function matchesDescriptorAccount(
  candidate: AccountReviewLocalAccountSnapshot,
  descriptor: AccountReviewAccountContext
): boolean {
  return candidate.name === descriptor.name &&
    candidate.type === descriptor.type &&
    candidate.currency === descriptor.currency &&
    candidate.institutionId === descriptor.institutionId &&
    candidate.providerDisplayName === descriptor.providerDisplayName &&
    candidate.cardLast4 === descriptor.cardLast4 &&
    equalSenderNames(candidate.senderNames, descriptor.senderNames);
}

function bindExactAccounts(
  snapshots: AccountReviewAccountSnapshots
): ReadonlyMap<string, AccountReviewLocalAccountSnapshot> {
  const bindings = new Map<string, AccountReviewLocalAccountSnapshot>();
  const usedIds = new Set<string>();
  for (const descriptor of manifest.accountContext.accounts) {
    const candidates = snapshots.accounts.filter((account) =>
      matchesDescriptorAccount(account, descriptor)
    );
    const match = candidates[0];
    if (candidates.length !== 1 || match === undefined || usedIds.has(match.id)) {
      throw new Error("ACCOUNT_REVIEW_FIXTURE_ACCOUNT_ROLE_UNAVAILABLE");
    }
    bindings.set(descriptor.id, match);
    usedIds.add(match.id);
  }
  return bindings;
}

function requireDefaultRole(
  snapshots: AccountReviewAccountSnapshots,
  bindings: ReadonlyMap<string, AccountReviewLocalAccountSnapshot>
): void {
  const defaultAccount = bindings.get(manifest.defaultAccountId);
  const actualDefaults = snapshots.accounts.filter((account) => account.isDefault);
  if (
    defaultAccount === undefined ||
    actualDefaults.length !== 1 ||
    actualDefaults[0]?.id !== defaultAccount.id ||
    defaultAccount.type !== "CASH" ||
    defaultAccount.currency !== snapshots.preferredCurrency
  ) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_DEFAULT_ROLE_UNAVAILABLE");
  }
}

function isAccessibleCategory(category: Category, ownerId: string): boolean {
  return category.deleted === false &&
    category.isHidden !== true &&
    category.isInternal !== true &&
    category.systemName === "other" &&
    category.type === "EXPENSE" &&
    ((category.isSystem && (category.userId === null || category.userId === undefined)) ||
      category.userId === ownerId);
}

function selectUniqueCategory(categories: readonly Category[], ownerId: string): Category {
  const eligible = categories.filter((category) => isAccessibleCategory(category, ownerId));
  const category = eligible[0];
  if (eligible.length !== 1 || category === undefined) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_CATEGORY_UNAVAILABLE");
  }
  return category;
}

async function readAccessibleCategory(ownerId: string): Promise<Category> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  const records = await scope
    .queryAccessibleCategories(database.get<Category>("categories"), Q.where("deleted", false))
    .fetch();
  return selectUniqueCategory(records, ownerId);
}

/** Capture real current-owned account identities and one active category. */
export async function loadFixtureBindings(ownerId: string): Promise<FixtureBindings> {
  const snapshots = await loadAccountReviewAccountSnapshots();
  if (snapshots.ownerId !== ownerId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  accountReviewRequestContextSchema.parse(snapshots.providerContext);
  const accountByDescriptorId = bindExactAccounts(snapshots);
  requireDefaultRole(snapshots, accountByDescriptorId);
  const category = await readAccessibleCategory(ownerId);
  if ((await getRequiredCurrentUserId()) !== ownerId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  return { ownerId, snapshots, accountByDescriptorId, category };
}

/** A suggestion must match one real role; no account is created or confirmed. */
export function requireGroupIdentity(
  bindings: FixtureBindings,
  group: (typeof manifest.scenes)[number]["groups"][number]
): AccountReviewLocalAccountSnapshot {
  const matching = [...bindings.accountByDescriptorId.values()].filter((account) =>
    account.type === group.type &&
    account.currency === group.currency &&
    account.cardLast4 === group.cardLast4 &&
    account.providerDisplayName === group.name
  );
  if (matching.length !== 1 || matching[0] === undefined) {
    throw new Error("ACCOUNT_REVIEW_FIXTURE_GROUP_IDENTITY_UNAVAILABLE");
  }
  return matching[0];
}
