/** Frozen local default provenance and unresolved producer dependencies. */
import { Q, type Database } from "@nozbe/watermelondb";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";
import { validateAccountCreateDefaultPayload } from "../../../packages/logic/src/financial-actions/account-create-default";
import type { AccountReviewLocalSaveSnapshot } from "../../../packages/logic/src/financial-actions/review-local-recovery";
import {
  reviewBatchSaveWireSchema,
  type ReviewBatchSavePayload,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import type { FinancialActionLinkedOperationPreparedOwnershipInput } from "./financial-action-foundation-contracts";
import {
  assertExpectedCurrentUser,
  type CurrentUserDataScope,
} from "./user-data-access";
import {
  hashAccountReviewLocalPostimage,
  physicalBoolean,
  physicalText,
} from "./account-review-local-snapshot-postimages";

type Default = AccountReviewLocalSaveSnapshot["defaultPreimages"][number];

function fail(reason: string): never {
  throw new Error("account_review_local_default_" + reason);
}
function ascii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function existingAccountRaw(
  account: Account,
  evidence: FinancialActionLinkedOperationPreparedOwnershipInput
): Readonly<Account["_raw"]> {
  const original = evidence.cachedPreimages.filter(
    (record) => record.table === "accounts" && record.id === account.id
  );
  if (original.length > 1) return fail("duplicate_account_preimage");
  return original[0]?.raw ?? account._raw;
}
function expectedAccountRaw(
  account: Account,
  evidence: FinancialActionLinkedOperationPreparedOwnershipInput
): Readonly<Account["_raw"]> {
  const prepared = evidence.preparedPostimages.filter(
    (record) => record.table === "accounts" && record.id === account.id
  );
  if (prepared.length > 1) return fail("duplicate_account_postimage");
  return prepared[0]?.raw ?? account._raw;
}
function checkFrozenAccountDefault(
  account: Account,
  original: Readonly<Account["_raw"]>,
  ownerId: string,
  expectedIsDefault: boolean
): void {
  if (
    physicalText(original, "user_id") !== ownerId ||
    physicalBoolean(original, "deleted") ||
    physicalBoolean(original, "is_default") !== expectedIsDefault
  )
    fail("changed_owned_default_snapshot");
}

export async function captureReviewDefaultPreimages(input: {
  readonly ownerId: string;
  readonly ownedAccounts: readonly Account[];
  readonly payload: ReviewBatchSavePayload;
  readonly evidence: FinancialActionLinkedOperationPreparedOwnershipInput;
  readonly hashProvider: Sha256Provider;
}): Promise<Default[]> {
  const snapshot = input.payload.creationDefaultSnapshot;
  const updatedIds = new Set(
    input.evidence.preparedPostimages
      .filter((row) => row.table === "accounts" && row.kind === "update")
      .map((row) => row.id)
  );
  const owned = input.ownedAccounts.filter((account) => !account.deleted);
  const actual = snapshot
    ? owned
    : owned.filter((account) => updatedIds.has(account.id));
  const expectedIds = [...(snapshot?.activeAccountIds ?? updatedIds)].sort(
    ascii
  );
  const actualIds = actual.map((account) => account.id).sort(ascii);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds))
    return fail("active_account_membership_changed");
  const defaultId = snapshot?.defaultAccount?.accountId ?? null;
  const original = actual.map((account) => ({
    account,
    raw: existingAccountRaw(account, input.evidence),
  }));
  const defaults = original.filter(({ raw }) =>
    physicalBoolean(raw, "is_default")
  );
  if (
    snapshot &&
    (defaults.length > 1 || (defaults[0]?.account.id ?? null) !== defaultId)
  )
    return fail("frozen_default_changed");
  return Promise.all(
    original.map(async ({ account, raw }): Promise<Default> => {
      const isDefault = snapshot
        ? account.id === defaultId
        : physicalBoolean(raw, "is_default");
      checkFrozenAccountDefault(account, raw, input.ownerId, isDefault);
      const after = expectedAccountRaw(account, input.evidence);
      return {
        accountId: account.id,
        isDefault,
        expectedPostimageHash: await hashAccountReviewLocalPostimage({
          table: "accounts",
          id: account.id,
          raw: after,
          hashProvider: input.hashProvider,
        }),
      };
    })
  );
}

