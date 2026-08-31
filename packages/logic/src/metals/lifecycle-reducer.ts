export type LifecycleKind =
  | "created"
  | "corrected"
  | "sold"
  | "disposed"
  | "deleted"
  | "reversed";

export type LifecycleEvidenceState = "effective" | "ineffective" | "incomplete";
export type CanonicalCasStatus = "accepted" | "rejected" | "unknown";

export interface LifecycleEvent {
  readonly id: string;
  readonly fingerprint: string;
  readonly kind: LifecycleKind;
  readonly occurredAt: number;
  readonly predecessorEventId: string | null;
  readonly reversesEventId: string | null;
  readonly evidenceState: LifecycleEvidenceState;
  readonly canonicalCasStatus: CanonicalCasStatus;
}

export interface LifecycleProjection {
  readonly status: "active" | "sold" | "disposed";
  readonly isVisible: boolean;
  readonly effectiveEventId: string;
  readonly history: readonly LifecycleEvent[];
}

export type LifecycleRejectionReason =
  | "duplicate_event_id_replay"
  | "duplicate_event_id_conflict"
  | "incomplete_evidence"
  | "ineffective_evidence"
  | "missing_predecessor"
  | "predecessor_not_accepted"
  | "predecessor_not_current"
  | "cycle_detected"
  | "invalid_transition"
  | "invalid_reversal_target"
  | "conflicting_effective_successors";

export interface LifecycleRejectedEvent {
  readonly event: LifecycleEvent;
  readonly fingerprint: string;
  readonly reasonCode: LifecycleRejectionReason;
  readonly relatedEventId: string | null;
}

export interface LifecycleReductionResult {
  readonly projection: LifecycleProjection | null;
  readonly acceptedEvents: readonly LifecycleEvent[];
  readonly rejectedEvents: readonly LifecycleRejectedEvent[];
}

interface ReductionState {
  readonly candidatesById: ReadonlyMap<string, LifecycleEvent>;
  readonly allIds: ReadonlySet<string>;
  readonly rejectedIds: ReadonlySet<string>;
  readonly rejected: readonly LifecycleRejectedEvent[];
}

export function orderLifecycleEventsNewestFirst(
  events: readonly LifecycleEvent[]
): readonly LifecycleEvent[] {
  const groupsByTime = events.reduce<Map<number, LifecycleEvent[]>>(
    (groups, event) => {
      const group = groups.get(event.occurredAt) ?? [];
      groups.set(event.occurredAt, [...group, event]);
      return groups;
    },
    new Map()
  );
  return [...groupsByTime.entries()]
    .sort(([leftTime], [rightTime]) => rightTime - leftTime)
    .flatMap(([, group]) => orderEqualTimeGroup(group));
}

export function reduceMetalLifecycle(
  events: readonly unknown[]
): LifecycleReductionResult {
  const prepared = prepareCandidates(events.map(snapshotEvent));
  const withCyclesRejected = rejectCycleEvents(
    prepared,
    findCycleIds(prepared.candidatesById, prepared.rejectedIds)
  );
  const roots = [...withCyclesRejected.candidatesById.values()].filter(
    (event) => !withCyclesRejected.rejectedIds.has(event.id) &&
      event.kind === "created" && event.predecessorEventId === null
  );

  if (roots.length !== 1) {
    return finalizeReduction(
      [],
      rejectRemaining(rejectUnsafeRoots(withCyclesRejected, roots), [])
    );
  }

  const accepted: LifecycleEvent[] = [roots[0] as LifecycleEvent];
  let state = withCyclesRejected;
  let current = roots[0] as LifecycleEvent;
  for (;;) {
    const successors = [...state.candidatesById.values()].filter(
      (event) => !state.rejectedIds.has(event.id) &&
        event.predecessorEventId === current.id &&
        !accepted.some(({ id }) => id === event.id)
    );
    if (successors.length === 0) {
      break;
    }
    const validated = validateSuccessors(successors, current, state);
    state = validated.state;
    if (validated.valid.length === 0) {
      break;
    }
    const selected = selectSuccessor(validated.valid, state);
    state = selected.state;
    if (selected.event === null) {
      break;
    }
    accepted.push(selected.event);
    current = selected.event;
  }
  return finalizeReduction(accepted, rejectRemaining(state, accepted));
}

