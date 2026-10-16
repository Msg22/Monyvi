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

describe("undo-metal-holding-command-service evidence and legacy alias", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
  });

  it.each([
    "missing-asset",
    "missing-event",
    "missing-root",
    "missing-evidence",
    "foreign-asset",
    "foreign-event",
    "foreign-root",
    "foreign-evidence",
    "active",
    "delete",
    "hidden",
    "ineffective",
    "hidden-event",
    "stale-terminal",
    "kind-mismatch",
    "action-mismatch",
    "evidence-revision",
    "malformed-account-guards",
    "incomplete-projection",
  ])(
    "rejects %s eligibility without any Undo rows or state changes",
    async (scenario): Promise<void> => {
      await seedHolding("dispose");
      await database.write(async (): Promise<void> => {
        if (scenario === "missing-asset" || scenario === "foreign-asset") {
          await (
            await database.get<Asset>("assets").find(IDS.holding)
          ).update((record): void => {
            if (scenario === "missing-asset") record.deleted = true;
            else record.userId = IDS.foreignUser;
          });
        } else if (
          [
            "missing-event",
            "foreign-event",
            "delete",
            "ineffective",
            "hidden-event",
            "kind-mismatch",
          ].includes(scenario)
        ) {
          await (
            await database
              .get<MetalLifecycleEvent>("metal_lifecycle_events")
              .find(IDS.terminalAction)
          ).update((record): void => {
            if (scenario === "missing-event") record.deleted = true;
            if (scenario === "foreign-event") record.userId = IDS.foreignUser;
            if (scenario === "delete") record.kind = "delete";
            if (scenario === "ineffective") record.isEffective = false;
            if (scenario === "hidden-event") record.isHistoryVisible = false;
            if (scenario === "kind-mismatch") record.kind = "sell";
          });
        } else if (
          [
            "missing-root",
            "foreign-root",
            "action-mismatch",
            "malformed-account-guards",
          ].includes(scenario)
        ) {
          await (
            await database
              .get<FinancialActionGroup>("financial_action_groups")
              .find(IDS.terminalAction)
          ).update((record): void => {
            if (scenario === "missing-root") record.deleted = true;
            if (scenario === "foreign-root") record.userId = IDS.foreignUser;
            if (scenario === "action-mismatch")
              record.domainReferenceId = IDS.createdEvent;
            if (scenario === "malformed-account-guards")
              record.accountGuardsJson = "{}";
          });
        } else if (
          [
            "missing-evidence",
            "foreign-evidence",
            "evidence-revision",
          ].includes(scenario)
        ) {
          await (
            await database
              .get<MetalActionEvidence>("metal_action_evidence")
              .find(IDS.terminalEvidence)
          ).update((record): void => {
            if (scenario === "missing-evidence") record.deleted = true;
            if (scenario === "foreign-evidence")
              record.userId = IDS.foreignUser;
            if (scenario === "evidence-revision")
              record.canonicalHoldingRevision = "0";
          });
        } else {
          await (
            await database
              .get<MetalHoldingState>("metal_holding_states")
              .find(IDS.state)
          ).update((record): void => {
            if (scenario === "active") record.status = "active";
            if (scenario === "hidden") record.isVisible = false;
            if (scenario === "stale-terminal")
              record.effectiveEventId = IDS.createdEvent;
            if (scenario === "incomplete-projection")
              record.reconciliationState = "reconciliation_incomplete";
          });
        }
      });
      const state = await database
        .get<MetalHoldingState>("metal_holding_states")
        .find(IDS.state);
      const before = { ...state._raw };
      await expect(createService().undo(standardInput())).rejects.toThrow();
      expect(state._raw).toEqual(before);
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
  );

  it("commits legacy revision-zero Dispose E!=D using D in every new Undo reference and replays identical hash after cold restart", async (): Promise<void> => {
    await seedHolding("dispose", { legacyRevisionZero: true });
    const service = createService();
    const original = standardInput({
      predecessorEventId: IDS.terminalEvent,
      reversesEventId: IDS.terminalEvent,
    });
    const context = await readUndoMetalHoldingContext(
      {
        database,
        getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
          Promise.resolve(userDataScopeFor(IDS.user)),
      },
      IDS.holding,
      IDS.user
    );
    expect(context.terminalEventId).toBe(IDS.terminalEvent);
    expect(IDS.terminalEvent).not.toBe(IDS.terminalAction);
    expect(await service.undo(original)).toEqual({
      kind: "committed",
      holdingId: IDS.holding,
    });
    const [root] = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", IDS.undoAction))
      .fetch();
    if (!root) throw new Error("undo_root_fixture_missing");
    const canonicalPayload = JSON.parse(root.payloadJson) as {
      payload: { predecessorEventId: string; reversesEventId: string };
    };
    expect(canonicalPayload.payload).toMatchObject({
      predecessorEventId: IDS.terminalAction,
      reversesEventId: IDS.terminalAction,
    });
    const initialHash = root.payloadHash;
    const undoEvent = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .find(IDS.undoAction);
    expect(undoEvent.predecessorEventId).toBe(IDS.terminalAction);
    expect(undoEvent.reversesEventId).toBe(IDS.terminalAction);
    expect(undoEvent.payloadJson).toContain(IDS.terminalAction);
    expect(
      (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .find(IDS.state)
      ).status
    ).toBe("active");
    const restarted = createService({ targetDb: await openFreshDatabase() });
    expect(await restarted.undo(original)).toMatchObject({ kind: "replay" });
    const replayRoots = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", IDS.undoAction))
      .fetch();
    expect(replayRoots).toHaveLength(1);
    expect(replayRoots[0]?.payloadHash).toBe(initialHash);
  });

  it("rejects an unproved legacy alias and never creates an Undo root", async (): Promise<void> => {
    await seedHolding("dispose", { legacyRevisionZero: true });
    await database.write(async (): Promise<void> => {
      await (
        await database
          .get<MetalActionEvidence>("metal_action_evidence")
          .find(IDS.terminalEvidence)
      ).update((record): void => {
        record.domainPayloadJson = "{}";
      });
    });
    await expect(
      createService().undo(
        standardInput({
          predecessorEventId: IDS.terminalEvent,
          reversesEventId: IDS.terminalEvent,
        })
      )
    ).rejects.toThrow("metal_undo_terminal_action_mismatch");
    expect(
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).toHaveLength(1);
  });

  it("restores a pulled canonical D state while its verified original legacy Dispose row still has primary key E", async (): Promise<void> => {
    await seedHolding("dispose", { legacyRevisionZero: true });
    await database.write(async (): Promise<void> => {
      await (
        await database
          .get<MetalHoldingState>("metal_holding_states")
          .find(IDS.state)
      ).update((record): void => {
        record.effectiveEventId = IDS.terminalAction;
      });
    });
    const context = await readUndoMetalHoldingContext(
      {
        database,
        getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
          Promise.resolve(userDataScopeFor(IDS.user)),
      },
      IDS.holding,
      IDS.user
    );
    expect(context.terminalEventId).toBe(IDS.terminalAction);
    const input = standardInput({
      predecessorEventId: IDS.terminalAction,
      reversesEventId: IDS.terminalAction,
    });
    await expect(createService().undo(input)).resolves.toMatchObject({
      kind: "committed",
    });
    const reversal = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .find(IDS.undoAction);
    expect(reversal.predecessorEventId).toBe(IDS.terminalAction);
    expect(reversal.reversesEventId).toBe(IDS.terminalAction);
    expect(
      (
        await database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .find(IDS.terminalEvent)
      ).actionId
    ).toBe(IDS.terminalAction);
    const restarted = createService({ targetDb: await openFreshDatabase() });
    await expect(restarted.undo(input)).resolves.toMatchObject({
      kind: "replay",
    });
  });
});
