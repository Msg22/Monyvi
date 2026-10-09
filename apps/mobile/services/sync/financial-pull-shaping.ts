import type { AccountFinancialEffect, FinancialActionGroup } from "@monyvi/db";
import {
  FINANCIAL_ACTION_STATES,
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
  type FinancialActionState,
  type FinancialActionValidationInput,
} from "@monyvi/logic";
import { Q, type Database } from "@nozbe/watermelondb";

export const FINANCIAL_PULL_SHAPING_ERROR_CODE =
  "sync_pull_financial_action_collision_mismatch";
const UNRESOLVED_FINANCIAL_ACTION_STATES = [
  "pending_local",
  "local_complete",
  "sync_pending",
  "sync_failed",
  "rejected_compensating",
  "reconciliation_incomplete",
] as const satisfies readonly FinancialActionState[];
const UNRESOLVED_FINANCIAL_ACTION_STATE_SET = new Set<string>(
  UNRESOLVED_FINANCIAL_ACTION_STATES
);

export interface FinancialPullRow extends Record<string, unknown> {
  readonly id: string;
}

function fail(): never {
  throw new Error(FINANCIAL_PULL_SHAPING_ERROR_CODE);
}
function requiredString(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) fail();
  return value;
}
function requiredNullableString(
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const value = record[key];
  if (value !== null && typeof value !== "string") fail();
  return value;
}
function readOwnedActionId(record: FinancialPullRow, userId: string): string {
  if (requiredString(record, "user_id") !== userId) fail();
  return requiredString(record, "action_id");
}
function readServerPayloadJson(record: FinancialPullRow): string {
  return typeof record.payload_json_text === "string"
    ? record.payload_json_text
    : requiredString(record, "payload_json");
}
function isUnresolvedState(state: string): boolean {
  if (!FINANCIAL_ACTION_STATES.some((candidate) => candidate === state)) fail();
  return UNRESOLVED_FINANCIAL_ACTION_STATE_SET.has(state);
}

