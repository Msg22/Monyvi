import { Q, type Database } from "@nozbe/watermelondb";

import { readDeleteHoldingConcurrencyToken } from "@/services/delete-metal-holding-concurrency-service";

interface CapturedQuery {
  readonly table: string;
  readonly userId: string;
  readonly clauses: readonly unknown[];
}

let lastQuery: CapturedQuery | null = null;

jest.mock("@/services/user-data-access", () => ({
  queryOwned: (
    collection: {
      readonly table: string;
      readonly query: (...clauses: unknown[]) => unknown;
    },
    userId: string,
    ...clauses: unknown[]
  ): unknown => {
    lastQuery = { table: collection.table, userId, clauses };
    return collection.query(...clauses);
  },
}));

function mockDatabase(
  states: ReadonlyArray<{
    readonly effectiveEventId: string | null;
    readonly financialRevision: string;
  }>
): Database {
  return {
    get: (table: string): {
      readonly table: string;
      readonly query: (
        ...clauses: unknown[]
      ) => { readonly fetch: () => Promise<unknown> };
    } => ({
      table,
      query: (...clauses: unknown[]) => ({
        fetch: (): Promise<unknown> => {
          expect(clauses.length).toBeGreaterThan(0);
          return Promise.resolve(states);
        },
      }),
    }),
  } as unknown as Database;
}

describe("readDeleteHoldingConcurrencyToken", () => {
  beforeEach((): void => {
    lastQuery = null;
  });

  it("scopes the state read to the holding, the owner, and live rows", async () => {
    const database = mockDatabase([
      { effectiveEventId: "event-correction", financialRevision: "1" },
    ]);

    await readDeleteHoldingConcurrencyToken(database, "user-1", "holding-1");

    expect(lastQuery?.table).toBe("metal_holding_states");
    expect(lastQuery?.userId).toBe("user-1");
    expect(lastQuery?.clauses).toEqual([
      Q.where("holding_id", "holding-1"),
      Q.where("deleted", false),
      Q.take(1),
    ]);
  });
  it("returns the live revision with its effective predecessor event", async () => {
    const database = mockDatabase([
      { effectiveEventId: "event-correction", financialRevision: "1" },
    ]);

    await expect(
      readDeleteHoldingConcurrencyToken(database, "user-1", "holding-1")
    ).resolves.toEqual({
      expectedFinancialRevision: "1",
      predecessorEventId: "event-correction",
    });
  });

  it("supports a predecessor-less revision-zero migrated holding", async () => {
    const database = mockDatabase([
      { effectiveEventId: null, financialRevision: "0" },
    ]);

    await expect(
      readDeleteHoldingConcurrencyToken(database, "user-1", "holding-1")
    ).resolves.toEqual({
      expectedFinancialRevision: "0",
      predecessorEventId: null,
    });
  });

  it("rejects before any write when the holding state is missing", async () => {
    const database = mockDatabase([]);

    await expect(
      readDeleteHoldingConcurrencyToken(database, "user-1", "holding-1")
    ).rejects.toThrow("metal_holding_not_found");
  });
});
