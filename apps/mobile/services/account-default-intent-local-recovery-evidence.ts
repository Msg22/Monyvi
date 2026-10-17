/**
 * #395 T069: authenticated, immutable and physical evidence admission for
 * a rejected accounts/create_with_default action. No writes or inverse math.
 * Only the dedicated compensation writer may consume this verified bundle.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  Debt,
  FinancialActionGroup,
  RecurringPayment,
  Transaction,
  Transfer,
} from "@monyvi/db";
import {
  assertFinancialActionStateEvidence,
  hashFinancialActionEnvelope,
  parseFinancialActionEnvelopeJson,
  parseFinancialActionEvidenceJson,
  getCurrencyPrecision,
  serializeDecimal,
  toMinorUnits,
  type Sha256Provider,
} from "@monyvi/logic";
import {
  parseAccountCreateDefaultLocalRecoverySnapshotJson,
  type AccountCreateDefaultLocalSaveSnapshot,
} from "../../../packages/logic/src/financial-actions/account-create-default-local-recovery";
import { parseAccountCreateDefaultRecoveryOutcome } from "../../../packages/logic/src/financial-actions/account-create-default-outcome";
import {
  validateAccountCreateDefaultPayload,
  type AccountCreateDefaultPayload,
  type AccountDefaultSnapshot,
} from "../../../packages/logic/src/financial-actions/account-create-default";
import { hashAccountReviewLocalPostimage } from "./account-review-local-snapshot-postimages";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import { readOwnedDefaultSnapshot } from "./account-default-intent-snapshot";
import type { CurrentUserDataScope } from "./user-data-access";
import { parseCanonicalAccountsFromOutcomeJson } from "./account-review-recovery-canonical";
import { verifyFrozenCreatorRootProofs } from "./account-default-intent-local-recovery-creators";
import { uuidSchema } from "../../../packages/logic/src/financial-actions/review-batch-save-shapes";

const INCOMPLETE = "financial_action_reconciliation_incomplete";
function refuse(): never {
  throw new Error(INCOMPLETE);
}
function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function exactKeys(
  v: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean {
  const found = Object.keys(v).sort();
  return (
    found.length === keys.length &&
    found.every((key, index) => key === [...keys].sort()[index])
  );
}
function identicalStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function exactDefaultGraph(
  a: AccountDefaultSnapshot,
  b: AccountDefaultSnapshot
): boolean {
  return (
    identicalStrings(a.activeAccountIds, b.activeAccountIds) &&
    (a.defaultAccount?.accountId ?? null) ===
      (b.defaultAccount?.accountId ?? null)
  );
}
function actualChangedColumns(row: Model): readonly string[] {
  const raw = row._raw._changed;
  const fields = raw === "" ? [] : raw.split(",");
  const sorted = [...fields].sort();
  if (new Set(sorted).size !== sorted.length) refuse();
  return sorted;
}
function actualMoney(account: Account): string {
  if (!Number.isFinite(account.balance)) refuse();
  try {
    return toMinorUnits(
      serializeDecimal(String(account.balance)),
      getCurrencyPrecision(account.currency)
    );
  } catch {
    refuse();
  }
}
async function physicalHash(
  model: Model,
  provider: Sha256Provider
): Promise<string> {
  return hashAccountReviewLocalPostimage({
    table: model.table,
    id: model.id,
    raw: model._raw,
    hashProvider: provider,
  });
}
async function exactRow<T extends Model>(
  db: Database,
  table: string,
  id: string
): Promise<T> {
  try {
    const rows = await db.get<T>(table).query(Q.where("id", id)).fetch();
    if (rows.length !== 1 || !rows[0]) refuse();
    return rows[0];
  } catch {
    refuse();
  }
}

export interface ExpectedAddRecoveryIdentity {
  readonly actionId: string;
  readonly expectedOwnerId: string;
  readonly expectedPhysicalRootId: string;
  readonly expectedPayloadHash: string;
  readonly expectedPayloadJson: string;
}
export interface VerifiedAddRecoveryAuthority {
  readonly payload: AccountCreateDefaultPayload;
  readonly privateSnapshot: AccountCreateDefaultLocalSaveSnapshot;
}
export interface VerifiedAddRecovery extends VerifiedAddRecoveryAuthority {
  readonly root: FinancialActionGroup;
  readonly createdAccount: Account;
  readonly children: ReadonlyArray<BankDetails | AccountSmsSender>;
  readonly openingEffect: AccountFinancialEffect | null;
  readonly priorDefault: Account | null;
}

/** The original dispatcher, not a fresh owner lookup, chooses the physical root. */
export function assertExpectedAddRoot(
  root: FinancialActionGroup,
  expected: ExpectedAddRecoveryIdentity
): void {
  if (
    root.id !== expected.expectedPhysicalRootId ||
    root.actionId !== expected.actionId ||
    root.userId !== expected.expectedOwnerId ||
    root.payloadJson !== expected.expectedPayloadJson ||
    root.payloadHash !== expected.expectedPayloadHash ||
    root.domain !== "accounts" ||
    root.kind !== "create_with_default" ||
    root.deleted
  )
    refuse();
}
/**
 * Authenticate the COMPLETE SQL091 business receipt rather than treating the
 * four-field default projection as a full financial outcome.
 *
 * Actual 091 Add shapes:
 * - 23505/domain conflict: six fields, no accountRevisions
 * - stale: ten fields, including full canonicalAccounts for the currently
 *   active server graph and three nullable holding slots.
 *
 * Earlier three-field NOT_OWNED/INCOMPLETE_GROUP failures never authorize
 * local compensation, even if a transport caller supplies an actionId.
 */
