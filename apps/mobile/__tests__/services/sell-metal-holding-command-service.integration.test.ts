import { createHash } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type ExactRateReference,
  type FinancialActionEnvelopeV1,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import {
  createFinancialActionFoundationRepository,
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";

interface SellRateSnapshot extends RegisteredActionPayload {
  readonly referenceId: string;
  readonly role:
    | "terminal_metal"
    | "terminal_purchase_currency"
    | "terminal_proceeds_currency";
  readonly kind: "metal" | "currency";
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit:
    | "usd_per_pure_gram"
    | "usd_per_currency_unit"
    | "currency_units_per_usd";
  readonly orientation: "quote_per_base" | "base_per_quote";
  readonly providerObservedAt: string | null;
  readonly source: string | null;
  readonly quality: "valid";
  readonly capturedFreshness: "fresh" | "stale" | "unknown";
  readonly capturedAt: string;
}

interface SellMetalHoldingCommandInput {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
  readonly saleDate: string;
  readonly expectedFinancialRevision: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly purchaseCurrency: string;
  readonly saleCurrency: string;
  readonly grossProceedsMinorUnits: string;
  readonly feeMinorUnits: string;
  readonly netProceedsMinorUnits: string;
  readonly notes: string | null;
  readonly rateSnapshots: readonly SellRateSnapshot[];
}

interface SellMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly commitFinancialActionGroupLocally: ReturnType<
    typeof createFinancialActionFoundationRepository
  >["commitFinancialActionGroupLocally"];
  readonly createEnvelope: (
    input: SellMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

interface SellMetalHoldingCommandService {
  readonly sell: (
    input: SellMetalHoldingCommandInput
  ) => Promise<{ readonly kind: "committed" | "replay" }>;
}

interface SellCommandModule {
  readonly createSellMetalHoldingCommandService: (
    dependencies: SellMetalHoldingCommandDependencies
  ) => SellMetalHoldingCommandService;
}

interface SellPreviewInput {
  readonly metalType: "GOLD" | "SILVER";
  readonly pureGramsDecimal: string;
  readonly purchaseCostDecimal: string;
  readonly purchaseCurrency: string;
  readonly saleCurrency: string;
  readonly grossProceedsDecimal: string;
  readonly feeDecimal: string;
  readonly purchaseDate: string;
  readonly saleDate: string;
  readonly cairoTodayDate: string;
  readonly acquisitionMetalRate: ExactRateReference | null;
  readonly acquisitionCurrencyRate: ExactRateReference | null;
  readonly saleMetalRate: ExactRateReference | null;
  readonly purchaseCurrencyAtSaleRate: ExactRateReference | null;
  readonly proceedsCurrencyAtSaleRate: ExactRateReference | null;
  readonly hasAcknowledgedRateRisk: boolean;
}

interface SellPreview {
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly grossProceedsMinorUnits: string | null;
  readonly feeMinorUnits: string | null;
  readonly netProceedsMinorUnits: string | null;
  readonly netProceedsDecimal: string | null;
  readonly realizedProfitLossDecimal: string | null;
  readonly requiresRateAcknowledgment: boolean;
  readonly affectedRateRoles: readonly string[];
  readonly canSubmit: boolean;
}

interface SellPreviewModule {
  readonly buildSellMetalHoldingPreview: (
    input: SellPreviewInput
  ) => SellPreview;
}

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: ReadonlyArray<typeof Model>;
}

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  holding: "018f0c7a-1234-7abc-8def-000000000102",
  state: "018f0c7a-1234-7abc-8def-000000000104",
  createdAction: "018f0c7a-1234-7abc-8def-000000000105",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000106",
  saleAction: "018f0c7a-1234-7abc-8def-000000000110",
  saleEvidence: "018f0c7a-1234-7abc-8def-000000000111",
  saleEvent: "018f0c7a-1234-7abc-8def-000000000112",
  terminalMetal: "018f0c7a-1234-7abc-8def-000000000113",
  terminalPurchaseCurrency: "018f0c7a-1234-7abc-8def-000000000114",
  terminalProceedsCurrency: "018f0c7a-1234-7abc-8def-000000000115",
  account: "018f0c7a-1234-7abc-8def-000000000116",
} as const;

