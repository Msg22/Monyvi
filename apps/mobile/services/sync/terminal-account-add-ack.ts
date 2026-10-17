/**
 * #395 protected SDK ACK: original terminal Add root and physical member proof.
 * Only the metal-derived financial-root rejection may be reduced by this
 * module. Stock captured-row raw equality and all other rejections remain.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import type { SyncPushArgs } from "@nozbe/watermelondb/sync";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
} from "@monyvi/db";
import { parseFinancialActionEnvelopeJson } from "../../../../packages/logic/src/financial-actions/action-contracts";
import { validateAccountCreateDefaultPayload } from "../../../../packages/logic/src/financial-actions/account-create-default";
import { createAccountReviewFinancialRegistry } from "../account-review-financial-command-service";
import { getCurrentUserId } from "../supabase";
import { getCurrentUserDataScope } from "../user-data-access";
import {
  matchesAcceptedAddAccountImmutableIdentity,
  type AccountActionProtection,
} from "./account-action-protection";
import {
  assertAccountSyncAckScopeCurrent,
  type AccountSyncAckCapability,
} from "./account-sync-ack-scope";
import { changedRecords } from "./metal-row-routing";

const REGISTRY = createAccountReviewFinancialRegistry();

/** The original child's physical CREATE timestamp, not an inferred wall clock.
 * Non-numeric/missing values preserve the existing fail-closed root ACK gate. */
function physicalCreatedAt(
  child: BankDetails | AccountSmsSender
): number | null {
  const timestamp: unknown = Object.entries(child._raw).find(
    ([column]) => column === "created_at"
  )?.[1];
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : null;
}

/** Verify exact original Add account, child and nonzero opening-effect members. */
export async function acceptedAddMembersStillMatch(
  database: Database,
  ownerId: string,
  root: FinancialActionGroup,
  catalog: AccountActionProtection
): Promise<boolean> {
  // Historical root-only admission: the authenticated catalog has validated
  // the immutable public action, full SQL091 receipt, guards and SHA-256.
  // Do not reuse the created account's *current* financial-row ACK predicate.
  if (
    root.userId !== ownerId ||
    root.domain !== "accounts" ||
    root.kind !== "create_with_default" ||
    !catalog.roots.some(
      (candidate) =>
        candidate.physicalRootId === root.id &&
        candidate.actionId === root.actionId &&
        candidate.ownerId === ownerId &&
        candidate.payloadHash === root.payloadHash &&
        candidate.payloadJson === root.payloadJson &&
        candidate.state === root.state &&
        candidate.terminalAccepted
    )
  )
    return false;
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== ownerId) return false;
  const account = await scope
    .findOwned(database.get<Account>("accounts"), root.domainReferenceId)
    .catch(() => null);
  if (
    !account ||
    !matchesAcceptedAddAccountImmutableIdentity(catalog, account._raw)
  )
    return false;

  const payload = validateAccountCreateDefaultPayload(
    parseFinancialActionEnvelopeJson(root.payloadJson, REGISTRY).payload
  );
  const [banks, senders, effects] = await Promise.all([
    scope
      .queryChildrenOfOwnedParent(
        database.get<BankDetails>("bank_details"),
        account,
        "account_id"
      )
      .fetch(),
    scope
      .queryChildrenOfOwnedParent(
        database.get<AccountSmsSender>("account_sms_senders"),
        account,
        "account_id"
      )
      .fetch(),
    scope
      .queryOwned(
        database.get<AccountFinancialEffect>("account_financial_effects"),
        Q.where("action_id", root.actionId)
      )
      .fetch(),
  ]);
  const originals = payload.domainMutation.records.filter(
    (item) =>
      item.entity === "bank_details" || item.entity === "account_sms_sender"
  );
  const allChildren = [...banks, ...senders];
  // Child ownership is inherited from an independently owned physical parent.
  // This query includes soft-deleted rows: deleting an original sender does not
  // erase its historical CREATE identity.
  for (const child of allChildren) {
    await scope.assertChildRecordParentOwned(
      child,
      database.get<Account>("accounts"),
      "accountId"
    );
    if (child.accountId !== account.id || physicalCreatedAt(child) === null)
      return false;
  }
  for (const original of originals) {
    const table =
      original.entity === "bank_details"
        ? "bank_details"
        : "account_sms_senders";
    const matches = allChildren.filter(
      (child) => child.table === table && child.id === original.after.id
    );
    const matched = matches[0];
    if (
      matches.length !== 1 ||
      !matched ||
      matched.accountId !== account.id ||
      physicalCreatedAt(matched) !== Date.parse(original.after.createdAt)
    )
      return false;
  }
  const originalBanks = new Set(
    originals
      .filter((item) => item.entity === "bank_details")
      .map((item) => item.after.id)
  );
  // New bank details cannot silently replace an original protected child.
  if (banks.some((bank) => !originalBanks.has(bank.id))) return false;
  // Additional owner-scoped sender rows belong to independent metadata
  // writes. They are NEVER registered as original Add-created child members
  // and receive no field ACK authority from this root proof.
  const originalSenders = new Set(
    originals
      .filter((item) => item.entity === "account_sms_sender")
      .map((item) => item.after.id)
  );
  if (
    senders.some(
      (sender) =>
        !originalSenders.has(sender.id) && sender.accountId !== account.id
    )
  )
    return false;

  return (
    effects.length === payload.accountEffects.length &&
    effects.every((effect) => {
      const original = payload.accountEffects.find(
        (item) => item.effectId === effect.id
      );
      return (
        !!original &&
        effect.userId === ownerId &&
        effect.actionId === root.actionId &&
        effect.accountId === original.accountId &&
        effect.amountMinorUnits === original.amountMinorUnits &&
        effect.currency === original.currency &&
        effect.acceptedAccountRevision === "1" &&
        effect.domain === "accounts" &&
        effect.kind === "account.create-default" &&
        effect.deleted === false &&
        effect.isEffective &&
        effect.compensatedAt === null &&
        effect.reversesEffectId === null
      );
    })
  );
}