function assertCompleteBusinessRejection(
  root: FinancialActionGroup,
  snapshot: AccountCreateDefaultLocalSaveSnapshot
): void {
  if (
    (root.serverOutcome !== "stale" && root.serverOutcome !== "rejected") ||
    root.outcomeJson === null ||
    root.rejectionCode === null ||
    ![
      "rejected_compensating",
      "reconciliation_incomplete",
      "reconciled",
    ].includes(root.state)
  )
    refuse();
  try {
    assertFinancialActionStateEvidence(
      root.state === "reconciled"
        ? "reconciled"
        : root.state === "rejected_compensating"
          ? "rejected_compensating"
          : "reconciliation_incomplete",
      {
        serverOutcome: root.serverOutcome,
        outcomeJson: root.outcomeJson,
        rejectionCode: root.rejectionCode,
      }
    );
  } catch {
    refuse();
  }

  let raw: unknown;
  try {
    raw = parseFinancialActionEvidenceJson(root.outcomeJson);
  } catch {
    refuse();
  }
  if (!isRecord(raw)) refuse();
  const commonKeys = [
    "actionId",
    "status",
    "code",
    "canonicalAccounts",
    "canonicalAbsentAccountIds",
    "canonicalDefaultSnapshot",
  ];
  const staleKeys = [
    ...commonKeys,
    "canonicalHoldingActionId",
    "canonicalHoldingEvidenceHash",
    "canonicalHoldingRevision",
    "staleAccountIds",
  ];
  if (
    !exactKeys(raw, root.serverOutcome === "stale" ? staleKeys : commonKeys) ||
    raw.actionId !== root.actionId ||
    raw.status !== root.serverOutcome ||
    typeof raw.code !== "string" ||
    raw.code.toLowerCase() !== root.rejectionCode ||
    !Array.isArray(raw.canonicalAbsentAccountIds) ||
    raw.canonicalAbsentAccountIds.length !== 1 ||
    raw.canonicalAbsentAccountIds[0] !== snapshot.createdAccount.accountId
  )
    refuse();
  if (root.serverOutcome === "stale") {
    if (
      raw.code !== "ACCOUNT_REVISION_STALE" ||
      raw.canonicalHoldingActionId !== null ||
      raw.canonicalHoldingEvidenceHash !== null ||
      raw.canonicalHoldingRevision !== null ||
      !Array.isArray(raw.staleAccountIds)
    )
      refuse();
    const seenStale = new Set<string>();
    for (const id of raw.staleAccountIds) {
      if (
        typeof id !== "string" ||
        !uuidSchema.safeParse(id).success ||
        seenStale.has(id)
      )
        refuse();
      seenStale.add(id);
    }
  } else {
    // Only a persisted, full, owner-bound domain-uniqueness business failure
    // is the presently authorized Add reject compensation. Unsupported
    // SQL failure codes and early unbound failures remain unresolved.
    if (raw.code !== "DOMAIN_UNIQUE_CONFLICT") refuse();
  }

  let outcome: ReturnType<typeof parseAccountCreateDefaultRecoveryOutcome>;
  let canonicalAccounts: ReturnType<
    typeof parseCanonicalAccountsFromOutcomeJson
  >;
  try {
    outcome = parseAccountCreateDefaultRecoveryOutcome({
      outcomeJson: root.outcomeJson,
      serverOutcome: root.serverOutcome,
      expectedActionId: root.actionId,
    });
    canonicalAccounts = parseCanonicalAccountsFromOutcomeJson(root.outcomeJson);
  } catch {
    refuse();
  }
  if (!canonicalAccounts) refuse();
  const canonicalIds = canonicalAccounts.map((account) => account.accountId);
  if (
    new Set(canonicalIds).size !== canonicalIds.length ||
    !canonicalIds.every((id) =>
      outcome.canonicalDefaultSnapshot.activeAccountIds.includes(id)
    ) ||
    canonicalIds.includes(snapshot.createdAccount.accountId)
  )
    refuse();
  if (root.serverOutcome === "stale") {
    // SQL091's stale branch enumerates the ENTIRE canonical active set,
    // not just financial guards. Its graph may differ from the original
    // expected graph, which is proof to REFUSE local compensation, not a
    // reason to discard this otherwise authentic ten-field receipt.
    if (
      !identicalStrings(
        [...canonicalIds].sort(),
        outcome.canonicalDefaultSnapshot.activeAccountIds
      )
    )
      refuse();
  } else if (canonicalAccounts.length !== 0) {
    // This Add guards only B, which SQL positively proved absent after its
    // rejected savepoint. No existing account guard may be silently inferred.
    refuse();
  }
  // SQL091 (385d0b7, registered Add path) sets stale only when the
  // snapshot differs or its checked clear contradicts the actual default.
  // An equal-graph clear contradiction is rejected by the frozen payload
  // validator before reaching this branch. Therefore no genuine Add stale
  // receipt can authorize local destructive compensation; it must remain
  // durable/unacknowledged rather than manufacturing a matching-graph success.
  if (root.serverOutcome === "stale") refuse();
  if (
    !exactDefaultGraph(
      outcome.canonicalDefaultSnapshot,
      snapshot.expectedDefaultSnapshot
    )
  )
    refuse();
}

