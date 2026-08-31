import { assertCanonicalMetalRevision } from "./metal-financial-action-adapter";

export interface CanonicalMetalAccountEvidence {
  readonly accountId: string;
  readonly revision: string;
  readonly evidenceId: string;
}

export interface MetalServerOutcome {
  readonly serverOutcome: "accepted" | "idempotent" | "stale" | "rejected";
  readonly actionId: string;
  readonly userId: string;
  readonly payloadHashMatches: boolean;
  readonly canonicalHoldingRevision: string | null;
  readonly canonicalHoldingEvidenceId: string | null;
  readonly canonicalAccountEvidence: readonly CanonicalMetalAccountEvidence[];
}

export type MetalOutcomeClassification =
  | "accepted"
  | "stale_ready"
  | "account_only_stale_ready"
  | "reconciliation_incomplete";

function hasValidAccounts(
  evidence: readonly CanonicalMetalAccountEvidence[]
): boolean {
  const accountIds = new Set<string>();
  let previousAccountId: string | null = null;
  for (const item of evidence) {
    if (
      !item.accountId ||
      !item.evidenceId ||
      accountIds.has(item.accountId) ||
      (previousAccountId !== null && item.accountId <= previousAccountId)
    ) {
      return false;
    }
    try {
      assertCanonicalMetalRevision(item.revision);
    } catch {
      return false;
    }
    accountIds.add(item.accountId);
    previousAccountId = item.accountId;
  }
  return true;
}

export function classifyMetalServerOutcome(
  outcome: MetalServerOutcome,
  expectedUserId: string
): MetalOutcomeClassification {
  if (outcome.userId !== expectedUserId) throw new Error("foreign_canonical_evidence");
  if (!outcome.payloadHashMatches) throw new Error("payload_hash_mismatch_non_retryable");
  if (!hasValidAccounts(outcome.canonicalAccountEvidence)) {
    return "reconciliation_incomplete";
  }
  if (outcome.serverOutcome === "accepted" || outcome.serverOutcome === "idempotent") {
    return "accepted";
  }
  if (outcome.serverOutcome === "rejected") return "reconciliation_incomplete";

  const hasHoldingRevision = outcome.canonicalHoldingRevision !== null;
  const hasHoldingEvidence = outcome.canonicalHoldingEvidenceId !== null;
  if (hasHoldingRevision !== hasHoldingEvidence) return "reconciliation_incomplete";
  if (hasHoldingRevision && hasHoldingEvidence) {
    assertCanonicalMetalRevision(outcome.canonicalHoldingRevision!);
    return "stale_ready";
  }
  return outcome.canonicalAccountEvidence.length > 0
    ? "account_only_stale_ready"
    : "reconciliation_incomplete";
}

export interface MetalReconciliationDependencies {
  readonly withActionLock: <T>(
    actionId: string,
    operation: () => Promise<T>
  ) => Promise<T>;
  readonly hasCompensated: (actionId: string) => Promise<boolean>;
  readonly restorePriorHolding: (actionId: string) => Promise<void>;
  readonly restoreCanonicalHolding: (
    actionId: string,
    revision: string,
    evidenceId: string
  ) => Promise<void>;
  readonly restoreAccounts: (
    actionId: string,
    evidence: readonly CanonicalMetalAccountEvidence[]
  ) => Promise<void>;
  readonly markReconciled: (actionId: string) => Promise<void>;
}

export interface MetalReconciliationService {
  readonly reconcile: (outcome: MetalServerOutcome, userId: string) => Promise<void>;
}

export function createMetalReconciliationService(
  dependencies: MetalReconciliationDependencies
): MetalReconciliationService {
  async function reconcile(outcome: MetalServerOutcome, userId: string): Promise<void> {
    await dependencies.withActionLock(outcome.actionId, async (): Promise<void> => {
      const classification = classifyMetalServerOutcome(outcome, userId);
      if (classification === "accepted") {
        await dependencies.markReconciled(outcome.actionId);
        return;
      }
      if (classification === "reconciliation_incomplete") {
        throw new Error("reconciliation_incomplete");
      }
      if (await dependencies.hasCompensated(outcome.actionId)) return;

      if (classification === "account_only_stale_ready") {
        await dependencies.restorePriorHolding(outcome.actionId);
      } else {
        await dependencies.restoreCanonicalHolding(
          outcome.actionId,
          outcome.canonicalHoldingRevision!,
          outcome.canonicalHoldingEvidenceId!
        );
      }
      await dependencies.restoreAccounts(
        outcome.actionId,
        outcome.canonicalAccountEvidence
      );
      await dependencies.markReconciled(outcome.actionId);
    });
  }

  return Object.freeze({ reconcile });
}
