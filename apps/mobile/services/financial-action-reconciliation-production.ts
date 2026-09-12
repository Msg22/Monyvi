import { Q, type Database, type Model } from "@nozbe/watermelondb";
import {
  Account,
  AccountFinancialEffect,
  FinancialActionGroup,
  database,
} from "@monyvi/db";
import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  serializeDecimal,
} from "@monyvi/logic";

import {
  createFinancialActionReconciliationService,
  FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES,
  type CanonicalAccountSnapshot,
  type CanonicalEffectSnapshot,
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

function fail(): never {
  throw new Error(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function readString(
  value: Readonly<Record<string, unknown>>,
  key: string
): string {
  const candidate = value[key];
  if (typeof candidate !== "string") fail();
  return candidate;
}

function parseCanonicalEffect(value: unknown): CanonicalEffectSnapshot {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "acceptedRevision",
      "actionId",
      "amountMinorUnits",
      "effectEvidenceHash",
      "effectId",
      "kind",
    ])
  ) {
    fail();
  }
  return Object.freeze({
    acceptedRevision: readString(value, "acceptedRevision"),
    actionId: readString(value, "actionId"),
    amountMinorUnits: readString(value, "amountMinorUnits"),
    effectEvidenceHash: readString(value, "effectEvidenceHash"),
    effectId: readString(value, "effectId"),
    kind: readString(value, "kind"),
  });
}

function parseCanonicalAccount(value: unknown): CanonicalAccountSnapshot {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      "accountId",
      "balanceMinorUnits",
      "canonicalActionId",
      "canonicalEvidenceHash",
      "canonicalRevision",
      "currency",
      "effectChain",
    ]) ||
    !Array.isArray(value.effectChain) ||
    !(
      value.canonicalActionId === null ||
      typeof value.canonicalActionId === "string"
    )
  ) {
    fail();
  }
  return Object.freeze({
    accountId: readString(value, "accountId"),
    balanceMinorUnits: readString(value, "balanceMinorUnits"),
    canonicalActionId: value.canonicalActionId,
    canonicalEvidenceHash: readString(value, "canonicalEvidenceHash"),
    canonicalRevision: readString(value, "canonicalRevision"),
    currency: readString(value, "currency"),
    effectChain: Object.freeze(value.effectChain.map(parseCanonicalEffect)),
  });
}

export function parseCanonicalAccountsFromOutcomeJson(
  outcomeJson: string | null
): readonly CanonicalAccountSnapshot[] | undefined {
  if (outcomeJson === null) return undefined;
  let outcome: unknown;
  try {
    outcome = JSON.parse(outcomeJson);
  } catch {
    fail();
  }
  if (!isObject(outcome)) fail();
  if (outcome.canonicalAccounts === undefined) return undefined;
  if (!Array.isArray(outcome.canonicalAccounts)) fail();
  return Object.freeze(outcome.canonicalAccounts.map(parseCanonicalAccount));
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
  if (effects.length === 0 || effects.some((effect) => effect.actionId !== actionId)) {
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
  if (!Number.isFinite(result) || serializeDecimal(String(result)) !== exact) fail();
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

export const productionFinancialActionReconciliationService =
  createFinancialActionReconciliationService({
    commitCompensationAtomically: (): Promise<never> =>
      Promise.reject(
        new Error(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INCOMPLETE)
      ),
    hashProvider: productionFinancialActionHashProvider,
    installCanonicalSnapshotAtomically,
    loadReconciliationBundle: loadProductionReconciliationBundle,
  });
