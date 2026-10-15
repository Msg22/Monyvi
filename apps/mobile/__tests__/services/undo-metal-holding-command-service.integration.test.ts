import { createHash } from "node:crypto";

import {
  Q,
  type Collection,
  type Database,
  type Model,
} from "@nozbe/watermelondb";
import type Query from "@nozbe/watermelondb/Query";
import type { Clause } from "@nozbe/watermelondb/QueryDescription";
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
  type FinancialActionUserDataScope,
} from "../../services/financial-action-foundation-repository";
import {
  createUndoMetalHoldingCommandService,
  shapeUndoMetalHoldingConsequences,
  readUndoMetalHoldingContext,
  type UndoMetalHoldingCommandInput,
} from "../../services/undo-metal-holding-command-service";

interface TestDatabaseModule {
  readonly database: Database;
  readonly __adapter: SQLiteAdapter;
  readonly __modelClasses: ReadonlyArray<typeof Model>;
}

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
  const adapterInstance = new SQLiteAdapter({
    jsi: false,
    schema,
  });
  return {
    __adapter: adapterInstance,
    __modelClasses: modelClasses,
    database: new WatermelonDatabase({
      adapter: adapterInstance,
      modelClasses,
    }),
  };
});

const hashProvider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value, "utf8").digest("hex")),
};

const dbModule = jest.requireMock<TestDatabaseModule>("@monyvi/db");
const database = dbModule.database;
const adapter = dbModule.__adapter;

function createTestEnvelope(
  input: UndoMetalHoldingCommandInput,
  _payload: RegisteredActionPayload
): FinancialActionEnvelopeV1 {
  return canonicalizeFinancialActionEnvelope(
    {
      accountGuards: [],
      actionId: input.actionId,
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "undo",
      occurredAt: input.occurredAt,
      payload: {
        expectedHoldingRevision: input.expectedFinancialRevision,
        holdingId: input.holdingId,
        predecessorEventId: input.predecessorEventId,
        reversesEventId: input.reversesEventId,
      },
      payloadVersion: "metals.undo/v1",
      userId: input.userId,
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { latestAllowedCalendarDate: input.occurredAt.slice(0, 10) }
  );
}

function userDataScopeFor(userId: string): FinancialActionUserDataScope {
  return {
    userId,
    assertOwned: <T extends { readonly userId: string }>(record: T): T => {
      if (record.userId !== userId) throw new Error("not_owned");
      return record;
    },
    queryOwned: <TRecord extends Model & { readonly userId: string }>(
      collection: Collection<TRecord>,
      ...clauses: Clause[]
    ): Query<TRecord> =>
      collection.query(Q.where("user_id", userId), ...clauses),
  };
}

async function seedHolding(
  terminalKind: "sell" | "dispose",
  options: {
    readonly accountGuards?: readonly unknown[];
    readonly isAssetDeleted?: boolean;
    readonly includeTerminalEvent?: boolean;
    readonly customTerminalActionId?: string;
    readonly occurredAt?: string;
    readonly terminalCalendarDate?: string;
    readonly legacyRevisionZero?: boolean;
  } = {}
): Promise<void> {
  const at = new Date(options.occurredAt ?? "2026-08-30T10:00:00.000Z");
  const terminalCalendarDate = options.terminalCalendarDate ?? "2026-08-30";
  const payload: RegisteredActionPayload =
    terminalKind === "sell"
      ? {
          expectedHoldingRevision: "0",
          feeMinorUnits: "0",
          grossProceedsMinorUnits: "10000",
          holdingId: IDS.holding,
          metalType: "GOLD",
          netProceedsMinorUnits: "10000",
          notes: null,
          predecessorEventId: options.legacyRevisionZero
            ? null
            : IDS.createdEvent,
          purchaseCurrency: "EGP",
          rateSnapshots: [],
          reversesEventId: null,
          saleCurrency: "EGP",
          saleDate: terminalCalendarDate,
        }
      : {
          disposalDate: terminalCalendarDate,
          expectedHoldingRevision: "0",
          holdingId: IDS.holding,
          notes: null,
          predecessorEventId: options.legacyRevisionZero
            ? null
            : IDS.createdEvent,
          reason: "given_away",
          reversesEventId: null,
        };
  const terminalEnvelope = canonicalizeFinancialActionEnvelope(
    {
      accountGuards: [],
      actionId: IDS.terminalAction,
      domain: "metals",
      domainReferenceId: IDS.holding,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: terminalKind,
      occurredAt: at.toISOString(),
      payload,
      payloadVersion:
        terminalKind === "sell" ? "metals.sell/v2" : "metals.dispose/v1",
      userId: IDS.user,
    },
    DEFAULT_FINANCIAL_ACTION_REGISTRY,
    { latestAllowedCalendarDate: terminalCalendarDate }
  );
  const terminalPayload = JSON.stringify(terminalEnvelope.payload);
  const accountGuardsJson = JSON.stringify(options.accountGuards ?? []);
  const status = terminalKind === "sell" ? "sold" : "disposed";
  await database.write(async (): Promise<void> => {
    await database.get<Asset>("assets").create((record): void => {
      record._raw.id = IDS.holding;
      record.deleted = options.isAssetDeleted ?? false;
      record.name = "Gold Bar";
      record.type = "METAL";
      record.updatedAt = at;
      record.userId = IDS.user;
    });
    await database
      .get<FinancialActionGroup>("financial_action_groups")
      .create((record): void => {
        record._raw.id = IDS.terminalAction;
        record.accountGuardsJson = accountGuardsJson;
        record.actionId = options.customTerminalActionId ?? IDS.terminalAction;
        record.deleted = false;
        record.domain = "metals";
        record.domainReferenceId = IDS.holding;
        record.kind = terminalKind;
        record.payloadHash = "hash-1";
        record.payloadJson = JSON.stringify(terminalEnvelope);
        record.state = "sync_pending";
        record.updatedAt = at;
        record.userId = IDS.user;
      });
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
          record._raw.id = options.legacyRevisionZero
            ? IDS.terminalEvent
            : IDS.terminalAction;
          record.actionId = IDS.terminalAction;
          record.deleted = false;
          record.holdingId = IDS.holding;
          record.isEffective = true;
          record.isHistoryVisible = true;
          record.kind = terminalKind;
          record.occurredAt = at;
          record.payloadJson = terminalPayload;
          record.predecessorEventId = options.legacyRevisionZero
            ? null
            : IDS.createdEvent;
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
        record.effectiveEventId = options.legacyRevisionZero
          ? IDS.terminalEvent
          : IDS.terminalAction;
        record.financialRevision = "1";
        record.holdingId = IDS.holding;
        record.isVisible = true;
        record.reconciliationState = "sync_pending";
        record.status = status;
        record.updatedAt = at;
        record.userId = IDS.user;
      });
  });
}

