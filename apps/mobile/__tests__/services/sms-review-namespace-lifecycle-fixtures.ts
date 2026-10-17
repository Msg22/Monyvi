/**
 * #395 T014-M test-only real-SQLite lifecycle fixture operations.
 * The actual namespace, codec, adapter, repository and writer stay unmocked.
 * These are extracted verbatim from the preserved lifecycle suite; only the
 * module import/export boundaries change.
 */
import { Q } from "@nozbe/watermelondb";
import type {
  Account,
  DismissedSmsFingerprint,
  Transaction,
  Transfer,
} from "@monyvi/db";
import type { AiParseResult } from "@/services/ai-sms-parser-service";
import { acquireOwnedSmsReviewQueueNamespace } from "@/services/sms-review-namespace-lease-service";
import { completeInitialSmsReviewResult } from "@/services/sms-review-namespace-session-service";
import { bindSmsReviewNamespaceCandidates } from "@/services/sms-review-namespace-state";
import {
  getSmsReviewDraftQueueSnapshot,
  mergeSmsReviewDrafts,
  updateSmsReviewDraftSelection,
  type SmsReviewQueueSnapshot,
} from "@/services/sms-review-draft-repository";
import {
  accountReviewSessionSchema,
  type AccountReviewSession,
} from "../../../../packages/logic/src/account-review/review-schemas";
import {
  release,
  track,
  database,
  ownedQueues,
  draftItems,
  OWNER,
  type Lease,
} from "./sms-review-namespace-test-harness";
import {
  chunksFromOriginal,
  separateOriginalChunks,
  complete,
  admittedContext,
  smsCandidate,
} from "./sms-review-complete-session-fixtures";

export interface IndependentSmsPublication {
  readonly controller: AbortController;
  readonly result: AiParseResult;
  readonly session: AccountReviewSession;
  readonly transaction: AiParseResult["transactions"][number];
}

export async function publishIndependentSms(
  sourceIndex: 0 | 1
): Promise<IndependentSmsPublication> {
  const chunk = separateOriginalChunks()[sourceIndex];
  const source = chunk?.submittedMessages[0];
  if (!chunk || !source) throw new Error("Missing independent SMS source");
  const controller = new AbortController();
  const success: AiParseResult = {
    transactions: chunk.mappedTransactions,
    reviewChunks: [chunk],
    hasError: false,
  };
  // The actual initial-session coordinator binds the original returned objects.
  // No lease-state, publication, normalizer or repository function is mocked.
  const result = await completeInitialSmsReviewResult({
    success,
    context: admittedContext(),
    candidates: [smsCandidate(source.id, source.smsFingerprint, source.body)],
    signal: controller.signal,
  });
  const session = accountReviewSessionSchema.parse(result.reviewSession);
  const transaction = result.transactions[0];
  const row = session.rows[0];
  if (!transaction || !row || row.source !== "SMS") {
    throw new Error("Missing canonical published SMS row");
  }
  expect(result.transactions).toBe(success.transactions);
  expect(result.transactions).toHaveLength(1);
  expect(session.rows).toHaveLength(1);
  expect(session.ownerId).toBe(OWNER);
  expect(row.sourceFingerprint).toBe(transaction.smsFingerprint);
  return { controller, result, session, transaction };
}

export async function publishIndependentPair(): Promise<
  readonly [IndependentSmsPublication, IndependentSmsPublication]
> {
  const a = await publishIndependentSms(0);
  const b = await publishIndependentSms(1);
  expect(a.session.sessionId).toBe(b.session.sessionId);
  expect(a.transaction.smsFingerprint).not.toBe(b.transaction.smsFingerprint);
  expect(a.controller.signal).not.toBe(b.controller.signal);
  expect(a.controller.signal.aborted).toBe(false);
  expect(b.controller.signal.aborted).toBe(false);
  expect((await ownedQueues()).map((queue) => queue.id)).toEqual([
    a.session.sessionId,
  ]);
  return [a, b];
}

