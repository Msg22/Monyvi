import { isE2eTestMode } from "@/config/e2e-test-config";
import type {
  AccountReviewAccountContext,
  AccountReviewRequestContext,
  AccountReviewSession,
} from "@monyvi/logic";
import type {
  AccountReviewAccountSnapshots,
  AccountReviewLocalAccountSnapshot,
} from "@/services/account-review-read-model-service";
import manifest from "../../e2e/fixtures/shared-account-review.json";

const CURRENT_OWNER = "1eea0000-3950-4000-8000-000000009001";
const ANOTHER_OWNER = "1eea0000-3950-4000-8000-000000009002";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;

type AccountRole = "cash" | "qnbEveryday" | "qnbSavings" | "cibMain" | "wallet";
type DescriptorScene = (typeof manifest.scenes)[number];
type DescriptorRow = DescriptorScene["rows"][number];
type DescriptorIssueTag = DescriptorRow["issueTags"][number];

interface RoleDefinition {
  readonly role: AccountRole;
  readonly account: Omit<AccountReviewAccountContext, "id">;
}
interface ScopedCategoryRecord {
  readonly id: string;
  readonly userId: string;
  readonly deleted: boolean;
  readonly displayName: string;
  readonly systemName: string;
  readonly level: number;
  readonly type: "EXPENSE";
  readonly isSystem: boolean;
}
interface ScopedCategoryQuery {
  readonly fetch: () => Promise<readonly ScopedCategoryRecord[]>;
}
interface ScopedCategoryScope {
  readonly userId: string;
  readonly queryOwned: (collection: { readonly table: string }) => ScopedCategoryQuery;
  readonly queryAccessibleCategories: (
    collection: { readonly table: string }
  ) => ScopedCategoryQuery;
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
const OWNER_CATEGORY_IDS: Readonly<Record<string, string>> = {
  [CURRENT_OWNER]: "2eea0000-3950-4000-8000-000000002001",
  [ANOTHER_OWNER]: "3eea0000-3950-4000-8000-000000002001",
};

let mockActiveOwnerId: string | null = CURRENT_OWNER;
let mockSnapshotReadGate: Promise<void> | null = null;
let mockNotifySnapshotStarted: (() => void) | null = null;
const mockMissingAccountIds = new Set<string>();
const mockDeletedAccountIds = new Set<string>();
const mockForeignAccountIds = new Set<string>();
const mockMissingCategoryIds = new Set<string>();
const mockDeletedCategoryIds = new Set<string>();
const mockForeignCategoryIds = new Set<string>();
const mockAccountOverrides = new Map<string, Partial<AccountReviewLocalAccountSnapshot>>();
const mockExtraAccounts: Array<{
  readonly userId: string;
  readonly account: AccountReviewLocalAccountSnapshot;
}> = [];
const mockCategoryScopeCalls: Array<{ readonly ownerId: string; readonly mode: string }> = [];

function getRoleId(ownerId: string, role: AccountRole): string {
  const id = ROLE_IDS[ownerId]?.[role];
  if (!id) throw new Error("Synthetic current-owner role is not available");
  return id;
}

function accountRecordsForOwner(ownerId: string): AccountReviewLocalAccountSnapshot[] {
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
      ...mockAccountOverrides.get(id),
    };
  });
  return [
    ...accounts,
    ...mockExtraAccounts
      .filter((entry) => entry.userId === ownerId)
      .map((entry) => ({ ...entry.account, senderNames: [...entry.account.senderNames] })),
  ].filter((account) =>
    !mockMissingAccountIds.has(account.id) &&
    !mockDeletedAccountIds.has(account.id) &&
    !mockForeignAccountIds.has(account.id)
  );
}

