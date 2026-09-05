import { createHash } from "node:crypto";

import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import type {
  Asset,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import {
  createFinancialActionFoundationRepository,
  type CommitFinancialActionGroupLocallyInput,
  type CommitFinancialActionGroupLocallyResult,
  type FinancialActionLinkedOperationPlan,
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";
import type {
  UndoMetalHoldingCommandDependencies,
  UndoMetalHoldingCommandInput,
  UndoMetalHoldingCommandService,
  UndoMetalHoldingConsequences,
} from "../../services/undo-metal-holding-command-service";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: Array<typeof Model>;
}

interface UndoServiceModule {
  readonly createUndoMetalHoldingCommandService: (
    dependencies: UndoMetalHoldingCommandDependencies
  ) => UndoMetalHoldingCommandService;
  readonly shapeUndoMetalHoldingConsequences: (
    terminalKind: "sell" | "dispose"
  ) => UndoMetalHoldingConsequences;
}

type Commit = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;

const IDS = {
  user: "018f0c7a-1234-7abc-8def-000000000003",
  foreignUser: "018f0c7a-1234-7abc-8def-000000000099",
  holding: "018f0c7a-1234-7abc-8def-000000000002",
  state: "018f0c7a-1234-7abc-8def-000000000004",
  createdAction: "018f0c7a-1234-7abc-8def-000000000005",
  createdEvent: "018f0c7a-1234-7abc-8def-000000000006",
  terminalAction: "018f0c7a-1234-7abc-8def-000000000010",
  terminalEvidence: "018f0c7a-1234-7abc-8def-000000000011",
  terminalEvent: "018f0c7a-1234-7abc-8def-000000000012",
  undoAction: "018f0c7a-1234-7abc-8def-000000000020",
  undoEvidence: "018f0c7a-1234-7abc-8def-000000000021",
  undoEvent: "018f0c7a-1234-7abc-8def-000000000022",
  secondTerminalAction: "018f0c7a-1234-7abc-8def-000000000030",
  secondTerminalEvidence: "018f0c7a-1234-7abc-8def-000000000031",
  secondTerminalEvent: "018f0c7a-1234-7abc-8def-000000000032",
  secondUndoAction: "018f0c7a-1234-7abc-8def-000000000040",
  secondUndoEvidence: "018f0c7a-1234-7abc-8def-000000000041",
  secondUndoEvent: "018f0c7a-1234-7abc-8def-000000000042",
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
    "FinancialActionGroup",
    "MetalActionEvidence",
    "MetalHoldingState",
    "MetalLifecycleEvent",
  ].map(
    (name) =>
      jest.requireActual<Record<string, typeof Model>>(
        `../../../../packages/db/src/models/${name}`
      )[name]
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

function loadServiceModule(): UndoServiceModule {
  return jest.requireActual<UndoServiceModule>(
    "../../services/undo-metal-holding-command-service"
  );
}

function command(
  overrides: Partial<UndoMetalHoldingCommandInput> = {}
): UndoMetalHoldingCommandInput {
  return {
    actionId: IDS.undoAction,
    actionEvidenceId: IDS.undoEvidence,
    lifecycleEventId: IDS.undoEvent,
    predecessorEventId: IDS.terminalEvent,
    reversesEventId: IDS.terminalEvent,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-09-05T12:00:00.000Z",
    expectedFinancialRevision: "1",
    ...overrides,
  };
}

function userScope(userId: string): Promise<FinancialActionUserDataScope> {
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
  input: UndoMetalHoldingCommandInput,
  payload: RegisteredActionPayload
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      actionId: input.actionId,
      accountGuards: [],
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "undo",
      occurredAt: input.occurredAt,
      payloadVersion: "metals.undo/v1",
      userId: input.userId,
      payload,
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY
  );
}

function createService(
  options: {
    readonly scopedDatabase?: Database;
    readonly userId?: string;
    readonly inspectPlan?: (plan: FinancialActionLinkedOperationPlan) => void;
    readonly commit?: Commit;
  } = {}
): UndoMetalHoldingCommandService {
  const scopedDatabase = options.scopedDatabase ?? database;
  const userId = options.userId ?? IDS.user;
  const getCurrentUserDataScope = (): Promise<FinancialActionUserDataScope> =>
    userScope(userId);
  const repository = createFinancialActionFoundationRepository({
    database: scopedDatabase,
    getCurrentUserDataScope,
    assertExpectedCurrentUser: (expectedUserId): Promise<void> =>
      expectedUserId === userId
        ? Promise.resolve()
        : Promise.reject(new Error("auth_scope_changed")),
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
  });
  const commit: Commit =
    options.commit ??
    ((input) =>
      repository.commitFinancialActionGroupLocally({
        ...input,
        prepareLinkedOperationPlan: async () => {
          const plan = await input.prepareLinkedOperationPlan();
          options.inspectPlan?.(plan);
          return plan;
        },
      }));
  return loadServiceModule().createUndoMetalHoldingCommandService({
    database: scopedDatabase,
    getCurrentUserDataScope,
    commitFinancialActionGroupLocally: commit,
    createEnvelope,
    hashProvider: sha256Provider,
  });
}

interface SeedOptions {
  readonly status?: "active" | "sold" | "disposed";
  readonly terminalKind?: "sell" | "dispose" | "delete";
  readonly accountGuardsJson?: string;
  readonly includeAsset?: boolean;
  readonly includeTerminalEvent?: boolean;
  readonly includeTerminalRoot?: boolean;
  readonly rootKind?: "sell" | "dispose" | "delete";
}

async function seedHolding(options: SeedOptions = {}): Promise<void> {
  const status = options.status ?? "sold";
  const terminalKind = options.terminalKind ?? "sell";
  const at = new Date("2026-09-04T10:00:00.000Z");
  const terminalPayload = JSON.stringify({
    holdingId: IDS.holding,
    expectedHoldingRevision: "0",
    predecessorEventId: IDS.createdEvent,
    reversesEventId: null,
    result: terminalKind === "sell" ? "1550" : "write_off",
  });
  await database.write(async (): Promise<void> => {
    if (options.includeAsset !== false) {
      await database.get<Asset>("assets").create((record): void => {
        record._raw.id = IDS.holding;
        record.acquisitionActionId = IDS.createdAction;
        record.currency = "EGP";
        record.deleted = false;
        record.isLiquid = true;
        record.name = "21K bracelet";
        record.notes = "Family holding";
        record.purchaseCurrency = "EGP";
        record.purchaseDate = new Date("2024-03-14T00:00:00.000Z");
        record.purchasePrice = 47800;
        record.purchasePriceDecimal = "47800";
        record.type = "METAL";
        record.updatedAt = at;
        record.userId = IDS.user;
      });
    }
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
        record.updatedAt = at;
        record.userId = IDS.user;
      });
    if (options.includeTerminalRoot !== false) {
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .create((record): void => {
          record.accountGuardsJson = options.accountGuardsJson ?? "[]";
          record.actionId = IDS.terminalAction;
          record.deleted = false;
          record.domain = "metals";
          record.domainReferenceId = IDS.holding;
          record.kind = options.rootKind ?? terminalKind;
          record.outcomeJson = null;
          record.payloadHash = "a".repeat(64);
          record.payloadJson = terminalPayload;
          record.rejectionCode = null;
          record.serverOutcome = null;
          record.state = "local_complete";
          record.updatedAt = at;
          record.userId = IDS.user;
        });
    }
    await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .create((record): void => {
        record._raw.id = IDS.terminalEvidence;
        record.actionId = IDS.terminalAction;
        record.canonicalHoldingRevision = "1";
        record.deleted = false;
        record.domainPayloadJson = terminalPayload;
        record.expectedHoldingRevision = "0";
        record.holdingId = IDS.holding;
        record.kind = terminalKind;
        record.updatedAt = at;
        record.userId = IDS.user;
      });
    if (options.includeTerminalEvent !== false) {
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .create((record): void => {
          record._raw.id = IDS.terminalEvent;
          record.actionId = IDS.terminalAction;
          record.deleted = false;
          record.holdingId = IDS.holding;
          record.isEffective = true;
          record.isHistoryVisible = true;
          record.kind = terminalKind;
          record.occurredAt = at;
          record.payloadJson = terminalPayload;
          record.predecessorEventId = IDS.createdEvent;
          record.reversesEventId = null;
          record.updatedAt = at;
          record.userId = IDS.user;
        });
    }
    await database
      .get<MetalHoldingState>("metal_holding_states")
      .create((record): void => {
        record._raw.id = IDS.state;
        record.deleted = false;
        record.effectiveActionId = IDS.terminalAction;
        record.effectiveEventId = IDS.terminalEvent;
        record.financialRevision = "1";
        record.holdingId = IDS.holding;
        record.isVisible = terminalKind !== "delete";
        record.reconciliationState = "sync_pending";
        record.status = status;
        record.updatedAt = at;
        record.userId = IDS.user;
      });
  });
}

