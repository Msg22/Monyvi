/**
 * #395 T044: canonical review-only financial-action change-set fixtures.
 * Inputs are real closed review envelopes, hashed by the existing registry;
 * no fabricated accepted server receipt, SQL mutations or Save writer stubs.
 */
import { createHash } from "node:crypto";
import type { SyncTableChangeSet } from "@nozbe/watermelondb/sync";
import type {
  AppSyncDatabaseChangeSet,
  SupabaseTablesNames,
} from "../../services/sync/types";
import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  createFinancialActionRegistry,
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";
import {
  createReviewFinancialActionDefinitions,
  validateReviewBatchSavePayload,
} from "../../../../packages/logic/src/financial-actions/review-batch-save";
import type {
  ReviewBatchSavePayload,
  ReviewMutation,
} from "../../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import {
  NEW_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_ACTION_ID,
  REVIEW_CREATED_AT,
  REVIEW_EFFECT_ID,
  REVIEW_USER_ID,
  REVIEW_FROZEN_INTENT_DIGEST,
  atmTransferEnvelope,
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  smsNewBankEnvelope,
  smsNewBankPayload,
} from "../../../../packages/logic/src/financial-actions/__tests__/review-batch-save-fixtures";

export const REVIEW_ROOT_ID = "71000000-0000-4000-8000-000000000010";
export const REVIEW_SENDER_ID = "71000000-0000-4000-8000-000000000011";
export const FOREIGN_OWNER_ID = "72000000-0000-4000-8000-000000000012";
export const REVIEW_HASH_PROVIDER: Sha256Provider = {
  digestUtf8: (text: string): Promise<string> =>
    Promise.resolve(createHash("sha256").update(text, "utf8").digest("hex")),
};
export const reviewSyncRegistry = createFinancialActionRegistry([
  ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
  ...createReviewFinancialActionDefinitions(
    "review_batch_save_invalid_payload"
  ),
]);

export interface ReviewSyncFixture {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly payload: ReviewBatchSavePayload;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly changes: AppSyncDatabaseChangeSet;
}

/**
 * The same generated Supabase table names used by Monyvi's typed sync layer.
 * Narrow arbitrary test-matrix strings to actual reviewed sync tables, without
 * casting Watermelon's branded change-set index to an unrestricted dictionary.
 */
const REVIEW_CHANGE_TABLES = {
  financial_action_groups: true,
  account_financial_effects: true,
  accounts: true,
  bank_details: true,
  account_sms_senders: true,
  transactions: true,
  transfers: true,
} satisfies Partial<Record<SupabaseTablesNames, true>>;

export function isReviewSyncTableName(
  table: string
): table is keyof typeof REVIEW_CHANGE_TABLES {
  return Object.prototype.hasOwnProperty.call(REVIEW_CHANGE_TABLES, table);
}

function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface ChangeRow extends Readonly<Record<string, unknown>> {
  readonly id: string;
}

function changeSet(
  created: ChangeRow[],
  updated: ChangeRow[] = []
): SyncTableChangeSet {
  return { created, updated, deleted: [] };
}

/** Add an actual canonical sender child to the approved Bank/financial fixture. */
export function bankWithSender(): ReviewBatchSavePayload {
  const sender: ReviewMutation = {
    entity: "account_sms_sender",
    mode: "create",
    expectedUpdatedAt: null,
    after: {
      id: REVIEW_SENDER_ID,
      accountId: NEW_BANK_ACCOUNT_ID,
      senderName: "Bank Alerts",
      normalizedSenderName: "bank alerts",
      createdAt: REVIEW_CREATED_AT,
      deleted: false,
    },
  };
  const records: ReviewMutation[] = [
    ...smsNewBankPayload.domainMutation.records,
    sender,
  ].sort((a, b) =>
    ascii(a.entity + ":" + a.after.id, b.entity + ":" + b.after.id)
  );
  return validateReviewBatchSavePayload({
    ...smsNewBankPayload,
    frozenIntentDigest: REVIEW_FROZEN_INTENT_DIGEST,
    createGuards: records.map((record) => ({
      entity: record.entity,
      id: record.after.id,
      expectedAbsent: true,
    })),
    domainRecordRefs: records.map((record) => record.after.id).sort(ascii),
    domainMutation: { records },
  });
}

function mutationRow(record: ReviewMutation, ownerId: string): ChangeRow {
  if (record.entity === "account") {
    const after = record.after;
    return {
      id: after.id,
      user_id: ownerId,
      deleted: false,
      type: after.type,
      currency: after.currency,
      is_default: after.isDefault,
      balance: 15,
      financial_revision: "1",
      _status: "created",
    };
  }
  if (record.entity === "account_sms_sender") {
    const after = record.after;
    return {
      id: after.id,
      account_id: after.accountId,
      sender_name: after.senderName,
      normalized_sender_name: after.normalizedSenderName,
      deleted: false,
    };
  }
  if (record.entity === "bank_details") {
    const after = record.after;
    return {
      id: after.id,
      account_id: after.accountId,
      card_last_4: after.cardLast4,
      deleted: false,
    };
  }
  if (record.entity === "transaction") {
    const after = record.after;
    return {
      id: after.id,
      user_id: ownerId,
      account_id: after.accountId,
      sms_fingerprint: after.smsFingerprint,
      amount: after.amountMinorUnits,
      deleted: false,
    };
  }
  const after = record.after;
  return {
    id: after.id,
    user_id: ownerId,
    from_account_id: after.fromAccountId,
    to_account_id: after.toAccountId,
    sms_fingerprint: after.smsFingerprint,
    amount: after.amountMinorUnits,
    deleted: false,
  };
}

