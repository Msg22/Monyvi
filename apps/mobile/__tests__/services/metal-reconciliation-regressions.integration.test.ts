import { Database, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { hashFinancialActionEnvelope } from "@monyvi/logic";
import { schema } from "../../../../packages/db/src/schema";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { AssetMetal } from "../../../../packages/db/src/models/AssetMetal";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalActionEvidence } from "../../../../packages/db/src/models/MetalActionEvidence";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import { MetalRateReference } from "../../../../packages/db/src/models/MetalRateReference";
import { createMetalFinancialActionEnvelope } from "../../services/metal-financial-action-adapter";
import { createMetalHoldingCommandService } from "../../services/metal-holding-command-service";
import {
  createMetalFinancialActionRepository,
  createWatermelonMetalFinancialActionRepositoryDependencies,
} from "../../services/metal-financial-action-repository";
import {
  commitMetalRpcOutcomeLocally,
  type CanonicalMetalActionGroup,
  type CanonicalMetalHolding,
} from "../../services/metal-reconciliation-service";
import {
  HOLDING_ID,
  USER_ID,
  VALIDATION_INPUT,
  actionId,
  commandInput,
  rateSnapshot,
  sha256Provider,
} from "./metal-financial-action-test-data";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn(),
  supabase: {},
}));

const MODEL_CLASSES: Array<typeof Model> = [
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
];

async function createDatabase(): Promise<Database> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  return new Database({ adapter, modelClasses: MODEL_CLASSES });
}

function createService(
  database: Database
): ReturnType<typeof createMetalHoldingCommandService> {
  return createMetalHoldingCommandService({
    repository: createMetalFinancialActionRepository(
      createWatermelonMetalFinancialActionRepositoryDependencies({
        database,
        getCurrentUserId: () => Promise.resolve(USER_ID),
      })
    ),
    hashProvider: sha256Provider,
  });
}

