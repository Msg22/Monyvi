import { createHash } from "node:crypto";

import { Database, Q, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  hashFinancialActionEnvelope,
  type FinancialActionValidationInput,
  type Sha256Provider,
} from "@monyvi/logic";
import { schema } from "../../../../packages/db/src/schema";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { AssetMetal } from "../../../../packages/db/src/models/AssetMetal";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalActionEvidence } from "../../../../packages/db/src/models/MetalActionEvidence";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import { MetalRateReference } from "../../../../packages/db/src/models/MetalRateReference";
import {
  METAL_ACTION_KINDS,
  assertCanonicalMetalRevision,
  createMetalFinancialActionEnvelope,
  type CreateMetalFinancialActionEnvelopeInput,
  type MetalActionKind,
} from "../../services/metal-financial-action-adapter";
import { createMetalHoldingCommandService } from "../../services/metal-holding-command-service";
import {
  createMetalFinancialActionRepository,
  createWatermelonMetalFinancialActionRepositoryDependencies,
} from "../../services/metal-financial-action-repository";
import { commitMetalRpcOutcomeLocally } from "../../services/metal-reconciliation-service";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));

const USER_ID = "018f0c7a-1234-7abc-8def-000000000003";
const FOREIGN_USER_ID = "018f0c7a-1234-7abc-8def-000000000099";
const HOLDING_ID = "018f0c7a-1234-7abc-8def-000000000004";
const VALIDATION_INPUT: FinancialActionValidationInput = {
  cairoTodayDate: "2026-09-01",
};
const MODEL_CLASSES: Array<typeof Model> = [
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
];
const sha256Provider: Sha256Provider = {
  digestUtf8: (value: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(value).digest("hex")),
};

function actionId(index: number): string {
  return "018f0c7a-1234-7abc-8def-" + String(index).padStart(12, "0");
}

function materialFacts(
  purchasePriceDecimal = "150000"
): Record<string, unknown> {
  return {
    physicalForm: "JEWELRY",
    purchaseCurrency: "EGP",
    purchaseDate: "2026-08-30",
    purchasePriceDecimal,
    purityCatalogVersion: "1",
    purityCode: "gold-9999",
    purityFactorDecimal: "0.9999",
    weightGramsDecimal: "10.25",
  };
}

function rateSnapshot(
  referenceId: string,
  role:
    | "acquisition_metal"
    | "acquisition_purchase_currency"
    | "terminal_metal"
    | "terminal_purchase_currency"
    | "terminal_proceeds_currency"
): Record<string, unknown> {
  const isMetal = role.endsWith("_metal");
  return {
    capturedAt: "2026-08-31T10:16:00.123Z",
    capturedFreshness: "fresh",
    instrumentCode: isMetal ? "metal:GOLD" : "currency:EGP",
    kind: isMetal ? "metal" : "currency",
    orientation: "quote_per_base",
    providerObservedAt: "2026-08-31T10:15:30.123Z",
    quality: "valid",
    referenceId,
    role,
    source: "provider-a",
    unit: isMetal ? "usd_per_pure_gram" : "usd_per_currency_unit",
    valueDecimal: isMetal ? "3510.5" : "0.02",
  };
}

