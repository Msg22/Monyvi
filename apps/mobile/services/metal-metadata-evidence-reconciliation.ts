import { Q, type Database, type Model } from "@nozbe/watermelondb";
import { Asset, FinancialActionGroup, MetalHoldingState } from "@monyvi/db";

import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { compareMetalMetadataClock } from "./metal-metadata-service";
import {
  findOwnedMetalMetadataEdit,
  parseMetalMetadataEditRequest,
  type MetalMetadataEditRecord,
} from "./metal-metadata-evidence-repository";
import { findOwnedById, getCurrentUserDataScope } from "./user-data-access";
import type {
  MetalMetadataAppliedChanges,
  MetalMetadataAppliedField,
} from "./metal-metadata-evidence";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface CanonicalField<TValue> {
  readonly value: TValue;
  readonly writtenAt: number | null;
  readonly writerId: string | null;
}

export interface CanonicalMetalMetadataEditOutcome {
  readonly editId: string;
  readonly holdingId: string;
  readonly status: "applied" | "ignored";
  readonly appliedChanges: MetalMetadataAppliedChanges;
  readonly canonicalMetadata: {
    readonly name: CanonicalField<string> | null;
    readonly notes: CanonicalField<string | null> | null;
  };
}

function invalidOutcome(): never {
  throw new Error("invalid_metal_metadata_edit_outcome");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseClock(value: unknown): {
  readonly writtenAt: number;
  readonly writerId: string;
} {
  const candidate = asObject(value);
  if (
    !candidate ||
    typeof candidate.writtenAt !== "number" ||
    !Number.isSafeInteger(candidate.writtenAt) ||
    candidate.writtenAt < 0 ||
    typeof candidate.writerId !== "string" ||
    !UUID_PATTERN.test(candidate.writerId)
  )
    invalidOutcome();
  return {
    writtenAt: candidate.writtenAt,
    writerId: candidate.writerId,
  };
}

function parseCanonicalField(
  value: unknown,
  field: "name" | "notes"
): CanonicalField<string> | CanonicalField<string | null> | null {
  if (value === null) return null;
  const record = asObject(value);
  if (
    !record ||
    Object.keys(record).sort().join(",") !== "value,writerId,writtenAt" ||
    (field === "name"
      ? typeof record.value !== "string" || record.value.trim().length === 0
      : record.value !== null && typeof record.value !== "string")
  )
    invalidOutcome();
  const isBaseline = record.writtenAt === null && record.writerId === null;
  const clock = isBaseline
    ? { writtenAt: null, writerId: null }
    : parseClock(record);
  return Object.freeze({
    value: record.value as string | null,
    ...clock,
  });
}

function parseChange(
  value: unknown,
  field: "name" | "notes"
):
  | MetalMetadataAppliedField<string>
  | MetalMetadataAppliedField<string | null> {
  const change = asObject(value);
  if (
    !change ||
    Object.keys(change).sort().join(",") !== "after,before,clock" ||
    (field === "name"
      ? typeof change.before !== "string" || typeof change.after !== "string"
      : (change.before !== null && typeof change.before !== "string") ||
        (change.after !== null && typeof change.after !== "string")) ||
    change.before === change.after
  )
    invalidOutcome();
  const clock = parseClock(change.clock);
  return Object.freeze({
    before: change.before as string | null,
    after: change.after as string | null,
    clock,
  });
}

/** Parses only server-adjudicated field changes; rejects submitted-intent JSON. */
export function normalizeCanonicalMetalMetadataEditOutcome(
  input: unknown,
  expectedEditId: string,
  expectedHoldingId: string
): CanonicalMetalMetadataEditOutcome {
  const outcome = asObject(input);
  const changes = asObject(outcome?.appliedChanges);
  const canonical = asObject(outcome?.canonicalMetadata);
  if (
    !outcome ||
    outcome.editId !== expectedEditId ||
    outcome.holdingId !== expectedHoldingId ||
    !UUID_PATTERN.test(expectedEditId) ||
    !UUID_PATTERN.test(expectedHoldingId) ||
    (outcome.status !== "applied" && outcome.status !== "ignored") ||
    !changes ||
    !canonical ||
    Object.keys(changes).some((key) => key !== "name" && key !== "notes") ||
    Object.keys(canonical).sort().join(",") !== "name,notes"
  )
    invalidOutcome();
  const name = parseCanonicalField(
    canonical.name,
    "name"
  ) as CanonicalField<string> | null;
  const notes = parseCanonicalField(canonical.notes, "notes");
  const parsedChanges: MetalMetadataAppliedChanges = Object.freeze({
    ...(changes.name === undefined
      ? {}
      : {
          name: parseChange(
            changes.name,
            "name"
          ) as MetalMetadataAppliedField<string>,
        }),
    ...(changes.notes === undefined
      ? {}
      : {
          notes: parseChange(changes.notes, "notes"),
        }),
  });
  const hasChanges =
    parsedChanges.name !== undefined || parsedChanges.notes !== undefined;
  if (
    (outcome.status === "applied") !== hasChanges ||
    (parsedChanges.name &&
      (!name ||
        parsedChanges.name.after !== name.value ||
        parsedChanges.name.clock.writtenAt !== name.writtenAt ||
        parsedChanges.name.clock.writerId !== name.writerId)) ||
    (parsedChanges.notes &&
      (!notes ||
        parsedChanges.notes.after !== notes.value ||
        parsedChanges.notes.clock.writtenAt !== notes.writtenAt ||
        parsedChanges.notes.clock.writerId !== notes.writerId))
  )
    invalidOutcome();
  return Object.freeze({
    editId: expectedEditId,
    holdingId: expectedHoldingId,
    status: outcome.status,
    appliedChanges: parsedChanges,
    canonicalMetadata: Object.freeze({ name, notes }),
  });
}

export interface MetalMetadataFieldInstallInput<TValue> {
  readonly currentValue: TValue;
  readonly currentClock: {
    readonly writtenAt: number;
    readonly writerId: string;
  } | null;
  readonly candidateValue: TValue | undefined;
  readonly candidateClock: {
    readonly writtenAt: number;
    readonly writerId: string;
  } | null;
  readonly canonicalValue: TValue;
  readonly canonicalClock: {
    readonly writtenAt: number;
    readonly writerId: string;
  } | null;
  readonly didApplyOnServer: boolean;
}

export function decideCanonicalMetalMetadataFieldInstall<TValue>(
  input: MetalMetadataFieldInstallInput<TValue>
): "install" | "preserve" | "conflict" {
  const localIsThisEdit =
    input.candidateClock !== null &&
    input.currentClock !== null &&
    input.candidateClock.writtenAt === input.currentClock.writtenAt &&
    input.candidateClock.writerId === input.currentClock.writerId &&
    input.candidateValue === input.currentValue;
  if (localIsThisEdit && !input.didApplyOnServer) return "install";
  if (input.canonicalClock === null) {
    return input.currentClock === null
      ? input.currentValue === input.canonicalValue
        ? "preserve"
        : "install"
      : "preserve";
  }
  const decision = compareMetalMetadataClock(
    input.currentClock?.writtenAt ?? null,
    input.currentClock?.writerId ?? null,
    { value: input.canonicalValue, ...input.canonicalClock }
  );
  if (decision === "apply") return "install";
  if (decision === "same" && input.currentValue !== input.canonicalValue) {
    return "conflict";
  }
  return "preserve";
}

function requestCandidates(edit: MetalMetadataEditRecord): {
  readonly name?: {
    readonly value: string;
    readonly writtenAt: number;
    readonly writerId: string;
  };
  readonly notes?: {
    readonly value: string | null;
    readonly writtenAt: number;
    readonly writerId: string;
  };
} {
  if (edit.actionId === null) {
    return parseMetalMetadataEditRequest(edit.requestJson).fields;
  }
  const parsed = JSON.parse(edit.requestJson) as unknown;
  const envelope = asObject(parsed);
  const payload = asObject(envelope?.payload);
  const change = asObject(payload?.metadataChange);
  const before = asObject(change?.before);
  const after = asObject(change?.after);
  if (
    !envelope ||
    envelope.actionId !== edit.actionId ||
    envelope.domainReferenceId !== edit.holdingId ||
    envelope.userId !== edit.userId ||
    envelope.kind !== "correct" ||
    !before ||
    !after ||
    typeof envelope.occurredAt !== "string" ||
    !Number.isSafeInteger(Date.parse(envelope.occurredAt)) ||
    new Date(envelope.occurredAt).toISOString() !== envelope.occurredAt
  )
    throw new Error("invalid_metal_metadata_edit_request");
  const writtenAt = Date.parse(envelope.occurredAt);
  return {
    ...(before.name !== after.name && typeof after.name === "string"
      ? { name: { value: after.name, writtenAt, writerId: edit.actionId } }
      : {}),
    ...(before.notes !== after.notes &&
    (typeof after.notes === "string" || after.notes === null)
      ? { notes: { value: after.notes, writtenAt, writerId: edit.actionId } }
      : {}),
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  const input = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(input)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + stableJson(input[key]))
      .join(",") +
    "}"
  );
}

