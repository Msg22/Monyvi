import { createHash } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Account,
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalHoldingState,
  MetalLifecycleEvent,
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

import type {
  SellMetalRateSnapshot as SellRateSnapshot,
  SellMetalHoldingCommandInput,
  SellMetalHoldingCommandDependencies,
  SellMetalHoldingCommandService,
} from "../../services/sell-metal-holding-command-service";

import type {
  SellMetalHoldingPreviewInput as SellPreviewInput,
  SellMetalHoldingPreview as SellPreview,
} from "../../services/sell-metal-holding-preview-service";

import {
  acquisitionEnvelope,
  envelopeHash,
  envelopeJson,
} from "./sell-metal-holding-lifecycle-fixtures";

export interface SellCommandModule {
  readonly createSellMetalHoldingCommandService: (
    dependencies: SellMetalHoldingCommandDependencies
  ) => SellMetalHoldingCommandService;
}

export interface SellPreviewModule {
  readonly buildSellMetalHoldingPreview: (
    input: SellPreviewInput
  ) => SellPreview;
}

export interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: ReadonlyArray<typeof Model>;
}

export const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  holding: "018f0c7a-1234-7abc-8def-000000000102",
  state: "018f0c7a-1234-7abc-8def-000000000104",
  createdAction: "018f0c7a-1234-7abc-8def-000000000105",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000105",
  saleAction: "018f0c7a-1234-7abc-8def-000000000110",
  saleEvidence: "018f0c7a-1234-7abc-8def-000000000111",
  saleEvent: "018f0c7a-1234-7abc-8def-000000000112",
  terminalMetal: "018f0c7a-1234-7abc-8def-000000000113",
  terminalPurchaseCurrency: "018f0c7a-1234-7abc-8def-000000000114",
  terminalProceedsCurrency: "018f0c7a-1234-7abc-8def-000000000115",
  account: "018f0c7a-1234-7abc-8def-000000000116",
} as const;

export const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value, "utf8").digest("hex")),
};

export function mockScopeValue(): FinancialActionUserDataScope &
  Pick<
    import("../../services/user-data-access").CurrentUserDataScope,
    "queryChildrenOfOwnedParent"
  > {
  return {
    userId: IDS.user,
    queryOwned: (collection, ...clauses) =>
      collection.query(Q.where("user_id", IDS.user), ...clauses),
    assertOwned: <T extends { userId: string }>(record: T): T => {
      if (record.userId !== IDS.user) throw new Error("ownership_failed");
      return record;
    },
    queryChildrenOfOwnedParent: (collection, parent, foreignKey, ...clauses) =>
      collection.query(Q.where(foreignKey, parent.id), ...clauses),
  };
}

export function loadCommandModule(): SellCommandModule {
  return jest.requireActual<SellCommandModule>(
    "../../services/sell-metal-holding-command-service"
  );
}

export function loadPreviewModule(): SellPreviewModule {
  return jest.requireActual<SellPreviewModule>(
    "../../services/sell-metal-holding-preview-service"
  );
}

export function snapshot(
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

export function command(
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
    latestAllowedCalendarDate: "2026-09-01",
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

export function createEnvelope(
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
    { latestAllowedCalendarDate: input.latestAllowedCalendarDate }
  );
}

export function createService(
  database: Database
): SellMetalHoldingCommandService {
  const repository = createFinancialActionFoundationRepository({
    database,
    getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
      Promise.resolve(mockScopeValue()),
    assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
  return loadCommandModule().createSellMetalHoldingCommandService({
    database,
    getCurrentUserDataScope: () => Promise.resolve(mockScopeValue()),
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope,
    hashProvider: sha256Provider,
  });
}

export async function openFreshDatabase(
  adapter: SQLiteAdapter,
  modelClasses: ReadonlyArray<typeof Model>
): Promise<Database> {
  const clonedAdapter = await adapter.testClone();
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: clonedAdapter,
    modelClasses: [...modelClasses],
  });
}

export async function seedHolding(
  database: Database,
  status: "active" | "sold" = "active"
): Promise<void> {
  const acquisition = acquisitionEnvelope(IDS);
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
      .get<FinancialActionGroup>("financial_action_groups")
      .create((record): void => {
        record._raw.id = IDS.createdAction;
        record.accountGuardsJson = "[]";
        record.actionId = IDS.createdAction;
        record.deleted = false;
        record.domain = "metals";
        record.domainReferenceId = IDS.holding;
        record.kind = "add";
        record.outcomeJson = null;
        record.payloadHash = envelopeHash(acquisition);
        record.payloadJson = envelopeJson(acquisition);
        record.rejectionCode = null;
        record.serverOutcome = null;
        record.state = "local_complete";
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
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
        record.kind = "add";
        record.occurredAt = new Date("2024-03-14T00:00:00.000Z");
        record.payloadJson = JSON.stringify(acquisition.payload);
        record.predecessorEventId = null;
        record.reversesEventId = null;
        record.updatedAt = new Date("2026-08-31T10:00:00.000Z");
        record.userId = IDS.user;
      });
  });
}

export type ExactMetalRateReference = Extract<
  ExactRateReference,
  { readonly kind: "metal" }
>;
export type ExactCurrencyRateReference = Extract<
  ExactRateReference,
  { readonly kind: "currency" }
>;

export function exactMetalRate(
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

export function exactCurrencyRate(
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

export function previewInput(
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
    latestAllowedCalendarDate: "2026-09-01",
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