function payloadFor(
  kind: MetalActionKind,
  expectedHoldingRevision: string | null,
  predecessorEventId: string | null,
  reversesEventId: string | null = null
): Readonly<Record<string, unknown>> {
  if (kind === "add") {
    return {
      expectedHoldingRevision: null,
      holdingId: HOLDING_ID,
      materialFacts: materialFacts(),
      metalType: "GOLD",
      metadata: { name: "Savings gold", notes: null },
      predecessorEventId: null,
      rateSnapshots: [
        rateSnapshot(actionId(101), "acquisition_metal"),
        rateSnapshot(actionId(102), "acquisition_purchase_currency"),
      ],
      reversesEventId: null,
    };
  }
  if (kind === "correct") {
    return {
      expectedHoldingRevision,
      holdingId: HOLDING_ID,
      materialCorrection: {
        after: materialFacts("151000"),
        before: materialFacts(),
        rateSnapshots: [
          rateSnapshot(actionId(103), "acquisition_metal"),
          rateSnapshot(actionId(104), "acquisition_purchase_currency"),
        ],
        reason: "Receipt correction",
      },
      metadataChange: null,
      predecessorEventId,
      reversesEventId: null,
    };
  }
  if (kind === "sell") {
    return {
      expectedHoldingRevision,
      feeMinorUnits: "80000",
      grossProceedsMinorUnits: "16500000",
      holdingId: HOLDING_ID,
      metalType: "GOLD",
      netProceedsMinorUnits: "16420000",
      notes: null,
      predecessorEventId,
      purchaseCurrency: "EGP",
      rateSnapshots: [
        rateSnapshot(actionId(105), "terminal_metal"),
        rateSnapshot(actionId(106), "terminal_purchase_currency"),
        rateSnapshot(actionId(107), "terminal_proceeds_currency"),
      ],
      reversesEventId: null,
      saleCurrency: "EGP",
      saleDate: "2026-08-31",
    };
  }
  if (kind === "dispose") {
    return {
      disposalDate: "2026-08-31",
      expectedHoldingRevision,
      holdingId: HOLDING_ID,
      notes: null,
      predecessorEventId,
      reason: "given_away",
      reversesEventId: null,
    };
  }
  return {
    expectedHoldingRevision,
    holdingId: HOLDING_ID,
    predecessorEventId,
    reversesEventId: kind === "undo" ? reversesEventId : null,
  };
}

function commandInput(
  kind: MetalActionKind,
  id: string,
  expectedHoldingRevision: string | null,
  predecessorEventId: string | null,
  reversesEventId: string | null = null,
  userId = USER_ID
): CreateMetalFinancialActionEnvelopeInput {
  return {
    actionId: id,
    userId,
    holdingId: HOLDING_ID,
    kind,
    expectedHoldingRevision,
    occurredAt: "2026-08-31T10:15:30.123Z",
    domainPayload: payloadFor(
      kind,
      expectedHoldingRevision,
      predecessorEventId,
      reversesEventId
    ),
    validationInput: VALIDATION_INPUT,
  };
}

async function createDatabase(): Promise<{
  readonly adapter: SQLiteAdapter;
  readonly database: Database;
}> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  return {
    adapter,
    database: new Database({ adapter, modelClasses: MODEL_CLASSES }),
  };
}

function createService(
  database: Database,
  currentUserId = USER_ID
): ReturnType<typeof createMetalHoldingCommandService> {
  return createMetalHoldingCommandService({
    repository: createMetalFinancialActionRepository(
      createWatermelonMetalFinancialActionRepositoryDependencies({
        database,
        getCurrentUserId: () => Promise.resolve(currentUserId),
      })
    ),
    hashProvider: sha256Provider,
  });
}

async function count(database: Database, table: string): Promise<number> {
  return database.get<Model>(table).query().fetchCount();
}

