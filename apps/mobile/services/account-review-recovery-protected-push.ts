/** Strict review-only (and activated Add) protected dirty-group proof. */
import type {
  SyncPushArgs,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import { parseFinancialActionEnvelopeJson } from "@monyvi/logic";
import { validateReviewBatchSavePayload } from "../../../packages/logic/src/financial-actions/review-batch-save";
import { validateAccountCreateDefaultPayload } from "../../../packages/logic/src/financial-actions/account-create-default";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import {
  malformedAccountActionRoot,
  type AccountActionFailureReason,
  type AccountActionFailureSite,
} from "./sync/account-action-failure-context";

function fail(
  reason: AccountActionFailureReason,
  context: Omit<AccountActionFailureSite, "phase" | "reason"> = {}
): never {
  throw malformedAccountActionRoot({
    phase: "inspector",
    reason,
    ...context,
  });
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rows(
  changes: SyncPushArgs["changes"],
  table: string,
  which: "created" | "updated"
): ReadonlyArray<Readonly<Record<string, unknown>>> {
  const change = (
    changes as unknown as Readonly<
      Record<string, SyncTableChangeSet | undefined>
    >
  )[table];
  return (change?.[which] ?? []).filter(isRecord);
}
function expectDirty(
  changes: SyncPushArgs["changes"],
  table: string,
  id: string,
  which: "created" | "updated" | "created_or_updated",
  context: Pick<
    AccountActionFailureSite,
    "rootState" | "payloadVersion" | "mutationEntity"
  >
): Readonly<Record<string, unknown>> {
  const candidates =
    which === "created_or_updated"
      ? [...rows(changes, table, "created"), ...rows(changes, table, "updated")]
      : rows(changes, table, which);
  const found = candidates.filter((candidate) => candidate.id === id);
  if (found.length !== 1 || !found[0]) {
    const created = rows(changes, table, "created").filter(
      (row) => row.id === id
    ).length;
    const updated = rows(changes, table, "updated").filter(
      (row) => row.id === id
    ).length;
    const deleted =
      (
        changes as unknown as Readonly<
          Record<string, SyncTableChangeSet | undefined>
        >
      )[table]?.deleted.includes(id) ?? false;
    const memberPresence =
      found.length > 1 || created > 1 || updated > 1
        ? "duplicate"
        : created > 0 && updated > 0
          ? "created_and_updated"
          : created > 0
            ? "created"
            : updated > 0
              ? "updated"
              : deleted
                ? "deleted"
                : "absent";
    fail("dirty_member_missing_or_duplicate", {
      table,
      ...context,
      expectedBucket: which,
      memberPresence,
    });
  }
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
  readonly accountGuards: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly references: ReadonlyArray<Readonly<{ table: string; id: string }>>;
}> | null {
  // The account action inspector cannot authorize or reject a Metal action:
  // that domain's existing per-group transport/RPC checks remain mandatory.
  // In particular, never parse an unrelated malformed Metal payload here.
  if (root.domain === "metals") return null;
  if (typeof root.payload_json !== "string") return null;
  let raw: unknown;
  try {
    raw = JSON.parse(root.payload_json);
  } catch {
    fail("payload_json_invalid");
  }
  if (!isRecord(raw)) fail("payload_root_not_object");
  const version = raw.payloadVersion;
  if (
    version !== "review.batch-save/v1" &&
    version !== "account.create-default/v1"
  )
    return null;
  const envelope = parseFinancialActionEnvelopeJson(
    root.payload_json,
    createAccountReviewFinancialRegistry()
  );
  if (
    root.action_id !== envelope.actionId ||
    root.user_id !== envelope.userId ||
    root.domain !== envelope.domain ||
    root.kind !== envelope.kind ||
    typeof root.payload_hash !== "string" ||
    !/^[0-9a-f]{64}$/.test(root.payload_hash)
  )
    fail("root_tuple_mismatch", { rootState: root.state });
  const payload =
    version === "review.batch-save/v1"
      ? validateReviewBatchSavePayload(envelope.payload)
      : validateAccountCreateDefaultPayload(envelope.payload);
  const refs: Array<{ table: string; id: string }> = [];
  for (const mutation of payload.domainMutation.records) {
    const table = TABLE_BY_ENTITY[mutation.entity];
    if (!table) fail("mutation_entity_unsupported");
    const id = mutation.after.id;
    const physical = expectDirty(
      changes,
      table,
      id,
      mutation.mode === "create"
        ? "created"
        : mutation.entity === "account_default"
          ? "created_or_updated"
          : "updated",
      {
        rootState: root.state,
        payloadVersion: version,
        mutationEntity: mutation.entity,
      }
    );
    if (mutation.mode === "create") {
      if (physical.deleted !== false) fail("created_member_deleted", { table });
      if (
        mutation.entity === "account" ||
        mutation.entity === "transaction" ||
        mutation.entity === "transfer"
      ) {
        if (physical.user_id !== envelope.userId)
          fail("created_member_owner_mismatch", { table });
      } else {
        if (physical.account_id !== mutation.after.accountId)
          fail("created_child_parent_mismatch", { table });
      }
    } else if (mutation.entity === "account_default") {
      // Updating an unsynced account preserves Watermelon's created status.
      // Admit only this default-clear mutation, with unique owned live membership.
      if (
        physical.user_id !== envelope.userId ||
        physical.deleted !== false ||
        physical.is_default !== false
      )
        fail("default_clear_mismatch", { table });
    } else fail("mutation_mode_invalid");
    refs.push({ table, id });
  }
  const effects = rows(changes, "account_financial_effects", "created").filter(
    (row) => row.action_id === envelope.actionId
  );
  if (effects.length !== payload.accountEffects.length)
    fail("effect_count_mismatch", { table: "account_financial_effects" });
  for (const effect of payload.accountEffects) {
    const physical = expectDirty(
      changes,
      "account_financial_effects",
      effect.effectId,
      "created",
      { rootState: root.state, payloadVersion: version }
    );
    if (
      physical.action_id !== envelope.actionId ||
      physical.user_id !== envelope.userId ||
      physical.account_id !== effect.accountId ||
      physical.amount_minor_units !== effect.amountMinorUnits ||
      physical.currency !== effect.currency
    )
      fail("effect_fields_mismatch", { table: "account_financial_effects" });
    refs.push({ table: "accounts", id: effect.accountId });
  }
  for (const guard of envelope.accountGuards) {
    const accountId = guard.accountId;
    if (typeof accountId !== "string")
      fail("guard_account_id_invalid", { table: "accounts" });
    const candidates = [
      ...rows(changes, "accounts", "created"),
      ...rows(changes, "accounts", "updated"),
    ].filter((candidate) => candidate.id === accountId);
    if (candidates.length !== 1 || candidates[0]?.user_id !== envelope.userId)
      fail("guard_account_membership_mismatch", { table: "accounts" });
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
