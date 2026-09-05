import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";

import {
  assertCanonicalMetalRevision,
  incrementCanonicalMetalRevision,
} from "./metal-financial-action-adapter";
import { findOwnedById, queryChildrenOfOwnedParent } from "./user-data-access";
import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";

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
        readonly accountRevisions: ReadonlyArray<{
          readonly accountId: string;
          readonly revision: string;
        }>;
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

type AcceptedMetalRpcOutcome = Extract<
  MetalRpcOutcome,
  { readonly status: "accepted" | "idempotent" }
>;

function isAcceptedMetalRpcOutcome(
  outcome: MetalRpcOutcome
): outcome is AcceptedMetalRpcOutcome {
  return outcome.status === "accepted" || outcome.status === "idempotent";
}

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
    accountIds.every((value, index) => {
      const previous = accountIds[index - 1];
      return index === 0 || (previous !== undefined && previous < value);
    }) &&
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

type RpcOutcomeCommitResult = "accepted" | "reconciled" | "incomplete";

async function findOwnedByActionId<T extends Model & { actionId: string }>(
  database: Database,
  table: string,
  actionId: string,
  userId: string
): Promise<T | null> {
  const rows = await database
    .get<T>(table)
    .query(Q.where("action_id", actionId), Q.where("user_id", userId))
    .fetch();
  return rows[0] ?? null;
}

function outcomeJson(outcome: MetalRpcOutcome): string {
  const {
    payloadHashMatches: _payloadHashMatches,
    userId: _userId,
    ...value
  } = outcome;
  return JSON.stringify(value);
}

function restoreCorrectionAsset(
  asset: Asset,
  payload: Readonly<Record<string, unknown>>
): void {
  const correction = payload.materialCorrection as Readonly<
    Record<string, unknown>
  > | null;
  const metadata = payload.metadataChange as Readonly<
    Record<string, unknown>
  > | null;
  const before = correction?.before as
    | Readonly<Record<string, unknown>>
    | undefined;
  const metadataBefore = metadata?.before as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (before) {
    if (typeof before.purchaseCurrency === "string") {
      asset.currency = before.purchaseCurrency as Asset["currency"];
    }
    asset.purchaseCurrency = before.purchaseCurrency as string | null;
    asset.purchaseDate = new Date(
      `${String(before.purchaseDate)}T00:00:00.000Z`
    );
    if (typeof before.purchasePriceDecimal === "string") {
      asset.purchasePrice = Number(before.purchasePriceDecimal);
    }
    asset.purchasePriceDecimal = before.purchasePriceDecimal as string | null;
  }
  if (metadataBefore) {
    asset.name = metadataBefore.name as string;
    asset.notes = (metadataBefore.notes as string | null) ?? undefined;
  }
}

function restoreCorrectionMetal(
  metal: AssetMetal,
  payload: Readonly<Record<string, unknown>>
): void {
  const correction = payload.materialCorrection as Readonly<
    Record<string, unknown>
  > | null;
  const before = correction?.before as
    | Readonly<Record<string, unknown>>
    | undefined;
  if (!before) return;
  metal.itemForm = (before.physicalForm as string | null) ?? undefined;
  metal.purityCatalogVersion = before.purityCatalogVersion as string | null;
  metal.purityCode = before.purityCode as string | null;
  metal.purityFactorDecimal = before.purityFactorDecimal as string | null;
  if (typeof before.purityFactorDecimal === "string") {
    metal.purityFraction = Number(before.purityFactorDecimal);
  }
  if (typeof before.weightGramsDecimal === "string") {
    metal.weightGrams = Number(before.weightGramsDecimal);
  }
  metal.weightGramsDecimal = before.weightGramsDecimal as string | null;
}

