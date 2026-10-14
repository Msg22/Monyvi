import { isE2eTestMode } from "@/config/e2e-test-config";
import manifest from "../../e2e/fixtures/shared-account-review.json";

const CURRENT_OWNER = "1eea0000-3950-4000-8000-000000009001";
const ANOTHER_OWNER = "1eea0000-3950-4000-8000-000000009002";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/;

let mockActiveOwnerId: string | null = CURRENT_OWNER;
const mockMissingAccountIds = new Set<string>();
const mockDeletedAccountIds = new Set<string>();
const mockForeignAccountIds = new Set<string>();

const mockDatabaseWrite = jest.fn(async (): Promise<void> => {
  throw new Error("fixture entry cannot write financial records");
});
// The owned local read model is intentionally distinct from provider context.
const mockLoadAccountReviewAccountSnapshots = jest.fn(async () => {
  const ownerId = await mockGetRequiredCurrentUserId();
  const baseAccounts =
    ownerId === CURRENT_OWNER
      ? manifest.accountContext.accounts.filter(
          (account) =>
            !mockMissingAccountIds.has(account.id) &&
            !mockDeletedAccountIds.has(account.id) &&
            !mockForeignAccountIds.has(account.id)
        )
      : [
          ...manifest.accountContext.accounts.filter((account) =>
            mockForeignAccountIds.has(account.id)
          ),
          {
            ...manifest.accountContext.accounts[0],
            id: manifest.excludedAccountRefs.foreignAccountId,
          },
        ];

  const accounts = baseAccounts.map((account) => ({
    ...account,
    isDefault:
      ownerId === CURRENT_OWNER && account.id === manifest.defaultAccountId,
  }));
  const providerAccounts = accounts.map(({ isDefault, ...account }) => account);
  return {
    ownerId,
    preferredCurrency:
      ownerId === CURRENT_OWNER
        ? manifest.accountContext.preferredCurrency
        : "USD",
    accounts,
    providerContext: {
      ...manifest.accountContext,
      preferredCurrency:
        ownerId === CURRENT_OWNER
          ? manifest.accountContext.preferredCurrency
          : "USD",
      accounts: providerAccounts,
    },
  };
});
const mockGetRequiredCurrentUserId = jest.fn(
  async (): Promise<string> => {
    if (!mockActiveOwnerId) {
      throw new Error("USER_REQUIRED");
    }
    return mockActiveOwnerId;
  }
);
const mockGetCurrentUserDataScope = jest.fn(async (): Promise<{
  readonly userId: string;
  readonly queryOwned: () => { fetch: () => Promise<readonly unknown[]> };
}> => {
  const userId = await mockGetRequiredCurrentUserId();
  return {
    userId,
    queryOwned: () => ({ fetch: async () => [] }),
  };
});

