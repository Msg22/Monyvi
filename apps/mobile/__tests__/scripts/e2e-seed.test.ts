import {
  E2E_TABLE_DELETE_ORDER,
  getE2eSeedConfig,
  resetE2eData,
  seedE2eData,
} from "../../scripts/e2e-seed";

const EXPECTED_E2E_MARKET_RATE_ID = "00000000-0000-0000-0006-000000000001";

describe("e2e-seed script helpers", () => {
  it("uses safe local defaults only for local Supabase mode", () => {
    const config = getE2eSeedConfig({
      E2E_SUPABASE_MODE: "local",
      E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
    });

    expect(config.mode).toBe("local");
    expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(config.appSupabaseUrl).toBe("http://10.0.2.2:54321");
    expect(config.email).toBe("e2e@monyvi.test");
    expect(config.password).toMatch(/^MonyviE2E-.+-1aA!$/);
    expect(config.serviceRoleKey).toContain("eyJ");
  });

  it("reads local Supabase keys from status output when local keys are not set", () => {
    const config = getE2eSeedConfig(
      {
        E2E_SUPABASE_MODE: "local",
      },
      {
        readLocalSupabaseStatusEnv: () =>
          [
            'ANON_KEY="local-anon-key"',
            'SERVICE_ROLE_KEY="local-service-role-key"',
          ].join("\n"),
      }
    );

    expect(config.anonKey).toBe("local-anon-key");
    expect(config.serviceRoleKey).toBe("local-service-role-key");
    expect(config.email).toBe("e2e@monyvi.test");
    expect(config.password).toMatch(/^MonyviE2E-.+-1aA!$/);
  });

  it("fails fast when local Supabase keys cannot be resolved", () => {
    expect(() =>
      getE2eSeedConfig(
        {
          E2E_SUPABASE_MODE: "local",
        },
        {
          readLocalSupabaseStatusEnv: () => "",
        }
      )
    ).toThrow("Could not find local Supabase keys");
  });

  it("uses explicit local Supabase keys without requiring the local JWT secret", () => {
    const config = getE2eSeedConfig({
      E2E_SUPABASE_MODE: "local",
      E2E_LOCAL_SUPABASE_ANON_KEY: "anon-key",
      E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
      MAESTRO_E2E_PASSWORD: "Password123!",
    });

    expect(config.anonKey).toBe("anon-key");
    expect(config.serviceRoleKey).toBe("service-role-key");
  });

  it("ignores remote Supabase env vars when local mode reads local status", () => {
    const config = getE2eSeedConfig(
      {
        E2E_SUPABASE_MODE: "local",
        EXPO_PUBLIC_SUPABASE_URL: "https://remote-project.supabase.co",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "remote-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "remote-service-role-key",
      },
      {
        readLocalSupabaseStatusEnv: () =>
          [
            'ANON_KEY="local-anon-key"',
            'SERVICE_ROLE_KEY="local-service-role-key"',
          ].join("\n"),
      }
    );

    expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(config.appSupabaseUrl).toBe("http://10.0.2.2:54321");
    expect(config.anonKey).toBe("local-anon-key");
    expect(config.serviceRoleKey).toBe("local-service-role-key");
  });

  it("requires explicit service role and credentials for remote Supabase mode", () => {
    expect(() =>
      getE2eSeedConfig({
        E2E_SUPABASE_MODE: "remote",
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      })
    ).toThrow("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("deletes child tables before parent tables for the seeded user", () => {
    expect(E2E_TABLE_DELETE_ORDER.indexOf("transactions")).toBeLessThan(
      E2E_TABLE_DELETE_ORDER.indexOf("accounts")
    );
    expect(E2E_TABLE_DELETE_ORDER.indexOf("transfers")).toBeLessThan(
      E2E_TABLE_DELETE_ORDER.indexOf("accounts")
    );
    expect(E2E_TABLE_DELETE_ORDER.indexOf("account_sms_senders")).toBeLessThan(
      E2E_TABLE_DELETE_ORDER.indexOf("accounts")
    );
    expect(E2E_TABLE_DELETE_ORDER.at(-1)).toBe("profiles");
  });

  it("resets and seeds only rows scoped to the E2E user", async () => {
    const operations: string[] = [];
    const client = createMockClient(operations);

    await seedE2eData(client, {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
      userId: "user-e2e",
    });

    expect(operations).toContain("delete:transactions:user_id:user-e2e");
    expect(operations).toContain("delete:accounts:user_id:user-e2e");
    expect(
      operations.filter((operation) =>
        operation.startsWith("delete:bank_details:account_id:")
      )
    ).toHaveLength(8);
    expect(
      operations.filter((operation) =>
        operation.startsWith("delete:account_sms_senders:account_id:")
      )
    ).toHaveLength(8);
    expect(operations).toContain("upsert:profiles:user-e2e");
    expect(operations).toContain("upsert:accounts:4");
    expect(operations).toContain("upsert:account_sms_senders:3");
    expect(operations).toContain("upsert:transactions:2");
    expect(operations).toContain("upsert:transfers:1");
    expect(operations).toContain(
      `upsert:market_rates:${EXPECTED_E2E_MARKET_RATE_ID}`
    );
  });

  it("seeds a recent market rate so synced E2E transaction lists can render", async () => {
    const operations: string[] = [];
    const marketRateRows: unknown[] = [];
    const transactionRows: unknown[] = [];
    const transferRows: unknown[] = [];
    const client = createMockClient(operations, {
      marketRateRows,
      transactionRows,
      transferRows,
    });

    await seedE2eData(client, {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
      userId: "user-e2e",
    });

    expect(marketRateRows).toHaveLength(1);
    expect(marketRateRows[0]).toMatchObject({
      id: EXPECTED_E2E_MARKET_RATE_ID,
      egp_usd: 0.02,
      gold_usd_per_gram: 75,
    });
    const createdAt = (marketRateRows[0] as { created_at?: string }).created_at;
    expect(createdAt).toBeDefined();
    expect(Date.now() - Date.parse(createdAt ?? "")).toBeLessThan(
      7 * 24 * 60 * 60 * 1000
    );
    expect(transactionRows).toHaveLength(2);
    expect(transferRows).toHaveLength(1);
    const today = new Date().toISOString().slice(0, 10);
    expect(transactionRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: today }),
        expect.objectContaining({ date: today }),
      ])
    );
    expect(transferRows[0]).toMatchObject({ date: today });
  });

  it("does not seed fake global market rates in remote mode", async () => {
    const operations: string[] = [];
    const marketRateRows: unknown[] = [];
    const client = createMockClient(operations, { marketRateRows });

    await seedE2eData(client, {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "remote",
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
      userId: "user-e2e",
    });

    expect(operations).not.toContain(
      `upsert:market_rates:${EXPECTED_E2E_MARKET_RATE_ID}`
    );
    expect(marketRateRows).toHaveLength(0);
  });

  it("syncs credentials when the E2E auth user already exists", async () => {
    const operations: string[] = [];
    const client = createMockClient(operations);

    await seedE2eData(client, {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
    });

    expect(operations).toContain("update-user:user-e2e");
    expect(operations).toContain("update-user-password:user-e2e");
  });

  it("preserves an existing auth user's password when configured", async () => {
    const operations: string[] = [];
    const client = createMockClient(operations);

    await seedE2eData(client, {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        E2E_PRESERVE_EXISTING_PASSWORD: "1",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
      }),
    });

    expect(operations).toContain("update-user:user-e2e");
    expect(operations).toContain("update-user-without-password:user-e2e");
    expect(operations).not.toContain("update-user-password:user-e2e");
  });

  it("guides missing-password recovery with the supported E2E env vars", async () => {
    const operations: string[] = [];
    const client = createMockClient(operations, { authPages: [[]] });

    await expect(
      seedE2eData(client, {
        ...getE2eSeedConfig({
          E2E_SUPABASE_MODE: "local",
          E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
          E2E_PRESERVE_EXISTING_PASSWORD: "1",
          MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        }),
      })
    ).rejects.toThrow(
      "Set MAESTRO_E2E_PASSWORD once, then rerun with E2E_PRESERVE_EXISTING_PASSWORD=1"
    );
    expect(operations).not.toContain("create-user:e2e@monyvi.test");
  });

  it("resets scoped rows without reseeding fixture data", async () => {
    const operations: string[] = [];
    const client = createMockClient(operations);

    await resetE2eData(client, {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
      userId: "user-e2e",
    });

    expect(operations).toContain("delete:transactions:user_id:user-e2e");
    expect(operations).toContain("delete:accounts:user_id:user-e2e");
    expect(operations).not.toContain("upsert:profiles:user-e2e");
    expect(operations).not.toContain("upsert:accounts:4");
    expect(operations).not.toContain("upsert:transactions:2");
    expect(operations).not.toContain("upsert:transfers:1");
  });

  it("finds an existing E2E auth user after the first auth page", async () => {
    const operations: string[] = [];
    const client = createMockClient(operations, {
      authPages: [
        Array.from({ length: 1000 }, (_, index) => ({
          id: `user-other-${index}`,
          email: `other-${index}@monyvi.test`,
        })),
        [{ id: "user-e2e", email: "e2e@monyvi.test" }],
      ],
    });

    await seedE2eData(client, {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
    });

    expect(operations).toContain("list-users:1");
    expect(operations).toContain("list-users:2");
    expect(operations).toContain("update-user:user-e2e");
    expect(operations).not.toContain("create-user:e2e@monyvi.test");
  });

  it("derives seeded row ids from the target user", async () => {
    const firstUserOperations: string[] = [];
    const secondUserOperations: string[] = [];

    await seedE2eData(createMockClient(firstUserOperations), {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
      userId: "user-e2e-one",
    });
    await seedE2eData(createMockClient(secondUserOperations), {
      ...getE2eSeedConfig({
        E2E_SUPABASE_MODE: "local",
        E2E_LOCAL_JWT_SECRET: "local-test-jwt-secret-with-enough-length",
        MAESTRO_E2E_EMAIL: "e2e@monyvi.test",
        MAESTRO_E2E_PASSWORD: "Password123!",
      }),
      userId: "user-e2e-two",
    });

    const firstAccountIds = firstUserOperations.find((operation) =>
      operation.startsWith("upsert-ids:accounts:")
    );
    const secondAccountIds = secondUserOperations.find((operation) =>
      operation.startsWith("upsert-ids:accounts:")
    );

    expect(firstAccountIds).toBeDefined();
    expect(secondAccountIds).toBeDefined();
    expect(firstAccountIds).not.toBe(secondAccountIds);
  });
});