/**
 * Snapshot the persisted owner's complete action identity before awaiting
 * SHA-256. A Watermelon model can change while a provider promise is pending;
 * never classify using mutable row getters after that await.
 */
interface StoredPredecessorRoot {
  readonly id: string;
  readonly actionId: string;
  readonly userId: string;
  readonly domain: string;
  readonly kind: string;
  readonly domainReferenceId: string;
  readonly payloadJson: string;
  readonly payloadHash: string;
  readonly accountGuardsJson: string;
  readonly state: string;
  readonly serverOutcome: string | null;
  readonly deleted: boolean;
}

function captureStoredPredecessorRoot(
  root: FinancialActionGroup
): StoredPredecessorRoot {
  return Object.freeze({
    id: root.id,
    actionId: root.actionId,
    userId: root.userId,
    domain: root.domain,
    kind: root.kind,
    domainReferenceId: root.domainReferenceId,
    payloadJson: root.payloadJson,
    payloadHash: root.payloadHash,
    accountGuardsJson: root.accountGuardsJson,
    state: root.state,
    serverOutcome: root.serverOutcome,
    deleted: root.deleted,
  });
}

function assertPredecessorRootUnchanged(
  expected: StoredPredecessorRoot,
  root: FinancialActionGroup
): void {
  const current = captureStoredPredecessorRoot(root);
  if (
    current.id !== expected.id ||
    current.actionId !== expected.actionId ||
    current.userId !== expected.userId ||
    current.domain !== expected.domain ||
    current.kind !== expected.kind ||
    current.domainReferenceId !== expected.domainReferenceId ||
    current.payloadJson !== expected.payloadJson ||
    current.payloadHash !== expected.payloadHash ||
    current.accountGuardsJson !== expected.accountGuardsJson ||
    current.state !== expected.state ||
    current.serverOutcome !== expected.serverOutcome ||
    current.deleted !== expected.deleted
  )
    fail("predecessor_root_changed");
}

/**
 * Verify the complete registered root BEFORE consulting stored domain/kind.
 * Otherwise a malformed Add creator disguised as edit_balance/transactions
 * silently disappears from the protected default-predecessor set.
 */
async function verifiedPriorEnvelope(
  stored: StoredPredecessorRoot,
  root: FinancialActionGroup,
  ownerId: string,
  hashProvider: Sha256Provider
): Promise<FinancialActionEnvelopeV1> {
  if (stored.deleted || stored.userId !== ownerId)
    fail("foreign_predecessor_root");
  const registry = createAccountReviewFinancialRegistry();
  let envelope: FinancialActionEnvelopeV1;
  let canonicalText: string;
  let payloadHash: string;
  try {
    envelope = parseFinancialActionEnvelopeJson(stored.payloadJson, registry);
    const digest = await hashFinancialActionEnvelope(
      envelope,
      hashProvider,
      registry
    );
    canonicalText = digest.canonicalText;
    payloadHash = digest.payloadHash;
  } catch {
    fail("invalid_prior_action_identity");
  }
  assertPredecessorRootUnchanged(stored, root);
  if (
    canonicalText !== stored.payloadJson ||
    payloadHash !== stored.payloadHash ||
    stored.accountGuardsJson !== JSON.stringify(envelope.accountGuards)
  )
    fail("invalid_prior_action_identity");
  if (
    envelope.actionId !== stored.actionId ||
    envelope.userId !== stored.userId ||
    envelope.domain !== stored.domain ||
    envelope.kind !== stored.kind ||
    envelope.domainReferenceId !== stored.domainReferenceId
  ) {
    // Preserve the established diagnostic for unsupported owned-account
    // tuples. This comparison still rejects them before classification.
    if (
      stored.domain === "accounts" &&
      stored.kind !== "create_with_default" &&
      stored.kind !== "edit_balance"
    )
      fail("unprovable_account_predecessor");
    fail("invalid_prior_action_identity");
  }
  return envelope;
}

function dependenciesFromPriorAdd(
  envelope: FinancialActionEnvelopeV1,
  accountIds: ReadonlySet<string>
): boolean {
  if (
    envelope.domain !== "accounts" ||
    envelope.kind !== "create_with_default" ||
    envelope.payloadVersion !== "account.create-default/v1"
  )
    fail("invalid_prior_action_identity");
  const prior = validateAccountCreateDefaultPayload(envelope.payload);
  const created = prior.domainMutation.records.filter(
    (record) => record.entity === "account" && record.mode === "create"
  );
  const account = created[0];
  if (
    created.length !== 1 ||
    !account ||
    account.after.id !== envelope.domainReferenceId
  )
    fail("unprovable_account_predecessor");
  // The existing account_default UPDATE is only a CAS clear, never a creator.
  return accountIds.has(account.after.id);
}

