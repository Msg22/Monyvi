/**
 * #395 T008 pure owner-scoped fixture-role records. No DB writes or seeding.
 * Mutable mocks and Jest factories remain in the owning test file.
 */
import type {
  AccountReviewAccountContext,
  AccountReviewSession,
} from "@monyvi/logic";
import type { AccountReviewLocalAccountSnapshot } from "@/services/account-review-read-model-service";
import manifest from "../../e2e/fixtures/shared-account-review.json";

export const CURRENT_OWNER = "1eea0000-3950-4000-8000-000000009001";
export const ANOTHER_OWNER = "1eea0000-3950-4000-8000-000000009002";

export type AccountRole = "cash" | "qnbEveryday" | "qnbSavings" | "cibMain" | "wallet";
export type DescriptorScene = (typeof manifest.scenes)[number];
export type DescriptorRow = DescriptorScene["rows"][number];
export type DescriptorIssueTag = DescriptorRow["issueTags"][number];

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

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;
type ReviewRow = AccountReviewSession["rows"][number];

function assertSessionOverview(
  session: AccountReviewSession,
  scene: DescriptorScene,
  ownerId: string
): void {
  expect(session.ownerId).toBe(ownerId);
  expect(session.sessionId).toMatch(UUID_V4_PATTERN);
  expect(session.source).toBe(scene.source);
  expect(session.preferredCurrency).toBe("EGP");
  expect(session.sourceRevision).toMatch(/^(0|[1-9][0-9]*)$/);
  expect(session.revision).toMatch(/^(0|[1-9][0-9]*)$/);
  expect(session.operationGeneration).toMatch(/^(0|[1-9][0-9]*)$/);
  expect(session.saveIntent).toBeNull();
  expect(session.rows).toHaveLength(scene.expectedCounts.total);
  expect(session.groups).toHaveLength(scene.groups.length);
  expect(session.rows.filter(({ selected }) => selected)).toHaveLength(
    scene.expectedCounts.selected
  );
  expect(session.rows.filter(({ reviewReasons }) => reviewReasons.length > 0))
    .toHaveLength(scene.expectedCounts.needsReview);
  expect(session.groups.map(({ status }) => status).sort())
    .toEqual(scene.groups.map(({ status }) => status).sort());
}

function assertReviewRowSource(row: ReviewRow): void {
  if (row.source === "SMS") {
    expect(row.sourceFingerprint).toMatch(SHA_256_PATTERN);
    expect(row.sourceFingerprint).toBe(row.transaction.smsFingerprint);
    expect(row.transaction.senderDisplayName).not.toBe("");
    expect(row.transaction.rawSmsBody).not.toBe("");
  } else {
    expect(row.sourceFingerprint).toBeNull();
  }
}

function assertReviewRowFinancial(
  row: ReviewRow,
  descriptor: DescriptorRow,
  session: AccountReviewSession,
  accessibleCategories: ReadonlySet<string>
): void {
  expect(row.rowId).toMatch(UUID_V4_PATTERN);
  expect(row.source).toBe(session.source);
  expect(row.transaction.source).toBe(session.source);
  expect(row.transaction.date).toBeInstanceOf(Date);
  expect(row.transaction.categoryId).toMatch(UUID_V4_PATTERN);
  expect(accessibleCategories.has(row.transaction.categoryId)).toBe(true);
  expect(row.transaction.categoryId).not.toBe(manifest.syntheticCategoryId);
  expect(row.amountDecimal).toBe(descriptor.amountDecimal);
  expect(row.selected).toBe(descriptor.selected);
  expect(row.reviewReasons.length > 0).toBe(descriptor.issueTags.length > 0);
  if (
    "currencyEvidenceState" in descriptor &&
    descriptor.currencyEvidenceState === "omitted"
  ) {
    expect(row.currency).toEqual({
      state: "known", code: session.preferredCurrency, origin: "preferred_omission",
    });
  }
  if (descriptor.currencyCode === null) {
    expect(row.currency.state).toBe("unconfirmed");
    expect(row.selected).toBe(false);
    expect(row.assignment.state).toBe("unresolved");
  }
}

