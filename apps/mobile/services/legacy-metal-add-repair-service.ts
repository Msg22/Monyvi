import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import { getCurrentUserDataScope } from "./user-data-access";

interface LegacyAddRows {
  readonly asset: Asset;
  readonly metal: AssetMetal;
  readonly state: MetalHoldingState;
  readonly evidence: MetalActionEvidence;
  readonly event: MetalLifecycleEvent;
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}

async function readLegacyAddRows(
  database: Database,
  root: FinancialActionGroup,
  userId: string
): Promise<LegacyAddRows | null> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== userId) throw new Error("sync_push_auth_scope_lost");
  const asset = await scope.findOwned(
    database.get<Asset>("assets"),
    root.domainReferenceId
  );
  const [metals, states, evidence, events] = await Promise.all([
    scope
      .queryChildrenOfOwnedParent(
        database.get<AssetMetal>("asset_metals"),
        asset,
        "asset_id",
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalHoldingState>("metal_holding_states"),
        Q.where("holding_id", asset.id),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("action_id", root.actionId),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
        Q.where("action_id", root.actionId),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  if (events.length === 1 && events[0].kind !== "created") return null;
  if (
    metals.length !== 1 ||
    states.length !== 1 ||
    evidence.length !== 1 ||
    events.length !== 1
  ) {
    throw new Error("legacy_metal_add_incomplete");
  }
  const [metal] = metals;
  const [state] = states;
  const [actionEvidence] = evidence;
  const [event] = events;
  if (
    asset.type !== "METAL" ||
    metal.id === asset.id ||
    state.id === asset.id ||
    actionEvidence.id === root.actionId ||
    event.id === root.actionId ||
    actionEvidence.kind !== "add" ||
    state.effectiveActionId !== root.actionId ||
    state.effectiveEventId !== event.id ||
    !state.isVisible
  )
    throw new Error("legacy_metal_add_incomplete");
  return { asset, metal, state, evidence: actionEvidence, event };
}

function prepareCanonicalMetal(
  database: Database,
  rows: LegacyAddRows
): AssetMetal {
  return database.get<AssetMetal>("asset_metals").prepareCreate((row) => {
    setPreparedId(row, rows.asset.id);
    row.assetId = rows.asset.id;
    row.deleted = false;
    row.itemForm = rows.metal.itemForm;
    row.metalType = rows.metal.metalType;
    row.purityCatalogVersion = rows.metal.purityCatalogVersion;
    row.purityCode = rows.metal.purityCode;
    row.purityFactorDecimal = rows.metal.purityFactorDecimal;
    row.purityFraction = rows.metal.purityFraction;
    row.weightGrams = rows.metal.weightGrams;
    row.weightGramsDecimal = rows.metal.weightGramsDecimal;
    row.updatedAt = new Date();
  });
}

function prepareCanonicalState(
  database: Database,
  rows: LegacyAddRows,
  actionId: string
): MetalHoldingState {
  return database
    .get<MetalHoldingState>("metal_holding_states")
    .prepareCreate((row) => {
      setPreparedId(row, rows.asset.id);
      row.deleted = false;
      row.effectiveActionId = actionId;
      row.effectiveEventId = actionId;
      row.financialRevision = rows.state.financialRevision;
      row.holdingId = rows.asset.id;
      row.isVisible = true;
      row.nameWrittenAt = rows.state.nameWrittenAt;
      row.nameWriterId = rows.state.nameWriterId;
      row.notesWrittenAt = rows.state.notesWrittenAt;
      row.notesWriterId = rows.state.notesWriterId;
      row.reconciliationState = "local_complete";
      row.status = rows.state.status;
      row.updatedAt = new Date();
      row.userId = rows.state.userId;
    });
}

function prepareCanonicalEvidence(
  database: Database,
  rows: LegacyAddRows,
  actionId: string
): MetalActionEvidence {
  return database
    .get<MetalActionEvidence>("metal_action_evidence")
    .prepareCreate((row) => {
      setPreparedId(row, actionId);
      row.actionId = actionId;
      row.canonicalHoldingRevision = null;
      row.deleted = false;
      row.domainPayloadJson = rows.evidence.domainPayloadJson;
      row.expectedHoldingRevision = rows.evidence.expectedHoldingRevision;
      row.holdingId = rows.asset.id;
      row.kind = "add";
      row.updatedAt = new Date();
      row.userId = rows.evidence.userId;
    });
}

function prepareCanonicalEvent(
  database: Database,
  rows: LegacyAddRows,
  actionId: string
): MetalLifecycleEvent {
  return database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((row) => {
      setPreparedId(row, actionId);
      row.actionId = actionId;
      row.deleted = false;
      row.holdingId = rows.asset.id;
      row.isEffective = rows.event.isEffective;
      row.isHistoryVisible = rows.event.isHistoryVisible;
      row.kind = "add";
      row.occurredAt = rows.event.occurredAt;
      row.payloadJson = rows.event.payloadJson;
      row.predecessorEventId = null;
      row.reversesEventId = null;
      row.updatedAt = new Date();
      row.userId = rows.event.userId;
    });
}

/** Repair only locally pending legacy Adds before sync captures their changes. */
export async function repairLegacyMetalAdds(
  database: Database,
  userId: string
): Promise<void> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== userId) throw new Error("sync_push_auth_scope_lost");
  const roots = await scope
    .queryOwned(
      database.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("domain", "metals"),
      Q.where("kind", "add"),
      Q.where("state", "local_complete"),
      Q.where("deleted", false)
    )
    .fetch();
  for (const root of roots) {
    if (root.serverOutcome !== null) continue;
    await database.write(async () => {
      const rows = await readLegacyAddRows(database, root, userId);
      if (rows === null) return;
      const operations: Model[] = [
        rows.metal.prepareDestroyPermanently(),
        rows.state.prepareDestroyPermanently(),
        rows.evidence.prepareDestroyPermanently(),
        rows.event.prepareDestroyPermanently(),
        rows.asset.prepareUpdate((asset) => {
          asset.acquisitionActionId = root.actionId;
          asset.isLiquid = false;
          asset.updatedAt = new Date();
        }),
        prepareCanonicalMetal(database, rows),
        prepareCanonicalState(database, rows, root.actionId),
        prepareCanonicalEvidence(database, rows, root.actionId),
        prepareCanonicalEvent(database, rows, root.actionId),
      ];
      await database.batch(...operations);
    });
  }
}
