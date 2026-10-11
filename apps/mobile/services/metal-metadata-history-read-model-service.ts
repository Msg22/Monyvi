import { Q, type Database, type Query } from "@nozbe/watermelondb";
import {
  database as defaultDatabase,
  type FinancialActionGroup,
} from "@monyvi/db";
import type { MetalDetailLifecycleEventInput } from "./metal-detail-read-model-service";

import {
  projectAppliedMetalMetadataHistory,
  type MetalMetadataHistoryEvent,
  type MetalMetadataHistoryRecord,
} from "./metal-metadata-evidence";
import {
  shapeMetalMetadataHistoryRecord,
  type MetalMetadataEditRecord,
} from "./metal-metadata-evidence-repository";
import {
  getCurrentUserDataScope,
  queryOwned,
  USER_DATA_ACCESS_ERROR_CODES,
} from "./user-data-access";

export type MetalDetailCorrectionField =
  | "weight"
  | "purity"
  | "physicalForm"
  | "purchasePrice"
  | "purchaseCurrency"
  | "purchaseDate"
  | "name"
  | "notes";

export interface MetalDetailCorrectionChange {
  readonly field: MetalDetailCorrectionField;
  readonly before: string | null;
  readonly after: string | null;
  readonly beforeCurrency?: string | null;
  readonly afterCurrency?: string | null;
}

export interface MetalDetailTimelineItem {
  readonly id: string;
  readonly kind: MetalDetailLifecycleEventInput["kind"] | "metadata";
  readonly occurredAt: Date;
  // null means the event exists, but exact before/after changes cannot be read.
  readonly correctionChanges?: readonly MetalDetailCorrectionChange[] | null;
  readonly hasUnavailableMaterialChanges?: boolean;
}

export function combineMetalDetailMetadataTimeline(
  materialTimeline: readonly MetalDetailTimelineItem[],
  metadata: readonly MetalMetadataHistoryEvent[],
  events: ReadonlyArray<Pick<MetalDetailLifecycleEventInput, "id" | "actionId">>
): readonly MetalDetailTimelineItem[] {
  const items = new Map(materialTimeline.map((item) => [item.id, item]));
  const eventIds = new Map(
    events.map((event) => [event.actionId ?? event.id, event.id])
  );
  const uniqueMetadata = new Map(metadata.map((event) => [event.id, event]));
  for (const event of uniqueMetadata.values()) {
    if (event.linkedActionId === null) {
      const id = `metadata:${event.id}`;
      items.set(id, {
        id,
        kind: "metadata",
        occurredAt: event.occurredAt,
        correctionChanges: event.changes,
      });
      continue;
    }
    const materialId = eventIds.get(event.linkedActionId);
    const material =
      materialId === undefined ? undefined : items.get(materialId);
    if (material?.kind !== "correct") continue;
    items.set(material.id, {
      ...material,
      correctionChanges: [
        ...(material.correctionChanges ?? []),
        ...event.changes,
      ],
      hasUnavailableMaterialChanges:
        material.correctionChanges === null ||
        material.correctionChanges === undefined,
    });
  }
  // Stable ties retain the lifecycle reducer's Undo/Sell ordering.
  return Object.freeze(
    Array.from(items.values()).sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()
    )
  );
}

export function observeMetalDetailMetadata(
  userId: string,
  holdingId: string
): Query<MetalMetadataEditRecord> {
  return queryOwned(
    defaultDatabase.get<MetalMetadataEditRecord>(
      "metal_metadata_edit_outcomes"
    ),
    userId,
    Q.where("holding_id", holdingId),
    Q.where("deleted", false)
  );
}

export function observeMetalDetailMetadataRoots(
  userId: string,
  holdingId: string
): Query<FinancialActionGroup> {
  return queryOwned(
    defaultDatabase.get<FinancialActionGroup>("financial_action_groups"),
    userId,
    Q.where("domain", "metals"),
    Q.where("domain_reference_id", holdingId),
    Q.where("deleted", false)
  );
}

export interface MetalMetadataFinancialRootState {
  readonly actionId: string;
  readonly state: string;
}

export function detachCanonicalMetadataFromRejectedMaterialEvents(
  rows: readonly MetalMetadataHistoryRecord[],
  roots: readonly MetalMetadataFinancialRootState[]
): readonly MetalMetadataHistoryRecord[] {
  const acceptedActions = new Set(
    roots
      .filter((root) => root.state === "accepted")
      .map((root) => root.actionId)
  );
  return rows.map((row) =>
    row.status === "applied" &&
    row.linkedActionId !== null &&
    !acceptedActions.has(row.linkedActionId)
      ? { ...row, linkedActionId: null }
      : row
  );
}

/**
 * Optimistic mixed deltas require a locally complete financial action. Canonical
 * metadata evidence remains valid independently of the financial CAS result.
 */
export function filterReportableMetalMetadataHistoryRecords(
  rows: readonly MetalMetadataHistoryRecord[],
  materialRoots: readonly MetalMetadataFinancialRootState[]
): readonly MetalMetadataHistoryRecord[] {
  const rootStates = new Map(
    materialRoots.map((root) => [root.actionId, root.state] as const)
  );
  return Object.freeze(
    rows.filter((row) => {
      if (row.status === "rejected" || row.status === "ignored") return false;
      if (row.linkedActionId === null) return true;
      const state = rootStates.get(row.linkedActionId);
      return row.status === "applied"
        ? true
        : state === "local_complete" ||
            state === "sync_pending" ||
            state === "sync_failed" ||
            state === "accepted";
    })
  );
}

/**
 * Local persisted deltas are the only source for metadata History.
 */
export async function readAppliedMetalMetadataHistory(
  database: Database,
  holdingId: string,
  expectedUserId: string
): Promise<readonly MetalMetadataHistoryEvent[]> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== expectedUserId) {
    throw new Error("financial_action_auth_scope_changed");
  }
  const records = await scope
    .queryOwned(
      database.get<MetalMetadataEditRecord>("metal_metadata_edit_outcomes"),
      Q.where("holding_id", holdingId),
      Q.where("deleted", false),
      Q.sortBy("occurred_at", Q.desc)
    )
    .fetch();
  const actionIds = Array.from(
    new Set(
      records
        .map((record) => record.actionId)
        .filter((id): id is string => id !== null)
    )
  );
  const financialRoots =
    actionIds.length === 0
      ? []
      : await scope
          .queryOwned(
            database.get<FinancialActionGroup>("financial_action_groups"),
            Q.where("action_id", Q.oneOf(actionIds)),
            Q.where("domain", "metals"),
            Q.where("domain_reference_id", holdingId),
            Q.where("deleted", false)
          )
          .fetch();
  const reportable = filterReportableMetalMetadataHistoryRecords(
    records.map(shapeMetalMetadataHistoryRecord),
    financialRoots.map((root) => ({
      actionId: root.actionId,
      state: root.state,
    }))
  );
  const currentScope = await getCurrentUserDataScope();
  if (currentScope.userId !== expectedUserId) {
    throw new Error(USER_DATA_ACCESS_ERROR_CODES.AUTH_SCOPE_CHANGED);
  }
  return projectAppliedMetalMetadataHistory(
    detachCanonicalMetadataFromRejectedMaterialEvents(
      reportable,
      financialRoots
    ),
    expectedUserId,
    holdingId
  );
}
