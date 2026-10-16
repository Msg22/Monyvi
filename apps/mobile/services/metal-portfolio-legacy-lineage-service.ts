import { Q, type Query } from "@nozbe/watermelondb";
import {
  database,
  type MetalActionEvidence,
  type MetalLifecycleEvent,
} from "@monyvi/db";
import {
  normalizeMetalLifecycleEvents,
  resolveMetalLifecycleIdentity,
  resolveMetalOwnedEffectiveEvent,
  EMPTY_METAL_LIFECYCLE_IDENTITY,
  type MetalIdentityActionEvidence,
  type MetalIdentityEvent,
} from "./metal-lifecycle-identity-service";
import {
  reduceMetalLifecycle,
  type LifecycleEvent,
  type LifecycleKind,
} from "@monyvi/logic";
import { queryOwned } from "./user-data-access";
import type {
  MetalPortfolioActionEvidenceSnapshot,
  MetalPortfolioHoldingStateSnapshot,
  MetalPortfolioLifecycleEventSnapshot,
  ObservePortfolioRecentHistoryInput,
  ShapeMetalPortfolioHoldingsInput,
} from "./metal-portfolio-read-model-service";

interface PortfolioLineageResult {
  readonly event: MetalPortfolioLifecycleEventSnapshot | undefined;
  readonly lineageTrusted: boolean;
}

const LIFECYCLE_KINDS: Readonly<Record<string, LifecycleKind>> = {
  add: "created",
  created: "created",
  correct: "corrected",
  corrected: "corrected",
  sell: "sold",
  sold: "sold",
  dispose: "disposed",
  disposed: "disposed",
  delete: "deleted",
  deleted: "deleted",
  undo: "reversed",
  reversed: "reversed",
};

function isIdentityEvent(
  event: MetalPortfolioLifecycleEventSnapshot
): event is MetalIdentityEvent {
  return (
    typeof event.actionId === "string" &&
    typeof event.kind === "string" &&
    typeof event.payloadJson === "string" &&
    typeof event.isHistoryVisible === "boolean" &&
    (event.predecessorEventId === null ||
      typeof event.predecessorEventId === "string") &&
    (event.reversesEventId === null ||
      typeof event.reversesEventId === "string") &&
    Number.isFinite(event.occurredAt.getTime())
  );
}

function isIdentityEvidence(
  evidence: MetalPortfolioActionEvidenceSnapshot
): evidence is MetalIdentityActionEvidence {
  return (
    typeof evidence.domainPayloadJson === "string" &&
    (typeof evidence.expectedHoldingRevision === "string" ||
      evidence.expectedHoldingRevision === null) &&
    (typeof evidence.canonicalHoldingRevision === "string" ||
      evidence.canonicalHoldingRevision === null)
  );
}

function isBoundEffectiveEvidence(
  event: MetalIdentityEvent,
  evidence: readonly MetalPortfolioActionEvidenceSnapshot[]
): boolean {
  return evidence.some(
    (row) =>
      !row.deleted &&
      row.userId === event.userId &&
      row.holdingId === event.holdingId &&
      row.actionId === event.actionId &&
      row.kind === event.kind
  );
}

function readAcceptedLifecycle(
  event: MetalIdentityEvent,
  evidence: readonly MetalPortfolioActionEvidenceSnapshot[],
  groups: NonNullable<ShapeMetalPortfolioHoldingsInput["actionGroups"]>
): LifecycleEvent | null {
  const kind = LIFECYCLE_KINDS[event.kind];
  if (kind === undefined) return null;
  const matchedRoot = groups.find(
    (candidate) =>
      candidate.actionId === event.actionId &&
      candidate.userId === event.userId &&
      candidate.domainReferenceId === event.holdingId
  );
  const isRejectedRoot =
    matchedRoot?.state === "rejected_compensating" ||
    matchedRoot?.state === "reconciliation_incomplete" ||
    matchedRoot?.state === "reconciled";
  const isEffective =
    event.isEffective &&
    event.isHistoryVisible &&
    !isRejectedRoot &&
    isBoundEffectiveEvidence(event, evidence);
  return {
    id: event.id,
    fingerprint: event.payloadJson,
    kind,
    occurredAt: event.occurredAt.getTime(),
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId,
    evidenceState: isEffective ? "effective" : "incomplete",
    canonicalCasStatus: isEffective ? "accepted" : "unknown",
  };
}

/**
 * Nonlegacy holdings retain the original persisted effective-event behavior.
 * Only an authenticated, proven E!=D original revision-zero Dispose takes
 * the reducer path, so a locally invalid old Undo(E) cannot create wealth.
 */
