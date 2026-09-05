import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface SeedConfig {
  readonly mode: string;
  readonly supabaseUrl: string;
  readonly appSupabaseUrl: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly email: string;
  readonly password: string | null;
  readonly preserveExistingPassword: boolean;
  readonly userId?: string;
}

interface ManualQaSeedModule {
  readonly ACCOUNT_SWITCH_QA_EMAIL: string;
  readonly ACCOUNT_SWITCH_QA_PASSWORD: string;
  readonly getManualQaSeedConfig: (
    env?: Record<string, string | undefined>
  ) => SeedConfig;
  readonly seedManualQaData: (
    client: unknown,
    config: SeedConfig,
    options?: { readonly includeAccountSwitchUser?: boolean }
  ) => Promise<unknown>;
}

const {
  ACCOUNT_SWITCH_QA_EMAIL,
  ACCOUNT_SWITCH_QA_PASSWORD,
  getManualQaSeedConfig,
  seedManualQaData,
} = jest.requireActual<ManualQaSeedModule>("../../scripts/manual-qa-seed");

interface BudgetSeedRow {
  readonly name?: string;
  readonly type?: string;
  readonly period?: string;
  readonly currency?: string | null;
  readonly category_id?: string | null;
  readonly deleted?: boolean;
  readonly pause_intervals?: string;
}

interface AccountBalanceUpdate {
  readonly balance?: number;
  readonly filters: readonly {
    readonly column: string;
    readonly value: string;
  }[];
}

interface PauseInterval {
  readonly startedAt: string;
}

interface CompletedPauseInterval {
  readonly from: number;
  readonly to: number;
}

function getStringField(row: unknown, field: string): string | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const value = (row as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
}

function getNumberField(row: unknown, field: string): number | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const value = (row as Record<string, unknown>)[field];
  return typeof value === "number" ? value : undefined;
}

function expectRowsStampedForIncrementalPull(rows: readonly unknown[]): void {
  for (const row of rows) {
    const createdAt = getStringField(row, "created_at");
    const updatedAt = getStringField(row, "updated_at");
    expect(createdAt).toBeDefined();
    expect(updatedAt).toBeDefined();
    expect(new Date(updatedAt ?? "").getTime()).toBeGreaterThan(
      new Date(createdAt ?? "").getTime()
    );
  }
}

function parsePauseIntervals(value: string): readonly PauseInterval[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is PauseInterval =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).startedAt === "string"
  );
}

function parseCompletedPauseIntervals(
  value: string
): readonly CompletedPauseInterval[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is CompletedPauseInterval =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).from === "number" &&
      typeof (item as Record<string, unknown>).to === "number"
  );
}

