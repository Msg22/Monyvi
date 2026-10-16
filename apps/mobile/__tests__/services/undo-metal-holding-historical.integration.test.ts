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

describe("undo-metal-holding-command-service immutable terminal matrix and historical dates", () => {
  beforeEach(async (): Promise<void> => {
    await adapter.initializingPromise;
    await database.write(
      async (): Promise<void> => database.unsafeResetDatabase()
    );
  });

  describe.each(["sell", "dispose"] as const)(
    "%s immutable terminal evidence",
    (terminalKind): void => {
      it.each([
        "malformed-root",
        "root-owner",
        "root-action-id",
        "root-kind",
        "root-domain",
        "root-payload-version",
        "root-duplicate-key",
        "root-occurred-at",
        "root-payload-revision",
        "root-payload-date",
        "root-payload-number",
        "event-payload",
        "event-payload-duplicate-key",
        "event-predecessor",
        "event-reverses",
        "event-occurrence",
        "malformed-evidence",
        "evidence-payload",
        "evidence-payload-duplicate-key",
        "evidence-expected-revision",
        "evidence-kind",
      ] as const)(
        "rejects %s without committing Undo",
        async (scenario): Promise<void> => {
          await seedHolding(terminalKind);
          await database.write(async (): Promise<void> => {
            const root = await database
              .get<FinancialActionGroup>("financial_action_groups")
              .find(IDS.terminalAction);
            const event = await database
              .get<MetalLifecycleEvent>("metal_lifecycle_events")
              .find(IDS.terminalAction);
            const evidence = await database
              .get<MetalActionEvidence>("metal_action_evidence")
              .find(IDS.terminalEvidence);
            const otherKind = terminalKind === "sell" ? "dispose" : "sell";

            if (scenario.startsWith("root-") || scenario === "malformed-root") {
              await root.update((record): void => {
                if (scenario === "malformed-root") {
                  record.payloadJson = "{";
                  return;
                }
                if (scenario === "root-duplicate-key") {
                  const version =
                    terminalKind === "sell"
                      ? "metals.sell/v2"
                      : "metals.dispose/v1";
                  record.payloadJson = record.payloadJson.replace(
                    `"payloadVersion":"${version}"`,
                    `"payloadVersion":"${version}","payloadVersion":"${version}"`
                  );
                  return;
                }
                const parsed: unknown = JSON.parse(record.payloadJson);
                if (
                  parsed === null ||
                  typeof parsed !== "object" ||
                  Array.isArray(parsed)
                )
                  throw new Error("invalid_root_fixture");
                const payload: unknown = Reflect.get(parsed, "payload");
                if (
                  payload === null ||
                  typeof payload !== "object" ||
                  Array.isArray(payload)
                )
                  throw new Error("invalid_payload_fixture");
                const dateKey =
                  terminalKind === "sell" ? "saleDate" : "disposalDate";
                record.payloadJson = JSON.stringify({
                  ...parsed,
                  ...(scenario === "root-owner"
                    ? { userId: IDS.foreignUser }
                    : {}),
                  ...(scenario === "root-action-id"
                    ? { actionId: IDS.createdAction }
                    : {}),
                  ...(scenario === "root-kind" ? { kind: otherKind } : {}),
                  ...(scenario === "root-domain" ? { domain: "accounts" } : {}),
                  ...(scenario === "root-payload-version"
                    ? {
                        payloadVersion:
                          terminalKind === "sell"
                            ? "metals.sell/v1"
                            : "metals.dispose/v2",
                      }
                    : {}),
                  ...(scenario === "root-occurred-at"
                    ? { occurredAt: "2026-08-29T10:00:00.000Z" }
                    : {}),
                  payload: {
                    ...payload,
                    ...(scenario === "root-payload-revision"
                      ? { expectedHoldingRevision: "1" }
                      : {}),
                    ...(scenario === "root-payload-number"
                      ? { expectedHoldingRevision: 0 }
                      : {}),
                    ...(scenario === "root-payload-date"
                      ? { [dateKey]: "2026-09-01" }
                      : {}),
                  },
                });
              });
            } else if (scenario.startsWith("event-")) {
              await event.update((record): void => {
                if (scenario === "event-payload")
                  record.payloadJson = JSON.stringify({
                    holdingId: IDS.foreignUser,
                  });
                if (scenario === "event-payload-duplicate-key") {
                  record.payloadJson = record.payloadJson.replace(
                    `"holdingId":"${IDS.holding}"`,
                    `"holdingId":"${IDS.holding}","holdingId":"${IDS.holding}"`
                  );
                }
                if (scenario === "event-predecessor")
                  record.predecessorEventId = IDS.foreignUser;
                if (scenario === "event-reverses")
                  record.reversesEventId = IDS.createdAction;
                if (scenario === "event-occurrence")
                  record.occurredAt = new Date("2026-08-30T09:00:00.000Z");
              });
            } else {
              await evidence.update((record): void => {
                if (scenario === "malformed-evidence")
                  record.domainPayloadJson = "{";
                if (scenario === "evidence-payload")
                  record.domainPayloadJson = JSON.stringify({
                    holdingId: IDS.holding,
                  });
                if (scenario === "evidence-payload-duplicate-key") {
                  record.domainPayloadJson = record.domainPayloadJson.replace(
                    `"holdingId":"${IDS.holding}"`,
                    `"holdingId":"${IDS.holding}","holdingId":"${IDS.holding}"`
                  );
                }
                if (scenario === "evidence-expected-revision")
                  record.expectedHoldingRevision = "1";
                if (scenario === "evidence-kind") record.kind = otherKind;
              });
            }
          });

          const scope = {
            database,
            getCurrentUserDataScope:
              (): Promise<FinancialActionUserDataScope> =>
                Promise.resolve(userDataScopeFor(IDS.user)),
          };
          const undoInput = standardInput();
          await expect(
            readUndoMetalHoldingContext(scope, IDS.holding, IDS.user)
          ).rejects.toThrow("metal_undo_terminal_action_mismatch");
          await expect(createService().undo(undoInput)).rejects.toThrow(
            "metal_undo_terminal_action_mismatch"
          );
          await expectUnchangedTerminal(terminalKind);
        }
      );
    }
  );

  it("preserves an immutable historical Dispose even when the device clock is earlier", async (): Promise<void> => {
    await seedHolding("dispose");
    jest.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    try {
      await expect(
        createService().undo(standardInput())
      ).resolves.toMatchObject({
        kind: "committed",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(["sell", "dispose"] as const)(
    "restores authentic %s dated Nov 15 on a Dubai device despite later clock/timezone changes",
    async (terminalKind): Promise<void> => {
      const savedTimezone: unknown = process.env.TZ;
      const originalTimezone =
        typeof savedTimezone === "string" ? savedTimezone : undefined;
      await seedHolding(terminalKind, {
        occurredAt: "2026-11-14T20:30:00.000Z",
        terminalCalendarDate: "2026-11-15",
      });
      process.env.TZ = "Pacific/Honolulu";
      jest.useFakeTimers().setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
      try {
        const scope = {
          database,
          getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
            Promise.resolve(userDataScopeFor(IDS.user)),
        };
        await expect(
          readUndoMetalHoldingContext(scope, IDS.holding, IDS.user)
        ).resolves.toMatchObject({
          terminalKind,
          terminalEventId: IDS.terminalAction,
        });
        await expect(
          createService().undo(
            standardInput({
              occurredAt: "2026-11-14T21:00:00.000Z",
              ...(terminalKind === "sell"
                ? {
                    predecessorEventId: IDS.terminalAction,
                    reversesEventId: IDS.terminalAction,
                  }
                : {}),
            })
          )
        ).resolves.toMatchObject({ kind: "committed", holdingId: IDS.holding });
      } finally {
        jest.useRealTimers();
        if (originalTimezone === undefined) {
          delete process.env.TZ;
        } else {
          process.env.TZ = originalTimezone;
        }
      }
    }
  );

  it.each([
    ["sell", "2026-11-14T09:59:59.999Z", false],
    ["sell", "2026-11-14T10:00:00.000Z", true],
    ["dispose", "2026-11-14T09:59:59.999Z", false],
    ["dispose", "2026-11-14T10:00:00.000Z", true],
  ] as const)(
    "uses the exact +14 civil-day boundary for historical %s at %s (valid: %s)",
    async (terminalKind, occurredAt, valid): Promise<void> => {
      await seedHolding(terminalKind, {
        occurredAt,
        terminalCalendarDate: "2026-11-15",
      });
      const scope = {
        database,
        getCurrentUserDataScope: (): Promise<FinancialActionUserDataScope> =>
          Promise.resolve(userDataScopeFor(IDS.user)),
      };
      const context = readUndoMetalHoldingContext(scope, IDS.holding, IDS.user);
      if (valid) {
        await expect(context).resolves.toMatchObject({ terminalKind });
      } else {
        await expect(context).rejects.toThrow(
          "metal_undo_terminal_action_mismatch"
        );
      }
      await expectUnchangedTerminal(terminalKind);
    }
  );

  it.each(["sell", "dispose"] as const)(
    "rejects historical %s dated two calendar days beyond the occurrence's device bound",
    async (terminalKind): Promise<void> => {
      await seedHolding(terminalKind, {
        occurredAt: "2026-11-14T20:30:00.000Z",
        terminalCalendarDate: "2026-11-16",
      });
      await expect(
        readUndoMetalHoldingContext(
          {
            database,
            getCurrentUserDataScope:
              (): Promise<FinancialActionUserDataScope> =>
                Promise.resolve(userDataScopeFor(IDS.user)),
          },
          IDS.holding,
          IDS.user
        )
      ).rejects.toThrow("metal_undo_terminal_action_mismatch");
      await expectUnchangedTerminal(terminalKind);
    }
  );
});
