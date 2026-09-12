import { createHash } from "node:crypto";
import { reduceMetalLifecycle, type LifecycleKind } from "@monyvi/logic";

const { buildSeedIds, inspectFixtureData, resetFixtureData, seedFixtureData } =
  jest.requireActual<{
    readonly buildSeedIds: (
      userId: string,
      seedScope: string
    ) => Record<string, any>;
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
const { MANUAL_QA_SEED_FIXTURE, buildManualQaExtraRows } = jest.requireActual<{
  readonly MANUAL_QA_SEED_FIXTURE: Record<string, unknown>;
  readonly buildManualQaExtraRows: (
    context: Record<string, any>
  ) => Record<string, any>;
}>("../../scripts/seed-fixtures/manual-qa-fixture");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SEED_SCOPE = "manual-qa";
const FIXED_NOW = "2026-01-15T12:00:00.000Z";
const IMMUTABLE_LIFECYCLE_FIELDS = [
  "id",
  "user_id",
  "holding_id",
  "action_id",
  "kind",
  "occurred_at",
  "payload_json",
  "predecessor_event_id",
  "reverses_event_id",
  "created_at",
] as const;

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

interface ManualQaAssetRow {
  readonly acquisition_action_id: string;
  readonly id: string;
  readonly type: string;
}

interface ManualQaMetalRow {
  readonly item_form: string;
}

interface ManualQaLifecycleEventRow {
  readonly action_id: string;
  readonly holding_id: string;
  readonly id: string;
  readonly kind: "add" | "dispose" | "sell";
  readonly occurred_at: string;
  readonly payload_json: unknown;
  readonly predecessor_event_id: string | null;
  readonly reverses_event_id: string | null;
}

interface ManualQaLifecycleRows {
  readonly assetMetals: readonly ManualQaMetalRow[];
  readonly assets: readonly ManualQaAssetRow[];
  readonly metalActionEvidence: readonly Readonly<Record<string, unknown>>[];
  readonly metalLifecycleEvents: readonly ManualQaLifecycleEventRow[];
}

const REDUCER_KIND_BY_FIXTURE_KIND: Readonly<
  Record<ManualQaLifecycleEventRow["kind"], LifecycleKind>
> = Object.freeze({
  add: "created",
  dispose: "disposed",
  sell: "sold",
});

function isRecursivelyKeySorted(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(isRecursivelyKeySorted);
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const sorted = [...keys].sort((a, b) =>
      Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
    );
    return (
      keys.every((key, index) => key === sorted[index]) &&
      Object.values(value).every(isRecursivelyKeySorted)
    );
  }
  return true;
}

