import { Database, Q, type Model } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";
import { schema } from "../../../../packages/db/src/schema";
import { Asset } from "../../../../packages/db/src/models/Asset";
import { AssetMetal } from "../../../../packages/db/src/models/AssetMetal";
import { FinancialActionGroup } from "../../../../packages/db/src/models/FinancialActionGroup";
import { MetalActionEvidence } from "../../../../packages/db/src/models/MetalActionEvidence";
import { MetalHoldingState } from "../../../../packages/db/src/models/MetalHoldingState";
import { MetalLifecycleEvent } from "../../../../packages/db/src/models/MetalLifecycleEvent";
import { repairLegacyMetalAdds } from "../../services/legacy-metal-add-repair-service";

jest.mock("@nozbe/watermelondb/adapters/sqlite/makeDispatcher", (): unknown =>
  jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite/makeDispatcher/index.js"
  )
);
jest.mock("../../services/supabase", () => ({
  getCurrentUserId: jest.fn().mockResolvedValue("user-1"),
  supabase: {},
}));

const HOLDING_ID = "10000000-0000-4000-8000-000000000001";
const ACTION_ID = "20000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-09-27T10:00:00.000Z");
const models: Array<typeof Model> = [
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
];

async function createDatabase(): Promise<Database> {
  const adapter = new SQLiteAdapter({ schema });
  await adapter.initializingPromise;
  return new Database({ adapter, modelClasses: models });
}