/**
 * Only current, five-part-bound terminal Add PHYSICAL IDs with exact captured
 * root bytes can leave the conservative metal-derived root rejection set.
 */
export async function stableTerminalAddRootIds(
  database: Database,
  capability: AccountSyncAckCapability,
  ownerId: string,
  changes: SyncPushArgs["changes"],
  catalog: AccountActionProtection,
  metalBlockedRootIds: readonly string[]
): Promise<ReadonlySet<string>> {
  const eligible = new Set<string>();
  if (metalBlockedRootIds.length === 0) return eligible;
  assertAccountSyncAckScopeCurrent(capability, database, ownerId);
  if ((await getCurrentUserId()) !== ownerId)
    throw new Error("account_sync_ack_scope_invalid");
  const originallyBlocked = new Set(metalBlockedRootIds);
  for (const raw of changedRecords(changes, "financial_action_groups")) {
    if (
      raw.domain !== "accounts" ||
      raw.kind !== "create_with_default" ||
      typeof raw.id !== "string" ||
      !originallyBlocked.has(raw.id)
    )
      continue;
    const bound = catalog.roots.find(
      (root) =>
        root.physicalRootId === raw.id &&
        root.actionId === raw.action_id &&
        root.ownerId === raw.user_id &&
        root.ownerId === ownerId &&
        root.payloadHash === raw.payload_hash &&
        root.payloadJson === raw.payload_json &&
        root.state === raw.state &&
        (root.terminalAccepted || root.locallyCompensated)
    );
    if (!bound) continue;
    const current = await database
      .get<FinancialActionGroup>("financial_action_groups")
      .find(raw.id)
      .catch(() => null);
    if (
      !current ||
      current.id !== bound.physicalRootId ||
      current.actionId !== bound.actionId ||
      current.userId !== bound.ownerId ||
      current.payloadHash !== bound.payloadHash ||
      current.payloadJson !== bound.payloadJson ||
      current.state !== bound.state ||
      JSON.stringify(current._raw) !== JSON.stringify(raw)
    )
      continue;
    if (
      bound.terminalAccepted &&
      !(await acceptedAddMembersStillMatch(database, ownerId, current, catalog))
    )
      continue;
    // Do not override scoped foreign, account/child/effect or SDK ACK rejections.
    if ((await getCurrentUserId()) !== ownerId)
      throw new Error("account_sync_ack_scope_invalid");
    assertAccountSyncAckScopeCurrent(capability, database, ownerId);
    eligible.add(current.id);
  }
  return eligible;
}