jest.mock("../../services/user-data-access", () => {
  const { Q: WatermelonQuery } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return {
    getCurrentUserDataScope: jest.fn(() => Promise.resolve(mockScopeValue())),
    assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
    findOwnedById: async <T extends { readonly userId: string }>(
      collection: { readonly find: (id: string) => Promise<T> },
      id: string,
      expectedUserId: string
    ): Promise<T> => {
      const record = await collection.find(id);
      if (record.userId !== expectedUserId) throw new Error("ownership_failed");
      return record;
    },
    queryChildrenOfOwnedParent: (
      collection: { readonly query: (...clauses: unknown[]) => unknown },
      parent: { readonly id: string; readonly userId: string },
      expectedUserId: string,
      foreignKey: string,
      ...clauses: unknown[]
    ): unknown => {
      if (parent.userId !== expectedUserId) throw new Error("ownership_failed");
      return collection.query(
        WatermelonQuery.where(foreignKey, parent.id),
        ...clauses
      );
    },
  };
});

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);

jest.mock("@monyvi/db", () => {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  const SQLiteAdapter = jest.requireActual<
    typeof import("@nozbe/watermelondb/adapters/sqlite")
  >("@nozbe/watermelondb/adapters/sqlite").default;
  const { schema } = jest.requireActual<
    typeof import("../../../../packages/db/src/schema")
  >("../../../../packages/db/src/schema");
  const modelClasses = [
    "Account",
    "Asset",
    "AssetMetal",
    "FinancialActionGroup",
    "MetalActionEvidence",
    "MetalHoldingState",
    "MetalLifecycleEvent",
    "MetalRateReference",
    "Transaction",
  ].map(
    (name) =>
      jest.requireActual<
        Record<string, typeof import("@nozbe/watermelondb").Model>
      >(`../../../../packages/db/src/models/${name}`)[name]
  );
  const adapter = new SQLiteAdapter({ schema });
  return {
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
    __modelClasses: modelClasses,
  };
});

const {
  database,
  __adapter: adapter,
  __modelClasses: modelClasses,
} = jest.requireMock<TestDatabaseModule>("@monyvi/db");
const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value, "utf8").digest("hex")),
};

function mockScopeValue(): FinancialActionUserDataScope {
  return {
    userId: IDS.user,
    queryOwned: (collection, ...clauses) =>
      collection.query(Q.where("user_id", IDS.user), ...clauses),
    assertOwned: <T extends { userId: string }>(record: T): T => record,
  };
}

function loadCommandModule(): SellCommandModule {
  return jest.requireActual<SellCommandModule>(
    "../../services/sell-metal-holding-command-service"
  );
}

function loadPreviewModule(): SellPreviewModule {
  return jest.requireActual<SellPreviewModule>(
    "../../services/sell-metal-holding-preview-service"
  );
}

function snapshot(
  role: SellRateSnapshot["role"],
  referenceId: string,
  overrides: Partial<SellRateSnapshot> = {}
): SellRateSnapshot {
  const isMetal = role === "terminal_metal";
  return {
    referenceId,
    role,
    kind: isMetal ? "metal" : "currency",
    instrumentCode: isMetal ? "metal:GOLD" : "currency:EGP",
    valueDecimal: isMetal ? "104.405044" : "0.02",
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt: "2026-09-01T09:00:00.000Z",
    source: "fixture-provider",
    quality: "valid",
    capturedFreshness: "fresh",
    capturedAt: "2026-09-01T10:15:30.123Z",
    ...overrides,
  };
}

function command(
  overrides: Partial<SellMetalHoldingCommandInput> = {}
): SellMetalHoldingCommandInput {
  return {
    actionId: IDS.saleAction,
    actionEvidenceId: IDS.saleEvidence,
    lifecycleEventId: IDS.saleEvent,
    predecessorEventId: IDS.createdEvent,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-09-01T10:15:30.123Z",
    cairoTodayDate: "2026-09-01",
    saleDate: "2026-08-27",
    expectedFinancialRevision: "0",
    metalType: "GOLD",
    purchaseCurrency: "EGP",
    saleCurrency: "EGP",
    grossProceedsMinorUnits: "17000000",
    feeMinorUnits: "50000",
    netProceedsMinorUnits: "16950000",
    notes: "Sold to trusted jeweller",
    rateSnapshots: [
      snapshot("terminal_metal", IDS.terminalMetal),
      snapshot("terminal_purchase_currency", IDS.terminalPurchaseCurrency),
      snapshot("terminal_proceeds_currency", IDS.terminalProceedsCurrency),
    ],
    ...overrides,
  };
}

