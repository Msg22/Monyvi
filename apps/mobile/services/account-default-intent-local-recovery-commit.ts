/**
 * #395 T069: authenticated, once-only Add default rejection compensation.
 * This correction applies a canonical receipt, not a new user financial intent.
 * One database-scoped sync/ACK exclusion encloses the entire SQLite writer.
 */
import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Account,
  AccountFinancialEffect,
  AccountSmsSender,
  BankDetails,
  FinancialActionGroup,
} from "@monyvi/db";
import type { Sha256Provider } from "@monyvi/logic";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
} from "./user-data-access";
import {
  runWithAccountSyncAckExclusion,
  assertAccountSyncAckScopeCurrent,
  type AccountSyncAckCapability,
} from "./sync/account-sync-ack-scope";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { commitPreparedBatch } from "./watermelon-atomic-batch";
import { physicalRawField } from "./account-review-local-snapshot-postimages";
import {
  assertExpectedAddRoot,
  verifyImmutableAddRecoveryAuthority,
  verifyAddRecoveryPhysicalState,
  type ExpectedAddRecoveryIdentity,
  type VerifiedAddRecoveryAuthority,
  type VerifiedAddRecovery,
} from "./account-default-intent-local-recovery-evidence";

const INCOMPLETE = "financial_action_reconciliation_incomplete";
function refuse(): never {
  throw new Error(INCOMPLETE);
}
function cleanRestoredPriorDefault(
  record: Account,
  original: {
    readonly status: string;
    readonly changed: string;
    readonly updatedAt: unknown;
  }
): void {
  const changed = original.changed === "" ? [] : original.changed.split(",");
  if (changed.includes("") || new Set(changed).size !== changed.length)
    refuse();
  // Remove only the flag corrected by the canonical outcome. Independently
  // changed metadata and the original physical timestamp remain untouched.
  const residual = changed.filter((column) => column !== "is_default");
  const state =
    original.status === "created"
      ? "created"
      : residual.length
        ? "updated"
        : "synced";
  Object.assign(record._raw, {
    _status: state,
    _changed: residual.join(","),
    updated_at: original.updatedAt,
  });
}
function stageLosingChildren(
  children: ReadonlyArray<BankDetails | AccountSmsSender>,
  now: Date
): readonly Model[] {
  return children.map((child) =>
    child.prepareUpdate((candidate) => {
      candidate.deleted = true;
      candidate.updatedAt = now;
    })
  );
}
function stageLosingAccount(account: Account, now: Date): Account {
  return account.prepareUpdate((candidate) => {
    candidate.deleted = true;
    candidate.updatedAt = now;
    // Retain historical opening balance, currency and revision for the
    // original effect and protected compensating ledger.
  });
}
function stagePriorDefaultRestore(prior: Account): Account {
  // Capture the *current* persisted transport state, NOT the historical
  // pre-Add transport image, so independent metadata dirty columns survive.
  const original = {
    status: prior._raw._status,
    changed: prior._raw._changed,
    updatedAt: physicalRawField(prior._raw, "updated_at"),
  };
  if (
    !["created", "updated", "synced"].includes(original.status) ||
    typeof original.changed !== "string" ||
    typeof original.updatedAt !== "number" ||
    !Number.isFinite(original.updatedAt)
  )
    refuse();
  return prior.prepareUpdate((candidate) => {
    candidate.isDefault = true;
    // Never stamp now on an unrelated metadata row or turn the canonical
    // correction into a new LWW default intent.
    cleanRestoredPriorDefault(candidate, original);
  });
}
function stageOpeningEffect(
  effect: AccountFinancialEffect,
  now: Date
): AccountFinancialEffect {
  return effect.prepareUpdate((candidate) => {
    candidate.isEffective = false;
    candidate.compensatedAt = now;
    candidate.updatedAt = now;
    // Original event, amount, actionId, revision and evidence are immutable.
  });
}
function stageTerminalRoot(
  root: FinancialActionGroup,
  now: Date
): FinancialActionGroup {
  const originalPrivate = root.localRecoverySnapshotJson;
  return root.prepareUpdate((record) => {
    record.state = "reconciled";
    record.updatedAt = now;
    // Add private carrier is retained until protected ACK/dependencies and
    // durable generic-sync suppression can independently permit cleanup.
    record.localRecoverySnapshotJson = originalPrivate;
  });
}
async function assertLocallyCompensatedReplay(input: {
  readonly database: Database;
  readonly identity: ExpectedAddRecoveryIdentity;
  readonly root: FinancialActionGroup;
  readonly authority: VerifiedAddRecoveryAuthority;
  readonly recheck: () => Promise<void>;
}): Promise<void> {
  const { database: db, root, authority, recheck } = input;
  const snapshot = authority.privateSnapshot;
  const createdRows = await db
    .get<Account>("accounts")
    .query(Q.where("id", snapshot.createdAccount.accountId))
    .fetch();
  await recheck();
  const created = createdRows[0];
  if (
    createdRows.length !== 1 ||
    !created ||
    created.userId !== snapshot.ownerId ||
    !created.deleted
  )
    refuse();
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
  const descendants: ReadonlyArray<BankDetails | AccountSmsSender> = [
    ...banks,
    ...senders,
  ];
  const expected = snapshot.createdChildren
    .map(
      (child) =>
        (child.entity === "bank_details"
          ? "bank_details"
          : "account_sms_senders") +
        ":" +
        child.id
    )
    .sort();
  const actual = descendants
    .map((child) => child.table + ":" + child.id)
    .sort();
  if (
    expected.length !== actual.length ||
    expected.some((id, index) => actual[index] !== id) ||
    descendants.some((child) => !child.deleted)
  )
    refuse();
  const effects = await db
    .get<AccountFinancialEffect>("account_financial_effects")
    .query(
      Q.where("user_id", snapshot.ownerId),
      Q.where("action_id", root.actionId)
    )
    .fetch();
  await recheck();
  const originallyEffective = snapshot.openingEffect;
  if (effects.length !== (originallyEffective ? 1 : 0)) refuse();
  if (originallyEffective) {
    const effect = effects[0];
    if (
      !effect ||
      effect.id !== originallyEffective.effectId ||
      effect.accountId !== created.id ||
      effect.isEffective ||
      effect.compensatedAt === null ||
      effect.amountMinorUnits !==
        originallyEffective.postimage.amountMinorUnits ||
      effect.acceptedAccountRevision !== "1" ||
      effect.reversesEffectId !== null
    )
      refuse();
  }
  if (snapshot.priorDefault !== null) {
    const restored = await db
      .get<Account>("accounts")
      .query(Q.where("id", snapshot.priorDefault.accountId))
      .fetch();
    await recheck();
    // Without a local completion marker beyond the existing root state,
    // require the actual prior flag restoration as positive compensation
    // evidence. An independently changed later default cannot be rewritten
    // by this historical callback and therefore conservatively refuses.
    if (
      restored.length !== 1 ||
      !restored[0] ||
      restored[0].userId !== snapshot.ownerId ||
      restored[0].deleted ||
      !restored[0].isDefault
    )
      refuse();
  }
  // A remote label alone is not terminal local compensation. The actual
  // losing domain/effect/default images above must already be compensated.
  assertExpectedAddRoot(root, input.identity);
}

