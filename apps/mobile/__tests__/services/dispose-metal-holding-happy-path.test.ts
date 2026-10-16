import { createHash } from "node:crypto";
import { Q, type Database } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  AssetMetal,
  AssetType,
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
  DisposeReason,
} from "../../services/dispose-metal-holding-command-service";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
}

interface DisposeServiceModule {
  readonly createDisposeMetalHoldingCommandService: (
    dependencies: DisposeMetalHoldingCommandDependencies
  ) => DisposeMetalHoldingCommandService;
  readonly resolveDisposeReason: (
    category: DisposeMetalHoldingCommandInput["category"],
    otherTreatment: DisposeMetalHoldingCommandInput["otherTreatment"]
  ) => DisposeReason;
  readonly shapeDisposeMetalHoldingConsequences: (
    reason: DisposeReason
  ) => Readonly<Record<string, unknown>>;
}

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  foreignUser: "018f0c7a-1234-7abc-8def-000000000099",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  state: "018f0c7a-1234-7abc-8def-000000000004",
  createdAction: "018f0c7a-1234-7abc-8def-000000000005",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000006",
  disposeAction: "018f0c7a-1234-7abc-8def-000000000010",
  disposeEvidence: "018f0c7a-1234-7abc-8def-000000000011",
  disposeEvent: "018f0c7a-1234-7abc-8def-000000000012",
  conflictingDisposeEventA: "018f0c7a-1234-7abc-8def-000000000013",
  conflictingDisposeEventB: "018f0c7a-1234-7abc-8def-000000000014",
  deleteAction: "018f0c7a-1234-7abc-8def-000000000015",
  deleteEvent: "018f0c7a-1234-7abc-8def-000000000016",
  terminalHeadAction: "018f0c7a-1234-7abc-8def-000000000017",
  terminalHeadEvent: "018f0c7a-1234-7abc-8def-000000000018",
} as const;

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
  return {
    database: new WatermelonDatabase({ adapter, modelClasses }),
    __adapter: adapter,
  };
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

function createService(
  options: {
    readonly userId?: string;
    readonly commit?: DisposeMetalHoldingCommandDependencies["commitFinancialActionGroupLocally"];
    readonly registry?: FinancialActionRegistry;
  } = {}
): DisposeMetalHoldingCommandService {
  const userId = options.userId ?? IDS.user;
  const registry = options.registry ?? DEFAULT_FINANCIAL_ACTION_REGISTRY;
  const repository = createFinancialActionFoundationRepository({
    database,
    getCurrentUserDataScope: () => scope(userId),
    assertExpectedCurrentUser: (expectedUserId): Promise<void> =>
      expectedUserId === userId
        ? Promise.resolve()
        : Promise.reject(new Error("auth_scope_changed")),
    registry,
  });
  return loadService().createDisposeMetalHoldingCommandService({
    database,
    getCurrentUserDataScope: () => scope(userId),
    commitFinancialActionGroupLocally:
      options.commit ?? repository.commitFinancialActionGroupLocally,
    createEnvelope: (input, payload) =>
      createEnvelope(input, payload, registry),
    hashProvider: sha256Provider,
  });
}

