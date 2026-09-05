import { assertCanonicalMetalRevision } from "./metal-financial-action-adapter";

export interface CanonicalAccountEvidence {
  readonly accountId: string;
  readonly canonicalRevision: string;
  readonly canonicalActionId: string | null;
  readonly canonicalEvidenceHash: string;
}

interface MetalOutcomeTransportEvidence {
  readonly userId: string;
  readonly payloadHashMatches: boolean;
}

export type MetalRpcOutcome = MetalOutcomeTransportEvidence &
  (
    | {
        readonly status: "accepted" | "idempotent";
        readonly actionId: string;
        readonly holdingRevision: string;
        readonly accountRevisions: readonly {
          readonly accountId: string;
          readonly revision: string;
        }[];
        readonly effectiveEventId: string;
        readonly serverAcceptedAt: string;
      }
    | {
        readonly status: "stale";
        readonly actionId: string;
        readonly code: "HOLDING_REVISION_STALE" | "ACCOUNT_REVISION_STALE";
        readonly canonicalHoldingRevision: string;
        readonly canonicalHoldingActionId: string | null;
        readonly canonicalHoldingEvidenceHash: string;
        readonly canonicalAccounts: readonly CanonicalAccountEvidence[];
        readonly staleAccountIds: readonly string[];
      }
    | {
        readonly status: "rejected";
        readonly actionId: string;
        readonly code:
          | "PAYLOAD_HASH_MISMATCH"
          | "NOT_OWNED"
          | "INVALID_LINK"
          | "INVALID_STATE"
          | "ACCOUNT_INELIGIBLE"
          | "INCOMPLETE_GROUP"
          | "INVALID_REVISION"
          | "REVISION_EXHAUSTED";
      }
  );

export type MetalReconciliationClassification =
  | "accepted"
  | "stale_ready"
  | "account_only_stale_ready"
  | "reconciliation_incomplete";

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function hasCanonicalRevision(value: string): boolean {
  try {
    assertCanonicalMetalRevision(value);
    return true;
  } catch {
    return false;
  }
}

function isCanonicalAccountEvidence(
  values: readonly CanonicalAccountEvidence[],
  staleAccountIds: readonly string[]
): boolean {
  const accountIds = values.map((value) => value.accountId);
  return (
    values.length > 0 &&
    new Set(accountIds).size === accountIds.length &&
    accountIds.every(
      (value, index) => index === 0 || accountIds[index - 1]! < value
    ) &&
    values.every(
      (value) =>
        hasCanonicalRevision(value.canonicalRevision) &&
        HASH_PATTERN.test(value.canonicalEvidenceHash) &&
        (value.canonicalRevision === "0" || value.canonicalActionId !== null)
    ) &&
    staleAccountIds.length > 0 &&
    staleAccountIds.every((id, index) => id === accountIds[index])
  );
}

export function classifyMetalServerOutcome(
  outcome: MetalRpcOutcome,
  expectedUserId: string
): MetalReconciliationClassification {
  if (outcome.userId !== expectedUserId) {
    throw new Error("foreign_canonical_evidence");
  }
  if (
    !outcome.payloadHashMatches ||
    (outcome.status === "rejected" && outcome.code === "PAYLOAD_HASH_MISMATCH")
  ) {
    throw new Error("payload_hash_mismatch_non_retryable");
  }
  if (outcome.status === "accepted" || outcome.status === "idempotent") {
    return "accepted";
  }
  if (outcome.status === "rejected") return "reconciliation_incomplete";
  if (outcome.status !== "stale") return "reconciliation_incomplete";
  if (
    !hasCanonicalRevision(outcome.canonicalHoldingRevision) ||
    !HASH_PATTERN.test(outcome.canonicalHoldingEvidenceHash)
  ) {
    return "reconciliation_incomplete";
  }
  if (outcome.code === "HOLDING_REVISION_STALE") {
    return outcome.canonicalHoldingRevision !== "0" &&
      outcome.canonicalHoldingActionId !== null &&
      outcome.canonicalAccounts.length === 0 &&
      outcome.staleAccountIds.length === 0
      ? "stale_ready"
      : "reconciliation_incomplete";
  }
  return outcome.canonicalHoldingActionId === null &&
    isCanonicalAccountEvidence(
      outcome.canonicalAccounts,
      outcome.staleAccountIds
    )
    ? "account_only_stale_ready"
    : "reconciliation_incomplete";
}

export interface MetalReconciliationDependencies {
  readonly withActionLock: <T>(
    actionId: string,
    operation: () => Promise<T>
  ) => Promise<T>;
  readonly hasReconciled: (actionId: string) => Promise<boolean>;
  readonly commitAcceptedAtomically: (
    outcome: MetalRpcOutcome
  ) => Promise<void>;
  readonly commitRecoveryAtomically: (input: {
    readonly actionId: string;
    readonly kind: "holding_stale" | "account_only_stale";
    readonly outcome: MetalRpcOutcome;
  }) => Promise<void>;
  readonly markIncomplete: (actionId: string, reason: string) => Promise<void>;
}

export interface MetalReconciliationService {
  readonly reconcile: (
    outcome: MetalRpcOutcome,
    expectedUserId: string
  ) => Promise<void>;
}

export function createMetalReconciliationService(
  dependencies: MetalReconciliationDependencies
): MetalReconciliationService {
  async function reconcile(
    outcome: MetalRpcOutcome,
    expectedUserId: string
  ): Promise<void> {
    await dependencies.withActionLock(
      outcome.actionId,
      async (): Promise<void> => {
        if (await dependencies.hasReconciled(outcome.actionId)) return;
        const classification = classifyMetalServerOutcome(
          outcome,
          expectedUserId
        );
        if (classification === "accepted") {
          await dependencies.commitAcceptedAtomically(outcome);
          return;
        }
        if (classification === "reconciliation_incomplete") {
          const reason =
            outcome.status === "stale" || outcome.status === "rejected"
              ? outcome.code
              : "invalid_accepted_outcome";
          await dependencies.markIncomplete(outcome.actionId, reason);
          return;
        }
        await dependencies.commitRecoveryAtomically({
          actionId: outcome.actionId,
          kind:
            classification === "stale_ready"
              ? "holding_stale"
              : "account_only_stale",
          outcome,
        });
      }
    );
  }
  return Object.freeze({ reconcile });
}
