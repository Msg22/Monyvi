import type { Database } from "@nozbe/watermelondb";
import {
  pullMetalDedicatedTable,
  SYNC_PULL_ERROR_CODES,
} from "../../../services/sync/pull-strategies";
import { FINANCIAL_PULL_SHAPING_ERROR_CODE } from "../../../services/sync/financial-pull-shaping";

const USER = "018f0c7a-1234-7abc-8def-000000000001";
const OTHER = "018f0c7a-1234-7abc-8def-000000000099";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000002";
const ACTION = "018f0c7a-1234-7abc-8def-000000000042";
const LOCAL_ROOT = "018f0c7a-1234-7abc-8def-000000000016";
const LOCAL_EVENT = "018f0c7a-1234-7abc-8def-000000000017";
const LOCAL_EVIDENCE = "018f0c7a-1234-7abc-8def-000000000018";
const EFFECT_ID = "018f0c7a-1234-7abc-8def-000000000019";
const ACCOUNT = "018f0c7a-1234-7abc-8def-000000000020";
const OCCURRED = "2026-08-23T00:00:00.000Z";
const HASH = "a".repeat(64);
const START = "2026-01-01T00:00:00.000Z";
const END = "2026-12-01T00:00:00.000Z";

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
  SNAPSHOT_RETENTION_DAYS: 90,
  SYNCABLE_TABLES: [],
}));

function disposePayload(): Record<string, unknown> {
  return {
    holdingId: HOLDING,
    expectedHoldingRevision: "0",
    predecessorEventId: null,
    reversesEventId: null,
    disposalDate: "2026-08-23",
    reason: "given_away",
    notes: null,
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
    payload: disposePayload(),
    payloadVersion: "metals.dispose/v1",
    userId: USER,
  });
}

function localRoot(state: string = "local_complete"): Record<string, unknown> {
  return {
    id: LOCAL_ROOT,
    actionId: ACTION,
    userId: USER,
    accountGuardsJson: "[]",
    deleted: false,
    domain: "metals",
    domainReferenceId: HOLDING,
    kind: "dispose",
    outcomeJson: null,
    payloadHash: HASH,
    payloadJson: envelopeJson(),
    rejectionCode: null,
    serverOutcome: null,
    state,
  };
}

function localEvent(): Record<string, unknown> {
  return {
    id: LOCAL_EVENT,
    actionId: ACTION,
    userId: USER,
    holdingId: HOLDING,
    deleted: false,
    kind: "dispose",
    isEffective: true,
    isHistoryVisible: true,
    occurredAt: new Date(OCCURRED),
    payloadJson: JSON.stringify(disposePayload()),
    predecessorEventId: null,
    reversesEventId: null,
  };
}

function localEvidence(): Record<string, unknown> {
  return {
    id: LOCAL_EVIDENCE,
    actionId: ACTION,
    userId: USER,
    holdingId: HOLDING,
    deleted: false,
    kind: "dispose",
    expectedHoldingRevision: "0",
    canonicalHoldingRevision: "1",
    domainPayloadJson: JSON.stringify(disposePayload()),
  };
}

function remoteRoot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ACTION,
    action_id: ACTION,
    user_id: USER,
    deleted: false,
    domain: "metals",
    domain_reference_id: HOLDING,
    kind: "dispose",
    state: "accepted",
    payload_hash: HASH,
    account_guards_json_text: "[]",
    outcome_json_text: null,
    payload_json_text: envelopeJson(),
    ...overrides,
  };
}

function remoteEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ACTION,
    action_id: ACTION,
    user_id: USER,
    holding_id: HOLDING,
    deleted: false,
    kind: "dispose",
    occurred_at: Date.parse(OCCURRED),
    is_effective: true,
    is_history_visible: true,
    predecessor_event_id: null,
    reverses_event_id: null,
    payload_json_text: JSON.stringify(disposePayload()),
    ...overrides,
  };
}

function remoteEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ACTION,
    action_id: ACTION,
    user_id: USER,
    holding_id: HOLDING,
    deleted: false,
    kind: "dispose",
    canonical_holding_revision_text: "1",
    expected_holding_revision_text: "0",
    domain_payload_json_text: JSON.stringify(disposePayload()),
    ...overrides,
  };
}

function remoteEffect(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: EFFECT_ID,
    user_id: USER,
    action_id: ACTION,
    account_id: ACCOUNT,
    domain: "metals",
    kind: "credit",
    currency: "EGP",
    deleted: false,
    amount_minor_units_text: "9007199254740993",
    accepted_account_revision_text: "9223372036854775807",
    reverses_effect_id: null,
    is_effective: true,
    compensated_at: "2026-08-24T10:30:45.123Z",
    ...overrides,
  };
}

function localEffect(): Record<string, unknown> {
  return {
    id: EFFECT_ID,
    userId: USER,
    actionId: ACTION,
    accountId: ACCOUNT,
    domain: "metals",
    kind: "credit",
    currency: "EGP",
    amountMinorUnits: "9007199254740993",
    acceptedAccountRevision: "9223372036854775807",
    reversesEffectId: null,
    isEffective: false,
    compensatedAt: null,
  };
}