function scopedCategoryForOwner(ownerId: string): ScopedCategoryRecord[] {
  const id = OWNER_CATEGORY_IDS[ownerId];
  if (
    !id ||
    mockMissingCategoryIds.has(id) ||
    mockDeletedCategoryIds.has(id) ||
    mockForeignCategoryIds.has(id)
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

function accountProviderProjection(
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

const mockDatabaseWrite = jest.fn(
  (): Promise<never> =>
    Promise.reject(new Error("Fixture entry cannot write financial records"))
);
const mockUnscopedFetch = jest.fn(
  (): Promise<never> =>
    Promise.reject(new Error("Fixture reads must be authenticated and scoped"))
);
const mockProviderCall = jest.fn(
  (..._args: readonly unknown[]): Promise<never> =>
    Promise.reject(new Error("Fixture entry cannot call an AI/provider endpoint"))
);
const mockGetRequiredCurrentUserId = jest.fn((): Promise<string> =>
  mockActiveOwnerId === null
    ? Promise.reject(new Error("USER_REQUIRED"))
    : Promise.resolve(mockActiveOwnerId)
);

const mockLoadAccountReviewAccountSnapshots = jest.fn(
  async (): Promise<AccountReviewAccountSnapshots> => {
    const ownerId = await mockGetRequiredCurrentUserId();
    if (mockSnapshotReadGate !== null) {
      mockNotifySnapshotStarted?.();
      await mockSnapshotReadGate;
    }
    const accounts = accountRecordsForOwner(ownerId);
    const providerContext: AccountReviewRequestContext = {
      reviewContractVersion: "account-review/v2",
      preferredCurrency: "EGP",
      accounts: accounts.map(accountProviderProjection),
    };
    return {
      ownerId,
      preferredCurrency: providerContext.preferredCurrency,
      accounts,
      providerContext,
    };
  }
);

const mockGetCurrentUserDataScope = jest.fn(
  (): Promise<ScopedCategoryScope> =>
    mockGetRequiredCurrentUserId().then((userId): ScopedCategoryScope => {
      const makeQuery = (
        mode: string,
        collection: { readonly table: string }
      ): ScopedCategoryQuery => {
        mockCategoryScopeCalls.push({ ownerId: userId, mode });
        return {
          fetch: (): Promise<readonly ScopedCategoryRecord[]> =>
            Promise.resolve(
              collection.table === "categories" ? scopedCategoryForOwner(userId) : []
            ),
        };
      };
      return {
        userId,
        queryOwned: (collection): ScopedCategoryQuery => makeQuery("owned", collection),
        queryAccessibleCategories: (collection): ScopedCategoryQuery =>
          makeQuery("accessible", collection),
      };
    })
);

jest.mock("@monyvi/db", () => ({
  database: {
    write: (): Promise<never> => mockDatabaseWrite(),
    get: (table: string): object => ({
      table,
      query: (): object => ({ fetch: (): Promise<never> => mockUnscopedFetch() }),
    }),
  },
}));
jest.mock("@/services/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: readonly unknown[]): Promise<never> => mockProviderCall(...args),
    },
  },
}));
jest.mock("@/services/authenticated-edge-function-service", () => ({
  invokeAuthenticatedEdgeFunction: (
    ...args: readonly unknown[]
  ): Promise<never> => mockProviderCall(...args),
}));
jest.mock("@/services/user-data-access", () => ({
  getRequiredCurrentUserId: (): Promise<string> =>
    mockGetRequiredCurrentUserId(),
  getCurrentUserDataScope: (): ReturnType<typeof mockGetCurrentUserDataScope> =>
    mockGetCurrentUserDataScope(),
}));
jest.mock("@/services/account-review-read-model-service", () => ({
  loadAccountReviewAccountSnapshots: (): ReturnType<
    typeof mockLoadAccountReviewAccountSnapshots
  > => mockLoadAccountReviewAccountSnapshots(),
}));

function hasDescriptorIssueTag(row: DescriptorRow, tag: DescriptorIssueTag): boolean {
  const issueTags: readonly DescriptorIssueTag[] = row.issueTags;
  return issueTags.includes(tag);
}