function snapshotEvent(observation: unknown): LifecycleEvent {
  const event = isRecord(observation) ? observation : {};
  const isStructurallyComplete =
    isNonEmptyString(event.id) &&
    isNonEmptyString(event.fingerprint) &&
    isLifecycleKind(event.kind) &&
    isValidOccurredAt(event.occurredAt) &&
    isOptionalEventReference(event.predecessorEventId) &&
    isOptionalEventReference(event.reversesEventId) &&
    isLifecycleEvidenceState(event.evidenceState) &&
    isCanonicalCasStatus(event.canonicalCasStatus);
  return Object.freeze({
    id: typeof event.id === "string" ? event.id : "",
    fingerprint: typeof event.fingerprint === "string" ? event.fingerprint : "",
    kind: isLifecycleKind(event.kind) ? event.kind : "created",
    occurredAt: isValidOccurredAt(event.occurredAt) ? event.occurredAt : 0,
    predecessorEventId: isOptionalEventReference(event.predecessorEventId)
      ? event.predecessorEventId
      : null,
    reversesEventId: isOptionalEventReference(event.reversesEventId)
      ? event.reversesEventId
      : null,
    evidenceState: isStructurallyComplete &&
      isLifecycleEvidenceState(event.evidenceState)
      ? event.evidenceState
      : "incomplete",
    canonicalCasStatus: isCanonicalCasStatus(event.canonicalCasStatus)
      ? event.canonicalCasStatus
      : "unknown",
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isLifecycleKind(value: unknown): value is LifecycleKind {
  return value === "created" ||
    value === "corrected" ||
    value === "sold" ||
    value === "disposed" ||
    value === "deleted" ||
    value === "reversed";
}

function isValidOccurredAt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isOptionalEventReference(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function prepareCandidates(events: readonly LifecycleEvent[]): ReductionState {
  const grouped = groupById(events);
  const candidates = new Map<string, LifecycleEvent>();
  let state: ReductionState = {
    candidatesById: candidates,
    allIds: new Set(grouped.keys()),
    rejectedIds: new Set(),
    rejected: [],
  };
  for (const [id, duplicates] of grouped) {
    const first = duplicates[0] as LifecycleEvent;
    if (duplicates.length === 1) {
      candidates.set(id, first);
    } else if (duplicates.every((event) => sameLifecycleEvent(event, first))) {
      candidates.set(id, first);
      for (const replay of duplicates.slice(1)) {
        state = appendRejection(state, replay, "duplicate_event_id_replay", id, false);
      }
    } else {
      for (const conflict of duplicates) {
        state = appendRejection(state, conflict, "duplicate_event_id_conflict", id, true);
      }
    }
  }
  for (const event of candidates.values()) {
    if (event.evidenceState === "incomplete") {
      state = appendRejection(state, event, "incomplete_evidence", null, true);
    } else if (
      event.evidenceState === "ineffective" ||
      event.canonicalCasStatus === "rejected"
    ) {
      state = appendRejection(state, event, "ineffective_evidence", null, true);
    } else if (
      event.kind === "created" &&
      (event.predecessorEventId !== null || event.reversesEventId !== null)
    ) {
      state = appendRejection(state, event, "invalid_transition", null, true);
    }
  }
  return state;
}

function isLifecycleEvidenceState(value: unknown): value is LifecycleEvidenceState {
  return value === "effective" || value === "ineffective" || value === "incomplete";
}

function isCanonicalCasStatus(value: unknown): value is CanonicalCasStatus {
  return value === "accepted" || value === "rejected" || value === "unknown";
}

function sameLifecycleEvent(left: LifecycleEvent, right: LifecycleEvent): boolean {
  return left.id === right.id &&
    left.fingerprint === right.fingerprint &&
    left.kind === right.kind &&
    left.occurredAt === right.occurredAt &&
    left.predecessorEventId === right.predecessorEventId &&
    left.reversesEventId === right.reversesEventId &&
    left.evidenceState === right.evidenceState &&
    left.canonicalCasStatus === right.canonicalCasStatus;
}

function groupById(
  events: readonly LifecycleEvent[]
): ReadonlyMap<string, readonly LifecycleEvent[]> {
  const grouped = new Map<string, readonly LifecycleEvent[]>();
  for (const event of [...events].sort(compareEvents)) {
    grouped.set(event.id, [...(grouped.get(event.id) ?? []), event]);
  }
  return grouped;
}

function findCycleIds(
  candidates: ReadonlyMap<string, LifecycleEvent>,
  alreadyRejected: ReadonlySet<string>
): ReadonlySet<string> {
  const cycleIds = new Set<string>();
  const visited = new Set<string>();
  const visiting: string[] = [];
  function visit(id: string): void {
    if (visited.has(id) || alreadyRejected.has(id)) {
      return;
    }
    const cycleStart = visiting.indexOf(id);
    if (cycleStart >= 0) {
      visiting.slice(cycleStart).forEach((cycleId) => cycleIds.add(cycleId));
      return;
    }
    const event = candidates.get(id);
    if (event === undefined) {
      return;
    }
    visiting.push(id);
    if (event.predecessorEventId !== null && candidates.has(event.predecessorEventId)) {
      visit(event.predecessorEventId);
    }
    visiting.pop();
    visited.add(id);
  }
  for (const id of candidates.keys()) {
    visit(id);
  }
  return cycleIds;
}

function rejectCycleEvents(
  state: ReductionState,
  cycleIds: ReadonlySet<string>
): ReductionState {
  let next = state;
  for (const id of [...cycleIds].sort()) {
    const event = state.candidatesById.get(id);
    if (event !== undefined) {
      next = appendRejection(next, event, "cycle_detected", event.predecessorEventId, true);
    }
  }
  return next;
}

function rejectUnsafeRoots(
  state: ReductionState,
  roots: readonly LifecycleEvent[]
): ReductionState {
  let next = state;
  if (roots.length > 1) {
    for (const root of roots) {
      next = appendRejection(next, root, "invalid_transition", null, true);
    }
  }
  return next;
}

function validateSuccessors(
  successors: readonly LifecycleEvent[],
  current: LifecycleEvent,
  state: ReductionState
): { readonly valid: readonly LifecycleEvent[]; readonly state: ReductionState } {
  const valid: LifecycleEvent[] = [];
  let next = state;
  for (const successor of [...successors].sort(compareEvents)) {
    const reason = transitionRejectionReason(current, successor);
    if (reason === null) {
      valid.push(successor);
    } else {
      next = appendRejection(next, successor, reason, current.id, true);
    }
  }
  return { valid, state: next };
}

function transitionRejectionReason(
  current: LifecycleEvent,
  successor: LifecycleEvent
): "invalid_transition" | "invalid_reversal_target" | null {
  if (successor.kind === "created") {
    return "invalid_transition";
  }
  if (successor.kind === "reversed") {
    return (current.kind === "sold" || current.kind === "disposed") &&
      successor.predecessorEventId === current.id &&
      successor.reversesEventId === current.id
      ? null
      : "invalid_reversal_target";
  }
  if (current.kind === "sold" || current.kind === "disposed" || current.kind === "deleted") {
    return "invalid_transition";
  }
  return successor.reversesEventId === null ? null : "invalid_transition";
}

function selectSuccessor(
  candidates: readonly LifecycleEvent[],
  state: ReductionState
): { readonly event: LifecycleEvent | null; readonly state: ReductionState } {
  if (candidates.length === 1) {
    const only = candidates[0] as LifecycleEvent;
    return only.canonicalCasStatus === "rejected"
      ? {
          event: null,
          state: appendRejection(
            state,
            only,
            "ineffective_evidence",
            only.predecessorEventId,
            true
          ),
        }
      : { event: only, state };
  }
  const canonical = candidates.filter(
    ({ canonicalCasStatus }) => canonicalCasStatus === "accepted"
  );
  const winner = canonical.length === 1 ? canonical[0] as LifecycleEvent : null;
  let next = state;
  for (const candidate of candidates) {
    if (winner === null || candidate.id !== winner.id) {
      next = appendRejection(
        next,
        candidate,
        "conflicting_effective_successors",
        candidate.predecessorEventId,
        true
      );
    }
  }
  return { event: winner, state: next };
}

function rejectRemaining(
  state: ReductionState,
  accepted: readonly LifecycleEvent[]
): ReductionState {
  let next = state;
  const acceptedIds = new Set(accepted.map(({ id }) => id));
  const current = accepted[accepted.length - 1];
  for (const event of [...state.candidatesById.values()].sort(compareEvents)) {
    if (acceptedIds.has(event.id) || next.rejectedIds.has(event.id)) {
      continue;
    }
    const predecessorId = event.predecessorEventId;
    if (predecessorId === null || !state.allIds.has(predecessorId)) {
      next = appendRejection(next, event, "missing_predecessor", predecessorId, true);
    } else if (!acceptedIds.has(predecessorId)) {
      next = appendRejection(next, event, "predecessor_not_accepted", predecessorId, true);
    } else if (current?.id !== predecessorId) {
      next = appendRejection(next, event, "predecessor_not_current", predecessorId, true);
    } else {
      next = appendRejection(next, event, "invalid_transition", predecessorId, true);
    }
  }
  return next;
}

function finalizeReduction(
  accepted: readonly LifecycleEvent[],
  state: ReductionState
): LifecycleReductionResult {
  const effective = accepted[accepted.length - 1];
  const projection = effective === undefined
    ? null
    : Object.freeze({
        status: statusForEvent(effective),
        isVisible: effective.kind !== "deleted",
        effectiveEventId: effective.id,
        history: Object.freeze(effective.kind === "deleted" ? [] : orderLifecycleEventsNewestFirst(accepted)),
      });
  return Object.freeze({
    projection,
    acceptedEvents: Object.freeze([...accepted]),
    rejectedEvents: Object.freeze([...state.rejected].sort(compareRejections)),
  });
}

function appendRejection(
  state: ReductionState,
  event: LifecycleEvent,
  reasonCode: LifecycleRejectionReason,
  relatedEventId: string | null,
  markIdRejected: boolean
): ReductionState {
  const rejectedIds = new Set(state.rejectedIds);
  if (markIdRejected) {
    rejectedIds.add(event.id);
  }
  return {
    ...state,
    rejectedIds,
    rejected: [
      ...state.rejected,
      Object.freeze({ event, fingerprint: event.fingerprint, reasonCode, relatedEventId }),
    ],
  };
}

function compareEvents(left: LifecycleEvent, right: LifecycleEvent): number {
  return left.occurredAt - right.occurredAt ||
    compareText(left.id, right.id) ||
    compareText(left.fingerprint, right.fingerprint);
}

function compareRejections(
  left: LifecycleRejectedEvent,
  right: LifecycleRejectedEvent
): number {
  return compareEvents(left.event, right.event) ||
    compareText(left.reasonCode, right.reasonCode);
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function orderEqualTimeGroup(
  events: readonly LifecycleEvent[]
): readonly LifecycleEvent[] {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const predecessorsBySuccessor = new Map<string, readonly string[]>();
  const successorCounts = new Map(events.map((event) => [event.id, 0]));
  for (const event of events) {
    const predecessorIds = [event.reversesEventId, event.predecessorEventId]
      .filter((id): id is string => id !== null && eventsById.has(id));
    const uniquePredecessorIds = [...new Set(predecessorIds)];
    predecessorsBySuccessor.set(event.id, uniquePredecessorIds);
    for (const predecessorId of uniquePredecessorIds) {
      successorCounts.set(predecessorId, (successorCounts.get(predecessorId) ?? 0) + 1);
    }
  }
  const readyIds = [...successorCounts.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort();
  const ordered: LifecycleEvent[] = [];
  const visitedIds = new Set<string>();
  while (readyIds.length > 0) {
    const id = readyIds.shift() as string;
    const event = eventsById.get(id);
    if (event === undefined) {
      continue;
    }
    visitedIds.add(id);
    ordered.push(event);
    for (const predecessorId of predecessorsBySuccessor.get(id) ?? []) {
      const nextCount = (successorCounts.get(predecessorId) ?? 0) - 1;
      successorCounts.set(predecessorId, nextCount);
      if (nextCount === 0) {
        readyIds.push(predecessorId);
        readyIds.sort();
      }
    }
  }
  return [
    ...ordered,
    ...events.filter((event) => !visitedIds.has(event.id)).sort(compareEvents),
  ];
}

function statusForEvent(event: LifecycleEvent): LifecycleProjection["status"] {
  if (event.kind === "sold") {
    return "sold";
  }
  if (event.kind === "disposed") {
    return "disposed";
  }
  return "active";
}
