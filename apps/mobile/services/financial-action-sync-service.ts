import type { FinancialActionFoundationRepository } from "./financial-action-foundation-repository";
import { database } from "@monyvi/db";
import { productionFinancialActionHashProvider } from "./account-balance-command-production";
import {
  assertProtectedFinancialActionEnvelopeHash,
  assertReviewDefaultPredecessorsAccepted,
} from "./account-review-default-predecessors";
import { clearAcceptedAccountReviewPrivateEvidence } from "./account-review-retention-terminal";

export const FINANCIAL_ACTION_SYNC_ERROR_CODES = {
  INVALID_OUTCOME: "financial_action_sync_invalid_outcome",
  NOT_FOUND: "financial_action_sync_not_found",
  TRANSPORT_FAILED: "financial_action_sync_transport_failed",
} as const;

interface FinancialActionRpcInput {
  readonly payloadHash: string;
  readonly payloadJson: string;
}

export interface FinancialActionSyncDependencies {
  readonly foundationRepository: {
    readonly getFinancialActionGroup: (actionId: string) => Promise<{
      readonly payloadHash: string;
      readonly payloadJson: string;
    } | null>;
  } & Pick<
    FinancialActionFoundationRepository,
    | "markFinancialActionGroupSyncFailed"
    | "markFinancialActionGroupSyncPending"
    | "recordFinancialActionGroupServerOutcome"
  >;
  readonly invokeAccountFinancialActionRpc: (
    input: FinancialActionRpcInput
  ) => Promise<unknown>;
}

export interface FinancialActionSyncService {
  readonly syncAction: (actionId: string) => Promise<void>;
}

interface ParsedOutcome {
  readonly actionId: string;
  readonly code: string | null;
  readonly outcomeJson: string;
  readonly status: "accepted" | "idempotent" | "stale" | "rejected";
}

export interface FinancialActionPushCandidate {
  readonly actionId: string;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly state: string;
}

export interface FinancialActionPushDecision {
  readonly actionId: string;
  readonly disposition: "acknowledge" | "recover" | "reject";
  readonly outcome: ParsedOutcome | null;
}

export interface FinancialActionPushCoordinator {
  readonly coordinatePush: (
    candidates: readonly FinancialActionPushCandidate[]
  ) => Promise<{ readonly decisions: readonly FinancialActionPushDecision[] }>;
}

export interface FinancialActionPushCoordinatorDependencies extends Pick<
  FinancialActionFoundationRepository,
  | "markFinancialActionGroupSyncFailed"
  | "markFinancialActionGroupSyncPending"
  | "recordFinancialActionGroupServerOutcome"
> {
  readonly invokeAccountFinancialActionRpc: (
    input: FinancialActionRpcInput
  ) => Promise<unknown>;
  readonly reconcileFinancialActionGroup?: (
    actionId: string
  ) => Promise<"incomplete" | "reconciled" | "replay">;
  /** Production protected push always supplies the owned-root lookup. */
  readonly getFinancialActionGroup?: FinancialActionFoundationRepository[
    "getFinancialActionGroup"
  ];
}

function fail(code: string): never {
  throw new Error(code);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (!isObject(value)) fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function parseOutcome(value: unknown, expectedActionId: string): ParsedOutcome {
  if (!isObject(value) || value.actionId !== expectedActionId) {
    fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
  }
  const status = value.status;
  if (
    status !== "accepted" &&
    status !== "idempotent" &&
    status !== "stale" &&
    status !== "rejected"
  )
    fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
  const code = value.code;
  if (
    ((status === "accepted" || status === "idempotent") &&
      code !== undefined &&
      code !== null) ||
    ((status === "stale" || status === "rejected") &&
      (typeof code !== "string" || code.trim().length === 0))
  )
    fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
  return {
    actionId: expectedActionId,
    code: typeof code === "string" ? code : null,
    outcomeJson: canonicalJson(value),
    status,
  };
}

function assertSyncable<
  TRecord extends {
    readonly payloadHash: string;
    readonly payloadJson: string;
  },
>(record: TRecord | null): TRecord {
  if (!record) fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.NOT_FOUND);
  if (record.payloadHash.length !== 64 || record.payloadJson.length === 0) {
    fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
  }
  return record;
}

export function createFinancialActionSyncService(
  dependencies: FinancialActionSyncDependencies
): FinancialActionSyncService {
  return {
    syncAction: async (actionId: string): Promise<void> => {
      const record = assertSyncable(
        await dependencies.foundationRepository.getFinancialActionGroup(
          actionId
        )
      );
      await assertProtectedFinancialActionEnvelopeHash(
        record, productionFinancialActionHashProvider
      );
      await assertReviewDefaultPredecessorsAccepted({
        root: record,
        database,
        hashProvider: productionFinancialActionHashProvider,
        loadOwnedRoot: dependencies.foundationRepository.getFinancialActionGroup,
      });
      await dependencies.foundationRepository.markFinancialActionGroupSyncPending(
        actionId
      );
      // Recheck the durable immutable action and ancestry after awaits.
      const current = assertSyncable(
        await dependencies.foundationRepository.getFinancialActionGroup(actionId)
      );
      if (current.payloadHash !== record.payloadHash ||
          current.payloadJson !== record.payloadJson)
        fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
      await assertReviewDefaultPredecessorsAccepted({
        root: current,
        database,
        hashProvider: productionFinancialActionHashProvider,
        loadOwnedRoot: dependencies.foundationRepository.getFinancialActionGroup,
      });
      let rawOutcome: unknown;
      try {
        rawOutcome = await dependencies.invokeAccountFinancialActionRpc({
          payloadHash: record.payloadHash,
          payloadJson: record.payloadJson,
        });
      } catch (error) {
        await dependencies.foundationRepository.markFinancialActionGroupSyncFailed(
          actionId,
          FINANCIAL_ACTION_SYNC_ERROR_CODES.TRANSPORT_FAILED
        );
        throw error;
      }
      const outcome = parseOutcome(rawOutcome, actionId);
      await dependencies.foundationRepository.recordFinancialActionGroupServerOutcome(
        actionId,
        outcome.status,
        outcome.outcomeJson,
        outcome.code
      );
      if ((outcome.status === "accepted" || outcome.status === "idempotent") &&
          record.payloadJson.includes('"review.batch-save/v1"'))
        await clearAcceptedAccountReviewPrivateEvidence({ database, actionId });
    },
  };
}