function createEnvelope(
  input: SellMetalHoldingCommandInput,
  payload: RegisteredActionPayload
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: input.actionId,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "sell",
      occurredAt: input.occurredAt,
      payloadVersion: "metals.sell/v2",
      userId: input.userId,
      payload,
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { cairoTodayDate: input.cairoTodayDate }
  );
}

function createService(
  db: Database = database
): SellMetalHoldingCommandService {
  const repository = createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
      Promise.resolve(mockScopeValue()),
    assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
  return loadCommandModule().createSellMetalHoldingCommandService({
    database: db,
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope,
    hashProvider: sha256Provider,
  });
}

async function openFreshDatabase(): Promise<Database> {
  const clonedAdapter = await adapter.testClone();
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: clonedAdapter,
    modelClasses: [...modelClasses],
  });
}

async function seedHolding(
  status: "active" | "sold" = "active"
): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database.get<Account>("accounts").create((record): void => {
      record._raw.id = IDS.account;
      record.balance = 2500;
      record.currency = "EGP";
      record.deleted = false;
      record.isDefault = true;
      record.name = "Cash Wallet";
      record.type = "CASH";
      record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
      record.userId = IDS.user;
    });
    await database.get<Asset>("assets").create((record): void => {
      record._raw.id = IDS.holding;
      record.acquisitionActionId = IDS.createdAction;
      record.currency = "EGP";
      record.deleted = false;
      record.isLiquid = true;
      record.name = "Wedding coin";
      record.notes = "Gift";
      record.purchaseCurrency = "EGP";
      record.purchaseDate = new Date("2024-03-14T00:00:00.000Z");
      record.purchasePrice = 151278.2;
      record.purchasePriceDecimal = "151278.2";
      record.type = "METAL";
      record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
      record.userId = IDS.user;
    });
    await database.get<AssetMetal>("asset_metals").create((record): void => {
      record.assetId = IDS.holding;
      record.deleted = false;
      record.itemForm = "COIN";
      record.metalType = "GOLD";
      record.purityCatalogVersion = "1";
      record.purityCode = "gold-999";
      record.purityFactorDecimal = "0.999";
      record.purityFraction = 0.999;
      record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
      record.weightGrams = 31.125;
      record.weightGramsDecimal = "31.125";
    });
    await database
      .get<MetalHoldingState>("metal_holding_states")
      .create((record): void => {
        record._raw.id = IDS.state;
        record.deleted = false;
        record.effectiveActionId = IDS.createdAction;
        record.effectiveEventId = IDS.createdEvent;
        record.financialRevision = "0";
        record.holdingId = IDS.holding;
        record.isVisible = true;
        record.reconciliationState = "local_complete";
        record.status = status;
        record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
        record.userId = IDS.user;
      });
    await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .create((record): void => {
        record._raw.id = IDS.createdEvent;
        record.actionId = IDS.createdAction;
        record.deleted = false;
        record.holdingId = IDS.holding;
        record.isEffective = true;
        record.isHistoryVisible = true;
        record.kind = "created";
        record.occurredAt = new Date("2024-03-14T00:00:00.000Z");
        record.payloadJson = "{}";
        record.predecessorEventId = null;
        record.reversesEventId = null;
        record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
        record.userId = IDS.user;
      });
  });
}

type ExactMetalRateReference = Extract<
  ExactRateReference,
  { readonly kind: "metal" }
>;
type ExactCurrencyRateReference = Extract<
  ExactRateReference,
  { readonly kind: "currency" }
>;

function exactMetalRate(
  role: ExactMetalRateReference["role"],
  valueDecimal: string,
  freshness: "fresh" | "stale" | "unknown" = "fresh"
): ExactMetalRateReference {
  return Object.freeze({
    role,
    kind: "metal",
    instrumentCode: "metal:GOLD",
    valueDecimal,
    unit: "usd_per_pure_gram",
    orientation: "quote_per_base",
    providerObservedAt:
      freshness === "unknown" ? null : Date.parse("2026-09-01T09:00:00.000Z"),
    source: "fixture-provider",
    quality: "valid",
    capturedAt: Date.parse("2026-09-01T10:15:30.123Z"),
    capturedFreshness: freshness,
  });
}

