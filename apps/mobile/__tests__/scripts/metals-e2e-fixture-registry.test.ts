import { resolve } from "node:path";

const fixtureModulePath = resolve(
  __dirname,
  "../../scripts/seed-fixtures/metals-e2e-fixtures.js"
);
const registryModulePath = resolve(
  __dirname,
  "../../scripts/seed-fixtures/e2e-fixture.js"
);
const seedEngineModulePath = resolve(
  __dirname,
  "../../scripts/seed-fixtures/seed-engine.js"
);
const e2eSeedModulePath = resolve(__dirname, "../../scripts/e2e-seed.js");

interface RecordedOperation {
  table: string;
  operation: "delete" | "select" | "upsert";
  column?: string;
  selection?: string;
  value?: unknown;
  rows?: unknown;
}

function createSeedClient(records: RecordedOperation[]): {
  from: (table: string) => unknown;
} {
  return {
    from(table: string) {
      return {
        delete() {
          return {
            eq(column: string, value: unknown) {
              records.push({ table, operation: "delete", column, value });
              return Promise.resolve({ error: null });
            },
            in(column: string, value: unknown) {
              records.push({ table, operation: "delete", column, value });
              return Promise.resolve({ error: null });
            },
          };
        },
        select(selection = "*") {
          const filters: Array<{ column: string; value: unknown }> = [];
          const query = {
            eq(column: string, value: unknown) {
              filters.push({ column, value });
              return query;
            },
            in(column: string, value: unknown) {
              filters.push({ column, value });
              return query;
            },
            maybeSingle() {
              records.push({
                table,
                operation: "select",
                selection,
                ...filters[0],
              });
              return Promise.resolve({ data: null, error: null });
            },
            then(
              resolveResult: (result: { data: unknown[]; error: null }) => void
            ) {
              records.push({
                table,
                operation: "select",
                selection,
                ...filters[0],
              });
              resolveResult({ data: [], error: null });
            },
          };
          return query;
        },
        upsert(rows: unknown) {
          records.push({ table, operation: "upsert", rows });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

describe("Metals deterministic E2E fixture registry", () => {
  it("registers the complete Metals state matrix", () => {
    const { METALS_E2E_FIXTURES } = jest.requireActual(fixtureModulePath) as {
      METALS_E2E_FIXTURES: Record<string, Record<string, unknown>>;
    };
    const fixtures = Object.values(METALS_E2E_FIXTURES);
    const serialized = JSON.stringify(fixtures);

    for (const state of ["fresh", "stale", "unknown", "missing"])
      expect(serialized).toContain(state);
    for (const state of ["local", "restart", "conflict"])
      expect(serialized).toContain(state);
    for (const locale of ["en", "ar"])
      expect(serialized).toContain(`"locale":"${locale}"`);
    for (const theme of ["light", "dark"])
      expect(serialized).toContain(`"theme":"${theme}"`);
    expect(serialized).toContain("accountEligibility");
    expect(serialized).toContain("textScale");
    expect(serialized).toContain("reset");
    expect(serialized).toContain("inspect");

    for (const profileName of [
      "metals-fresh-local-en-light",
      "metals-stale-boundary-local-en-light",
      "metals-unknown-conflict-en-dark",
      "metals-offline-cached-local-en-light",
      "metals-refresh-failure-cached-local-en-light",
      "metals-missing-local-ar-light",
      "metals-invalid-local-en-light",
    ]) {
      expect(METALS_E2E_FIXTURES).toHaveProperty(profileName);
    }

    const fixture = METALS_E2E_FIXTURES["metals-fresh-local-en-light"];
    const buildExtraRows = fixture?.buildExtraRows;
    expect(typeof buildExtraRows).toBe("function");
    const rows = (
      buildExtraRows as (
        input: Record<string, unknown>
      ) => Record<string, unknown>
    )({
      currentTimestamp: "2030-01-02T03:04:05.000Z",
      deterministicUuid: (...parts: unknown[]) => parts.join(":"),
      marketRateTemplate: {
        egp_usd: 0.02,
        gold_usd_per_gram: 75.25,
        silver_usd_per_gram: 0.95,
      },
      seedScope: "metals",
      userId: "user",
    });
    expect(rows).toHaveProperty("assetMetals");
    expect(rows).not.toHaveProperty("asset_metals");
    expect(
      (rows.assetMetals as Array<Record<string, unknown>>)[0]
    ).toMatchObject({
      metal_type: "GOLD",
      purity_code: "gold-999",
      purity_catalog_version: "1",
    });
    expect((rows.assets as Array<Record<string, unknown>>)[0]).toMatchObject({
      acquisition_action_id: null,
      purchase_date: "2026-08-01",
      updated_at: "2030-01-02T03:04:05.000Z",
    });
    expect(
      (rows.assetMetals as Array<Record<string, unknown>>)[0]
    ).toMatchObject({
      updated_at: "2030-01-02T03:04:05.000Z",
    });
    const holdingState = (
      rows.metalHoldingStates as Array<Record<string, unknown>>
    )[0];
    expect(holdingState).toMatchObject({
      updated_at: "2030-01-02T03:04:05.000Z",
    });
    expect(holdingState?.id).toBe(holdingState?.holding_id);
    expect(
      (rows.marketRateObservations as Array<Record<string, unknown>>)[0]
    ).toMatchObject({
      created_at: "2030-01-02T03:04:05.000Z",
      provider_observed_at: "2030-01-02T03:04:05.000Z",
    });
    expect(rows.marketRates).toEqual([
      expect.objectContaining({
        gold_usd_per_gram: 75.25,
        silver_usd_per_gram: 0.95,
        egp_usd: 0.02,
        timestamp_currency: "2030-01-02T03:04:05.000Z",
        timestamp_metal: "2030-01-02T03:04:05.000Z",
      }),
    ]);
    expect(rows.marketRateObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instrument_code: "metal:GOLD",
          value_decimal: "75.25",
        }),
        expect.objectContaining({
          instrument_code: "metal:SILVER",
          value_decimal: "0.95",
        }),
        expect.objectContaining({
          instrument_code: "currency:EGP",
          value_decimal: "0.02",
        }),
      ])
    );
    expect(rows.marketRateObservations).toHaveLength(3);

    const staleFixture =
      METALS_E2E_FIXTURES["metals-stale-boundary-local-en-light"];
    const staleRows = (
      staleFixture?.buildExtraRows as (
        input: Record<string, unknown>
      ) => Record<string, unknown>
    )({
      currentTimestamp: "2030-01-02T03:04:05.000Z",
      deterministicUuid: (...parts: unknown[]) => parts.join(":"),
      marketRateTemplate: {},
      seedScope: "metals",
      userId: "user",
    });
    expect(
      (staleRows.marketRateObservations as Array<Record<string, unknown>>)[0]
    ).toMatchObject({
      created_at: "2030-01-02T03:04:05.000Z",
      provider_observed_at: "2030-01-01T03:04:04.999Z",
    });

    const invalidFixture = METALS_E2E_FIXTURES["metals-invalid-local-en-light"];
    const invalidRows = (
      invalidFixture?.buildExtraRows as (
        input: Record<string, unknown>
      ) => Record<string, unknown>
    )({
      currentTimestamp: "2030-01-02T03:04:05.000Z",
      deterministicUuid: (...parts: unknown[]) => parts.join(":"),
      marketRateTemplate: {},
      seedScope: "metals-invalid",
      userId: "user",
    });
    expect(invalidRows.marketRateObservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instrument_code: "metal:GOLD",
          quality: "invalid",
        }),
        expect.objectContaining({
          instrument_code: "metal:SILVER",
          quality: "valid",
        }),
        expect.objectContaining({
          instrument_code: "currency:EGP",
          quality: "valid",
        }),
      ])
    );
  });

  it("returns deterministic profiles and rejects unknown fixture names", () => {
    const { METALS_E2E_FIXTURES } = jest.requireActual(fixtureModulePath) as {
      METALS_E2E_FIXTURES: Record<string, Record<string, unknown>>;
    };
    const { getE2eFixture } = jest.requireActual(registryModulePath) as {
      getE2eFixture: (name: string) => Record<string, unknown>;
    };
    const [name] = Object.keys(METALS_E2E_FIXTURES);
    expect(name).toBeDefined();
    expect(getE2eFixture(name!)).toEqual(getE2eFixture(name!));
    expect(() => getE2eFixture("metals-does-not-exist")).toThrow(
      /Unknown E2E.*profile/
    );
  });

  it("seeds, inspects, and resets every persisted Metals fixture row", async () => {
    const { METALS_E2E_FIXTURES } = jest.requireActual(fixtureModulePath) as {
      METALS_E2E_FIXTURES: Record<string, Record<string, unknown>>;
    };
    const { inspectFixtureData, resetFixtureData, seedFixtureData } =
      jest.requireActual(seedEngineModulePath) as {
        inspectFixtureData: (
          client: ReturnType<typeof createSeedClient>,
          config: { mode: string; userId: string },
          fixture: Record<string, unknown>
        ) => Promise<{
          tables: Record<string, { expected: number; rows: unknown[] }>;
        }>;
        resetFixtureData: (
          client: ReturnType<typeof createSeedClient>,
          config: { mode: string; userId: string },
          fixture: Record<string, unknown>
        ) => Promise<unknown>;
        seedFixtureData: (
          client: ReturnType<typeof createSeedClient>,
          config: { mode: string; userId: string },
          fixture: Record<string, unknown>
        ) => Promise<unknown>;
      };
    const fixture = METALS_E2E_FIXTURES["metals-fresh-local-en-light"]!;
    const records: RecordedOperation[] = [];
    const client = createSeedClient(records);
    const config = {
      mode: "local",
      userId: "11111111-1111-4111-8111-111111111111",
    };

    await seedFixtureData(client, config, fixture);

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "market_rates",
          operation: "upsert",
        }),
        expect.objectContaining({
          table: "metal_holding_states",
          operation: "upsert",
        }),
        expect.objectContaining({
          table: "market_rate_observations",
          operation: "upsert",
        }),
      ])
    );

    records.length = 0;
    const inspection = await inspectFixtureData(client, config, fixture);
    expect(inspection.tables.market_rates.expected).toBe(1);
    expect(inspection.tables.metal_holding_states.expected).toBe(1);
    expect(inspection.tables.market_rate_observations.expected).toBe(3);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "market_rates",
          operation: "select",
        }),
        expect.objectContaining({
          table: "metal_holding_states",
          operation: "select",
          selection: expect.stringContaining(
            "financial_revision:financial_revision::text"
          ),
        }),
        expect.objectContaining({
          table: "market_rate_observations",
          operation: "select",
          selection: expect.stringContaining(
            "value_decimal:value_decimal::text"
          ),
        }),
        expect.objectContaining({
          table: "assets",
          operation: "select",
          selection: expect.stringContaining(
            "purchase_price_decimal:purchase_price_decimal::text"
          ),
        }),
        expect.objectContaining({
          table: "asset_metals",
          operation: "select",
          selection: expect.stringContaining(
            "weight_grams_decimal:weight_grams_decimal::text"
          ),
        }),
      ])
    );

    records.length = 0;
    await resetFixtureData(client, config, fixture);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "market_rates",
          operation: "delete",
          column: "id",
        }),
        expect.objectContaining({
          table: "metal_holding_states",
          operation: "delete",
          column: "user_id",
          value: config.userId,
        }),
        expect.objectContaining({
          table: "market_rate_observations",
          operation: "delete",
          column: "id",
        }),
      ])
    );
  });

  it("materializes an ineligible profile with no same-currency account", async () => {
    const { METALS_E2E_FIXTURES } = jest.requireActual(fixtureModulePath) as {
      METALS_E2E_FIXTURES: Record<string, Record<string, unknown>>;
    };
    const { seedFixtureData } = jest.requireActual(seedEngineModulePath) as {
      seedFixtureData: (
        client: ReturnType<typeof createSeedClient>,
        config: { mode: string; userId: string },
        fixture: Record<string, unknown>
      ) => Promise<unknown>;
    };
    const records: RecordedOperation[] = [];

    await seedFixtureData(
      createSeedClient(records),
      {
        mode: "local",
        userId: "11111111-1111-4111-8111-111111111111",
      },
      METALS_E2E_FIXTURES["metals-missing-local-ar-light"]!
    );

    const accountUpsert = records.find(
      (record) => record.table === "accounts" && record.operation === "upsert"
    );
    expect(accountUpsert).toBeDefined();
    expect(accountUpsert?.rows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ currency: "EGP" })])
    );
  });

  it("materializes the selected locale and theme in the seeded profile", async () => {
    const { METALS_E2E_FIXTURES } = jest.requireActual(fixtureModulePath) as {
      METALS_E2E_FIXTURES: Record<string, Record<string, unknown>>;
    };
    const { seedFixtureData } = jest.requireActual(seedEngineModulePath) as {
      seedFixtureData: (
        client: ReturnType<typeof createSeedClient>,
        config: { mode: string; userId: string },
        fixture: Record<string, unknown>
      ) => Promise<unknown>;
    };
    const records: RecordedOperation[] = [];

    jest.useFakeTimers().setSystemTime(Date.parse("2030-01-02T03:04:05.000Z"));
    try {
      await seedFixtureData(
        createSeedClient(records),
        {
          mode: "local",
          userId: "11111111-1111-4111-8111-111111111111",
        },
        METALS_E2E_FIXTURES["metals-stale-restart-ar-dark"]!
      );
    } finally {
      jest.useRealTimers();
    }

    const profileUpsert = records.find(
      (record) => record.table === "profiles" && record.operation === "upsert"
    );
    expect(profileUpsert?.rows).toMatchObject({
      created_at: "2026-04-08T12:00:00.000Z",
      preferred_language: "ar",
      theme: "DARK",
      updated_at: "2030-01-02T03:04:05.000Z",
    });
    const accountUpsert = records.find(
      (record) => record.table === "accounts" && record.operation === "upsert"
    );
    const accountRows = accountUpsert?.rows as Array<Record<string, unknown>>;
    expect(accountRows).toHaveLength(4);
    for (const account of accountRows) {
      expect(account).toMatchObject({
        created_at: "2026-04-08T12:00:00.000Z",
        updated_at: "2030-01-02T03:04:05.000Z",
      });
    }
  });

  it("clears observation IDs from every Metals profile before profile switches", async () => {
    const { METALS_E2E_FIXTURES } = jest.requireActual(fixtureModulePath) as {
      METALS_E2E_FIXTURES: Record<string, Record<string, unknown>>;
    };
    const { seedFixtureData } = jest.requireActual(seedEngineModulePath) as {
      seedFixtureData: (
        client: ReturnType<typeof createSeedClient>,
        config: { mode: string; userId: string },
        fixture: Record<string, unknown>
      ) => Promise<unknown>;
    };
    const records: RecordedOperation[] = [];

    await seedFixtureData(
      createSeedClient(records),
      {
        mode: "local",
        userId: "11111111-1111-4111-8111-111111111111",
      },
      METALS_E2E_FIXTURES["metals-missing-local-ar-light"]!
    );

    const observationDelete = records.find(
      (record) =>
        record.table === "market_rate_observations" &&
        record.operation === "delete"
    );
    expect(observationDelete).toMatchObject({ column: "id" });
    expect(observationDelete?.value).toHaveLength(24);
  });

  it("exposes materialized cached/offline and one-shot refresh controls", () => {
    const { METALS_E2E_FIXTURES } = jest.requireActual(fixtureModulePath) as {
      METALS_E2E_FIXTURES: Record<string, Record<string, unknown>>;
    };

    expect(
      METALS_E2E_FIXTURES["metals-offline-cached-local-en-light"]
    ).toMatchObject({
      cacheState: "seeded",
      connectivityState: "offline_after_cache",
    });
    expect(
      METALS_E2E_FIXTURES["metals-refresh-failure-cached-local-en-light"]
    ).toMatchObject({
      cacheState: "seeded",
      refreshFailureMode: "once",
    });
  });

  it("exposes Metals profile selection and inspect through the E2E runner", () => {
    const { getE2eFixture, inspectE2eData } = jest.requireActual(
      e2eSeedModulePath
    ) as {
      getE2eFixture: (env: Record<string, string>) => Record<string, unknown>;
      inspectE2eData: unknown;
    };

    expect(
      getE2eFixture({ E2E_METALS_PROFILE: "metals-fresh-local-en-light" })
    ).toMatchObject({ rateState: "fresh", persistenceState: "local" });
    expect(typeof inspectE2eData).toBe("function");
  });
});