export function createFinancialActionPushCoordinator(
  dependencies: FinancialActionPushCoordinatorDependencies
): FinancialActionPushCoordinator {
  return Object.freeze({
    coordinatePush: async (
      candidates: readonly FinancialActionPushCandidate[]
    ): Promise<{
      readonly decisions: readonly FinancialActionPushDecision[];
    }> => {
      const reconcileSafely = async (
        actionId: string
      ): Promise<string | null | undefined> => {
        try {
          return await dependencies.reconcileFinancialActionGroup?.(actionId);
        } catch {
          return undefined;
        }
      };
      const decisions: FinancialActionPushDecision[] = [];
      for (const candidate of candidates) {
        assertSyncable(candidate);
        await assertProtectedFinancialActionEnvelopeHash(
          candidate, productionFinancialActionHashProvider
        );
        if (candidate.state === "accepted") {
          decisions.push({
            actionId: candidate.actionId,
            disposition: "acknowledge",
            outcome: null,
          });
          continue;
        }
        if (candidate.state === "reconciled") {
          decisions.push({
            actionId: candidate.actionId,
            disposition: "acknowledge",
            outcome: null,
          });
          continue;
        }
        if (
          candidate.state === "rejected_compensating" ||
          candidate.state === "reconciliation_incomplete"
        ) {
          const reconciliation = await reconcileSafely(candidate.actionId);
          decisions.push({
            actionId: candidate.actionId,
            disposition:
              reconciliation === "reconciled" || reconciliation === "replay"
                ? "acknowledge"
                : "recover",
            outcome: null,
          });
          continue;
        }
        if (dependencies.getFinancialActionGroup) {
          const owned = await dependencies.getFinancialActionGroup(
            candidate.actionId
          );
          if (!owned ||
              owned.payloadHash !== candidate.payloadHash ||
              owned.payloadJson !== candidate.payloadJson)
            fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
          await assertReviewDefaultPredecessorsAccepted({
            root: owned,
            database,
            hashProvider: productionFinancialActionHashProvider,
            loadOwnedRoot: dependencies.getFinancialActionGroup,
          });
        }
        if (candidate.state !== "sync_pending") {
          await dependencies.markFinancialActionGroupSyncPending(
            candidate.actionId
          );
        }
        if (dependencies.getFinancialActionGroup) {
          const current = await dependencies.getFinancialActionGroup(
            candidate.actionId
          );
          if (!current ||
              current.payloadHash !== candidate.payloadHash ||
              current.payloadJson !== candidate.payloadJson)
            fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
          await assertReviewDefaultPredecessorsAccepted({
            root: current,
            database,
            hashProvider: productionFinancialActionHashProvider,
            loadOwnedRoot: dependencies.getFinancialActionGroup,
          });
        }
        let rawOutcome: unknown;
        try {
          rawOutcome = await dependencies.invokeAccountFinancialActionRpc({
            payloadHash: candidate.payloadHash,
            payloadJson: candidate.payloadJson,
          });
        } catch (error) {
          await dependencies.markFinancialActionGroupSyncFailed(
            candidate.actionId,
            FINANCIAL_ACTION_SYNC_ERROR_CODES.TRANSPORT_FAILED
          );
          throw error;
        }
        const outcome = parseOutcome(rawOutcome, candidate.actionId);
        await dependencies.recordFinancialActionGroupServerOutcome(
          candidate.actionId,
          outcome.status,
          outcome.outcomeJson,
          outcome.code
        );
        if (dependencies.getFinancialActionGroup &&
            candidate.payloadJson.includes('"review.batch-save/v1"') &&
            (outcome.status === "accepted" || outcome.status === "idempotent"))
          await clearAcceptedAccountReviewPrivateEvidence({
            database, actionId: candidate.actionId,
          });
        const needsReconciliation =
          outcome.status === "stale" || outcome.status === "rejected";
        const reconciliation = needsReconciliation
          ? await reconcileSafely(candidate.actionId)
          : null;
        decisions.push({
          actionId: candidate.actionId,
          disposition:
            outcome.status === "accepted" ||
            outcome.status === "idempotent" ||
            reconciliation === "reconciled" ||
            reconciliation === "replay"
              ? "acknowledge"
              : needsReconciliation
                ? "recover"
                : "reject",
          outcome,
        });
      }
      return { decisions: Object.freeze(decisions) };
    },
  });
}
