import { createHash } from "node:crypto";
import { Q, type Database } from "@nozbe/watermelondb";
import { synchronize, type SyncPullResult } from "@nozbe/watermelondb/sync";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type FinancialActionRegistry,
  type Sha256Provider,
} from "@monyvi/logic";

import { createFinancialActionFoundationRepository } from "../../services/financial-action-foundation-repository";
import type {
  DisposeMetalHoldingCommandDependencies,
  DisposeMetalHoldingCommandInput,
  DisposeMetalHoldingCommandService,
} from "../../services/dispose-metal-holding-command-service";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

interface DisposeServiceModule {
  readonly createDisposeMetalHoldingCommandService: (
    dependencies: DisposeMetalHoldingCommandDependencies
  ) => DisposeMetalHoldingCommandService;
}

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  state: "018f0c7a-1234-7abc-8def-000000000004",
  createdAction: "018f0c7a-1234-7abc-8def-000000000005",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000006",
  disposeAction: "018f0c7a-1234-7abc-8def-000000000010",
  disposeEvidence: "018f0c7a-1234-7abc-8def-000000000011",
  disposeEvent: "018f0c7a-1234-7abc-8def-000000000012",
} as const;

const SERVER_ACCEPTED_AT = Date.parse("2026-09-06T10:00:00.000Z");

jest.mock("../../services/user-data-access", () => ({
  getCurrentUserDataScope: jest.fn(),
  assertExpectedCurrentUser: jest.fn(() => Promise.resolve()),
}));
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
    "Asset",
    "AssetMetal",
    "FinancialActionGroup",
    "MetalActionEvidence",
    "MetalHoldingState",
    "MetalLifecycleEvent",
    "MetalRateReference",
  ].map(
    (name) =>
      jest.requireActual<
        Record<string, typeof import("@nozbe/watermelondb").Model>
      >(`../../../../packages/db/src/models/${name}`)[name]
  );
  const adapter = new SQLiteAdapter({ schema });
  const database = new WatermelonDatabase({ adapter, modelClasses });
  return { database, __adapter: adapter };
});

const { database, __adapter: adapter } =
  jest.requireMock<TestDatabaseModule>("@monyvi/db");
const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value, "utf8").digest("hex")),
};

function loadService(): DisposeServiceModule {
  return jest.requireActual<DisposeServiceModule>(
    "../../services/dispose-metal-holding-command-service"
  );
}

function command(
  overrides: Partial<DisposeMetalHoldingCommandInput> = {}
): DisposeMetalHoldingCommandInput {
  return {
    actionId: IDS.disposeAction,
    actionEvidenceId: IDS.disposeEvidence,
    lifecycleEventId: IDS.disposeEvent,
    predecessorEventId: IDS.createdEvent,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-09-05T10:15:30.123Z",
    latestAllowedCalendarDate: "2026-09-05",
    expectedFinancialRevision: "0",
    disposalDate: "2026-09-05",
    category: "lost_or_stolen",
    otherTreatment: null,
    notes: null,
    rateSnapshots: [],
    ...overrides,
  };
}
type DisposeServiceScope = Awaited<
  ReturnType<DisposeMetalHoldingCommandDependencies["getCurrentUserDataScope"]>
>;

function scope(userId: string = IDS.user): Promise<DisposeServiceScope> {
  return Promise.resolve({
    userId,
    queryOwned: (collection, ...clauses) =>
      collection.query(Q.where("user_id", userId), ...clauses),
    assertOwned: <T extends { userId: string }>(record: T): T => {
      if (record.userId !== userId) throw new Error("ownership_failed");
      return record;
    },
    queryChildrenOfOwnedParent: (
      collection,
      parentRecord,
      foreignKey,
      ...clauses
    ) => collection.query(Q.where(foreignKey, parentRecord.id), ...clauses),
  });
}

function createEnvelope(
  input: DisposeMetalHoldingCommandInput,
  payload: Parameters<
    DisposeMetalHoldingCommandDependencies["createEnvelope"]
  >[1],
  registry: FinancialActionRegistry = DEFAULT_FINANCIAL_ACTION_REGISTRY
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: input.actionId,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "dispose",
      occurredAt: input.occurredAt,
      payloadVersion: "metals.dispose/v1",
      userId: input.userId,
      payload,
    },
    registry,
    { latestAllowedCalendarDate: input.latestAllowedCalendarDate }
  );
}

function createService(): DisposeMetalHoldingCommandService {
  const repository = createFinancialActionFoundationRepository({
    database,
    getCurrentUserDataScope: () => scope(),
    assertExpectedCurrentUser: (expectedUserId): Promise<void> =>
      expectedUserId === IDS.user
        ? Promise.resolve()
        : Promise.reject(new Error("auth_scope_changed")),
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
  return loadService().createDisposeMetalHoldingCommandService({
    database,
    getCurrentUserDataScope: () => scope(),
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope: (input, payload) => createEnvelope(input, payload),
    hashProvider: sha256Provider,
  });
}

async function seedHolding(): Promise<void> {
  await database.write(async (): Promise<void> => {
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
      record.purchasePrice = 47800;
      record.purchasePriceDecimal = "47800";
      record.type = "METAL";
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
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
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
      record.weightGrams = 10.125;
      record.weightGramsDecimal = "10.125";
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
        record.reconciliationState = "accepted";
        record.status = "active";
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
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
        record.payloadHash = "a".repeat(64);
        record.payloadJson = "{}";
        record.rejectionCode = null;
        record.serverOutcome = null;
        record.state = "accepted";
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
        record.kind = "created";
        record.occurredAt = new Date("2024-03-14T00:00:00.000Z");
        record.payloadJson = "{}";
        record.predecessorEventId = null;
        record.reversesEventId = null;
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
        record.userId = IDS.user;
      });
  });
}