function fakeDb(options: {
  readonly roots?: ReadonlyArray<Record<string, unknown>>;
  readonly events?: ReadonlyArray<Record<string, unknown>>;
  readonly evidence?: ReadonlyArray<Record<string, unknown>>;
  readonly effects?: ReadonlyArray<Record<string, unknown>>;
} = {}): Database {
  const rows: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>> = {
    financial_action_groups: options.roots ?? [localRoot()],
    metal_lifecycle_events: options.events ?? [localEvent()],
    metal_action_evidence: options.evidence ?? [localEvidence()],
    account_financial_effects: options.effects ?? [],
  };
  return {
    get: (table: string): unknown => ({
      query: (): unknown => ({
        fetch: (): Promise<ReadonlyArray<Record<string, unknown>>> =>
          Promise.resolve(rows[table] ?? []),
        fetchCount: (): Promise<number> => Promise.resolve(
          rows[table]?.length ?? 0
        ),
      }),
    }),
  } as unknown as Database;
}

async function pull(
  table:
    | "financial_action_groups"
    | "metal_lifecycle_events"
    | "metal_action_evidence"
    | "account_financial_effects"
    | "metal_holding_states",
  records: ReadonlyArray<Record<string, unknown>>,
  db: Database = fakeDb()
): ReturnType<typeof pullMetalDedicatedTable> {
  mockPages.mockResolvedValue(records);
  return pullMetalDedicatedTable(table, USER, START, END, db);
}

describe("PR385 recovery composed with current-main canonical Metal identity", (): void => {
  beforeEach((): void => {
    mockPages.mockReset();
  });

  it("withholds an equivalent unresolved local root before any canonical ID update", async (): Promise<void> => {
    const result = await pull(
      "financial_action_groups",
      [remoteRoot()],
      fakeDb()
    );
    expect(result).toEqual({ created: [], updated: [], deleted: [] });
  });

  it("remaps settled remote action root D to its old local primary key without changing exact JSON", async (): Promise<void> => {
    const result = await pull(
      "financial_action_groups",
      [remoteRoot()],
      fakeDb({ roots: [localRoot("accepted")] })
    );
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]).toMatchObject({
      id: LOCAL_ROOT,
      action_id: ACTION,
      payload_json: envelopeJson(),
      account_guards_json: "[]",
    });
  });

  it.each([
    ["metal_lifecycle_events", LOCAL_EVENT, remoteEvent(), "payload_json"],
    ["metal_action_evidence", LOCAL_EVIDENCE, remoteEvidence(), "domain_payload_json"],
  ] as const)(
    "preserves a proven original %s physical ID and immutable JSON during full recovery",
    async (table, expectedLocalId, remote, payloadField): Promise<void> => {
      const first = await pull(table, [remote]);
      const repeat = await pull(table, [remote]);
      for (const result of [first, repeat]) {
        expect(result.created).toEqual([]);
        expect(result.deleted).toEqual([]);
        expect(result.updated).toHaveLength(1);
        expect(result.updated[0]).toMatchObject({
          id: expectedLocalId,
          action_id: ACTION,
          user_id: USER,
          [payloadField]: JSON.stringify(disposePayload()),
        });
      }
    }
  );

  it("hydrates a missing canonical financial effect once with exact strings and a numeric local compensation time", async (): Promise<void> => {
    const result = await pull("account_financial_effects", [remoteEffect()]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0]).toMatchObject({
      id: EFFECT_ID,
      action_id: ACTION,
      amount_minor_units: "9007199254740993",
      accepted_account_revision: "9223372036854775807",
      compensated_at: Date.parse("2026-08-24T10:30:45.123Z"),
    });
  });

  it("keeps a matching unresolved optimistic effect untouched instead of replaying remote effectiveness", async (): Promise<void> => {
    const result = await pull(
      "account_financial_effects",
      [remoteEffect()],
      fakeDb({ effects: [localEffect()] })
    );
    expect(result.updated).toHaveLength(0);
    expect(result.deleted).toHaveLength(0);
  });

  it("refuses changed immutable effect identity and foreign-owned alias", async (): Promise<void> => {
    await expect(
      pull(
        "account_financial_effects",
        [remoteEffect({ amount_minor_units_text: "1" })],
        fakeDb({ effects: [localEffect()] })
      )
    ).rejects.toThrow(FINANCIAL_PULL_SHAPING_ERROR_CODE);
    await expect(
      pull("metal_lifecycle_events", [remoteEvent({ user_id: OTHER })])
    ).rejects.toThrow(SYNC_PULL_ERROR_CODES.INVALID_PULL_ROW);
  });

  it("retains sparse tombstones without fabricating exact financial text", async (): Promise<void> => {
    const result = await pull("metal_holding_states", [
      { id: HOLDING, user_id: USER, action_id: ACTION, deleted: true },
    ]);
    expect(result).toEqual({ created: [], updated: [], deleted: [HOLDING] });
  });

  it("continues rejecting JavaScript-number financial revisions on active rows", async (): Promise<void> => {
    await expect(
      pull("metal_holding_states", [
        {
          id: HOLDING,
          user_id: USER,
          deleted: false,
          financial_revision_text: 7,
        },
      ])
    ).rejects.toThrow(SYNC_PULL_ERROR_CODES.INVALID_EXACT_TEXT);
  });
});