/** Immutable public/root/private receipt, including exact original guards. */
export async function verifyImmutableAddRecoveryAuthority(input: {
  readonly root: FinancialActionGroup;
  readonly expected: ExpectedAddRecoveryIdentity;
  readonly hashProvider: Sha256Provider;
  readonly recheck: () => Promise<void>;
}): Promise<VerifiedAddRecoveryAuthority> {
  const { root, expected, hashProvider, recheck } = input;
  assertExpectedAddRoot(root, expected);
  if (
    ![
      "rejected_compensating",
      "reconciliation_incomplete",
      "reconciled",
    ].includes(root.state) ||
    typeof root.localRecoverySnapshotJson !== "string"
  )
    refuse();
  const registry = createAccountReviewFinancialRegistry();
  let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
  try {
    envelope = parseFinancialActionEnvelopeJson(root.payloadJson, registry);
  } catch {
    refuse();
  }
  const digest = await hashFinancialActionEnvelope(
    envelope,
    hashProvider,
    registry
  );
  await recheck();
  if (
    digest.canonicalText !== root.payloadJson ||
    digest.payloadHash !== root.payloadHash ||
    envelope.actionId !== expected.actionId ||
    envelope.userId !== expected.expectedOwnerId ||
    envelope.domain !== "accounts" ||
    envelope.kind !== "create_with_default" ||
    envelope.payloadVersion !== "account.create-default/v1" ||
    envelope.domainReferenceId !== root.domainReferenceId ||
    root.accountGuardsJson !== JSON.stringify(envelope.accountGuards)
  )
    refuse();
  let payload: AccountCreateDefaultPayload;
  try {
    payload = validateAccountCreateDefaultPayload(envelope.payload);
  } catch {
    refuse();
  }
  let snapshot: AccountCreateDefaultLocalSaveSnapshot;
  try {
    snapshot = parseAccountCreateDefaultLocalRecoverySnapshotJson({
      json: root.localRecoverySnapshotJson,
      expectedRoot: {
        actionId: expected.actionId,
        ownerId: expected.expectedOwnerId,
        domainReferenceId: root.domainReferenceId,
        payloadHash: expected.expectedPayloadHash,
        expectedDefaultSnapshot: payload.expectedDefaultSnapshot,
      },
    });
  } catch {
    refuse();
  }
  assertCompleteBusinessRejection(root, snapshot);
  // Immutable payload hashing already awaited under the original actor/root;
  // the dedicated writer independently reasserts the same five bindings.
  await recheck();
  assertExpectedAddRoot(root, expected);
  const created = payload.domainMutation.records.find(
    (r) => r.entity === "account"
  );
  const clear = payload.domainMutation.records.find(
    (r) => r.entity === "account_default"
  );
  const children = payload.domainMutation.records.filter(
    (r) => r.entity === "bank_details" || r.entity === "account_sms_sender"
  );
  const actualChildren = snapshot.createdChildren
    .map((r) => r.entity + ":" + r.id)
    .sort();
  const expectedChildren = children
    .map((r) => r.entity + ":" + r.after.id)
    .sort();
  const opening = payload.accountEffects[0];
  if (
    !created ||
    created.entity !== "account" ||
    created.after.id !== snapshot.createdAccount.accountId ||
    created.after.id !== root.domainReferenceId ||
    created.after.isDefault !== snapshot.createdAccount.postimage.isDefault ||
    created.after.currency !== snapshot.createdAccount.postimage.currency ||
    created.after.openingBalanceMinorUnits !==
      snapshot.createdAccount.postimage.balanceMinorUnits ||
    (clear !== undefined) !== (snapshot.priorDefault !== null) ||
    (clear?.after.id ?? null) !== (snapshot.priorDefault?.accountId ?? null) ||
    !identicalStrings(expectedChildren, actualChildren) ||
    (opening === undefined) !== (snapshot.openingEffect === null) ||
    (opening !== undefined &&
      (opening.effectId !== snapshot.openingEffect?.effectId ||
        opening.accountId !== snapshot.openingEffect?.accountId ||
        opening.amountMinorUnits !==
          snapshot.openingEffect?.postimage.amountMinorUnits)) ||
    envelope.accountGuards.length !== (opening ? 1 : 0) ||
    (opening !== undefined &&
      (envelope.accountGuards[0]?.accountId !== created.after.id ||
        envelope.accountGuards[0]?.expectedRevision !== "0"))
  )
    refuse();
  await recheck();
  return { payload, privateSnapshot: snapshot };
}