describe("manual QA Metals lifecycle fixture", () => {
  it("serializes every action envelope in DB-canonical key order", () => {
    const groups = buildRows().financialActionGroups as readonly Record<
      string,
      any
    >[];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(isRecursivelyKeySorted(JSON.parse(group.payload_json))).toBe(
        true
      );
      expect(group.payload_hash).toBe(
        createHash("sha256").update(String(group.payload_json)).digest("hex")
      );
    }
  });

  it("preserves active holdings and adds deterministic sold/disposed History rows", () => {
    const first = buildRows();
    const second = buildRows();
    const states = first.metalHoldingStates as readonly Record<
      string,
      unknown
    >[];

    expect(states.filter((row) => row.status === "active")).toHaveLength(3);
    expect(states.filter((row) => row.status === "sold")).toHaveLength(1);
    expect(states.filter((row) => row.status === "disposed")).toHaveLength(1);
    expect(first.metalLifecycleEvents).toHaveLength(7);
    expect(first.financialActionGroups).toHaveLength(7);
    expect(first.metalActionEvidence).toHaveLength(7);
    expect(first.marketRateObservations).toHaveLength(4);
    expect(
      (first.metalLifecycleEvents as readonly Record<string, unknown>[]).map(
        (row) => row.id
      )
    ).toEqual(
      (second.metalLifecycleEvents as readonly Record<string, unknown>[]).map(
        (row) => row.id
      )
    );
    expect(first.marketRateObservations).toEqual(second.marketRateObservations);
  });

  it("seeds canonical physical forms and a complete acquisition chain for every holding", () => {
    const rows = buildRows() as unknown as ManualQaLifecycleRows;
    const assets = rows.assets;
    const metals = rows.assetMetals;
    const events = rows.metalLifecycleEvents;
    const evidence = rows.metalActionEvidence;

    expect(metals.map((metal) => metal.item_form)).toEqual([
      "jewelry",
      "coin",
      "bar",
      "coin",
      "bar",
    ]);

    for (const asset of assets.filter(
      (candidate) => candidate.type === "METAL"
    )) {
      expect(asset.acquisition_action_id).toEqual(expect.any(String));
      const acquisitionEvent = events.find(
        (event) => event.id === asset.acquisition_action_id
      );
      expect(acquisitionEvent).toMatchObject({
        action_id: asset.acquisition_action_id,
        holding_id: asset.id,
        kind: "add",
        predecessor_event_id: null,
        reverses_event_id: null,
      });
      const acquisitionPayload = asJsonObject(acquisitionEvent?.payload_json);
      expect(acquisitionPayload).toMatchObject({
        expectedHoldingRevision: null,
        holdingId: asset.id,
        predecessorEventId: null,
        reversesEventId: null,
      });
      expect(acquisitionPayload.rateSnapshots).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "acquisition_metal" }),
          expect.objectContaining({ role: "acquisition_purchase_currency" }),
        ])
      );
      expect(evidence).toContainEqual(
        expect.objectContaining({
          action_id: asset.acquisition_action_id,
          canonical_holding_revision: "1",
          expected_holding_revision: null,
          holding_id: asset.id,
        })
      );
    }

    for (const terminalEvent of events.filter(
      (event) => event.kind === "sell" || event.kind === "dispose"
    )) {
      expect(terminalEvent.predecessor_event_id).toEqual(expect.any(String));
      expect(events).toContainEqual(
        expect.objectContaining({
          holding_id: terminalEvent.holding_id,
          id: terminalEvent.predecessor_event_id,
          kind: "add",
        })
      );
      const reduced = reduceMetalLifecycle(
        events
          .filter((event) => event.holding_id === terminalEvent.holding_id)
          .map((event) => ({
            canonicalCasStatus: "accepted" as const,
            evidenceState: "effective" as const,
            fingerprint: `${event.action_id}:${event.kind}`,
            id: event.id,
            kind: REDUCER_KIND_BY_FIXTURE_KIND[event.kind],
            occurredAt: Date.parse(event.occurred_at),
            predecessorEventId: event.predecessor_event_id,
            reversesEventId: event.reverses_event_id,
          }))
      );
      expect(reduced.rejectedEvents).toEqual([]);
      expect(reduced.acceptedEvents).toHaveLength(2);
      expect(reduced.projection).toMatchObject({
        effectiveEventId: terminalEvent.id,
        status: terminalEvent.kind === "sell" ? "sold" : "disposed",
      });
    }
  });

  it("supplies deterministic observation-backed rates for every seeded Metals currency", () => {
    const observations = buildRows().marketRateObservations as readonly Record<
      string,
      unknown
    >[];

    expect(observations.map((row) => row.instrument_code).sort()).toEqual([
      "currency:EGP",
      "currency:USD",
      "metal:GOLD",
      "metal:SILVER",
    ]);
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instrument_code: "currency:EGP",
          orientation: "quote_per_base",
          quality: "valid",
          unit: "usd_per_currency_unit",
          value_decimal: "0.02",
        }),
        expect.objectContaining({
          instrument_code: "currency:USD",
          value_decimal: "1",
        }),
        expect.objectContaining({
          instrument_code: "metal:GOLD",
          unit: "usd_per_pure_gram",
          value_decimal: "75",
        }),
        expect.objectContaining({
          instrument_code: "metal:SILVER",
          unit: "usd_per_pure_gram",
          value_decimal: "0.95",
        }),
      ])
    );
    expect(
      observations.every(
        (row) =>
          row.provider_observed_at === "2026-01-15T12:00:01.000Z" &&
          row.source === "manual_qa_fixture:manual-qa"
      )
    ).toBe(true);
  });

  it("keeps terminal ownership and action/event provenance internally consistent", () => {
    const rows = buildRows();
    const states = (
      rows.metalHoldingStates as readonly Record<string, any>[]
    ).filter((row) => row.status === "sold" || row.status === "disposed");
    const events = rows.metalLifecycleEvents as readonly Record<string, any>[];
    const actions = rows.financialActionGroups as readonly Record<
      string,
      any
    >[];
    const evidence = rows.metalActionEvidence as readonly Record<string, any>[];

    for (const state of states) {
      expect(state.user_id).toBe(USER_ID);
      expect(state.financial_revision).toBe("2");
      const event = events.find(
        (candidate) => candidate.id === state.effective_event_id
      );
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
            expected_holding_revision: "1",
            canonical_holding_revision: "2",
          }),
        ])
      );
    }
  });

  it("seeds a whole-holding sale without any account-credit contract", () => {
    const rows = buildRows();
    const soldEvent = (
      rows.metalLifecycleEvents as readonly Record<string, any>[]
    ).find((event) => event.kind === "sell");
    const soldAction = (
      rows.financialActionGroups as readonly Record<string, any>[]
    ).find((action) => action.kind === "sell");
    expect(soldEvent).toBeDefined();
    expect(soldAction?.account_guards_json).toEqual([]);
    const payload = asJsonObject(soldEvent?.payload_json);
    expect(payload.expectedHoldingRevision).toBe("1");
    expect(payload.predecessorEventId).toEqual(expect.any(String));
    expect(payload.grossProceedsMinorUnits).toBe("3600000");
    expect(payload.feeMinorUnits).toBe("50000");
    expect(payload.netProceedsMinorUnits).toBe("3550000");
    expect(payload.rateSnapshots).toEqual([]);
    expect(Object.keys(payload)).not.toContain("includeAccountCredit");
  });

  it("uses an approved disposal category and never seeds sale proceeds or realized P/L for disposal", () => {
    const rows = buildRows();
    const disposedEvent = (
      rows.metalLifecycleEvents as readonly Record<string, any>[]
    ).find((event) => event.kind === "dispose");
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

    expect(rowsFor(client, "financial_action_groups")).toHaveLength(7);
    expect(rowsFor(client, "metal_action_evidence")).toHaveLength(7);
    expect(rowsFor(client, "metal_lifecycle_events")).toHaveLength(7);
    expect(rowsFor(client, "metal_holding_states")).toHaveLength(5);
    expect(rowsFor(client, "market_rate_observations")).toHaveLength(4);
    expect(
      rowsFor(client, "assets").filter((row) => row.type === "METAL")
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ acquisition_action_id: expect.any(String) }),
      ])
    );
    expect(
      rowsFor(client, "assets").every(
        (row) =>
          row.type !== "METAL" ||
          typeof row.acquisition_action_id === "string"
      )
    ).toBe(true);
    expect(
      rowsFor(client, "metal_lifecycle_events").every(
        (row) => row.user_id === USER_ID
      )
    ).toBe(true);

    const inspection = await inspectFixtureData(client, config, fixture);
    expect(inspection.tables.financial_action_groups).toMatchObject({
      expected: 7,
    });
    expect(inspection.tables.metal_action_evidence).toMatchObject({
      expected: 7,
    });
    expect(inspection.tables.metal_lifecycle_events).toMatchObject({
      expected: 7,
    });

    client.tables.get("assets")?.set("unrelated-asset", {
      id: "unrelated-asset",
      user_id: "unrelated-user",
      deleted: false,
    });
    client.tables.get("financial_action_groups")?.set("unrelated-action-root", {
      id: "unrelated-action-root",
      user_id: "unrelated-user",
      deleted: false,
    });

    await resetFixtureData(client, config, fixture);
    expect(
      rowsFor(client, "financial_action_groups").filter(
        (row) => row.user_id === USER_ID && !row.deleted
      )
    ).toHaveLength(7);
    expect(
      rowsFor(client, "metal_action_evidence").filter((row) => !row.deleted)
    ).toHaveLength(0);
    expect(rowsFor(client, "metal_lifecycle_events")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deleted: true,
          is_effective: false,
          is_history_visible: false,
        }),
      ])
    );
    expect(
      rowsFor(client, "metal_holding_states").filter((row) => !row.deleted)
    ).toHaveLength(0);
    expect(rowsFor(client, "assets")).toContainEqual(
      expect.objectContaining({ id: "unrelated-asset", deleted: false })
    );
    expect(rowsFor(client, "financial_action_groups")).toContainEqual(
      expect.objectContaining({ id: "unrelated-action-root", deleted: false })
    );

    await seedFixtureData(client, config, fixture);
    expect(
      rowsFor(client, "metal_lifecycle_events").filter(
        (row) => row.is_effective && row.is_history_visible && !row.deleted
      )
    ).toHaveLength(7);
    expect(
      rowsFor(client, "metal_holding_states").filter((row) => !row.deleted)
    ).toHaveLength(5);
  });

  it("keeps immutable lifecycle facts stable when reseeded on another day", async () => {
    jest.useFakeTimers();
    try {
      const client = createMemoryClient();
      const config = { mode: "local", userId: USER_ID };
      const fixture = {
        ...MANUAL_QA_SEED_FIXTURE,
        restoreAccountBalancesAfterLedgerSeed: false,
      };
      jest.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
      await seedFixtureData(client, config, fixture);
      const firstEvents = rowsFor(client, "metal_lifecycle_events").map(
        immutableLifecycleFacts
      );

      jest.setSystemTime(new Date("2026-01-16T12:00:00.000Z"));
      await expect(seedFixtureData(client, config, fixture)).resolves.toEqual({
        userId: USER_ID,
      });
      expect(
        rowsFor(client, "metal_lifecycle_events").map(immutableLifecycleFacts)
      ).toEqual(firstEvents);
    } finally {
      jest.useRealTimers();
    }
  });
});