export function resolvePortfolioLegacyLineage(
  input: ShapeMetalPortfolioHoldingsInput,
  state: MetalPortfolioHoldingStateSnapshot
): PortfolioLineageResult {
  const relatedEvents = input.lifecycleEvents.filter(
    (event) =>
      !event.deleted &&
      event.userId === state.userId &&
      event.holdingId === state.holdingId
  );
  const hasLegacyOriginal = relatedEvents.some(
    (event) =>
      event.kind === "dispose" &&
      event.id !== event.actionId &&
      event.predecessorEventId === null
  );
  const current = resolveMetalOwnedEffectiveEvent(
    relatedEvents,
    state,
    EMPTY_METAL_LIFECYCLE_IDENTITY
  );
  if (!hasLegacyOriginal) {
    // A restored Active event without its terminal predecessor is only an
    // incomplete subscription snapshot. Never count it as owned wealth.
    const predecessor = current?.predecessorEventId;
    const missingUndoAncestor =
      state.status === "active" &&
      current?.kind === "undo" &&
      typeof predecessor === "string" &&
      !relatedEvents.some(
        (event) => event.id === predecessor || event.actionId === predecessor
      );
    return {
      event: missingUndoAncestor ? undefined : (current ?? undefined),
      lineageTrusted: !missingUndoAncestor,
    };
  }
  const identityEvents = relatedEvents.filter(isIdentityEvent);
  const currentEvidence = (input.actionEvidence ?? []).filter(
    (event) =>
      !event.deleted &&
      event.userId === state.userId &&
      event.holdingId === state.holdingId
  );
  const groups = (input.actionGroups ?? []).filter(
    (group) =>
      !group.deleted &&
      group.userId === state.userId &&
      group.domainReferenceId === state.holdingId
  );
  const identity = resolveMetalLifecycleIdentity({
    userId: state.userId,
    holdingId: state.holdingId,
    events: identityEvents,
    evidence: currentEvidence.filter(isIdentityEvidence),
    groups,
  });
  if (
    identity.hasUnprovenLegacyRoot ||
    identity.canonicalRootActionId === null ||
    identity.legacyRootEventId === null ||
    identityEvents.length !== relatedEvents.length
  ) {
    return { event: undefined, lineageTrusted: false };
  }
  const mapped = identityEvents.map((event) =>
    readAcceptedLifecycle(event, currentEvidence, groups)
  );
  if (mapped.some((event) => event === null)) {
    return { event: undefined, lineageTrusted: false };
  }
  const normalized = normalizeMetalLifecycleEvents(
    mapped.filter((event): event is LifecycleEvent => event !== null),
    identity
  );
  const reduced = reduceMetalLifecycle(normalized, {
    terminalEventId: identity.canonicalRootActionId,
  });
  // Before the first Restore, the original Dispose is still stored locally
  // under E. Its proven logical reducer head is D. Only this exact owned
  // original terminal state may compare E and D as equivalent.
  const matchesProvenOriginalLocalHead =
    state.status === "disposed" &&
    state.effectiveActionId === identity.canonicalRootActionId &&
    state.effectiveEventId === identity.legacyRootEventId &&
    reduced.projection?.effectiveEventId === identity.canonicalRootActionId;
  if (
    reduced.projection === null ||
    reduced.projection.status !== state.status ||
    (reduced.projection.effectiveEventId !== state.effectiveEventId &&
      !matchesProvenOriginalLocalHead) ||
    !reduced.projection.isVisible
  ) {
    return { event: undefined, lineageTrusted: false };
  }
  const event = resolveMetalOwnedEffectiveEvent(relatedEvents, state, identity);
  return {
    event: event ?? undefined,
    lineageTrusted: event !== null,
  };
}

function ownedStates(
  input: ObservePortfolioRecentHistoryInput
): readonly MetalPortfolioHoldingStateSnapshot[] {
  return input.holdingStates.filter(
    (state) => state.userId === input.userId && !state.deleted
  );
}

export function observePortfolioRecentHistory(
  input: ObservePortfolioRecentHistoryInput
): Query<MetalLifecycleEvent> | null {
  const holdingIds = Array.from(
    new Set(ownedStates(input).map((state) => state.holdingId))
  ).sort();
  if (holdingIds.length === 0) return null;
  // The E!=D root and every intermediate successor are required to validate
  // repeated Restore/Dispose chains. Effective-event-only queries lose E.
  return queryOwned(
    database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
    input.userId,
    Q.where("holding_id", Q.oneOf(holdingIds)),
    Q.where("deleted", false),
    Q.sortBy("occurred_at", Q.desc)
  );
}

export function observePortfolioEffectiveActionEvidence(
  input: ObservePortfolioRecentHistoryInput
): Query<MetalActionEvidence> | null {
  const holdingIds = Array.from(
    new Set(ownedStates(input).map((state) => state.holdingId))
  ).sort();
  if (holdingIds.length === 0) return null;
  return queryOwned(
    database.get<MetalActionEvidence>("metal_action_evidence"),
    input.userId,
    Q.where("holding_id", Q.oneOf(holdingIds)),
    Q.where("deleted", false)
  );
}