async function seedHolding(
  status: "active" | "sold" | "disposed" = "active",
  options: {
    readonly assetType?: AssetType;
    readonly effectiveActionId?: string | null;
    readonly isMigratedRevisionZero?: boolean;
    readonly isVisible?: boolean;
    readonly predecessorIsEffective?: boolean;
    readonly predecessorIsHistoryVisible?: boolean;
    readonly reconciliationState?: string;
    readonly rootState?: string;
  } = {}
): Promise<void> {
  const isMigratedRevisionZero = options.isMigratedRevisionZero ?? false;
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
      record.type = options.assetType ?? "METAL";
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
        record.effectiveActionId =
          options.effectiveActionId ??
          (isMigratedRevisionZero ? null : IDS.createdAction);
        record.effectiveEventId = isMigratedRevisionZero
          ? null
          : IDS.createdEvent;
        record.financialRevision = "0";
        record.holdingId = IDS.holding;
        record.isVisible = options.isVisible ?? true;
        record.reconciliationState = options.reconciliationState ?? "accepted";
        record.status = status;
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
        record.userId = IDS.user;
      });
    if (!isMigratedRevisionZero) {
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
          record.state = options.rootState ?? "accepted";
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
          record.isEffective = options.predecessorIsEffective ?? true;
          record.isHistoryVisible = options.predecessorIsHistoryVisible ?? true;
          record.kind = "created";
          record.occurredAt = new Date("2024-03-14T00:00:00.000Z");
          record.payloadJson = "{}";
          record.predecessorEventId = null;
          record.reversesEventId = null;
          record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
          record.userId = IDS.user;
        });
    }
  });
}

