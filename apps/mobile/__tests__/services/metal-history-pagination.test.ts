interface QueryCondition {
  readonly column?: string;
  readonly kind: "sortBy" | "where";
  readonly value?: unknown;
}

const mockAssetsCollection = { table: "assets" };
const mockAssetMetalsCollection = { table: "asset_metals" };
const mockEvidenceCollection = { table: "metal_action_evidence" };
const mockStatesCollection = { table: "metal_holding_states" };
const mockEventsCollection = { table: "metal_lifecycle_events" };
const mockGetCurrentUserDataScope = jest.fn();
const mockScopeQueryChildren = jest.fn();
const mockScopeQueryOwned = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => {
      const collections: Readonly<Record<string, unknown>> = {
        assets: mockAssetsCollection,
        asset_metals: mockAssetMetalsCollection,
        metal_action_evidence: mockEvidenceCollection,
        metal_holding_states: mockStatesCollection,
        metal_lifecycle_events: mockEventsCollection,
      };
      const collection = collections[table];
      if (collection === undefined) throw new Error(`Unexpected table: ${table}`);
      return collection;
    },
  },
}));

jest.mock("@nozbe/watermelondb", () => ({
  Q: {
    desc: "desc",
    oneOf: (values: readonly unknown[]): unknown => ({ oneOf: values }),
    sortBy: (column: string, value: unknown): QueryCondition => ({
      column,
      kind: "sortBy",
      value,
    }),
    where: (column: string, value: unknown): QueryCondition => ({
      column,
      kind: "where",
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  getCurrentUserDataScope: (...args: readonly unknown[]): unknown =>
    mockGetCurrentUserDataScope(...args),
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: jest.fn(),
}));

import { readMetalHistoryReadModel } from "@/services/metal-history-read-model-service";

interface TerminalFixture {
  readonly holdingId: string;
  readonly occurredAt: Date;
  readonly status: "disposed" | "sold";
}

function fetchedRows(rows: readonly unknown[]): {
  readonly fetch: () => Promise<readonly unknown[]>;
} {
  return { fetch: (): Promise<readonly unknown[]> => Promise.resolve(rows) };
}

function terminalFixtures(): readonly TerminalFixture[] {
  return [
    {
      holdingId: "sold-latest",
      occurredAt: new Date("2026-08-25T10:00:00.000Z"),
      status: "sold",
    },
    {
      holdingId: "disposed-middle",
      occurredAt: new Date("2026-08-24T10:00:00.000Z"),
      status: "disposed",
    },
    {
      holdingId: "sold-older",
      occurredAt: new Date("2026-08-23T10:00:00.000Z"),
      status: "sold",
    },
  ];
}

describe("metal History pagination", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const terminals = terminalFixtures();
    const assets = terminals.map((terminal) => ({
      deleted: false,
      id: terminal.holdingId,
      name: terminal.holdingId,
      purchaseCurrency: null,
      purchaseDate: null,
      purchasePriceDecimal: null,
      type: "METAL",
      userId: "user-1",
    }));
    const states = terminals.map((terminal) => ({
      deleted: false,
      effectiveActionId: `${terminal.holdingId}-terminal-action`,
      effectiveEventId: `${terminal.holdingId}-terminal-event`,
      holdingId: terminal.holdingId,
      isVisible: true,
      reconciliationState: "accepted",
      status: terminal.status,
      userId: "user-1",
    }));
    const events = terminals.flatMap((terminal) => [
      {
        actionId: `${terminal.holdingId}-created-action`,
        deleted: false,
        holdingId: terminal.holdingId,
        id: `${terminal.holdingId}-created-event`,
        isEffective: true,
        isHistoryVisible: true,
        kind: "add",
        occurredAt: new Date("2026-08-01T10:00:00.000Z"),
        payloadJson: "{}",
        predecessorEventId: null,
        reversesEventId: null,
        userId: "user-1",
      },
      {
        actionId: `${terminal.holdingId}-terminal-action`,
        deleted: false,
        holdingId: terminal.holdingId,
        id: `${terminal.holdingId}-terminal-event`,
        isEffective: true,
        isHistoryVisible: true,
        kind: terminal.status === "sold" ? "sell" : "dispose",
        occurredAt: terminal.occurredAt,
        payloadJson: "{}",
        predecessorEventId: `${terminal.holdingId}-created-event`,
        reversesEventId: null,
        userId: "user-1",
      },
    ]);
    const evidence = events.map((event) => ({
      actionId: event.actionId,
      deleted: false,
      holdingId: event.holdingId,
      kind: event.kind,
      userId: "user-1",
    }));

    mockScopeQueryOwned.mockImplementation(
      (collection: { readonly table: string }): unknown => {
        const rowsByTable: Readonly<Record<string, readonly unknown[]>> = {
          assets,
          metal_action_evidence: evidence,
          metal_holding_states: states,
          metal_lifecycle_events: events,
        };
        return fetchedRows(rowsByTable[collection.table] ?? []);
      }
    );
    mockScopeQueryChildren.mockImplementation((): unknown =>
      fetchedRows([
        {
          assetId: "sold-latest",
          deleted: false,
          itemForm: "coin",
          metalType: "GOLD",
          purityCatalogVersion: "1",
          purityCode: "gold-999",
          purityFactorDecimal: "0.999",
          weightGramsDecimal: "8",
        },
      ])
    );
    mockGetCurrentUserDataScope.mockResolvedValue({
      queryChildrenOfOwnedParents: mockScopeQueryChildren,
      queryOwned: mockScopeQueryOwned,
      userId: "user-1",
    });
  });

  it("keeps global counts and requests dependencies only for the filtered page", async () => {
    const model = await readMetalHistoryReadModel({
      filter: "sold",
      pageSize: 1,
      userId: "user-1",
    });

    expect(model).toMatchObject({
      counts: { all: 3, disposed: 1, sold: 2 },
      filter: "sold",
      hasMore: true,
    });
    expect(model.items.map((item) => item.holdingId)).toEqual(["sold-latest"]);
    expect(mockScopeQueryOwned).toHaveBeenCalledWith(
      mockAssetsCollection,
      { column: "id", kind: "where", value: { oneOf: ["sold-latest"] } },
      { column: "type", kind: "where", value: "METAL" },
      { column: "deleted", kind: "where", value: false }
    );
    expect(mockScopeQueryOwned).toHaveBeenCalledWith(
      mockEventsCollection,
      { column: "holding_id", kind: "where", value: { oneOf: ["sold-latest"] } },
      { column: "deleted", kind: "where", value: false },
      { column: "is_history_visible", kind: "where", value: true },
      { column: "occurred_at", kind: "sortBy", value: "desc" }
    );
    expect(mockScopeQueryOwned).toHaveBeenCalledWith(
      mockEvidenceCollection,
      { column: "holding_id", kind: "where", value: { oneOf: ["sold-latest"] } },
      { column: "deleted", kind: "where", value: false }
    );
  });
});
