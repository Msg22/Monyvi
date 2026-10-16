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
} from "@monyvi/db";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type FinancialActionRegistry,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import {
  createFinancialActionFoundationRepository,
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";

interface DeleteMetalHoldingCommandInput {
  readonly actionId: string;
  readonly predecessorEventId: string | null;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly latestAllowedCalendarDate: string;
  readonly expectedFinancialRevision: string;
}

interface DeleteMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly commitFinancialActionGroupLocally: ReturnType<
    typeof createFinancialActionFoundationRepository
  >["commitFinancialActionGroupLocally"];
  readonly createEnvelope: (
    input: DeleteMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

interface DeleteMetalHoldingCommandService {
  readonly delete: (
    input: DeleteMetalHoldingCommandInput
  ) => Promise<{ readonly kind: "committed" | "replay" }>;
}

interface DeleteCommandModule {
  readonly DELETE_REVISION_CONFLICT_CODE: string;
  readonly createDeleteMetalHoldingCommandService: (
    dependencies: DeleteMetalHoldingCommandDependencies
  ) => DeleteMetalHoldingCommandService;
}

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: ReadonlyArray<typeof Model>;
}

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000203",
  foreignUser: "018f0c7a-1234-7abc-8def-000000000204",
  holding: "018f0c7a-1234-7abc-8def-000000000202",
  state: "018f0c7a-1234-7abc-8def-000000000205",
  createdAction: "018f0c7a-1234-7abc-8def-000000000206",
  createdEvidence: "018f0c7a-1234-7abc-8def-000000000207",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000208",
  correctionAction: "018f0c7a-1234-7abc-8def-000000000209",
  correctionEvidence: "018f0c7a-1234-7abc-8def-000000000210",
  correctionEvent: "018f0c7a-1234-7abc-8def-000000000211",
  deleteAction: "018f0c7a-1234-7abc-8def-000000000212",
  deleteEvidence: "018f0c7a-1234-7abc-8def-000000000212",
  deleteEvent: "018f0c7a-1234-7abc-8def-000000000212",
  account: "018f0c7a-1234-7abc-8def-000000000215",
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
    "Transfer",
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

const { database, __adapter: adapter } =
  jest.requireMock<TestDatabaseModule>("@monyvi/db");
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

function loadCommandModule(): DeleteCommandModule {
  return jest.requireActual<DeleteCommandModule>(
    "../../services/delete-metal-holding-command-service"
  );
}

function command(
  overrides: Partial<DeleteMetalHoldingCommandInput> = {}
): DeleteMetalHoldingCommandInput {
  return {
    actionId: IDS.deleteAction,
    predecessorEventId: IDS.correctionEvent,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-09-05T10:15:30.123Z",
    latestAllowedCalendarDate: "2026-09-05",
    expectedFinancialRevision: "1",
    ...overrides,
  };
}

function createEnvelope(
  input: DeleteMetalHoldingCommandInput,
  payload: RegisteredActionPayload,
  registry: FinancialActionRegistry = DEFAULT_FINANCIAL_ACTION_REGISTRY
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: input.actionId,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "delete",
      occurredAt: input.occurredAt,
      payloadVersion: "metals.delete/v1",
      userId: input.userId,
      payload,
    },
    registry,
    { latestAllowedCalendarDate: input.latestAllowedCalendarDate }
  );
}

function createService(
  db: Database = database,
  registry: FinancialActionRegistry = DEFAULT_FINANCIAL_ACTION_REGISTRY
): DeleteMetalHoldingCommandService {
  const repository = createFinancialActionFoundationRepository({
    database: db,
    getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
      Promise.resolve(mockScopeValue()),
    assertExpectedCurrentUser: (): Promise<void> => Promise.resolve(),
    registry,
  });
  return loadCommandModule().createDeleteMetalHoldingCommandService({
    database: db,
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope: (input, payload) =>
      createEnvelope(input, payload, registry),
    hashProvider: sha256Provider,
  });
}