function exactCurrencyRate(
  role: ExactCurrencyRateReference["role"],
  valueDecimal: string,
  freshness: "fresh" | "stale" | "unknown" = "fresh"
): ExactCurrencyRateReference {
  return Object.freeze({
    role,
    kind: "currency",
    instrumentCode: "currency:EGP",
    valueDecimal,
    unit: "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt:
      freshness === "unknown" ? null : Date.parse("2026-09-01T09:00:00.000Z"),
    source: "fixture-provider",
    quality: "valid",
    capturedAt: Date.parse("2026-09-01T10:15:30.123Z"),
    capturedFreshness: freshness,
  });
}

function previewInput(
  overrides: Partial<SellPreviewInput> = {}
): SellPreviewInput {
  return {
    metalType: "GOLD",
    pureGramsDecimal: "31.093875",
    purchaseCostDecimal: "151278.2",
    purchaseCurrency: "EGP",
    saleCurrency: "EGP",
    grossProceedsDecimal: "170000",
    feeDecimal: "500",
    purchaseDate: "2024-03-14",
    saleDate: "2026-08-27",
    cairoTodayDate: "2026-09-01",
    acquisitionMetalRate: exactMetalRate("acquisition_metal", "95"),
    acquisitionCurrencyRate: exactCurrencyRate(
      "acquisition_purchase_currency",
      "0.02"
    ),
    saleMetalRate: exactMetalRate("terminal_metal", "104.405044"),
    purchaseCurrencyAtSaleRate: exactCurrencyRate(
      "terminal_purchase_currency",
      "0.02"
    ),
    proceedsCurrencyAtSaleRate: exactCurrencyRate(
      "terminal_proceeds_currency",
      "0.02"
    ),
    hasAcknowledgedRateRisk: true,
    ...overrides,
  };
}

describe("Sell metal holding exact preview", () => {
  it("calculates gross, same-currency fee, net proceeds, and realized P/L exactly", (): void => {
    const result =
      loadPreviewModule().buildSellMetalHoldingPreview(previewInput());
    expect(result).toMatchObject({
      validationErrors: {},
      grossProceedsMinorUnits: "17000000",
      feeMinorUnits: "50000",
      netProceedsMinorUnits: "16950000",
      netProceedsDecimal: "169500",
      realizedProfitLossDecimal: "18221.8",
      requiresRateAcknowledgment: false,
      canSubmit: true,
    });
  });

  it("treats an omitted optional fee as exact zero in the sale currency", (): void => {
    const result = loadPreviewModule().buildSellMetalHoldingPreview(
      previewInput({ feeDecimal: "" })
    );
    expect(result).toMatchObject({
      feeMinorUnits: "0",
      grossProceedsMinorUnits: "17000000",
      netProceedsMinorUnits: "17000000",
      netProceedsDecimal: "170000",
      realizedProfitLossDecimal: "18721.8",
      canSubmit: true,
    });
  });

  it.each([
    ["zero gross", { grossProceedsDecimal: "0" }, "grossProceeds"],
    ["negative fee", { feeDecimal: "-1" }, "fee"],
    ["fee above gross", { feeDecimal: "170000.01" }, "fee"],
    ["future date", { saleDate: "2026-09-02" }, "saleDate"],
    ["before purchase", { saleDate: "2024-03-13" }, "saleDate"],
  ] as const)(
    "blocks %s without rounding or persistence",
    (_name, overrides, field) => {
      const result = loadPreviewModule().buildSellMetalHoldingPreview(
        previewInput(overrides)
      );
      expect(result.validationErrors[field]).toBeDefined();
      expect(result.canSubmit).toBe(false);
    }
  );

  it("requires named stale acknowledgment before submission", (): void => {
    const stale = exactMetalRate("terminal_metal", "104.405044", "stale");
    const result = loadPreviewModule().buildSellMetalHoldingPreview(
      previewInput({
        saleMetalRate: stale,
        hasAcknowledgedRateRisk: false,
      })
    );
    expect(result.requiresRateAcknowledgment).toBe(true);
    expect(result.affectedRateRoles).toEqual(["terminal_metal"]);
    expect(result.canSubmit).toBe(false);
  });
});

