import { Q, type Database, type Model } from "@nozbe/watermelondb";
import {
  getFinancialActionUtf8ByteLength,
  MAX_ACTION_NAME_UTF8_BYTES,
  MAX_ACTION_NOTES_UTF8_BYTES,
  serializeCanonicalJsonValue,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  MetalMetadataAppliedChanges,
  MetalMetadataCandidate,
  MetalMetadataEvidencePatch,
  MetalMetadataHistoryRecord,
} from "./metal-metadata-evidence";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CANONICAL_MS_PATTERN = /^(0|[1-9][0-9]*)$/;

/**
 * A distinct edit identity is retained for each save, even if Watermelon later
 * coalesces the assets/holding-state dirty fragments into one sync push.
 */
export interface MetalMetadataEditRequestInput {
  readonly editId: string;
  readonly userId: string;
  readonly holdingId: string;
  readonly linkedActionId: null;
  readonly occurredAt: string;
  readonly fields: MetalMetadataEvidencePatch;
}

export interface DurableMetalMetadataEditRequest {
  readonly editId: string;
  readonly userId: string;
  readonly holdingId: string;
  readonly linkedActionId: null;
  readonly occurredAt: string;
  readonly fields: MetalMetadataEvidencePatch;
  readonly requestJson: string;
  readonly payloadHash: string;
}

export interface MetalMetadataEditRecord extends Model {
  userId: string;
  holdingId: string;
  actionId: string | null;
  payloadHash: string;
  requestJson: string;
  status: "pending" | "applied" | "ignored" | "rejected";
  localAppliedChangesJson: string;
  appliedChangesJson: string | null;
  canonicalMetadataJson: string | null;
  occurredAt: Date;
  updatedAt: Date;
  deleted: boolean;
}

