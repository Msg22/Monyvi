import type { FinancialActionFoundationRepository } from "./financial-action-foundation-repository";

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
  readonly disposition: "acknowledge" | "reject";
  readonly outcome: ParsedOutcome | null;
}

export interface FinancialActionPushCoordinator {
  readonly coordinatePush: (
    candidates: readonly FinancialActionPushCandidate[]
  ) => Promise<{ readonly decisions: readonly FinancialActionPushDecision[] }>;
}

export interface FinancialActionPushCoordinatorDependencies
  extends Pick<
    FinancialActionFoundationRepository,
    | "markFinancialActionGroupSyncFailed"
    | "markFinancialActionGroupSyncPending"
    | "recordFinancialActionGroupServerOutcome"
  > {
  readonly invokeAccountFinancialActionRpc: (
    input: FinancialActionRpcInput
  ) => Promise<unknown>;
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
      await dependencies.foundationRepository.markFinancialActionGroupSyncPending(
        actionId
      );
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
    },
  };
}

export function createFinancialActionPushCoordinator(
  dependencies: FinancialActionPushCoordinatorDependencies
): FinancialActionPushCoordinator {
  return Object.freeze({
    coordinatePush: async (
      candidates: readonly FinancialActionPushCandidate[]
    ): Promise<{ readonly decisions: readonly FinancialActionPushDecision[] }> => {
      const decisions: FinancialActionPushDecision[] = [];
      for (const candidate of candidates) {
        assertSyncable(candidate);
        if (candidate.state === "accepted") {
          decisions.push({
            actionId: candidate.actionId,
            disposition: "acknowledge",
            outcome: null,
          });
          continue;
        }
        if (candidate.state === "rejected_compensating") {
          decisions.push({
            actionId: candidate.actionId,
            disposition: "reject",
            outcome: null,
          });
          continue;
        }
        await dependencies.markFinancialActionGroupSyncPending(
          candidate.actionId
        );
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
        decisions.push({
          actionId: candidate.actionId,
          disposition:
            outcome.status === "accepted" || outcome.status === "idempotent"
              ? "acknowledge"
              : "reject",
          outcome,
        });
      }
      return { decisions: Object.freeze(decisions) };
    },
  });
}