describe("Sell metal holding command SQLite atomicity", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });

  it("sells only an active whole holding and persists immutable local-first History evidence", async (): Promise<void> => {
    await seedHolding();
    await expect(createService().sell(command())).resolves.toEqual({
      kind: "committed",
    });
    const state = (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch()
    )[0];
    expect(state).toMatchObject({
      status: "sold",
      financialRevision: "1",
      effectiveActionId: IDS.saleAction,
      effectiveEventId: IDS.saleEvent,
      reconciliationState: "sync_pending",
    });
    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(Q.sortBy("occurred_at", Q.asc))
      .fetch();
    expect(events).toHaveLength(2);
    expect(events[0].isEffective).toBe(false);
    expect(events[1]).toMatchObject({
      actionId: IDS.saleAction,
      kind: "sold",
      isEffective: true,
      isHistoryVisible: true,
      predecessorEventId: IDS.createdEvent,
    });
    expect(
      await database
        .get<MetalActionEvidence>("metal_action_evidence")
        .query()
        .fetch()
    ).toHaveLength(1);
    expect(
      await database
        .get<MetalRateReference>("metal_rate_references")
        .query()
        .fetch()
    ).toHaveLength(3);
  });

  it("creates no account or ordinary-income side effect and removes active net-worth contribution", async (): Promise<void> => {
    await seedHolding();
    const before = await database.get<Account>("accounts").find(IDS.account);
    expect(before.balance).toBe(2500);
    await createService().sell(command());
    const after = await database.get<Account>("accounts").find(IDS.account);
    expect(after.balance).toBe(2500);
    expect(
      await database.get<Model>("transactions").query().fetch()
    ).toHaveLength(0);
    const state = (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch()
    )[0];
    expect(state.status).toBe("sold");
  });

  it("survives database re-instantiation with the sold state, immutable History, and unchanged account", async (): Promise<void> => {
    await seedHolding();
    await createService().sell(command());

    const reopened = await openFreshDatabase();
    const [state] = await reopened
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    const events = await reopened
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    const account = await reopened.get<Account>("accounts").find(IDS.account);
    expect(state).toMatchObject({
      status: "sold",
      effectiveActionId: IDS.saleAction,
      effectiveEventId: IDS.saleEvent,
      reconciliationState: "sync_pending",
    });
    expect(events).toHaveLength(2);
    expect(events.find((event) => event.id === IDS.saleEvent)).toMatchObject({
      kind: "sold",
      isEffective: true,
      isHistoryVisible: true,
    });
    expect(account.balance).toBe(2500);
    expect(
      await reopened.get<Model>("transactions").query().fetch()
    ).toHaveLength(0);
  });

  it.each(["sold", "disposed"] as const)(
    "rejects a %s holding without writing a sale action",
    async (status): Promise<void> => {
      await seedHolding(status === "sold" ? "sold" : "active");
      if (status === "disposed") {
        await database.write(async (): Promise<void> => {
          await (
            await database
              .get<MetalHoldingState>("metal_holding_states")
              .query()
              .fetch()
          )[0].update((record): void => {
            record.status = "disposed";
          });
        });
      }
      await expect(createService().sell(command())).rejects.toThrow(
        "metal_sale_active_holding_required"
      );
      expect(
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch()
      ).toHaveLength(0);
    }
  );

  it("replays exactly once across service recreation and rejects a changed payload", async (): Promise<void> => {
    await seedHolding();
    await createService().sell(command());
    await expect(createService().sell(command())).resolves.toEqual({
      kind: "replay",
    });
    await expect(
      createService().sell(command({ notes: "Changed payload" }))
    ).rejects.toThrow("action_id_payload_mismatch");
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
  });

  it("rolls back root, state, History, rates, and account when SQLite batch fails, then permits retry", async (): Promise<void> => {
    await seedHolding();
    const batch = jest
      .spyOn(database, "batch")
      .mockRejectedValueOnce(new Error("fixture_sqlite_failure"));
    const service = createService();
    await expect(service.sell(command())).rejects.toThrow(
      "fixture_sqlite_failure"
    );
    batch.mockRestore();
    expect(
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).toHaveLength(0);
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(1);
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0].status
    ).toBe("active");
    expect(
      (await database.get<Account>("accounts").find(IDS.account)).balance
    ).toBe(2500);
    await expect(service.sell(command())).resolves.toEqual({
      kind: "committed",
    });
  });
});
