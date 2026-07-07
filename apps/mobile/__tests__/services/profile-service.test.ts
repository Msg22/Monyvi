/**
 * @file profile-service.test.ts
 * @description Unit tests for profile-service mutations (simplified data model).
 *
 * Mock strategy: inline factory pattern with __mocks re-export (project convention).
 */

// =============================================================================
// Mock: @monyvi/db
// =============================================================================

jest.mock("@monyvi/db", () => {
  const mockFind = jest.fn();
  const mockFetch = jest.fn();
  const mockWrite = jest.fn((fn: () => Promise<unknown>) => fn());

  const mockProfilesCollection = {
    find: mockFind,
    query: () => ({ fetch: mockFetch }),
  };

  return {
    database: {
      get: jest.fn((table: string) => {
        if (table === "profiles") return mockProfilesCollection;
        return {};
      }),
      write: mockWrite,
    },
    Account: {},
    Profile: {},
    __mocks: { mockFind, mockFetch, mockWrite },
  };
});

interface DbMocks {
  mockFind: jest.Mock;
  mockFetch: jest.Mock;
  mockWrite: jest.Mock;
}

function getDbMocks(): DbMocks {
  return jest.requireMock<{ __mocks: DbMocks }>("@monyvi/db").__mocks;
}

// =============================================================================
// Mock: account-service (ensureCashAccount)
// =============================================================================

jest.mock("@/services/account-service", () => {
  const ensureCashAccount = jest.fn(
    (): Promise<{
      created: boolean;
      accountId: string | null;
      error: string | null;
    }> =>
      Promise.resolve({
        created: true,
        accountId: "cash-account-1",
        error: null,
      })
  );
  const createCashAccountWithinWriter = jest.fn(
    (): Promise<{ accountId: string; created: boolean }> =>
      Promise.resolve({ accountId: "cash-account-1", created: true })
  );
  const getDefaultCashAccountName = jest.fn(
    (language: "en" | "ar"): string => `default-cash-${language}`
  );
  return {
    ensureCashAccount,
    createCashAccountWithinWriter,
    getDefaultCashAccountName,
    __mocks: {
      ensureCashAccount,
      createCashAccountWithinWriter,
      getDefaultCashAccountName,
    },
  };
});

interface AccountServiceMocks {
  ensureCashAccount: jest.Mock;
  createCashAccountWithinWriter: jest.Mock;
  getDefaultCashAccountName: jest.Mock;
}

function getAccountServiceMocks(): AccountServiceMocks {
  return jest.requireMock<{ __mocks: AccountServiceMocks }>(
    "@/services/account-service"
  ).__mocks;
}

// =============================================================================
// Mock: onboarding-cursor-service (clearOnboardingStep)
// =============================================================================

jest.mock("@/services/onboarding-cursor-service", () => {
  const clearOnboardingStep = jest.fn().mockResolvedValue(undefined);
  return { clearOnboardingStep, __mocks: { clearOnboardingStep } };
});

interface CursorServiceMocks {
  clearOnboardingStep: jest.Mock;
}

function getCursorServiceMocks(): CursorServiceMocks {
  return jest.requireMock<{ __mocks: CursorServiceMocks }>(
    "@/services/onboarding-cursor-service"
  ).__mocks;
}

// =============================================================================
// Mock: i18n changeLanguage — setPreferredLanguage now owns the i18n apply
// per PR #238 review Finding #6. Mocking here prevents i18next state mutation
// (which would fail without loaded translation resources) during the unit test
// AND lets us assert the service invokes it.
// =============================================================================

jest.mock("@/i18n/changeLanguage", () => {
  const changeLanguage = jest.fn().mockResolvedValue(undefined);
  const getCurrentLanguage = jest.fn().mockReturnValue("en");
  return {
    changeLanguage,
    getCurrentLanguage,
    __mocks: { changeLanguage, getCurrentLanguage },
  };
});

interface ChangeLanguageMocks {
  changeLanguage: jest.Mock;
  getCurrentLanguage: jest.Mock;
}

function getChangeLanguageMocks(): ChangeLanguageMocks {
  return jest.requireMock<{ __mocks: ChangeLanguageMocks }>(
    "@/i18n/changeLanguage"
  ).__mocks;
}

