/** Root-only completion after accepted Review members have already received SDK ACK. */
import type {
  SyncPushArgs,
  SyncTableChangeSet,
} from "@nozbe/watermelondb/sync";
import { parseFinancialActionEnvelopeJson } from "@monyvi/logic";
import { validateReviewBatchSavePayload } from "../../../../packages/logic/src/financial-actions/review-batch-save";
import { createAccountReviewFinancialRegistry } from "../account-review-financial-command-service";
import type { AccountActionProtection } from "./account-action-protection";
import type { AccountFinancialActionPushBundle } from "./account-protected-fields";

const TABLES = {
  account: "accounts",
  account_default: "accounts",
  account_sms_sender: "account_sms_senders",
  bank_details: "bank_details",
  transaction: "transactions",
  transfer: "transfers",
} as const;

export function collectAcceptedReviewRootOnlyAck(
  root: Readonly<Record<string, unknown>>,
  changes: SyncPushArgs["changes"],
  catalog: AccountActionProtection | undefined
): AccountFinancialActionPushBundle | null {
  if (
    root.domain !== "transactions" ||
    root.kind !== "review_batch_save" ||
    root.state !== "accepted" ||
    root.deleted !== false
  )
    return null;
  const matches =
    catalog?.roots.filter(
      (entry) =>
        entry.physicalRootId === root.id &&
        entry.actionId === root.action_id &&
        entry.ownerId === root.user_id &&
        entry.payloadHash === root.payload_hash &&
        entry.payloadJson === root.payload_json &&
        entry.state === root.state &&
        entry.terminalAccepted
    ) ?? [];
  const bound = matches[0];
  if (matches.length !== 1 || !bound) return null;
  // Catalog verifies the current owner, canonical hash and complete SQL090 receipt.
  const envelope = parseFinancialActionEnvelopeJson(
    bound.payloadJson,
    createAccountReviewFinancialRegistry()
  );
  if (
    envelope.domain !== root.domain ||
    envelope.kind !== root.kind ||
    envelope.payloadVersion !== "review.batch-save/v1" ||
    envelope.domainReferenceId !== root.domain_reference_id ||
    JSON.stringify(envelope.accountGuards) !== root.account_guards_json
  )
    return null;
  const payload = validateReviewBatchSavePayload(envelope.payload);
  const hasDirtyMember = (table: string, id: string): boolean => {
    const slice = (
      changes as unknown as Readonly<
        Record<string, SyncTableChangeSet | undefined>
      >
    )[table];
    return (
      [...(slice?.created ?? []), ...(slice?.updated ?? [])].some(
        (row) => row.id === id
      ) || (slice?.deleted ?? []).includes(id)
    );
  };
  // A historical receipt authorizes ONLY its root here. Any residual original
  // member still needs the existing strict group path; never ACK later edits.
  if (
    payload.domainMutation.records.some((mutation) =>
      hasDirtyMember(TABLES[mutation.entity], mutation.after.id)
    ) ||
    payload.accountEffects.some((effect) =>
      hasDirtyMember("account_financial_effects", effect.effectId)
    )
  )
    return null;
  return {
    candidate: {
      actionId: bound.actionId,
      payloadHash: bound.payloadHash,
      payloadJson: bound.payloadJson,
      state: bound.state,
    },
    rowIds: { financial_action_groups: [bound.physicalRootId] },
  };
}
