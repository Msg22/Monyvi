/** #395 T048: prepared postimages must represent exactly the owned review action. */
import type { Model } from "@nozbe/watermelondb";
import type {
  FinancialActionLinkedOperationPlan,
  FinancialActionLinkedOperationPostimage,
} from "./financial-action-foundation-contracts";
import type {
  ReviewBatchSavePayload,
  ReviewMutation,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";

function reject(reason: string): never {
  throw new Error("account_review_prepared_" + reason);
}
function isUnknownRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function field(raw: unknown, key: string): unknown {
  if (
    !isUnknownRecord(raw) ||
    !Object.prototype.hasOwnProperty.call(raw, key)
  ) {
    reject("missing_canonical_raw_field");
  }
  return raw[key];
}
function identity(table: string, id: string): string {
  return table + ":" + id;
}
export interface PreparedReviewOwnership {
  readonly ownerId: string;
  readonly actionId: string;
  readonly payload: ReviewBatchSavePayload;
  readonly plannedCreates: readonly Model[];
  readonly plannedExisting: FinancialActionLinkedOperationPlan["existingOperations"];
  readonly postedBalances: ReadonlyMap<string, number>;
  readonly postedRevisions: ReadonlyMap<string, string>;
}
function requireFullMembership(
  expected: PreparedReviewOwnership,
  actual: readonly FinancialActionLinkedOperationPostimage[]
): void {
  const wanted = [
    ...expected.plannedCreates.map((model) => identity(model.table, model.id)),
    ...expected.plannedExisting.map((op) =>
      identity(op.model.table, op.model.id)
    ),
  ];
  const got = actual.map((item) => identity(item.table, item.id));
  if (
    wanted.length !== got.length ||
    new Set(got).size !== got.length ||
    got.some((key) => !wanted.includes(key))
  )
    reject("member_mismatch");
}
function verifyAccountPostimage(
  item: FinancialActionLinkedOperationPostimage,
  expected: PreparedReviewOwnership
): void {
  const revision = expected.postedRevisions.get(item.id);
  const balance = expected.postedBalances.get(item.id);
  if (
    revision === undefined ||
    balance === undefined ||
    field(item.raw, "user_id") !== expected.ownerId ||
    field(item.raw, "financial_revision") !== revision ||
    field(item.raw, "balance") !== balance
  )
    reject("account_mismatch");
  const created = expected.payload.domainMutation.records.find(
    (record) => record.entity === "account" && record.after.id === item.id
  );
  if (
    created?.entity === "account" &&
    (field(item.raw, "is_default") !== created.after.isDefault ||
      field(item.raw, "type") !== created.after.type ||
      field(item.raw, "currency") !== created.after.currency)
  ) {
    reject("created_account_mismatch");
  }
}
function verifyEffectPostimage(
  item: FinancialActionLinkedOperationPostimage,
  expected: PreparedReviewOwnership
): void {
  const effect = expected.payload.accountEffects.find(
    (x) => x.effectId === item.id
  );
  if (
    !effect ||
    item.kind !== "create" ||
    field(item.raw, "user_id") !== expected.ownerId ||
    field(item.raw, "action_id") !== expected.actionId ||
    field(item.raw, "account_id") !== effect.accountId ||
    field(item.raw, "amount_minor_units") !== effect.amountMinorUnits ||
    field(item.raw, "currency") !== effect.currency ||
    field(item.raw, "is_effective") !== true
  )
    reject("effect_mismatch");
  if (
    field(item.raw, "accepted_account_revision") !==
    expected.postedRevisions.get(effect.accountId)
  )
    reject("effect_revision_mismatch");
}
function tableFor(entity: ReviewMutation["entity"]): string {
  if (entity === "transaction") return "transactions";
  if (entity === "transfer") return "transfers";
  if (entity === "account") return "accounts";
  if (entity === "bank_details") return "bank_details";
  return "account_sms_senders";
}
function verifyDomainCreate(
  item: FinancialActionLinkedOperationPostimage,
  expected: PreparedReviewOwnership
): void {
  const matching = expected.payload.domainMutation.records.find(
    (record) =>
      record.after.id === item.id && tableFor(record.entity) === item.table
  );
  if (!matching || item.kind !== "create") reject("domain_create_mismatch");
  if (matching.entity === "transaction" || matching.entity === "transfer") {
    if (
      field(item.raw, "user_id") !== expected.ownerId ||
      field(item.raw, "currency") !== matching.after.currency
    )
      reject("finance_owner_mismatch");
  } else if (
    matching.entity === "bank_details" ||
    matching.entity === "account_sms_sender"
  ) {
    if (
      !expected.payload.domainMutation.records.some(
        (record) =>
          record.entity === "account" &&
          record.after.id === matching.after.accountId &&
          record.after.id === field(item.raw, "account_id")
      )
    )
      reject("child_parent_mismatch");
  }
}
export function assertPreparedReviewOwnership(
  input: PreparedReviewOwnership,
  postimages: readonly FinancialActionLinkedOperationPostimage[]
): void {
  requireFullMembership(input, postimages);
  for (const item of postimages) {
    if (item.table === "accounts") verifyAccountPostimage(item, input);
    else if (item.table === "account_financial_effects")
      verifyEffectPostimage(item, input);
    else if (item.table !== "sms_review_draft_items")
      verifyDomainCreate(item, input);
  }
}
