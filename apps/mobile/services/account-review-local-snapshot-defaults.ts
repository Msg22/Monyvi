/** Frozen local default provenance and unresolved producer dependencies. */
import { Q, type Database } from "@nozbe/watermelondb";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  parseFinancialActionEnvelopeJson,
  type Sha256Provider,
} from "@monyvi/logic";
import type {
  AccountReviewLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/review-local-recovery";
import {
  reviewBatchSaveWireSchema,
  type ReviewBatchSavePayload,
} from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";
import { createAccountReviewFinancialRegistry } from
  "./account-review-financial-command-service";
import type {
  FinancialActionLinkedOperationPreparedOwnershipInput,
} from "./financial-action-foundation-contracts";
import type { CurrentUserDataScope } from "./user-data-access";
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
  const original = evidence.cachedPreimages.filter((record) =>
    record.table === "accounts" && record.id === account.id);
  if (original.length > 1) return fail("duplicate_account_preimage");
  return original[0]?.raw ?? account._raw;
}
function expectedAccountRaw(
  account: Account,
  evidence: FinancialActionLinkedOperationPreparedOwnershipInput
): Readonly<Account["_raw"]> {
  const prepared = evidence.preparedPostimages.filter((record) =>
    record.table === "accounts" && record.id === account.id);
  if (prepared.length > 1) return fail("duplicate_account_postimage");
  return prepared[0]?.raw ?? account._raw;
}
function checkFrozenAccountDefault(
  account: Account,
  original: Readonly<Account["_raw"]>,
  ownerId: string,
  expectedIsDefault: boolean
): void {
  if (physicalText(original, "user_id") !== ownerId ||
      physicalBoolean(original, "deleted") ||
      physicalBoolean(original, "is_default") !== expectedIsDefault)
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
  const updatedIds = new Set(input.evidence.preparedPostimages.filter(
    (row) => row.table === "accounts" && row.kind === "update"
  ).map((row) => row.id));
  const owned = input.ownedAccounts.filter((account) => !account.deleted);
  const actual = snapshot
    ? owned
    : owned.filter((account) => updatedIds.has(account.id));
  const expectedIds = [...(snapshot?.activeAccountIds ?? updatedIds)].sort(ascii);
  const actualIds = actual.map((account) => account.id).sort(ascii);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds))
    return fail("active_account_membership_changed");
  const defaultId = snapshot?.defaultAccount?.accountId ?? null;
  const original = actual.map((account) => ({
    account,
    raw: existingAccountRaw(account, input.evidence),
  }));
  const defaults = original.filter(({ raw }) =>
    physicalBoolean(raw, "is_default"));
  if (snapshot &&
      (defaults.length > 1 || (defaults[0]?.account.id ?? null) !== defaultId))
    return fail("frozen_default_changed");
  return Promise.all(original.map(async ({ account, raw }): Promise<Default> => {
    const isDefault = snapshot
      ? account.id === defaultId
      : physicalBoolean(raw, "is_default");
    checkFrozenAccountDefault(account, raw, input.ownerId, isDefault);
    const after = expectedAccountRaw(account, input.evidence);
    return {
      accountId: account.id,
      isDefault,
      expectedPostimageHash: await hashAccountReviewLocalPostimage({
        table: "accounts", id: account.id, raw: after,
        hashProvider: input.hashProvider,
      }),
    };
  }));
}

function dependenciesFromPriorRoot(
  root: FinancialActionGroup,
  accountIds: ReadonlySet<string>
): boolean {
  if (root.kind !== "review_batch_save") {
    if (root.domain === "accounts" && root.kind !== "edit_balance")
      fail("unprovable_account_predecessor");
    return false;
  }
  const envelope = parseFinancialActionEnvelopeJson(
    root.payloadJson, createAccountReviewFinancialRegistry()
  );
  const prior = reviewBatchSaveWireSchema.parse(envelope.payload);
  if (envelope.actionId !== root.actionId || envelope.userId !== root.userId)
    fail("invalid_prior_action_identity");
  return prior.domainMutation.records.some(
    (record) => record.entity === "account" && accountIds.has(record.after.id)
  );
}

export async function captureReviewDefaultDependencies(input: {
  readonly database: Database;
  readonly scope: CurrentUserDataScope;
  readonly ownerId: string;
  readonly actionId: string;
  readonly payload: ReviewBatchSavePayload;
}): Promise<string[]> {
  if (input.scope.userId !== input.ownerId)
    return fail("default_dependency_owner_changed");
  const active = new Set(
    input.payload.creationDefaultSnapshot?.activeAccountIds ?? []
  );
  const newAccounts = new Set(input.payload.domainMutation.records.filter(
    (record) => record.entity === "account"
  ).map((record) => record.after.id));
  for (const effect of input.payload.accountEffects) {
    if (!newAccounts.has(effect.accountId)) active.add(effect.accountId);
  }
  const defaultId = input.payload.creationDefaultSnapshot?.defaultAccount?.accountId;
  if (defaultId) active.add(defaultId);
  if (active.size === 0) return [];
  const roots = await input.scope.queryOwned(
    input.database.get<FinancialActionGroup>("financial_action_groups"),
    Q.where("deleted", false)
  ).fetch();
  const dependencies: string[] = [];
  for (const root of roots) {
    if (root.actionId === input.actionId ||
        root.state === "accepted" || root.state === "reconciled") continue;
    if (root.userId !== input.ownerId)
      return fail("foreign_predecessor_root");
    if (dependenciesFromPriorRoot(root, active))
      dependencies.push(root.actionId);
  }
  const unique = [...new Set(dependencies)].sort(ascii);
  if (unique.length !== dependencies.length)
    return fail("duplicate_predecessor_action");
  return unique;
}