describe("manual-qa-seed script helpers", () => {
  it("uses the neutral seed engine instead of depending on E2E seed internals", () => {
    const manualQaSeedSource = readFileSync(
      resolve(__dirname, "../../scripts/manual-qa-seed.js"),
      "utf8"
    );

    expect(manualQaSeedSource).toContain("./seed-fixtures/seed-engine");
    expect(manualQaSeedSource).not.toContain("./e2e-seed");
  });

  it("imports market rates when running the manual QA seed script", () => {
    const mobilePackageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../../package.json"), "utf8")
    ) as { readonly scripts?: Record<string, string> };

    expect(mobilePackageJson.scripts?.["manual:seed-user"]).toContain(
      "../../scripts/import-market-rates-to-local.js"
    );
    expect(mobilePackageJson.scripts?.["manual:seed-user"]).toContain(
      "--best-effort"
    );
  });

  it("uses the manual seed default after resetting local Supabase", () => {
    const rootPackageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../../../../package.json"), "utf8")
    ) as { readonly scripts?: Record<string, string> };

    expect(rootPackageJson.scripts?.["local:reset-and-seed"]).not.toContain(
      "MANUAL_QA_PASSWORD"
    );
    expect(rootPackageJson.scripts?.["local:reset-and-seed"]).toContain(
      "manual:seed-user"
    );
  });

  it("preserves an existing password and carries a local creation fallback", () => {
    const config = getManualQaSeedConfig({
      E2E_SUPABASE_MODE: "local",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(config.email).toBe("manual-qa@monyvi.test");
    expect(config.password).toBe("123456");
    expect(config.preserveExistingPassword).toBe(true);
  });

  it("uses the manual QA email with the provided local password", () => {
    const config = getManualQaSeedConfig({
      E2E_SUPABASE_MODE: "local",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
      MANUAL_QA_PASSWORD: "LocalOnlyPassword123!",
    });

    expect(config.email).toBe("manual-qa@monyvi.test");
    expect(config.password).toBe("LocalOnlyPassword123!");
    expect(config.preserveExistingPassword).toBe(false);
  });

  it("does not inherit remote Supabase env vars for local manual QA seeding", () => {
    const config = getManualQaSeedConfig({
      EXPO_PUBLIC_SUPABASE_URL: "https://remote-project.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "remote-publishable-key",
      SUPABASE_SERVICE_ROLE_KEY: "remote-service-role-key",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(config.mode).toBe("local");
    expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(config.appSupabaseUrl).toBe("http://10.0.2.2:54321");
    expect(config.anonKey).not.toBe("remote-publishable-key");
    expect(config.serviceRoleKey).not.toBe("remote-service-role-key");
  });

  it("seeds manual QA fixture data instead of E2E-named rows", async () => {
    const operations: string[] = [];
    const accountRows: unknown[] = [];
    const accountBalanceUpdates: AccountBalanceUpdate[] = [];
    const assetMetalRows: unknown[] = [];
    const assetRows: unknown[] = [];
    const budgetRows: unknown[] = [];
    const categoryRows: unknown[] = [];
    const debtRows: unknown[] = [];
    const recurringPaymentRows: unknown[] = [];
    const profileRows: unknown[] = [];
    const transactionRows: unknown[] = [];
    const transferRows: unknown[] = [];
    const marketRateRows: unknown[] = [];
    const metalHoldingStateRows: unknown[] = [];

    await seedManualQaData(
      createMockClient(operations, {
        accountRows,
        accountBalanceUpdates,
        assetMetalRows,
        assetRows,
        budgetRows,
        categoryRows,
        debtRows,
        marketRateRows,
        metalHoldingStateRows,
        profileRows,
        existingProfileIds: {
          "user-manual-qa": "existing-profile-id",
        },
        recurringPaymentRows,
        transactionRows,
        transferRows,
      }),
      {
        ...getManualQaSeedConfig({
          E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
          MANUAL_QA_PASSWORD: "Password123!",
        }),
        userId: "user-manual-qa",
      }
    );

    expect(operations).toContain("upsert:profiles:user-manual-qa");
    const compatibilityDeletes = operations.filter((operation) =>
      operation.startsWith("delete:")
    );
    expect(compatibilityDeletes).toHaveLength(2);
    expect(compatibilityDeletes[0]).toMatch(/^delete:asset_metals:id:/);
    expect(compatibilityDeletes[1]).toMatch(/^delete:assets:id:/);
    expect(categoryRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deleted: true,
          display_name: "QA Deleted Category",
          user_id: "user-manual-qa",
        }),
        expect.objectContaining({
          deleted: false,
          display_name: "QA Expired Custom Category",
        }),
        expect.objectContaining({
          deleted: false,
          display_name: "QA Expired Paused Custom Category",
        }),
        expect.objectContaining({
          deleted: false,
          display_name: "QA Near Limit Fixture Category",
        }),
        expect.objectContaining({
          deleted: false,
          display_name: "QA Over Budget Fixture Category",
        }),
        expect.objectContaining({
          deleted: false,
          display_name: "QA Paused Fixture Category",
        }),
        expect.objectContaining({
          display_name: "QA Detail Food",
          level: 1,
          parent_id: null,
        }),
        expect.objectContaining({
          display_name: "QA Detail Groceries",
          level: 2,
        }),
        expect.objectContaining({
          display_name: "QA Detail Dining",
          level: 2,
        }),
        expect.objectContaining({
          display_name: "QA Detail Fresh Food",
          level: 3,
        }),
        expect.objectContaining({
          display_name: "QA Arabic Detail",
          deleted: false,
        }),
        expect.objectContaining({
          display_name: "QA Disposable Detail",
          deleted: false,
        }),
      ])
    );
    expect(categoryRows).toHaveLength(12);
    expect(operations.indexOf("upsert:categories:12")).toBeLessThan(
      operations.indexOf(`upsert:budgets:${budgetRows.length}`)
    );
    const detailParentId = getStringField(
      categoryRows.find(
        (row) => getStringField(row, "display_name") === "QA Detail Food"
      ),
      "id"
    );
    const detailGroceriesId = getStringField(
      categoryRows.find(
        (row) => getStringField(row, "display_name") === "QA Detail Groceries"
      ),
      "id"
    );
    const detailDiningId = getStringField(
      categoryRows.find(
        (row) => getStringField(row, "display_name") === "QA Detail Dining"
      ),
      "id"
    );
    const detailFreshFoodId = getStringField(
      categoryRows.find(
        (row) => getStringField(row, "display_name") === "QA Detail Fresh Food"
      ),
      "id"
    );
    expect(
      categoryRows.find(
        (row) => getStringField(row, "display_name") === "QA Detail Groceries"
      )
    ).toEqual(expect.objectContaining({ parent_id: detailParentId }));
    expect(
      categoryRows.find(
        (row) => getStringField(row, "display_name") === "QA Detail Dining"
      )
    ).toEqual(expect.objectContaining({ parent_id: detailParentId }));
    expect(
      categoryRows.find(
        (row) => getStringField(row, "display_name") === "QA Detail Fresh Food"
      )
    ).toEqual(expect.objectContaining({ parent_id: detailGroceriesId }));
    expect(accountRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Cash Wallet" }),
        expect.objectContaining({ name: "NBE Salary Account" }),
        expect.objectContaining({
          name: "Binance BTC Wallet",
          balance: 0.03,
        }),
      ])
    );
    expect(accountRows).toHaveLength(8);
    expect(accountBalanceUpdates).toHaveLength(accountRows.length);
    expect(accountBalanceUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ balance: 2500 }),
        expect.objectContaining({ balance: 12430.55 }),
        expect.objectContaining({ balance: 0.03 }),
      ])
    );
    expect(
      accountRows.some((row) => getStringField(row, "name")?.includes("E2E"))
    ).toBe(false);
    expect(assetRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "21k Gold Chain",
          type: "METAL",
          purchase_price_decimal: "18500",
          purchase_currency: "EGP",
        }),
        expect.objectContaining({
          name: "Gold Test Bar",
          type: "METAL",
          purchase_price_decimal: "12500",
          purchase_currency: "USD",
        }),
        expect.objectContaining({
          name: "Apartment Down Payment",
          type: "REAL_ESTATE",
        }),
        expect.objectContaining({
          name: "BTC Long-term Holding",
          type: "CRYPTO",
        }),
      ])
    );
    expect(assetRows).toHaveLength(5);
    expectRowsStampedForIncrementalPull(assetRows);
    expect(assetMetalRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metal_type: "GOLD",
          item_form: "Jewelry",
          weight_grams_decimal: "24.5",
          purity_code: "gold-875",
          purity_factor_decimal: "0.875",
          purity_catalog_version: "1",
        }),
        expect.objectContaining({
          metal_type: "SILVER",
          item_form: "Coins",
          weight_grams_decimal: "250",
          purity_code: "silver-999",
          purity_factor_decimal: "0.999",
          purity_catalog_version: "1",
        }),
        expect.objectContaining({
          metal_type: "GOLD",
          item_form: "Bar",
          weight_grams_decimal: "10",
          purity_code: "gold-999",
          purity_factor_decimal: "0.999",
          purity_catalog_version: "1",
        }),
      ])
    );
    expect(assetMetalRows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metal_type: "PLATINUM" }),
      ])
    );
    expectRowsStampedForIncrementalPull(assetMetalRows);
    expect(metalHoldingStateRows).toHaveLength(3);
    expect(metalHoldingStateRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "active",
          financial_revision: "0",
          reconciliation_state: "accepted",
        }),
      ])
    );
    expect(budgetRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Groceries Monthly",
          period: "MONTHLY",
        }),
        expect.objectContaining({ name: "Transport Weekly", period: "WEEKLY" }),
        expect.objectContaining({
          name: "Ramadan Hosting",
          status: "PAUSED",
          deleted: true,
        }),
        expect.objectContaining({
          name: "Overall Spending",
          type: "GLOBAL",
          currency: "EGP",
        }),
        expect.objectContaining({
          name: "QA Healthy Weekly Global",
          type: "GLOBAL",
        }),
        expect.objectContaining({
          name: "QA Healthy Custom Global",
          status: "ACTIVE",
          deleted: false,
        }),
        expect.objectContaining({
          name: "QA Paused Category",
          status: "PAUSED",
          type: "CATEGORY",
          deleted: false,
        }),
        expect.objectContaining({
          name: "QA Near Limit Category",
          amount: 250,
          alert_threshold: 80,
          period: "WEEKLY",
        }),
        expect.objectContaining({
          name: "QA Over Budget Category",
          alert_fired_level: "DANGER",
        }),
        expect.objectContaining({
          name: "QA Zero Spend Category",
          amount: 3000,
        }),
        expect.objectContaining({
          name: "QA Expired Custom",
          period: "CUSTOM",
          type: "CATEGORY",
        }),
        expect.objectContaining({
          name: "QA Expired Paused Custom",
          status: "PAUSED",
          type: "CATEGORY",
        }),
        expect.objectContaining({
          name: "QA Historical Deleted Category Budget With A Long Name",
          category_id: getStringField(categoryRows[0], "id"),
        }),
        expect.objectContaining({
          name: "QA Detail Long Custom",
          category_id: detailParentId,
          period: "CUSTOM",
          status: "ACTIVE",
          type: "CATEGORY",
        }),
        expect.objectContaining({
          name: "ميزانية عربية طويلة لاختبار شاشة تفاصيل الميزانية",
          period: "WEEKLY",
          status: "ACTIVE",
          type: "CATEGORY",
        }),
        expect.objectContaining({
          name: "QA Disposable Detail Budget",
          period: "MONTHLY",
          status: "ACTIVE",
          type: "CATEGORY",
        }),
      ])
    );
    expectRowsStampedForIncrementalPull(budgetRows);
    const uniquenessKeys = budgetRows
      .filter((row) => (row as BudgetSeedRow).deleted !== true)
      .map((row) => {
        const budget = row as BudgetSeedRow;
        return budget.type === "GLOBAL"
          ? `GLOBAL:${budget.period}`
          : `CATEGORY:${budget.category_id}:${budget.period}`;
      });
    expect(new Set(uniquenessKeys).size).toBe(uniquenessKeys.length);
    const nearLimitCategoryId = getStringField(
      categoryRows.find(
        (row) =>
          getStringField(row, "display_name") ===
          "QA Near Limit Fixture Category"
      ),
      "id"
    );
    const overBudgetCategoryId = getStringField(
      categoryRows.find(
        (row) =>
          getStringField(row, "display_name") ===
          "QA Over Budget Fixture Category"
      ),
      "id"
    );
    expect(
      budgetRows.find(
        (row) => getStringField(row, "name") === "QA Near Limit Category"
      )
    ).toEqual(expect.objectContaining({ category_id: nearLimitCategoryId }));
    expect(
      budgetRows.find(
        (row) => getStringField(row, "name") === "QA Over Budget Category"
      )
    ).toEqual(expect.objectContaining({ category_id: overBudgetCategoryId }));
    expect(
      budgetRows.every(
        (row) => typeof (row as BudgetSeedRow).pause_intervals === "string"
      )
    ).toBe(true);
    const pausedBudget = budgetRows.find(
      (row) => (row as BudgetSeedRow).name === "QA Paused Category"
    ) as BudgetSeedRow | undefined;
    const pauseIntervals = parsePauseIntervals(
      pausedBudget?.pause_intervals ?? "[]"
    );
    expect(pauseIntervals).toHaveLength(1);
    expect(typeof pauseIntervals[0]?.startedAt).toBe("string");
    const detailBudget = budgetRows.find(
      (row) => getStringField(row, "name") === "QA Detail Long Custom"
    ) as BudgetSeedRow | undefined;
    const detailPauseIntervals = parseCompletedPauseIntervals(
      detailBudget?.pause_intervals ?? "[]"
    );
    expect(detailPauseIntervals).toHaveLength(1);
    expect(detailPauseIntervals[0]?.to).toBeGreaterThan(
      detailPauseIntervals[0]?.from ?? Number.POSITIVE_INFINITY
    );
    expect(
      Date.parse(getStringField(detailBudget, "period_end") ?? "") -
        Date.parse(getStringField(detailBudget, "period_start") ?? "")
    ).toBeGreaterThan(28 * 24 * 60 * 60 * 1000);
    expect(debtRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ party_name: "Ahmed", type: "LENT" }),
        expect.objectContaining({
          party_name: "Mona",
          status: "PARTIALLY_PAID",
        }),
        expect.objectContaining({ party_name: "Omar", status: "SETTLED" }),
      ])
    );
    expectRowsStampedForIncrementalPull(debtRows);
    expect(recurringPaymentRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Apartment Rent",
          frequency: "MONTHLY",
        }),
        expect.objectContaining({ name: "Salary", type: "INCOME" }),
        expect.objectContaining({ name: "Mona Repayment" }),
        expect.objectContaining({ name: "Gym Membership", status: "PAUSED" }),
      ])
    );
    expectRowsStampedForIncrementalPull(recurringPaymentRows);
    expect(
      recurringPaymentRows.some(
        (row) =>
          getStringField(row, "name") === "Mona Repayment" &&
          getStringField(row, "linked_debt_id") !== undefined
      )
    ).toBe(true);
    expect(profileRows[0]).toMatchObject({
      id: "existing-profile-id",
      display_name: "Monyvi Manual QA",
    });
    expect(transactionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ counterparty: "Metro Market" }),
        expect.objectContaining({ counterparty: "Salary" }),
        expect.objectContaining({ source: "SMS" }),
        expect.objectContaining({ source: "VOICE" }),
        expect.objectContaining({
          amount: 220,
          category_id: nearLimitCategoryId,
          counterparty: "QA Near Limit Fixture",
        }),
        expect.objectContaining({
          amount: 11640.5,
          category_id: overBudgetCategoryId,
          counterparty: "QA Over Budget Fixture",
        }),
        expect.objectContaining({
          amount: 350,
          counterparty: "QA Retained After Budget Delete",
          deleted: false,
          type: "EXPENSE",
        }),
      ])
    );
    expect(
      transactionRows.some(
        (row) => getStringField(row, "linked_asset_id") !== undefined
      )
    ).toBe(true);
    expect(
      transactionRows.some(
        (row) => getStringField(row, "linked_debt_id") !== undefined
      )
    ).toBe(true);
    const detailTransactions = transactionRows.filter((row) =>
      getStringField(row, "counterparty")?.startsWith("QA Detail ")
    );
    expect(detailTransactions).toHaveLength(9);
    expect(
      new Set(detailTransactions.map((row) => getStringField(row, "date"))).size
    ).toBeGreaterThan(6);
    expect(
      detailTransactions.map((row) => getStringField(row, "category_id"))
    ).toEqual(
      expect.arrayContaining([
        detailGroceriesId,
        detailDiningId,
        detailFreshFoodId,
      ])
    );
    const insidePauseTransaction = detailTransactions.find(
      (row) => getStringField(row, "counterparty") === "QA Detail Paused Inside"
    );
    const outsidePauseTransaction = detailTransactions.find(
      (row) =>
        getStringField(row, "counterparty") === "QA Detail Paused Outside"
    );
    const completedPause = detailPauseIntervals[0];
    expect(
      Date.parse(getStringField(insidePauseTransaction, "date") ?? "")
    ).toBeGreaterThanOrEqual(completedPause?.from ?? Number.POSITIVE_INFINITY);
    expect(
      Date.parse(getStringField(insidePauseTransaction, "date") ?? "")
    ).toBeLessThanOrEqual(completedPause?.to ?? Number.NEGATIVE_INFINITY);
    expect(
      Date.parse(getStringField(outsidePauseTransaction, "date") ?? "")
    ).toBeLessThan(completedPause?.from ?? Number.NEGATIVE_INFINITY);
    expect(transactionRows).toHaveLength(20);
    expectRowsStampedForIncrementalPull(
      transactionRows.filter(
        (row) =>
          getStringField(row, "counterparty") !== "Metro Market" &&
          getStringField(row, "counterparty") !== "Salary"
      )
    );
    expect(transferRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ notes: "Manual QA seeded ATM withdrawal" }),
        expect.objectContaining({ exchange_rate: 50 }),
        expect.objectContaining({
          amount: 0.01,
          converted_amount: 650,
          currency: "BTC",
          notes: "Crypto rebalance to USD cash",
        }),
      ])
    );
    expect(transferRows).toHaveLength(5);
    expectRowsStampedForIncrementalPull(
      transferRows.filter(
        (row) =>
          getStringField(row, "notes") !== "Manual QA seeded ATM withdrawal"
      )
    );
    expect(marketRateRows).toHaveLength(0);
  });

  it("seeds a persistent secondary user only for account-switch device QA", async () => {
    const operations: string[] = [];
    const createdAuthUsers: AuthUserSeedInput[] = [];

    const result = (await seedManualQaData(
      createMockClient(operations, { createdAuthUsers }),
      {
        ...getManualQaSeedConfig({
          E2E_LOCAL_JWT_SECRET:
            "super-secret-jwt-token-with-at-least-32-characters-long",
          MANUAL_QA_PASSWORD: "PrimaryPassword123!",
        }),
        userId: "user-manual-qa",
      },
      { includeAccountSwitchUser: true }
    )) as { readonly userId: string; readonly secondaryUserId?: string };

    expect(ACCOUNT_SWITCH_QA_EMAIL).toBe("manual-qa-secondary@monyvi.test");
    expect(ACCOUNT_SWITCH_QA_PASSWORD).toBe("123456");
    expect(createdAuthUsers).toContainEqual({
      email: ACCOUNT_SWITCH_QA_EMAIL,
      password: ACCOUNT_SWITCH_QA_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: "Monyvi Account Switch QA",
      },
    });
    expect(result).toEqual({
      userId: "user-manual-qa",
      secondaryUserId: "user-manual-qa-secondary",
    });
  });
});

