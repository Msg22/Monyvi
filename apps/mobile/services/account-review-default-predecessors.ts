/**
 * #395 T050 - canonical owned predecessor admission before protected RPC.
 * Review uses the device-private captured action IDs. Add uses immutable
 * account-create/default payload membership, never a UI-only dependency DAG.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  type Sha256Provider,
} from "@monyvi/logic";
import { accountCreateDefaultPayloadSchema } from "../../../packages/logic/src/financial-actions/account-create-default";
import { reviewBatchSaveWireSchema } from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { parseAccountReviewLocalSaveSnapshot } from "../../../packages/logic/src/financial-actions/review-local-recovery";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";

interface LocalRootIdentity {
  readonly actionId?: string;
  readonly userId?: string;
  readonly state?: string;
  readonly serverOutcome?: string | null;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly localRecoverySnapshotJson?: string | null;
}
interface PredecessorInput {
  readonly root: LocalRootIdentity;
  readonly database: Database;
  readonly hashProvider: Sha256Provider;
  readonly loadOwnedRoot: (id: string) => Promise<LocalRootIdentity | null>;
}
const BLOCKED = "account_review_default_predecessor_blocked";
function block(): never {
  throw new Error(BLOCKED);
}
function ascii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/**
 * Read canonical existing registration shapes, never iterate a broad
 * RegisteredActionPayload's unchecked JSON arrays as implicit any.
 * Root envelopes were verified through the approved registry first.
 */
function createdAccountsFromEnvelope(
  envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>
): readonly string[] {
  const payload: unknown = envelope.payload;
  if (!isRecord(payload)) block();
  const mutation = payload.domainMutation;
  if (!isRecord(mutation)) return [];
  const untrusted = mutation.records;
  if (!Array.isArray(untrusted)) block();
  const records: readonly unknown[] = untrusted;
  const ids: string[] = [];
  for (const value of records) {
    if (!isRecord(value)) block();
    if (value.entity !== "account" || value.mode !== "create") continue;
    if (!isRecord(value.after) || typeof value.after.id !== "string") block();
    ids.push(value.after.id);
  }
  return ids;
}

async function inspectImmutableRoot(
  root: LocalRootIdentity,
  hashProvider: Sha256Provider
): Promise<ReturnType<typeof parseFinancialActionEnvelopeJson>> {
  let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
  try {
    const registry = createAccountReviewFinancialRegistry();
    envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
    const digest = await hashFinancialActionEnvelope(
      envelope,
      hashProvider,
      registry
    );
    if (
      digest.canonicalText !== root.payloadJson ||
      digest.payloadHash !== root.payloadHash ||
      (root.actionId && envelope.actionId !== root.actionId) ||
      (root.userId && envelope.userId !== root.userId)
    )
      block();
  } catch {
    block();
  }
  return envelope;
}

/** Canonical review ancestors are stored on the private immutable root. */
function capturedReviewDependencies(
  root: LocalRootIdentity,
  payload: ReturnType<typeof reviewBatchSaveWireSchema.parse>,
  actionId: string,
  ownerId: string
): readonly string[] {
  if (typeof root.localRecoverySnapshotJson !== "string") block();
  try {
    return parseAccountReviewLocalSaveSnapshot({
      json: root.localRecoverySnapshotJson,
      expectedRoot: {
        actionId,
        ownerId,
        sessionId: payload.sessionId,
        source: payload.source,
      },
    }).defaultDependencyActionIds;
  } catch {
    block();
  }
}

async function ownedCreatorActions(
  database: Database,
  ownerId: string,
  rootActionId: string,
  accountIds: readonly string[],
  hashProvider: Sha256Provider
): Promise<readonly string[]> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId) block();
  const roots = await scope
    .queryOwned(
      database.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("deleted", false)
    )
    .fetch();
  const required = new Set(accountIds);
  const creators = new Map<string, string>();
  for (const root of roots) {
    if (root.actionId === rootActionId) continue;
    const envelope = await inspectImmutableRoot(root, hashProvider);
    if (envelope.userId !== ownerId) block();
    for (const accountId of createdAccountsFromEnvelope(envelope)) {
      if (!required.has(accountId)) continue;
      if (creators.has(accountId)) block();
      creators.set(accountId, root.actionId);
    }
  }
  // Current local *created* rows must have a durable creator if an Add
  // command claims them in its historical default snapshot. Synced baseline
  // accounts need no local predecessor.
  for (const id of required) {
    const owned = await scope.findOwned(database.get<Account>("accounts"), id);
    if (
      owned.deleted ||
      (owned._raw._status === "created" && !creators.has(id))
    )
      block();
  }
  return [...new Set(creators.values())].sort(ascii);
}