// =============================================================================
// Mock: logger
// =============================================================================

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// =============================================================================
// Mock: supabase — profile-service imports getCurrentUserId. The real
// supabase client throws at module load when EXPO_PUBLIC_SUPABASE_URL is
// missing, so we provide a lightweight mock.
// =============================================================================

const mockSupabaseFrom = jest.fn();
const mockSupabaseProfileUpdate = jest.fn();
const mockSupabaseProfileEqUser = jest.fn();
const mockSupabaseProfileEqDeleted = jest.fn();

jest.mock("@/services/supabase", () => ({
  getCurrentUserId: jest.fn().mockResolvedValue("user-1"),
  supabase: {
    from: (...args: readonly unknown[]): unknown => mockSupabaseFrom(...args),
  },
}));

// =============================================================================
// Import module under test (after mocks)
// =============================================================================

import {
  setPreferredLanguage,
  setPreferredCurrency,
  completeOnboarding,
  confirmCurrencyAndOnboard,
  getAiProcessingConsentStatus,
  grantAiProcessingConsent,
  revokeAiProcessingConsent,
} from "@/services/profile-service";

// =============================================================================
// Helpers
// =============================================================================

function createMockProfile(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const state: Record<string, unknown> = {
    id: "profile-1",
    aiProcessingConsentRaw: null,
    onboardingCompleted: false,
    preferredLanguage: "en",
    userId: "user-1",
    deleted: false,
    ...overrides,
  };

  Object.defineProperty(state, "aiProcessingConsent", {
    configurable: true,
    get(): unknown {
      const raw = state.aiProcessingConsentRaw;
      if (typeof raw !== "string" || raw.trim().length === 0) return null;
      return JSON.parse(raw) as unknown;
    },
  });

  state.update = jest.fn((fn: (p: Record<string, unknown>) => void) => {
    fn(state);
  });

  if (overrides.update) {
    state.update = overrides.update;
  }

  return state;
}

function setupProfileFound(
  profile: Record<string, unknown> = createMockProfile()
): void {
  const { mockFind, mockFetch } = getDbMocks();
  mockFind.mockResolvedValue(profile);
  mockFetch.mockResolvedValue([profile]);
}

function setupProfileNotFound(): void {
  const { mockFind, mockFetch } = getDbMocks();
  mockFind.mockRejectedValue(new Error("not found"));
  mockFetch.mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  const { mockWrite } = getDbMocks();
  mockWrite.mockImplementation((fn: () => Promise<unknown>) => fn());
  mockSupabaseProfileEqDeleted.mockResolvedValue({ error: null });
  mockSupabaseProfileEqUser.mockReturnValue({
    eq: mockSupabaseProfileEqDeleted,
  });
  mockSupabaseProfileUpdate.mockReturnValue({
    eq: mockSupabaseProfileEqUser,
  });
  mockSupabaseFrom.mockReturnValue({
    update: mockSupabaseProfileUpdate,
  });
});

// =============================================================================
// Tests
// =============================================================================

describe("setPreferredLanguage", () => {
  it("updates the profile's preferredLanguage field via database.write", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    await setPreferredLanguage("en");

    const { mockWrite } = getDbMocks();
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("also calls i18n changeLanguage so the UI updates in sync (guards PR #238 Finding #6)", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    await setPreferredLanguage("en");

    const { changeLanguage } = getChangeLanguageMocks();
    expect(changeLanguage).toHaveBeenCalledTimes(1);
    expect(changeLanguage).toHaveBeenCalledWith("en");
  });

  it("accepts 'ar' as a supported language and forwards it to changeLanguage", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    await setPreferredLanguage("ar");

    const { mockWrite } = getDbMocks();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const { changeLanguage } = getChangeLanguageMocks();
    expect(changeLanguage).toHaveBeenCalledWith("ar");
  });

  it("throws if no profile row exists", async (): Promise<void> => {
    setupProfileNotFound();
    await expect(setPreferredLanguage("en")).rejects.toThrow();
  });
});

