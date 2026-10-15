import type { Database } from "@nozbe/watermelondb";
import {
  pullMetalDedicatedTable,
  SYNC_PULL_ERROR_CODES,
} from "../../../services/sync/pull-strategies";

const USER = "018f0c7a-1234-7abc-8def-000000000001";
const FOREIGN = "018f0c7a-1234-7abc-8def-000000000099";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000002";
const ACTION = "018f0c7a-1234-7abc-8def-000000000042";
const LOCAL_EVENT = "018f0c7a-1234-7abc-8def-000000000017";
const LOCAL_EVIDENCE = "018f0c7a-1234-7abc-8def-000000000018";
const OCCURRED = "2026-08-23T00:00:00.000Z";

const mockPages = jest.fn<
  Promise<ReadonlyArray<Record<string, unknown>>>,
  []
>();
jest.mock("../../../services/sync/pull-pagination", () => ({
  PULL_PAGE_SIZE: 500,
  pullAllKeysetPages: (): Promise<ReadonlyArray<Record<string, unknown>>> =>
    mockPages(),
  pullCursorFilter: jest.fn(),
  readPullCursor: jest.fn(),
}));
jest.mock("../../../services/supabase", () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve(USER)),
  supabase: {},
}));
jest.mock("../../../services/sync/transforms", () => ({
  transformFromSupabase: (
    _table: string,
    record: Record<string, unknown>
  ): Record<string, unknown> => record,
}));
jest.mock("../../../services/sync/config", () => ({
  SNAPSHOT_RETENTION_DAYS: 7,
  SYNCABLE_TABLES: [],
}));

function payload(): Record<string, unknown> {
  return {
    disposalDate: "2026-08-23",
    expectedHoldingRevision: "0",
    holdingId: HOLDING,
    notes: null,
    predecessorEventId: null,
    reason: "given_away",
    reversesEventId: null,
  };
}
function envelopeJson(): string {
  return JSON.stringify({
    accountGuards: [],
    actionId: ACTION,
    domain: "metals",
    domainReferenceId: HOLDING,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "dispose",
    occurredAt: OCCURRED,
    payload: payload(),
    payloadVersion: "metals.dispose/v1",
    userId: USER,
  });
}
function localRoot(): Record<string, unknown> {
  return {
    actionId: ACTION,
    accountGuardsJson: "[]",
    deleted: false,
    domain: "metals",
    domainReferenceId: HOLDING,
    kind: "dispose",
    outcomeJson: null,
    payloadJson: envelopeJson(),
    rejectionCode: null,
    serverOutcome: null,
    state: "local_complete",
    userId: USER,
  };
}
function localEvent(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: LOCAL_EVENT,
    actionId: ACTION,
    userId: USER,
    holdingId: HOLDING,
    kind: "dispose",
    deleted: false,
    occurredAt: new Date(OCCURRED),
    payloadJson: JSON.stringify(payload()),
    predecessorEventId: null,
    reversesEventId: null,
    isEffective: true,
    isHistoryVisible: true,
    ...overrides,
  };
}
function localEvidence(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: LOCAL_EVIDENCE,
    actionId: ACTION,
    userId: USER,
    holdingId: HOLDING,
    kind: "dispose",
    deleted: false,
    expectedHoldingRevision: "0",
    canonicalHoldingRevision: "1",
    domainPayloadJson: JSON.stringify(payload()),
    ...overrides,
  };
}
function serverEvent(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: ACTION,
    action_id: ACTION,
    user_id: USER,
    holding_id: HOLDING,
    deleted: false,
    kind: "dispose",
    is_effective: true,
    is_history_visible: true,
    occurred_at: Date.parse(OCCURRED),
    predecessor_event_id: null,
    reverses_event_id: null,
    payload_json_text: JSON.stringify(payload()),
    ...overrides,
  };
}
function serverEvidence(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: ACTION,
    action_id: ACTION,
    user_id: USER,
    holding_id: HOLDING,
    deleted: false,
    kind: "dispose",
    canonical_holding_revision_text: "1",
    expected_holding_revision_text: "0",
    domain_payload_json_text: JSON.stringify(payload()),
    ...overrides,
  };
}