function rowsFor(
  payload: ReviewBatchSavePayload,
  ownerId: string,
  entity: ReviewMutation["entity"]
): ChangeRow[] {
  return payload.domainMutation.records
    .filter((item) => item.entity === entity)
    .map((item) => mutationRow(item, ownerId));
}

function changesFor(
  payload: ReviewBatchSavePayload,
  actionId: string,
  root: ChangeRow,
  ownerId: string
): AppSyncDatabaseChangeSet {
  const newAccountIds = new Set(
    rowsFor(payload, ownerId, "account").map((row) => row.id)
  );
  const updated = payload.accountEffects
    .filter((effect) => !newAccountIds.has(effect.accountId))
    .map((effect) => ({
      id: effect.accountId,
      user_id: ownerId,
      _status: "updated",
      _changed: "balance,financial_revision",
      balance: 100,
      financial_revision: "8",
    }));
  return {
    financial_action_groups: changeSet([root]),
    account_financial_effects: changeSet(
      payload.accountEffects.map((effect) => ({
        id: effect.effectId,
        action_id: actionId,
        user_id: ownerId,
        account_id: effect.accountId,
        amount_minor_units: effect.amountMinorUnits,
        currency: effect.currency,
      }))
    ),
    accounts: changeSet(rowsFor(payload, ownerId, "account"), updated),
    bank_details: changeSet(rowsFor(payload, ownerId, "bank_details")),
    account_sms_senders: changeSet(
      rowsFor(payload, ownerId, "account_sms_sender")
    ),
    transactions: changeSet(rowsFor(payload, ownerId, "transaction")),
    transfers: changeSet(rowsFor(payload, ownerId, "transfer")),
  };
}

/** Typed actual canonical envelope and hash; changes mirror local raw table IDs. */
export async function canonicalReviewChanges(
  kind: "bank" | "atm" | "voice" = "bank"
): Promise<ReviewSyncFixture> {
  const input =
    kind === "bank"
      ? { ...smsNewBankEnvelope, payload: bankWithSender() }
      : kind === "atm"
        ? atmTransferEnvelope
        : reviewBatchSaveEnvelope;
  const { canonicalText, payloadHash } = await hashFinancialActionEnvelope(
    input,
    REVIEW_HASH_PROVIDER,
    reviewSyncRegistry
  );
  const envelope = parseFinancialActionEnvelopeJson(
    canonicalText,
    reviewSyncRegistry
  );
  const payload = validateReviewBatchSavePayload(envelope.payload);
  // Mirror the actual persisted new action-root header, not merely the
  // transport tuple. Strict protected push verifies immutable domain/kind
  // against the canonical registry envelope BEFORE reading child rows.
  const root = {
    id: REVIEW_ROOT_ID,
    user_id: envelope.userId,
    action_id: envelope.actionId,
    domain: envelope.domain,
    kind: envelope.kind,
    domain_reference_id: envelope.domainReferenceId,
    account_guards_json: JSON.stringify(envelope.accountGuards),
    payload_hash: payloadHash,
    payload_json: canonicalText,
    state: "local_complete",
    deleted: false,
    _status: "created",
  };
  return {
    envelope,
    payload,
    payloadHash,
    payloadJson: canonicalText,
    changes: changesFor(payload, envelope.actionId, root, envelope.userId),
  };
}

export async function legacySyncChanges(): Promise<
  ReviewSyncFixture["changes"]
> {
  const { canonicalText, payloadHash } = await hashFinancialActionEnvelope(
    legacyEditBalanceEnvelope,
    REVIEW_HASH_PROVIDER
  );
  return {
    financial_action_groups: changeSet([
      {
        id: REVIEW_ROOT_ID,
        user_id: REVIEW_USER_ID,
        action_id: REVIEW_ACTION_ID,
        payload_json: canonicalText,
        payload_hash: payloadHash,
        state: "local_complete",
      },
    ]),
    accounts: changeSet(
      [],
      [
        {
          id: REVIEW_ACCOUNT_ID,
          user_id: REVIEW_USER_ID,
          _status: "updated",
          _changed: "balance,financial_revision",
          balance: 125,
          financial_revision: "8",
        },
      ]
    ),
    account_financial_effects: changeSet([
      {
        id: REVIEW_EFFECT_ID,
        user_id: REVIEW_USER_ID,
        action_id: REVIEW_ACTION_ID,
        account_id: REVIEW_ACCOUNT_ID,
      },
    ]),
  };
}

/** Preserve all Watermelon DirtyRaw fields while proving the root ID. */
function validatedRootChange(value: unknown): ChangeRow {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    value.id.length === 0
  ) {
    throw new Error("Invalid canonical financial root ID");
  }
  return { ...value, id: value.id };
}

export function withRoot(
  changes: AppSyncDatabaseChangeSet,
  update: (root: ChangeRow) => ChangeRow
): AppSyncDatabaseChangeSet {
  const original = changes.financial_action_groups?.created[0];
  if (!original) throw new Error("Missing canonical financial root");
  return {
    ...changes,
    financial_action_groups: changeSet([update(validatedRootChange(original))]),
  };
}

export function withoutCreatedTable(
  changes: AppSyncDatabaseChangeSet,
  table: string
): AppSyncDatabaseChangeSet {
  if (!isReviewSyncTableName(table)) {
    throw new Error("Unknown canonical review sync table: " + table);
  }
  return {
    ...changes,
    [table]: changeSet([]),
  };
}
