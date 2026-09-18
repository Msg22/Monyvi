interface QueryCondition {
  readonly column?: string;
  readonly kind: "sortBy" | "take" | "where";
  readonly value?: unknown;
}

const collections: Readonly<Record<string, { readonly table: string }>> = {
  assets: { table: "assets" },
  asset_metals: { table: "asset_metals" },
  financial_action_groups: { table: "financial_action_groups" },
  metal_action_evidence: { table: "metal_action_evidence" },
  metal_holding_states: { table: "metal_holding_states" },
  metal_lifecycle_events: { table: "metal_lifecycle_events" },
  metal_rate_references: { table: "metal_rate_references" },
};
const mockGetCurrentUserDataScope = jest.fn();
const mockQueryChildrenOfOwnedParent = jest.fn();
const mockQueryChildrenOfOwnedParents = jest.fn();
const mockQueryOwned = jest.fn();

jest.mock("@monyvi/db", () => ({
  database: {
    get: (table: string): unknown => {
      const collection = collections[table];
      if (collection === undefined)
        throw new Error(`Unexpected table: ${table}`);
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
    take: (value: number): QueryCondition => ({ kind: "take", value }),
    where: (column: string, value: unknown): QueryCondition => ({
      column,
      kind: "where",
      value,
    }),
  },
}));

jest.mock("@/services/user-data-access", () => ({
  USER_DATA_ACCESS_ERROR_CODES: {
    AUTH_SCOPE_CHANGED: "AUTH_SCOPE_CHANGED",
    USER_REQUIRED: "USER_REQUIRED",
  },
  getCurrentUserDataScope: (...args: readonly unknown[]): unknown =>
    mockGetCurrentUserDataScope(...args),
  queryChildrenOfOwnedParents: jest.fn(),
  queryOwned: jest.fn(),
}));

import { readMetalDetailReadModel } from "@/services/metal-detail-read-model-service";
import { readMetalHistoryReadModel } from "@/services/metal-history-read-model-service";

const USER_ID = "018f0c7a-1234-7abc-8def-000000000001";
const SOLD_HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000002";
const DISPOSED_HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000003";
const GOLD_ADD_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000004";
const GOLD_ADD_EVENT_ID = "018f0c7a-1234-7abc-8def-000000000005";
const GOLD_SELL_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000006";
const GOLD_SELL_EVENT_ID = "018f0c7a-1234-7abc-8def-000000000007";
const SILVER_ADD_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000008";
const SILVER_ADD_EVENT_ID = "018f0c7a-1234-7abc-8def-000000000009";
const SILVER_DISPOSE_ACTION_ID = "018f0c7a-1234-7abc-8def-000000000010";
const SILVER_DISPOSE_EVENT_ID = "018f0c7a-1234-7abc-8def-000000000011";

let ownedRows: Readonly<Record<string, readonly unknown[]>> = {};
let childRows: Readonly<Record<string, readonly unknown[]>> = {};

function fetchedRows(rows: readonly unknown[]): {
  readonly fetch: () => Promise<readonly unknown[]>;
} {
  return { fetch: (): Promise<readonly unknown[]> => Promise.resolve(rows) };
}

function envelope(input: {
  readonly actionId: string;
  readonly holdingId: string;
  readonly kind: "dispose" | "sell";
  readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadVersion: "metals.dispose/v1" | "metals.sell/v2";
  readonly terminalDate: string;
}): string {
  return JSON.stringify({
    accountGuards: [],
    actionId: input.actionId,
    domain: "metals",
    domainReferenceId: input.holdingId,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: input.kind,
    occurredAt: `${input.terminalDate}T12:00:00.000Z`,
    payload: input.payload,
    payloadVersion: input.payloadVersion,
    userId: USER_ID,
  });
}

function group(input: {
  readonly actionId: string;
  readonly holdingId: string;
  readonly kind: "dispose" | "sell";
  readonly payload: Readonly<Record<string, unknown>>;
  readonly payloadVersion: "metals.dispose/v1" | "metals.sell/v2";
  readonly terminalDate: string;
}): Readonly<Record<string, unknown>> {
  return {
    actionId: input.actionId,
    deleted: false,
    domain: "metals",
    domainReferenceId: input.holdingId,
    kind: input.kind,
    outcomeJson: null,
    payloadJson: envelope(input),
    rejectionCode: null,
    serverOutcome: null,
    state: "local_complete",
    userId: USER_ID,
  };
}

function evidence(
  actionId: string,
  holdingId: string,
  kind: "add" | "dispose" | "sell"
): Readonly<Record<string, unknown>> {
  return { actionId, deleted: false, holdingId, kind, userId: USER_ID };
}

function lifecycle(input: {
  readonly actionId: string;
  readonly holdingId: string;
  readonly id: string;
  readonly kind: "add" | "dispose" | "sell";
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly predecessorEventId: string | null;
}): Readonly<Record<string, unknown>> {
  return {
    actionId: input.actionId,
    deleted: false,
    holdingId: input.holdingId,
    id: input.id,
    isEffective: true,
    isHistoryVisible: true,
    kind: input.kind,
    occurredAt: input.occurredAt,
    payloadJson: JSON.stringify(input.payload),
    predecessorEventId: input.predecessorEventId,
    reversesEventId: null,
    userId: USER_ID,
  };
}

const soldPayload = {
  expectedHoldingRevision: "1",
  feeMinorUnits: "50000",
  grossProceedsMinorUnits: "3600000",
  holdingId: SOLD_HOLDING_ID,
  metalType: "GOLD",
  netProceedsMinorUnits: "3550000",
  notes: "Manual QA sale",
  predecessorEventId: GOLD_ADD_EVENT_ID,
  purchaseCurrency: "EGP",
  rateSnapshots: [],
  reversesEventId: null,
  saleCurrency: "EGP",
  saleDate: "2026-08-23",
} as const;

const disposedPayload = {
  disposalDate: "2026-08-22",
  expectedHoldingRevision: "1",
  holdingId: DISPOSED_HOLDING_ID,
  notes: "Given to family",
  predecessorEventId: SILVER_ADD_EVENT_ID,
  reason: "given_away",
  reversesEventId: null,
} as const;

function installTerminalRows(): void {
  ownedRows = {
    assets: [
      {
        acquisitionActionId: GOLD_ADD_ACTION_ID,
        deleted: false,
        id: SOLD_HOLDING_ID,
        name: "Wedding coin",
        purchaseCurrency: "EGP",
        purchaseDate: new Date("2026-08-01T00:00:00.000Z"),
        purchasePriceDecimal: "30000",
        type: "METAL",
        userId: USER_ID,
      },
      {
        acquisitionActionId: SILVER_ADD_ACTION_ID,
        deleted: false,
        id: DISPOSED_HOLDING_ID,
        name: "Old silver",
        purchaseCurrency: null,
        purchaseDate: null,
        purchasePriceDecimal: null,
        type: "METAL",
        userId: USER_ID,
      },
    ],
    financial_action_groups: [
      group({
        actionId: GOLD_SELL_ACTION_ID,
        holdingId: SOLD_HOLDING_ID,
        kind: "sell",
        payload: soldPayload,
        payloadVersion: "metals.sell/v2",
        terminalDate: soldPayload.saleDate,
      }),
      group({
        actionId: SILVER_DISPOSE_ACTION_ID,
        holdingId: DISPOSED_HOLDING_ID,
        kind: "dispose",
        payload: disposedPayload,
        payloadVersion: "metals.dispose/v1",
        terminalDate: disposedPayload.disposalDate,
      }),
    ],
    metal_action_evidence: [
      evidence(GOLD_ADD_ACTION_ID, SOLD_HOLDING_ID, "add"),
      evidence(GOLD_SELL_ACTION_ID, SOLD_HOLDING_ID, "sell"),
      evidence(SILVER_ADD_ACTION_ID, DISPOSED_HOLDING_ID, "add"),
      evidence(SILVER_DISPOSE_ACTION_ID, DISPOSED_HOLDING_ID, "dispose"),
    ],
    metal_holding_states: [
      {
        deleted: false,
        effectiveActionId: GOLD_SELL_ACTION_ID,
        effectiveEventId: GOLD_SELL_EVENT_ID,
        holdingId: SOLD_HOLDING_ID,
        isVisible: true,
        reconciliationState: "accepted",
        status: "sold",
        userId: USER_ID,
      },
      {
        deleted: false,
        effectiveActionId: SILVER_DISPOSE_ACTION_ID,
        effectiveEventId: SILVER_DISPOSE_EVENT_ID,
        holdingId: DISPOSED_HOLDING_ID,
        isVisible: true,
        reconciliationState: "accepted",
        status: "disposed",
        userId: USER_ID,
      },
    ],
    metal_lifecycle_events: [
      lifecycle({
        actionId: GOLD_ADD_ACTION_ID,
        holdingId: SOLD_HOLDING_ID,
        id: GOLD_ADD_EVENT_ID,
        kind: "add",
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        payload: {},
        predecessorEventId: null,
      }),
      lifecycle({
        actionId: GOLD_SELL_ACTION_ID,
        holdingId: SOLD_HOLDING_ID,
        id: GOLD_SELL_EVENT_ID,
        kind: "sell",
        occurredAt: new Date("2026-08-23T12:00:00.000Z"),
        payload: soldPayload,
        predecessorEventId: GOLD_ADD_EVENT_ID,
      }),
      lifecycle({
        actionId: SILVER_ADD_ACTION_ID,
        holdingId: DISPOSED_HOLDING_ID,
        id: SILVER_ADD_EVENT_ID,
        kind: "add",
        occurredAt: new Date("2026-08-01T00:00:00.000Z"),
        payload: {},
        predecessorEventId: null,
      }),
      lifecycle({
        actionId: SILVER_DISPOSE_ACTION_ID,
        holdingId: DISPOSED_HOLDING_ID,
        id: SILVER_DISPOSE_EVENT_ID,
        kind: "dispose",
        occurredAt: new Date("2026-08-22T12:00:00.000Z"),
        payload: disposedPayload,
        predecessorEventId: SILVER_ADD_EVENT_ID,
      }),
    ],
    metal_rate_references: [],
  };
  childRows = {
    asset_metals: [
      {
        assetId: SOLD_HOLDING_ID,
        deleted: false,
        itemForm: "coin",
        metalType: "GOLD",
        purityCatalogVersion: "1",
        purityCode: "gold-9999",
        purityFactorDecimal: "0.9999",
        weightGramsDecimal: "15",
      },
      {
        assetId: DISPOSED_HOLDING_ID,
        deleted: false,
        itemForm: "bar",
        metalType: "SILVER",
        purityCatalogVersion: "1",
        purityCode: "silver-925",
        purityFactorDecimal: "0.925",
        weightGramsDecimal: "15",
      },
    ],
  };
}

describe("terminal metal read-model integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installTerminalRows();
    mockQueryOwned.mockImplementation(
      (
        collection: { readonly table: string },
        ...conditions: QueryCondition[]
      ) => {
        const idCondition = conditions.find(
          (condition) =>
            condition.column === "id" && typeof condition.value === "string"
        );
        const rows = ownedRows[collection.table] ?? [];
        return fetchedRows(
          idCondition === undefined
            ? rows
            : rows.filter(
                (row) =>
                  typeof row === "object" &&
                  row !== null &&
                  "id" in row &&
                  row.id === idCondition.value
              )
        );
      }
    );
    mockQueryChildrenOfOwnedParent.mockImplementation(
      (
        collection: { readonly table: string },
        parent: { readonly id: string }
      ) =>
        fetchedRows(
          (childRows[collection.table] ?? []).filter(
            (row) =>
              typeof row === "object" &&
              row !== null &&
              "assetId" in row &&
              row.assetId === parent.id
          )
        )
    );
    mockQueryChildrenOfOwnedParents.mockImplementation(
      (collection: { readonly table: string }) =>
        fetchedRows(childRows[collection.table] ?? [])
    );
    mockGetCurrentUserDataScope.mockResolvedValue({
      queryChildrenOfOwnedParent: mockQueryChildrenOfOwnedParent,
      queryChildrenOfOwnedParents: mockQueryChildrenOfOwnedParents,
      queryOwned: mockQueryOwned,
      userId: USER_ID,
    });
  });

  it("publishes exact sold facts on terminal holding detail", async () => {
    ownedRows = {
      ...ownedRows,
      assets: ownedRows.assets?.slice(0, 1) ?? [],
      financial_action_groups:
        ownedRows.financial_action_groups?.slice(0, 1) ?? [],
      metal_action_evidence:
        ownedRows.metal_action_evidence?.slice(0, 2) ?? [],
      metal_holding_states:
        ownedRows.metal_holding_states?.slice(0, 1) ?? [],
      metal_lifecycle_events:
        ownedRows.metal_lifecycle_events?.slice(0, 2) ?? [],
    };
    childRows = {
      asset_metals: childRows.asset_metals?.slice(0, 1) ?? [],
    };
    const model = await readMetalDetailReadModel({
      holdingId: SOLD_HOLDING_ID,
      latestAllowedCalendarDate: "2026-09-01",
      userId: USER_ID,
    });

    expect(model?.terminalFacts).toEqual({
      actionId: GOLD_SELL_ACTION_ID,
      feeDecimal: "500",
      grossProceedsDecimal: "36000",
      kind: "sold",
      netProceedsDecimal: "35500",
      notes: "Manual QA sale",
      proceedsCurrency: "EGP",
      realizedResultCurrency: "EGP",
      realizedResultDecimal: "5500",
      realizedResultUnavailableReason: null,
      terminalDate: "2026-08-23",
    });
  });

  it("publishes sale proceeds and disposal reason on History rows", async () => {
    const model = await readMetalHistoryReadModel({
      filter: "all",
      pageSize: 25,
      userId: USER_ID,
    });

    expect(model.items.map((item) => item.holdingId)).toEqual([
      SOLD_HOLDING_ID,
      DISPOSED_HOLDING_ID,
    ]);
    expect(model.items[0]?.terminalFacts).toMatchObject({
      kind: "sold",
      netProceedsDecimal: "35500",
      proceedsCurrency: "EGP",
      terminalDate: "2026-08-23",
    });
    expect(model.items[1]?.terminalFacts).toEqual({
      actionId: SILVER_DISPOSE_ACTION_ID,
      kind: "disposed",
      notes: "Given to family",
      reason: "given_away",
      terminalDate: "2026-08-22",
      treatment: "external_transfer",
    });
  });
});
