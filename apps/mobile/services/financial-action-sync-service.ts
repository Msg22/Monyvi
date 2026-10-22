import type { FinancialActionFoundationRepository } from "./financial-action-foundation-repository";
import * as Crypto from "expo-crypto";
import {
  assertProtectedFinancialActionEnvelopeHash,
  assertReviewDefaultPredecessorsAccepted,
} from "./account-review-default-predecessors";
import { getCurrentUserId } from "./supabase";
import { parseFinancialActionEnvelopeJson } from "@monyvi/logic";
import { createAccountReviewFinancialRegistry } from "./account-review-financial-command-service";
import {
  runWithAccountSyncAckExclusion,
  assertAccountSyncAckScopeCurrent,
  type AccountSyncAckCapability,
  registerBoundFinancialActionTransition,
} from "./sync/account-sync-ack-scope";
import type { Database } from "@nozbe/watermelondb";

// Keep the existing production SHA-256 contract storage-free for injected
// coordinators. The account-balance production module constructs native SQLite
// at import, although this digest needs no database.
const productionFinancialActionHashProvider = {
  digestUtf8: (canonicalText: string): Promise<string> =>
    Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      canonicalText
    ),
};

type RetentionRuntime = typeof import("./account-review-retention-terminal");
type AcceptedReviewCleanup =
  RetentionRuntime["clearAcceptedAccountReviewPrivateEvidence"];

// Keep terminal retention behind the actual accepted Review cleanup boundary.
// Its existing atomic batch module imports native SQLite at module evaluation.
function clearAcceptedAccountReviewPrivateEvidence(
  input: Parameters<AcceptedReviewCleanup>[0]
): ReturnType<AcceptedReviewCleanup> {
  const terminal =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./account-review-retention-terminal") as RetentionRuntime;
  return terminal.clearAcceptedAccountReviewPrivateEvidence(input);
}

function getProductionDatabase(): Database {
  // This fallback is needed only by a real production action path, never
  // merely to import or construct an injected legacy coordinator.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { database } = require("@monyvi/db") as typeof import("@monyvi/db");
  return database;
}

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
  readonly foundationRepository: Pick<
    FinancialActionFoundationRepository,
    | "getFinancialActionGroup"
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
    candidates: readonly FinancialActionPushCandidate[],
    capability?: AccountSyncAckCapability
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
  readonly getFinancialActionGroup?: FinancialActionFoundationRepository["getFinancialActionGroup"];
  readonly database?: Database;
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

const FINANCIAL_REGISTRY = createAccountReviewFinancialRegistry();
function isAddTuple(value: { readonly payloadJson: string }): boolean {
  try {
    const envelope = parseFinancialActionEnvelopeJson(
      value.payloadJson,
      FINANCIAL_REGISTRY
    );
    return (
      envelope.domain === "accounts" &&
      envelope.kind === "create_with_default" &&
      envelope.payloadVersion === "account.create-default/v1"
    );
  } catch {
    return false;
  }
}
function boundRootProof(
  record: unknown,
  candidate: {
    readonly payloadJson: string;
    readonly payloadHash: string;
    readonly actionId?: string;
  }
): { readonly id: string; readonly ownerId: string } | null {
  if (!isObject(record)) return null;
  const id = record.id;
  const userId = record.userId;
  if (
    typeof id !== "string" ||
    typeof userId !== "string" ||
    record.payloadHash !== candidate.payloadHash ||
    record.payloadJson !== candidate.payloadJson ||
    ("actionId" in candidate && record.actionId !== candidate.actionId)
  )
    return null;
  return { id, ownerId: userId };
}
async function reassertBoundRoot(
  original: { readonly id: string; readonly ownerId: string },
  candidate: FinancialActionPushCandidate,
  load: NonNullable<
    FinancialActionPushCoordinatorDependencies["getFinancialActionGroup"]
  >,
  capability: AccountSyncAckCapability | undefined,
  currentDatabase: Database
): Promise<void> {
  if ((await getCurrentUserId()) !== original.ownerId) {
    fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
  }
  if (capability) {
    assertAccountSyncAckScopeCurrent(
      capability,
      currentDatabase,
      original.ownerId
    );
  }
  const reloaded = await load(candidate.actionId);
  const bound = boundRootProof(reloaded, candidate);
  if (!bound || bound.id !== original.id || bound.ownerId !== original.ownerId)
    fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
}

