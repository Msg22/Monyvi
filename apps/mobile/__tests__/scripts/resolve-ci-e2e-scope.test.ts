interface ResolveCiE2eScopeModule {
  buildCiE2eMatrix(suites: readonly string[]): {
    readonly suite: readonly string[];
  };
  getGitDiffArgs(
    env?: Readonly<Record<string, string | undefined>>
  ): readonly string[];
  resolveCiE2eScope(files: readonly string[]): {
    readonly shouldRun: boolean;
    readonly suites: readonly string[];
  };
}

const scopeResolver = jest.requireActual(
  "../../scripts/resolve-ci-e2e-scope"
) as ResolveCiE2eScopeModule;

describe("resolve-ci-e2e-scope", () => {
  it("builds one independent CI matrix entry per selected suite", () => {
    expect(
      scopeResolver.buildCiE2eMatrix([
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
      ])
    ).toEqual({
      suite: ["transactions", "recurring-payments", "budgets", "sms-sync"],
    });
    expect(scopeResolver.buildCiE2eMatrix([])).toEqual({ suite: ["skip"] });
  });

  it("skips Android E2E for docs-only changes", () => {
    expect(scopeResolver.resolveCiE2eScope(["README.md"])).toEqual({
      shouldRun: false,
      suites: [],
    });
  });

  it("selects live SMS E2E for live detection changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/services/sms-live-detection-handler.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["live-sms"],
    });
  });

  it("selects recurring payment E2E for recurring payment module changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/__tests__/components/recurring-payments/RecurringPaymentForm.test.tsx",
        "apps/mobile/app/(private)/create-recurring-payment.tsx",
        "apps/mobile/app/(private)/edit-recurring-payment.tsx",
        "apps/mobile/components/modals/FrequencyPickerModal.tsx",
        "apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx",
        "apps/mobile/hooks/useRecurringPayment.ts",
        "apps/mobile/hooks/useRecurringPayments.ts",
        "apps/mobile/services/recurring-payment-service.ts",
        "apps/mobile/validation/recurring-payment-validation.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["recurring-payments"],
    });
  });

  it("selects recurring payment E2E for recurring payment Maestro flow changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/e2e/maestro/recurring-payments/recurring-payments-crud-actions.yaml",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["recurring-payments"],
    });
  });

  it("selects only recurring payment E2E for recurring dashboard code changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/__tests__/app/recurring-payments-style.test.tsx",
        "apps/mobile/app/(private)/recurring-payments.tsx",
        "apps/mobile/components/recurring-payments/RecurringPaymentsDashboard.tsx",
        "apps/mobile/e2e/maestro/recurring-payments/recurring-payments-crud-actions.yaml",
        "apps/mobile/hooks/useRecurringPayments.ts",
        "apps/mobile/i18n/translation-schema.ts",
        "apps/mobile/services/recurring-payments-dashboard-read-model.ts",
        "apps/mobile/utils/recurring-payment-due-labels.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["recurring-payments"],
    });
  });

  it("selects only budget E2E for dashboard implementation and Maestro changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/app/(private)/budgets.tsx",
        "apps/mobile/components/budget/BudgetDashboard.tsx",
        "apps/mobile/e2e/maestro/budgets/dashboard-carousel.yaml",
        "apps/mobile/hooks/useBudgets.ts",
        "apps/mobile/services/budget-list-read-model-service.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["budgets"],
    });
  });

  it("ignores global mobile files that do not directly affect E2E journeys", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/i18n/translation-schema.ts",
      ])
    ).toEqual({
      shouldRun: false,
      suites: [],
    });
  });

  it("selects SMS sync E2E for batch SMS scan changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/services/sms-sync-service.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["sms-sync"],
    });
  });

  it("selects both SMS suites for shared fixture parser changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/services/testing/ai-sms-fixture-parser.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["sms-sync", "live-sms"],
    });
  });

  it("runs every suite for shared E2E harness changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope(["apps/mobile/scripts/e2e-preflight.js"])
    ).toEqual({
      shouldRun: true,
      suites: [
        "accounts",
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
        "live-sms",
      ],
    });
  });

  it("keeps transaction E2E coverage for account form changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/components/add-account/InstitutionPicker.tsx",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["accounts", "transactions"],
    });
  });

  it("keeps account, transaction, and SMS sync E2E coverage for shared account service changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/services/account-service.ts",
        "apps/mobile/__tests__/services/account-service.test.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["accounts", "transactions", "sms-sync"],
    });
  });

  it("routes pending account service changes to SMS sync coverage", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/services/pending-account-service.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["sms-sync"],
    });
  });

  it("selects transaction, recurring payment, and budget E2E for shared payment form changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/__tests__/app/budget-screens-style.test.tsx",
        "apps/mobile/__tests__/components/recurring-payments/RecurringPaymentForm.test.tsx",
        "apps/mobile/app/(private)/budget-detail.tsx",
        "apps/mobile/app/(private)/create-recurring-payment.tsx",
        "apps/mobile/app/(private)/edit-recurring-payment.tsx",
        "apps/mobile/components/modals/AccountSelectorModal.tsx",
        "apps/mobile/components/modals/ConfirmationModal.tsx",
        "apps/mobile/components/modals/FrequencyPickerModal.tsx",
        "apps/mobile/components/recurring-payments/RecurringPaymentForm.tsx",
        "apps/mobile/hooks/index.ts",
        "apps/mobile/hooks/useRecurringPayment.ts",
        "apps/mobile/hooks/useRecurringPayments.ts",
        "apps/mobile/services/index.ts",
        "apps/mobile/services/recurring-payment-service.ts",
        "apps/mobile/validation/recurring-payment-validation.ts",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["transactions", "recurring-payments", "budgets"],
    });
  });

  it("selects suites that assert shared transaction locale copy", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/locales/en/transactions.json",
      ])
    ).toEqual({
      shouldRun: true,
      suites: ["transactions", "recurring-payments", "sms-sync"],
    });
  });

  it("runs every suite for private provider runtime changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/providers/MarketRatesRealtimeProvider.tsx",
      ])
    ).toEqual({
      shouldRun: true,
      suites: [
        "accounts",
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
        "live-sms",
      ],
    });
  });

  it("runs every suite for workflow changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([".github/workflows/ci.yml"])
    ).toEqual({
      shouldRun: true,
      suites: [
        "accounts",
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
        "live-sms",
      ],
    });
  });

  it("runs every suite for root E2E harness script changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope(["scripts/start-local-supabase.js"])
    ).toEqual({
      shouldRun: true,
      suites: [
        "accounts",
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
        "live-sms",
      ],
    });
  });

  it("skips Android E2E for developer workflow-only files", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "AGENTS.md",
        "scripts/link-worktree-node-modules.ps1",
      ])
    ).toEqual({
      shouldRun: false,
      suites: [],
    });
  });

  it("does not run Android E2E for unrelated mobile test-only changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/__tests__/components/ui/TextField.test.tsx",
      ])
    ).toEqual({
      shouldRun: false,
      suites: [],
    });
  });

  it("does not force Android E2E for scope resolver-only changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/scripts/resolve-ci-e2e-scope.js",
        "apps/mobile/__tests__/scripts/resolve-ci-e2e-scope.test.ts",
      ])
    ).toEqual({
      shouldRun: false,
      suites: [],
    });
  });

  it("uses the full fallback for Expo Router index route changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/app/index.tsx",
        "apps/mobile/app/(private)/(tabs)/index.tsx",
      ])
    ).toEqual({
      shouldRun: true,
      suites: [
        "accounts",
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
        "live-sms",
      ],
    });
  });

  it("runs account E2E for account locale copy changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope(["apps/mobile/locales/en/accounts.json"])
    ).toEqual({
      shouldRun: true,
      suites: ["accounts"],
    });
  });

  it("runs all Android E2E suites for shared common locale copy changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope(["apps/mobile/locales/en/common.json"])
    ).toEqual({
      shouldRun: true,
      suites: [
        "accounts",
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
        "live-sms",
      ],
    });
  });

  it("runs all Android E2E suites for auth and onboarding locale copy changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope([
        "apps/mobile/locales/en/auth.json",
        "apps/mobile/locales/en/onboarding.json",
      ])
    ).toEqual({
      shouldRun: true,
      suites: [
        "accounts",
        "transactions",
        "recurring-payments",
        "budgets",
        "sms-sync",
        "live-sms",
      ],
    });
  });

  it("runs SMS E2E suites for settings locale permission copy changes", () => {
    expect(
      scopeResolver.resolveCiE2eScope(["apps/mobile/locales/en/settings.json"])
    ).toEqual({
      shouldRun: true,
      suites: ["sms-sync", "live-sms"],
    });
  });

  it("diffs the full pushed range on push events", () => {
    expect(
      scopeResolver.getGitDiffArgs({
        GITHUB_EVENT_NAME: "push",
        E2E_PUSH_BEFORE_SHA: "abc123",
      })
    ).toEqual(["diff", "--name-only", "abc123...HEAD"]);
  });
});