async function seedActionRoot(
  actionId: string,
  evidenceId: string,
  eventId: string,
  kind: "add" | "correct",
  eventKind: "created" | "corrected",
  predecessorEventId: string | null,
  financialRevision: string,
  isEffective: boolean
): Promise<void> {
  await database
    .get<FinancialActionGroup>("financial_action_groups")
    .create((record): void => {
      record._raw.id = actionId;
      record.accountGuardsJson = "[]";
      record.actionId = actionId;
      record.deleted = false;
      record.domain = "metals";
      record.domainReferenceId = IDS.holding;
      record.kind = kind;
      record.outcomeJson = null;
      record.payloadHash = "0".repeat(64);
      record.payloadJson = "{}";
      record.rejectionCode = null;
      record.serverOutcome = null;
      record.state = "local_complete";
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
      record.userId = IDS.user;
    });
  await database
    .get<MetalActionEvidence>("metal_action_evidence")
    .create((record): void => {
      record._raw.id = evidenceId;
      record.actionId = actionId;
      record.canonicalHoldingRevision = financialRevision;
      record.deleted = false;
      record.domainPayloadJson = "{}";
      record.expectedHoldingRevision = null;
      record.holdingId = IDS.holding;
      record.kind = kind;
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
      record.userId = IDS.user;
    });
  await database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .create((record): void => {
      record._raw.id = eventId;
      record.actionId = actionId;
      record.deleted = false;
      record.holdingId = IDS.holding;
      record.isEffective = isEffective;
      record.isHistoryVisible = true;
      record.kind = eventKind;
      record.occurredAt = new Date("2026-09-04T10:00:00.000Z");
      record.payloadJson = "{}";
      record.predecessorEventId = predecessorEventId;
      record.reversesEventId = null;
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
      record.userId = IDS.user;
    });
}

async function seedHolding(
  status: "active" | "sold" | "disposed" = "active",
  isRevisionZeroLegacy = false
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
      record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
      record.userId = IDS.user;
    });
    await database.get<Asset>("assets").create((record): void => {
      record._raw.id = IDS.holding;
      record.acquisitionActionId = isRevisionZeroLegacy
        ? null
        : IDS.createdAction;
      record.currency = "EGP";
      record.deleted = false;
      record.isLiquid = true;
      record.name = "Wedding coin";
      record.notes = "Corrected receipt";
      record.purchaseCurrency = "EGP";
      record.purchaseDate = new Date("2024-03-14T00:00:00.000Z");
      record.purchasePrice = 151278.2;
      record.purchasePriceDecimal = "151278.2";
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
      record.weightGrams = 31.125;
      record.weightGramsDecimal = "31.125";
    });
    if (!isRevisionZeroLegacy) {
      await seedActionRoot(
        IDS.createdAction,
        IDS.createdEvidence,
        IDS.createdEvent,
        "add",
        "created",
        null,
        "0",
        false
      );
      await seedActionRoot(
        IDS.correctionAction,
        IDS.correctionEvidence,
        IDS.correctionEvent,
        "correct",
        "corrected",
        IDS.createdEvent,
        "1",
        true
      );
    }
    await database
      .get<MetalHoldingState>("metal_holding_states")
      .create((record): void => {
        record._raw.id = IDS.state;
        record.deleted = false;
        record.effectiveActionId = isRevisionZeroLegacy
          ? null
          : IDS.correctionAction;
        record.effectiveEventId = isRevisionZeroLegacy
          ? null
          : IDS.correctionEvent;
        record.financialRevision = isRevisionZeroLegacy ? "0" : "1";
        record.holdingId = IDS.holding;
        record.isVisible = true;
        record.reconciliationState = "local_complete";
        record.status = status;
        record.updatedAt = new Date("2026-09-04T10:00:00.000Z");
        record.userId = IDS.user;
      });
  });
}