describe("Dispose metal holding command SQLite happy-path and legacy", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });

  it("commits an offline whole-holding write-off with exact immutable evidence and no account or sale effect", async (): Promise<void> => {
    await seedHolding();
    await expect(createService().dispose(command())).resolves.toEqual({
      kind: "committed",
      holdingId: IDS.holding,
    });

    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      status: "disposed",
      isVisible: true,
      effectiveActionId: IDS.disposeAction,
      effectiveEventId: IDS.disposeAction,
      financialRevision: "1",
      reconciliationState: "sync_pending",
    });
    const evidence = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      actionId: IDS.disposeAction,
      holdingId: IDS.holding,
      kind: "dispose",
      expectedHoldingRevision: "0",
      canonicalHoldingRevision: "1",
      userId: IDS.user,
    });
    const payload = {
      holdingId: IDS.holding,
      expectedHoldingRevision: "0",
      predecessorEventId: IDS.createdEvent,
      reversesEventId: null,
      disposalDate: "2026-09-05",
      reason: "lost_or_stolen",
      notes: null,
      rateSnapshots: [],
    };
    expect(JSON.parse(evidence[0].domainPayloadJson)).toEqual(payload);
    const history = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(history).toHaveLength(2);
    expect(
      history.find((event) => event.id === IDS.createdEvent)?.isEffective
    ).toBe(true);
    expect(
      history.find((event) => event.id === IDS.disposeAction)
    ).toMatchObject({
      actionId: IDS.disposeAction,
      holdingId: IDS.holding,
      kind: "dispose",
      predecessorEventId: IDS.createdEvent,
      reversesEventId: null,
      isEffective: true,
      isHistoryVisible: true,
      payloadJson: JSON.stringify(payload),
      userId: IDS.user,
    });
  });

  it("records external transfer and optional Unicode notes without sale proceeds or account guards", async (): Promise<void> => {
    await seedHolding();
    const observedEnvelopes: FinancialActionEnvelopeV1[] = [];
    const repository = createFinancialActionFoundationRepository({
      database,
      getCurrentUserDataScope: () => scope(),
      assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
    });
    const service = loadService().createDisposeMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () => scope(),
      createEnvelope: (input, payload) => {
        const envelope = createEnvelope(input, payload);
        observedEnvelopes.push(envelope);
        return envelope;
      },
      hashProvider: sha256Provider,
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
    });
    await service.dispose(
      command({
        category: "other",
        otherTreatment: "external_transfer",
        notes: "هدية 🎁",
      })
    );
    expect(observedEnvelopes).toHaveLength(1);
    expect(observedEnvelopes[0]).toMatchObject({
      accountGuards: [],
      kind: "dispose",
      payload: {
        reason: "other_external_transfer",
        notes: "هدية 🎁",
      },
    });
  });

  it("permits a second Dispose after canonical Undo of a proven revision-zero legacy Dispose", async (): Promise<void> => {
    await seedHolding("active", { isMigratedRevisionZero: true });
    const originalAction = IDS.terminalHeadAction;
    const originalEvent = IDS.terminalHeadEvent;
    const undoAction = IDS.deleteAction;
    const originalAt = "2026-09-04T10:00:00.000Z";
    const undoAt = "2026-09-04T11:00:00.000Z";
    const originalPayload = {
      disposalDate: "2026-09-04",
      expectedHoldingRevision: "0",
      holdingId: IDS.holding,
      notes: null,
      predecessorEventId: null,
      reason: "given_away",
      reversesEventId: null,
    };
    const undoPayload = {
      expectedHoldingRevision: "1",
      holdingId: IDS.holding,
      predecessorEventId: originalAction,
      reversesEventId: originalAction,
    };
    await database.write(async (): Promise<void> => {
      for (const action of [
        {
          id: originalAction,
          kind: "dispose",
          at: originalAt,
          version: "metals.dispose/v1",
          payload: originalPayload,
          eventId: originalEvent,
          expectedRevision: "0",
          canonicalRevision: "1",
        },
        {
          id: undoAction,
          kind: "undo",
          at: undoAt,
          version: "metals.undo/v1",
          payload: undoPayload,
          eventId: undoAction,
          expectedRevision: "1",
          canonicalRevision: "2",
        },
      ]) {
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .create((record): void => {
            record._raw.id = action.id;
            record.actionId = action.id;
            record.accountGuardsJson = "[]";
            record.deleted = false;
            record.domain = "metals";
            record.domainReferenceId = IDS.holding;
            record.kind = action.kind;
            record.outcomeJson = null;
            record.payloadJson = JSON.stringify({
              accountGuards: [],
              actionId: action.id,
              domain: "metals",
              domainReferenceId: IDS.holding,
              envelopeVersion: "monyvi.financial-action/v1",
              kind: action.kind,
              occurredAt: action.at,
              payload: action.payload,
              payloadVersion: action.version,
              userId: IDS.user,
            });
            record.payloadHash = "a".repeat(64);
            record.state = "local_complete";
            record.updatedAt = new Date(action.at);
            record.userId = IDS.user;
          });
        await database
          .get<MetalActionEvidence>("metal_action_evidence")
          .create((record): void => {
            record._raw.id = action.id;
            record.actionId = action.id;
            record.canonicalHoldingRevision = action.canonicalRevision;
            record.deleted = false;
            record.domainPayloadJson = JSON.stringify(action.payload);
            record.expectedHoldingRevision = action.expectedRevision;
            record.holdingId = IDS.holding;
            record.kind = action.kind;
            record.updatedAt = new Date(action.at);
            record.userId = IDS.user;
          });
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .create((record): void => {
            record._raw.id = action.eventId;
            record.actionId = action.id;
            record.deleted = false;
            record.holdingId = IDS.holding;
            record.isEffective = true;
            record.isHistoryVisible = true;
            record.kind = action.kind;
            record.occurredAt = new Date(action.at);
            record.payloadJson = JSON.stringify(action.payload);
            record.predecessorEventId = action.payload.predecessorEventId;
            record.reversesEventId = action.payload.reversesEventId;
            record.updatedAt = new Date(action.at);
            record.userId = IDS.user;
          });
      }
      await (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .find(IDS.state)
      ).update((record): void => {
        record.effectiveActionId = undoAction;
        record.effectiveEventId = undoAction;
        record.financialRevision = "2";
        record.status = "active";
        record.reconciliationState = "accepted";
      });
    });
    await expect(
      createService().dispose(
        command({
          predecessorEventId: undoAction,
          expectedFinancialRevision: "2",
        })
      )
    ).resolves.toEqual({ kind: "committed", holdingId: IDS.holding });
    const resultingState = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(resultingState.status).toBe("disposed");
    expect(resultingState.financialRevision).toBe("3");
    const original = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .find(originalEvent);
    expect(original.id).toBe(originalEvent);
    expect(original.actionId).toBe(originalAction);
  });
});