export function createFinancialActionSyncService(
  dependencies: FinancialActionSyncDependencies
): FinancialActionSyncService {
  return {
    syncAction: async (actionId: string): Promise<void> => {
      const database = getProductionDatabase();
      const record = assertSyncable(
        await dependencies.foundationRepository.getFinancialActionGroup(
          actionId
        )
      );
      if (isAddTuple(record)) {
        // Decorated Watermelon fields live on Model prototypes. Spreading the
        // instance omits payloadJson/payloadHash and falsely rejects this root.
        // Bind the exact immutable values BEFORE the awaited owner check so
        // later cache/getter drift cannot silently resample the original proof.
        const candidate: FinancialActionPushCandidate = {
          actionId,
          payloadJson: record.payloadJson,
          payloadHash: record.payloadHash,
          state: "local_complete",
        };
        const actor = await getCurrentUserId();
        const identity = boundRootProof(record, candidate);
        if (!actor || !identity || actor !== identity.ownerId)
          fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
        await runWithAccountSyncAckExclusion(
          database,
          actor,
          async (capability): Promise<void> => {
            const load =
              dependencies.foundationRepository.getFinancialActionGroup;
            await reassertBoundRoot(
              identity,
              candidate,
              load,
              capability,
              database
            );
            registerBoundFinancialActionTransition(
              capability,
              database,
              actor,
              {
                physicalRootId: identity.id,
                actionId,
                ownerId: actor,
                payloadHash: candidate.payloadHash,
                payloadJson: candidate.payloadJson,
              }
            );
            await executeOriginalAction(capability, identity, candidate);
          }
        );
        return;
      }
      await executeOriginalAction(undefined, null, null);

      async function executeOriginalAction(
        capability: AccountSyncAckCapability | undefined,
        bound: { readonly id: string; readonly ownerId: string } | null,
        candidate: FinancialActionPushCandidate | null
      ): Promise<void> {
        await assertProtectedFinancialActionEnvelopeHash(
          record,
          productionFinancialActionHashProvider
        );
        await assertReviewDefaultPredecessorsAccepted({
          root: record,
          database,
          hashProvider: productionFinancialActionHashProvider,
          loadOwnedRoot:
            dependencies.foundationRepository.getFinancialActionGroup,
        });
        if (bound && candidate)
          await reassertBoundRoot(
            bound,
            candidate,
            dependencies.foundationRepository.getFinancialActionGroup,
            capability,
            database
          );
        await dependencies.foundationRepository.markFinancialActionGroupSyncPending(
          actionId
        );
        // Recheck the durable immutable action and ancestry after awaits.
        const current = assertSyncable(
          await dependencies.foundationRepository.getFinancialActionGroup(
            actionId
          )
        );
        if (
          current.payloadHash !== record.payloadHash ||
          current.payloadJson !== record.payloadJson
        )
          fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
        await assertReviewDefaultPredecessorsAccepted({
          root: current,
          database,
          hashProvider: productionFinancialActionHashProvider,
          loadOwnedRoot:
            dependencies.foundationRepository.getFinancialActionGroup,
        });
        if (bound && candidate)
          await reassertBoundRoot(
            bound,
            candidate,
            dependencies.foundationRepository.getFinancialActionGroup,
            capability,
            database
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
        if (bound && candidate)
          await reassertBoundRoot(
            bound,
            candidate,
            dependencies.foundationRepository.getFinancialActionGroup,
            capability,
            database
          );
        await dependencies.foundationRepository.recordFinancialActionGroupServerOutcome(
          actionId,
          outcome.status,
          outcome.outcomeJson,
          outcome.code
        );
        if (
          (outcome.status === "accepted" || outcome.status === "idempotent") &&
          record.payloadJson.includes('"review.batch-save/v1"')
        )
          await clearAcceptedAccountReviewPrivateEvidence({
            database,
            actionId,
          });
      }
    },
  };
}

export function createFinancialActionPushCoordinator(
  dependencies: FinancialActionPushCoordinatorDependencies
): FinancialActionPushCoordinator {
  return Object.freeze({
    coordinatePush: async (
      candidates: readonly FinancialActionPushCandidate[],
      capability?: AccountSyncAckCapability
    ): Promise<{
      readonly decisions: readonly FinancialActionPushDecision[];
    }> => {
      const includesAdd = candidates.some(isAddTuple);
      if (!capability && includesAdd) {
        const owner = await getCurrentUserId();
        if (!owner) fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
        return runWithAccountSyncAckExclusion(
          dependencies.database ?? getProductionDatabase(),
          owner,
          (owned) =>
            createFinancialActionPushCoordinator(dependencies).coordinatePush(
              candidates,
              owned
            )
        );
      }
      const scopedDatabase =
        dependencies.database ?? (includesAdd ? getProductionDatabase() : null);
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
        const isAdd = isAddTuple(candidate);
        const originalOwned =
          isAdd && dependencies.getFinancialActionGroup
            ? await dependencies.getFinancialActionGroup(candidate.actionId)
            : null;
        const originalBinding = isAdd
          ? boundRootProof(originalOwned, candidate)
          : null;
        if (
          isAdd &&
          (!dependencies.getFinancialActionGroup || !originalBinding)
        )
          fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
        if (originalBinding && dependencies.getFinancialActionGroup) {
          await reassertBoundRoot(
            originalBinding,
            candidate,
            dependencies.getFinancialActionGroup,
            capability,
            scopedDatabase ?? getProductionDatabase()
          );
          if (capability) {
            registerBoundFinancialActionTransition(
              capability,
              scopedDatabase ?? getProductionDatabase(),
              originalBinding.ownerId,
              {
                physicalRootId: originalBinding.id,
                actionId: candidate.actionId,
                ownerId: originalBinding.ownerId,
                payloadHash: candidate.payloadHash,
                payloadJson: candidate.payloadJson,
              }
            );
          }
        }
        await assertProtectedFinancialActionEnvelopeHash(
          candidate,
          productionFinancialActionHashProvider
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
          const reconciliation = isAdd
            ? null
            : await reconcileSafely(candidate.actionId);
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
          if (
            !owned ||
            owned.payloadHash !== candidate.payloadHash ||
            owned.payloadJson !== candidate.payloadJson
          )
            fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
          await assertReviewDefaultPredecessorsAccepted({
            root: owned,
            database: dependencies.database ?? getProductionDatabase(),
            hashProvider: productionFinancialActionHashProvider,
            loadOwnedRoot: dependencies.getFinancialActionGroup,
          });
        }
        if (candidate.state !== "sync_pending") {
          if (originalBinding && dependencies.getFinancialActionGroup) {
            await reassertBoundRoot(
              originalBinding,
              candidate,
              dependencies.getFinancialActionGroup,
              capability,
              scopedDatabase ?? getProductionDatabase()
            );
          }
          await dependencies.markFinancialActionGroupSyncPending(
            candidate.actionId
          );
        }
        if (dependencies.getFinancialActionGroup) {
          const current = await dependencies.getFinancialActionGroup(
            candidate.actionId
          );
          if (
            !current ||
            current.payloadHash !== candidate.payloadHash ||
            current.payloadJson !== candidate.payloadJson
          )
            fail(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
          await assertReviewDefaultPredecessorsAccepted({
            root: current,
            database: dependencies.database ?? getProductionDatabase(),
            hashProvider: productionFinancialActionHashProvider,
            loadOwnedRoot: dependencies.getFinancialActionGroup,
          });
        }
        if (originalBinding && dependencies.getFinancialActionGroup) {
          await reassertBoundRoot(
            originalBinding,
            candidate,
            dependencies.getFinancialActionGroup,
            capability,
            scopedDatabase ?? getProductionDatabase()
          );
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
        if (originalBinding && dependencies.getFinancialActionGroup) {
          await reassertBoundRoot(
            originalBinding,
            candidate,
            dependencies.getFinancialActionGroup,
            capability,
            scopedDatabase ?? getProductionDatabase()
          );
        }
        await dependencies.recordFinancialActionGroupServerOutcome(
          candidate.actionId,
          outcome.status,
          outcome.outcomeJson,
          outcome.code
        );
        if (
          dependencies.getFinancialActionGroup &&
          candidate.payloadJson.includes('"review.batch-save/v1"') &&
          (outcome.status === "accepted" || outcome.status === "idempotent")
        )
          await clearAcceptedAccountReviewPrivateEvidence({
            database: dependencies.database ?? getProductionDatabase(),
            actionId: candidate.actionId,
          });
        const needsReconciliation =
          outcome.status === "stale" || outcome.status === "rejected";
        const reconciliation =
          needsReconciliation && !isAdd
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
