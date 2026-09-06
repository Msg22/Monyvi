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
  createFinancialActionRegistry,
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
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string | null;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly cairoTodayDate: string;
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
  deleteEvidence: "018f0c7a-1234-7abc-8def-000000000213",
  deleteEvent: "018f0c7a-1234-7abc-8def-000000000214",
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
    actionEvidenceId: IDS.deleteEvidence,
    lifecycleEventId: IDS.deleteEvent,
    predecessorEventId: IDS.correctionEvent,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-09-05T10:15:30.123Z",
    cairoTodayDate: "2026-09-05",
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
    { cairoTodayDate: input.cairoTodayDate }
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

function createRevisionZeroDeleteTestRegistry(): FinancialActionRegistry {
  return createFinancialActionRegistry(
    DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions.map((definition) =>
      definition.domain === "metals" &&
      definition.kind === "delete" &&
      definition.payloadVersion === "metals.delete/v1"
        ? {
            ...definition,
            validatePayload: (
              value,
              validationInput
            ): RegisteredActionPayload => {
              if (
                typeof value === "object" &&
                value !== null &&
                Object.keys(value).sort().join(",") ===
                  "expectedHoldingRevision,holdingId,predecessorEventId,reversesEventId" &&
                "holdingId" in value &&
                value.holdingId === IDS.holding &&
                "expectedHoldingRevision" in value &&
                value.expectedHoldingRevision === "0" &&
                "predecessorEventId" in value &&
                value.predecessorEventId === null &&
                "reversesEventId" in value &&
                value.reversesEventId === null
              ) {
                return Object.freeze({
                  expectedHoldingRevision: "0",
                  holdingId: IDS.holding,
                  predecessorEventId: null,
                  reversesEventId: null,
                });
              }
              return definition.validatePayload(value, validationInput);
            },
          }
        : definition
    )
  );
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

describe("Delete metal holding command SQLite atomicity", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    jest.restoreAllMocks();
  });

  it("hides only an effective Active holding in one grouped action while retaining non-effective audit evidence", async (): Promise<void> => {
    await seedHolding();

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
    expect(events.every((event) => !event.isEffective)).toBe(true);
    expect(events.every((event) => !event.isHistoryVisible)).toBe(true);
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
      canonicalHoldingRevision: "2",
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

  it("deletes a predecessor-less revision-zero migrated Active holding without fabricating prior lifecycle evidence", async (): Promise<void> => {
    await seedHolding("active", true);

    await expect(
      createService(database, createRevisionZeroDeleteTestRegistry()).delete(
        command({
          predecessorEventId: null,
          expectedFinancialRevision: "0",
        })
      )
    ).resolves.toEqual({ kind: "committed" });

    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state).toMatchObject({
      financialRevision: "1",
      effectiveActionId: IDS.deleteAction,
      effectiveEventId: IDS.deleteEvent,
      isVisible: false,
    });
    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "delete",
      predecessorEventId: null,
      isEffective: false,
      isHistoryVisible: false,
    });
  });

  it.each(["bad-id", IDS.deleteEvidence] as const)(
    "rejects malformed or duplicate generated persistence IDs before the local commit: %s",
    async (lifecycleEventId): Promise<void> => {
      await seedHolding();

      await expect(
        createService().delete(command({ lifecycleEventId }))
      ).rejects.toThrow("metal_delete_invalid_local_id");
      expect(
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch()
      ).toHaveLength(2);
      expect(
        await database
          .get<MetalActionEvidence>("metal_action_evidence")
          .query()
          .fetch()
      ).toHaveLength(2);
    }
  );

  it("creates zero sale, disposal, proceeds, P/L, write-off, transfer, rate, transaction, or account effect", async (): Promise<void> => {
    await seedHolding();
    const accountBefore = await database
      .get<Account>("accounts")
      .find(IDS.account);
    expect(accountBefore.balance).toBe(2500);

    await createService().delete(command());

    expect(
      (await database.get<Account>("accounts").find(IDS.account)).balance
    ).toBe(2500);
    expect(await database.get<Model>("transactions").query().fetch()).toEqual(
      []
    );
    expect(await database.get<Model>("transfers").query().fetch()).toEqual([]);
    expect(
      await database.get<Model>("metal_rate_references").query().fetch()
    ).toEqual([]);
    const payload = JSON.parse(
      (
        await database
          .get<MetalActionEvidence>("metal_action_evidence")
          .query(Q.where("action_id", IDS.deleteAction))
          .fetch()
      )[0].domainPayloadJson
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "expectedHoldingRevision",
      "holdingId",
      "predecessorEventId",
      "reversesEventId",
    ]);
    expect(JSON.stringify(payload)).not.toMatch(
      /sale|dispos|proceeds|profit|loss|write.?off|transfer|account/i
    );
  });

  it("survives database restart with hidden state and complete sync evidence but no normal History", async (): Promise<void> => {
    await seedHolding();
    await createService().delete(command());

    const reopened = await openFreshDatabase();
    const state = await reopened
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    const events = await reopened
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    const evidence = await reopened
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    expect(state).toMatchObject({
      isVisible: false,
      status: "active",
      financialRevision: "2",
      reconciliationState: "sync_pending",
      deleted: false,
    });
    expect(events).toHaveLength(3);
    expect(events.every((event) => !event.isHistoryVisible)).toBe(true);
    expect(events.every((event) => !event.deleted)).toBe(true);
    expect(evidence).toHaveLength(3);
    expect(evidence.every((item) => !item.deleted)).toBe(true);
    expect(
      (await reopened.get<Asset>("assets").find(IDS.holding)).deleted
    ).toBe(false);
  });

  it.each(["sold", "disposed"] as const)(
    "rejects a %s holding and preserves Undo as the only recovery path",
    async (status): Promise<void> => {
      await seedHolding(status);
      await expect(createService().delete(command())).rejects.toThrow(
        "metal_delete_effective_active_holding_required"
      );
      expect(
        await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query()
          .fetch()
      ).toHaveLength(2);
      expect(
        (
          await database
            .get<MetalHoldingState>("metal_holding_states")
            .find(IDS.state)
        ).isVisible
      ).toBe(true);
    }
  );

  it.each([
    ["hidden", { isVisible: false, reconciliationState: "local_complete" }],
    [
      "incomplete",
      { isVisible: true, reconciliationState: "reconciliation_incomplete" },
    ],
  ] as const)(
    "rejects a non-effective Active projection: %s",
    async (_name, projection): Promise<void> => {
      await seedHolding();
      await database.write(async (): Promise<void> => {
        await (
          await database
            .get<MetalHoldingState>("metal_holding_states")
            .find(IDS.state)
        ).update((record): void => {
          record.isVisible = projection.isVisible;
          record.reconciliationState = projection.reconciliationState;
        });
      });
      await expect(createService().delete(command())).rejects.toThrow(
        "metal_delete_effective_active_holding_required"
      );
      expect(
        await database
          .get<MetalActionEvidence>("metal_action_evidence")
          .query()
          .fetch()
      ).toHaveLength(2);
    }
  );

  it("replays exactly once after service recreation and rejects a hash mismatch", async (): Promise<void> => {
    await seedHolding();
    await createService().delete(command());
    await expect(createService().delete(command())).resolves.toEqual({
      kind: "replay",
    });
    await expect(
      createService().delete(command({ predecessorEventId: IDS.createdEvent }))
    ).rejects.toThrow("action_id_payload_mismatch");
    expect(
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).toHaveLength(3);
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(3);
  });

  it.each([
    "rejected_compensating",
    "reconciliation_incomplete",
    "reconciled",
  ] as const)(
    "does not report an unsuccessful %s action root as a successful replay",
    async (rootState): Promise<void> => {
      await seedHolding();
      await createService().delete(command());
      await database.write(async (): Promise<void> => {
        const [root] = await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query(Q.where("action_id", IDS.deleteAction))
          .fetch();
        await root.update((record): void => {
          record.state = rootState;
        });
      });

      await expect(createService().delete(command())).rejects.toThrow(
        "metal_delete_replay_requires_recovery"
      );
      expect(
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .query()
          .fetch()
      ).toHaveLength(3);
    }
  );

  it("rolls back every local projection and permits an idempotent retry after a batch failure", async (): Promise<void> => {
    await seedHolding();
    const batch = jest
      .spyOn(database, "batch")
      .mockRejectedValueOnce(new Error("fixture_sqlite_failure"));
    const service = createService();

    await expect(service.delete(command())).rejects.toThrow(
      "fixture_sqlite_failure"
    );
    batch.mockRestore();
    expect(
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).toHaveLength(2);
    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state).toMatchObject({
      isVisible: true,
      effectiveActionId: IDS.correctionAction,
      effectiveEventId: IDS.correctionEvent,
      financialRevision: "1",
    });
    expect(
      (
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .find(IDS.correctionEvent)
      ).isEffective
    ).toBe(true);

    await expect(service.delete(command())).resolves.toEqual({
      kind: "committed",
    });
  });

  it("rejects a foreign-owned holding before any grouped write", async (): Promise<void> => {
    await seedHolding();
    await database.write(async (): Promise<void> => {
      await (
        await database.get<Asset>("assets").find(IDS.holding)
      ).update((record): void => {
        record.userId = IDS.foreignUser;
      });
    });

    await expect(createService().delete(command())).rejects.toThrow(
      "ownership_failed"
    );
    expect(
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).toHaveLength(2);
  });
});