/**
 * Standalone external entry: acquires the sync owner's opaque, database-scoped
 * exclusion BEFORE entering a serialized local writer. Never recursively
 * acquire it from inside an in-flight protected push.
 */
export async function reconcileRejectedAccountDefaultInSqlite(
  input: ExpectedAddRecoveryIdentity & {
    readonly database: Database;
    readonly hashProvider: Sha256Provider;
  }
): Promise<"reconciled" | "replay"> {
  const { database: db, hashProvider } = input;
  const expected: ExpectedAddRecoveryIdentity = Object.freeze({
    actionId: input.actionId,
    expectedOwnerId: input.expectedOwnerId,
    expectedPhysicalRootId: input.expectedPhysicalRootId,
    expectedPayloadHash: input.expectedPayloadHash,
    expectedPayloadJson: input.expectedPayloadJson,
  });
  return runWithAccountSyncAckExclusion(
    db,
    expected.expectedOwnerId,
    async (
      capability: AccountSyncAckCapability
    ): Promise<"reconciled" | "replay"> => {
      const assertActor = async (): Promise<void> => {
        assertAccountSyncAckScopeCurrent(
          capability,
          db,
          expected.expectedOwnerId
        );
        await assertExpectedCurrentUser(expected.expectedOwnerId);
        assertAccountSyncAckScopeCurrent(
          capability,
          db,
          expected.expectedOwnerId
        );
      };
      await assertActor();
      return db.write(async (): Promise<"reconciled" | "replay"> => {
        await assertActor();
        const scope = await getCurrentUserDataScope();
        await assertActor();
        if (scope.userId !== expected.expectedOwnerId) refuse();
        const roots = await scope
          .queryOwned(
            db.get<FinancialActionGroup>("financial_action_groups"),
            Q.where("action_id", expected.actionId)
          )
          .fetch();
        await assertActor();
        if (roots.length !== 1 || !roots[0]) refuse();
        const root = scope.assertOwned(roots[0]);
        assertExpectedAddRoot(root, expected);
        const authority = await verifyImmutableAddRecoveryAuthority({
          root,
          expected,
          hashProvider,
          recheck: assertActor,
        });
        await assertActor();
        if (root.state === "reconciled") {
          await assertLocallyCompensatedReplay({
            database: db,
            identity: expected,
            root,
            authority,
            recheck: assertActor,
          });
          await assertActor();
          return "replay";
        }
        const verified: VerifiedAddRecovery =
          await verifyAddRecoveryPhysicalState({
            database: db,
            scope,
            root,
            authority,
            hashProvider,
            recheck: assertActor,
          });
        await assertActor();
        // Never prepare one financial mutation until ALL immutable receipt,
        // owner, account, child, effect, default and dependency proofs pass.
        const touched: readonly Model[] = [
          root,
          verified.createdAccount,
          ...verified.children,
          ...(verified.openingEffect ? [verified.openingEffect] : []),
          ...(verified.priorDefault ? [verified.priorDefault] : []),
        ];
        const snapshots = touched.map(captureCachedModelSnapshot);
        let adapterCommitted = false;
        try {
          const now = new Date();
          const operations: Model[] = [
            ...stageLosingChildren(verified.children, now),
            stageLosingAccount(verified.createdAccount, now),
            ...(verified.openingEffect
              ? [stageOpeningEffect(verified.openingEffect, now)]
              : []),
            ...(verified.priorDefault
              ? [stagePriorDefaultRestore(verified.priorDefault)]
              : []),
            stageTerminalRoot(root, now),
          ];
          await assertActor();
          assertExpectedAddRoot(root, expected);
          assertAccountSyncAckScopeCurrent(
            capability,
            db,
            expected.expectedOwnerId
          );
          await commitPreparedBatch(operations, db);
          adapterCommitted = true;
          // Durable adapter commit wins even if auth changes or an observer
          // misbehaves after persistence. Never expose a retryable false-fail.
          return "reconciled";
        } catch (error: unknown) {
          if (!adapterCommitted) snapshots.forEach(restoreCachedModelSnapshot);
          throw error;
        }
      });
    }
  );
}