// Use normal synchronous Jest module loading: dynamic import needs VM module
// flags that are not part of this repository's Jest runner.
function resolveRuntimeFixtureEntry(): (sceneId: string) => Promise<unknown> {
  // This is the REAL future T015 SUT. Never mock or virtualize it.
  const { loadAccountReviewFixtureSession } = jest.requireActual<
    typeof import("@/services/account-review-fixture-service")
  >("@/services/account-review-fixture-service");
  if (typeof loadAccountReviewFixtureSession !== "function") {
    throw new Error("T015 fixture entry export is unavailable");
  }
  return loadAccountReviewFixtureSession;
}

function parseHydratedSession(value: unknown): AccountReviewSession {
  const { accountReviewSessionSchema } = jest.requireActual<
    typeof import("@monyvi/logic")
  >("@monyvi/logic");
  return accountReviewSessionSchema.parse(value);
}

function loadRuntimeFixtureSession(sceneId: string): Promise<unknown> {
  const loadFixture = resolveRuntimeFixtureEntry();
  return loadFixture(sceneId);
}

function findScene(id: string): DescriptorScene {
  const scene = manifest.scenes.find((candidate) => candidate.id === id);
  if (!scene) {
    throw new Error(`Missing synthetic #395 scene ${id}`);
  }
  return scene;
}

function assertNoFixtureSideEffects(): void {
  expect(mockDatabaseWrite).not.toHaveBeenCalled();
  expect(mockUnscopedFetch).not.toHaveBeenCalled();
  expect(mockProviderCall).not.toHaveBeenCalled();
}

