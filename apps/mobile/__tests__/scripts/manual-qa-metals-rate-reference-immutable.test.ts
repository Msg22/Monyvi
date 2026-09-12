const { MANUAL_QA_SEED_FIXTURE } = jest.requireActual<{
  readonly MANUAL_QA_SEED_FIXTURE: {
    readonly seedScope: string;
    readonly [key: string]: unknown;
  };
}>("../../scripts/seed-fixtures/manual-qa-fixture");
const { seedManualQaMetalRateReferences } = jest.requireActual<{
  readonly seedManualQaMetalRateReferences: (
    client: unknown,
    userId: string,
    seedScope: string
  ) => Promise<readonly Record<string, unknown>[]>;
}>("../../scripts/seed-fixtures/manual-qa-metal-rate-reference-seed");
const { resetFixtureData, seedFixtureData } = jest.requireActual<{
  readonly resetFixtureData: (
    client: unknown,
    config: Record<string, unknown>,
    fixture: Record<string, unknown>
  ) => Promise<unknown>;
  readonly seedFixtureData: (
    client: unknown,
    config: Record<string, unknown>,
    fixture: Record<string, unknown>
  ) => Promise<unknown>;
}>("../../scripts/seed-fixtures/seed-engine");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const FIXTURE = {
  ...MANUAL_QA_SEED_FIXTURE,
  restoreAccountBalancesAfterLedgerSeed: false,
};

interface MemoryClient {
  readonly tables: Map<string, Map<string, Record<string, unknown>>>;
  readonly deleteAttempts: string[];
  readonly from: (table: string) => unknown;
}

function rowsFor(
  client: MemoryClient,
  table: string
): readonly Record<string, unknown>[] {
  return Array.from(client.tables.get(table)?.values() ?? []);
}

// Mirrors the production DB contract: `metal_rate_references` is protected by
// the `metal_rate_references_guard_immutable` trigger, and lifecycle/evidence
// rows are immutable too. A reset that hard-deletes references must fail against
// a faithful client the same way it fails on Supabase.
function createMemoryClient(): MemoryClient {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const deleteAttempts: string[] = [];
  const tableRows = (table: string): Map<string, Record<string, unknown>> => {
    let rows = tables.get(table);
    if (!rows) {
      rows = new Map();
      tables.set(table, rows);
    }
    return rows;
  };

  const immutableTables = new Set([
    "metal_rate_references",
    "metal_lifecycle_events",
    "metal_action_evidence",
    "financial_action_groups",
  ]);

  const deleteMatching = (
    table: string,
    predicate: (row: Record<string, unknown>) => boolean
  ): { error: { message: string } | null } => {
    const rows = tableRows(table);
    const matching = Array.from(rows.values()).filter(predicate);
    if (matching.length > 0 && immutableTables.has(table)) {
      return { error: { message: `${table}_immutable` } };
    }
    for (const [id, row] of rows) {
      if (predicate(row)) rows.delete(id);
    }
    return { error: null };
  };

  const client: MemoryClient = {
    tables,
    deleteAttempts,
    from: (table: string): unknown => ({
      select: () => ({
        eq: (column: string, value: unknown) => ({
          maybeSingle: () =>
            Promise.resolve({
              data:
                Array.from(tableRows(table).values()).find(
                  (row) => row[column] === value
                ) ?? null,
              error: null,
            }),
        }),
        in: (column: string, values: readonly unknown[]) =>
          Promise.resolve({
            data: Array.from(tableRows(table).values()).filter((row) =>
              values.includes(row[column])
            ),
            error: null,
          }),
      }),
      delete: () => ({
        eq: (column: string, value: unknown) => {
          deleteAttempts.push(`${table}:${column}=${String(value)}`);
          return Promise.resolve(
            deleteMatching(table, (row) => row[column] === value)
          );
        },
        in: (column: string, values: readonly unknown[]) => {
          deleteAttempts.push(`${table}:in`);
          return Promise.resolve(
            deleteMatching(table, (row) => values.includes(row[column]))
          );
        },
      }),
      upsert: (
        input: Record<string, unknown> | Record<string, unknown>[],
        options: Readonly<{ ignoreDuplicates?: boolean }> = {}
      ) => {
        const rows: readonly Record<string, unknown>[] = Array.isArray(input)
          ? input
          : [input];
        const target = tableRows(table);
        for (const row of rows) {
          const id = String(row["id"]);
          if (target.has(id) && options.ignoreDuplicates) continue;
          target.set(id, { ...row });
        }
        return Promise.resolve({ error: null });
      },
      update: (patch: Record<string, unknown>) => {
        const filters: [string, unknown][] = [];
        const apply = (): { error: null } => {
          for (const [id, row] of tableRows(table)) {
            if (filters.every(([column, value]) => row[column] === value)) {
              tableRows(table).set(id, { ...row, ...patch });
            }
          }
          return { error: null };
        };
        const chain: Record<string, unknown> = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return chain;
          },
          then: (
            resolve: (value: { error: null }) => unknown
          ): Promise<unknown> => Promise.resolve(resolve(apply())),
        };
        return chain;
      },
    }),
  };
  return client;
}

describe("manual QA immutable rate-reference seed/reset", () => {
  it("never hard-deletes immutable metal_rate_references during reset", async () => {
    const client = createMemoryClient();
    const config = { mode: "local", userId: USER_ID };

    await seedFixtureData(client, config, FIXTURE);
    await seedManualQaMetalRateReferences(client, USER_ID, FIXTURE.seedScope);
    const referenceCount = rowsFor(client, "metal_rate_references").length;
    expect(referenceCount).toBeGreaterThan(0);

    client.deleteAttempts.length = 0;
    await expect(resetFixtureData(client, config, FIXTURE)).resolves.toEqual({
      userId: USER_ID,
    });

    expect(
      client.deleteAttempts.some((attempt) =>
        attempt.startsWith("metal_rate_references:")
      )
    ).toBe(false);
    // The immutable evidence is retained, not tombstoned or duplicated.
    expect(rowsFor(client, "metal_rate_references")).toHaveLength(
      referenceCount
    );
  });

  it("reproduces the same deterministic fixture across repeated seed/reset cycles", async () => {
    const client = createMemoryClient();
    const config = { mode: "local", userId: USER_ID };

    await seedFixtureData(client, config, FIXTURE);
    await seedManualQaMetalRateReferences(client, USER_ID, FIXTURE.seedScope);
    const firstIds = rowsFor(client, "metal_rate_references")
      .map((row) => String(row["id"]))
      .sort();

    await resetFixtureData(client, config, FIXTURE);
    await seedFixtureData(client, config, FIXTURE);
    await seedManualQaMetalRateReferences(client, USER_ID, FIXTURE.seedScope);

    const secondIds = rowsFor(client, "metal_rate_references")
      .map((row) => String(row["id"]))
      .sort();
    expect(secondIds).toEqual(firstIds);
    expect(new Set(secondIds).size).toBe(secondIds.length);

    // Reset tombstones lifecycle rows only after the immutable cleanup is
    // proven safe, so a second seed still revives a complete lifecycle chain.
    await resetFixtureData(client, config, FIXTURE);
    await expect(seedFixtureData(client, config, FIXTURE)).resolves.toEqual({
      userId: USER_ID,
    });
    expect(
      rowsFor(client, "metal_lifecycle_events").filter(
        (row) => row["is_effective"] && !row["deleted"]
      ).length
    ).toBeGreaterThan(0);
  });
});