interface MockUser {
  readonly id: string;
  readonly email: string;
}

interface MockClientOptions {
  readonly authPages?: readonly (readonly MockUser[])[];
  readonly marketRateRows?: unknown[];
  readonly transactionRows?: unknown[];
  readonly transferRows?: unknown[];
}

function createMockClient(
  operations: string[],
  options: MockClientOptions = {}
): unknown {
  const authPages = options.authPages ?? [
    [{ id: "user-e2e", email: "e2e@monyvi.test" }],
  ];

  return {
    auth: {
      admin: {
        listUsers: ({ page = 1 }: { readonly page?: number } = {}) => {
          operations.push(`list-users:${page}`);
          return Promise.resolve({
            data: { users: authPages[page - 1] ?? [] },
            error: null,
          });
        },
        updateUserById: (userId: string, attributes: { password?: string }) => {
          operations.push(`update-user:${userId}`);
          operations.push(
            attributes.password
              ? `update-user-password:${userId}`
              : `update-user-without-password:${userId}`
          );
          return Promise.resolve({ error: null });
        },
        createUser: ({ email }: { readonly email: string }) => {
          operations.push(`create-user:${email}`);
          return Promise.resolve({
            data: { user: { id: "user-created", email } },
            error: null,
          });
        },
      },
    },
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: string) => {
          operations.push(`delete:${table}:${column}:${value}`);
          return Promise.resolve({ error: null });
        },
      }),
      upsert: (
        rows: unknown[] | { id?: string; user_id?: string },
        upsertOptions?: unknown
      ) => {
        const marker = Array.isArray(rows)
          ? `${rows.length}`
          : String(
              rows.user_id ??
                ("id" in rows && typeof rows.id === "string"
                  ? rows.id
                  : "unknown")
            );
        operations.push(`upsert:${table}:${marker}`);
        if (table === "market_rates") {
          options.marketRateRows?.push(rows);
        }
        if (table === "transactions" && Array.isArray(rows)) {
          options.transactionRows?.push(...rows);
        }
        if (table === "transfers" && Array.isArray(rows)) {
          options.transferRows?.push(...rows);
        }
        if (Array.isArray(rows)) {
          const ids = rows
            .map((row) =>
              typeof row === "object" && row !== null && "id" in row
                ? String(row.id)
                : "unknown"
            )
            .join(",");
          operations.push(`upsert-ids:${table}:${ids}`);
        }
        return {
          select: () => ({
            single: () => Promise.resolve({ data: rows, error: null }),
          }),
          options: upsertOptions,
        };
      },
    }),
  };
}