async function openFreshDatabase(): Promise<Database> {
  const clonedAdapter = await adapter.testClone();
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({ adapter: clonedAdapter, modelClasses });
}

async function fetchAll<T extends Model>(
  scopedDatabase: Database,
  table: string
): Promise<readonly T[]> {
  return scopedDatabase.get<T>(table).query().fetch();
}

async function seedSecondTerminalAction(): Promise<void> {
  const at = new Date("2026-09-06T10:00:00.000Z");
  const payload = JSON.stringify({ result: "external_transfer" });
  await database.write(async (): Promise<void> => {
    await database
      .get<FinancialActionGroup>("financial_action_groups")
      .create((record): void => {
        record.accountGuardsJson = "[]";
        record.actionId = IDS.secondTerminalAction;
        record.deleted = false;
        record.domain = "metals";
        record.domainReferenceId = IDS.holding;
        record.kind = "dispose";
        record.outcomeJson = null;
        record.payloadHash = "b".repeat(64);
        record.payloadJson = payload;
        record.rejectionCode = null;
        record.serverOutcome = null;
        record.state = "local_complete";
        record.updatedAt = at;
        record.userId = IDS.user;
      });
    await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .create((record): void => {
        record._raw.id = IDS.secondTerminalEvidence;
        record.actionId = IDS.secondTerminalAction;
        record.canonicalHoldingRevision = "3";
        record.deleted = false;
        record.domainPayloadJson = payload;
        record.expectedHoldingRevision = "2";
        record.holdingId = IDS.holding;
        record.kind = "dispose";
        record.updatedAt = at;
        record.userId = IDS.user;
      });
    await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .create((record): void => {
        record._raw.id = IDS.secondTerminalEvent;
        record.actionId = IDS.secondTerminalAction;
        record.deleted = false;
        record.holdingId = IDS.holding;
        record.isEffective = true;
        record.isHistoryVisible = true;
        record.kind = "dispose";
        record.occurredAt = at;
        record.payloadJson = payload;
        record.predecessorEventId = IDS.undoEvent;
        record.reversesEventId = null;
        record.updatedAt = at;
        record.userId = IDS.user;
      });
    const state = (
      await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch()
    )[0];
    if (!state) throw new Error("test_state_missing");
    await state.update((record): void => {
      record.effectiveActionId = IDS.secondTerminalAction;
      record.effectiveEventId = IDS.secondTerminalEvent;
      record.financialRevision = "3";
      record.status = "disposed";
      record.updatedAt = at;
    });
  });
}