/**
 * The canonical outcome and its projection convergence are committed in one
 * Watermelon writer. Newer local metadata clocks are never overwritten.
 * This does not change the financial revision, event, or material evidence.
 */
export async function commitCanonicalMetalMetadataEditOutcomeLocally(
  database: Database,
  rawOutcome: unknown,
  expectedEditId: string,
  expectedHoldingId: string,
  userId: string
): Promise<void> {
  const outcome = normalizeCanonicalMetalMetadataEditOutcome(
    rawOutcome,
    expectedEditId,
    expectedHoldingId
  );
  const initialScope = await getCurrentUserDataScope();
  if (initialScope.userId !== userId) {
    throw new Error("financial_action_auth_scope_changed");
  }
  await database.write(async (): Promise<void> => {
    const edit = await findOwnedMetalMetadataEdit(
      database,
      outcome.editId,
      userId
    );
    if (!edit || edit.deleted || edit.holdingId !== outcome.holdingId) {
      throw new Error("metal_metadata_edit_not_found");
    }
    const [asset, state] = await Promise.all([
      findOwnedById(database.get<Asset>("assets"), outcome.holdingId, userId),
      findOwnedById(
        database.get<MetalHoldingState>("metal_holding_states"),
        outcome.holdingId,
        userId
      ),
    ]);
    if (!asset || !state || asset.type !== "METAL") {
      throw new Error("metal_holding_not_owned");
    }

    if (edit.actionId) {
      const roots = await database
        .get<FinancialActionGroup>("financial_action_groups")
        .query(
          Q.where("action_id", edit.actionId),
          Q.where("user_id", userId),
          Q.take(1)
        )
        .fetch();
      const root = roots[0];
      if (
        !root ||
        root.actionId !== edit.actionId ||
        root.domain !== "metals" ||
        root.domainReferenceId !== outcome.holdingId ||
        root.payloadHash !== edit.payloadHash ||
        (root.state !== "accepted" &&
          !(
            (root.state === "reconciled" ||
              root.state === "reconciliation_incomplete") &&
            root.serverOutcome === "stale" &&
            root.rejectionCode === "HOLDING_REVISION_STALE"
          ))
      )
        throw new Error("metal_metadata_mixed_action_not_settled");
    }

    const canonicalText = stableJson(outcome.appliedChanges);
    const currentScope = await getCurrentUserDataScope();
    if (currentScope.userId !== userId)
      throw new Error("financial_action_auth_scope_changed");
    const canonicalSnapshotText = stableJson(outcome.canonicalMetadata);
    if (edit.status !== "pending") {
      if (
        edit.status !== outcome.status ||
        edit.appliedChangesJson === null ||
        edit.canonicalMetadataJson === null ||
        stableJson(JSON.parse(edit.appliedChangesJson)) !== canonicalText ||
        stableJson(JSON.parse(edit.canonicalMetadataJson)) !==
          canonicalSnapshotText
      )
        throw new Error("metal_metadata_edit_outcome_conflict");
      return;
    }

    const candidates = requestCandidates(edit);
    const canonical = outcome.canonicalMetadata;
    const localClock = (
      writtenAt: number | null,
      writerId: string | null
    ): { readonly writtenAt: number; readonly writerId: string } | null =>
      writtenAt === null || writerId === null ? null : { writtenAt, writerId };
    const nameDecision = canonical.name
      ? decideCanonicalMetalMetadataFieldInstall({
          currentValue: asset.name,
          currentClock: localClock(state.nameWrittenAt, state.nameWriterId),
          candidateValue: candidates.name?.value,
          candidateClock: candidates.name ?? null,
          canonicalValue: canonical.name.value,
          canonicalClock: localClock(
            canonical.name.writtenAt,
            canonical.name.writerId
          ),
          didApplyOnServer: outcome.appliedChanges.name !== undefined,
        })
      : "preserve";
    const notesDecision = canonical.notes
      ? decideCanonicalMetalMetadataFieldInstall({
          currentValue: asset.notes ?? null,
          currentClock: localClock(state.notesWrittenAt, state.notesWriterId),
          candidateValue: candidates.notes?.value,
          candidateClock: candidates.notes ?? null,
          canonicalValue: canonical.notes.value,
          canonicalClock: localClock(
            canonical.notes.writtenAt,
            canonical.notes.writerId
          ),
          didApplyOnServer: outcome.appliedChanges.notes !== undefined,
        })
      : "preserve";
    if (nameDecision === "conflict" || notesDecision === "conflict") {
      throw new Error("metal_metadata_tuple_conflict");
    }
    const snapshots = [
      captureCachedModelSnapshot(edit),
      ...(nameDecision === "install" || notesDecision === "install"
        ? [captureCachedModelSnapshot(asset), captureCachedModelSnapshot(state)]
        : []),
    ];
    try {
      const now = new Date();
      const operations: Model[] = [
        edit.prepareUpdate((row: MetalMetadataEditRecord): void => {
          row.status = outcome.status;
          row.appliedChangesJson = canonicalText;
          row.canonicalMetadataJson = canonicalSnapshotText;
          row.updatedAt = now;
        }),
      ];
      if (nameDecision === "install" || notesDecision === "install") {
        operations.push(
          asset.prepareUpdate((row): void => {
            if (nameDecision === "install" && canonical.name) {
              row.name = canonical.name.value;
            }
            if (notesDecision === "install" && canonical.notes) {
              row.notes = canonical.notes.value;
            }
            row.updatedAt = now;
          }),
          state.prepareUpdate((row): void => {
            if (nameDecision === "install" && canonical.name) {
              row.nameWrittenAt = canonical.name.writtenAt;
              row.nameWriterId = canonical.name.writerId;
            }
            if (notesDecision === "install" && canonical.notes) {
              row.notesWrittenAt = canonical.notes.writtenAt;
              row.notesWriterId = canonical.notes.writerId;
            }
            row.updatedAt = now;
          })
        );
      }
      await database.batch(...operations);
    } catch (error) {
      snapshots.forEach(restoreCachedModelSnapshot);
      throw error;
    }
  });
}

/**
 * Called after invalid mixed requests have been reconciled. A material CAS
 * conflict alone does not discard independently valid metadata evidence.
 * No material evidence is rewritten here.
 */
export async function discardRejectedMixedMetadataEvidence(
  database: Database,
  actionId: string,
  userId: string
): Promise<void> {
  await database.write(async (): Promise<void> => {
    const edit = await findOwnedMetalMetadataEdit(database, actionId, userId);
    const scope = await getCurrentUserDataScope();
    if (scope.userId !== userId)
      throw new Error("financial_action_auth_scope_changed");
    if (!edit || edit.actionId !== actionId || edit.status !== "pending")
      return;
    const snapshot = captureCachedModelSnapshot(edit);
    try {
      await database.batch(
        edit.prepareUpdate((row: MetalMetadataEditRecord): void => {
          row.status = "rejected";
          row.appliedChangesJson = "{}";
          row.updatedAt = new Date();
        })
      );
    } catch (error) {
      restoreCachedModelSnapshot(snapshot);
      throw error;
    }
  });
}
