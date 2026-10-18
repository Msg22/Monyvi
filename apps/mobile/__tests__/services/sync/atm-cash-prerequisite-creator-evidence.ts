/**
 * #395 C1 external RPC fixture only: the SQL091 zero-opening Cash creator.
 * Never use local current balance/revision as proof of its pristine birth.
 * No financial writer/SDK/component is mocked by this module.
 */
import { Q, type Database } from "@nozbe/watermelondb";
import type { Account, FinancialActionGroup } from "@monyvi/db";
import {
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  type Sha256Provider,
} from "@monyvi/logic";
import { createAccountDefaultAndReviewRegistry } from "../../../../../packages/logic/src/financial-actions/account-create-default-registration";
import { validateAccountCreateDefaultPayload } from "../../../../../packages/logic/src/financial-actions/account-create-default";
import { parseAccountCreateDefaultLocalRecoverySnapshotJson } from "../../../../../packages/logic/src/financial-actions/account-create-default-local-recovery";

export interface VerifiedRemoteCashBirth {
  readonly account: {
    readonly id: string;
    readonly userId: string;
    readonly type: "CASH";
    readonly currency: "EGP";
  };
  readonly outcome: {
    readonly actionId: string;
    readonly status: "accepted";
    readonly accountRevisions: readonly [];
    readonly effectiveEventId: null;
    readonly holdingRevision: null;
    readonly serverAcceptedAt: string;
  };
}

function invalid(): never {
  throw new Error("atm_cash_unverified_creator_rpc");
}

/**
 * Returns null only for non-Add RPCs. Every attempted Add MUST have the
 * existing immutable root, canonical digest, zero-effect payload and complete
 * bound private snapshot; otherwise fail closed without remote publication.
 */
export async function verifyActualZeroOpeningCashCreator(input: {
  readonly database: Database;
  readonly ownerId: string;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly hashProvider: Sha256Provider;
  readonly nowIso: string;
}): Promise<VerifiedRemoteCashBirth | null> {
  let candidate: unknown;
  try {
    candidate = JSON.parse(input.payloadJson);
  } catch {
    invalid();
  }
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  )
    invalid();
  if (
    !("payloadVersion" in candidate) ||
    candidate.payloadVersion !== "account.create-default/v1"
  )
    return null;
  const registry = createAccountDefaultAndReviewRegistry();
  const envelope = parseFinancialActionEnvelopeJson(
    input.payloadJson,
    registry
  );
  const payload = validateAccountCreateDefaultPayload(envelope.payload);
  if (
    envelope.domain !== "accounts" ||
    envelope.kind !== "create_with_default" ||
    envelope.userId !== input.ownerId ||
    envelope.accountGuards.length !== 0 ||
    payload.accountEffects.length !== 0 ||
    payload.defaultIntent !== false
  )
    invalid();
  const accounts = payload.domainMutation.records.filter(
    (record) => record.entity === "account" && record.mode === "create"
  );
  if (accounts.length !== 1) invalid();
  const created = accounts[0];
  if (!created || created.entity !== "account" || created.mode !== "create")
    invalid();
  if (
    envelope.domainReferenceId !== created.after.id ||
    created.after.type !== "CASH" ||
    created.after.currency !== "EGP" ||
    created.after.deleted !== false ||
    created.after.isDefault !== false ||
    created.after.openingBalanceMinorUnits !== "0" ||
    !payload.expectedDefaultSnapshot.activeAccountIds.length
  )
    invalid();
  const digest = await hashFinancialActionEnvelope(
    envelope,
    input.hashProvider,
    registry
  );
  if (
    digest.canonicalText !== input.payloadJson ||
    digest.payloadHash !== input.payloadHash
  )
    invalid();
  const roots = await input.database
    .get<FinancialActionGroup>("financial_action_groups")
    .query(
      Q.where("action_id", envelope.actionId),
      Q.where("user_id", input.ownerId)
    )
    .fetch();
  const root = roots[0];
  if (
    roots.length !== 1 ||
    !root ||
    root.deleted ||
    root.actionId !== envelope.actionId ||
    root.domainReferenceId !== created.after.id ||
    root.payloadHash !== input.payloadHash ||
    root.payloadJson !== input.payloadJson ||
    !["local_complete", "sync_pending", "sync_failed"].includes(root.state) ||
    typeof root.localRecoverySnapshotJson !== "string"
  )
    invalid();
  const snapshot = parseAccountCreateDefaultLocalRecoverySnapshotJson({
    json: root.localRecoverySnapshotJson,
    expectedRoot: {
      actionId: envelope.actionId,
      ownerId: input.ownerId,
      domainReferenceId: created.after.id,
      payloadHash: input.payloadHash,
      expectedDefaultSnapshot: payload.expectedDefaultSnapshot,
    },
  });
  if (
    snapshot.openingEffect !== null ||
    snapshot.createdAccount.accountId !== created.after.id ||
    snapshot.createdAccount.postimage.userId !== input.ownerId ||
    snapshot.createdAccount.postimage.currency !== "EGP" ||
    snapshot.createdAccount.postimage.balanceMinorUnits !== "0" ||
    snapshot.createdAccount.postimage.financialRevision !== "0" ||
    snapshot.createdAccount.postimage.isDefault !== false
  )
    invalid();
  const account = await input.database
    .get<Account>("accounts")
    .find(created.after.id);
  if (
    account.userId !== input.ownerId ||
    account.type !== "CASH" ||
    account.currency !== "EGP" ||
    account.deleted ||
    account.isDefault !== false ||
    account._raw._status !== "created" ||
    account.createdAt.toISOString() !== created.after.createdAt
  )
    invalid();
  return {
    account: {
      id: account.id,
      userId: input.ownerId,
      type: "CASH",
      currency: "EGP",
    },
    outcome: {
      actionId: envelope.actionId,
      status: "accepted",
      accountRevisions: [],
      effectiveEventId: null,
      holdingRevision: null,
      serverAcceptedAt: input.nowIso,
    },
  };
}
