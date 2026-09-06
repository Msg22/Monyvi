import { createHash } from "node:crypto";
import { Q, type Database, type Model } from "@nozbe/watermelondb";
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
  createFinancialActionRegistry,
  type FinancialActionEnvelopeV1,
  type FinancialActionRegistry,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import {
  createFinancialActionFoundationRepository,
  type CommitFinancialActionGroupLocallyInput,
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";
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
    cairoTodayDate: "2026-09-05",
    expectedFinancialRevision: "0",
    disposalDate: "2026-09-05",
    category: "lost_stolen",
    otherTreatment: null,
    notes: null,
    ...overrides,
  };
}

function scope(
  userId: string = IDS.user
): Promise<FinancialActionUserDataScope> {
  return Promise.resolve({
    userId,
    queryOwned: (collection, ...clauses) =>
      collection.query(Q.where("user_id", userId), ...clauses),
    assertOwned: <T extends { userId: string }>(record: T): T => {
      if (record.userId !== userId) throw new Error("ownership_failed");
      return record;
    },
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
    { cairoTodayDate: input.cairoTodayDate }
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

function createRevisionZeroDisposeTestRegistry(): FinancialActionRegistry {
  return createFinancialActionRegistry(
    DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions.map((definition) =>
      definition.domain === "metals" &&
      definition.kind === "dispose" &&
      definition.payloadVersion === "metals.dispose/v1"
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
                  "disposalDate,expectedHoldingRevision,holdingId,notes,predecessorEventId,reason,reversesEventId" &&
                "holdingId" in value &&
                value.holdingId === IDS.holding &&
                "expectedHoldingRevision" in value &&
                value.expectedHoldingRevision === "0" &&
                "predecessorEventId" in value &&
                value.predecessorEventId === null &&
                "reversesEventId" in value &&
                value.reversesEventId === null
              ) {
                return Object.freeze({ ...value }) as RegisteredActionPayload;
              }
              return definition.validatePayload(value, validationInput);
            },
          }
        : definition
    )
  );
}

describe("Dispose metal holding category and consequence contract", () => {
  it.each([
    ["lost_stolen", null, "lost_stolen", "write_off"],
    ["destroyed_damaged", null, "destroyed_damaged", "write_off"],
    ["given_away", null, "given_away", "external_transfer"],
    ["donated", null, "donated", "external_transfer"],
    ["other", "write_off", "other_write_off", "write_off"],
    [
      "other",
      "external_transfer",
      "other_external_transfer",
      "external_transfer",
    ],
  ] as const)(
    "maps %s/%s to canonical reason %s and treatment %s",
    (category, otherTreatment, expectedReason, expectedTreatment): void => {
      const service = loadService();
      const reason = service.resolveDisposeReason(category, otherTreatment);
      expect(reason).toBe(expectedReason);
      expect(service.shapeDisposeMetalHoldingConsequences(reason)).toEqual({
        category,
        treatment: expectedTreatment,
        removesActiveOwnership: true,
        preservesHistory: true,
        hasSaleMoney: false,
        hasAccountEffect: false,
        hasOrdinaryIncome: false,
        hasRealizedSaleProfitLoss: false,
        recordsCostBasisWriteOff: expectedTreatment === "write_off",
        recordsExternalTransfer: expectedTreatment === "external_transfer",
      });
    }
  );

  it("requires an explicit Other treatment without classifying known categories twice", (): void => {
    const service = loadService();
    expect(() => service.resolveDisposeReason("other", null)).toThrow(
      "dispose_other_treatment_required"
    );
    expect(() =>
      service.resolveDisposeReason("lost_stolen", "write_off")
    ).toThrow("dispose_known_category_treatment_forbidden");
    expect(() =>
      service.resolveDisposeReason(
        "lost_or_stolen" as DisposeMetalHoldingCommandInput["category"],
        null
      )
    ).toThrow("dispose_category_invalid");
    expect(() =>
      service.resolveDisposeReason(
        "other",
        "unknown" as DisposeMetalHoldingCommandInput["otherTreatment"]
      )
    ).toThrow("dispose_treatment_invalid");
  });
});

