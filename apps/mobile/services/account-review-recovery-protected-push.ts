/** Strict review-only (and activated Add) protected dirty-group proof. */
import type { SyncPushArgs, SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import { parseFinancialActionEnvelopeJson } from "@monyvi/logic";
import {
  validateReviewBatchSavePayload,
} from "../../../packages/logic/src/financial-actions/review-batch-save";
import {
  validateAccountCreateDefaultPayload,
} from "../../../packages/logic/src/financial-actions/account-create-default";
import { createAccountReviewFinancialRegistry } from
  "./account-review-financial-command-service";

const BROKEN = "account_financial_action_malformed_root";
function fail(): never { throw new Error(BROKEN); }
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rows(
  changes: SyncPushArgs["changes"],
  table: string,
  which: "created" | "updated"
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const change = (changes as unknown as Readonly<
    Record<string, SyncTableChangeSet | undefined>
  >)[table];
  return (change?.[which] ?? []).filter(isRecord);
}
function expectDirty(
  changes: SyncPushArgs["changes"],
  table: string,
  id: string,
  which: "created" | "updated"
): Readonly<Record<string, unknown>> {
  const found = rows(changes, table, which)
    .filter((candidate) => candidate.id === id);
  if (found.length !== 1 || !found[0]) fail();
  return found[0];
}

const TABLE_BY_ENTITY: Readonly<Record<string, string>> = {
  account: "accounts",
  account_sms_sender: "account_sms_senders",
  bank_details: "bank_details",
  transaction: "transactions",
  transfer: "transfers",
  account_default: "accounts",
};

export function inspectNewFinancialActionPushRoot(
  root: Readonly<Record<string, unknown>>,
  changes: SyncPushArgs["changes"]
): Readonly<{
  readonly accountGuards: readonly Readonly<Record<string, unknown>>[];
  readonly payload: Readonly<Record<string, unknown>>;
  readonly references: readonly Readonly<{ table: string; id: string }>[];
}> | null {
  if (typeof root.payload_json !== "string") return null;
  let raw: unknown;
  try { raw = JSON.parse(root.payload_json); } catch { fail(); }
  if (!isRecord(raw)) fail();
  const version = raw.payloadVersion;
  if (version !== "review.batch-save/v1" &&
      version !== "account.create-default/v1") return null;
  const envelope = parseFinancialActionEnvelopeJson(
    root.payload_json, createAccountReviewFinancialRegistry()
  );
  if (root.action_id !== envelope.actionId ||
      root.user_id !== envelope.userId ||
      root.domain !== envelope.domain ||
      root.kind !== envelope.kind ||
      typeof root.payload_hash !== "string" ||
      !/^[0-9a-f]{64}$/.test(root.payload_hash)) fail();
  const payload = version === "review.batch-save/v1"
    ? validateReviewBatchSavePayload(envelope.payload)
    : validateAccountCreateDefaultPayload(envelope.payload);
  const refs: Array<{ table: string; id: string }> = [];
  for (const mutation of payload.domainMutation.records) {
    const table = TABLE_BY_ENTITY[mutation.entity];
    if (!table) fail();
    const id = mutation.after.id;
    const physical = expectDirty(
      changes, table, id,
      mutation.mode === "create" ? "created" : "updated"
    );
    if (mutation.mode === "create") {
      if (physical.deleted !== false) fail();
      if (mutation.entity === "account" ||
          mutation.entity === "transaction" ||
          mutation.entity === "transfer") {
        if (physical.user_id !== envelope.userId) fail();
      } else {
        if (physical.account_id !== mutation.after.accountId) fail();
      }
    } else if (mutation.entity === "account_default") {
      if (physical.user_id !== envelope.userId ||
          physical.is_default !== false) fail();
    } else fail();
    refs.push({ table, id });
  }
  const effects = rows(changes, "account_financial_effects", "created")
    .filter((row) => row.action_id === envelope.actionId);
  if (effects.length !== payload.accountEffects.length) fail();
  for (const effect of payload.accountEffects) {
    const physical = expectDirty(
      changes, "account_financial_effects", effect.effectId, "created"
    );
    if (physical.action_id !== envelope.actionId ||
        physical.user_id !== envelope.userId ||
        physical.account_id !== effect.accountId ||
        physical.amount_minor_units !== effect.amountMinorUnits ||
        physical.currency !== effect.currency) fail();
    refs.push({ table: "accounts", id: effect.accountId });
  }
  for (const guard of envelope.accountGuards) {
    const accountId = guard.accountId;
    if (typeof accountId !== "string") fail();
    const candidates = [
      ...rows(changes, "accounts", "created"),
      ...rows(changes, "accounts", "updated"),
    ].filter((candidate) => candidate.id === accountId);
    if (candidates.length !== 1 || candidates[0]?.user_id !== envelope.userId)
      fail();
    refs.push({ table: "accounts", id: accountId });
  }
  const guarded = envelope.accountGuards.map((guard) => ({
    accountId: guard.accountId,
    expectedRevision: guard.expectedRevision,
  }));
  return {
    accountGuards: guarded,
    payload: { ...payload },
    references: refs,
  };
}
