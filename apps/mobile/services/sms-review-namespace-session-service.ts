/** Initial SMS publication coordinator; never commits financial drafts. */
import {
  prepareInitialSmsReviewChunks,
  type AcceptedSmsReviewChunk,
} from "../../../packages/logic/src/account-review/normalization-session";
import type { ParsedSmsTransaction } from "@monyvi/logic";
import type {
  AiParseResult,
  ParseSmsContext,
  SmsCandidate,
} from "./ai-sms-parser-service";
import { createCompleteSmsAccountReviewSession } from "./account-review-source-adapter-service";
import type { OwnedSmsReviewQueueLease } from "./sms-review-namespace-lease-service";
import {
  assertSmsReviewNamespaceCandidateCurrent,
  assertSmsReviewNamespaceEpoch,
  captureSmsReviewNamespaceEpoch,
  observeSmsReviewNamespaceActor,
  bindSmsReviewNamespaceCandidates,
  bindSmsReviewNamespacePublishedSession,
  isolateSmsReviewNamespacePublicationCandidates,
} from "./sms-review-namespace-state";
import { assertExpectedCurrentUser } from "./user-data-access";
import { assertNotAborted } from "./abort-utils";

import { reportSmsNamespaceCleanupFailure } from "./sms-review-namespace-diagnostics";

// Only shared fields are inspected or attached. Caller-specific unresolved
// reasons, diagnostics and safeguard summaries remain part of the unchanged T.
type InitialSmsReviewFields = Pick<
  AiParseResult,
  "transactions" | "reviewChunks" | "reviewSession"
>;

type SmsReviewLeaseRuntime = Pick<
  typeof import("./sms-review-namespace-lease-service"),
  | "acquireOwnedSmsReviewQueueNamespace"
  | "assertOwnedSmsReviewQueueNamespaceCurrent"
  | "releaseOwnedSmsReviewQueueNamespace"
>;

function isSmsReviewLeaseRuntime(
  value: unknown
): value is SmsReviewLeaseRuntime {
  return (
    typeof value === "object" &&
    value !== null &&
    "acquireOwnedSmsReviewQueueNamespace" in value &&
    typeof value.acquireOwnedSmsReviewQueueNamespace === "function" &&
    "assertOwnedSmsReviewQueueNamespaceCurrent" in value &&
    typeof value.assertOwnedSmsReviewQueueNamespaceCurrent === "function" &&
    "releaseOwnedSmsReviewQueueNamespace" in value &&
    typeof value.releaseOwnedSmsReviewQueueNamespace === "function"
  );
}

function loadSmsReviewLeaseRuntime(): SmsReviewLeaseRuntime {
  // Keep the ordinary parser import storage-free. Metro resolves this literal
  // require, while Jest executes it only after accepted opted-in SMS work.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded: unknown = require("./sms-review-namespace-lease-service");
  if (!isSmsReviewLeaseRuntime(loaded)) {
    throw new Error("sms_review_lease_runtime_unavailable");
  }
  return loaded;
}

// Per-call object identity, not a global mode: concurrent direct callers are
// unaffected. No extra public parser argument or provider-visible field.
const deferredContexts = new WeakSet<ParseSmsContext>();
const localResults = new WeakMap<
  InitialSmsReviewFields,
  readonly ParsedSmsTransaction[]
>();

/** Only the real local/trusted route may identify finance without an AI carrier. */
export function carryLocalSmsReviewRows<T extends InitialSmsReviewFields>(
  success: T,
  localTransactions: readonly ParsedSmsTransaction[]
): T {
  localResults.set(success, localTransactions);
  return success;
}

export function deferSmsReviewPublicationToOrchestrator(
  context: ParseSmsContext
): ParseSmsContext {
  if (context.reviewAccountSnapshots === undefined) return context;
  const deferred = { ...context };
  deferredContexts.add(deferred);
  return deferred;
}

interface InitialSmsPublicationInput<T extends InitialSmsReviewFields> {
  readonly success: T;
  readonly context: ParseSmsContext;
  readonly candidates: readonly SmsCandidate[];
  readonly signal?: AbortSignal;
  readonly allowLocalSources?: boolean;
  readonly namespaceEpoch?: string;
}