interface AuthUserSeedInput {
  readonly email: string;
  readonly password: string;
  readonly email_confirm: boolean;
  readonly user_metadata: {
    readonly full_name: string;
    readonly seed: string;
  };
}

interface MockClientOptions {
  readonly accountBalanceUpdates?: AccountBalanceUpdate[];
  readonly accountRows?: unknown[];
  readonly assetMetalRows?: unknown[];
  readonly assetRows?: unknown[];
  readonly budgetRows?: unknown[];
  readonly categoryRows?: unknown[];
  readonly debtRows?: unknown[];
  readonly marketRateRows?: unknown[];
  readonly metalHoldingStateRows?: unknown[];
  readonly profileRows?: unknown[];
  readonly recurringPaymentRows?: unknown[];
  readonly transactionRows?: unknown[];
  readonly transferRows?: unknown[];
  readonly createdAuthUsers?: AuthUserSeedInput[];
  readonly existingProfileIds?: Readonly<Record<string, string>>;
}

function createMockClient(
  operations: string[],
  options: MockClientOptions = {}
): unknown {
  return {
    auth: {
      admin: {
        listUsers: () =>
          Promise.resolve({
            data: {
              users: [{ id: "user-manual-qa", email: "manual-qa@monyvi.test" }],
            },
            error: null,
          }),
        updateUserById: () => Promise.resolve({ error: null }),
        createUser: (input: AuthUserSeedInput) => {
          options.createdAuthUsers?.push(input);
          const isSecondary = input.email === ACCOUNT_SWITCH_QA_EMAIL;
          return Promise.resolve({
            data: {
              user: {
                id: isSecondary ? "user-manual-qa-secondary" : "user-manual-qa",
                email: input.email,
              },
            },
            error: null,
          });
        },
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, value: string) => ({
          maybeSingle: () =>
            Promise.resolve({
              data:
                table === "profiles" && options.existingProfileIds?.[value]
                  ? { id: options.existingProfileIds[value] }
                  : null,
              error: null,
            }),
        }),
      }),
      delete: () => ({
        eq: (column: string, value: string) => {
          operations.push(`delete:${table}:${column}:${value}`);
          return Promise.resolve({ error: null });
        },
        in: (column: string, values: readonly string[]) => {
          operations.push(`delete:${table}:${column}:${values.join(",")}`);
          return Promise.resolve({ error: null });
        },
      }),
      upsert: (rows: unknown[] | { user_id?: string; id?: string }) => {
        const marker = Array.isArray(rows)
          ? `${rows.length}`
          : String(rows.user_id ?? rows.id ?? "unknown");
        operations.push(`upsert:${table}:${marker}`);
        if (table === "accounts" && Array.isArray(rows)) {
          options.accountRows?.push(...rows);
        }
        if (table === "asset_metals" && Array.isArray(rows)) {
          options.assetMetalRows?.push(...rows);
        }
        if (table === "assets" && Array.isArray(rows)) {
          options.assetRows?.push(...rows);
        }
        if (table === "budgets" && Array.isArray(rows)) {
          options.budgetRows?.push(...rows);
        }
        if (table === "categories" && Array.isArray(rows)) {
          options.categoryRows?.push(...rows);
        }
        if (table === "debts" && Array.isArray(rows)) {
          options.debtRows?.push(...rows);
        }
        if (table === "market_rates") {
          options.marketRateRows?.push(rows);
        }
        if (table === "metal_holding_states" && Array.isArray(rows)) {
          options.metalHoldingStateRows?.push(...rows);
        }
        if (table === "profiles") {
          options.profileRows?.push(rows);
        }
        if (table === "recurring_payments" && Array.isArray(rows)) {
          options.recurringPaymentRows?.push(...rows);
        }
        if (table === "transactions" && Array.isArray(rows)) {
          options.transactionRows?.push(...rows);
        }
        if (table === "transfers" && Array.isArray(rows)) {
          options.transferRows?.push(...rows);
        }
        return { error: null };
      },
      update: (patch: unknown) => {
        const filters: { column: string; value: string }[] = [];
        const builder = {
          eq: (column: string, value: string) => {
            filters.push({ column, value });
            if (filters.length < 2) {
              return builder;
            }

            operations.push(`update:${table}:${filters[0]?.value}`);
            options.accountBalanceUpdates?.push({
              balance: getNumberField(patch, "balance"),
              filters: [...filters],
            });
            return Promise.resolve({ error: null });
          },
        };

        return builder;
      },
    }),
  };
}
