import {
  parseFinancialActionEnvelopeJson,
  parseFinancialActionEvidenceJson,
  serializeCanonicalJsonValue,
  type CanonicalJsonValue,
} from "@monyvi/logic";

import {
  resolveLegacyDisposalBaseline,
  toLegacyDisposalActionEvidence,
} from "./metal-legacy-disposal-baseline-service";
import type { MetalDisposeGroupSnapshot } from "./metal-disposed-evidence-service";

const MAX_DEVICE_TIMEZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

export interface MetalIdentityEvent {
  readonly actionId: string;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly id: string;
  readonly isEffective: boolean;
  readonly isHistoryVisible: boolean;
  readonly kind: string;
  readonly occurredAt: Date;
  readonly payloadJson: string;
  readonly predecessorEventId: string | null;
  readonly reversesEventId: string | null;
  readonly userId: string;
}

export interface MetalIdentityActionRoot extends MetalDisposeGroupSnapshot {
  // Some read projections preserve only the signed canonical envelope rather
  // than the separately persisted copy of its guards. When supplied, that
  // additional copy must agree; in every case the envelope must have no guards.
  readonly accountGuardsJson?: string;
}

export interface MetalIdentityActionEvidence {
  readonly actionId: string;
  readonly canonicalHoldingRevision: string | null;
  readonly deleted: boolean;
  readonly domainPayloadJson: string;
  readonly expectedHoldingRevision: string | null;
  readonly holdingId: string;
  readonly kind: string;
  readonly userId: string;
}

export interface MetalLifecycleIdentitySource {
  readonly userId: string;
  readonly holdingId: string;
  readonly events: readonly MetalIdentityEvent[];
  readonly groups: readonly MetalIdentityActionRoot[];
  readonly evidence: readonly MetalIdentityActionEvidence[];
}

export interface MetalLifecycleIdentity {
  readonly legacyRootEventId: string | null;
  readonly canonicalRootActionId: string | null;
  readonly hasUnprovenLegacyRoot: boolean;
}

export const EMPTY_METAL_LIFECYCLE_IDENTITY: MetalLifecycleIdentity =
  Object.freeze({
    legacyRootEventId: null,
    canonicalRootActionId: null,
    hasUnprovenLegacyRoot: false,
  });

function canonicalObject(value: unknown): value is CanonicalJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(canonicalObject);
  return (
    typeof value === "object" && Object.values(value).every(canonicalObject)
  );
}

function canonicalEvidenceJson(raw: string): string | null {
  try {
    const parsed = parseFinancialActionEvidenceJson(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !canonicalObject(parsed)
    ) {
      return null;
    }
    return serializeCanonicalJsonValue(parsed);
  } catch {
    return null;
  }
}