describe("Dispose metal holding command SQLite lifecycle", () => {
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
      effectiveEventId: IDS.disposeEvent,
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
      reason: "lost_stolen",
      notes: null,
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
      history.find((event) => event.id === IDS.disposeEvent)
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

  it("disposes a predecessor-less revision-zero migrated holding without fabricating earlier history", async (): Promise<void> => {
    await seedHolding("active", { isMigratedRevisionZero: true });

    await expect(
      createService({
        registry: createRevisionZeroDisposeTestRegistry(),
      }).dispose(
        command({
          predecessorEventId: null,
          expectedFinancialRevision: "0",
          category: "donated",
        })
      )
    ).resolves.toEqual({ kind: "committed", holdingId: IDS.holding });

    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state).toMatchObject({
      status: "disposed",
      financialRevision: "1",
      effectiveActionId: IDS.disposeAction,
      effectiveEventId: IDS.disposeEvent,
    });
    const history = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      kind: "dispose",
      predecessorEventId: null,
      isEffective: true,
      isHistoryVisible: true,
    });
  });

  it.each([
    { isVisible: false, reconciliationState: "accepted" },
    { isVisible: true, reconciliationState: "reconciliation_incomplete" },
    { isVisible: true, reconciliationState: "pending_local" },
  ])(
    "rejects a non-effective Active projection: %o",
    async (projection): Promise<void> => {
      await seedHolding("active", projection);
      await expect(createService().dispose(command())).rejects.toThrow(
        "metal_dispose_effective_active_holding_required"
      );
      expect(
        await database.get<Model>("metal_action_evidence").query().fetch()
      ).toHaveLength(0);
    }
  );

  it("validates generated evidence IDs before attempting the local commit", async (): Promise<void> => {
    const commit = jest.fn<
      ReturnType<
        DisposeMetalHoldingCommandDependencies["commitFinancialActionGroupLocally"]
      >,
      Parameters<
        DisposeMetalHoldingCommandDependencies["commitFinancialActionGroupLocally"]
      >
    >();
    await expect(
      createService({ commit }).dispose(
        command({ actionEvidenceId: "not-a-uuid" })
      )
    ).rejects.toThrow("metal_dispose_invalid_local_id");
    await expect(
      createService({ commit }).dispose(
        command({ lifecycleEventId: IDS.disposeEvidence })
      )
    ).rejects.toThrow("metal_dispose_invalid_local_id");
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    "rejected_compensating",
    "reconciled",
    "reconciliation_incomplete",
  ] as const)(
    "does not report an unsuccessful %s root as a successful replay",
    async (state): Promise<void> => {
      const record = database
        .get<FinancialActionGroup>("financial_action_groups")
        .prepareCreate((group): void => {
          group.state = state;
        });
      const commit = jest.fn(() =>
        Promise.resolve({
          kind: "replay" as const,
          record,
        })
      );
      await expect(
        createService({ commit }).dispose(command())
      ).rejects.toThrow("metal_dispose_replay_requires_recovery");
    }
  );

  it.each(["sold", "disposed"] as const)(
    "rejects %s holdings because Dispose is active-only",
    async (status): Promise<void> => {
      await seedHolding(status);
      await expect(createService().dispose(command())).rejects.toThrow(
        "metal_holding_not_active"
      );
      expect(
        await database.get<Model>("metal_action_evidence").query().fetch()
      ).toHaveLength(0);
    }
  );

  it("rejects missing category, stale revision, foreign ownership, and future date", async (): Promise<void> => {
    await seedHolding();
    await expect(
      createService().dispose(command({ category: null }))
    ).rejects.toThrow("dispose_category_required");
    await expect(
      createService().dispose(command({ expectedFinancialRevision: "7" }))
    ).rejects.toThrow("holding_revision_conflict");
    await expect(
      createService({ userId: IDS.foreignUser }).dispose(
        command({ userId: IDS.foreignUser })
      )
    ).rejects.toThrow("metal_holding_not_found");
    await expect(
      createService().dispose(command({ disposalDate: "2026-09-06" }))
    ).rejects.toThrow("financial_action_invalid_payload");
  });

  it("rejects an auth scope change before reading the holding", async (): Promise<void> => {
    await seedHolding();
    const commit = async (
      commitInput: CommitFinancialActionGroupLocallyInput
    ): Promise<never> => {
      await commitInput.prepareLinkedOperationPlan();
      throw new Error("unexpected_commit");
    };
    await expect(
      createService({ userId: IDS.foreignUser, commit }).dispose(command())
    ).rejects.toThrow("financial_action_auth_scope_changed");
  });

  it("rejects non-metal assets and ineffective predecessor projections", async (): Promise<void> => {
    await seedHolding("active", { assetType: "CRYPTO" });
    await expect(createService().dispose(command())).rejects.toThrow(
      "metal_holding_not_found"
    );

    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    await seedHolding("active", { predecessorIsEffective: false });
    await expect(createService().dispose(command())).rejects.toThrow(
      "metal_dispose_effective_active_holding_required"
    );

    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
    await seedHolding("active", { predecessorIsHistoryVisible: false });
    await expect(createService().dispose(command())).rejects.toThrow(
      "metal_dispose_effective_active_holding_required"
    );
  });

  it("rejects a state pointer that disagrees with its predecessor event", async (): Promise<void> => {
    await seedHolding("active", { effectiveActionId: IDS.disposeAction });
    await expect(createService().dispose(command())).rejects.toThrow(
      "holding_revision_conflict"
    );
  });

  it("rejects cached rows that escape the holding ownership boundary", async (): Promise<void> => {
    await seedHolding();
    const commit = async (
      commitInput: CommitFinancialActionGroupLocallyInput
    ): Promise<never> => {
      const plan = await commitInput.prepareLinkedOperationPlan();
      const stateOperation = plan.existingOperations[0];
      if (!stateOperation) throw new Error("missing_state_operation");
      await plan.assertCachedOwnership({
        userId: IDS.user,
        cachedPreimages: [
          {
            id: IDS.state,
            kind: "update",
            table: "unexpected_table",
            raw: stateOperation.model._raw,
          },
        ],
      });
      throw new Error("unexpected_commit");
    };

    await expect(createService({ commit }).dispose(command())).rejects.toThrow(
      "metal_dispose_ownership_failed"
    );
  });

  it("replays the same action across a recreated service and rejects changed payload reuse", async (): Promise<void> => {
    await seedHolding();
    await createService().dispose(command({ notes: "Optional" }));
    await expect(
      createService().dispose(command({ notes: "Optional" }))
    ).resolves.toEqual({ kind: "replay", holdingId: IDS.holding });
    await expect(
      createService().dispose(command({ notes: "Changed" }))
    ).rejects.toThrow("action_id_payload_mismatch");
    expect(
      await database
        .get<MetalActionEvidence>("metal_action_evidence")
        .query()
        .fetch()
    ).toHaveLength(1);
  });

  it("rolls back the entire local group on batch failure and safely retries with the same action", async (): Promise<void> => {
    await seedHolding();
    const batch = jest
      .spyOn(database, "batch")
      .mockRejectedValueOnce(new Error("disk_full"));
    await expect(createService().dispose(command())).rejects.toThrow(
      "disk_full"
    );
    expect(
      await database.get<Model>("metal_action_evidence").query().fetch()
    ).toHaveLength(0);
    const history = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: IDS.createdEvent,
      isEffective: true,
      isHistoryVisible: true,
    });
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .query()
          .fetch()
      )[0]
    ).toMatchObject({ status: "active", financialRevision: "0" });

    batch.mockRestore();
    await expect(createService().dispose(command())).resolves.toMatchObject({
      kind: "committed",
    });
  });
});