async function commitAcceptedOutcome(
  database: Database,
  outcome: Extract<MetalRpcOutcome, { status: "accepted" | "idempotent" }>,
  userId: string
): Promise<RpcOutcomeCommitResult> {
  assertCanonicalMetalRevision(outcome.holdingRevision);
  const [root, evidence] = await Promise.all([
    findOwnedByActionId<FinancialActionGroup>(
      database,
      "financial_action_groups",
      outcome.actionId,
      userId
    ),
    findOwnedByActionId<MetalActionEvidence>(
      database,
      "metal_action_evidence",
      outcome.actionId,
      userId
    ),
  ]);
  if (!root || !evidence) throw new Error("incomplete_metal_action_group");
  const states = await database
    .get<MetalHoldingState>("metal_holding_states")
    .query(
      Q.where("holding_id", root.domainReferenceId),
      Q.where("user_id", userId)
    )
    .fetch();
  const state = states[0];
  const expectedCanonicalRevision =
    evidence.expectedHoldingRevision === null
      ? "0"
      : incrementCanonicalMetalRevision(evidence.expectedHoldingRevision);
  if (
    !state ||
    outcome.effectiveEventId !== outcome.actionId ||
    outcome.holdingRevision !== expectedCanonicalRevision
  ) {
    throw new Error("invalid_accepted_metal_outcome");
  }
  const isCurrentAction = state.effectiveActionId === outcome.actionId;
  if (
    root.state === "accepted" &&
    evidence.canonicalHoldingRevision === outcome.holdingRevision &&
    (!isCurrentAction || state.reconciliationState === "accepted")
  ) {
    return "accepted";
  }
  const updatedModels = isCurrentAction
    ? [root, evidence, state]
    : [root, evidence];
  const snapshots = updatedModels.map(captureCachedModelSnapshot);
  try {
    const now = new Date();
    const operations: Model[] = [
      root.prepareUpdate((row) => {
        row.state = "accepted";
        row.serverOutcome = outcome.status;
        row.outcomeJson = outcomeJson(outcome);
        row.rejectionCode = null;
        row.updatedAt = now;
      }),
      evidence.prepareUpdate((row) => {
        row.canonicalHoldingRevision = outcome.holdingRevision;
        row.updatedAt = now;
      }),
    ];
    if (isCurrentAction) {
      operations.push(
        state.prepareUpdate((row) => {
          row.reconciliationState = "accepted";
          row.updatedAt = now;
        })
      );
    }
    await database.batch(...operations);
    return "accepted";
  } catch (error) {
    snapshots.forEach(restoreCachedModelSnapshot);
    throw error;
  }
}

