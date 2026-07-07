import {
  getManualQaSeedConfig,
  seedManualQaData,
} from "../../scripts/manual-qa-seed";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manual-qa-seed script helpers", () => {
  it("uses the neutral seed engine instead of depending on E2E seed internals", () => {
    const manualQaSeedSource = readFileSync(
      resolve(__dirname, "../../scripts/manual-qa-seed.js"),
      "utf8"
    );

    expect(manualQaSeedSource).toContain("./seed-fixtures/seed-engine");
    expect(manualQaSeedSource).not.toContain("./e2e-seed");
  });

  it("preserves the existing manual QA password when no password is provided", () => {
    const config = getManualQaSeedConfig({
      E2E_SUPABASE_MODE: "local",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(config.email).toBe("manual-qa@monyvi.test");
    expect(config.password).toBeNull();
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
    const assetMetalRows: unknown[] = [];
    const assetRows: unknown[] = [];
    const budgetRows: unknown[] = [];
    const debtRows: unknown[] = [];
    const recurringPaymentRows: unknown[] = [];
    const profileRows: unknown[] = [];
    const transactionRows: unknown[] = [];
    const transferRows: unknown[] = [];
    const marketRateRows: unknown[] = [];

    await seedManualQaData(
      createMockClient(operations, {
        accountRows,
        assetMetalRows,
        assetRows,
        budgetRows,
        debtRows,
        marketRateRows,
        profileRows,
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
    expect(accountRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Cash Wallet" }),
        expect.objectContaining({ name: "NBE Salary Account" }),
      ])
    );
    expect(accountRows).toHaveLength(8);
    expect(accountRows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringContaining("E2E") }),
      ])
    );
    expect(assetRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "21k Gold Chain", type: "METAL" }),
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
    expect(assetMetalRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metal_type: "GOLD", item_form: "Jewelry" }),
        expect.objectContaining({ metal_type: "SILVER", item_form: "Coins" }),
        expect.objectContaining({ metal_type: "PLATINUM", item_form: "Bar" }),
      ])
    );
    expect(budgetRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Groceries Monthly",
          period: "MONTHLY",
        }),
        expect.objectContaining({ name: "Transport Weekly", period: "WEEKLY" }),
        expect.objectContaining({ name: "Ramadan Hosting", status: "PAUSED" }),
        expect.objectContaining({ name: "Overall Spending", type: "GLOBAL" }),
      ])
    );
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
    expect(recurringPaymentRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Apartment Rent",
          frequency: "MONTHLY",
        }),
        expect.objectContaining({ name: "Salary", type: "INCOME" }),
        expect.objectContaining({
          name: "Mona Repayment",
          linked_debt_id: expect.any(String),
        }),
        expect.objectContaining({ name: "Gym Membership", status: "PAUSED" }),
      ])
    );
    expect(profileRows[0]).toMatchObject({ display_name: "Monyvi Manual QA" });
    expect(transactionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ counterparty: "Metro Market" }),
        expect.objectContaining({ counterparty: "Salary" }),
        expect.objectContaining({ source: "SMS" }),
        expect.objectContaining({ source: "VOICE" }),
        expect.objectContaining({ linked_asset_id: expect.any(String) }),
        expect.objectContaining({ linked_debt_id: expect.any(String) }),
      ])
    );
    expect(transactionRows).toHaveLength(8);
    expect(transferRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ notes: "Manual QA seeded ATM withdrawal" }),
        expect.objectContaining({ exchange_rate: 50 }),
      ])
    );
    expect(transferRows).toHaveLength(5);
    expect(marketRateRows).toHaveLength(0);
  });
});

interface MockClientOptions {
  readonly accountRows?: unknown[];
  readonly assetMetalRows?: unknown[];
  readonly assetRows?: unknown[];
  readonly budgetRows?: unknown[];
  readonly debtRows?: unknown[];
  readonly marketRateRows?: unknown[];
  readonly profileRows?: unknown[];
  readonly recurringPaymentRows?: unknown[];
  readonly transactionRows?: unknown[];
  readonly transferRows?: unknown[];
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
        createUser: () =>
          Promise.resolve({
            data: {
              user: { id: "user-manual-qa", email: "manual-qa@monyvi.test" },
            },
            error: null,
          }),
      },
    },
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: string) => {
          operations.push(`delete:${table}:${column}:${value}`);
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
        if (table === "debts" && Array.isArray(rows)) {
          options.debtRows?.push(...rows);
        }
        if (table === "market_rates") {
          options.marketRateRows?.push(rows);
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
    }),
  };
}