describe("setPreferredCurrency", () => {
  it("updates the scoped profile's preferredCurrency field via database.write", async (): Promise<void> => {
    const updates: Record<string, unknown> = {};
    const profile = createMockProfile({
      preferredCurrency: "EGP",
      update: jest.fn((fn: (p: Record<string, unknown>) => void) => {
        fn(updates);
      }),
    });
    setupProfileFound(profile);

    await setPreferredCurrency("USD");

    const { mockWrite } = getDbMocks();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(updates.preferredCurrency).toBe("USD");
  });

  it("throws if no scoped profile row exists", async (): Promise<void> => {
    setupProfileNotFound();

    await expect(setPreferredCurrency("EGP")).rejects.toThrow(
      "No profile row found"
    );
  });

  it("rejects unsupported currency codes before opening a database writer", async (): Promise<void> => {
    const profile = createMockProfile({ preferredCurrency: "EGP" });
    setupProfileFound(profile);

    await expect(setPreferredCurrency("BTC")).rejects.toThrow(
      'setPreferredCurrency: unsupported currency code "BTC"'
    );

    const { mockWrite } = getDbMocks();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe("completeOnboarding", () => {
  it("sets onboardingCompleted to true AND clears the AsyncStorage cursor", async (): Promise<void> => {
    const profile = createMockProfile({
      onboardingCompleted: false,
      userId: "user-1",
    });
    setupProfileFound(profile);

    await completeOnboarding();

    const { mockWrite } = getDbMocks();
    expect(mockWrite).toHaveBeenCalledTimes(1);

    const { clearOnboardingStep } = getCursorServiceMocks();
    expect(clearOnboardingStep).toHaveBeenCalledWith("user-1");
  });

  it("is idempotent — skips DB write when already completed but still clears cursor", async (): Promise<void> => {
    const profile = createMockProfile({
      onboardingCompleted: true,
      userId: "user-1",
    });
    setupProfileFound(profile);

    await completeOnboarding();

    const { mockWrite } = getDbMocks();
    expect(mockWrite).not.toHaveBeenCalled();

    const { clearOnboardingStep } = getCursorServiceMocks();
    expect(clearOnboardingStep).toHaveBeenCalledWith("user-1");
  });

  it("does NOT re-throw when cursor clear fails — DB write is contract-critical, cursor clear is best-effort", async (): Promise<void> => {
    const profile = createMockProfile({
      onboardingCompleted: false,
      userId: "user-1",
    });
    setupProfileFound(profile);

    const { clearOnboardingStep } = getCursorServiceMocks();
    clearOnboardingStep.mockRejectedValueOnce(
      new Error("AsyncStorage unavailable")
    );

    await expect(completeOnboarding()).resolves.toBeUndefined();

    const { mockWrite } = getDbMocks();
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// confirmCurrencyAndOnboard — feature 026 atomic write
// =============================================================================

describe("AI processing consent", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-04T10:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports inactive consent when the profile has no consent record", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    await expect(getAiProcessingConsentStatus()).resolves.toEqual({
      isConsented: false,
      consent: null,
    });
  });

  it("treats malformed synced consent JSON as inactive", async (): Promise<void> => {
    const profile = createMockProfile({
      aiProcessingConsentRaw: JSON.stringify({
        version: 1,
        consentedAt: null,
        revokedAt: null,
      }),
    });
    setupProfileFound(profile);

    await expect(getAiProcessingConsentStatus()).resolves.toEqual({
      isConsented: false,
      consent: null,
    });
  });

  it("parses consent from the raw field instead of the DB model helper", async (): Promise<void> => {
    const profile = createMockProfile({
      aiProcessingConsentRaw: JSON.stringify({
        version: "2026-07-ai-processing-v1",
        consentedAt: "2026-07-04T09:00:00.000Z",
        revokedAt: null,
      }),
    });
    Object.defineProperty(profile, "aiProcessingConsent", {
      configurable: true,
      get(): unknown {
        throw new Error("DB model helper should not parse consent");
      },
    });
    setupProfileFound(profile);

    await expect(getAiProcessingConsentStatus()).resolves.toEqual({
      isConsented: true,
      consent: {
        version: "2026-07-ai-processing-v1",
        consentedAt: "2026-07-04T09:00:00.000Z",
        revokedAt: null,
      },
    });
  });

  it("grants AI processing consent with the current version and timestamp", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    await grantAiProcessingConsent();

    const parsed = JSON.parse(String(profile.aiProcessingConsentRaw)) as Record<
      string,
      unknown
    >;
    expect(parsed).toEqual({
      version: "2026-07-ai-processing-v1",
      consentedAt: "2026-07-04T10:00:00.000Z",
      revokedAt: null,
    });
  });

  it("pushes granted AI processing consent to Supabase immediately", async (): Promise<void> => {
    const profile = createMockProfile({ userId: "user-1" });
    setupProfileFound(profile);

    await grantAiProcessingConsent();

    expect(mockSupabaseFrom).toHaveBeenCalledWith("profiles");
    expect(mockSupabaseProfileUpdate).toHaveBeenCalledWith({
      ai_processing_consent: {
        version: "2026-07-ai-processing-v1",
        consentedAt: "2026-07-04T10:00:00.000Z",
        revokedAt: null,
      },
      updated_at: "2026-07-04T10:00:00.000Z",
    });
    expect(mockSupabaseProfileEqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(mockSupabaseProfileEqDeleted).toHaveBeenCalledWith(
      "deleted",
      false
    );
  });

  it("rolls back a local consent grant when the immediate Supabase push fails", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);
    mockSupabaseProfileEqDeleted.mockResolvedValueOnce({
      error: new Error("network unavailable"),
    });

    await expect(grantAiProcessingConsent()).rejects.toThrow(
      "network unavailable"
    );

    expect(profile.aiProcessingConsentRaw).toBeUndefined();
  });

  it("revokes AI processing consent without deleting the original consent timestamp", async (): Promise<void> => {
    const profile = createMockProfile({
      aiProcessingConsentRaw: JSON.stringify({
        version: "2026-07-ai-processing-v1",
        consentedAt: "2026-07-04T09:00:00.000Z",
        revokedAt: null,
      }),
    });
    setupProfileFound(profile);

    await revokeAiProcessingConsent();

    const parsed = JSON.parse(String(profile.aiProcessingConsentRaw)) as Record<
      string,
      unknown
    >;
    expect(parsed).toEqual({
      version: "2026-07-ai-processing-v1",
      consentedAt: "2026-07-04T09:00:00.000Z",
      revokedAt: "2026-07-04T10:00:00.000Z",
    });
  });

  it("pushes revoked AI processing consent to Supabase immediately", async (): Promise<void> => {
    const profile = createMockProfile({
      userId: "user-1",
      aiProcessingConsentRaw: JSON.stringify({
        version: "2026-07-ai-processing-v1",
        consentedAt: "2026-07-04T09:00:00.000Z",
        revokedAt: null,
      }),
    });
    setupProfileFound(profile);

    await revokeAiProcessingConsent();

    expect(mockSupabaseProfileUpdate).toHaveBeenCalledWith({
      ai_processing_consent: {
        version: "2026-07-ai-processing-v1",
        consentedAt: "2026-07-04T09:00:00.000Z",
        revokedAt: "2026-07-04T10:00:00.000Z",
      },
      updated_at: "2026-07-04T10:00:00.000Z",
    });
  });

  it("re-grants revoked AI processing consent by clearing the revocation timestamp", async (): Promise<void> => {
    const profile = createMockProfile({
      aiProcessingConsentRaw: JSON.stringify({
        version: "2026-07-ai-processing-v1",
        consentedAt: "2026-07-04T09:00:00.000Z",
        revokedAt: "2026-07-04T09:30:00.000Z",
      }),
    });
    setupProfileFound(profile);

    await grantAiProcessingConsent();

    const parsed = JSON.parse(String(profile.aiProcessingConsentRaw)) as Record<
      string,
      unknown
    >;
    expect(parsed).toEqual({
      version: "2026-07-ai-processing-v1",
      consentedAt: "2026-07-04T10:00:00.000Z",
      revokedAt: null,
    });
  });

  it("does not fabricate consent history when revoking an absent consent record", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    await revokeAiProcessingConsent();

    const { mockWrite } = getDbMocks();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(profile.aiProcessingConsentRaw).toBeNull();
  });
});

