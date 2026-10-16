import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  FinancialActionGroup,
  MetalActionEvidence,
  MetalLifecycleEvent,
} from "@monyvi/db";
import {
  matchesCanonicalLegacyEventRow,
  matchesCanonicalLegacyEvidenceRow,
  resolveMetalLifecycleIdentity,
  type MetalIdentityActionEvidence,
  type MetalIdentityEvent,
} from "../metal-lifecycle-identity-service";

export const INVALID_LEGACY_ID_PULL_ROW = "sync_invalid_pull_row";

export interface PulledRow extends Record<string, unknown> {
  readonly deleted?: boolean;
  readonly id: string;
}

interface FinancialActionRootModel extends Model {
  readonly actionId: string;
}

export async function remapFinancialActionRootIds(
  records: readonly PulledRow[],
  userId: string,
  database?: Database
): Promise<readonly PulledRow[]> {
  if (!database || records.length === 0) return records;
  const actionIds = records
    .map((record) => record.action_id)
    .filter((actionId): actionId is string => typeof actionId === "string");
  if (actionIds.length !== records.length) {
    throw new Error(INVALID_LEGACY_ID_PULL_ROW);
  }
  const localRoots = await database
    .get<FinancialActionRootModel>("financial_action_groups")
    .query(Q.where("user_id", userId), Q.where("action_id", Q.oneOf(actionIds)))
    .fetch();
  const localIdsByAction = new Map(
    localRoots.map((root) => [root.actionId, root.id])
  );
  return records.map((record) => ({
    ...record,
    id: localIdsByAction.get(record.action_id as string) ?? record.id,
  }));
}

type LegacyMetalPullTable = "metal_action_evidence" | "metal_lifecycle_events";

function requiredPullString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(INVALID_LEGACY_ID_PULL_ROW);
  }
  return value;
}

function requiredPullDate(value: unknown): Date {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : new Date(Number.NaN);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(INVALID_LEGACY_ID_PULL_ROW);
  }
  return date;
}

function optionalPullString(value: unknown): string | null {
  if (value === null) return null;
  return requiredPullString(value);
}

export async function remapVerifiedLegacyMetalPullIds(
  table: LegacyMetalPullTable,
  records: readonly PulledRow[],
  userId: string,
  database?: Database
): Promise<readonly PulledRow[]> {
  if (!database || records.length === 0) return records;
  const actionIds = records.map((record) => {
    if (record.user_id !== userId || record.id !== record.action_id) {
      throw new Error(INVALID_LEGACY_ID_PULL_ROW);
    }
    return requiredPullString(record.action_id);
  });
  // Canonical server rows are unique by action. Reject duplicate incoming
  // candidates even when their payloads are identical.
  if (new Set(actionIds).size !== actionIds.length) {
    throw new Error(INVALID_LEGACY_ID_PULL_ROW);
  }
  const [events, evidence, groups, existingIds] = await Promise.all([
    database
      .get<MetalLifecycleEvent>("metal_lifecycle_events")
      .query(
        Q.where("user_id", userId),
        Q.where("action_id", Q.oneOf(actionIds))
      )
      .fetch(),
    database
      .get<MetalActionEvidence>("metal_action_evidence")
      .query(
        Q.where("user_id", userId),
        Q.where("action_id", Q.oneOf(actionIds))
      )
      .fetch(),
    database
      .get<FinancialActionGroup>("financial_action_groups")
      .query(
        Q.where("user_id", userId),
        Q.where("action_id", Q.oneOf(actionIds))
      )
      .fetch(),
    database
      .get<MetalLifecycleEvent | MetalActionEvidence>(table)
      .query(Q.where("user_id", userId), Q.where("id", Q.oneOf(actionIds)))
      .fetch(),
  ]);

  return records.map((record): PulledRow => {
    const actionId = requiredPullString(record.action_id);
    const localEvents = events.filter((event) => event.actionId === actionId);
    const localEvidence = evidence.filter(
      (candidate) => candidate.actionId === actionId
    );
    const localGroups = groups.filter((group) => group.actionId === actionId);
    if (
      localEvents.length > 1 ||
      localEvidence.length > 1 ||
      localGroups.length > 1 ||
      existingIds.some(
        (existing) =>
          existing.id === record.id &&
          (existing.actionId !== actionId || existing.userId !== userId)
      )
    ) {
      throw new Error(INVALID_LEGACY_ID_PULL_ROW);
    }
    const original =
      table === "metal_lifecycle_events" ? localEvents[0] : localEvidence[0];
    if (!original || original.id === record.id) return record;
    if (
      record.deleted === true ||
      localEvents.length !== 1 ||
      localEvidence.length !== 1 ||
      localGroups.length !== 1
    ) {
      throw new Error(INVALID_LEGACY_ID_PULL_ROW);
    }
    const holdingId = requiredPullString(record.holding_id);
    const identity = resolveMetalLifecycleIdentity({
      userId,
      holdingId,
      events: localEvents,
      evidence: localEvidence,
      groups: localGroups,
    });
    if (
      identity.canonicalRootActionId !== actionId ||
      identity.legacyRootEventId !== localEvents[0].id
    ) {
      throw new Error(INVALID_LEGACY_ID_PULL_ROW);
    }
    if (table === "metal_lifecycle_events") {
      const remote: MetalIdentityEvent = {
        id: actionId,
        actionId,
        userId,
        holdingId,
        kind: requiredPullString(record.kind),
        deleted: false,
        occurredAt: requiredPullDate(record.occurred_at),
        isEffective: record.is_effective === true,
        isHistoryVisible: record.is_history_visible === true,
        payloadJson: requiredPullString(record.payload_json),
        predecessorEventId: optionalPullString(record.predecessor_event_id),
        reversesEventId: optionalPullString(record.reverses_event_id),
      };
      if (!matchesCanonicalLegacyEventRow(localEvents[0], remote)) {
        throw new Error(INVALID_LEGACY_ID_PULL_ROW);
      }
    } else {
      const remote: MetalIdentityActionEvidence = {
        actionId,
        userId,
        holdingId,
        kind: requiredPullString(record.kind),
        deleted: false,
        expectedHoldingRevision: optionalPullString(
          record.expected_holding_revision
        ),
        canonicalHoldingRevision: optionalPullString(
          record.canonical_holding_revision
        ),
        domainPayloadJson: requiredPullString(record.domain_payload_json),
      };
      if (!matchesCanonicalLegacyEvidenceRow(localEvidence[0], remote)) {
        throw new Error(INVALID_LEGACY_ID_PULL_ROW);
      }
    }
    // The Watermelon pull stays in its existing updated change class, but
    // targets the uniquely matching local primary key. Neither event history
    // nor immutable payload content is rekeyed or repaired.
    return table === "metal_lifecycle_events"
      ? {
          ...record,
          id: original.id,
          // The server supplied equivalent immutable facts; keep original
          // local evidence bytes and primary key during an ordinary update.
          payload_json: localEvents[0].payloadJson,
        }
      : {
          ...record,
          id: original.id,
          domain_payload_json: localEvidence[0].domainPayloadJson,
        };
  });
}