function dependenciesFromPriorRoot(
  envelope: FinancialActionEnvelopeV1,
  accountIds: ReadonlySet<string>
): boolean {
  if (envelope.domain === "accounts" && envelope.kind === "create_with_default")
    return dependenciesFromPriorAdd(envelope, accountIds);
  if (envelope.kind !== "review_batch_save") {
    if (envelope.domain === "accounts" && envelope.kind !== "edit_balance")
      fail("unprovable_account_predecessor");
    return false;
  }
  if (
    envelope.domain !== "transactions" ||
    envelope.payloadVersion !== "review.batch-save/v1"
  )
    fail("invalid_prior_action_identity");
  const prior = reviewBatchSaveWireSchema.parse(envelope.payload);
  return prior.domainMutation.records.some(
    (record) =>
      record.entity === "account" &&
      record.mode === "create" &&
      accountIds.has(record.after.id)
  );
}

export async function captureReviewDefaultDependencies(input: {
  readonly database: Database;
  readonly scope: CurrentUserDataScope;
  readonly ownerId: string;
  readonly actionId: string;
  readonly payload: ReviewBatchSavePayload;
  readonly hashProvider: Sha256Provider;
}): Promise<string[]> {
  if (input.scope.userId !== input.ownerId)
    return fail("default_dependency_owner_changed");
  const active = new Set(
    input.payload.creationDefaultSnapshot?.activeAccountIds ?? []
  );
  const newAccounts = new Set(
    input.payload.domainMutation.records
      .filter((record) => record.entity === "account")
      .map((record) => record.after.id)
  );
  for (const effect of input.payload.accountEffects) {
    if (!newAccounts.has(effect.accountId)) active.add(effect.accountId);
  }
  const defaultId =
    input.payload.creationDefaultSnapshot?.defaultAccount?.accountId;
  if (defaultId) active.add(defaultId);
  if (active.size === 0) return [];
  const collection = input.database.get<FinancialActionGroup>(
    "financial_action_groups"
  );
  const roots = await input.scope
    .queryOwned(collection, Q.where("deleted", false))
    .fetch();
  const originals = roots.map((root) => ({
    root,
    stored: captureStoredPredecessorRoot(root),
  }));
  await assertExpectedCurrentUser(input.ownerId);
  const unresolved = originals.filter(
    ({ stored }) =>
      stored.actionId !== input.actionId &&
      stored.state !== "accepted" &&
      stored.state !== "reconciled"
  );
  const dependencies: string[] = [];
  for (const { root, stored } of unresolved) {
    const envelope = await verifiedPriorEnvelope(
      stored,
      root,
      input.ownerId,
      input.hashProvider
    );
    await assertExpectedCurrentUser(input.ownerId);
    assertPredecessorRootUnchanged(stored, root);
    if (dependenciesFromPriorRoot(envelope, active))
      dependencies.push(stored.actionId);
  }
  // Hashing was asynchronous: re-read the actual owned unresolved set while
  // still in the writer, so neither a changed root nor a new/disappeared
  // unresolved predecessor can be silently omitted after the initial query.
  const current = await input.scope
    .queryOwned(collection, Q.where("deleted", false))
    .fetch();
  await assertExpectedCurrentUser(input.ownerId);
  const currentUnresolved = current.filter(
    (root) =>
      root.actionId !== input.actionId &&
      root.state !== "accepted" &&
      root.state !== "reconciled"
  );
  if (currentUnresolved.length !== unresolved.length)
    fail("predecessor_root_changed");
  const byId = new Map(currentUnresolved.map((root) => [root.id, root]));
  if (byId.size !== currentUnresolved.length) fail("predecessor_root_changed");
  for (const { stored } of unresolved) {
    const reloaded = byId.get(stored.id);
    if (!reloaded) fail("predecessor_root_changed");
    assertPredecessorRootUnchanged(stored, reloaded);
  }
  const unique = [...new Set(dependencies)].sort(ascii);
  if (unique.length !== dependencies.length)
    return fail("duplicate_predecessor_action");
  return unique;
}