async function openFreshDatabase(): Promise<Database> {
  const { Database: WatermelonDatabase } = jest.requireActual<
    typeof import("@nozbe/watermelondb")
  >("@nozbe/watermelondb");
  return new WatermelonDatabase({
    adapter: await adapter.testClone(),
    modelClasses: [...dbModule.__modelClasses],
  });
}

function standardInput(
  overrides: Partial<UndoMetalHoldingCommandInput> = {}
): UndoMetalHoldingCommandInput {
  return {
    actionId: IDS.undoAction,
    actionEvidenceId: IDS.undoEvidence,
    lifecycleEventId: IDS.undoEvent,
    predecessorEventId: IDS.terminalAction,
    reversesEventId: IDS.terminalAction,
    holdingId: IDS.holding,
    userId: IDS.user,
    occurredAt: "2026-08-30T12:00:00.000Z",
    expectedFinancialRevision: "1",
    ...overrides,
  };
}

function createService(
  options: {
    readonly targetDb?: Database;
    readonly assertExpectedCurrentUser?: (userId: string) => Promise<void>;
  } = {}
): ReturnType<typeof createUndoMetalHoldingCommandService> {
  const targetDb = options.targetDb ?? database;
  const getScope = (): Promise<FinancialActionUserDataScope> =>
    Promise.resolve(userDataScopeFor(IDS.user));
  const repository = createFinancialActionFoundationRepository({
    database: targetDb,
    registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
    getCurrentUserDataScope: getScope,
    assertExpectedCurrentUser:
      options.assertExpectedCurrentUser ??
      ((): Promise<void> => Promise.resolve()),
  });
  return createUndoMetalHoldingCommandService({
    database: targetDb,
    getCurrentUserDataScope: getScope,
    commitFinancialActionGroupLocally:
      repository.commitFinancialActionGroupLocally,
    createEnvelope: createTestEnvelope,
    hashProvider,
  });
}