function immutableOccurrenceDate(event: MetalIdentityEvent): string | null {
  const time = event.occurredAt.getTime();
  if (!Number.isFinite(time)) return null;
  // A recorded historical calendar day may have originated east of Cairo.
  // No timezone ID is stored, so use the physical UTC+14 upper bound. This
  // does not alter the user's present-day input rule for new actions.
  return new Date(time + MAX_DEVICE_TIMEZONE_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function hasCanonicalRootEventEvidence(
  event: MetalIdentityEvent,
  root: MetalIdentityActionRoot,
  evidence: MetalIdentityActionEvidence,
  source: MetalLifecycleIdentitySource
): boolean {
  if (
    event.actionId !== root.actionId ||
    evidence.actionId !== root.actionId ||
    event.userId !== source.userId ||
    root.userId !== source.userId ||
    evidence.userId !== source.userId ||
    event.holdingId !== source.holdingId ||
    evidence.holdingId !== source.holdingId ||
    root.domainReferenceId !== source.holdingId ||
    root.domain !== "metals" ||
    event.kind !== "dispose" ||
    root.kind !== "dispose" ||
    evidence.kind !== "dispose" ||
    event.deleted ||
    root.deleted ||
    evidence.deleted ||
    !event.isEffective ||
    !event.isHistoryVisible ||
    event.predecessorEventId !== null ||
    event.reversesEventId !== null ||
    evidence.expectedHoldingRevision !== "0" ||
    evidence.canonicalHoldingRevision !== "1"
  ) {
    return false;
  }
  const limit = immutableOccurrenceDate(event);
  if (limit === null) return false;
  try {
    if (root.accountGuardsJson !== undefined) {
      const accountGuards = parseFinancialActionEvidenceJson(
        root.accountGuardsJson
      );
      if (!Array.isArray(accountGuards) || accountGuards.length !== 0) {
        return false;
      }
    }
    const envelope = parseFinancialActionEnvelopeJson(
      root.payloadJson,
      undefined,
      { latestAllowedCalendarDate: limit }
    );
    const payloadJson = serializeCanonicalJsonValue(envelope.payload);
    return (
      envelope.actionId === root.actionId &&
      envelope.userId === source.userId &&
      envelope.domainReferenceId === source.holdingId &&
      envelope.kind === "dispose" &&
      envelope.payloadVersion === "metals.dispose/v1" &&
      envelope.occurredAt === event.occurredAt.toISOString() &&
      envelope.accountGuards.length === 0 &&
      envelope.payload.holdingId === source.holdingId &&
      envelope.payload.expectedHoldingRevision === "0" &&
      envelope.payload.predecessorEventId === null &&
      envelope.payload.reversesEventId === null &&
      canonicalEvidenceJson(event.payloadJson) === payloadJson &&
      canonicalEvidenceJson(evidence.domainPayloadJson) === payloadJson
    );
  } catch {
    return false;
  }
}

export function resolveMetalLifecycleIdentity(
  source: MetalLifecycleIdentitySource
): MetalLifecycleIdentity {
  const hasCreationRoot = source.events.some(
    (event) =>
      (event.kind === "add" || event.kind === "created") &&
      event.predecessorEventId === null
  );
  const hasUnprovenLegacyRoot = source.events.some(
    (event) =>
      event.id !== event.actionId &&
      (event.kind === "dispose" ||
        source.groups.some(
          (group) =>
            group.actionId === event.actionId && group.kind === "dispose"
        )) &&
      // E!=D is normal for later Add->Dispose descendants. Only an original
      // predecessor-less terminal, or an invalid would-be original without
      // a genuine Add root, invokes the revision-zero fail-closed path.
      (event.predecessorEventId === null || !hasCreationRoot)
  );
  const unresolved: MetalLifecycleIdentity = {
    ...EMPTY_METAL_LIFECYCLE_IDENTITY,
    hasUnprovenLegacyRoot,
  };
  // A genuine Add/created root excludes the legacy revision-zero shortcut.
  if (hasCreationRoot) {
    return unresolved;
  }
  const baseline = resolveLegacyDisposalBaseline({
    assetId: source.holdingId,
    userId: source.userId,
    holdingState: {
      holdingId: source.holdingId,
      isVisible: true,
      status: "disposed",
      userId: source.userId,
    },
    lifecycleEvents: source.events.map((event) => ({
      actionId: event.actionId,
      id: event.id,
      kind: event.kind,
      predecessorEventId: event.predecessorEventId,
      reversesEventId: event.reversesEventId,
      isEffective: event.isEffective,
      isHistoryVisible: event.isHistoryVisible,
      actionState: event.isEffective ? "accepted" : "rejected",
      payloadJson: event.payloadJson,
      occurredAt: event.occurredAt,
    })),
    terminalFacts: null,
    revisionEvidence: source.evidence.map((candidate) => ({
      actionId: candidate.actionId,
      canonicalHoldingRevision: candidate.canonicalHoldingRevision,
      deleted: candidate.deleted,
      expectedHoldingRevision: candidate.expectedHoldingRevision,
      holdingId: candidate.holdingId,
      kind: candidate.kind,
      userId: candidate.userId,
    })),
    actionEvidence: toLegacyDisposalActionEvidence(
      source.events,
      source.groups
    ),
  });
  if (baseline === null) return unresolved;

  const events = source.events.filter(
    (event) => event.id === baseline.terminalEventId
  );
  if (events.length !== 1) return unresolved;
  const event = events[0];
  const roots = source.groups.filter(
    (group) => group.actionId === event.actionId
  );
  const evidence = source.evidence.filter(
    (candidate) => candidate.actionId === event.actionId
  );
  if (
    roots.length !== 1 ||
    evidence.length !== 1 ||
    !hasCanonicalRootEventEvidence(event, roots[0], evidence[0], source)
  ) {
    return unresolved;
  }
  // The alias has one immutable revision-zero owner, never a time- or
  // ordering-based winner. Other actions remain in their original ID space.
  return Object.freeze({
    legacyRootEventId: event.id,
    canonicalRootActionId: event.actionId,
    hasUnprovenLegacyRoot: false,
  });
}

export function normalizeMetalLifecycleEvents<
  TEvent extends { readonly id: string },
>(
  events: readonly TEvent[],
  identity: MetalLifecycleIdentity
): readonly TEvent[] {
  const localId = identity.legacyRootEventId;
  const canonicalId = identity.canonicalRootActionId;
  if (localId === null || canonicalId === null || localId === canonicalId) {
    return events;
  }
  return events.map(
    (event): TEvent =>
      event.id === localId
        ? Object.assign({}, event, { id: canonicalId })
        : event
  );
  // An old Undo referring to localId is intentionally NOT repaired here.
  // Its immutable envelope would have been rejected by canonical server CAS.
}

export function resolveMetalOwnedEffectiveEvent<
  TEvent extends {
    readonly id: string;
    readonly actionId?: string | null;
    readonly holdingId: string;
    readonly userId: string;
  },
>(
  events: readonly TEvent[],
  state: {
    readonly userId: string;
    readonly holdingId: string;
    readonly effectiveActionId?: string | null;
    readonly effectiveEventId?: string | null;
  },
  identity: MetalLifecycleIdentity
): TEvent | null {
  if (state.effectiveEventId === null || state.effectiveEventId === undefined) {
    return null;
  }
  const owned = events.filter(
    (event) =>
      event.userId === state.userId &&
      event.holdingId === state.holdingId &&
      ((event.id === state.effectiveEventId &&
        (state.effectiveActionId === null ||
          state.effectiveActionId === undefined ||
          event.actionId === null ||
          event.actionId === undefined ||
          event.actionId === state.effectiveActionId)) ||
        (identity.legacyRootEventId === event.id &&
          identity.canonicalRootActionId === event.actionId &&
          state.effectiveActionId === event.actionId &&
          state.effectiveEventId === event.actionId))
  );
  return owned.length === 1 ? owned[0] : null;
}

/** Compare validated immutable domain payloads, never their JSON formatting.
 * A legacy local event can retain its original JSON.stringify bytes while the
 * canonical SQL JSONB encoder sorts keys. Only proven aliases may use this
 * semantic equality; other records remain strict byte matches.
 */
export function areEquivalentLegacyMetalPayloads(
  localJson: string,
  canonicalJson: string
): boolean {
  const local = canonicalEvidenceJson(localJson);
  return local !== null && local === canonicalEvidenceJson(canonicalJson);
}

export function matchesCanonicalLegacyEventRow(
  local: MetalIdentityEvent,
  remote: MetalIdentityEvent
): boolean {
  return (
    remote.actionId === local.actionId &&
    remote.userId === local.userId &&
    remote.holdingId === local.holdingId &&
    remote.kind === local.kind &&
    !remote.deleted &&
    !local.deleted &&
    remote.isEffective === local.isEffective &&
    remote.isHistoryVisible === local.isHistoryVisible &&
    remote.occurredAt.getTime() === local.occurredAt.getTime() &&
    remote.predecessorEventId === local.predecessorEventId &&
    remote.reversesEventId === local.reversesEventId &&
    canonicalEvidenceJson(remote.payloadJson) !== null &&
    canonicalEvidenceJson(remote.payloadJson) ===
      canonicalEvidenceJson(local.payloadJson)
  );
}

export function matchesCanonicalLegacyEvidenceRow(
  local: MetalIdentityActionEvidence,
  remote: MetalIdentityActionEvidence
): boolean {
  return (
    remote.actionId === local.actionId &&
    remote.userId === local.userId &&
    remote.holdingId === local.holdingId &&
    remote.kind === local.kind &&
    !remote.deleted &&
    !local.deleted &&
    remote.expectedHoldingRevision === local.expectedHoldingRevision &&
    remote.canonicalHoldingRevision === local.canonicalHoldingRevision &&
    canonicalEvidenceJson(remote.domainPayloadJson) !== null &&
    canonicalEvidenceJson(remote.domainPayloadJson) ===
      canonicalEvidenceJson(local.domainPayloadJson)
  );
}