function fakeDatabase(
  overrides: Partial<{
    readonly events: ReadonlyArray<Record<string, unknown>>;
    readonly evidence: ReadonlyArray<Record<string, unknown>>;
    readonly roots: ReadonlyArray<Record<string, unknown>>;
  }> = {}
): Database {
  const data: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>> =
    {
      metal_lifecycle_events: overrides.events ?? [localEvent()],
      metal_action_evidence: overrides.evidence ?? [localEvidence()],
      financial_action_groups: overrides.roots ?? [localRoot()],
    };
  return {
    get: (name: string): unknown => ({
      query: (): unknown => ({
        fetch: (): Promise<ReadonlyArray<Record<string, unknown>>> =>
          Promise.resolve(data[name] ?? []),
      }),
    }),
  } as unknown as Database;
}

const START = "2026-01-01T00:00:00.000Z";
const END = "2026-12-01T00:00:00.000Z";

describe("legacy Metals dedicated pull ID reconciliation", (): void => {
  beforeEach((): void => {
    mockPages.mockReset();
  });

  it.each([
    ["metal_lifecycle_events", LOCAL_EVENT, serverEvent()],
    ["metal_action_evidence", LOCAL_EVIDENCE, serverEvidence()],
  ] as const)(
    "remaps an existing owned %s local primary key, preserving identity across repeated pulls",
    async (table, localId, remote): Promise<void> => {
      mockPages.mockResolvedValue([remote]);
      const db = fakeDatabase();
      const first = await pullMetalDedicatedTable(table, USER, START, END, db);
      const second = await pullMetalDedicatedTable(table, USER, START, END, db);
      for (const result of [first, second]) {
        expect(result.created).toEqual([]);
        expect(result.deleted).toEqual([]);
        expect(result.updated).toHaveLength(1);
        expect(result.updated[0]).toMatchObject({
          id: localId,
          action_id: ACTION,
          user_id: USER,
        });
      }
      expect(remote.id).toBe(ACTION);
    }
  );

  it("keeps canonical-only fresh-device rows at canonical action IDs", async (): Promise<void> => {
    mockPages.mockResolvedValue([serverEvent()]);
    const result = await pullMetalDedicatedTable(
      "metal_lifecycle_events",
      USER,
      START,
      END,
      fakeDatabase({ events: [], evidence: [], roots: [] })
    );
    expect(result.updated[0]?.id).toBe(ACTION);
  });

  it.each([
    "foreign-owner",
    "wrong-holding",
    "mismatched-event-payload",
    "mismatched-evidence-payload",
    "duplicate-local-event",
    "duplicate-local-evidence",
    "duplicate-incoming",
  ] as const)(
    "fails the pull on %s without pretending to synchronize",
    async (scenario): Promise<void> => {
      const eventRows =
        scenario === "duplicate-local-event"
          ? [localEvent(), localEvent({ id: ACTION })]
          : [localEvent()];
      const evidenceRows =
        scenario === "duplicate-local-evidence"
          ? [localEvidence(), localEvidence({ id: ACTION })]
          : [localEvidence()];
      const incoming =
        scenario === "foreign-owner"
          ? serverEvent({ user_id: FOREIGN })
          : scenario === "wrong-holding"
            ? serverEvent({ holding_id: FOREIGN })
            : scenario === "mismatched-event-payload"
              ? serverEvent({
                  payload_json_text: JSON.stringify({
                    ...payload(),
                    reason: "donated",
                  }),
                })
              : serverEvent();
      mockPages.mockResolvedValue(
        scenario === "duplicate-incoming" ? [incoming, incoming] : [incoming]
      );
      const db = fakeDatabase({
        events: eventRows,
        evidence:
          scenario === "mismatched-evidence-payload"
            ? [localEvidence({ domainPayloadJson: "{}" })]
            : evidenceRows,
      });
      await expect(
        pullMetalDedicatedTable("metal_lifecycle_events", USER, START, END, db)
      ).rejects.toThrow(SYNC_PULL_ERROR_CODES.INVALID_PULL_ROW);
    }
  );
});