describe("confirmCurrencyAndOnboard", () => {
  it("wraps all 4 mutations in a SINGLE database.write (atomicity)", async (): Promise<void> => {
    const profile = createMockProfile({
      onboardingCompleted: false,
      preferredLanguage: "en",
      preferredCurrency: "EGP",
    });
    setupProfileFound(profile);

    await confirmCurrencyAndOnboard("USD");

    const { mockWrite } = getDbMocks();
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });

  it("calls createCashAccountWithinWriter (not ensureCashAccount) to avoid nested writers", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    await confirmCurrencyAndOnboard("EGP");

    const { createCashAccountWithinWriter, ensureCashAccount } =
      getAccountServiceMocks();
    expect(createCashAccountWithinWriter).toHaveBeenCalledTimes(1);
    expect(ensureCashAccount).not.toHaveBeenCalled();
  });

  it("passes the runtime language's default cash name into the seeded account", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);
    const { getCurrentLanguage } = getChangeLanguageMocks();
    getCurrentLanguage.mockReturnValue("ar");

    await confirmCurrencyAndOnboard("EGP");

    const { createCashAccountWithinWriter, getDefaultCashAccountName } =
      getAccountServiceMocks();
    expect(getDefaultCashAccountName).toHaveBeenCalledWith("ar");
    expect(createCashAccountWithinWriter).toHaveBeenCalledWith(
      "user-1",
      "EGP",
      expect.anything(),
      "default-cash-ar"
    );
  });

  it("writes preferredCurrency, preferredLanguage (from runtime), and onboardingCompleted=true in one update()", async (): Promise<void> => {
    const updates: Record<string, unknown> = {};
    const profile = createMockProfile({
      onboardingCompleted: false,
      preferredLanguage: "en",
      preferredCurrency: "EGP",
      update: jest.fn((fn: (p: Record<string, unknown>) => void) => {
        fn(updates);
      }),
    });
    setupProfileFound(profile);

    const { getCurrentLanguage } = getChangeLanguageMocks();
    getCurrentLanguage.mockReturnValue("ar");

    await confirmCurrencyAndOnboard("USD");

    expect(updates.preferredCurrency).toBe("USD");
    expect(updates.preferredLanguage).toBe("ar");
    expect(updates.onboardingCompleted).toBe(true);
  });

  it("invokes options.onTransactionCommitted after the write succeeds", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    const onTransactionCommitted = jest.fn();
    await confirmCurrencyAndOnboard("EGP", { onTransactionCommitted });

    expect(onTransactionCommitted).toHaveBeenCalledTimes(1);
  });

  it("does NOT call changeLanguage during the write (i18n is a post-commit concern)", async (): Promise<void> => {
    const profile = createMockProfile({ preferredLanguage: "en" });
    setupProfileFound(profile);

    const { changeLanguage, getCurrentLanguage } = getChangeLanguageMocks();
    getCurrentLanguage.mockReturnValue("en");

    await confirmCurrencyAndOnboard("EGP");

    // getCurrentLanguage is read OUTSIDE the writer; changeLanguage should
    // NOT fire since the runtime language already matches what was written.
    expect(changeLanguage).not.toHaveBeenCalled();
  });

  it("does NOT clear the intro-locale-override (FR-030)", (): void => {
    // Sanity check: confirmCurrencyAndOnboard must not expose an override
    // clearer. The intro-flag-service also MUST NOT export one. If either
    // does, this test catches the regression.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const svc = require("@/services/profile-service") as Record<
      string,
      unknown
    >;
    expect(Object.keys(svc)).not.toContain("clearIntroLocaleOverride");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const flagSvc = require("@/services/intro-flag-service") as Record<
      string,
      unknown
    >;
    expect(Object.keys(flagSvc)).not.toContain("clearIntroLocaleOverride");
  });

  it("propagates write failures — caller must handle them", async (): Promise<void> => {
    const profile = createMockProfile();
    setupProfileFound(profile);

    const { mockWrite } = getDbMocks();
    mockWrite.mockImplementationOnce(() =>
      Promise.reject(new Error("write failed"))
    );

    await expect(confirmCurrencyAndOnboard("EGP")).rejects.toThrow(
      "write failed"
    );
  });
});