type PullRaw = { readonly id: string } & Record<string, unknown>;

function serverEvidenceRaw(domainPayloadJson: string): PullRaw {
  return {
    id: IDS.disposeAction,
    user_id: IDS.user,
    action_id: IDS.disposeAction,
    holding_id: IDS.holding,
    kind: "dispose",
    expected_holding_revision: "0",
    canonical_holding_revision: "1",
    domain_payload_json: domainPayloadJson,
    created_at: Date.parse("2026-09-05T10:15:30.123Z"),
    updated_at: SERVER_ACCEPTED_AT,
    deleted: false,
  };
}

function serverEventRaw(payloadJson: string): PullRaw {
  return {
    id: IDS.disposeAction,
    user_id: IDS.user,
    holding_id: IDS.holding,
    action_id: IDS.disposeAction,
    kind: "dispose",
    occurred_at: Date.parse("2026-09-05T10:15:30.123Z"),
    payload_json: payloadJson,
    predecessor_event_id: IDS.createdEvent,
    reverses_event_id: null,
    is_effective: true,
    is_history_visible: true,
    created_at: Date.parse("2026-09-05T10:15:30.123Z"),
    updated_at: SERVER_ACCEPTED_AT,
    deleted: false,
  };
}

async function synchronizeServerAcceptance(
  domainPayloadJson: string
): Promise<void> {
  const pullChanges = (): Promise<SyncPullResult> =>
    Promise.resolve({
      changes: {
        metal_action_evidence: {
          created: [],
          updated: [serverEvidenceRaw(domainPayloadJson)],
          deleted: [],
        },
        metal_lifecycle_events: {
          created: [],
          updated: [serverEventRaw(domainPayloadJson)],
          deleted: [],
        },
      },
      timestamp: SERVER_ACCEPTED_AT,
    });
  await synchronize({
    database,
    pullChanges,
    pushChanges: (): Promise<void> => Promise.resolve(),
    sendCreatedAsUpdated: true,
  });
}

describe("Dispose canonical evidence SQLite sync replay", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });

  it("merges server canonical pull in place through real Watermelon synchronize without UNIQUE collision", async (): Promise<void> => {
    await seedHolding();
    // Distinct legacy random local ids: the canonical writer MUST ignore
    // them and use actionId (server 068 inserts id = action_id).
    await expect(
      createService().dispose(
        command({
          actionEvidenceId: IDS.disposeEvidence,
          lifecycleEventId: IDS.disposeEvent,
        })
      )
    ).resolves.toEqual({
      kind: "committed",
      holdingId: IDS.holding,
    });
    const [localEvidence] = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    if (!localEvidence) throw new Error("missing_local_evidence");

    await expect(
      synchronizeServerAcceptance(localEvidence.domainPayloadJson)
    ).resolves.toBeUndefined();

    const evidence = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      id: IDS.disposeAction,
      actionId: IDS.disposeAction,
      holdingId: IDS.holding,
      kind: "dispose",
      userId: IDS.user,
    });
    expect(evidence[0].id).not.toBe(IDS.disposeEvidence);
    expect(evidence[0].updatedAt.getTime()).toBe(SERVER_ACCEPTED_AT);
    const history = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(history).toHaveLength(2);
    const disposeEvent = history.find(
      (event) => event.id === IDS.disposeAction
    );
    expect(disposeEvent).toMatchObject({
      actionId: IDS.disposeAction,
      holdingId: IDS.holding,
      kind: "dispose",
      isEffective: true,
      userId: IDS.user,
    });
    expect(disposeEvent?.id).not.toBe(IDS.disposeEvent);
    expect(history.every((event) => event.userId === IDS.user)).toBe(true);
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      effectiveActionId: IDS.disposeAction,
      effectiveEventId: IDS.disposeAction,
      financialRevision: "1",
      status: "disposed",
    });
  });

  it("replays the same dispose after sync without a second evidence row", async (): Promise<void> => {
    await seedHolding();
    await createService().dispose(command());
    const [localEvidence] = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    if (!localEvidence) throw new Error("missing_local_evidence");
    await synchronizeServerAcceptance(localEvidence.domainPayloadJson);

    await expect(createService().dispose(command())).resolves.toEqual({
      kind: "replay",
      holdingId: IDS.holding,
    });
    expect(
      await database
        .get<MetalActionEvidence>("metal_action_evidence")
        .query()
        .fetch()
    ).toHaveLength(1);
  });
});