async function seedLegacyHolding(database: Database): Promise<void> {
  await database.write(async (): Promise<void> => {
    const asset = database.get<Asset>("assets").prepareCreate((row) => {
      row._raw.id = HOLDING_ID;
      row.acquisitionActionId = null;
      row.currency = "EGP";
      row.deleted = false;
      row.isLiquid = false;
      row.name = "Legacy gold";
      row.notes = null;
      row.purchaseCurrency = null;
      row.purchaseDate = new Date(2026, 7, 30);
      row.purchasePrice = 150000;
      row.purchasePriceDecimal = null;
      row.type = "METAL";
      row.userId = USER_ID;
    });
    const metal = database
      .get<AssetMetal>("asset_metals")
      .prepareCreate((row) => {
        row._raw.id = HOLDING_ID;
        row.assetId = HOLDING_ID;
        row.deleted = false;
        row.itemForm = undefined;
        row.metalType = "GOLD";
        row.purityCatalogVersion = null;
        row.purityCode = null;
        row.purityFactorDecimal = null;
        row.purityFraction = 0.9999;
        row.weightGrams = 10.25;
        row.weightGramsDecimal = null;
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
        row.nameWrittenAt = null;
        row.nameWriterId = null;
        row.notesWrittenAt = null;
        row.notesWriterId = null;
        row.reconciliationState = "accepted";
        row.status = "active";
        row.userId = USER_ID;
      });
    await database.batch(asset, metal, state);
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

async function digest(value: unknown): Promise<string> {
  return sha256Provider.digestUtf8(canonicalJson(value));
}

function requiredString(
  value: Readonly<Record<string, unknown>>,
  key: string
): string {
  const candidate = value[key];
  if (typeof candidate !== "string") throw new Error("invalid_test_rate");
  return candidate;
}

function nullableString(
  value: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const candidate = value[key];
  if (candidate === null) return null;
  if (typeof candidate !== "string") throw new Error("invalid_test_rate");
  return candidate;
}

async function createWinnerEvidence(): Promise<{
  readonly canonicalActionGroup: CanonicalMetalActionGroup;
  readonly canonicalHolding: CanonicalMetalHolding;
  readonly canonicalHoldingEvidenceHash: string;
}> {
  const winnerBase = commandInput("correct", actionId(3), "0", actionId(1));
  const winnerCorrection = winnerBase.domainPayload
    .materialCorrection as Readonly<Record<string, unknown>>;
  const winnerInput = {
    ...winnerBase,
    domainPayload: {
      ...winnerBase.domainPayload,
      materialCorrection: {
        ...winnerCorrection,
        rateSnapshots: [
          rateSnapshot(actionId(114), "acquisition_purchase_currency"),
          rateSnapshot(actionId(113), "acquisition_metal"),
        ],
      },
    },
  };
  const envelope = createMetalFinancialActionEnvelope(winnerInput);
  const hashed = await hashFinancialActionEnvelope(
    envelope,
    sha256Provider,
    undefined,
    VALIDATION_INPUT
  );
  const payload = envelope.payload as Readonly<Record<string, unknown>>;
  const correction = payload.materialCorrection as Readonly<
    Record<string, unknown>
  >;
  const snapshots = correction.rateSnapshots as ReadonlyArray<
    Readonly<Record<string, unknown>>
  >;
  const evidence = {
    id: actionId(3),
    actionId: actionId(3),
    canonicalHoldingRevision: "1",
    createdAt: "2026-08-31T10:15:30.123Z",
    deleted: false,
    domainPayloadJson: canonicalJson(payload),
    expectedHoldingRevision: "0",
    holdingId: HOLDING_ID,
    kind: "correct",
    updatedAt: "2026-08-31T10:15:30.123Z",
    userId: USER_ID,
  };
  const event = {
    id: actionId(3),
    actionId: actionId(3),
    createdAt: "2026-08-31T10:15:30.123Z",
    deleted: false,
    holdingId: HOLDING_ID,
    isEffective: true,
    isHistoryVisible: true,
    kind: "correct",
    occurredAt: "2026-08-31T10:15:30.123Z",
    payloadJson: canonicalJson(payload),
    predecessorEventId: actionId(1),
    reversesEventId: null,
    updatedAt: "2026-08-31T10:15:30.123Z",
    userId: USER_ID,
  };
  const canonicalHolding: CanonicalMetalHolding = {
    holdingId: HOLDING_ID,
    asset: {
      acquisitionActionId: actionId(3),
      currency: "EGP",
      name: "Savings gold",
      notes: null,
      purchaseCurrency: "EGP",
      purchaseDate: "2026-08-30",
      purchasePrice: 151000,
      purchasePriceDecimal: "151000",
    },
    metal: {
      metalType: "GOLD",
      physicalForm: "JEWELRY",
      purityCatalogVersion: "1",
      purityCode: "gold-9999",
      purityFactorDecimal: "0.9999",
      purityFraction: 0.9999,
      weightGrams: 10.25,
      weightGramsDecimal: "10.25",
    },
    state: {
      effectiveActionId: actionId(3),
      effectiveEventId: actionId(3),
      financialRevision: "1",
      isVisible: true,
      nameWrittenAt: null,
      nameWriterId: null,
      notesWrittenAt: null,
      notesWriterId: null,
      status: "active",
    },
  };
  const actionEvidenceFingerprint = await digest({
    actionId: evidence.actionId,
    canonicalHoldingRevision: evidence.canonicalHoldingRevision,
    domainPayload: JSON.parse(evidence.domainPayloadJson) as unknown,
    expectedHoldingRevision: evidence.expectedHoldingRevision,
    holdingId: evidence.holdingId,
    kind: evidence.kind,
    userId: evidence.userId,
  });
  const eventFingerprint = await digest({
    actionId: event.actionId,
    holdingId: event.holdingId,
    id: event.id,
    isHistoryVisible: event.isHistoryVisible,
    kind: event.kind,
    occurredAt: event.occurredAt,
    payload: JSON.parse(event.payloadJson) as unknown,
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId,
    userId: event.userId,
  });
  const canonicalHoldingEvidenceHash = await digest({
    actionEvidenceFingerprint,
    effectiveActionId: actionId(3),
    effectiveEventId: actionId(3),
    eventFingerprint,
    financialRevision: "1",
    holdingId: HOLDING_ID,
    isVisible: true,
    status: "active",
    userId: USER_ID,
  });
  const rates: CanonicalMetalActionGroup["rates"] = snapshots
    .map((snapshot) => ({
      id: requiredString(snapshot, "referenceId"),
      actionId: actionId(3),
      capturedAt: requiredString(snapshot, "capturedAt"),
      capturedFreshness: requiredString(snapshot, "capturedFreshness"),
      createdAt: "2026-08-31T10:15:30.123Z",
      deleted: false,
      holdingId: HOLDING_ID,
      instrumentCode: requiredString(snapshot, "instrumentCode"),
      kind: requiredString(snapshot, "kind"),
      orientation: requiredString(snapshot, "orientation"),
      providerObservedAt: nullableString(snapshot, "providerObservedAt"),
      quality: requiredString(snapshot, "quality"),
      role: requiredString(snapshot, "role"),
      source: nullableString(snapshot, "source"),
      unit: requiredString(snapshot, "unit"),
      updatedAt: "2026-08-31T10:15:30.123Z",
      userId: USER_ID,
      valueDecimal: requiredString(snapshot, "valueDecimal"),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const canonicalActionGroup: CanonicalMetalActionGroup = {
    root: {
      id: actionId(30),
      accountGuardsJson: "[]",
      actionId: actionId(3),
      createdAt: "2026-08-31T10:15:30.123Z",
      deleted: false,
      domain: "metals",
      domainReferenceId: HOLDING_ID,
      kind: "correct",
      outcomeJson: canonicalJson({
        accountRevisions: [],
        actionId: actionId(3),
        effectiveEventId: actionId(3),
        holdingRevision: "1",
        serverAcceptedAt: "2026-08-31T10:15:30.123Z",
        status: "accepted",
      }),
      payloadHash: hashed.payloadHash,
      payloadJson: hashed.canonicalText,
      rejectionCode: null,
      serverOutcome: "accepted",
      state: "accepted",
      updatedAt: "2026-08-31T10:15:30.123Z",
      userId: USER_ID,
    },
    evidence,
    event,
    rates,
  };
  return {
    canonicalActionGroup,
    canonicalHolding,
    canonicalHoldingEvidenceHash,
  };
}

describe("Metal reconciliation regressions", () => {
  it("restores null acquisition provenance when the first material correction on a revision-zero legacy holding is rejected", async () => {
    const database = await createDatabase();
    await seedLegacyHolding(database);
    const correction = commandInput("correct", actionId(2), "0", null);
    await createService(database).execute({
      ...correction,
      domainPayload: {
        ...correction.domainPayload,
        materialCorrection: {
          after: (
            correction.domainPayload.materialCorrection as Readonly<
              Record<string, unknown>
            >
          ).after,
          before: {
            physicalForm: null,
            purchaseCurrency: null,
            purchaseDate: "2026-08-30",
            purchasePriceDecimal: null,
            purityCatalogVersion: null,
            purityCode: null,
            purityFactorDecimal: null,
            weightGramsDecimal: null,
          },
          rateSnapshots: (
            correction.domainPayload.materialCorrection as Readonly<
              Record<string, unknown>
            >
          ).rateSnapshots,
          reason: "Receipt correction",
        },
      },
    });

    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        {
          actionId: actionId(2),
          code: "INVALID_LINK",
          payloadHashMatches: true,
          status: "rejected",
          userId: USER_ID,
        },
        USER_ID
      )
    ).resolves.toBe("reconciled");

    const asset = await database.get<Asset>("assets").find(HOLDING_ID);
    expect(asset.acquisitionActionId).toBeNull();
    expect(asset.purchasePriceDecimal).toBeNull();
  });

  it("installs the complete canonical winner group atomically before reconciling a stale loser", async () => {
    const database = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );
    const winner = await createWinnerEvidence();
    const staleOutcome = {
      actionId: actionId(2),
      canonicalAccounts: [],
      canonicalHoldingActionId: actionId(3),
      canonicalHoldingEvidenceHash: winner.canonicalHoldingEvidenceHash,
      canonicalHoldingRevision: "1",
      canonicalHolding: winner.canonicalHolding,
      canonicalActionGroup: winner.canonicalActionGroup,
      code: "HOLDING_REVISION_STALE" as const,
      payloadHashMatches: true,
      staleAccountIds: [],
      status: "stale" as const,
      userId: USER_ID,
    };

    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        staleOutcome,
        USER_ID,
        sha256Provider
      )
    ).resolves.toBe("reconciled");

    await expect(
      database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetchCount()
    ).resolves.toBe(3);
    await expect(
      database
        .get<MetalActionEvidence>("metal_action_evidence")
        .query()
        .fetchCount()
    ).resolves.toBe(3);
    await expect(
      database
        .get<MetalLifecycleEvent>("metal_lifecycle_events")
        .query()
        .fetchCount()
    ).resolves.toBe(3);
    await expect(
      database
        .get<MetalRateReference>("metal_rate_references")
        .query()
        .fetchCount()
    ).resolves.toBe(6);
    const winnerRoot = (
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).find((root) => root.actionId === actionId(3));
    expect(winnerRoot).toMatchObject({
      payloadHash: winner.canonicalActionGroup.root.payloadHash,
      state: "accepted",
      userId: USER_ID,
    });

    const changedMetadataOutcome = {
      ...staleOutcome,
      canonicalHolding: {
        ...winner.canonicalHolding,
        asset: {
          ...winner.canonicalHolding.asset,
          name: "Renamed after reconciliation",
        },
        state: {
          ...winner.canonicalHolding.state,
          nameWrittenAt: 1_788_229_300_000,
          nameWriterId: actionId(9),
        },
      },
    };
    await expect(
      commitMetalRpcOutcomeLocally(
        database,
        changedMetadataOutcome,
        USER_ID,
        sha256Provider
      )
    ).resolves.toBe("reconciled");
    const loserRoot = (
      await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetch()
    ).find((root) => root.actionId === actionId(2));
    expect(loserRoot?.state).toBe("reconciled");
  });

  it("rejects a mismatched canonical winner hash without a partial local install", async () => {
    const database = await createDatabase();
    const service = createService(database);
    await service.execute(commandInput("add", actionId(1), null, null));
    await service.execute(
      commandInput("correct", actionId(2), "0", actionId(1))
    );
    const winner = await createWinnerEvidence();
    const outcome = {
      actionId: actionId(2),
      canonicalAccounts: [],
      canonicalHoldingActionId: actionId(3),
      canonicalHoldingEvidenceHash: "f".repeat(64),
      canonicalHoldingRevision: "1",
      canonicalHolding: winner.canonicalHolding,
      canonicalActionGroup: winner.canonicalActionGroup,
      code: "HOLDING_REVISION_STALE" as const,
      payloadHashMatches: true,
      staleAccountIds: [],
      status: "stale" as const,
      userId: USER_ID,
    };

    await expect(
      commitMetalRpcOutcomeLocally(database, outcome, USER_ID, sha256Provider)
    ).rejects.toThrow("incomplete_metal_action_group");
    await expect(
      database
        .get<FinancialActionGroup>("financial_action_groups")
        .query()
        .fetchCount()
    ).resolves.toBe(2);
  });
});