function assertOwnedSessionReferences(
  session: AccountReviewSession,
  scene: DescriptorScene,
  ownerId: string
): void {
  const allowedAccounts = new Set(accountRecordsForOwner(ownerId).map(({ id }) => id));
  const accessibleCategories = new Set(scopedCategoryForOwner(ownerId).map(({ id }) => id));
  const staticAccounts = new Set(manifest.accountContext.accounts.map(({ id }) => id));
  const rowIds = new Set<string>();
  const sourceRefs = new Set<string>();

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

  for (const [index, row] of session.rows.entries()) {
    const descriptor = scene.rows[index];
    if (!descriptor) throw new Error("Review session has an unregistered row");
    expect(row.rowId).toMatch(UUID_V4_PATTERN);
    expect(rowIds.has(row.rowId)).toBe(false);
    rowIds.add(row.rowId);
    expect(sourceRefs.has(row.sourceRef)).toBe(false);
    sourceRefs.add(row.sourceRef);
    expect(row.source).toBe(scene.source);
    expect(row.transaction.source).toBe(scene.source);
    expect(row.transaction.date).toBeInstanceOf(Date);
    expect(row.transaction.categoryId).toMatch(UUID_V4_PATTERN);
    expect(accessibleCategories.has(row.transaction.categoryId)).toBe(true);
    expect(row.transaction.categoryId).not.toBe(manifest.syntheticCategoryId);
    expect(row.amountDecimal).toBe(descriptor.amountDecimal);
    expect(row.selected).toBe(descriptor.selected);
    expect(row.reviewReasons.length > 0).toBe(descriptor.issueTags.length > 0);
    for (const candidateId of row.accountEvidence.candidateAccountIds) {
      expect(allowedAccounts.has(candidateId)).toBe(true);
    }
    if (row.assignment.state === "existing") {
      expect(allowedAccounts.has(row.assignment.accountId)).toBe(true);
      expect(staticAccounts.has(row.assignment.accountId)).toBe(false);
      if (row.currency.state === "known") {
        expect(row.assignment.currency).toBe(row.currency.code);
      }
    }
    if (row.assignment.state === "suggested") {
      const group = session.groups.find(({ groupId }) =>
        groupId === row.assignment.groupId
      );
      expect(group?.linkedRowIds).toContain(row.rowId);
      expect(group?.revision).toBe(row.assignment.groupRevision);
      expect(group?.status).toBe(row.assignment.confirmation);
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
      if (row.assignment.state === "existing") {
        expect(row.toAssignment.accountId).not.toBe(row.assignment.accountId);
      }
    }
    if (row.source === "SMS") {
      expect(row.sourceFingerprint).toMatch(SHA_256_PATTERN);
      expect(row.sourceFingerprint).toBe(row.transaction.smsFingerprint);
      expect(row.transaction.senderDisplayName).not.toBe("");
      expect(row.transaction.rawSmsBody).not.toBe("");
      if (row.transaction.toAccountId !== undefined) {
        expect(allowedAccounts.has(row.transaction.toAccountId)).toBe(true);
      }
    } else {
      expect(row.sourceFingerprint).toBeNull();
    }
    if (descriptor.currencyEvidenceState === "omitted") {
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

describe("T008 #395 bounded fixture descriptor contract", () => {
  it("is synthetic, current-user-only, non-production and contains no hosted seed or runtime claims", () => {
    expect(manifest.format).toBe(
      "monyvi-account-review-fixture-descriptors/v1"
    );
    expect(manifest.synthetic).toBe(true);
    expect(manifest.productionEntryAllowed).toBe(false);
    expect(manifest.ownerBinding).toBe("authenticated-current-user-only");
    expect(manifest.scenarios.every((scenario) => !scenario.maestroExecuted))
      .toBe(true);
    expect(manifest.scenarios.every((scenario) => scenario.fixtureAuthoringOnly))
      .toBe(true);

    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toMatch(/"ownerId"\s*:/);
    expect(serialized).not.toMatch(/"accountNumber"\s*:/);
    expect(serialized).not.toMatch(/"balance"\s*:/);
    expect(serialized).not.toMatch(/"rawSmsBody"\s*:/);
    expect(serialized).not.toMatch(/"accessToken"\s*:/);
    expect(serialized).not.toMatch(/"password"\s*:/);
    expect(serialized).not.toMatch(/"providerApiKey"\s*:/);
    expect(serialized).not.toContain("localhost:54321");
  });

  it("describes a privacy-safe preferred-currency request context without requiring the future Zod export", () => {
    const context = manifest.accountContext;
    expect(context.reviewContractVersion).toBe("account-review/v2");
    expect(context.preferredCurrency).toBe("EGP");
    expect(context.accounts).toHaveLength(5);
    expect(context.accounts.every((account) => UUID_V4_PATTERN.test(account.id)))
      .toBe(true);
    expect(context.accounts.some((account) => account.type === "CASH"))
      .toBe(true);
    expect(context.accounts.some((account) => account.type === "BANK"))
      .toBe(true);
    expect(
      context.accounts.some((account) => account.type === "DIGITAL_WALLET")
    ).toBe(true);
    expect(context.accounts.map((account) => account.id)).not.toContain(
      manifest.excludedAccountRefs.deletedAccountId
    );
    expect(context.accounts.map((account) => account.id)).not.toContain(
      manifest.excludedAccountRefs.foreignAccountId
    );
  });

  it("maps every manual M01–M20 case to an explicit boundary without claiming E2E execution", () => {
    const expectedIds = Array.from(
      { length: 20 },
      (_, index) => `M${String(index + 1).padStart(2, "0")}`
    );
    expect(manifest.scenarios.map((caseData) => caseData.id).sort()).toEqual(
      expectedIds
    );
    const sceneIds = new Set(manifest.scenes.map((scene) => scene.id));
    expect(sceneIds.size).toBe(manifest.scenes.length);
    for (const entry of manifest.scenarios) {
      expect(entry.requiredAssertion.trim()).not.toBe("");
      expect(entry.ownerOrSeparateTestBoundary.trim()).not.toBe("");
      for (const sceneId of entry.sceneIds) {
        expect(sceneIds.has(sceneId)).toBe(true);
      }
    }
    expect(manifest.scenarios.find((value) => value.id === "M12")?.sceneIds)
      .toEqual([]);
    expect(manifest.scenarios.find((value) => value.id === "M18")?.sceneIds)
      .toEqual([]);
    for (const id of ["M14", "M17", "M19", "M20"]) {
      const boundary = manifest.scenarios.find((value) => value.id === id);
      expect(boundary?.maestroExecuted).toBe(false);
      expect(boundary?.ownerOrSeparateTestBoundary).toBeTruthy();
    }
  });

  it.each([
    { id: "r3-combined-en", total: 7, needsReview: 5, selected: 2 },
    { id: "r3-combined-ar", total: 7, needsReview: 5, selected: 2 },
    { id: "r3-removed-undo", total: 4, needsReview: 3, selected: 1 },
    { id: "r3-default-only", total: 2, needsReview: 0, selected: 2 },
    { id: "r3-issues-only", total: 4, needsReview: 4, selected: 0 },
    { id: "r3-confirmed-feedback", total: 4, needsReview: 0, selected: 1 },
    { id: "r3-clean", total: 2, needsReview: 0, selected: 2 },
    { id: "r3-selected-empty", total: 3, needsReview: 0, selected: 0 },
  ])(
    "preserves B1 counts for $id: total $total / review $needsReview / selected $selected",
    ({ id, total, needsReview, selected }) => {
      const scene = findScene(id);
      expect(scene.expectedCounts).toEqual({ total, needsReview, selected });
      expect(scene.rows).toHaveLength(total);
      expect(scene.rows.filter((row) => row.issueTags.length > 0)).toHaveLength(
        needsReview
      );
      expect(scene.rows.filter((row) => row.selected)).toHaveLength(selected);
      expect(
        scene.rows.filter(
          (row) => row.selected && row.issueTags.length > 0
        )
      ).toHaveLength(0);
    }
  );

  it("has valid stable UUID identifiers, real-shaped SMS fingerprints and consistent group linkage", () => {
    const allIds = new Set<string>();
    const accountIds = new Set(
      manifest.accountContext.accounts.map((account) => account.id)
    );
    for (const accountId of accountIds) {
      expect(accountId).toMatch(UUID_V4_PATTERN);
      expect(allIds.has(accountId)).toBe(false);
      allIds.add(accountId);
    }
    for (const scene of manifest.scenes) {
      expect(scene.sessionId).toMatch(UUID_V4_PATTERN);
      expect(allIds.has(scene.sessionId)).toBe(false);
      allIds.add(scene.sessionId);

      const fingerprints = new Set<string>();
      const refs = new Set<string>();
      for (const row of scene.rows) {
        expect(row.rowId).toMatch(UUID_V4_PATTERN);
        expect(row.categoryId).toMatch(UUID_V4_PATTERN);
        expect(allIds.has(row.rowId)).toBe(false);
        allIds.add(row.rowId);
        expect(refs.has(row.sourceRef)).toBe(false);
        refs.add(row.sourceRef);
        if (scene.source === "SMS") {
          expect(row.sourceFingerprint).toMatch(SHA_256_PATTERN);
          expect(fingerprints.has(row.sourceFingerprint ?? "")).toBe(false);
          fingerprints.add(row.sourceFingerprint ?? "");
        } else {
          expect(row.sourceFingerprint).toBeNull();
        }
        expect(row.groupId === null || row.accountId === null).toBe(true);
        if (row.accountId !== null) {
          expect(accountIds.has(row.accountId)).toBe(true);
        }
        if (row.toAccountId !== null) {
          expect(accountIds.has(row.toAccountId)).toBe(true);
        }
      }
      for (const group of scene.groups) {
        expect(group.groupId).toMatch(UUID_V4_PATTERN);
        expect(allIds.has(group.groupId)).toBe(false);
        allIds.add(group.groupId);
        expect(group.linkedRowIds.length).toBeGreaterThan(0);
        for (const rowId of group.linkedRowIds) {
          const match = scene.rows.find((row) => row.rowId === rowId);
          expect(match?.groupId).toBe(group.groupId);
        }
      }
      for (const row of scene.rows) {
        if (row.groupId !== null) {
          const parentGroup = scene.groups.find(
            (group) => group.groupId === row.groupId
          );
          expect(parentGroup?.linkedRowIds).toContain(row.rowId);
        }
      }
      expect(scene.expectedCounts.total).toBe(scene.rows.length);
    }
  });

  it("distinguishes Cash default source exclusion from a valid independent ATM destination", () => {
    const ordinarySms = findScene("sms-cash-ineligible");
    const atmSms = findScene("sms-atm-transfer");
    expect(ordinarySms.source).toBe("SMS");
    expect(ordinarySms.expectedCounts).toEqual({
      total: 1,
      needsReview: 1,
      selected: 0,
    });
    expect(ordinarySms.rows[0]?.accountId).toBeNull();
    expect(atmSms.rows[0]?.isAtmWithdrawal).toBe(true);
    expect(atmSms.rows[0]?.accountId).not.toBe(
      atmSms.rows[0]?.toAccountId
    );
    expect(atmSms.rows[0]?.toAccountId).toBe(manifest.defaultAccountId);
    expect(atmSms.rows[0]?.amountDecimal).toBe("25.05");
  });

  it("keeps proven omitted currency separate from conflicting unconfirmed currency", () => {
    const omitted = findScene("voice-currency-omitted");
    const conflict = findScene("r3-currency-conflict");

    expect(omitted.rows[0]).toMatchObject({
      currencyEvidenceState: "omitted",
      accountEvidenceState: "absent",
      currencyCode: manifest.accountContext.preferredCurrency,
      accountId: manifest.defaultAccountId,
      selected: true,
      issueTags: [],
    });
    expect(conflict.rows[0]).toMatchObject({
      currencyCode: null,
      accountId: null,
      selected: false,
      issueTags: ["currency_confirmation_needed"],
    });
    expect(omitted.source).toBe("VOICE");
    expect(conflict.source).toBe("SMS");
  });

  it("preserves confirmed-versus-selected independence and removal recovery facts", () => {
    const confirmed = findScene("r3-confirmed-feedback");
    expect(confirmed.groups).toHaveLength(2);
    expect(confirmed.groups.every((group) => group.status === "confirmed"))
      .toBe(true);
    expect(confirmed.rows.filter((row) => row.selected)).toHaveLength(1);
    const removed = findScene("r3-removed-undo");
    expect(removed.groups.some((group) => group.status === "removed"))
      .toBe(true);
    expect(removed.rows.filter((row) =>
      hasDescriptorIssueTag(row, "account_group_removed")
    )).toHaveLength(2);
    expect(removed.rows).toHaveLength(4);
  });
});

describe("T008 future current-owner fixture entry (Red before T015)", () => {
  const originalEnv = process.env;

  it("validates the safe request catalogue with the canonical Zod schema once T005 exists", () => {
    const { accountReviewRequestContextSchema } = jest.requireActual<
      typeof import("@monyvi/logic")
    >("@monyvi/logic");
    const context = accountReviewRequestContextSchema.parse(
      manifest.accountContext
    );
    expect(context.reviewContractVersion).toBe("account-review/v2");
    expect(context.accounts).toHaveLength(5);
  });

  beforeEach((): void => {
    jest.clearAllMocks();
    mockActiveOwnerId = CURRENT_OWNER;
    mockSnapshotReadGate = null;
    mockNotifySnapshotStarted = null;
    mockMissingAccountIds.clear();
    mockDeletedAccountIds.clear();
    mockForeignAccountIds.clear();
    mockMissingCategoryIds.clear();
    mockDeletedCategoryIds.clear();
    mockForeignCategoryIds.clear();
    mockAccountOverrides.clear();
    mockExtraAccounts.length = 0;
    mockCategoryScopeCalls.length = 0;
    process.env = {
      ...originalEnv,
      NODE_ENV: "test",
      EXPO_PUBLIC_MONYVI_TEST_MODE: "e2e",
      EXPO_PUBLIC_AI_SMS_PARSER_MODE: "fixture",
    };
  });

  afterEach((): void => {
    process.env = originalEnv;
  });

  it("accepts an explicit safe test-mode Voice entry and materializes the canonical current-user session", async () => {
    expect(isE2eTestMode()).toBe(true);

    const scene = findScene("r3-combined-en");
    const session = parseHydratedSession(
      await loadRuntimeFixtureSession(scene.id)
    );
    assertOwnedSessionReferences(session, scene, CURRENT_OWNER);

    expect(session.ownerId).toBe(CURRENT_OWNER);
    expect(session.source).toBe("VOICE");
    expect(session.rows).toHaveLength(7);
    expect(session.rows.filter((row) => row.selected)).toHaveLength(2);
    expect(session.groups).toHaveLength(2);
    expect(mockGetRequiredCurrentUserId).toHaveBeenCalled();
    expect(mockCategoryScopeCalls).toContainEqual({
      ownerId: CURRENT_OWNER, mode: "accessible",
    });
    assertNoFixtureSideEffects();
  });

  it("materializes SMS fingerprints in a current-owner session without calling hosted seed/write", async () => {
    const scene = findScene("sms-review-restart");
    const session = parseHydratedSession(
      await loadRuntimeFixtureSession(scene.id)
    );
    assertOwnedSessionReferences(session, scene, CURRENT_OWNER);

    expect(session.ownerId).toBe(CURRENT_OWNER);
    expect(session.source).toBe("SMS");
    expect(session.rows).toHaveLength(1);
    expect(session.rows[0]?.sourceFingerprint).toMatch(SHA_256_PATTERN);
    expect(session.groups).toHaveLength(1);
    // The loader constructs a session; only the real writer may subsequently Save.
    assertNoFixtureSideEffects();
  });

  it("rejects fixture entry when E2E mode is off", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "off";

    expect(isE2eTestMode()).toBe(false);
    // Resolve the future module OUTSIDE rejects; a missing module is not
    // proof that production/runtime gating rejected the fixture.
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("r3-default-only")).rejects.toThrow();
    expect(mockLoadAccountReviewAccountSnapshots).not.toHaveBeenCalled();
    assertNoFixtureSideEffects();
  });

  it("rejects fixture entry in production even with an E2E-looking environment", async () => {
    process.env.NODE_ENV = "production";
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";

    // Resolve the future module OUTSIDE rejects; a missing module is not
    // proof that production/runtime gating rejected the fixture.
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("r3-default-only")).rejects.toThrow();
    expect(mockLoadAccountReviewAccountSnapshots).not.toHaveBeenCalled();
    assertNoFixtureSideEffects();
  });

  it("does not construct a fixture for a signed-out user or infer an owner from the static catalog", async () => {
    mockActiveOwnerId = null;

    // Resolve the future module OUTSIDE rejects; a missing module is not
    // proof that production/runtime gating rejected the fixture.
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("r3-default-only")).rejects.toThrow();
    assertNoFixtureSideEffects();
  });

  it("binds the same scene to two owners with distinct real-shaped account and category IDs", async () => {
    const scene = findScene("r3-default-only");
    const first = parseHydratedSession(await loadRuntimeFixtureSession(scene.id));
    assertOwnedSessionReferences(first, scene, CURRENT_OWNER);
    expect(first.rows[0]?.assignment.state).toBe("existing");

    mockActiveOwnerId = ANOTHER_OWNER;
    const second = parseHydratedSession(await loadRuntimeFixtureSession(scene.id));
    assertOwnedSessionReferences(second, scene, ANOTHER_OWNER);
    expect(second.rows[0]?.assignment.state).toBe("existing");

    const firstAccountIds = new Set(
      accountRecordsForOwner(CURRENT_OWNER).map(({ id }) => id)
    );
    const secondAccountIds = new Set(
      accountRecordsForOwner(ANOTHER_OWNER).map(({ id }) => id)
    );
    expect([...secondAccountIds].some((id) => firstAccountIds.has(id))).toBe(false);
    const firstChoice = first.rows[0]?.assignment;
    const secondChoice = second.rows[0]?.assignment;
    if (firstChoice?.state !== "existing" || secondChoice?.state !== "existing") {
      throw new Error("A real current-owner default assignment is required");
    }
    expect(firstChoice.accountId).not.toBe(secondChoice.accountId);
    expect(mockCategoryScopeCalls).toContainEqual({
      ownerId: ANOTHER_OWNER,
      mode: "accessible",
    });
    assertNoFixtureSideEffects();
  });

  it("rejects an in-flight hydration if the authenticated owner switches after scoped reads begin", async () => {
    let release: () => void = (): void => undefined;
    let notify: () => void = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      notify = resolve;
    });
    mockSnapshotReadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockNotifySnapshotStarted = notify;

    const loadFixture = resolveRuntimeFixtureEntry();
    const inFlight = loadFixture("r3-default-only");
    const observed = await Promise.race([
      started.then(() => "scoped_read_started"),
      inFlight.then(() => "resolved_early", () => "rejected_early"),
    ]);
    try {
      expect(observed).toBe("scoped_read_started");
      mockActiveOwnerId = ANOTHER_OWNER;
    } finally {
      release();
    }
    await expect(inFlight).rejects.toThrow();
    assertNoFixtureSideEffects();
  });

  it("rejects relabeling another owner's static account IDs during user switching", async () => {
    const scene = findScene("r3-default-only");
    const first = parseHydratedSession(await loadRuntimeFixtureSession(scene.id));
    assertOwnedSessionReferences(first, scene, CURRENT_OWNER);

    mockActiveOwnerId = ANOTHER_OWNER;
    // A second owner has similar account names but not a current-owned default.
    const otherCashId = getRoleId(ANOTHER_OWNER, "cash");
    mockForeignAccountIds.add(otherCashId);
    const otherOwner = await mockLoadAccountReviewAccountSnapshots();
    expect(otherOwner.ownerId).toBe(ANOTHER_OWNER);
    expect(otherOwner.accounts.map(({ id }) => id)).not.toContain(otherCashId);
    expect(otherOwner.accounts.map(({ id }) => id))
      .not.toContain(manifest.defaultAccountId);

    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture(scene.id)).rejects.toThrow();
    assertNoFixtureSideEffects();
  });

  it.each([
    { reason: "missing", unavailable: mockMissingAccountIds },
    { reason: "deleted", unavailable: mockDeletedAccountIds },
    { reason: "foreign", unavailable: mockForeignAccountIds },
  ])(
    "rejects a $reason referenced account absent from the active owned snapshot",
    async ({ unavailable }) => {
      const cashId = getRoleId(CURRENT_OWNER, "cash");
      unavailable.add(cashId);
      const snapshot = await mockLoadAccountReviewAccountSnapshots();
      expect(snapshot.accounts.map(({ id }) => id)).not.toContain(cashId);

      const loadFixture = resolveRuntimeFixtureEntry();
      await expect(loadFixture("r3-default-only")).rejects.toThrow();
      assertNoFixtureSideEffects();
    }
  );

  it.each(manifest.scenes)(
    "hydrates $id through the REAL fixture service and canonical session schema",
    async (scene) => {
      const session = parseHydratedSession(await loadRuntimeFixtureSession(scene.id));
      assertOwnedSessionReferences(session, scene, CURRENT_OWNER);

      expect(mockGetRequiredCurrentUserId).toHaveBeenCalled();
      expect(mockLoadAccountReviewAccountSnapshots).toHaveBeenCalled();
      expect(mockCategoryScopeCalls).toContainEqual({
        ownerId: CURRENT_OWNER, mode: "accessible",
      });
      assertNoFixtureSideEffects();
    }
  );

  it("rejects unregistered fixtures instead of silently opening an empty or production review", async () => {
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("missing-private-scenario")).rejects.toThrow();
    expect(mockLoadAccountReviewAccountSnapshots).not.toHaveBeenCalled();
    assertNoFixtureSideEffects();
  });
});