describe("Metals financial action foundation", () => {
  it.each(METAL_ACTION_KINDS)(
    "builds the approved canonical %s envelope with no account effect",
    (kind) => {
      const expectedRevision = kind === "add" ? null : "0";
      const predecessor = kind === "add" ? null : actionId(1);
      const envelope = createMetalFinancialActionEnvelope(
        commandInput(
          kind,
          actionId(20 + METAL_ACTION_KINDS.indexOf(kind)),
          expectedRevision,
          predecessor,
          kind === "undo" ? predecessor : null
        )
      );

      expect(envelope.accountGuards).toEqual([]);
      expect(envelope.payload.expectedHoldingRevision).toBe(expectedRevision);
      expect(envelope.payloadVersion).toBe(
        kind === "sell" ? "metals.sell/v2" : "metals." + kind + "/v1"
      );
    }
  );

  it("commits Add, Correct, Sell, Undo, Dispose, Undo, and Delete atomically in real SQLite", async () => {
    const { adapter, database } = await createDatabase();
    const service = createService(database);
    const inputs = [
      commandInput("add", actionId(1), null, null),
      commandInput("correct", actionId(2), "0", actionId(1)),
      commandInput("sell", actionId(3), "1", actionId(2)),
      commandInput("undo", actionId(4), "2", actionId(3), actionId(3)),
      commandInput("dispose", actionId(5), "3", actionId(4)),
      commandInput("undo", actionId(6), "4", actionId(5), actionId(5)),
      commandInput("delete", actionId(7), "5", actionId(6)),
    ];

    for (const input of inputs) {
      await expect(service.execute(input)).resolves.toMatchObject({
        actionId: input.actionId,
        kind: "committed",
      });
    }

    expect(await count(database, "financial_action_groups")).toBe(7);
    expect(await count(database, "metal_action_evidence")).toBe(7);
    expect(await count(database, "metal_lifecycle_events")).toBe(7);
    expect(await count(database, "metal_rate_references")).toBe(7);
    const roots = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    expect(roots.every((root) => root.accountGuardsJson === "[]")).toBe(true);
    expect(
      roots.every((root) => !("expected_holding_revision" in root._raw))
    ).toBe(true);

    const evidence = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    expect(evidence.map((row) => row.expectedHoldingRevision)).toEqual([
      null,
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(new Set(evidence.map((row) => row.actionId)).size).toBe(7);

    const events = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(new Set(events.map((row) => row.actionId)).size).toBe(7);
    expect(events.filter((event) => event.isHistoryVisible)).toHaveLength(6);
    expect(JSON.parse(events[1]?.payloadJson ?? "{}")).toMatchObject({
      expectedHoldingRevision: "0",
    });

    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      effectiveActionId: actionId(7),
      effectiveEventId: actionId(7),
      financialRevision: "6",
      holdingId: HOLDING_ID,
      isVisible: false,
      status: "active",
      userId: USER_ID,
    });

    const [asset] = await database.get<Asset>("assets").query().fetch();
    const [metal] = await database
      .get<AssetMetal>("asset_metals")
      .query()
      .fetch();
    expect(asset).toMatchObject({
      acquisitionActionId: actionId(2),
      purchasePriceDecimal: "151000",
      userId: USER_ID,
    });
    expect(metal).toMatchObject({
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      weightGramsDecimal: "10.25",
    });

    const addEnvelope = createMetalFinancialActionEnvelope(inputs[0]);
    const expectedHash = await hashFinancialActionEnvelope(
      addEnvelope,
      sha256Provider,
      DEFAULT_FINANCIAL_ACTION_REGISTRY,
      VALIDATION_INPUT
    );
    expect(roots.find((root) => root.actionId === actionId(1))).toMatchObject({
      payloadHash: expectedHash.payloadHash,
      payloadJson: expectedHash.canonicalText,
    });

    const clonedAdapter = await adapter.testClone();
    const reopened = new Database({
      adapter: clonedAdapter,
      modelClasses: MODEL_CLASSES,
    });
    await expect(
      createService(reopened).execute(inputs[0])
    ).resolves.toMatchObject({
      actionId: actionId(1),
      kind: "replay",
    });
    expect(await count(reopened, "financial_action_groups")).toBe(7);
  });

  it("allows one expected-revision winner and leaves the stale loser unwritten", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    await expect(
      service.execute(commandInput("dispose", actionId(3), "0", actionId(1)))
    ).rejects.toThrow("metal_holding_revision_stale");

    expect(await count(database, "financial_action_groups")).toBe(2);
    expect(await count(database, "metal_action_evidence")).toBe(2);
    expect(await count(database, "metal_lifecycle_events")).toBe(2);
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state?.financialRevision).toBe("1");
  });

  it("binds correction and sale facts to the owned current projection", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));

    const correction = commandInput("correct", actionId(2), "0", actionId(1));
    await expect(
      service.execute({
        ...correction,
        domainPayload: {
          ...correction.domainPayload,
          materialCorrection: {
            ...(correction.domainPayload.materialCorrection as Record<
              string,
              unknown
            >),
            before: materialFacts("149999"),
          },
        },
      })
    ).rejects.toThrow("metal_action_projection_mismatch");

    const sale = commandInput("sell", actionId(3), "0", actionId(1));
    const usdRateSnapshots = (
      sale.domainPayload.rateSnapshots as ReadonlyArray<Record<string, unknown>>
    ).map((snapshot) =>
      snapshot.kind === "currency"
        ? { ...snapshot, instrumentCode: "currency:USD", valueDecimal: "1" }
        : snapshot
    );
    await expect(
      service.execute({
        ...sale,
        domainPayload: {
          ...sale.domainPayload,
          purchaseCurrency: "USD",
          rateSnapshots: usdRateSnapshots,
          saleCurrency: "USD",
        },
      })
    ).rejects.toThrow("metal_action_projection_mismatch");
    expect(await count(database, "financial_action_groups")).toBe(1);
  });

  it("rejects a disposal date before acquisition", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    const disposal = commandInput("dispose", actionId(2), "0", actionId(1));

    await expect(
      service.execute({
        ...disposal,
        domainPayload: {
          ...disposal.domainPayload,
          disposalDate: "2026-08-29",
        },
      })
    ).rejects.toThrow("metal_disposal_before_acquisition");
  });

  it("allows the first real action on a revision-zero migrated holding", async () => {
    const { database } = await createDatabase();
    await database.write(async (): Promise<void> => {
      const asset = database.get<Asset>("assets").prepareCreate((row) => {
        row._raw.id = HOLDING_ID;
        row.deleted = false;
        row.isLiquid = false;
        row.name = "Legacy gold";
        row.type = "METAL";
        row.userId = USER_ID;
        applyLegacyAssetFacts(row);
      });
      const metal = database
        .get<AssetMetal>("asset_metals")
        .prepareCreate((row) => {
          row._raw.id = HOLDING_ID;
          row.assetId = HOLDING_ID;
          row.deleted = false;
          row.itemForm = "JEWELRY";
          row.metalType = "GOLD";
          row.purityCatalogVersion = "1";
          row.purityCode = "gold-9999";
          row.purityFactorDecimal = "0.9999";
          row.purityFraction = 0.9999;
          row.weightGrams = 10.25;
          row.weightGramsDecimal = "10.25";
        });
      const state = database
        .get<MetalHoldingState>("metal_holding_states")
        .prepareCreate((row) => {
          row._raw.id = HOLDING_ID;
          row.deleted = false;
          row.effectiveActionId = null;
          row.effectiveEventId = null;
          row.financialRevision = "0";
          row.holdingId = HOLDING_ID;
          row.isVisible = true;
          row.reconciliationState = "accepted";
          row.status = "active";
          row.userId = USER_ID;
        });
      await database.batch(asset, metal, state);
    });

    await expect(
      createService(database).execute(
        commandInput("dispose", actionId(8), "0", null)
      )
    ).resolves.toMatchObject({ kind: "committed" });
  });

  it("advances metadata clocks with a mixed material correction", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    const correction = commandInput("correct", actionId(2), "0", actionId(1));
    await service.execute({
      ...correction,
      domainPayload: {
        ...correction.domainPayload,
        metadataChange: {
          before: { name: "Savings gold", notes: null },
          after: { name: "Corrected gold", notes: "Receipt checked" },
        },
      },
    });

    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      nameWrittenAt: Date.parse(correction.occurredAt),
      nameWriterId: correction.actionId,
      notesWrittenAt: Date.parse(correction.occurredAt),
      notesWriterId: correction.actionId,
    });
  });

  it("persists accepted reconciliation before acknowledgement and survives restart", async () => {
    const { adapter, database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));

    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          accountRevisions: [],
          actionId: actionId(1),
          effectiveEventId: actionId(1),
          holdingRevision: "0",
          payloadHashMatches: true,
          serverAcceptedAt: "2026-08-31T10:16:00.123Z",
          status: "accepted",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("accepted");

    const batchSpy = jest.spyOn(database, "batch");
    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          accountRevisions: [],
          actionId: actionId(1),
          effectiveEventId: actionId(1),
          holdingRevision: "0",
          payloadHashMatches: true,
          serverAcceptedAt: "2026-08-31T10:16:00.123Z",
          status: "idempotent",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("accepted");
    expect(batchSpy).not.toHaveBeenCalled();

    const reopened = new Database({
      adapter: await adapter.testClone(),
      modelClasses: MODEL_CLASSES,
    });
    const [root] = await reopened
      .get<FinancialActionGroup>("financial_action_groups")
      .query()
      .fetch();
    const [evidence] = await reopened
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    const [state] = await reopened
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(root).toMatchObject({
      serverOutcome: "accepted",
      state: "accepted",
    });
    expect(root?.outcomeJson).toContain('"status":"accepted"');
    expect(evidence?.canonicalHoldingRevision).toBe("0");
    expect(state?.reconciliationState).toBe("accepted");
  });

  it("durably rolls back a rejected material correction and locks a stale projection", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    const rejectedOutcome = {
      actionId: actionId(2),
      code: "INVALID_LINK" as const,
      payloadHashMatches: true,
      status: "rejected" as const,
      userId: USER_ID,
    };
    await expect(
      commitMetalRpcOutcomeLocally(database, rejectedOutcome, USER_ID)
    ).resolves.toBe("reconciled");
    const [asset] = await database.get<Asset>("assets").query().fetch();
    const [rejectedRoot] = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", actionId(2)))
      .fetch();
    const [restoredState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(asset?.purchasePriceDecimal).toBe("150000");
    expect(rejectedRoot).toMatchObject({
      rejectionCode: "INVALID_LINK",
      serverOutcome: "rejected",
      state: "reconciled",
    });
    expect(rejectedRoot?.outcomeJson).toContain('"status":"rejected"');
    expect(restoredState).toMatchObject({
      effectiveActionId: actionId(1),
      financialRevision: "0",
      isVisible: true,
      reconciliationState: "reconciled",
    });
    const batchSpy = jest.spyOn(database, "batch");
    await expect(
      commitMetalRpcOutcomeLocally(database, rejectedOutcome, USER_ID)
    ).resolves.toBe("reconciled");
    expect(batchSpy).not.toHaveBeenCalled();

    await service.execute(
      commandInput("dispose", actionId(3), "0", actionId(1))
    );
    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          actionId: actionId(3),
          canonicalAccounts: [],
          canonicalHoldingActionId: actionId(2),
          canonicalHoldingEvidenceHash: "a".repeat(64),
          canonicalHoldingRevision: "1",
          code: "HOLDING_REVISION_STALE",
          payloadHashMatches: true,
          staleAccountIds: [],
          status: "stale",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("incomplete");
    const [staleRoot] = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(Q.where("action_id", actionId(3)))
      .fetch();
    const [lockedState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(staleRoot).toMatchObject({
      rejectionCode: "HOLDING_REVISION_STALE",
      serverOutcome: "stale",
      state: "reconciliation_incomplete",
    });
    expect(staleRoot?.outcomeJson).toContain('"status":"stale"');
    expect(lockedState).toMatchObject({
      isVisible: false,
      reconciliationState: "reconciliation_incomplete",
    });
  });

  it("reconciles sequential accepted actions without clobbering the latest local state", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );

    await commitMetalRpcOutcomeLocally(
      database,
      {
        accountRevisions: [],
        actionId: actionId(1),
        effectiveEventId: actionId(1),
        holdingRevision: "0",
        payloadHashMatches: true,
        serverAcceptedAt: "2026-08-31T10:16:00.123Z",
        status: "accepted",
        userId: USER_ID,
      },
      USER_ID
    );
    const [pendingLatestState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(pendingLatestState).toMatchObject({
      effectiveActionId: actionId(2),
      financialRevision: "1",
      reconciliationState: "local_complete",
    });

    await commitMetalRpcOutcomeLocally(
      database,
      {
        accountRevisions: [],
        actionId: actionId(2),
        effectiveEventId: actionId(2),
        holdingRevision: "1",
        payloadHashMatches: true,
        serverAcceptedAt: "2026-08-31T10:16:01.123Z",
        status: "accepted",
        userId: USER_ID,
      },
      USER_ID
    );
    const [acceptedLatestState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(acceptedLatestState?.reconciliationState).toBe("accepted");
  });

  it("restores the terminal state when an optimistic Undo is rejected", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(commandInput("sell", actionId(2), "0", actionId(1)));
    await service.execute(
      commandInput("undo", actionId(3), "1", actionId(2), actionId(2))
    );

    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          actionId: actionId(3),
          code: "INVALID_STATE",
          payloadHashMatches: true,
          status: "rejected",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("reconciled");
    const [state] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    expect(state).toMatchObject({
      effectiveActionId: actionId(2),
      financialRevision: "1",
      isVisible: true,
      reconciliationState: "reconciled",
      status: "sold",
    });
  });

  it("replays one action/hash, rejects payload mismatch, and skips linked writes", async () => {
    const { database } = await createDatabase();
    const service = createService(database);
    const input = commandInput("add", actionId(1), null, null);

    await expect(service.execute(input)).resolves.toMatchObject({
      kind: "committed",
    });
    await expect(service.execute(input)).resolves.toMatchObject({
      kind: "replay",
    });
    await expect(
      service.execute({
        ...input,
        domainPayload: {
          ...input.domainPayload,
          metadata: { name: "Different", notes: null },
        },
      })
    ).rejects.toThrow("action_id_payload_mismatch");

    expect(await count(database, "financial_action_groups")).toBe(1);
    expect(await count(database, "metal_action_evidence")).toBe(1);
    expect(await count(database, "metal_lifecycle_events")).toBe(1);
  });

  it("rolls back a failed batch and rejects cross-user writes", async () => {
    const { adapter, database } = await createDatabase();
    const service = createService(database);
    jest
      .spyOn(database.adapter, "batch")
      .mockRejectedValueOnce(new Error("write_failed"));

    await expect(
      service.execute(commandInput("add", actionId(1), null, null))
    ).rejects.toThrow("write_failed");
    expect(await count(database, "financial_action_groups")).toBe(0);
    expect(await count(database, "metal_action_evidence")).toBe(0);
    expect(await count(database, "metal_lifecycle_events")).toBe(0);

    const foreignService = createService(database);
    await expect(
      foreignService.execute(
        commandInput("add", actionId(2), null, null, null, FOREIGN_USER_ID)
      )
    ).rejects.toThrow("financial_action_auth_scope_changed");
    expect(await count(database, "financial_action_groups")).toBe(0);
    await adapter.initializingPromise;
  });

  it("rejects noncanonical or overflowing revision values before persistence", () => {
    for (const revision of [
      "",
      "00",
      "01",
      "-1",
      "1.0",
      "9223372036854775808",
    ]) {
      expect(() => assertCanonicalMetalRevision(revision)).toThrow(
        "invalid_metal_revision"
      );
    }
    expect(assertCanonicalMetalRevision("9223372036854775807")).toBe(
      "9223372036854775807"
    );
  });
});

function applyLegacyAssetFacts(asset: Asset): void {
  asset.currency = "EGP";
  asset.purchaseCurrency = "EGP";
  asset.purchaseDate = new Date("2026-08-30T00:00:00.000Z");
  asset.purchasePrice = 150000;
  asset.purchasePriceDecimal = "150000";
}