export function unrelatedLegacySms(): AiParseResult["transactions"][number] {
  const transaction = chunksFromOriginal()[0]?.mappedTransactions[0];
  if (!transaction) throw new Error("Missing original legacy SMS fixture");
  // This new object never goes through the publication coordinator. Its exact
  // fingerprint is unrelated to either independently published original.
  return { ...transaction, smsFingerprint: "synthetic-unrelated-legacy-sms" };
}

export async function retainSelectedDraft(
  queueId: string,
  fingerprint: string
): Promise<SmsReviewQueueSnapshot> {
  const rows = await draftItems();
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("Missing committed owned SMS draft");
  expect(row.queueId).toBe(queueId);
  expect(row.userId).toBe(OWNER);
  expect(row.smsFingerprint).toBe(fingerprint);
  await updateSmsReviewDraftSelection(row.id, OWNER, true);
  const snapshot = await getSmsReviewDraftQueueSnapshot(OWNER);
  if (!snapshot) throw new Error("Missing populated owned queue snapshot");
  expect(snapshot.items[0]?.selectionOverride).toBe(true);
  return snapshot;
}

export async function expectRetainedDraftUnchanged(
  before: SmsReviewQueueSnapshot,
  rejectedFingerprint: string
): Promise<void> {
  expect(await getSmsReviewDraftQueueSnapshot(OWNER)).toEqual(before);
  expect(
    (await ownedQueues()).map((queue) => ({
      queueId: queue.id,
      ownerId: queue.userId,
    }))
  ).toEqual([{ queueId: before.queueId, ownerId: OWNER }]);
  expect((await draftItems()).map((row) => row.smsFingerprint)).not.toContain(
    rejectedFingerprint
  );
}

interface WriterAdmissionGate {
  readonly promise: Promise<void>;
  readonly open: () => void;
}

function writerAdmissionGate(): WriterAdmissionGate {
  let open = (): void => {
    throw new Error("Writer gate not initialized");
  };
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open: (): void => open() };
}

export async function cancelWhileAdmissionIsBlocked(
  publication: IndependentSmsPublication
): Promise<void> {
  const entered = writerAdmissionGate();
  const resume = writerAdmissionGate();
  // A separate real writer holds admission; the tested merge cannot enter it.
  // Cancellation after authorized merge admission may commit. No rollback or
  // post-admission abort behavior is prescribed by this regression.
  const blocker = database.write(async (): Promise<void> => {
    entered.open();
    await resume.promise;
  });
  await entered.promise;
  try {
    const rejected = expect(
      mergeSmsReviewDrafts({
        expectedUserId: OWNER,
        transactions: publication.result.transactions,
      })
    ).rejects.toThrow("sms_review_namespace_stale_merge");
    publication.controller.abort();
    resume.open();
    await rejected;
  } finally {
    resume.open();
    await blocker;
  }
}

/** T014-M terminal handling with actual SQLite source/merge code, no SUT stubs. */
export async function seedHandledDismissal(
  fingerprint: string,
  ownerId: string = OWNER
): Promise<void> {
  await database.write(async (): Promise<void> => {
    await database
      .get<DismissedSmsFingerprint>("dismissed_sms_fingerprints")
      .create((record): void => {
        record.userId = ownerId;
        record.smsFingerprint = fingerprint;
        record.updatedAt = new Date("2026-10-15T12:00:00.000Z");
      });
  });
}

export async function seedHandledSaved(
  publication: IndependentSmsPublication
): Promise<void> {
  const accounts = await database
    .get<Account>("accounts")
    .query(Q.where("user_id", OWNER))
    .fetch();
  const matched = accounts.find(
    (account) =>
      account.type === "BANK" &&
      account.currency === publication.transaction.currency
  );
  if (!matched) throw new Error("Missing owned captured bank");
  const original = publication.transaction;
  await database.write(async (): Promise<void> => {
    await database.get<Transaction>("transactions").create((record): void => {
      record.userId = OWNER;
      record.accountId = matched.id;
      record.amount = original.amount;
      record.currency = original.currency;
      record.type = original.type;
      record.categoryId = original.categoryId;
      record.date = original.date;
      record.smsFingerprint = original.smsFingerprint;
      record.source = "SMS";
      record.deleted = false;
      record.isDraft = false;
      record.updatedAt = new Date("2026-10-15T12:00:00.000Z");
    });
  });
}