describe("Delete metal holding command SQLite happy-path and legacy", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });

  it("hides only an effective Active holding in one grouped action while retaining non-effective audit evidence", async (): Promise<void> => {
    await seedHolding();
    const priorEventUpdatedAt = (
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .find(IDS.correctionEvent)
    ).updatedAt;

    await expect(createService().delete(command())).resolves.toEqual({
      kind: "committed",
    });

    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state).toMatchObject({
      status: "active",
      isVisible: false,
      financialRevision: "2",
      effectiveActionId: IDS.deleteAction,
      effectiveEventId: IDS.deleteEvent,
      reconciliationState: "sync_pending",
      deleted: false,
    });
    expect(
      (await database.get<Asset>("assets").find(IDS.holding)).deleted
    ).toBe(false);
    expect(
      (await database.get<AssetMetal>("asset_metals").query().fetch())[0]
        .deleted
    ).toBe(false);

    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(Q.sortBy("occurred_at", Q.asc))
      .fetch();
    expect(events).toHaveLength(3);
    expect(events.every((event) => !event.deleted)).toBe(true);
    expect(
      events.find((event) => event.id === IDS.correctionEvent)?.isEffective
    ).toBe(true);
    expect(
      events.find((event) => event.id === IDS.correctionEvent)?.updatedAt
    ).toEqual(priorEventUpdatedAt);
    expect(
      events.find((event) => event.id === IDS.deleteEvent)?.isEffective
    ).toBe(false);
    expect(
      events.find((event) => event.id === IDS.createdEvent)?.isHistoryVisible
    ).toBe(true);
    expect(
      events.find((event) => event.id === IDS.correctionEvent)?.isHistoryVisible
    ).toBe(true);
    expect(events.find((event) => event.id === IDS.deleteEvent)).toMatchObject({
      actionId: IDS.deleteAction,
      kind: "delete",
      predecessorEventId: IDS.correctionEvent,
      reversesEventId: null,
    });

    const roots = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    expect(roots).toHaveLength(3);
    expect(
      roots.find((root) => root.actionId === IDS.deleteAction)
    ).toMatchObject({
      kind: "delete",
      accountGuardsJson: "[]",
      outcomeJson: null,
      state: "local_complete",
      deleted: false,
    });
    const deleteEvidence = (
      await database
        .get<MetalActionEvidence>("metal_action_evidence")
        .query(Q.where("action_id", IDS.deleteAction))
        .fetch()
    )[0];
    expect(deleteEvidence).toMatchObject({
      canonicalHoldingRevision: null,
      expectedHoldingRevision: "1",
      kind: "delete",
      deleted: false,
    });
    expect(JSON.parse(deleteEvidence.domainPayloadJson)).toEqual({
      expectedHoldingRevision: "1",
      holdingId: IDS.holding,
      predecessorEventId: IDS.correctionEvent,
      reversesEventId: null,
    });
  });

  it("allows Delete of an Active holding restored from a verified legacy Dispose E!=D", async (): Promise<void> => {
    await seedHolding("active", true);
    const originalAction = IDS.createdAction;
    const originalEvent = IDS.createdEvent;
    const undoAction = IDS.correctionAction;
    const originalAt = "2026-09-04T10:00:00.000Z";
    const undoAt = "2026-09-04T11:00:00.000Z";
    const originalPayload = {
      disposalDate: "2026-09-04",
      expectedHoldingRevision: "0",
      holdingId: IDS.holding,
      notes: null,
      predecessorEventId: null,
      reason: "donated",
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
          eventId: originalEvent,
          at: originalAt,
          kind: "dispose",
          version: "metals.dispose/v1",
          payload: originalPayload,
          expectedRevision: "0",
          canonicalRevision: "1",
        },
        {
          id: undoAction,
          eventId: undoAction,
          at: undoAt,
          kind: "undo",
          version: "metals.undo/v1",
          payload: undoPayload,
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
            record.payloadHash = "a".repeat(64);
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
      createService().delete(
        command({
          predecessorEventId: undoAction,
          expectedFinancialRevision: "2",
        })
      )
    ).resolves.toEqual({ kind: "committed" });
    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state.financialRevision).toBe("3");
    expect(state.isVisible).toBe(false);
    const original = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .find(originalEvent);
    expect(original.id).toBe(originalEvent);
    expect(original.actionId).toBe(originalAction);
  });
});
