import type { Database } from "@nozbe/watermelondb";

import { readDeleteHoldingConcurrencyToken } from "@/services/delete-metal-holding-concurrency-service";

jest.mock("@/services/user-data-access", () => {
  const { Q: WatermelonQuery } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    queryOwned: (
      collection: { readonly query: (...clauses: unknown[]) => unknown },
      userId: string,
      ...clauses: unknown[]
    ): unknown =>
      collection.query(WatermelonQuery.where("user_id", userId), ...clauses),
  };
});

function mockDatabase(
  states: ReadonlyArray<{
    readonly effectiveEventId: string | null;
    readonly financialRevision: string;
  }>
): Database {
  return {
    get: (): {
      readonly query: (
        ...clauses: unknown[]
      ) => { readonly fetch: () => Promise<unknown> };
    } => ({
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
