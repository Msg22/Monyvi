import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { buildSeedIds } = jest.requireActual<{
  readonly buildSeedIds: (userId: string, seedScope: string) => Record<string, any>;
}>("../../scripts/seed-fixtures/seed-engine");
const { buildManualQaExtraRows } = jest.requireActual<{
  readonly buildManualQaExtraRows: (context: Record<string, any>) => Record<string, any>;
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

describe("manual QA Metals lifecycle fixture", () => {
  it("preserves active holdings and adds deterministic sold/disposed History rows", () => {
    const rows = buildRows();
    const states = rows.metalHoldingStates as readonly Record<string, unknown>[];

    expect(states.filter((row) => row.status === "active")).toHaveLength(3);
    expect(states.filter((row) => row.status === "sold")).toHaveLength(1);
    expect(states.filter((row) => row.status === "disposed")).toHaveLength(1);
    expect(rows.metalLifecycleEvents).toHaveLength(2);
    expect(rows.financialActionGroups).toHaveLength(2);
    expect(rows.metalActionEvidence).toHaveLength(2);
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
      expect(actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action_id: state.effective_action_id,
            user_id: USER_ID,
            domain: "metals",
            domain_reference_id: state.holding_id,
          }),
        ])
      );
      expect(evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action_id: state.effective_action_id,
            holding_id: state.holding_id,
            user_id: USER_ID,
            canonical_holding_revision: "1",
          }),
        ])
      );
    }
  });

  it("seeds a whole-holding sale with no account credit dependency", () => {
    const rows = buildRows();
    const soldEvent = (rows.metalLifecycleEvents as readonly Record<string, any>[]).find(
      (event) => event.kind === "sell"
    );
    expect(soldEvent).toBeDefined();
    const payload = JSON.parse(String(soldEvent?.payload_json ?? "{}")) as Record<string, unknown>;
    expect(payload.includeAccountCredit).toBe(false);
    expect(payload.grossProceedsDecimal).toBeDefined();
    expect(payload.netProceedsMinorUnits).toBeDefined();
  });

  it("uses an approved disposal category and never seeds sale proceeds or realized P/L for disposal", () => {
    const rows = buildRows();
    const disposedEvent = (rows.metalLifecycleEvents as readonly Record<string, any>[]).find(
      (event) => event.kind === "dispose"
    );
    expect(disposedEvent).toBeDefined();
    const payload = JSON.parse(String(disposedEvent?.payload_json ?? "{}")) as Record<string, unknown>;
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

  it("routes lifecycle rows through deterministic seed, inspect, and reset support", () => {
    const seedEngineSource = readFileSync(
      resolve(__dirname, "../../scripts/seed-fixtures/seed-engine.js"),
      "utf8"
    );
    for (const table of [
      "financial_action_groups",
      "metal_action_evidence",
      "metal_lifecycle_events",
    ]) {
      expect(seedEngineSource).toContain(`\"${table}\"`);
    }
    expect(seedEngineSource).toContain("rows.financialActionGroups");
    expect(seedEngineSource).toContain("rows.metalActionEvidence");
    expect(seedEngineSource).toContain("rows.metalLifecycleEvents");
  });
});