function assertReviewRowAssignments(
  row: ReviewRow,
  session: AccountReviewSession,
  allowedAccounts: ReadonlySet<string>,
  staticAccounts: ReadonlySet<string>
): void {
  for (const id of row.accountEvidence.candidateAccountIds) {
    expect(allowedAccounts.has(id)).toBe(true);
  }
  const assignment = row.assignment;
  if (assignment.state === "existing") {
    expect(allowedAccounts.has(assignment.accountId)).toBe(true);
    expect(staticAccounts.has(assignment.accountId)).toBe(false);
    if (row.currency.state === "known") {
      expect(assignment.currency).toBe(row.currency.code);
    }
  }
  if (assignment.state === "suggested") {
    const group = session.groups.find(({ groupId }) => groupId === assignment.groupId);
    expect(group?.linkedRowIds).toContain(row.rowId);
    expect(group?.revision).toBe(assignment.groupRevision);
    expect(group?.status).toBe(assignment.confirmation);
    expect(row.currency.state).toBe("known");
  }
  if (row.transaction.accountId !== undefined) {
    expect(allowedAccounts.has(row.transaction.accountId)).toBe(true);
    expect(staticAccounts.has(row.transaction.accountId)).toBe(false);
  }
  if (row.toAssignment?.state === "existing") {
    expect(allowedAccounts.has(row.toAssignment.accountId)).toBe(true);
    expect(staticAccounts.has(row.toAssignment.accountId)).toBe(false);
    expect(row.source).toBe("SMS");
    if (assignment.state === "existing") {
      expect(row.toAssignment.accountId).not.toBe(assignment.accountId);
    }
  }
  if (row.source === "SMS" && row.transaction.toAccountId !== undefined) {
    expect(allowedAccounts.has(row.transaction.toAccountId)).toBe(true);
  }
}

function assertSessionGroupLinks(
  session: AccountReviewSession,
  rowIds: ReadonlySet<string>
): void {
  for (const group of session.groups) {
    expect(group.groupId).toMatch(UUID_V4_PATTERN);
    expect(group.evidenceKey).toMatch(SHA_256_PATTERN);
    expect(group.revision).toMatch(/^(0|[1-9][0-9]*)$/);
    for (const linked of group.linkedRowIds) {
      expect(rowIds.has(linked)).toBe(true);
      if (group.status !== "removed") {
        const row = session.rows.find(({ rowId }) => rowId === linked);
        expect(row?.assignment.state).toBe("suggested");
      }
    }
    if (group.status === "removed") {
      expect(session.removedEvidenceKeys).toContain(group.evidenceKey);
    }
  }
}

/** Full real session assertions, bound to distinct authenticated fixture rows. */
export function assertOwnedSessionReferencesForFixture(
  session: AccountReviewSession,
  scene: DescriptorScene,
  ownerId: string,
  accounts: readonly AccountReviewLocalAccountSnapshot[],
  categories: readonly ScopedCategoryRecord[]
): void {
  const allowedAccounts = new Set(accounts.map(({ id }) => id));
  const accessibleCategories = new Set(categories.map(({ id }) => id));
  const staticAccounts = new Set(manifest.accountContext.accounts.map(({ id }) => id));
  const rowIds = new Set<string>();
  const sourceRefs = new Set<string>();
  assertSessionOverview(session, scene, ownerId);
  for (const [index, row] of session.rows.entries()) {
    const descriptor = scene.rows[index];
    if (!descriptor) throw new Error("Review session has an unregistered row");
    expect(rowIds.has(row.rowId)).toBe(false);
    rowIds.add(row.rowId);
    expect(sourceRefs.has(row.sourceRef)).toBe(false);
    sourceRefs.add(row.sourceRef);
    assertReviewRowFinancial(row, descriptor, session, accessibleCategories);
    assertReviewRowAssignments(row, session, allowedAccounts, staticAccounts);
    assertReviewRowSource(row);
  }
  assertSessionGroupLinks(session, rowIds);
}
