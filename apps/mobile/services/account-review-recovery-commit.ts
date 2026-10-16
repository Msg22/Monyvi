/**
 * #395 T051 - once-only atomic compensation for an owned rejected review root.
 * Strict evidence is re-read inside the writer; account/effect identities stay
 * as immutable accounting history, while losing creates leave normal reads.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import {
  FinancialActionGroup,
  SmsReviewDraftItem,
  SmsReviewQueue,
  type CurrencyType,
} from "@monyvi/db";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  serializeDecimal,
  type Sha256Provider,
} from "@monyvi/logic";
import type {
  AccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { commitPreparedBatch } from "./watermelon-atomic-batch";
import {
  verifyRejectedReviewRecovery,
  type VerifiedReviewRecovery,
  type VerifiedReviewSmsRow,
} from "./account-review-recovery-evidence";

const INCOMPLETE = "financial_action_reconciliation_incomplete";
function refuse(): never { throw new Error(INCOMPLETE); }
function realTimestamp(text: string): Date {
  const date = new Date(text);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== text)
    refuse();
  return date;
}
function physicalUnsigned(text: string): number {
  if (!/^(0|[1-9]\d*)$/.test(text)) refuse();
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < 0 ||
      String(parsed) !== text) refuse();
  return parsed;
}
function balancedMinorUnits(text: string, currency: string): number {
  const places =
    CURRENCY_PRECISION[currency as CurrencyType] ?? DEFAULT_PRECISION;
  const exact = serializeDecimal(fromMinorUnits(text, places));
  const numeric = Number(exact);
  if (!Number.isFinite(numeric) ||
      serializeDecimal(String(numeric)) !== exact) refuse();
  return numeric;
}
function uniqueCached(models: readonly Model[]): readonly Model[] {
  const keys = new Set<string>();
  return models.filter((model) => {
    const key = model.table + ":" + model.id;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}
async function prepareOriginalQueue(
  db: Database,
  evidence: VerifiedReviewRecovery
): Promise<readonly Model[]> {
  const preimage = evidence.snapshot.queuePreimage;
  if (!preimage || !evidence.canRecreateOriginalQueue) refuse();
  const oldTombstone = evidence.queue;
  if (oldTombstone &&
      (oldTombstone.userId !== preimage.userId ||
       oldTombstone._raw._status !== "deleted"))
    refuse();
  const original = db.get<SmsReviewQueue>(
    "sms_review_queues"
  ).prepareCreate((row) => {
    row._raw.id = preimage.id;
    row.userId = preimage.userId;
    row._raw.created_at = realTimestamp(preimage.createdAt).getTime();
    row.updatedAt = realTimestamp(preimage.updatedAt);
  });
  return oldTombstone
    ? [oldTombstone.prepareDestroyPermanently(), original]
    : [original];
}
function prepareDraftOriginal(
  db: Database,
  ownerId: string,
  draft: Extract<
    AccountReviewLocalSaveSnapshot["smsDrafts"][number],
    { readonly retentionState: "available" }
  >
): SmsReviewDraftItem {
  return db.get<SmsReviewDraftItem>("sms_review_draft_items")
    .prepareCreate((row) => {
      row._raw.id = draft.id;
      row.userId = ownerId;
      row.queueId = draft.queueId;
      row.smsFingerprint = draft.smsFingerprint;
      row.payloadJson = draft.payloadJson;
      row.payloadVersion = physicalUnsigned(draft.payloadVersion);
      row.position = physicalUnsigned(draft.position);
      row.selectionOverride = draft.selectionOverride;
      row.parsedAt = realTimestamp(draft.parsedAt);
      row.updatedAt = realTimestamp(draft.updatedAt);
      row._raw.created_at = realTimestamp(draft.createdAt).getTime();
    });
}
function replaceDraftWithHistorical(
  db: Database,
  entry: VerifiedReviewSmsRow,
  ownerId: string
): readonly Model[] {
  const draft = entry.draft;
  if (draft.retentionState !== "available") return [];
  const prior = entry.model;
  if (!prior || prior.userId !== ownerId) refuse();
  if (draft.operation === "rebind_remaining") {
    return [
      prior.prepareUpdate((row) => {
        row.payloadJson = draft.payloadJson;
        row.payloadVersion = physicalUnsigned(draft.payloadVersion);
        row.position = physicalUnsigned(draft.position);
        row.selectionOverride = draft.selectionOverride;
        row.parsedAt = realTimestamp(draft.parsedAt);
        row.updatedAt = realTimestamp(draft.updatedAt);
      }),
    ];
  }
  // The selected draft's postimage is a real Watermelon delete tombstone.
  // Destroy it before re-creating its exact original ID in the same batch.
  const restored = prepareDraftOriginal(db, ownerId, draft);
  return [prior.prepareDestroyPermanently(), restored];
}
async function prepareSmsRestoration(
  db: Database,
  evidence: VerifiedReviewRecovery
): Promise<readonly Model[]> {
  const queue = evidence.snapshot.queuePreimage;
  if (!queue || (queue.disposition !== "present" &&
      queue.disposition !== "pruned_empty")) return [];
  if (queue.disposition === "pruned_empty" &&
      !evidence.canRecreateOriginalQueue) return [];
  const operations: Model[] = [];
  if (queue.disposition === "pruned_empty") {
    operations.push(...await prepareOriginalQueue(db, evidence));
  }
  for (const entry of evidence.drafts) {
    operations.push(...replaceDraftWithHistorical(
      db, entry, evidence.root.userId
    ));
  }
  return operations;
}
function prepareCreatedDeletes(
  evidence: VerifiedReviewRecovery,
  when: Date
): readonly Model[] {
  return evidence.created.map(({ model }) =>
    model.prepareUpdate((row) => {
      // All five review create kinds have the generated "deleted" domain bit.
      row._raw.deleted = true;
      row._raw.updated_at = when.getTime();
    })
  );
}
function prepareCanonicalExisting(
  evidence: VerifiedReviewRecovery,
  when: Date
): readonly Model[] {
  return evidence.canonicalAccounts.map((canonical) => {
    const account = evidence.existingAccounts.find(
      (candidate) => candidate.id === canonical.accountId
    );
    if (!account || account.deleted ||
        account.currency !== canonical.currency) refuse();
    return account.prepareUpdate((row) => {
      row.balance = balancedMinorUnits(
        canonical.balanceMinorUnits, canonical.currency
      );
      row.financialRevision = canonical.canonicalRevision;
      row.updatedAt = when;
    });
  });
}
function prepareEffects(
  evidence: VerifiedReviewRecovery,
  when: Date
): readonly Model[] {
  return evidence.effects.map((effect) =>
    effect.prepareUpdate((row) => {
      row.isEffective = false;
      row.compensatedAt = when;
      row.updatedAt = when;
    })
  );
}
function stageRootTerminal(
  root: FinancialActionGroup,
  when: Date
): FinancialActionGroup {
  return root.prepareUpdate((candidate) => {
    candidate.state = "reconciled";
    candidate.localRecoverySnapshotJson = null;
    candidate.updatedAt = when;
  });
}

export async function reconcileRejectedAccountReviewInSqlite(input: {
  readonly database: Database;
  readonly actionId: string;
  readonly hashProvider: Sha256Provider;
}): Promise<"reconciled" | "replay"> {
  const { database: db, actionId, hashProvider } = input;
  const scope = await getCurrentUserDataScope();
  return db.write(async (): Promise<"reconciled" | "replay"> => {
    await assertExpectedCurrentUser(scope.userId);
    const roots = await scope.queryOwned(
      db.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("action_id", actionId)
    ).fetch();
    if (roots.length !== 1 || !roots[0] ||
        roots[0].actionId !== actionId) refuse();
    const root = scope.assertOwned(roots[0]);
    if (root.state === "reconciled") return "replay";
    if (root.state !== "rejected_compensating") refuse();
    const evidence = await verifyRejectedReviewRecovery({
      database: db, root, scope, hashProvider,
    });
    await assertExpectedCurrentUser(scope.userId);
    const cached = uniqueCached([
      root,
      ...evidence.created.map((row) => row.model),
      ...evidence.existingAccounts,
      ...evidence.effects,
      ...evidence.drafts.flatMap((row) => row.model ? [row.model] : []),
      ...(evidence.queue ? [evidence.queue] : []),
    ]);
    const snapshots = cached.map(captureCachedModelSnapshot);
    let adapterCommitted = false;
    try {
      const now = new Date();
      const operations: Model[] = [
        ...prepareCreatedDeletes(evidence, now),
        ...prepareCanonicalExisting(evidence, now),
        ...prepareEffects(evidence, now),
        ...await prepareSmsRestoration(db, evidence),
        stageRootTerminal(root, now),
      ];
      await assertExpectedCurrentUser(scope.userId);
      await commitPreparedBatch(operations, db);
      adapterCommitted = true;
      return "reconciled";
    } catch (error: unknown) {
      if (!adapterCommitted) snapshots.forEach(restoreCachedModelSnapshot);
      throw error;
    }
  });
}
