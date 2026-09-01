import {
  CURRENCY_PRECISION,
  DEFAULT_PRECISION,
  fromMinorUnits,
  parseCanonicalDecimal,
  serializeDecimal,
} from "@monyvi/logic";

export const FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES = {
  INCOMPLETE: "financial_action_reconciliation_incomplete",
  INVALID_EVIDENCE: "financial_action_reconciliation_invalid_evidence",
  REVISION_STALE: "financial_action_reconciliation_revision_stale",
} as const;

export interface ReconciliationAccountSnapshot {
  readonly accountId: string;
  readonly balance: number;
  readonly currency: string;
  readonly financialRevision: string;
}

export interface ReconciliationEffectSnapshot {
  readonly acceptedAccountRevision: string;
  readonly accountId: string;
  readonly actionId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
  readonly effectId: string;
  readonly isEffective: boolean;
  readonly reversesEffectId: string | null;
}

export interface FinancialActionReconciliationBundle {
  readonly accounts: readonly ReconciliationAccountSnapshot[];
  readonly actionId: string;
  readonly effects: readonly ReconciliationEffectSnapshot[];
  readonly state: string;
  readonly userId: string;
}

export interface CompensationAccountMutation {
  readonly accountId: string;
  readonly expectedRevision: string;
  readonly nextBalance: number;
  readonly nextRevision: string;
}

export interface CompensationEffectMutation {
  readonly acceptedAccountRevision: string;
  readonly accountId: string;
  readonly amountMinorUnits: string;
  readonly currency: string;
  readonly originalEffectId: string;
}

export interface CommitFinancialActionCompensationInput {
  readonly accountMutations: readonly CompensationAccountMutation[];
  readonly actionId: string;
  readonly effectMutations: readonly CompensationEffectMutation[];
  readonly userId: string;
}

export interface FinancialActionReconciliationDependencies {
  readonly commitCompensationAtomically: (
    input: CommitFinancialActionCompensationInput
  ) => Promise<void>;
  readonly loadReconciliationBundle: (
    actionId: string
  ) => Promise<FinancialActionReconciliationBundle>;
}

export interface FinancialActionReconciliationService {
  readonly reconcileRejectedAction: (
    actionId: string
  ) => Promise<"reconciled" | "replay">;
}

function fail(code: string): never {
  throw new Error(code);
}

function currencyPlaces(currency: string): number {
  return (
    CURRENCY_PRECISION[currency as keyof typeof CURRENCY_PRECISION] ??
    DEFAULT_PRECISION
  );
}

function addMinorUnits(
  balance: number,
  amountMinorUnits: string,
  currency: string
): number {
  const exact = serializeDecimal(
    parseCanonicalDecimal(String(balance)).plus(
      fromMinorUnits(amountMinorUnits, currencyPlaces(currency))
    )
  );
  const result = Number(exact);
  if (!Number.isFinite(result) || serializeDecimal(String(result)) !== exact) {
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
  }
  return result;
}

function buildCompensation(
  bundle: FinancialActionReconciliationBundle
): CommitFinancialActionCompensationInput | null {
  if (
    bundle.state === "reconciled" &&
    bundle.effects.every((effect) => !effect.isEffective)
  ) {
    return null;
  }
  if (
    bundle.state !== "rejected_compensating" ||
    bundle.effects.length === 0 ||
    bundle.effects.some(
      (effect) =>
        !effect.isEffective ||
        effect.reversesEffectId !== null ||
        effect.actionId !== bundle.actionId
    )
  )
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);

  const effectsByAccount = new Map<string, ReconciliationEffectSnapshot>();
  bundle.effects.forEach((effect) => {
    if (effectsByAccount.has(effect.accountId)) {
      fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
    }
    effectsByAccount.set(effect.accountId, effect);
  });
  const sortedAccounts = [...bundle.accounts].sort((left, right) =>
    left.accountId.localeCompare(right.accountId)
  );
  if (
    sortedAccounts.length !== effectsByAccount.size ||
    sortedAccounts.some((account) => !effectsByAccount.has(account.accountId))
  )
    fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);

  const accountMutations: CompensationAccountMutation[] = [];
  const effectMutations: CompensationEffectMutation[] = [];
  sortedAccounts.forEach((account) => {
    const effect = effectsByAccount.get(account.accountId);
    if (!effect || effect.currency !== account.currency) {
      fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
    }
    const nextRevision = BigInt(account.financialRevision) + 1n;
    if (nextRevision > 9223372036854775807n) {
      fail(FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE);
    }
    const reversedAmount = (-BigInt(effect.amountMinorUnits)).toString();
    accountMutations.push({
      accountId: account.accountId,
      expectedRevision: account.financialRevision,
      nextBalance: addMinorUnits(
        account.balance,
        reversedAmount,
        account.currency
      ),
      nextRevision: nextRevision.toString(),
    });
    effectMutations.push({
      acceptedAccountRevision: nextRevision.toString(),
      accountId: account.accountId,
      amountMinorUnits: reversedAmount,
      currency: account.currency,
      originalEffectId: effect.effectId,
    });
  });
  return {
    accountMutations: Object.freeze(accountMutations),
    actionId: bundle.actionId,
    effectMutations: Object.freeze(effectMutations),
    userId: bundle.userId,
  };
}

export function createFinancialActionReconciliationService(
  dependencies: FinancialActionReconciliationDependencies
): FinancialActionReconciliationService {
  return {
    reconcileRejectedAction: async (
      actionId: string
    ): Promise<"reconciled" | "replay"> => {
      const input = buildCompensation(
        await dependencies.loadReconciliationBundle(actionId)
      );
      if (!input) return "replay";
      await dependencies.commitCompensationAtomically(input);
      return "reconciled";
    },
  };
}
