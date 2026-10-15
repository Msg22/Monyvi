/**
 * #395 T008 pure owner-scoped fixture-role records. No DB writes or seeding.
 * Mutable mocks and Jest factories remain in the owning test file.
 */
import type { AccountReviewAccountContext } from "@monyvi/logic";
import type { AccountReviewLocalAccountSnapshot } from "@/services/account-review-read-model-service";

export const CURRENT_OWNER = "1eea0000-3950-4000-8000-000000009001";
export const ANOTHER_OWNER = "1eea0000-3950-4000-8000-000000009002";

export type AccountRole = "cash" | "qnbEveryday" | "qnbSavings" | "cibMain" | "wallet";
type DescriptorScene = (typeof manifest.scenes)[number];
type DescriptorRow = DescriptorScene["rows"][number];
type DescriptorIssueTag = DescriptorRow["issueTags"][number];

interface RoleDefinition {
  readonly role: AccountRole;
  readonly account: Omit<AccountReviewAccountContext, "id">;
}
export interface ScopedCategoryRecord {
  readonly id: string;
  readonly userId: string;
  readonly deleted: boolean;
  readonly displayName: string;
  readonly systemName: string;
  readonly level: number;
  readonly type: "EXPENSE";
  readonly isSystem: boolean;
}
// Runtime records have user-specific persisted IDs different from every
// static catalogue account/category ID. This is a test-owned input fixture,
// not a DB seed, mutation or production fixture-loader implementation.
const ACCOUNT_ROLES: readonly RoleDefinition[] = [
  {
    role: "cash",
    account: {
      name: "Cash", type: "CASH", currency: "EGP",
      institutionId: null, providerDisplayName: null, cardLast4: null,
      senderNames: [],
    },
  },
  {
    role: "qnbEveryday",
    account: {
      name: "QNB Everyday", type: "BANK", currency: "EGP",
      institutionId: "qnb", providerDisplayName: "QNB", cardLast4: "0007",
      senderNames: ["QNB"],
    },
  },
  {
    role: "qnbSavings",
    account: {
      name: "QNB Savings", type: "BANK", currency: "EGP",
      institutionId: "qnb", providerDisplayName: "QNB", cardLast4: "9221",
      senderNames: ["QNB"],
    },
  },
  {
    role: "cibMain",
    account: {
      name: "CIB Main", type: "BANK", currency: "EGP",
      institutionId: "cib", providerDisplayName: "CIB", cardLast4: "5566",
      senderNames: ["CIB"],
    },
  },
  {
    role: "wallet",
    account: {
      name: "Wallet", type: "DIGITAL_WALLET", currency: "USD",
      institutionId: null, providerDisplayName: "Mobile Wallet", cardLast4: null,
      senderNames: ["WALLET"],
    },
  },
];

const ROLE_IDS: Readonly<
  Record<string, Readonly<Record<AccountRole, string>>>
> = {
  [CURRENT_OWNER]: {
    cash: "2eea0000-3950-4000-8000-000000001001",
    qnbEveryday: "2eea0000-3950-4000-8000-000000001002",
    qnbSavings: "2eea0000-3950-4000-8000-000000001003",
    cibMain: "2eea0000-3950-4000-8000-000000001004",
    wallet: "2eea0000-3950-4000-8000-000000001005",
  },
  [ANOTHER_OWNER]: {
    cash: "3eea0000-3950-4000-8000-000000001001",
    qnbEveryday: "3eea0000-3950-4000-8000-000000001002",
    qnbSavings: "3eea0000-3950-4000-8000-000000001003",
    cibMain: "3eea0000-3950-4000-8000-000000001004",
    wallet: "3eea0000-3950-4000-8000-000000001005",
  },
};
export const OWNER_CATEGORY_IDS: Readonly<Record<string, string>> = {
  [CURRENT_OWNER]: "2eea0000-3950-4000-8000-000000002001",
  [ANOTHER_OWNER]: "3eea0000-3950-4000-8000-000000002001",
};

export interface AccountRecordFixtureOptions {
  readonly missingAccountIds: ReadonlySet<string>;
  readonly deletedAccountIds: ReadonlySet<string>;
  readonly foreignAccountIds: ReadonlySet<string>;
  readonly accountOverrides: ReadonlyMap<string, Partial<AccountReviewLocalAccountSnapshot>>;
  readonly extraAccounts: readonly {
    readonly userId: string;
    readonly account: AccountReviewLocalAccountSnapshot;
  }[];
}

export interface CategoryRecordFixtureOptions {
  readonly missingCategoryIds: ReadonlySet<string>;
  readonly deletedCategoryIds: ReadonlySet<string>;
  readonly foreignCategoryIds: ReadonlySet<string>;
}

export function getRoleId(ownerId: string, role: AccountRole): string {
  const id = ROLE_IDS[ownerId]?.[role];
  if (!id) throw new Error("Synthetic current-owner role is not available");
  return id;
}

export function buildAccountRecordsForOwner(
  ownerId: string,
  options: AccountRecordFixtureOptions
): AccountReviewLocalAccountSnapshot[] {
  const accounts = ACCOUNT_ROLES.map(({ role, account }) => {
    const id = getRoleId(ownerId, role);
    return {
      id,
      name: account.name,
      currency: account.currency,
      type: account.type,
      institutionId: account.institutionId,
      providerDisplayName: account.providerDisplayName,
      cardLast4: account.cardLast4,
      senderNames: [...account.senderNames],
      isDefault: role === "cash",
      ...options.accountOverrides.get(id),
    };
  });
  return [
    ...accounts,
    ...options.extraAccounts
      .filter((entry) => entry.userId === ownerId)
      .map((entry) => ({ ...entry.account, senderNames: [...entry.account.senderNames] })),
  ].filter((account) =>
    !options.missingAccountIds.has(account.id) &&
    !options.deletedAccountIds.has(account.id) &&
    !options.foreignAccountIds.has(account.id)
  );
}

export function buildScopedCategoryForOwner(
  ownerId: string,
  options: CategoryRecordFixtureOptions
): ScopedCategoryRecord[] {
  const id = OWNER_CATEGORY_IDS[ownerId];
  if (
    !id ||
    options.missingCategoryIds.has(id) ||
    options.deletedCategoryIds.has(id) ||
    options.foreignCategoryIds.has(id)
  ) {
    return [];
  }
  return [{
    id,
    userId: ownerId,
    deleted: false,
    displayName: "Other",
    systemName: "other",
    level: 1,
    type: "EXPENSE",
    isSystem: false,
  }];
}

export function accountProviderProjection(
  account: AccountReviewLocalAccountSnapshot
): AccountReviewAccountContext {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    institutionId: account.institutionId,
    providerDisplayName: account.providerDisplayName,
    cardLast4: account.cardLast4,
    senderNames: [...account.senderNames],
  };
}