async function expectUnchangedTerminal(
  terminalKind: "sell" | "dispose" = "dispose"
): Promise<void> {
  const state = await database
    .get<MetalHoldingState>("metal_holding_states")
    .find(IDS.state);
  expect(state).toMatchObject({
    status: terminalKind === "sell" ? "sold" : "disposed",
    financialRevision: "1",
    effectiveEventId: IDS.terminalAction,
  });
  expect(
    await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch()
  ).toHaveLength(1);
  expect(
    await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch()
  ).toHaveLength(1);
  expect(
    await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch()
  ).toHaveLength(1);
}

describe("undo-metal-holding-command-service integration", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
  });

  it("loads a complete current owned Restore context without writing", async (): Promise<void> => {
    await seedHolding("dispose");
    const context = await readUndoMetalHoldingContext(
      {
        database,
        getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
          Promise.resolve(userDataScopeFor(IDS.user)),
      },
      IDS.holding,
      IDS.user
    );
    expect(context).toEqual({
      holdingId: IDS.holding,
      userId: IDS.user,
      terminalKind: "dispose",
      terminalEventId: IDS.terminalAction,
      expectedFinancialRevision: "1",
    });
    await expectUnchangedTerminal();
  });

  it("does not offer a Restore context for an actually credited sale", async (): Promise<void> => {
    await seedHolding("sell", { accountGuards: [{ accountId: IDS.state }] });
    await expect(
      readUndoMetalHoldingContext(
        {
          database,
          getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
            Promise.resolve(userDataScopeFor(IDS.user)),
        },
        IDS.holding,
        IDS.user
      )
    ).rejects.toThrow("metal_undo_credited_sale_blocked");
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(1);
  });

  it("rolls back the full root/evidence/event/state batch and retries with identical IDs", async (): Promise<void> => {
    await seedHolding("dispose");
    const service = createService();
    const batch = jest
      .spyOn(database, "batch")
      .mockRejectedValueOnce(new Error("fixture_sqlite_failure"));
    try {
      await expect(service.undo(standardInput())).rejects.toThrow(
        "fixture_sqlite_failure"
      );
    } finally {
      batch.mockRestore();
    }
    await expectUnchangedTerminal();
    await expect(service.undo(standardInput())).resolves.toMatchObject({
      kind: "committed",
    });
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
  });

  it("serializes competing Undo commands and applies only the first current revision", async (): Promise<void> => {
    await seedHolding("dispose");
    const service = createService();
    const competitor = standardInput({
      actionId: IDS.createdAction,
      actionEvidenceId: IDS.createdEvent,
      lifecycleEventId: IDS.createdEvent,
    });
    const outcomes = await Promise.allSettled([
      service.undo(standardInput()),
      service.undo(competitor),
    ]);
    expect(
      outcomes.filter(({ status }) => status === "fulfilled")
    ).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    );
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .find(IDS.state)
      ).financialRevision
    ).toBe("2");
  });

  it("rejects stale revision without writing a partial action", async (): Promise<void> => {
    await seedHolding("dispose");
    await expect(
      createService().undo(standardInput({ expectedFinancialRevision: "0" }))
    ).rejects.toThrow("holding_revision_conflict");
    await expectUnchangedTerminal();
  });

  it.each([
    "rejected_compensating",
    "reconciliation_incomplete",
    "reconciled",
  ] as const)(
    "blocks Undo from a %s terminal action",
    async (state): Promise<void> => {
      await seedHolding("dispose");
      await database.write(async (): Promise<void> => {
        await (
          await database
            .get<FinancialActionGroup>("financial_action_groups")
            .find(IDS.terminalAction)
        ).update((record): void => {
          record.state = state;
        });
      });
      await expect(createService().undo(standardInput())).rejects.toThrow(
        "metal_undo_terminal_action_mismatch"
      );
      await expectUnchangedTerminal();
    }
  );

  it("reasserts auth inside writer before committing and leaves all projections unchanged", async (): Promise<void> => {
    await seedHolding("dispose");
    let assertions = 0;
    const service = createService({
      assertExpectedCurrentUser: (): Promise<void> => {
        assertions += 1;
        if (assertions === 3)
          throw new Error("financial_action_auth_scope_changed");
        return Promise.resolve();
      },
    });
    await expect(service.undo(standardInput())).rejects.toThrow(
      "financial_action_auth_scope_changed"
    );
    await expectUnchangedTerminal();
  });

  it("rejects changed-hash replay and preserves one reversal after restart", async (): Promise<void> => {
    await seedHolding("dispose");
    await createService().undo(standardInput());
    const restarted = createService({ targetDb: await openFreshDatabase() });
    await expect(restarted.undo(standardInput())).resolves.toMatchObject({
      kind: "replay",
    });
    await expect(
      restarted.undo(standardInput({ occurredAt: "2026-08-30T13:00:00.000Z" }))
    ).rejects.toThrow();
    expect(
      await database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetch()
    ).toHaveLength(2);
  });

  it.each([
    "rejected_compensating",
    "reconciliation_incomplete",
    "reconciled",
  ] as const)(
    "does not report a %s replay as a successful Restore",
    async (state): Promise<void> => {
      await seedHolding("dispose");
      const service = createService();
      await service.undo(standardInput());
      await database.write(async (): Promise<void> => {
        const [root] = await database
          .get<FinancialActionGroup>("financial_action_groups")
          .query(Q.where("action_id", IDS.undoAction))
          .fetch();
        if (!root) throw new Error("missing_fixture_root");
        await root.update((record): void => {
          record.state = state;
        });
      });
      await expect(service.undo(standardInput())).rejects.toThrow(
        "metal_undo_replay_requires_recovery"
      );
      expect(
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .query()
          .fetch()
      ).toHaveLength(2);
    }
  );

  it("reverses a Dispose holding, marks it Active, and retains immutable history", async (): Promise<void> => {
    await seedHolding("dispose");
    const repository = createFinancialActionFoundationRepository({
      database,
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      assertExpectedCurrentUser: () => Promise.resolve(),
    });
    const service = createUndoMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: createTestEnvelope,
      hashProvider,
    });

    const result = await service.undo(standardInput());
    expect(result).toEqual({ kind: "committed", holdingId: IDS.holding });

    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state.status).toBe("active");
    expect(state.financialRevision).toBe("2");
    expect(state.effectiveEventId).toBe(IDS.undoAction);

    const event = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .find(IDS.undoAction);
    expect(event.kind).toBe("undo");
    expect(event.reversesEventId).toBe(IDS.terminalAction);
    expect(event.predecessorEventId).toBe(IDS.terminalAction);
    expect(event.isEffective).toBe(true);
  });

  it("reverses an uncredited Sold holding safely", async (): Promise<void> => {
    await seedHolding("sell", { accountGuards: [] });
    const repository = createFinancialActionFoundationRepository({
      database,
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      assertExpectedCurrentUser: () => Promise.resolve(),
    });
    const service = createUndoMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: createTestEnvelope,
      hashProvider,
    });

    const result = await service.undo(
      standardInput({
        predecessorEventId: IDS.terminalAction,
        reversesEventId: IDS.terminalAction,
      })
    );
    expect(result.kind).toBe("committed");

    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state.status).toBe("active");
  });

  it("survives cold database restart and preserves active state and undo event without network", async (): Promise<void> => {
    await seedHolding("dispose");
    const repository = createFinancialActionFoundationRepository({
      database,
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      assertExpectedCurrentUser: () => Promise.resolve(),
    });
    const service = createUndoMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: createTestEnvelope,
      hashProvider,
    });

    await service.undo(standardInput());

    // Cold restart simulation: instantiate a new Database instance on the existing adapter
    const restartedDb = await openFreshDatabase();
    const restartedState = await restartedDb
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(restartedState.status).toBe("active");
    expect(restartedState.effectiveEventId).toBe(IDS.undoAction);

    const restartedEvent = await restartedDb
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .find(IDS.undoAction);
    expect(restartedEvent.kind).toBe("undo");
    expect(restartedEvent.reversesEventId).toBe(IDS.terminalAction);
  });

  it("blocks undo of a credited sale when account guards exist (#242 gate)", async (): Promise<void> => {
    await seedHolding("sell", { accountGuards: [{ accountId: "acc-1" }] });
    const repository = createFinancialActionFoundationRepository({
      database,
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      assertExpectedCurrentUser: () => Promise.resolve(),
    });
    const service = createUndoMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: createTestEnvelope,
      hashProvider,
    });

    await expect(
      service.undo(
        standardInput({
          predecessorEventId: IDS.terminalAction,
          reversesEventId: IDS.terminalAction,
        })
      )
    ).rejects.toThrow("metal_undo_credited_sale_blocked");
  });

  it("rejects when predecessorEventId does not match reversesEventId", async (): Promise<void> => {
    await seedHolding("dispose");
    const repository = createFinancialActionFoundationRepository({
      database,
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      assertExpectedCurrentUser: () => Promise.resolve(),
    });
    const service = createUndoMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: createTestEnvelope,
      hashProvider,
    });

    await expect(
      service.undo(standardInput({ reversesEventId: "mismatched-event" }))
    ).rejects.toThrow("metal_undo_terminal_link_mismatch");
  });

  it("rejects when user is mismatched / foreign scope", async (): Promise<void> => {
    await seedHolding("dispose");
    const repository = createFinancialActionFoundationRepository({
      database,
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      assertExpectedCurrentUser: () => Promise.resolve(),
    });
    const service = createUndoMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: createTestEnvelope,
      hashProvider,
    });

    await expect(
      service.undo(standardInput({ userId: IDS.foreignUser }))
    ).rejects.toThrow("financial_action_auth_scope_changed");
  });

  it("is idempotent on replay with same input and actionId", async (): Promise<void> => {
    await seedHolding("dispose");
    const repository = createFinancialActionFoundationRepository({
      database,
      registry: DEFAULT_FINANCIAL_ACTION_REGISTRY,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      assertExpectedCurrentUser: () => Promise.resolve(),
    });
    const service = createUndoMetalHoldingCommandService({
      database,
      getCurrentUserDataScope: () =>
        Promise.resolve(userDataScopeFor(IDS.user)),
      commitFinancialActionGroupLocally:
        repository.commitFinancialActionGroupLocally,
      createEnvelope: createTestEnvelope,
      hashProvider,
    });

    const first = await service.undo(standardInput());
    expect(first.kind).toBe("committed");

    const second = await service.undo(standardInput());
    expect(second.kind).toBe("replay");
  });

  it("persists canonical actionId as ID for actionEvidence and lifecycleEvent, matching SQL migration 068 sync contract", async (): Promise<void> => {
    await seedHolding("dispose");
    const service = createService();

    // Pass distinct / mismatched actionEvidenceId and lifecycleEventId in command input
    const inputWithMismatchedIds = standardInput({
      actionId: IDS.undoAction,
      actionEvidenceId: "custom-evidence-uuid-mismatched",
      lifecycleEventId: "custom-event-uuid-mismatched",
    });

    const result = await service.undo(inputWithMismatchedIds);
    expect(result.kind).toBe("committed");

    // MetalActionEvidence must have _raw.id === actionId to avoid duplicate rows on pull
    const evidence = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query(Q.where("action_id", IDS.undoAction))
      .fetch();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?._raw.id).toBe(IDS.undoAction);
    expect(evidence[0]?.actionId).toBe(IDS.undoAction);

    // MetalLifecycleEvent must have _raw.id === actionId to avoid duplicate rows on pull
    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(Q.where("action_id", IDS.undoAction))
      .fetch();
    expect(events).toHaveLength(1);
    expect(events[0]?._raw.id).toBe(IDS.undoAction);
    expect(events[0]?.actionId).toBe(IDS.undoAction);

    // MetalHoldingState.effectiveEventId must point to the canonical actionId
    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .find(IDS.state);
    expect(state.effectiveActionId).toBe(IDS.undoAction);
    expect(state.effectiveEventId).toBe(IDS.undoAction);

    // Sync-style replay with canonical IDs produces replay without duplicate rows
    const replayInput = standardInput({
      actionId: IDS.undoAction,
      actionEvidenceId: IDS.undoAction,
      lifecycleEventId: IDS.undoAction,
    });
    const replayResult = await service.undo(replayInput);
    expect(replayResult.kind).toBe("replay");

    // Evidence and events count remains 1 for undoAction (no duplicate rows created)
    const evidenceAfterReplay = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query(Q.where("action_id", IDS.undoAction))
      .fetch();
    expect(evidenceAfterReplay).toHaveLength(1);

    const eventsAfterReplay = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(Q.where("action_id", IDS.undoAction))
      .fetch();
    expect(eventsAfterReplay).toHaveLength(1);
  });

  it("correctly shapes undo consequences for sell and dispose", (): void => {
    const sellConsequences = shapeUndoMetalHoldingConsequences("sell");
    expect(sellConsequences).toEqual({
      terminalKind: "sell",
      restoresSameHolding: true,
      preservesTerminalHistory: true,
      removesSaleResult: true,
      removesDisposalTreatment: false,
      hasAccountEffect: false,
      hasOrdinaryIncomeEffect: false,
    });

    const disposeConsequences = shapeUndoMetalHoldingConsequences("dispose");
    expect(disposeConsequences).toEqual({
      terminalKind: "dispose",
      restoresSameHolding: true,
      preservesTerminalHistory: true,
      removesSaleResult: false,
      removesDisposalTreatment: true,
      hasAccountEffect: false,
      hasOrdinaryIncomeEffect: false,
    });
  });
});
