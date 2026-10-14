/**
 * Issue #363: metadata history records a value only when an actual field merge
 * changes the value. Submitted intent and the current asset projection are never
 * historical evidence.
 *
 * This module intentionally has no React, persistence, or clock dependencies.
 */
export interface MetalMetadataEvidenceClock {
  readonly writtenAt: number;
  readonly writerId: string;
}

export interface MetalMetadataCandidate<
  TValue,
> extends MetalMetadataEvidenceClock {
  readonly value: TValue;
}

export interface MetalMetadataEvidenceState {
  readonly name: string;
  readonly notes: string | null;
  readonly nameClock: MetalMetadataEvidenceClock | null;
  readonly notesClock: MetalMetadataEvidenceClock | null;
}

export interface MetalMetadataEvidencePatch {
  readonly name?: MetalMetadataCandidate<string>;
  readonly notes?: MetalMetadataCandidate<string | null>;
}

export interface MetalMetadataAppliedField<TValue> {
  readonly before: TValue;
  readonly after: TValue;
  readonly clock: MetalMetadataEvidenceClock;
}

export interface MetalMetadataAppliedChanges {
  readonly name?: MetalMetadataAppliedField<string>;
  readonly notes?: MetalMetadataAppliedField<string | null>;
}

export type MetalMetadataClockDecision = "apply" | "ignore" | "same";

export interface MetalMetadataMergeResult {
  readonly after: MetalMetadataEvidenceState;
  readonly decisions: {
    readonly name: MetalMetadataClockDecision;
    readonly notes: MetalMetadataClockDecision;
  };
  readonly appliedChanges: MetalMetadataAppliedChanges;
}

export function compareMetalEvidenceClock(
  current: MetalMetadataEvidenceClock | null,
  candidate: MetalMetadataEvidenceClock
): MetalMetadataClockDecision {
  if (current === null) return "apply";
  if (
    current.writtenAt === candidate.writtenAt &&
    current.writerId === candidate.writerId
  )
    return "same";
  return candidate.writtenAt > current.writtenAt ||
    (candidate.writtenAt === current.writtenAt &&
      candidate.writerId > current.writerId)
    ? "apply"
    : "ignore";
}

export function applyMetalMetadataEvidencePatch(
  before: MetalMetadataEvidenceState,
  patch: MetalMetadataEvidencePatch
): MetalMetadataMergeResult {
  const nameDecision = patch.name
    ? compareMetalEvidenceClock(before.nameClock, patch.name)
    : "ignore";
  const notesDecision = patch.notes
    ? compareMetalEvidenceClock(before.notesClock, patch.notes)
    : "ignore";

  if (
    (nameDecision === "same" && patch.name?.value !== before.name) ||
    (notesDecision === "same" && patch.notes?.value !== before.notes)
  )
    throw new Error("metal_metadata_tuple_conflict");

  const changedName =
    nameDecision === "apply" &&
    patch.name !== undefined &&
    before.name !== patch.name.value;
  const changedNotes =
    notesDecision === "apply" &&
    patch.notes !== undefined &&
    before.notes !== patch.notes.value;

  const after: MetalMetadataEvidenceState = Object.freeze({
    name:
      nameDecision === "apply" && patch.name ? patch.name.value : before.name,
    notes:
      notesDecision === "apply" && patch.notes
        ? patch.notes.value
        : before.notes,
    nameClock:
      nameDecision === "apply" && patch.name
        ? Object.freeze({
            writtenAt: patch.name.writtenAt,
            writerId: patch.name.writerId,
          })
        : before.nameClock,
    notesClock:
      notesDecision === "apply" && patch.notes
        ? Object.freeze({
            writtenAt: patch.notes.writtenAt,
            writerId: patch.notes.writerId,
          })
        : before.notesClock,
  });

  const appliedChanges: MetalMetadataAppliedChanges = Object.freeze({
    ...(changedName && patch.name
      ? {
          name: Object.freeze({
            before: before.name,
            after: patch.name.value,
            clock: Object.freeze({
              writtenAt: patch.name.writtenAt,
              writerId: patch.name.writerId,
            }),
          }),
        }
      : {}),
    ...(changedNotes && patch.notes
      ? {
          notes: Object.freeze({
            before: before.notes,
            after: patch.notes.value,
            clock: Object.freeze({
              writtenAt: patch.notes.writtenAt,
              writerId: patch.notes.writerId,
            }),
          }),
        }
      : {}),
  });

  return Object.freeze({
    after,
    decisions: Object.freeze({ name: nameDecision, notes: notesDecision }),
    appliedChanges,
  });
}

