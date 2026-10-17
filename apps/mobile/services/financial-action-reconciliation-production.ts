import { Q, type Database, type Model } from "@nozbe/watermelondb";
import {
  Account,
  AccountFinancialEffect,
  FinancialActionGroup,
  RecurringPayment,
  Transaction,
  Transfer,
  database,
  type RecurringStatus,
} from "@monyvi/db";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  parseFinancialActionEnvelopeJson,
  serializeDecimal,
} from "@monyvi/logic";

import {
  createFinancialActionReconciliationService,
  FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES,
  type FinancialActionReconciliationBundle,
  type InstallCanonicalAccountSnapshotInput,
} from "./financial-action-reconciliation-service";
import { productionFinancialActionHashProvider } from "./account-balance-command-production";
import { requireGuardedAccountBalanceWriter } from "./account-balance-writer-registry";
import {
  assertExpectedCurrentUser,
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "./user-data-access";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";
import { commitPreparedBatch } from "./watermelon-atomic-batch";
import { parseCanonicalAccountsFromOutcomeJson } from "./account-review-recovery-canonical";
import { reconcileRejectedAccountReviewInSqlite } from "./account-review-recovery-commit";
import { reconcileRejectedAccountDefaultInSqlite } from "./account-default-intent-local-recovery-commit";
export { parseCanonicalAccountsFromOutcomeJson } from "./account-review-recovery-canonical";

function fail(): never {
  throw new Error(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
}
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function findOwnedRoot(
  scope: CurrentUserDataScope,
  targetDatabase: Database,
  actionId: string
): Promise<FinancialActionGroup> {
  const roots = await scope
    .queryOwned(
      targetDatabase.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("action_id", actionId)
    )
    .fetch();
  const root = roots.find((candidate) => candidate.actionId === actionId);
  if (!root || roots.length !== 1) fail();
  return scope.assertOwned(root);
}

async function findOwnedEffects(
  scope: CurrentUserDataScope,
  targetDatabase: Database,
  actionId: string
): Promise<readonly AccountFinancialEffect[]> {
  const effects = await scope
    .queryOwned(
      targetDatabase.get<AccountFinancialEffect>("account_financial_effects"),
      Q.where("action_id", actionId)
    )
    .fetch();
  if (
    effects.length === 0 ||
    effects.some((effect) => effect.actionId !== actionId)
  ) {
    fail();
  }
  return Object.freeze(effects.map((effect) => scope.assertOwned(effect)));
}

async function loadAccounts(
  scope: CurrentUserDataScope,
  targetDatabase: Database,
  accountIds: readonly string[]
): Promise<readonly Account[]> {
  const uniqueIds = [...new Set(accountIds)].sort();
  return Object.freeze(
    await Promise.all(
      uniqueIds.map((accountId) =>
        scope.findOwned(targetDatabase.get<Account>("accounts"), accountId)
      )
    )
  );
}

async function loadProductionReconciliationBundle(
  actionId: string
): Promise<FinancialActionReconciliationBundle> {
  const scope = await getCurrentUserDataScope();
  const root = await findOwnedRoot(scope, database, actionId);
  const effects = await findOwnedEffects(scope, database, actionId);
  const accounts = await loadAccounts(
    scope,
    database,
    effects.map((effect) => effect.accountId)
  );
  await assertExpectedCurrentUser(scope.userId);
  return Object.freeze({
    accounts: Object.freeze(
      accounts.map((account) => ({
        accountId: account.id,
        balance: account.balance,
        currency: account.currency,
        financialRevision: account.financialRevision,
      }))
    ),
    actionId: root.actionId,
    canonicalAccounts: parseCanonicalAccountsFromOutcomeJson(root.outcomeJson),
    domain: root.domain,
    effects: Object.freeze(
      effects.map((effect) => ({
        acceptedAccountRevision: effect.acceptedAccountRevision,
        accountId: effect.accountId,
        actionId: effect.actionId,
        amountMinorUnits: effect.amountMinorUnits,
        currency: effect.currency,
        effectId: effect.id,
        isEffective: effect.isEffective,
        reversesEffectId: effect.reversesEffectId,
      }))
    ),
    localSmsReviewDraftSnapshot: null,
    payloadJson: root.payloadJson,
    state: root.state,
    userId: scope.userId,
  });
}

function balanceFromMinorUnits(value: string, currency: string): number {
  const isKnownCurrency = (
    candidate: string
  ): candidate is keyof typeof CURRENCY_PRECISION =>
    candidate in CURRENCY_PRECISION;
  const precision =
    (isKnownCurrency(currency) ? CURRENCY_PRECISION[currency] : undefined) ??
    DEFAULT_PRECISION;
  const exact = serializeDecimal(fromMinorUnits(value, precision));
  const result = Number(exact);
  if (!Number.isFinite(result) || serializeDecimal(String(result)) !== exact)
    fail();
  return result;
}

function matchesExpectedAccount(
  account: Account,
  expected: InstallCanonicalAccountSnapshotInput["expectedAccounts"][number]
): boolean {
  return (
    account.id === expected.accountId &&
    account.balance === expected.balance &&
    account.currency === expected.currency &&
    account.financialRevision === expected.financialRevision
  );
}

type LosingDomainCreateTable = "transactions" | "transfers";

const LOSING_CREATE_ENTITY_TABLES: Readonly<
  Record<string, LosingDomainCreateTable>
> = {
  transaction: "transactions",
  transfer: "transfers",
};

function readLosingDomainCreates(payloadJson: string): ReadonlyArray<{
  readonly id: string;
  readonly table: LosingDomainCreateTable;
}> {
  let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
  try {
    envelope = parseFinancialActionEnvelopeJson(payloadJson);
  } catch {
    fail();
  }
  const domainMutation = envelope.payload.domainMutation as unknown;
  if (!isObject(domainMutation)) fail();
  const records = domainMutation.records;
  if (!Array.isArray(records)) fail();
  const creates: Array<{
    readonly id: string;
    readonly table: LosingDomainCreateTable;
  }> = [];
  records.forEach((record: unknown) => {
    if (!isObject(record)) return;
    if (record.mode !== "create" || typeof record.entity !== "string") return;
    const table = LOSING_CREATE_ENTITY_TABLES[record.entity];
    if (!isObject(record.after)) return;
    const id = record.after.id;
    if (table && typeof id === "string" && id.length > 0) {
      creates.push({ id, table });
    }
  });
  return Object.freeze(creates);
}

interface LosingScheduleRevert {
  readonly appliedFinancialRevision: string;
  readonly appliedNextDueDate: Date;
  readonly appliedStatus: RecurringStatus;
  readonly financialRevision: string;
  readonly nextDueDate: Date;
  readonly paymentId: string;
  readonly status: RecurringStatus;
}

const SCHEDULE_REVERT_STATUSES: readonly RecurringStatus[] = [
  "ACTIVE",
  "COMPLETED",
];

function startOfLocalDay(dayText: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayText)) return null;
  const midnight = new Date(`${dayText}T00:00:00`);
  if (!Number.isFinite(midnight.getTime())) return null;
  const year = midnight.getFullYear();
  const month = String(midnight.getMonth() + 1).padStart(2, "0");
  const day = String(midnight.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` === dayText ? midnight : null;
}

function readLosingScheduleReverts(
  payloadJson: string
): readonly LosingScheduleRevert[] {
  let envelope: ReturnType<typeof parseFinancialActionEnvelopeJson>;
  try {
    envelope = parseFinancialActionEnvelopeJson(payloadJson);
  } catch {
    fail();
  }
  const domainMutation = envelope.payload.domainMutation as unknown;
  if (!isObject(domainMutation)) fail();
  const records = domainMutation.records;
  if (!Array.isArray(records)) fail();
  const reverts: LosingScheduleRevert[] = [];
  records.forEach((record: unknown) => {
    if (!isObject(record)) return;
    if (record.entity !== "recurring_payment" || record.mode !== "update")
      return;
    if (!isObject(record.after)) return;
    const paymentId = record.after.id;
    if (typeof paymentId !== "string" || paymentId.length === 0) return;
    if (record.before === undefined) return;
    if (!isObject(record.before)) fail();
    const before = record.before;
    const financialRevision = before.financialRevision;
    const nextDueDateText = before.nextDueDate;
    const status = before.status;
    const nextDueDate =
      typeof nextDueDateText === "string"
        ? startOfLocalDay(nextDueDateText)
        : null;
    const appliedFinancialRevision = record.after.financialRevision;
    const appliedNextDueDateText = record.after.nextDueDate;
    const appliedStatus = record.after.status;
    const appliedNextDueDate =
      typeof appliedNextDueDateText === "string"
        ? startOfLocalDay(appliedNextDueDateText)
        : null;
    if (
      typeof financialRevision !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(financialRevision) ||
      financialRevision !== record.expectedRevision ||
      nextDueDate === null ||
      typeof status !== "string" ||
      !SCHEDULE_REVERT_STATUSES.includes(status as RecurringStatus) ||
      typeof appliedFinancialRevision !== "string" ||
      appliedFinancialRevision !==
        (BigInt(financialRevision) + 1n).toString() ||
      appliedNextDueDate === null ||
      typeof appliedStatus !== "string" ||
      !SCHEDULE_REVERT_STATUSES.includes(appliedStatus as RecurringStatus)
    ) {
      fail();
    }
    reverts.push({
      appliedFinancialRevision,
      appliedNextDueDate,
      appliedStatus: appliedStatus as RecurringStatus,
      financialRevision,
      nextDueDate,
      paymentId,
      status: status as RecurringStatus,
    });
  });
  return Object.freeze(reverts);
}

async function installCanonicalSnapshotAtomically(
  input: InstallCanonicalAccountSnapshotInput
): Promise<void> {
  requireGuardedAccountBalanceWriter("sync.accounts.pull-full-row");
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== input.userId) fail();
  await database.write(async (): Promise<void> => {
    await assertExpectedCurrentUser(input.userId);
    const root = await findOwnedRoot(scope, database, input.actionId);
    const effects = await findOwnedEffects(scope, database, input.actionId);
    const accounts = await loadAccounts(
      scope,
      database,
      input.expectedAccounts.map((account) => account.accountId)
    );
    const expectedAccounts = new Map(
      input.expectedAccounts.map((account) => [account.accountId, account])
    );
    const canonicalAccounts = new Map(
      input.canonicalAccounts.map((account) => [account.accountId, account])
    );
    const losingEffects = new Map(
      input.losingEffects.map((effect) => [effect.effectId, effect])
    );
    if (
      root.userId !== input.userId ||
      root.actionId !== input.actionId ||
      !["rejected_compensating", "reconciled"].includes(root.state) ||
      accounts.length !== expectedAccounts.size ||
      canonicalAccounts.size !== expectedAccounts.size ||
      effects.length !== losingEffects.size ||
      accounts.some((account) => {
        const expected = expectedAccounts.get(account.id);
        const canonical = canonicalAccounts.get(account.id);
        return (
          !expected ||
          !canonical ||
          !matchesExpectedAccount(account, expected) ||
          canonical.currency !== account.currency
        );
      }) ||
      effects.some((effect) => {
        const expected = losingEffects.get(effect.id);
        return (
          !expected ||
          effect.accountId !== expected.accountId ||
          effect.actionId !== expected.actionId ||
          effect.acceptedAccountRevision !== expected.acceptedAccountRevision ||
          effect.amountMinorUnits !== expected.amountMinorUnits ||
          effect.currency !== expected.currency ||
          effect.isEffective !== expected.isEffective ||
          effect.reversesEffectId !== expected.reversesEffectId
        );
      })
    ) {
      fail();
    }
    const snapshots = [root, ...accounts, ...effects].map(
      captureCachedModelSnapshot
    );
    const now = new Date();
    const operations: Model[] = [];
    let hasCommitted = false;
    try {
      const losingCreates = readLosingDomainCreates(root.payloadJson);
      const stageLosingDelete = (row: Transaction | Transfer): void => {
        snapshots.push(captureCachedModelSnapshot(row));
        operations.push(
          row.prepareUpdate((candidate) => {
            candidate.deleted = true;
            candidate.updatedAt = now;
          })
        );
      };
      for (const record of losingCreates) {
        if (record.table === "transactions") {
          const rows = await scope
            .queryOwned(
              database.get<Transaction>("transactions"),
              Q.where("id", record.id)
            )
            .fetch();
          const row = rows.find((candidate) => candidate.id === record.id);
          if (!row) continue;
          stageLosingDelete(row);
        } else {
          const rows = await scope
            .queryOwned(
              database.get<Transfer>("transfers"),
              Q.where("id", record.id)
            )
            .fetch();
          const row = rows.find((candidate) => candidate.id === record.id);
          if (!row) continue;
          stageLosingDelete(row);
        }
      }
      const scheduleReverts = readLosingScheduleReverts(root.payloadJson);
      for (const revert of scheduleReverts) {
        const rows = await scope
          .queryOwned(
            database.get<RecurringPayment>("recurring_payments"),
            Q.where("id", revert.paymentId)
          )
          .fetch();
        const paymentRow = rows.find(
          (candidate) => candidate.id === revert.paymentId
        );
        if (!paymentRow) fail();
        const matchesOriginal =
          paymentRow.financialRevision === revert.financialRevision &&
          paymentRow.nextDueDate.getTime() === revert.nextDueDate.getTime() &&
          paymentRow.status === revert.status;
        if (matchesOriginal) continue;
        if (
          paymentRow.financialRevision !== revert.appliedFinancialRevision ||
          paymentRow.nextDueDate.getTime() !==
            revert.appliedNextDueDate.getTime() ||
          paymentRow.status !== revert.appliedStatus
        ) {
          throw new Error(
            FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE
          );
        }
        snapshots.push(captureCachedModelSnapshot(paymentRow));
        operations.push(
          paymentRow.prepareUpdate((candidate) => {
            candidate.nextDueDate = revert.nextDueDate;
            candidate.status = revert.status;
            candidate.financialRevision = revert.financialRevision;
            candidate.updatedAt = now;
          })
        );
      }
      accounts.forEach((account) => {
        const canonical = canonicalAccounts.get(account.id);
        if (!canonical) fail();
        operations.push(
          account.prepareUpdate((record) => {
            record.balance = balanceFromMinorUnits(
              canonical.balanceMinorUnits,
              canonical.currency
            );
            record.financialRevision = canonical.canonicalRevision;
            record.updatedAt = now;
          })
        );
      });
      effects.forEach((effect) => {
        operations.push(
          effect.prepareUpdate((record) => {
            record.isEffective = false;
            record.compensatedAt = now;
            record.updatedAt = now;
          })
        );
      });
      operations.push(
        root.prepareUpdate((record) => {
          record.state = "reconciled";
          record.updatedAt = now;
        })
      );
      await assertExpectedCurrentUser(input.userId);
      await commitPreparedBatch(operations, database);
      hasCommitted = true;
      await assertExpectedCurrentUser(input.userId);
    } catch (error) {
      if (!hasCommitted) snapshots.forEach(restoreCachedModelSnapshot);
      throw error;
    }
  });
}

const legacyFinancialActionReconciliationService =
  createFinancialActionReconciliationService({
    commitCompensationAtomically: (): Promise<never> =>
      Promise.reject(
        new Error(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE)
      ),
    hashProvider: productionFinancialActionHashProvider,
    installCanonicalSnapshotAtomically,
    loadReconciliationBundle: loadProductionReconciliationBundle,
  });

export const productionFinancialActionReconciliationService: ReturnType<
  typeof createFinancialActionReconciliationService
> = {
  reconcileRejectedAction: async (
    actionId
  ): Promise<"reconciled" | "replay"> => {
    const scope = await getCurrentUserDataScope();
    const roots = await scope
      .queryOwned(
        database.get<FinancialActionGroup>("financial_action_groups"),
        Q.where("action_id", actionId)
      )
      .fetch();
    if (roots.length !== 1 || !roots[0]) fail();
    const root = scope.assertOwned(roots[0]);
    await assertExpectedCurrentUser(scope.userId);
    if (root.kind === "review_batch_save") {
      return reconcileRejectedAccountReviewInSqlite({
        database,
        actionId,
        // The original dispatcher's verified actor and physical root are the
        // authority. Recovery must not silently select another owner's K.
        expectedOwnerId: scope.userId,
        expectedPhysicalRootId: root.id,
        expectedPayloadHash: root.payloadHash,
        expectedPayloadJson: root.payloadJson,
        hashProvider: productionFinancialActionHashProvider,
      });
    }
    // Add requires its separate twelve-key private proof and complete
    // canonical default rejection authority. Reuse the dispatcher's original
    // actor/physical root identity; never resolve a substitute owner or pass
    // the tuple to the generic inverse reconciler.
    if (root.kind === "create_with_default") {
      return reconcileRejectedAccountDefaultInSqlite({
        database,
        actionId,
        expectedOwnerId: scope.userId,
        expectedPhysicalRootId: root.id,
        expectedPayloadHash: root.payloadHash,
        expectedPayloadJson: root.payloadJson,
        hashProvider: productionFinancialActionHashProvider,
      });
    }
    return legacyFinancialActionReconciliationService.reconcileRejectedAction(
      actionId
    );
  },
};