/** Scans successor financial intents, not just live balances or root states. */
async function verifyNoSuccessors(
  db: Database,
  scope: CurrentUserDataScope,
  root: FinancialActionGroup,
  createdId: string,
  hashProvider: Sha256Provider,
  recheck: () => Promise<void>
): Promise<void> {
  const roots = await scope
    .queryOwned(
      db.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("deleted", false)
    )
    .fetch();
  await recheck();
  for (const other of roots) {
    if (other.actionId === root.actionId) {
      if (other.id !== root.id) refuse();
      continue;
    }
    const registry = createAccountReviewFinancialRegistry();
    let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
    try {
      envelope = parseFinancialActionEnvelopeJson(other.payloadJson, registry);
    } catch {
      refuse();
    }
    const digest = await hashFinancialActionEnvelope(
      envelope,
      hashProvider,
      registry
    );
    await recheck();
    if (
      digest.canonicalText !== other.payloadJson ||
      digest.payloadHash !== other.payloadHash ||
      envelope.userId !== scope.userId ||
      envelope.actionId !== other.actionId ||
      envelope.domain !== other.domain ||
      envelope.kind !== other.kind ||
      envelope.domainReferenceId !== other.domainReferenceId
    )
      refuse();
    // A successor must not survive while a referenced new account disappears.
    // This is deliberately conservative, including terminal descendants.
    if (
      other.payloadJson.includes('"' + createdId + '"') ||
      (typeof other.localRecoverySnapshotJson === "string" &&
        other.localRecoverySnapshotJson.includes('"' + root.actionId + '"'))
    )
      refuse();
  }
}