function currentCalendarDate(): string {
  // Match the existing Add/Edit creation-side business-date contract.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) fail();
    return part.value;
  };
  return `${read("year")}-${read("month")}-${read("day")}`;
}
function canonicalPayloadIdentity(
  rawText: string,
  validationInput: FinancialActionValidationInput
): string {
  try {
    return serializeFinancialActionEnvelope(
      parseFinancialActionEnvelopeJson(rawText, undefined, validationInput),
      undefined,
      validationInput
    );
  } catch {
    fail();
  }
}
async function loadOwnedRoots(
  database: Database,
  userId: string,
  actionIds: readonly string[]
): Promise<readonly FinancialActionGroup[]> {
  if (actionIds.length === 0) return [];
  const roots = await database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(
      Q.where("user_id", userId),
      Q.where("action_id", Q.oneOf([...new Set(actionIds)]))
    )
    .fetch();
  const seen = new Set<string>();
  for (const root of roots) {
    if (root.userId !== userId || seen.has(root.actionId)) fail();
    seen.add(root.actionId);
  }
  return roots;
}
export async function hasOwnedUnresolvedFinancialActions(
  database: Database,
  userId: string
): Promise<boolean> {
  const count = await database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(
      Q.where("user_id", userId),
      Q.where("state", Q.oneOf([...UNRESOLVED_FINANCIAL_ACTION_STATES]))
    )
    .fetchCount();
  return count > 0;
}
function shapeRootRecord(
  record: FinancialPullRow,
  local: FinancialActionGroup | undefined,
  userId: string
): readonly FinancialPullRow[] {
  const actionId = readOwnedActionId(record, userId);
  if (!local) return [record];
  if (!isUnresolvedState(local.state)) return [{ ...record, id: local.id }];
  const validationInput: FinancialActionValidationInput = {
    latestAllowedCalendarDate: currentCalendarDate(),
  };
  if (
    local.userId !== userId ||
    local.actionId !== actionId ||
    local.payloadHash !== requiredString(record, "payload_hash") ||
    canonicalPayloadIdentity(local.payloadJson, validationInput) !==
      canonicalPayloadIdentity(readServerPayloadJson(record), validationInput)
  )
    fail();
  // Existing push RPC and reconciliation own the entire unresolved local root.
  return [];
}
export async function shapeFinancialActionRootPull(
  database: Database,
  userId: string,
  records: readonly FinancialPullRow[]
): Promise<readonly FinancialPullRow[]> {
  const roots = await loadOwnedRoots(
    database,
    userId,
    records.map((record) => readOwnedActionId(record, userId))
  );
  const localByAction = new Map(roots.map((root) => [root.actionId, root]));
  return records.flatMap((record) =>
    shapeRootRecord(
      record,
      localByAction.get(readOwnedActionId(record, userId)),
      userId
    )
  );
}
function assertEffectIdentity(
  local: AccountFinancialEffect,
  record: FinancialPullRow,
  userId: string
): void {
  if (
    local.id !== record.id ||
    local.userId !== userId ||
    local.actionId !== readOwnedActionId(record, userId) ||
    local.accountId !== requiredString(record, "account_id") ||
    local.domain !== requiredString(record, "domain") ||
    local.kind !== requiredString(record, "kind") ||
    local.currency !== requiredString(record, "currency") ||
    local.amountMinorUnits !==
      requiredString(record, "amount_minor_units_text") ||
    local.acceptedAccountRevision !==
      requiredString(record, "accepted_account_revision_text") ||
    local.reversesEffectId !==
      requiredNullableString(record, "reverses_effect_id")
  )
    fail();
}
async function loadCollidingEffects(
  database: Database,
  userId: string,
  records: readonly FinancialPullRow[],
  unresolved: ReadonlySet<string>
): Promise<ReadonlyMap<string, AccountFinancialEffect>> {
  const ids = records
    .filter((record) => unresolved.has(readOwnedActionId(record, userId)))
    .map((record) => record.id);
  if (ids.length === 0) return new Map();
  const effects = await database
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(
      Q.where("user_id", userId),
      Q.where("id", Q.oneOf([...new Set(ids)]))
    )
    .fetch();
  return new Map(effects.map((effect) => [effect.id, effect]));
}
export async function shapeAccountFinancialEffectPull(
  database: Database,
  userId: string,
  records: readonly FinancialPullRow[]
): Promise<readonly FinancialPullRow[]> {
  const roots = await loadOwnedRoots(
    database,
    userId,
    records.map((record) => readOwnedActionId(record, userId))
  );
  const unresolved = new Set(
    roots
      .filter((root) => isUnresolvedState(root.state))
      .map((root) => root.actionId)
  );
  if (unresolved.size === 0) return records;
  const localById = await loadCollidingEffects(
    database,
    userId,
    records,
    unresolved
  );
  return records.filter((record) => {
    if (!unresolved.has(readOwnedActionId(record, userId))) return true;
    const local = localById.get(record.id);
    if (!local) return true;
    assertEffectIdentity(local, record, userId);
    // Preserve mutable compensation/effectiveness until existing reconciliation.
    return false;
  });
}
export async function shapeFinancialPullRecords(
  table: string,
  records: readonly FinancialPullRow[],
  userId: string,
  database?: Database
): Promise<readonly FinancialPullRow[]> {
  if (!database) return records;
  if (table === "financial_action_groups")
    return shapeFinancialActionRootPull(database, userId, records);
  if (table === "account_financial_effects")
    return shapeAccountFinancialEffectPull(database, userId, records);
  return records;
}
export function normalizeFinancialEffectTimestamp(
  record: Record<string, unknown>,
  invalidRowErrorCode: string
): Record<string, unknown> {
  const value = record.compensated_at;
  if (value === null) return { ...record };
  if (typeof value !== "string") throw new Error(invalidRowErrorCode);
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  )
    throw new Error(invalidRowErrorCode);
  return { ...record, compensated_at: timestamp };
}