async function seedLegacyAdd(
  database: Database,
  userId = "user-1"
): Promise<void> {
  await database.write(async () => {
    const asset = database.get<Asset>("assets").prepareCreate((row) => {
      row._raw.id = HOLDING_ID;
      row.acquisitionActionId = null;
      row.currency = "EGP";
      row.deleted = false;
      row.isLiquid = true;
      row.name = "Btc 20";
      row.notes = null;
      row.purchaseCurrency = "EGP";
      row.purchaseDate = new Date("2026-06-30T00:00:00.000Z");
      row.purchasePrice = 100000;
      row.purchasePriceDecimal = "100000";
      row.type = "METAL";
      row.updatedAt = NOW;
      row.userId = userId;
    });
    const metal = database
      .get<AssetMetal>("asset_metals")
      .prepareCreate((row) => {
        row._raw.id = "legacy-metal";
        row.assetId = HOLDING_ID;
        row.deleted = false;
        row.itemForm = "BAR";
        row.metalType = "GOLD";
        row.purityCatalogVersion = "1";
        row.purityCode = "gold-999";
        row.purityFactorDecimal = "0.999";
        row.purityFraction = 0.999;
        row.weightGrams = 20;
        row.weightGramsDecimal = "20";
        row.updatedAt = NOW;
      });
    const state = database
      .get<MetalHoldingState>("metal_holding_states")
      .prepareCreate((row) => {
        row._raw.id = "legacy-state";
        row.deleted = false;
        row.effectiveActionId = ACTION_ID;
        row.effectiveEventId = "legacy-event";
        row.financialRevision = "0";
        row.holdingId = HOLDING_ID;
        row.isVisible = true;
        row.reconciliationState = "sync_pending";
        row.status = "active";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const evidence = database
      .get<MetalActionEvidence>("metal_action_evidence")
      .prepareCreate((row) => {
        row._raw.id = "legacy-evidence";
        row.actionId = ACTION_ID;
        row.canonicalHoldingRevision = "0";
        row.deleted = false;
        row.domainPayloadJson = "{}";
        row.expectedHoldingRevision = null;
        row.holdingId = HOLDING_ID;
        row.kind = "add";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const event = database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .prepareCreate((row) => {
        row._raw.id = "legacy-event";
        row.actionId = ACTION_ID;
        row.deleted = false;
        row.holdingId = HOLDING_ID;
        row.isEffective = true;
        row.isHistoryVisible = true;
        row.kind = "created";
        row.occurredAt = NOW;
        row.payloadJson = "{}";
        row.predecessorEventId = null;
        row.reversesEventId = null;
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const root = database
      .get<FinancialActionGroup>("financial_action_groups")
      .prepareCreate((row) => {
        row._raw.id = ACTION_ID;
        row.accountGuardsJson = "[]";
        row.actionId = ACTION_ID;
        row.deleted = false;
        row.domain = "metals";
        row.domainReferenceId = HOLDING_ID;
        row.kind = "add";
        row.outcomeJson = null;
        row.payloadHash = "hash";
        row.payloadJson = JSON.stringify({
          actionId: ACTION_ID,
          domainReferenceId: HOLDING_ID,
          kind: "add",
          payload: { holdingId: HOLDING_ID, rateSnapshots: [] },
          userId,
        });
        row.rejectionCode = null;
        row.serverOutcome = null;
        row.state = "local_complete";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    await database.batch(asset, metal, state, evidence, event, root);
  });
}

const CHAINED_HOLDING_ID = "10000000-0000-4000-8000-000000000011";
const CHAINED_ADD_ACTION_ID = "20000000-0000-4000-8000-000000000012";
const CHAINED_EDIT_ACTION_ID = "20000000-0000-4000-8000-000000000013";

async function seedChainedAddEdit(
  database: Database,
  userId = "user-1"
): Promise<void> {
  await database.write(async () => {
    const asset = database.get<Asset>("assets").prepareCreate((row) => {
      row._raw.id = CHAINED_HOLDING_ID;
      row.acquisitionActionId = null;
      row.currency = "EGP";
      row.deleted = false;
      row.isLiquid = true;
      row.name = "Chained gold";
      row.notes = null;
      row.purchaseCurrency = "EGP";
      row.purchaseDate = new Date("2026-06-30T00:00:00.000Z");
      row.purchasePrice = 50000;
      row.purchasePriceDecimal = "50000";
      row.type = "METAL";
      row.updatedAt = NOW;
      row.userId = userId;
    });
    const metal = database
      .get<AssetMetal>("asset_metals")
      .prepareCreate((row) => {
        row._raw.id = "chained-metal";
        row.assetId = CHAINED_HOLDING_ID;
        row.deleted = false;
        row.itemForm = "BAR";
        row.metalType = "GOLD";
        row.purityCatalogVersion = "1";
        row.purityCode = "gold-999";
        row.purityFactorDecimal = "0.999";
        row.purityFraction = 0.999;
        row.weightGrams = 10;
        row.weightGramsDecimal = "10";
        row.updatedAt = NOW;
      });
    const state = database
      .get<MetalHoldingState>("metal_holding_states")
      .prepareCreate((row) => {
        row._raw.id = "chained-state";
        row.deleted = false;
        row.effectiveActionId = CHAINED_EDIT_ACTION_ID;
        row.effectiveEventId = CHAINED_EDIT_ACTION_ID;
        row.financialRevision = "1";
        row.holdingId = CHAINED_HOLDING_ID;
        row.isVisible = true;
        row.reconciliationState = "sync_pending";
        row.status = "active";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const evidence = database
      .get<MetalActionEvidence>("metal_action_evidence")
      .prepareCreate((row) => {
        row._raw.id = "chained-evidence";
        row.actionId = CHAINED_ADD_ACTION_ID;
        row.canonicalHoldingRevision = "0";
        row.deleted = false;
        row.domainPayloadJson = "{}";
        row.expectedHoldingRevision = null;
        row.holdingId = CHAINED_HOLDING_ID;
        row.kind = "add";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const event = database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .prepareCreate((row) => {
        row._raw.id = "chained-event";
        row.actionId = CHAINED_ADD_ACTION_ID;
        row.deleted = false;
        row.holdingId = CHAINED_HOLDING_ID;
        row.isEffective = true;
        row.isHistoryVisible = true;
        row.kind = "created";
        row.occurredAt = NOW;
        row.payloadJson = "{}";
        row.predecessorEventId = null;
        row.reversesEventId = null;
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const editEvent = database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .prepareCreate((row) => {
        row._raw.id = CHAINED_EDIT_ACTION_ID;
        row.actionId = CHAINED_EDIT_ACTION_ID;
        row.deleted = false;
        row.holdingId = CHAINED_HOLDING_ID;
        row.isEffective = true;
        row.isHistoryVisible = true;
        row.kind = "correct";
        row.occurredAt = NOW;
        row.payloadJson = "{}";
        row.predecessorEventId = "chained-event";
        row.reversesEventId = null;
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const addRoot = database
      .get<FinancialActionGroup>("financial_action_groups")
      .prepareCreate((row) => {
        row._raw.id = CHAINED_ADD_ACTION_ID;
        row.accountGuardsJson = "[]";
        row.actionId = CHAINED_ADD_ACTION_ID;
        row.deleted = false;
        row.domain = "metals";
        row.domainReferenceId = CHAINED_HOLDING_ID;
        row.kind = "add";
        row.outcomeJson = null;
        row.payloadHash = "hash";
        row.payloadJson = JSON.stringify({
          actionId: CHAINED_ADD_ACTION_ID,
          domainReferenceId: CHAINED_HOLDING_ID,
          kind: "add",
          payload: { holdingId: CHAINED_HOLDING_ID, rateSnapshots: [] },
          userId,
        });
        row.rejectionCode = null;
        row.serverOutcome = null;
        row.state = "local_complete";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    const editRoot = database
      .get<FinancialActionGroup>("financial_action_groups")
      .prepareCreate((row) => {
        row._raw.id = CHAINED_EDIT_ACTION_ID;
        row.accountGuardsJson = "[]";
        row.actionId = CHAINED_EDIT_ACTION_ID;
        row.deleted = false;
        row.domain = "metals";
        row.domainReferenceId = CHAINED_HOLDING_ID;
        row.kind = "correct";
        row.outcomeJson = null;
        row.payloadHash = "hash";
        row.payloadJson = JSON.stringify({
          actionId: CHAINED_EDIT_ACTION_ID,
          domainReferenceId: CHAINED_HOLDING_ID,
          kind: "correct",
          payload: { holdingId: CHAINED_HOLDING_ID, rateSnapshots: [] },
          userId,
        });
        row.rejectionCode = null;
        row.serverOutcome = null;
        row.state = "sync_pending";
        row.updatedAt = NOW;
        row.userId = userId;
      });
    await database.batch(
      asset,
      metal,
      state,
      evidence,
      event,
      editEvent,
      addRoot,
      editRoot
    );
  });
}

describe("legacy Metal Add repair", () => {
  it("rekeys a pending local Add atomically and can run again safely", async () => {
    const database = await createDatabase();
    await seedLegacyAdd(database);
    await repairLegacyMetalAdds(database, "user-1");
    await repairLegacyMetalAdds(database, "user-1");
    const metal = await database
      .get<AssetMetal>("asset_metals")
      .query()
      .fetch();
    const state = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query()
      .fetch();
    const evidence = await database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query()
      .fetch();
    const event = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    const [asset] = await database
      .get<Asset>("assets")
      .query(Q.where("id", HOLDING_ID))
      .fetch();
    expect(metal.map((row) => row.id)).toEqual([HOLDING_ID]);
    expect(state.map((row) => row.id)).toEqual([HOLDING_ID]);
    expect(evidence.map((row) => row.id)).toEqual([ACTION_ID]);
    expect(event.map((row) => [row.id, row.kind])).toEqual([
      [ACTION_ID, "add"],
    ]);
    expect(state[0]).toMatchObject({
      effectiveEventId: ACTION_ID,
      reconciliationState: "local_complete",
    });
    expect(asset).toMatchObject({
      name: "Btc 20",
      purchasePriceDecimal: "100000",
      acquisitionActionId: ACTION_ID,
      isLiquid: false,
    });
  });

  it("never rewrites another user's pending Add", async () => {
    const database = await createDatabase();
    await seedLegacyAdd(database, "user-2");
    await repairLegacyMetalAdds(database, "user-1");
    const [event] = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query()
      .fetch();
    expect(event).toMatchObject({ id: "legacy-event", kind: "created" });
  });

  it("preserves a chained Add+Edit, repairs an independent Add, and reports the skip", async () => {
    const database = await createDatabase();
    await seedChainedAddEdit(database);
    await seedLegacyAdd(database);

    const result = await repairLegacyMetalAdds(database, "user-1");

    expect(result.repaired).toBe(1);
    expect(result.skipped).toEqual([
      { actionId: CHAINED_ADD_ACTION_ID, reason: "superseded" },
    ]);
    const [chainedState] = await database
      .get<MetalHoldingState>("metal_holding_states")
      .query(Q.where("holding_id", CHAINED_HOLDING_ID))
      .fetch();
    expect(chainedState).toMatchObject({
      id: "chained-state",
      effectiveActionId: CHAINED_EDIT_ACTION_ID,
    });
    const [chainedEvent] = await database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(Q.where("id", "chained-event"))
      .fetch();
    expect(chainedEvent).toMatchObject({ kind: "created" });
    const stateIds = (
      await database.get<MetalHoldingState>("metal_holding_states").query().fetch()
    ).map((row) => row.id);
    expect(stateIds).toContain(HOLDING_ID);
  });
});