/** Positive graph, full physical hashes, owned ancestry and membership. */
export async function verifyAddRecoveryPhysicalState(input: {
  readonly database: Database;
  readonly scope: CurrentUserDataScope;
  readonly root: FinancialActionGroup;
  readonly authority: VerifiedAddRecoveryAuthority;
  readonly hashProvider: Sha256Provider;
  readonly recheck: () => Promise<void>;
}): Promise<VerifiedAddRecovery> {
  const { database: db, scope, root, authority, hashProvider, recheck } = input;
  const snapshot = authority.privateSnapshot;
  if (scope.userId !== snapshot.ownerId || root.userId !== scope.userId)
    refuse();
  const current = await readOwnedDefaultSnapshot(db, scope);
  await recheck();
  if (!exactDefaultGraph(current.snapshot, snapshot.preparedDefaultSnapshot))
    refuse();
  const created = await exactRow<Account>(
    db,
    "accounts",
    snapshot.createdAccount.accountId
  );
  await recheck();
  if (
    created.userId !== scope.userId ||
    created.deleted ||
    created.currency !== snapshot.createdAccount.postimage.currency ||
    created.financialRevision !==
      snapshot.createdAccount.postimage.financialRevision ||
    created.isDefault !== snapshot.createdAccount.postimage.isDefault ||
    actualMoney(created) !==
      snapshot.createdAccount.postimage.balanceMinorUnits ||
    (await physicalHash(created, hashProvider)) !==
      snapshot.createdAccount.expectedPostimageHash
  )
    refuse();
  await recheck();

  const prior = snapshot.priorDefault
    ? await exactRow<Account>(db, "accounts", snapshot.priorDefault.accountId)
    : null;
  await recheck();
  if (prior) {
    const priorProof = snapshot.priorDefault;
    if (
      !priorProof ||
      prior.userId !== scope.userId ||
      prior.deleted ||
      prior.isDefault !== false ||
      prior.currency !== priorProof.postimage.currency ||
      prior.financialRevision !== priorProof.postimage.financialRevision ||
      actualMoney(prior) !== priorProof.postimage.balanceMinorUnits ||
      prior._raw._status !== priorProof.transportPostimage.status ||
      !identicalStrings(
        actualChangedColumns(prior),
        priorProof.transportPostimage.changedColumns
      ) ||
      (await physicalHash(prior, hashProvider)) !==
        priorProof.expectedPostimageHash
    )
      refuse();
    await recheck();
  }

  const banks = await db
    .get<BankDetails>("bank_details")
    .query(Q.where("account_id", created.id))
    .fetch();
  await recheck();
  const senders = await db
    .get<AccountSmsSender>("account_sms_senders")
    .query(Q.where("account_id", created.id))
    .fetch();
  await recheck();
  const childRows: ReadonlyArray<BankDetails | AccountSmsSender> = [
    ...banks,
    ...senders,
  ];
  const expectedChildren = snapshot.createdChildren
    .map(
      (ref) =>
        (ref.entity === "bank_details"
          ? "bank_details"
          : "account_sms_senders") +
        ":" +
        ref.id
    )
    .sort();
  if (
    !identicalStrings(
      childRows.map((child) => child.table + ":" + child.id).sort(),
      expectedChildren
    )
  )
    refuse();
  for (const ref of snapshot.createdChildren) {
    const child = childRows.find(
      (row) =>
        row.id === ref.id &&
        row.table ===
          (ref.entity === "bank_details"
            ? "bank_details"
            : "account_sms_senders")
    );
    if (
      !child ||
      child.deleted ||
      child.accountId !== created.id ||
      (await physicalHash(child, hashProvider)) !== ref.expectedPostimageHash
    )
      refuse();
    await recheck();
  }

  const byAction = await scope
    .queryOwned(
      db.get<AccountFinancialEffect>("account_financial_effects"),
      Q.where("action_id", root.actionId)
    )
    .fetch();
  await recheck();
  const byAccount = await scope
    .queryOwned(
      db.get<AccountFinancialEffect>("account_financial_effects"),
      Q.where("account_id", created.id)
    )
    .fetch();
  await recheck();
  const proof = snapshot.openingEffect;
  if (
    byAction.length !== (proof ? 1 : 0) ||
    byAccount.length !== (proof ? 1 : 0)
  )
    refuse();
  const effect = byAction[0] ?? null;
  if (proof) {
    if (
      !effect ||
      byAccount[0]?.id !== effect.id ||
      effect.id !== proof.effectId ||
      effect.userId !== scope.userId ||
      effect.accountId !== created.id ||
      effect.actionId !== root.actionId ||
      effect.currency !== proof.postimage.currency ||
      effect.amountMinorUnits !== proof.postimage.amountMinorUnits ||
      effect.acceptedAccountRevision !== "1" ||
      effect.domain !== "accounts" ||
      effect.kind !== "account.create-default" ||
      !effect.isEffective ||
      effect.deleted ||
      effect.compensatedAt !== null ||
      effect.reversesEffectId !== null ||
      (await physicalHash(effect, hashProvider)) !== proof.expectedPostimageHash
    )
      refuse();
    await recheck();
  }
  const transactions = await scope
    .queryOwned(
      db.get<Transaction>("transactions"),
      Q.where("account_id", created.id)
    )
    .fetch();
  await recheck();
  const transfers = await scope
    .queryOwned(
      db.get<Transfer>("transfers"),
      Q.or(
        Q.where("from_account_id", created.id),
        Q.where("to_account_id", created.id)
      )
    )
    .fetch();
  await recheck();
  // Actual Watermelon account associations also include recurring payments
  // and debts. Even one surviving newer reference means tombstoning this
  // account would orphan independently authored work. Do not cascade.
  const debts = await scope
    .queryOwned(db.get<Debt>("debts"), Q.where("account_id", created.id))
    .fetch();
  await recheck();
  const recurring = await scope
    .queryOwned(
      db.get<RecurringPayment>("recurring_payments"),
      Q.where("account_id", created.id)
    )
    .fetch();
  await recheck();
  if (
    transactions.length > 0 ||
    transfers.length > 0 ||
    debts.length > 0 ||
    recurring.length > 0
  )
    refuse();

  await verifyFrozenCreatorRootProofs({
    database: db,
    scope,
    root,
    privateSnapshot: snapshot,
    hashProvider,
    recheck,
  });
  await verifyNoSuccessors(db, scope, root, created.id, hashProvider, recheck);
  await recheck();
  return {
    root,
    payload: authority.payload,
    privateSnapshot: snapshot,
    createdAccount: created,
    children: childRows,
    openingEffect: effect,
    priorDefault: prior,
  };
}