async function requiredPredecessors(
  input: PredecessorInput,
  root: LocalRootIdentity
): Promise<readonly string[]> {
  const envelope = await inspectImmutableRoot(root, input.hashProvider);
  if (envelope.payloadVersion === "review.batch-save/v1") {
    if (
      envelope.kind !== "review_batch_save" ||
      envelope.domain !== "transactions"
    )
      block();
    const payload = reviewBatchSaveWireSchema.parse(envelope.payload);
    return capturedReviewDependencies(
      root,
      payload,
      envelope.actionId,
      envelope.userId
    );
  }
  if (envelope.payloadVersion === "account.create-default/v1") {
    if (
      envelope.kind !== "create_with_default" ||
      envelope.domain !== "accounts"
    )
      block();
    const payload = accountCreateDefaultPayloadSchema.parse(envelope.payload);
    return ownedCreatorActions(
      input.database,
      envelope.userId,
      envelope.actionId,
      payload.expectedDefaultSnapshot.activeAccountIds,
      input.hashProvider
    );
  }
  return [];
}

/** Validate every new protected tuple before ANY state mutation or RPC. */
export async function assertProtectedFinancialActionEnvelopeHash(
  root: LocalRootIdentity,
  provider: Sha256Provider
): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(root.payloadJson);
  } catch {
    block();
  }
  if (typeof raw !== "object" || raw === null || !("payloadVersion" in raw))
    block();
  if (
    raw.payloadVersion === "review.batch-save/v1" ||
    raw.payloadVersion === "account.create-default/v1"
  )
    await inspectImmutableRoot(root, provider);
}

/**
 * Fail closed on missing, foreign, unsupported, rejected or cyclic ancestors.
 * Re-reads durable owned roots after awaits, and reasserts authentication
 * immediately before RPC. No transport is dispatched inside this helper.
 */
export async function assertReviewDefaultPredecessorsAccepted(
  input: PredecessorInput
): Promise<void> {
  const rootEnvelope = await inspectImmutableRoot(
    input.root,
    input.hashProvider
  );
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== rootEnvelope.userId) block();
  const visiting = new Set<string>();
  const verified = new Set<string>();
  const visit = async (root: LocalRootIdentity): Promise<void> => {
    const envelope = await inspectImmutableRoot(root, input.hashProvider);
    if (envelope.userId !== scope.userId || visiting.has(envelope.actionId))
      block();
    if (verified.has(envelope.actionId)) return;
    // Canonically accepted roots may already have cleared their private
    // snapshots. Their immutable accepted result closes earlier ancestry.
    if (root !== input.root && root.state === "accepted") {
      verified.add(envelope.actionId);
      return;
    }
    visiting.add(envelope.actionId);
    const dependencies = await requiredPredecessors(input, root);
    for (const id of dependencies) {
      if (id === rootEnvelope.actionId && root !== input.root) block();
      const predecessor = await input.loadOwnedRoot(id);
      if (
        !predecessor ||
        predecessor.userId !== scope.userId ||
        predecessor.actionId !== id ||
        predecessor.state !== "accepted" ||
        (predecessor.serverOutcome !== "accepted" &&
          predecessor.serverOutcome !== "idempotent")
      )
        block();
      await visit(predecessor);
      const confirmed = await input.loadOwnedRoot(id);
      if (
        !confirmed ||
        confirmed.userId !== scope.userId ||
        confirmed.actionId !== id ||
        confirmed.state !== "accepted"
      )
        block();
    }
    visiting.delete(envelope.actionId);
    verified.add(envelope.actionId);
  };
  await visit(input.root);
  await assertExpectedCurrentUser(scope.userId);
}