describe("uncredited metal terminal-action Undo SQLite integration", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(async (): Promise<void> => {
      await database.unsafeResetDatabase();
    });
    jest.restoreAllMocks();
  });

  it.each([
    ["sell", "sold", true, false],
    ["dispose", "disposed", false, true],
  ] as const)(
    "restores an uncredited %s terminal action and appends one exact reversal",
    async (
      terminalKind,
      status,
      removesSaleResult,
      removesDisposalTreatment
    ) => {
      await seedHolding({ terminalKind, status });
      const plans: FinancialActionLinkedOperationPlan[] = [];
      await expect(
        createService({ inspectPlan: (plan) => plans.push(plan) }).undo(
          command()
        )
      ).resolves.toEqual({ kind: "committed", holdingId: IDS.holding });

      const [state] = await fetchAll<MetalHoldingState>(
        database,
        "metal_holding_states"
      );
      const evidence = await fetchAll<MetalActionEvidence>(
        database,
        "metal_action_evidence"
      );
      const history = await fetchAll<MetalLifecycleEvent>(
        database,
        "metal_lifecycle_events"
      );
      const roots = await fetchAll<FinancialActionGroup>(
        database,
        "financial_action_groups"
      );
      const undoPayload = {
        holdingId: IDS.holding,
        expectedHoldingRevision: "1",
        predecessorEventId: IDS.terminalEvent,
        reversesEventId: IDS.terminalEvent,
      };

      expect(state).toMatchObject({
        status: "active",
        isVisible: true,
        financialRevision: "2",
        effectiveActionId: IDS.undoAction,
        effectiveEventId: IDS.undoEvent,
        reconciliationState: "sync_pending",
        userId: IDS.user,
      });
      expect(
        history.find((event) => event.id === IDS.terminalEvent)
      ).toMatchObject({
        actionId: IDS.terminalAction,
        kind: terminalKind,
        isEffective: true,
        isHistoryVisible: true,
      });
      expect(history.find((event) => event.id === IDS.undoEvent)).toMatchObject(
        {
          actionId: IDS.undoAction,
          holdingId: IDS.holding,
          kind: "undo",
          predecessorEventId: IDS.terminalEvent,
          reversesEventId: IDS.terminalEvent,
          isEffective: true,
          isHistoryVisible: true,
          payloadJson: JSON.stringify(undoPayload),
          userId: IDS.user,
        }
      );
      expect(
        evidence.find((entry) => entry.id === IDS.terminalEvidence)
      ).toMatchObject({
        actionId: IDS.terminalAction,
        kind: terminalKind,
        canonicalHoldingRevision: "1",
      });
      expect(
        evidence.find((entry) => entry.id === IDS.undoEvidence)
      ).toMatchObject({
        actionId: IDS.undoAction,
        kind: "undo",
        expectedHoldingRevision: "1",
        canonicalHoldingRevision: "2",
        domainPayloadJson: JSON.stringify(undoPayload),
      });
      expect(
        roots.find((root) => root.actionId === IDS.undoAction)
      ).toMatchObject({
        accountGuardsJson: "[]",
        domain: "metals",
        domainReferenceId: IDS.holding,
        kind: "undo",
        state: "local_complete",
      });
      expect(history).toHaveLength(3);
      expect(evidence).toHaveLength(2);
      expect(plans).toHaveLength(1);
      const [plan] = plans;
      if (!plan) throw new Error("undo_plan_missing");
      expect([
        ...plan.preparedCreates.map((model) => model.table),
        ...plan.existingOperations.map(({ model }) => model.table),
      ]).toEqual([
        "metal_action_evidence",
        "metal_lifecycle_events",
        "metal_holding_states",
      ]);
      expect(
        loadServiceModule().shapeUndoMetalHoldingConsequences(terminalKind)
      ).toEqual({
        terminalKind,
        restoresSameHolding: true,
        preservesTerminalHistory: true,
        removesSaleResult,
        removesDisposalTreatment,
        hasAccountEffect: false,
        hasOrdinaryIncomeEffect: false,
      });
    }
  );

  it("rejects Active and Delete projections because Delete is never Undo", async (): Promise<void> => {
    await seedHolding({ status: "active", terminalKind: "delete" });
    await expect(createService().undo(command())).rejects.toThrow(
      "metal_undo_delete_forbidden"
    );
    expect(
      await fetchAll<FinancialActionGroup>(database, "financial_action_groups")
    ).toHaveLength(1);
  });

  it.each([
    ["missing holding", { includeAsset: false }, "metal_holding_not_found"],
    [
      "missing terminal event",
      { includeTerminalEvent: false },
      "metal_undo_terminal_event_not_found",
    ],
    [
      "missing terminal root",
      { includeTerminalRoot: false },
      "metal_undo_terminal_action_not_found",
    ],
  ] as const)("rejects %s without writing", async (_label, seed, errorCode) => {
    await seedHolding(seed);
    await expect(createService().undo(command())).rejects.toThrow(errorCode);
    expect(
      await fetchAll<MetalLifecycleEvent>(database, "metal_lifecycle_events")
    ).toHaveLength(
      "includeTerminalEvent" in seed && seed.includeTerminalEvent === false
        ? 1
        : 2
    );
  });

  it("rejects non-current, unequal, status-kind, and action-root terminal links", async (): Promise<void> => {
    await seedHolding();
    await expect(
      createService().undo(
        command({
          predecessorEventId: IDS.createdEvent,
          reversesEventId: IDS.createdEvent,
        })
      )
    ).rejects.toThrow("metal_undo_terminal_not_current");
    await expect(
      createService().undo(command({ reversesEventId: IDS.createdEvent }))
    ).rejects.toThrow("metal_undo_terminal_link_mismatch");

    await database.write(async (): Promise<void> => {
      const [state] = await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch();
      if (!state) throw new Error("test_state_missing");
      await state.update((record): void => {
        record.status = "disposed";
      });
    });
    await expect(createService().undo(command())).rejects.toThrow(
      "metal_undo_terminal_kind_mismatch"
    );

    await database.write(async (): Promise<void> => {
      const [state] = await database
        .get<MetalHoldingState>("metal_holding_states")
        .query()
        .fetch();
      const [root] = await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch();
      if (!state || !root) throw new Error("test_projection_missing");
      await state.update((record): void => {
        record.status = "sold";
      });
      await root.update((record): void => {
        record.kind = "dispose";
      });
    });
    await expect(createService().undo(command())).rejects.toThrow(
      "metal_undo_terminal_action_mismatch"
    );
  });

  it("rejects a credited sale and preserves ownership and every terminal row", async (): Promise<void> => {
    await seedHolding({
      accountGuardsJson:
        '[{"accountId":"018f0c7a-1234-7abc-8def-000000000050","expectedRevision":"4"}]',
    });
    await expect(createService().undo(command())).rejects.toThrow(
      "metal_undo_credited_sale_blocked"
    );
    const [state] = await fetchAll<MetalHoldingState>(
      database,
      "metal_holding_states"
    );
    expect(state).toMatchObject({ status: "sold", financialRevision: "1" });
    expect(
      await fetchAll<MetalLifecycleEvent>(database, "metal_lifecycle_events")
    ).toHaveLength(2);
  });

  it("rejects a stale holding revision without appending a reversal", async (): Promise<void> => {
    await seedHolding();
    await expect(
      createService().undo(command({ expectedFinancialRevision: "0" }))
    ).rejects.toThrow("holding_revision_conflict");
    const [state] = await fetchAll<MetalHoldingState>(
      database,
      "metal_holding_states"
    );
    expect(state).toMatchObject({
      status: "sold",
      financialRevision: "1",
      effectiveEventId: IDS.terminalEvent,
    });
    expect(
      await fetchAll<MetalLifecycleEvent>(database, "metal_lifecycle_events")
    ).toHaveLength(2);
  });

  it("replays the same ID and hash across service recreation, rejects changed hash, and allows only one reversal", async (): Promise<void> => {
    await seedHolding();
    await createService().undo(command());
    await expect(createService().undo(command())).resolves.toEqual({
      kind: "replay",
      holdingId: IDS.holding,
    });
    await expect(
      createService().undo(command({ occurredAt: "2026-09-05T12:00:01.000Z" }))
    ).rejects.toThrow("action_id_payload_mismatch");
    await expect(
      createService().undo(
        command({
          actionId: IDS.secondUndoAction,
          actionEvidenceId: IDS.secondUndoEvidence,
          lifecycleEventId: IDS.secondUndoEvent,
          expectedFinancialRevision: "2",
        })
      )
    ).rejects.toThrow("metal_undo_terminal_holding_required");
    expect(
      await fetchAll<MetalLifecycleEvent>(database, "metal_lifecycle_events")
    ).toHaveLength(3);
  });

  it("rolls back every linked row and retries the same action safely", async (): Promise<void> => {
    await seedHolding();
    const batch = jest
      .spyOn(database.adapter, "batch")
      .mockRejectedValueOnce(new Error("disk_full"));
    await expect(createService().undo(command())).rejects.toThrow("disk_full");
    const [stateAfterFailure] = await fetchAll<MetalHoldingState>(
      database,
      "metal_holding_states"
    );
    expect(stateAfterFailure).toMatchObject({
      status: "sold",
      financialRevision: "1",
      effectiveEventId: IDS.terminalEvent,
    });
    expect(
      await fetchAll<MetalLifecycleEvent>(database, "metal_lifecycle_events")
    ).toHaveLength(2);
    expect(
      await fetchAll<MetalActionEvidence>(database, "metal_action_evidence")
    ).toHaveLength(1);

    batch.mockRestore();
    await expect(createService().undo(command())).resolves.toMatchObject({
      kind: "committed",
    });
  });

  it("rejects foreign user scope before writing", async (): Promise<void> => {
    await seedHolding();
    await expect(
      createService({ userId: IDS.foreignUser }).undo(
        command({ userId: IDS.foreignUser })
      )
    ).rejects.toThrow("metal_holding_not_found");
    expect(
      await fetchAll<MetalLifecycleEvent>(database, "metal_lifecycle_events")
    ).toHaveLength(2);
  });

  it("completes offline, survives restart, and replays without another reversal", async (): Promise<void> => {
    await seedHolding({ terminalKind: "dispose", status: "disposed" });
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockRejectedValue(new Error("offline"));
    await createService().undo(command());
    expect(fetchSpy).not.toHaveBeenCalled();

    const reopened = await openFreshDatabase();
    const [state] = await fetchAll<MetalHoldingState>(
      reopened,
      "metal_holding_states"
    );
    expect(state).toMatchObject({
      status: "active",
      reconciliationState: "sync_pending",
      effectiveEventId: IDS.undoEvent,
    });
    await expect(
      createService({ scopedDatabase: reopened }).undo(command())
    ).resolves.toMatchObject({ kind: "replay" });
    expect(
      await fetchAll<MetalLifecycleEvent>(reopened, "metal_lifecycle_events")
    ).toHaveLength(3);
  });

  it("allows a later terminal action and a separate reversal on the same restored holding", async (): Promise<void> => {
    await seedHolding();
    await createService().undo(command());
    await seedSecondTerminalAction();
    await expect(
      createService().undo(
        command({
          actionId: IDS.secondUndoAction,
          actionEvidenceId: IDS.secondUndoEvidence,
          lifecycleEventId: IDS.secondUndoEvent,
          predecessorEventId: IDS.secondTerminalEvent,
          reversesEventId: IDS.secondTerminalEvent,
          expectedFinancialRevision: "3",
          occurredAt: "2026-09-07T12:00:00.000Z",
        })
      )
    ).resolves.toEqual({ kind: "committed", holdingId: IDS.holding });
    const [state] = await fetchAll<MetalHoldingState>(
      database,
      "metal_holding_states"
    );
    const history = await fetchAll<MetalLifecycleEvent>(
      database,
      "metal_lifecycle_events"
    );
    expect(state).toMatchObject({
      status: "active",
      financialRevision: "4",
      effectiveEventId: IDS.secondUndoEvent,
    });
    expect(history).toHaveLength(5);
    expect(
      history
        .filter((event) => event.kind === "undo")
        .map((event) => ({
          predecessorEventId: event.predecessorEventId,
          reversesEventId: event.reversesEventId,
        }))
    ).toEqual([
      {
        predecessorEventId: IDS.terminalEvent,
        reversesEventId: IDS.terminalEvent,
      },
      {
        predecessorEventId: IDS.secondTerminalEvent,
        reversesEventId: IDS.secondTerminalEvent,
      },
    ]);
  });
});