async function commitNonAcceptedOutcome(
  database: Database,
  outcome: Extract<MetalRpcOutcome, { status: "stale" | "rejected" }>,
  userId: string
): Promise<RpcOutcomeCommitResult> {
  const [root, evidence, event] = await Promise.all([
    findOwnedByActionId<FinancialActionGroup>(
      database,
      "financial_action_groups",
      outcome.actionId,
      userId
    ),
    findOwnedByActionId<MetalActionEvidence>(
      database,
      "metal_action_evidence",
      outcome.actionId,
      userId
    ),
    findOwnedByActionId<MetalLifecycleEvent>(
      database,
      "metal_lifecycle_events",
      outcome.actionId,
      userId
    ),
  ]);
  if (!root || !evidence || !event)
    throw new Error("incomplete_metal_action_group");
  const envelope = JSON.parse(root.payloadJson) as {
    readonly kind: string;
    readonly payload: Readonly<Record<string, unknown>>;
  };
  const states = await database
    .get<MetalHoldingState>("metal_holding_states")
    .query(
      Q.where("holding_id", root.domainReferenceId),
      Q.where("user_id", userId)
    )
    .fetch();
  const state = states[0];
  if (!state) throw new Error("incomplete_metal_action_group");
  const serializedOutcome = outcomeJson(outcome);
  if (
    root.serverOutcome === outcome.status &&
    root.outcomeJson === serializedOutcome &&
    root.rejectionCode === outcome.code &&
    (root.state === "reconciled" || root.state === "reconciliation_incomplete")
  ) {
    return root.state === "reconciled" ? "reconciled" : "incomplete";
  }
  const isCurrentAction = state.effectiveActionId === outcome.actionId;
  const reversedEvent =
    outcome.status === "rejected" &&
    envelope.kind === "undo" &&
    typeof envelope.payload.reversesEventId === "string"
      ? await findOwnedByActionId<MetalLifecycleEvent>(
          database,
          "metal_lifecycle_events",
          envelope.payload.reversesEventId,
          userId
        )
      : null;
  const canRestorePrior =
    outcome.status === "rejected" &&
    isCurrentAction &&
    envelope.kind !== "add" &&
    (envelope.kind !== "correct" || envelope.payload.metadataChange === null) &&
    (envelope.kind !== "undo" ||
      reversedEvent?.kind === "sell" ||
      reversedEvent?.kind === "dispose");
  let asset: Asset | null = null;
  let metal: AssetMetal | null = null;
  if (canRestorePrior && envelope.kind === "correct") {
    asset = await findOwnedById(
      database.get<Asset>("assets"),
      root.domainReferenceId,
      userId
    );
    const metals = await queryChildrenOfOwnedParent(
      database.get<AssetMetal>("asset_metals"),
      asset,
      userId,
      "asset_id"
    ).fetch();
    metal = metals[0] ?? null;
    if (!metal) throw new Error("incomplete_metal_action_group");
  }
  const models = [
    root,
    evidence,
    event,
    ...(isCurrentAction ? [state] : []),
    asset,
    metal,
  ].filter((model) => model !== null);
  const snapshots = models.map(captureCachedModelSnapshot);
  try {
    const now = new Date();
    const operations: Model[] = [
      root.prepareUpdate((row) => {
        row.state = canRestorePrior
          ? "reconciled"
          : "reconciliation_incomplete";
        row.serverOutcome = outcome.status;
        row.outcomeJson = serializedOutcome;
        row.rejectionCode = outcome.code;
        row.updatedAt = now;
      }),
      event.prepareUpdate((row) => {
        row.isEffective = false;
        row.updatedAt = now;
      }),
    ];
    if (isCurrentAction) {
      operations.push(
        state.prepareUpdate((row) => {
          if (canRestorePrior) {
            row.effectiveActionId = envelope.payload.predecessorEventId as
              | string
              | null;
            row.effectiveEventId = envelope.payload.predecessorEventId as
              | string
              | null;
            row.financialRevision = envelope.payload
              .expectedHoldingRevision as string;
            row.isVisible = true;
            row.status =
              envelope.kind === "undo" && reversedEvent?.kind === "sell"
                ? "sold"
                : envelope.kind === "undo" && reversedEvent?.kind === "dispose"
                  ? "disposed"
                  : "active";
          } else {
            row.isVisible = false;
          }
          row.reconciliationState = canRestorePrior
            ? "reconciled"
            : "reconciliation_incomplete";
          row.updatedAt = now;
        })
      );
    }
    if (asset && metal) {
      operations.push(
        asset.prepareUpdate((row) => {
          restoreCorrectionAsset(row, envelope.payload);
          row.updatedAt = now;
        }),
        metal.prepareUpdate((row) => {
          restoreCorrectionMetal(row, envelope.payload);
          row.updatedAt = now;
        })
      );
    }
    await database.batch(...operations);
    return canRestorePrior ? "reconciled" : "incomplete";
  } catch (error) {
    snapshots.forEach(restoreCachedModelSnapshot);
    throw error;
  }
}

export async function commitMetalRpcOutcomeLocally(
  database: Database,
  outcome: MetalRpcOutcome,
  expectedUserId: string
): Promise<RpcOutcomeCommitResult> {
  if (outcome.userId !== expectedUserId || !outcome.payloadHashMatches) {
    throw new Error("invalid_metal_rpc_outcome");
  }
  return database.write(() => {
    if (isAcceptedMetalRpcOutcome(outcome)) {
      return commitAcceptedOutcome(database, outcome, expectedUserId);
    }
    return commitNonAcceptedOutcome(database, outcome, expectedUserId);
  });
}
