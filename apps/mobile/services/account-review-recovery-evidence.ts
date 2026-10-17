/**
 * #395 T051 - proof gate for ONE rejected, owned, immutable review action.
 * Uses T048's physical postimage SHA implementation; no inferred preimages,
 * timestamp winners or generic inverse financial effects.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Account,
  AccountFinancialEffect,
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
  Transaction,
  Transfer,
} from "@monyvi/db";
import {
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  type Sha256Provider,
} from "@monyvi/logic";
import {
  reviewBatchSaveWireSchema,
  type ReviewBatchSavePayload,
  type ReviewMutation,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import {
  parseAccountReviewLocalSaveSnapshot,
  type AccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import {
  hashAccountReviewLocalPostimage,
  physicalBoolean,
  physicalText,
} from "./account-review-local-snapshot-postimages";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import { parseCanonicalAccountsFromOutcomeJson } from "./account-review-recovery-canonical";
import {
  verifyCanonicalAccounts,
  type CanonicalAccountSnapshot,
  type FinancialActionReconciliationBundle,
} from "./financial-action-reconciliation-service";
import {
  assertExpectedCurrentUser,
  type CurrentUserDataScope,
} from "./user-data-access";

const TABLES: Readonly<Record<ReviewMutation["entity"], string>> = {
  account: "accounts",
  account_sms_sender: "account_sms_senders",
  bank_details: "bank_details",
  transaction: "transactions",
  transfer: "transfers",
};
const INCOMPLETE = "financial_action_reconciliation_incomplete";
function refuse(): never {
  throw new Error(INCOMPLETE);
}
function ascii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function identicalIds(a: readonly string[], b: readonly string[]): boolean {
  return (
    a.length === b.length &&
    [...a]
      .sort(ascii)
      .every((value, index) => value === [...b].sort(ascii)[index])
  );
}
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function physicalRow(
  db: Database,
  table: string,
  id: string
): Promise<Model> {
  try {
    return await db.get<Model>(table).find(id);
  } catch {
    refuse();
  }
}
async function verifyPostimage(
  model: Model,
  hash: string,
  provider: Sha256Provider
): Promise<void> {
  const actual = await hashAccountReviewLocalPostimage({
    table: model.table,
    id: model.id,
    raw: model._raw,
    hashProvider: provider,
  });
  if (actual !== hash) refuse();
}
async function verifyPublicRoot(
  root: FinancialActionGroup,
  provider: Sha256Provider
): Promise<ReviewBatchSavePayload> {
  const registry = createAccountReviewFinancialRegistry();
  const envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
  const canonical = await hashFinancialActionEnvelope(
    envelope,
    provider,
    registry
  );
  if (
    canonical.canonicalText !== root.payloadJson ||
    canonical.payloadHash !== root.payloadHash ||
    envelope.actionId !== root.actionId ||
    envelope.userId !== root.userId ||
    envelope.domain !== "transactions" ||
    envelope.kind !== "review_batch_save" ||
    envelope.payloadVersion !== "review.batch-save/v1" ||
    root.accountGuardsJson !== JSON.stringify(envelope.accountGuards) ||
    root.domainReferenceId !== envelope.domainReferenceId
  )
    refuse();
  return reviewBatchSaveWireSchema.parse(envelope.payload);
}
function verifyCanonicalRejection(
  root: FinancialActionGroup,
  expectedAbsentIds: readonly string[]
): void {
  if (
    root.state !== "rejected_compensating" ||
    (root.serverOutcome !== "stale" && root.serverOutcome !== "rejected") ||
    !root.outcomeJson ||
    !root.rejectionCode
  )
    refuse();
  let raw: unknown;
  try {
    raw = JSON.parse(root.outcomeJson);
  } catch {
    refuse();
  }
  if (
    !isObject(raw) ||
    raw.actionId !== root.actionId ||
    raw.status !== root.serverOutcome ||
    typeof raw.code !== "string" ||
    raw.code.toLowerCase() !== root.rejectionCode ||
    !Array.isArray(raw.canonicalAbsentAccountIds) ||
    !raw.canonicalAbsentAccountIds.every((id) => typeof id === "string") ||
    !identicalIds(raw.canonicalAbsentAccountIds, expectedAbsentIds) ||
    !Array.isArray(raw.canonicalAccounts)
  )
    refuse();
}

export interface VerifiedReviewCreatedRow {
  readonly entity: ReviewMutation["entity"];
  readonly model: Model;
}
export interface VerifiedReviewSmsRow {
  readonly draft: AccountReviewLocalSaveSnapshot["smsDrafts"][number];
  readonly model: SmsReviewDraftItem | null;
}
export interface VerifiedReviewRecovery {
  readonly root: FinancialActionGroup;
  readonly payload: ReviewBatchSavePayload;
  readonly snapshot: AccountReviewLocalSaveSnapshot;
  readonly created: readonly VerifiedReviewCreatedRow[];
  readonly existingAccounts: readonly Account[];
  readonly canonicalAccounts: readonly CanonicalAccountSnapshot[];
  readonly effects: readonly AccountFinancialEffect[];
  readonly drafts: readonly VerifiedReviewSmsRow[];
  readonly queue: SmsReviewQueue | null;
  readonly canRecreateOriginalQueue: boolean;
}

async function verifyCreated(
  db: Database,
  root: FinancialActionGroup,
  payload: ReviewBatchSavePayload,
  snapshot: AccountReviewLocalSaveSnapshot,
  provider: Sha256Provider
): Promise<readonly VerifiedReviewCreatedRow[]> {
  const expected = payload.domainMutation.records.map(
    (mutation) => mutation.entity + ":" + mutation.after.id
  );
  const actual = snapshot.createdEntityRefs.map(
    (ref) => ref.entity + ":" + ref.id
  );
  if (!identicalIds(expected, actual)) refuse();
  const rows: VerifiedReviewCreatedRow[] = [];
  for (const ref of snapshot.createdEntityRefs) {
    const record = await physicalRow(db, TABLES[ref.entity], ref.id);
    if (physicalBoolean(record._raw, "deleted") !== false) refuse();
    if (
      "user_id" in record._raw &&
      physicalText(record._raw, "user_id") !== root.userId
    )
      refuse();
    if (ref.entity === "bank_details" || ref.entity === "account_sms_sender") {
      const owner = await physicalRow(
        db,
        "accounts",
        physicalText(record._raw, "account_id")
      );
      if (
        physicalText(owner._raw, "user_id") !== root.userId ||
        !snapshot.createdEntityRefs.some(
          (candidate) =>
            candidate.entity === "account" && candidate.id === owner.id
        )
      )
        refuse();
    }
    await verifyPostimage(record, ref.expectedPostimageHash, provider);
    rows.push({ entity: ref.entity, model: record });
  }
  return rows;
}
async function verifyDefaults(
  db: Database,
  root: FinancialActionGroup,
  snapshot: AccountReviewLocalSaveSnapshot,
  provider: Sha256Provider
): Promise<readonly Account[]> {
  const result: Account[] = [];
  for (const expected of snapshot.defaultPreimages) {
    const account = await db.get<Account>("accounts").find(expected.accountId);
    if (
      account.userId !== root.userId ||
      account.deleted ||
      account.isDefault !== expected.isDefault
    )
      refuse();
    await verifyPostimage(account, expected.expectedPostimageHash, provider);
    result.push(account);
  }
  return result;
}
async function verifyEffects(
  db: Database,
  root: FinancialActionGroup,
  payload: ReviewBatchSavePayload,
  created: readonly VerifiedReviewCreatedRow[]
): Promise<readonly AccountFinancialEffect[]> {
  const effects = await db
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(Q.where("user_id", root.userId), Q.where("action_id", root.actionId))
    .fetch();
  if (
    !identicalIds(
      effects.map((effect) => effect.id),
      payload.accountEffects.map((effect) => effect.effectId)
    )
  )
    refuse();
  for (const expected of payload.accountEffects) {
    const effect = effects.find((item) => item.id === expected.effectId);
    if (
      !effect ||
      !effect.isEffective ||
      effect.deleted ||
      effect.actionId !== root.actionId ||
      effect.userId !== root.userId ||
      effect.accountId !== expected.accountId ||
      effect.currency !== expected.currency ||
      effect.amountMinorUnits !== expected.amountMinorUnits ||
      effect.domain !== "transactions" ||
      effect.kind !== "review.batch-save" ||
      effect.reversesEffectId !== null
    )
      refuse();
    const account = await db.get<Account>("accounts").find(effect.accountId);
    if (
      account.userId !== root.userId ||
      account.financialRevision !== effect.acceptedAccountRevision ||
      account.currency !== effect.currency
    )
      refuse();
    if (
      created.some(
        ({ entity, model }) => entity === "account" && model.id === account.id
      ) &&
      account.deleted
    )
      refuse();
  }
  return effects;
}
async function verifyCanonicalExisting(
  db: Database,
  root: FinancialActionGroup,
  payload: ReviewBatchSavePayload,
  created: readonly VerifiedReviewCreatedRow[],
  effects: readonly AccountFinancialEffect[],
  provider: Sha256Provider
): Promise<readonly CanonicalAccountSnapshot[]> {
  const createdIds = new Set(
    created.filter((ref) => ref.entity === "account").map((ref) => ref.model.id)
  );
  verifyCanonicalRejection(root, [...createdIds]);
  const canonical = parseCanonicalAccountsFromOutcomeJson(root.outcomeJson);
  if (!canonical) refuse();
  const existingIds = payload.accountEffects
    .map((effect) => effect.accountId)
    .filter((id) => !createdIds.has(id));
  if (
    !identicalIds(
      existingIds,
      canonical.map((row) => row.accountId)
    )
  )
    refuse();
  if (canonical.length === 0) return canonical;
  const accounts = await Promise.all(
    existingIds.map((id) => db.get<Account>("accounts").find(id))
  );
  const bundle: FinancialActionReconciliationBundle = {
    actionId: root.actionId,
    userId: root.userId,
    state: root.state,
    domain: root.domain,
    payloadJson: root.payloadJson,
    canonicalAccounts: canonical,
    localSmsReviewDraftSnapshot: null,
    accounts: accounts.map((account) => ({
      accountId: account.id,
      balance: account.balance,
      financialRevision: account.financialRevision,
      currency: account.currency,
    })),
    effects: effects
      .filter((effect) => !createdIds.has(effect.accountId))
      .map((effect) => ({
        acceptedAccountRevision: effect.acceptedAccountRevision,
        accountId: effect.accountId,
        actionId: effect.actionId,
        amountMinorUnits: effect.amountMinorUnits,
        currency: effect.currency,
        effectId: effect.id,
        isEffective: effect.isEffective,
        reversesEffectId: effect.reversesEffectId,
      })),
  };
  return (await verifyCanonicalAccounts(bundle, provider)) ?? refuse();
}
async function verifySms(
  db: Database,
  root: FinancialActionGroup,
  snapshot: AccountReviewLocalSaveSnapshot,
  provider: Sha256Provider
): Promise<
  Pick<VerifiedReviewRecovery, "queue" | "drafts" | "canRecreateOriginalQueue">
> {
  if (!snapshot.queuePreimage) {
    if (snapshot.smsDrafts.length > 0) refuse();
    return { queue: null, drafts: [], canRecreateOriginalQueue: false };
  }
  const q = snapshot.queuePreimage;
  // A new SMS namespace may consume restoration rights while old deleted
  // originals remain physically sealed. Never compensate that rejected Review
  // and clear its only private proof while any original SMS remains available.
  // Safe ordinary restoration before supersession remains unchanged.
  if (
    q.disposition === "superseded" &&
    snapshot.smsDrafts.some((draft) => draft.retentionState === "available")
  )
    refuse();
  const activeQueues = await db
    .get<SmsReviewQueue>("sms_review_queues")
    .query(Q.where("user_id", root.userId))
    .fetch();
  if (activeQueues.length > 1) refuse();
  const activeQueue = activeQueues[0] ?? null;
  if (
    (q.disposition === "present" &&
      (!activeQueue || activeQueue.id !== q.id)) ||
    (q.disposition === "pruned_empty" && activeQueue !== null)
  )
    refuse();
  // A newer namespace is intentionally allowed after explicit supersession;
  // it must never be restored over or treated as the old queue's postimage.
  let queuePostimage = activeQueue?.id === q.id ? activeQueue : null;
  if (!activeQueue && q.disposition === "pruned_empty") {
    try {
      queuePostimage = await db
        .get<SmsReviewQueue>("sms_review_queues")
        .find(q.id);
    } catch {
      queuePostimage = null;
    }
    if (
      queuePostimage &&
      (queuePostimage.userId !== root.userId ||
        queuePostimage._raw._status !== "deleted")
    )
      refuse();
  }
  if (queuePostimage)
    await verifyPostimage(queuePostimage, q.expectedPostimageHash, provider);
  const shouldRestore =
    q.disposition === "present" || q.disposition === "pruned_empty";
  const canRecreateOriginalQueue =
    q.disposition === "pruned_empty" &&
    snapshot.smsDrafts.every((draft) => draft.retentionState === "available");
  // A verified all-dedup cleanup may have permanently pruned the original
  // queue and its historical draft tombstones after newer sibling overrides.
  // Such a mixed supersession cannot safely recreate a partial old queue.
  // Demand complete physical absence for *every* original ID; never treat
  // a missing "present" queue or a still-live old draft as this correction.
  const fullyPrunedWithoutRestoration =
    q.disposition === "pruned_empty" && !canRecreateOriginalQueue;
  if (fullyPrunedWithoutRestoration) {
    if (await db.adapter.find("sms_review_queues", q.id)) refuse();
    for (const draft of snapshot.smsDrafts) {
      if (await db.adapter.find("sms_review_draft_items", draft.id)) refuse();
    }
  }
  const drafts: VerifiedReviewSmsRow[] = [];
  for (const draft of snapshot.smsDrafts) {
    if (draft.retentionState !== "available" || fullyPrunedWithoutRestoration) {
      // The immutable preimage is still evidence, not permission to restore
      // a pruned namespace or weaken created/effect/canonical root proofs.
      drafts.push({ draft, model: null });
      continue;
    }
    let model: SmsReviewDraftItem | null = null;
    try {
      model = await db
        .get<SmsReviewDraftItem>("sms_review_draft_items")
        .find(draft.id);
    } catch {
      refuse();
    }
    if (
      !model ||
      model.id !== draft.id ||
      model.userId !== root.userId ||
      model.queueId !== q.id ||
      model.smsFingerprint !== draft.smsFingerprint
    )
      refuse();
    await verifyPostimage(model, draft.expectedPostimageHash, provider);
    drafts.push({ draft, model: shouldRestore ? model : null });
  }
  const createdIds = new Set(
    snapshot.createdEntityRefs
      .filter(
        (ref) => ref.entity === "transaction" || ref.entity === "transfer"
      )
      .map((ref) => ref.id)
  );
  for (const entry of snapshot.smsDrafts) {
    if (entry.retentionState !== "available") continue;
    const [transactions, transfers] = await Promise.all([
      db
        .get<Transaction>("transactions")
        .query(
          Q.where("user_id", root.userId),
          Q.where("deleted", false),
          Q.where("sms_fingerprint", entry.smsFingerprint)
        )
        .fetch(),
      db
        .get<Transfer>("transfers")
        .query(
          Q.where("user_id", root.userId),
          Q.where("deleted", false),
          Q.where("sms_fingerprint", entry.smsFingerprint)
        )
        .fetch(),
    ]);
    if ([...transactions, ...transfers].some((row) => !createdIds.has(row.id)))
      refuse();
  }
  return { queue: queuePostimage, drafts, canRecreateOriginalQueue };
}

/** Caller holds the serialized Watermelon writer for the entire proof+batch. */
export async function verifyRejectedReviewRecovery(input: {
  readonly database: Database;
  readonly root: FinancialActionGroup;
  readonly scope: CurrentUserDataScope;
  readonly hashProvider: Sha256Provider;
}): Promise<VerifiedReviewRecovery> {
  const { database: db, root, scope, hashProvider } = input;
  if (scope.userId !== root.userId || root.deleted) refuse();
  await assertExpectedCurrentUser(root.userId);
  const payload = await verifyPublicRoot(root, hashProvider);
  if (!root.localRecoverySnapshotJson) refuse();
  const snapshot = parseAccountReviewLocalSaveSnapshot({
    json: root.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: root.actionId,
      ownerId: root.userId,
      sessionId: payload.sessionId,
      source: payload.source,
    },
  });
  const created = await verifyCreated(
    db,
    root,
    payload,
    snapshot,
    hashProvider
  );
  const existingAccounts = await verifyDefaults(
    db,
    root,
    snapshot,
    hashProvider
  );
  const effects = await verifyEffects(db, root, payload, created);
  const canonicalAccounts = await verifyCanonicalExisting(
    db,
    root,
    payload,
    created,
    effects,
    hashProvider
  );
  const sms = await verifySms(db, root, snapshot, hashProvider);
  await assertExpectedCurrentUser(root.userId);
  return {
    root,
    payload,
    snapshot,
    created,
    existingAccounts,
    canonicalAccounts,
    effects,
    ...sms,
  };
}