function fail(code: string): never {
  throw new Error(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateField(
  field: "name" | "notes",
  value: MetalMetadataCandidate<string | null>,
  editId: string
): void {
  if (
    !Number.isSafeInteger(value.writtenAt) ||
    value.writtenAt < 0 ||
    value.writerId !== editId ||
    !UUID_PATTERN.test(value.writerId)
  )
    fail("metal_metadata_invalid_edit_identity");
  if (
    field === "name"
      ? typeof value.value !== "string" ||
        value.value.trim().length === 0 ||
        getFinancialActionUtf8ByteLength(value.value) >
          MAX_ACTION_NAME_UTF8_BYTES
      : (value.value !== null && typeof value.value !== "string") ||
        (typeof value.value === "string" &&
          getFinancialActionUtf8ByteLength(value.value) >
            MAX_ACTION_NOTES_UTF8_BYTES)
  )
    fail("invalid_metal_metadata_patch");
}

function validateInput(input: MetalMetadataEditRequestInput): void {
  if (
    !UUID_PATTERN.test(input.editId) ||
    !UUID_PATTERN.test(input.userId) ||
    !UUID_PATTERN.test(input.holdingId) ||
    input.linkedActionId !== null ||
    !Number.isFinite(Date.parse(input.occurredAt)) ||
    new Date(input.occurredAt).toISOString() !== input.occurredAt
  )
    fail("invalid_metal_metadata_edit_request");
  const keys = Object.keys(input.fields);
  if (
    keys.length < 1 ||
    keys.length > 2 ||
    keys.some((key) => key !== "name" && key !== "notes")
  )
    fail("invalid_metal_metadata_patch");
  if (input.fields.name) validateField("name", input.fields.name, input.editId);
  if (input.fields.notes)
    validateField("notes", input.fields.notes, input.editId);
}

function encodeRequest(input: MetalMetadataEditRequestInput): string {
  const fields = {
    ...(input.fields.name
      ? {
          name: {
            value: input.fields.name.value,
            writtenAt: String(input.fields.name.writtenAt),
            writerId: input.fields.name.writerId,
          },
        }
      : {}),
    ...(input.fields.notes
      ? {
          notes: {
            value: input.fields.notes.value,
            writtenAt: String(input.fields.notes.writtenAt),
            writerId: input.fields.notes.writerId,
          },
        }
      : {}),
  };
  const value = {
    editId: input.editId,
    fields,
    holdingId: input.holdingId,
    linkedActionId: null,
    occurredAt: input.occurredAt,
    userId: input.userId,
  };
  return serializeCanonicalJsonValue(value);
}

export async function createCanonicalMetalMetadataEditRequest(
  input: MetalMetadataEditRequestInput,
  hashProvider: Sha256Provider
): Promise<DurableMetalMetadataEditRequest> {
  validateInput(input);
  const requestJson = encodeRequest(input);
  const payloadHash = await hashProvider.digestUtf8(requestJson);
  if (!SHA256_PATTERN.test(payloadHash)) {
    fail("invalid_metal_metadata_edit_hash");
  }
  return Object.freeze({ ...input, requestJson, payloadHash });
}

export function parseMetalMetadataEditRequest(
  requestJson: string
): MetalMetadataEditRequestInput {
  let value: unknown;
  try {
    value = JSON.parse(requestJson) as unknown;
  } catch {
    return fail("invalid_metal_metadata_edit_request");
  }
  if (
    !isObject(value) ||
    Object.keys(value).sort().join(",") !==
      "editId,fields,holdingId,linkedActionId,occurredAt,userId" ||
    !isObject(value.fields) ||
    typeof value.editId !== "string" ||
    typeof value.userId !== "string" ||
    typeof value.holdingId !== "string" ||
    typeof value.occurredAt !== "string" ||
    value.linkedActionId !== null
  )
    fail("invalid_metal_metadata_edit_request");
  const fields: {
    name?: MetalMetadataCandidate<string>;
    notes?: MetalMetadataCandidate<string | null>;
  } = {};
  for (const key of ["name", "notes"] as const) {
    const field = value.fields[key];
    if (field === undefined) continue;
    if (
      !isObject(field) ||
      Object.keys(field).sort().join(",") !== "value,writerId,writtenAt" ||
      typeof field.writerId !== "string" ||
      typeof field.writtenAt !== "string" ||
      !CANONICAL_MS_PATTERN.test(field.writtenAt) ||
      !Number.isSafeInteger(Number(field.writtenAt)) ||
      (key === "name"
        ? typeof field.value !== "string"
        : field.value !== null && typeof field.value !== "string")
    )
      fail("invalid_metal_metadata_edit_request");
    const entry = {
      value: field.value,
      writtenAt: Number(field.writtenAt),
      writerId: field.writerId,
    };
    if (key === "name") fields.name = entry as MetalMetadataCandidate<string>;
    else fields.notes = entry as MetalMetadataCandidate<string | null>;
  }
  const input: MetalMetadataEditRequestInput = {
    editId: value.editId,
    userId: value.userId,
    holdingId: value.holdingId,
    occurredAt: value.occurredAt,
    linkedActionId: null,
    fields,
  };
  validateInput(input);
  if (encodeRequest(input) !== requestJson) {
    fail("invalid_metal_metadata_edit_request");
  }
  return Object.freeze(input);
}

/**
 * The caller MUST include this prepared create in the same Watermelon batch as
 * the actual assets + metal_holding_states writes. This is never an independent
 * best-effort History write.
 */
export function prepareLocalMetalMetadataEvidence(
  database: Database,
  request: DurableMetalMetadataEditRequest,
  locallyApplied: MetalMetadataAppliedChanges
): Model {
  return database
    .get<MetalMetadataEditRecord>("metal_metadata_edit_outcomes")
    .prepareCreate((row): void => {
      row._raw.id = request.editId;
      row.userId = request.userId;
      row.holdingId = request.holdingId;
      row.actionId = null;
      row.payloadHash = request.payloadHash;
      row.requestJson = request.requestJson;
      row.status = "pending";
      row.localAppliedChangesJson = JSON.stringify(locallyApplied);
      row.appliedChangesJson = null;
      row.canonicalMetadataJson = null;
      row.occurredAt = new Date(request.occurredAt);
      row.updatedAt = new Date(request.occurredAt);
      row.deleted = false;
    });
}

export interface MixedMetalMetadataEvidenceInput {
  readonly actionId: string;
  readonly userId: string;
  readonly holdingId: string;
  readonly occurredAt: string;
  readonly requestJson: string;
  readonly payloadHash: string;
  readonly locallyApplied: MetalMetadataAppliedChanges;
}

/**
 * A mixed correction uses the financial action identity/hash, and its prepared
 * evidence create participates in the existing single financial-action writer.
 */
export function prepareMixedMetalMetadataEvidence(
  database: Database,
  input: MixedMetalMetadataEvidenceInput
): Model {
  if (
    !UUID_PATTERN.test(input.actionId) ||
    !SHA256_PATTERN.test(input.payloadHash)
  ) {
    fail("invalid_metal_metadata_edit_request");
  }
  return database
    .get<MetalMetadataEditRecord>("metal_metadata_edit_outcomes")
    .prepareCreate((row): void => {
      row._raw.id = input.actionId;
      row.userId = input.userId;
      row.holdingId = input.holdingId;
      row.actionId = input.actionId;
      row.payloadHash = input.payloadHash;
      row.requestJson = input.requestJson;
      row.status = "pending";
      row.localAppliedChangesJson = JSON.stringify(input.locallyApplied);
      row.appliedChangesJson = null;
      row.canonicalMetadataJson = null;
      row.occurredAt = new Date(input.occurredAt);
      row.updatedAt = new Date(input.occurredAt);
      row.deleted = false;
    });
}

export async function findOwnedMetalMetadataEdit(
  database: Database,
  editId: string,
  userId: string
): Promise<MetalMetadataEditRecord | null> {
  const records = await database
    .get<MetalMetadataEditRecord>("metal_metadata_edit_outcomes")
    .query(Q.where("id", editId), Q.where("user_id", userId), Q.take(1))
    .fetch();
  return records[0] ?? null;
}

export function shapeMetalMetadataHistoryRecord(
  record: MetalMetadataEditRecord
): MetalMetadataHistoryRecord {
  return Object.freeze({
    id: record.id,
    userId: record.userId,
    holdingId: record.holdingId,
    linkedActionId: record.actionId,
    occurredAt: record.occurredAt.toISOString(),
    status: record.status,
    localAppliedChangesJson: record.localAppliedChangesJson,
    canonicalAppliedChangesJson: record.appliedChangesJson,
  });
}