function immutableLifecycleFacts(
  row: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    IMMUTABLE_LIFECYCLE_FIELDS.map((field) => [field, row[field]])
  );
}

function metalAcquisitionKindMismatch(
  tableRows: (table: string) => Map<string, Record<string, any>>,
  candidate: Readonly<Record<string, any>>
): Readonly<{ message: string }> | null {
  if (candidate.acquisition_action_id == null) {
    return null;
  }
  const hasEvidence = Array.from(
    tableRows("metal_action_evidence").values()
  ).some(
    (evidence) =>
      evidence.user_id === candidate.user_id &&
      evidence.action_id === candidate.acquisition_action_id &&
      evidence.holding_id === candidate.id &&
      (evidence.kind === "add" || evidence.kind === "correct")
  );
  return hasEvidence
    ? null
    : { message: "metal_acquisition_action_kind_mismatch" };
}

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
        if (
          table === "metal_lifecycle_events" &&
          Array.from(tableRows(table).values()).some(
            (row) => row[column] === value
          )
        ) {
          return { error: { message: "metal_lifecycle_event_immutable" } };
        }
        for (const [id, row] of tableRows(table)) {
          if (row[column] === value) tableRows(table).delete(id);
        }
        return { error: null };
      },
      in: async (column: string, values: readonly unknown[]) => {
        if (
          table === "metal_lifecycle_events" &&
          Array.from(tableRows(table).values()).some((row) =>
            values.includes(row[column])
          )
        ) {
          return { error: { message: "metal_lifecycle_event_immutable" } };
        }
        for (const [id, row] of tableRows(table)) {
          if (values.includes(row[column])) tableRows(table).delete(id);
        }
        return { error: null };
      },
    }),
    upsert: async (
      input: Record<string, any> | readonly Record<string, any>[],
      options: Readonly<{ ignoreDuplicates?: boolean }> = {}
    ) => {
      const rows = Array.isArray(input) ? input : [input];
      for (const row of rows) {
        const existing = tableRows(table).get(String(row.id));
        if (existing && options.ignoreDuplicates) continue;
        if (table === "assets") {
          const mismatch = metalAcquisitionKindMismatch(tableRows, row);
          if (mismatch) {
            return { error: mismatch };
          }
        }
        const existingLifecycle = existing as
          | Readonly<Record<string, unknown>>
          | undefined;
        const nextLifecycle = row as Readonly<Record<string, unknown>>;
        if (
          table === "metal_lifecycle_events" &&
          existingLifecycle &&
          IMMUTABLE_LIFECYCLE_FIELDS.some(
            (field) =>
              JSON.stringify(existingLifecycle[field]) !==
              JSON.stringify(nextLifecycle[field])
          )
        ) {
          return { error: { message: "metal_lifecycle_event_immutable" } };
        }
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
          resolve: (value: {
            error: Readonly<{ message: string }> | null;
          }) => unknown,
          reject: (reason?: unknown) => unknown
        ) => {
          try {
            for (const [id, row] of tableRows(table)) {
              if (filters.every(([column, value]) => row[column] === value)) {
                if (
                  table === "assets" &&
                  "acquisition_action_id" in patch
                ) {
                  const mismatch = metalAcquisitionKindMismatch(tableRows, {
                    ...row,
                    ...patch,
                  });
                  if (mismatch) {
                    return Promise.resolve(resolve({ error: mismatch }));
                  }
                }
                if (
                  table === "financial_action_groups" &&
                  patch.deleted === true
                ) {
                  return Promise.resolve(
                    resolve({
                      error: {
                        message: "financial_action_root_delete_forbidden",
                      },
                    })
                  );
                }
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