function initialChunks<T extends InitialSmsReviewFields>(
  input: InitialSmsPublicationInput<T>
): AcceptedSmsReviewChunk[] {
  return prepareInitialSmsReviewChunks({
    chunks: input.success.reviewChunks ?? [],
    transactions: input.success.transactions,
    sources: input.candidates.map((candidate) => ({
      id: candidate.message.id,
      body: candidate.message.body,
      sender: candidate.message.address,
      smsFingerprint: candidate.smsFingerprint,
    })),
    categorySystemNamesById: new Map(
      input.context.categories.map((category) => [
        category.id,
        category.systemName,
      ])
    ),
    allowLocalSources: input.allowLocalSources === true,
    allowedLocalTransactions: localResults.get(input.success) ?? [],
  });
}

export async function completeInitialSmsReviewResult<
  T extends InitialSmsReviewFields,
>(input: InitialSmsPublicationInput<T>): Promise<T> {
  const snapshots = input.context.reviewAccountSnapshots;
  if (
    !snapshots ||
    deferredContexts.has(input.context) ||
    input.success.transactions.length === 0
  ) {
    return input.success;
  }
  assertNotAborted(input.signal, "SMS review draft operation was cancelled.");
  if (input.namespaceEpoch !== undefined)
    assertSmsReviewNamespaceEpoch(input.namespaceEpoch);
  const acceptedReviewChunks = initialChunks(input);
  if (acceptedReviewChunks.length === 0) return input.success;
  // Importing the ordinary parser must not eagerly initialize SMS storage.
  const { acquireOwnedSmsReviewQueueNamespace } = loadSmsReviewLeaseRuntime();
  const lease = await acquireOwnedSmsReviewQueueNamespace({
    expectedUserId: snapshots.ownerId,
    signal: input.signal,
  });
  try {
    if (input.namespaceEpoch !== undefined)
      assertSmsReviewNamespaceEpoch(input.namespaceEpoch);
    return await assembleAndPublishInitialSms(
      input,
      acceptedReviewChunks,
      lease
    );
  } catch (error: unknown) {
    await cancelFailedInitialAssembly(lease);
    throw error;
  }
}

async function cancelFailedInitialAssembly(
  lease: OwnedSmsReviewQueueLease
): Promise<void> {
  try {
    const { releaseOwnedSmsReviewQueueNamespace } = loadSmsReviewLeaseRuntime();
    await releaseOwnedSmsReviewQueueNamespace({
      lease,
      disposition: "cancelled",
    });
  } catch (cleanup: unknown) {
    reportSmsNamespaceCleanupFailure(cleanup, "assembly");
  }
}

/** Capture an authenticated lifecycle fence without acquiring/creating a queue. */
export async function captureInitialSmsReviewNamespaceEpoch(
  context: ParseSmsContext
): Promise<string | undefined> {
  const snapshots = context.reviewAccountSnapshots;
  if (!snapshots) return undefined;
  await assertExpectedCurrentUser(snapshots.ownerId);
  observeSmsReviewNamespaceActor(snapshots.ownerId);
  return captureSmsReviewNamespaceEpoch();
}

async function assembleAndPublishInitialSms<T extends InitialSmsReviewFields>(
  input: InitialSmsPublicationInput<T>,
  acceptedReviewChunks: readonly AcceptedSmsReviewChunk[],
  lease: OwnedSmsReviewQueueLease
): Promise<T> {
  const snapshots = input.context.reviewAccountSnapshots;
  if (!snapshots) throw new Error("account_review_source_owner_mismatch");
  const {
    assertOwnedSmsReviewQueueNamespaceCurrent,
    releaseOwnedSmsReviewQueueNamespace,
  } = loadSmsReviewLeaseRuntime();
  const reviewSession = await createCompleteSmsAccountReviewSession({
    reviewAccountSnapshots: snapshots,
    acceptedReviewChunks,
    sourceRevision: "0",
    namespaceLease: lease,
  });
  await assertOwnedSmsReviewQueueNamespaceCurrent({
    lease,
    signal: input.signal,
  });
  const publicationTransactions =
    isolateSmsReviewNamespacePublicationCandidates(
      lease,
      input.success.reviewSession,
      input.success.transactions
    );
  bindSmsReviewNamespaceCandidates(lease, publicationTransactions);
  await releaseOwnedSmsReviewQueueNamespace({
    lease,
    disposition: "published",
  });
  await assertExpectedCurrentUser(lease.expectedUserId);
  assertNotAborted(input.signal, "SMS review draft operation was cancelled.");
  assertSmsReviewNamespaceCandidateCurrent(lease);
  bindSmsReviewNamespacePublishedSession(lease, reviewSession);
  return Object.assign({}, input.success, {
    transactions: publicationTransactions,
    reviewChunks: acceptedReviewChunks,
    reviewSession,
  });
}