export async function currentOwnedFinance(): Promise<{
  readonly balances: readonly string[];
  readonly savedFingerprints: readonly string[];
  readonly transferCount: number;
}> {
  const [accounts, transactions, transfers] = await Promise.all([
    database.get<Account>("accounts").query(Q.where("user_id", OWNER)).fetch(),
    database
      .get<Transaction>("transactions")
      .query(Q.where("user_id", OWNER))
      .fetch(),
    database
      .get<Transfer>("transfers")
      .query(Q.where("user_id", OWNER))
      .fetch(),
  ]);
  return {
    balances: accounts
      .map(
        (account) =>
          account.id + ":" + account.balance + ":" + account.financialRevision
      )
      .sort(),
    savedFingerprints: transactions
      .map((record) => record.smsFingerprint ?? "")
      .sort(),
    transferCount: transfers.length,
  };
}

export interface JointPublication {
  readonly controller: AbortController;
  readonly result: AiParseResult;
  readonly session: AccountReviewSession;
  readonly first: AiParseResult["transactions"][number];
  readonly second: AiParseResult["transactions"][number];
}

/** Publish two independently fingerprinted originals with one shared lease. */
export async function publishJointSms(): Promise<JointPublication> {
  const chunks = separateOriginalChunks();
  const controllers = new AbortController();
  const success: AiParseResult = {
    transactions: chunks.flatMap((chunk) => chunk.mappedTransactions),
    reviewChunks: chunks,
    hasError: false,
  };
  const result = await completeInitialSmsReviewResult({
    success,
    context: admittedContext(),
    candidates: chunks.map((chunk) => {
      const source = chunk.submittedMessages[0];
      if (!source) throw new Error("Missing valid original SMS chunk");
      return smsCandidate(source.id, source.smsFingerprint, source.body);
    }),
    signal: controllers.signal,
  });
  const session = accountReviewSessionSchema.parse(result.reviewSession);
  const first = result.transactions[0];
  const second = result.transactions[1];
  if (!first || !second) throw new Error("Two source SMS rows required");
  expect(result.transactions).toHaveLength(2);
  expect(session.rows).toHaveLength(2);
  expect(first.smsFingerprint).not.toBe(second.smsFingerprint);
  expect(session.ownerId).toBe(OWNER);
  return { controller: controllers, result, session, first, second };
}

/** A real owned lease and canonical SMS normalization for distinct returned
 * transaction objects representing the SAME original fingerprint. */
export async function publishOwnedDuplicateFingerprint(
  fingerprint: string,
  controller: AbortController
): Promise<{
  readonly lease: Lease;
  readonly first: AiParseResult["transactions"][number];
  readonly second: AiParseResult["transactions"][number];
}> {
  const original = chunksFromOriginal()[0];
  const mapped = original?.mappedTransactions[0];
  const source = original?.submittedMessages[0];
  if (!original || !mapped || !source) {
    throw new Error("Missing canonical original SMS source");
  }
  const first = { ...mapped, smsFingerprint: fingerprint };
  const second = { ...first };
  const chunk = {
    ...original,
    mappedTransactions: [first],
    submittedMessages: [{ ...source, smsFingerprint: fingerprint }],
  };
  const lease = track(
    await acquireOwnedSmsReviewQueueNamespace({
      expectedUserId: OWNER,
      signal: controller.signal,
    })
  );
  const session = await complete([chunk], lease);
  expect(session.rows).toHaveLength(1);
  expect(session.rows[0]?.sourceFingerprint).toBe(fingerprint);
  expect(first).not.toBe(second);
  bindSmsReviewNamespaceCandidates(lease, [first, second]);
  await release(lease, "published");
  return { lease, first, second };
}