/** A pending row may be shown only when its locally applied delta was persisted. */
export interface MetalMetadataHistoryRecord {
  readonly id: string;
  readonly userId: string;
  readonly holdingId: string;
  readonly linkedActionId: string | null;
  readonly occurredAt: string;
  readonly status: "pending" | "applied" | "ignored" | "rejected";
  readonly localAppliedChangesJson: string;
  readonly canonicalAppliedChangesJson: string | null;
}

export interface MetalMetadataHistoryChange {
  readonly field: "name" | "notes";
  readonly before: string | null;
  readonly after: string | null;
}

export interface MetalMetadataHistoryEvent {
  readonly id: string;
  readonly linkedActionId: string | null;
  readonly occurredAt: Date;
  readonly changes: readonly MetalMetadataHistoryChange[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseChanges(
  rawJson: string
): readonly MetalMetadataHistoryChange[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    Object.keys(parsed).some((key) => key !== "name" && key !== "notes")
  ) {
    return null;
  }
  const changes: MetalMetadataHistoryChange[] = [];
  for (const key of ["name", "notes"] as const) {
    if (!(key in parsed)) continue;
    const change = parsed[key];
    if (
      !isRecord(change) ||
      Object.keys(change).sort().join(",") !== "after,before,clock" ||
      !isRecord(change.clock) ||
      typeof change.clock.writtenAt !== "number" ||
      !Number.isSafeInteger(change.clock.writtenAt) ||
      change.clock.writtenAt < 0 ||
      typeof change.clock.writerId !== "string" ||
      (key === "name"
        ? typeof change.before !== "string" || typeof change.after !== "string"
        : (change.before !== null && typeof change.before !== "string") ||
          (change.after !== null && typeof change.after !== "string"))
    )
      return null;
    if (change.before === change.after) continue;
    changes.push(
      Object.freeze({
        field: key,
        before: change.before as string | null,
        after: change.after as string | null,
      })
    );
  }
  return Object.freeze(changes);
}

/**
 * Server-adjudicated evidence supersedes provisional local evidence by edit ID.
 * The caller joins linkedActionId to the existing accepted material event only
 * after confirming the parent action is accepted/effective; there is no UI state.
 */
export function projectAppliedMetalMetadataHistory(
  records: readonly MetalMetadataHistoryRecord[],
  userId: string,
  holdingId: string
): readonly MetalMetadataHistoryEvent[] {
  const byId = new Map<string, MetalMetadataHistoryEvent>();
  for (const record of records) {
    if (
      record.userId !== userId ||
      record.holdingId !== holdingId ||
      record.status === "ignored" ||
      record.status === "rejected"
    )
      continue;
    const time = new Date(record.occurredAt);
    if (!Number.isFinite(time.getTime())) continue;
    const changes = parseChanges(
      record.status === "applied"
        ? (record.canonicalAppliedChangesJson ?? "")
        : record.localAppliedChangesJson
    );
    if (changes === null || changes.length === 0) continue;
    byId.set(
      record.id,
      Object.freeze({
        id: record.id,
        linkedActionId: record.linkedActionId,
        occurredAt: time,
        changes,
      })
    );
  }
  return Object.freeze(
    [...byId.values()].sort(
      (a, b) =>
        b.occurredAt.getTime() - a.occurredAt.getTime() ||
        a.id.localeCompare(b.id)
    )
  );
}
