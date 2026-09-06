import { createHash } from "node:crypto";

const {
  buildSeedIds,
  inspectFixtureData,
  resetFixtureData,
  seedFixtureData,
} = jest.requireActual<{
  readonly buildSeedIds: (userId: string, seedScope: string) => Record<string, any>;
  readonly inspectFixtureData: (
    client: unknown,
    config: Record<string, unknown>,
    fixture: Record<string, unknown>
  ) => Promise<Record<string, any>>;
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
const {
  MANUAL_QA_SEED_FIXTURE,
  buildManualQaExtraRows,
} = jest.requireActual<{
  readonly MANUAL_QA_SEED_FIXTURE: Record<string, unknown>;
  readonly buildManualQaExtraRows: (
    context: Record<string, any>
  ) => Record<string, any>;
}>("../../scripts/seed-fixtures/manual-qa-fixture");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEED_SCOPE = "manual-qa";
const FIXED_NOW = "2026-01-15T12:00:00.000Z";

function deterministicUuid(scope: string, userId: string, key: string): string {
  const hex = createHash("sha256")
    .update(`${scope}:${userId}:${key}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function dateFromToday(offset: number): string {
  const date = new Date("2026-01-15T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildRows(): Record<string, any> {
  return buildManualQaExtraRows({
    categoryIds: {
      shopping: deterministicUuid(SEED_SCOPE, USER_ID, "category:shopping"),
      income: deterministicUuid(SEED_SCOPE, USER_ID, "category:income"),
      other: deterministicUuid(SEED_SCOPE, USER_ID, "category:other"),
    },
    currentTimestamp: "2026-01-15T12:00:01.000Z",
    dateFromToday,
    deterministicUuid,
    fixedNow: FIXED_NOW,
    seedIds: buildSeedIds(USER_ID, SEED_SCOPE),
    seedScope: SEED_SCOPE,
    userId: USER_ID,
  });
}

function asJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return JSON.parse(value) as Record<string, unknown>;
  }
  return (value ?? {}) as Record<string, unknown>;
}

function rowsFor(
  client: ReturnType<typeof createMemoryClient>,
  table: string
): readonly Record<string, any>[] {
  return Array.from(client.tables.get(table)?.values() ?? []);
}

describe("manual QA Metals lifecycle fixture", () => {
  it("preserves active holdings and adds deterministic sold/disposed History rows", () => {
    const first = buildRows();
    const second = buildRows();
    const states = first.metalHoldingStates as readonly Record<string, unknown>[];

    expect(states.filter((row) => row.status === "active")).toHaveLength(3);
    expect(states.filter((row) => row.status === "sold")).toHaveLength(1);
    expect(states.filter((row) => row.status === "disposed")).toHaveLength(1);
    expect(first.metalLifecycleEvents).toHaveLength(2);
    expect(first.financialActionGroups).toHaveLength(2);
    expect(first.metalActionEvidence).toHaveLength(2);
    expect(
      (first.metalLifecycleEvents as readonly Record<string, unknown>[]).map(
        (row) => row.id
      )
    ).toEqual(
      (second.metalLifecycleEvents as readonly Record<string, unknown>[]).map(
        (row) => row.id
      )
    );
  });

  it("keeps terminal ownership and action/event provenance internally consistent", () => {
    const rows = buildRows();
    const states = (rows.metalHoldingStates as readonly Record<string, any>[]).filter(
      (row) => row.status === "sold" || row.status === "disposed"
    );
    const events = rows.metalLifecycleEvents as readonly Record<string, any>[];
    const actions = rows.financialActionGroups as readonly Record<string, any>[];
    const evidence = rows.metalActionEvidence as readonly Record<string, any>[];

    for (const state of states) {
      expect(state.user_id).toBe(USER_ID);
      expect(state.financial_revision).toBe("1");
      const event = events.find((candidate) => candidate.id === state.effective_event_id);
      expect(event).toMatchObject({
        user_id: USER_ID,
        holding_id: state.holding_id,
        action_id: state.effective_action_id,
        is_effective: true,
        is_history_visible: true,
        deleted: false,
      });
      const action = actions.find(
        (candidate) => candidate.action_id === state.effective_action_id
      );
      expect(action).toMatchObject({
        user_id: USER_ID,
        domain: "metals",
        domain_reference_id: state.holding_id,
        account_guards_json: [],
      });
      expect(action?.payload_hash).toBe(
        createHash("sha256").update(String(action?.payload_json)).digest("hex")
      );
      expect(evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action_id: state.effective_action_id,
            holding_id: state.holding_id,
            user_id: USER_ID,
            expected_holding_revision: "0",
            canonical_holding_revision: "1",
          }),
        ])
      );
    }
  });

  it("seeds a whole-holding sale without any account-credit contract", () => {
    const rows = buildRows();
    const soldEvent = (rows.metalLifecycleEvents as readonly Record<string, any>[]).find(
      (event) => event.kind === "sell"
    );
    const soldAction = (rows.financialActionGroups as readonly Record<string, any>[]).find(
      (action) => action.kind === "sell"
    );
    expect(soldEvent).toBeDefined();
    expect(soldAction?.account_guards_json).toEqual([]);
    const payload = asJsonObject(soldEvent?.payload_json);
    expect(payload.expectedHoldingRevision).toBe("0");
    expect(payload.grossProceedsMinorUnits).toBe("3600000");
    expect(payload.feeMinorUnits).toBe("50000");
    expect(payload.netProceedsMinorUnits).toBe("3550000");
    expect(payload.rateSnapshots).toEqual([]);
    expect(Object.keys(payload)).not.toContain("includeAccountCredit");
  });

  it("uses an approved disposal category and never seeds sale proceeds or realized P/L for disposal", () => {
    const rows = buildRows();
    const disposedEvent = (rows.metalLifecycleEvents as readonly Record<string, any>[]).find(
      (event) => event.kind === "dispose"
    );
    expect(disposedEvent).toBeDefined();
    const payload = asJsonObject(disposedEvent?.payload_json);
    expect([
      "lost_or_stolen",
      "destroyed_or_damaged",
      "given_away",
      "donated",
      "other_write_off",
      "other_external_transfer",
    ]).toContain(payload.reason);
    expect(payload.notes).toEqual(expect.any(String));
    expect(Object.keys(payload)).not.toEqual(
      expect.arrayContaining([
        "grossProceedsDecimal",
        "grossProceedsMinorUnits",
        "netProceedsMinorUnits",
        "realizedPnl",
        "realizedPnlDecimal",
        "realizedSalePnl",
      ])
    );
  });

  it("seeds idempotently, exposes lifecycle rows to inspect, and removes them on reset", async () => {
    const client = createMemoryClient();
    const config = {
      mode: "local",
      userId: USER_ID,
    };
    const fixture = {
      ...MANUAL_QA_SEED_FIXTURE,
      restoreAccountBalancesAfterLedgerSeed: false,
    };

    await seedFixtureData(client, config, fixture);
    await seedFixtureData(client, config, fixture);

    expect(rowsFor(client, "financial_action_groups")).toHaveLength(2);
    expect(rowsFor(client, "metal_action_evidence")).toHaveLength(2);
    expect(rowsFor(client, "metal_lifecycle_events")).toHaveLength(2);
    expect(rowsFor(client, "metal_holding_states")).toHaveLength(5);
    expect(
      rowsFor(client, "metal_lifecycle_events").every(
        (row) => row.user_id === USER_ID
      )
    ).toBe(true);

    const inspection = await inspectFixtureData(client, config, fixture);
    expect(inspection.tables.financial_action_groups).toMatchObject({
      expected: 2,
    });
    expect(inspection.tables.metal_action_evidence).toMatchObject({ expected: 2 });
    expect(inspection.tables.metal_lifecycle_events).toMatchObject({ expected: 2 });

    await resetFixtureData(client, config, fixture);
    expect(rowsFor(client, "financial_action_groups")).toHaveLength(0);
    expect(rowsFor(client, "metal_action_evidence")).toHaveLength(0);
    expect(rowsFor(client, "metal_lifecycle_events")).toHaveLength(0);
    expect(rowsFor(client, "metal_holding_states")).toHaveLength(0);
  });
});

function createMemoryClient(): {
  readonly tables: Map<string, Map<string, Record<string, any>>>;
  readonly from: (table: string) => Record<string, any>;
} {
  const tables = new Map<string, Map<string, Record<string, any>>>();
  const tableRows = (table: string) => {
    let rows = tables.get(table);
    if (!rows) {
      rows = new Map();
      tables.set(table, rows);
    }
    return rows;
  };

  const from = (table: string): Record<string, any> => ({
    select: () => ({
      eq: (column: string, value: unknown) => ({
        maybeSingle: async () => ({
          data:
            Array.from(tableRows(table).values()).find(
              (row) => row[column] === value
            ) ?? null,
          error: null,
        }),
      }),
      in: async (column: string, values: readonly unknown[]) => ({
        data: Array.from(tableRows(table).values()).filter((row) =>
          values.includes(row[column])
        ),
        error: null,
      }),
    }),
    delete: () => ({
      eq: async (column: string, value: unknown) => {
        for (const [id, row] of tableRows(table)) {
          if (row[column] === value) tableRows(table).delete(id);
        }
        return { error: null };
      },
      in: async (column: string, values: readonly unknown[]) => {
        for (const [id, row] of tableRows(table)) {
          if (values.includes(row[column])) tableRows(table).delete(id);
        }
        return { error: null };
      },
    }),
    upsert: async (
      input: Record<string, any> | readonly Record<string, any>[]
    ) => {
      const rows = Array.isArray(input) ? input : [input];
      for (const row of rows) {
        tableRows(table).set(String(row.id), { ...row });
      }
      return { error: null };
    },
    update: (patch: Record<string, unknown>) => {
      const filters: [string, unknown][] = [];
      const chain: Record<string, any> = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return chain;
        },
        then: (
          resolve: (value: { error: null }) => unknown,
          reject: (reason?: unknown) => unknown
        ) => {
          try {
            for (const [id, row] of tableRows(table)) {
              if (filters.every(([column, value]) => row[column] === value)) {
                tableRows(table).set(id, { ...row, ...patch });
              }
            }
            return Promise.resolve(resolve({ error: null }));
          } catch (error) {
            return Promise.resolve(reject(error));
          }
        },
      };
      return chain;
    },
  });

  return { tables, from };
}