jest.mock("@monyvi/db", () => ({
  database: {
    write: (): Promise<void> => mockDatabaseWrite(),
    get: (table: string): object => ({
      table,
      query: (): object => ({ fetch: async (): Promise<never[]> => [] }),
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  // Defer all mock variable reads until after Jest's factory hoisting.
  getRequiredCurrentUserId: (): Promise<string> =>
    mockGetRequiredCurrentUserId(),
  getCurrentUserDataScope: (): ReturnType<typeof mockGetCurrentUserDataScope> =>
    mockGetCurrentUserDataScope(),
}));

// T010 is a FUTURE dependency of the T015 fixture service, not the service
// under test here. Virtualize only this dependency so the descriptor-only
// assertions can execute before T010 exists. Never mock the T015 service.
jest.mock(
  "@/services/account-review-read-model-service",
  () => ({
    loadAccountReviewAccountSnapshots: (): ReturnType<
      typeof mockLoadAccountReviewAccountSnapshots
    > => mockLoadAccountReviewAccountSnapshots(),
  }),
  { virtual: true }
);

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

function parseHydratedSession(value: unknown): ReturnType<
  typeof import("@monyvi/logic")["accountReviewSessionSchema"]["parse"]
> {
  const { accountReviewSessionSchema } = jest.requireActual<
    typeof import("@monyvi/logic")
  >("@monyvi/logic");
  return accountReviewSessionSchema.parse(value);
}

function loadRuntimeFixtureSession(sceneId: string): Promise<unknown> {
  const loadFixture = resolveRuntimeFixtureEntry();
  return loadFixture(sceneId);
}

function findScene(id: string): (typeof manifest.scenes)[number] {
  const scene = manifest.scenes.find((candidate) => candidate.id === id);
  if (!scene) {
    throw new Error(`Missing synthetic #395 scene ${id}`);
  }
  return scene;
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
      row.issueTags.includes("account_group_removed")
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
    mockMissingAccountIds.clear();
    mockDeletedAccountIds.clear();
    mockForeignAccountIds.clear();
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

    const session = parseHydratedSession(
      await loadRuntimeFixtureSession("r3-combined-en")
    );

    expect(session.ownerId).toBe(CURRENT_OWNER);
    expect(session.source).toBe("VOICE");
    expect(session.rows).toHaveLength(7);
    expect(session.rows.filter((row) => row.selected)).toHaveLength(2);
    expect(session.groups).toHaveLength(2);
    expect(mockGetRequiredCurrentUserId).toHaveBeenCalled();
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
  });

  it("materializes SMS fingerprints in a current-owner session without calling hosted seed/write", async () => {
    const session = parseHydratedSession(
      await loadRuntimeFixtureSession("sms-review-restart")
    );

    expect(session.ownerId).toBe(CURRENT_OWNER);
    expect(session.source).toBe("SMS");
    expect(session.rows).toHaveLength(1);
    expect(session.rows[0]?.sourceFingerprint).toMatch(SHA_256_PATTERN);
    expect(session.groups).toHaveLength(1);
    // This loader returns review state; a real future Save still goes through
    // the approved financial action writer. No test-only financial bypass.
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
  });

  it("rejects fixture entry when E2E mode is off", async () => {
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "off";

    expect(isE2eTestMode()).toBe(false);
    // Resolve the future module OUTSIDE rejects; a missing module is not
    // proof that production/runtime gating rejected the fixture.
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("r3-default-only")).rejects.toThrow();
  });

  it("rejects fixture entry in production even with an E2E-looking environment", async () => {
    process.env.NODE_ENV = "production";
    process.env.EXPO_PUBLIC_MONYVI_TEST_MODE = "e2e";

    // Resolve the future module OUTSIDE rejects; a missing module is not
    // proof that production/runtime gating rejected the fixture.
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("r3-default-only")).rejects.toThrow();
  });

  it("does not construct a fixture for a signed-out user or infer an owner from the static catalog", async () => {
    mockActiveOwnerId = null;

    // Resolve the future module OUTSIDE rejects; a missing module is not
    // proof that production/runtime gating rejected the fixture.
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("r3-default-only")).rejects.toThrow();
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
  });

  it("rejects relabeling another owner's static account IDs during user switching", async () => {
    const first = parseHydratedSession(
      await loadRuntimeFixtureSession("r3-default-only")
    );
    expect(first.ownerId).toBe(CURRENT_OWNER);
    expect(first.rows).toHaveLength(2);

    mockActiveOwnerId = ANOTHER_OWNER;
    const otherOwner = await mockLoadAccountReviewAccountSnapshots();
    expect(otherOwner.ownerId).toBe(ANOTHER_OWNER);
    expect(otherOwner.accounts.map((account) => account.id))
      .not.toContain(manifest.defaultAccountId);

    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("r3-default-only")).rejects.toThrow();
    expect(mockDatabaseWrite).not.toHaveBeenCalled();
  });

  it.each([
    { reason: "missing", unavailable: mockMissingAccountIds },
    { reason: "deleted", unavailable: mockDeletedAccountIds },
    { reason: "foreign", unavailable: mockForeignAccountIds },
  ])(
    "rejects a $reason referenced account absent from the active owned snapshot",
    async ({ unavailable }) => {
      unavailable.add(manifest.defaultAccountId);
      const snapshot = await mockLoadAccountReviewAccountSnapshots();
      expect(snapshot.accounts.map((account) => account.id))
        .not.toContain(manifest.defaultAccountId);

      const loadFixture = resolveRuntimeFixtureEntry();
      await expect(loadFixture("r3-default-only")).rejects.toThrow();
      expect(mockDatabaseWrite).not.toHaveBeenCalled();
    }
  );

  it.each(manifest.scenes)(
    "hydrates $id through the REAL fixture service and canonical session schema",
    async (scene) => {
      const session = parseHydratedSession(
        await loadRuntimeFixtureSession(scene.id)
      );
      expect(session.ownerId).toBe(CURRENT_OWNER);
      expect(session.source).toBe(scene.source);
      expect(session.rows).toHaveLength(scene.expectedCounts.total);
      expect(session.groups).toHaveLength(scene.groups.length);
      expect(session.rows.filter((row) => row.selected)).toHaveLength(
        scene.expectedCounts.selected
      );
      expect(
        session.rows.filter((row) => row.reviewReasons.length > 0)
      ).toHaveLength(scene.expectedCounts.needsReview);

      for (const row of session.rows) {
        if (scene.source === "SMS") {
          expect(row.sourceFingerprint).toMatch(SHA_256_PATTERN);
        } else {
          expect(row.sourceFingerprint).toBeNull();
        }
      }
      expect(mockGetRequiredCurrentUserId).toHaveBeenCalled();
      expect(mockLoadAccountReviewAccountSnapshots).toHaveBeenCalled();
      expect(mockDatabaseWrite).not.toHaveBeenCalled();
    }
  );

  it("rejects unregistered fixtures instead of silently opening an empty or production review", async () => {
    const loadFixture = resolveRuntimeFixtureEntry();
    await expect(loadFixture("missing-private-scenario")).rejects.toThrow();
  });
});
