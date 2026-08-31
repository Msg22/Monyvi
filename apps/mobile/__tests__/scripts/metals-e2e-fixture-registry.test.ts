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
  value?: unknown;
  rows?: unknown;
}

function createSeedClient(records: RecordedOperation[]) {
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
        select() {
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
              records.push({ table, operation: "select", ...filters[0] });
              return Promise.resolve({ data: null, error: null });
            },
            then(
              resolveResult: (result: { data: unknown[]; error: null }) => void
            ) {
              records.push({ table, operation: "select", ...filters[0] });
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

    const fixture = METALS_E2E_FIXTURES["metals-fresh-local-en-light"];
    const buildExtraRows = fixture?.buildExtraRows;
    expect(typeof buildExtraRows).toBe("function");
    const rows = (
      buildExtraRows as (
        input: Record<string, unknown>
      ) => Record<string, unknown>
    )({
      deterministicUuid: (...parts: unknown[]) => parts.join(":"),
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
    });
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
    expect(inspection.tables.metal_holding_states.expected).toBe(1);
    expect(inspection.tables.market_rate_observations.expected).toBe(1);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "metal_holding_states",
          operation: "select",
        }),
        expect.objectContaining({
          table: "market_rate_observations",
          operation: "select",
        }),
      ])
    );

    records.length = 0;
    await resetFixtureData(client, config, fixture);
    expect(records).toEqual(
      expect.arrayContaining([
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
