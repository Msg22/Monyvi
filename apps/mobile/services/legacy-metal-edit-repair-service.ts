import { Q, type Database } from "@nozbe/watermelondb";
import type {
  FinancialActionGroup,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";

import {
  getCurrentUserDataScope,
  type CurrentUserDataScope,
} from "./user-data-access";

const LEGACY_CORRECTION_KIND = "corrected";
const CANONICAL_CORRECTION_KIND = "correct";

const PENDING_STATES: ReadonlySet<string> = new Set([
  "pending_local",
  "local_complete",
  "sync_pending",
  "sync_failed",
]);

export type LegacyEditRepairSkipReason =
  | "superseded"
  | "chained_successor"
  | "missing_predecessor"
  | "ambiguous"
  | "malformed";

export interface LegacyEditRepairSkip {
  readonly actionId: string;
  readonly reason: LegacyEditRepairSkipReason;
}

export interface LegacyEditRepairResult {
  readonly repaired: number;
  readonly skipped: readonly LegacyEditRepairSkip[];
}

interface CorrectionTarget {
  readonly correctionEvent: MetalLifecycleEvent;
  readonly predecessor: MetalLifecycleEvent;
}

type RepairDecision =
  | { readonly kind: "repair"; readonly target: CorrectionTarget }
  | { readonly kind: "noop" }
  | { readonly kind: "skip"; readonly reason: LegacyEditRepairSkipReason };

async function readRepairDecision(
  database: Database,
  scope: CurrentUserDataScope,
  root: FinancialActionGroup
): Promise<RepairDecision> {
  const correctionEvents = await scope
    .queryOwned(
      database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
      Q.where("action_id", root.actionId),
      Q.where("deleted", false)
    )
    .fetch();

  const legacy = correctionEvents.filter(
    (event) => event.kind === LEGACY_CORRECTION_KIND
  );
  if (legacy.length === 0) return { kind: "noop" };
  if (legacy.length > 1) return { kind: "skip", reason: "ambiguous" };
  const correctionEvent = legacy[0];

  const states = await scope
    .queryOwned(
      database.get<MetalHoldingState>("metal_holding_states"),
      Q.where("holding_id", root.domainReferenceId),
      Q.where("deleted", false)
    )
    .fetch();
  if (states.length !== 1) return { kind: "skip", reason: "ambiguous" };
  const state = states[0];

  if (
    state.effectiveEventId !== correctionEvent.id ||
    state.effectiveActionId !== root.actionId
  ) {
    return { kind: "skip", reason: "superseded" };
  }

  const chainedSuccessors = await scope
    .queryOwned(
      database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
      Q.where("predecessor_event_id", correctionEvent.id),
      Q.where("deleted", false)
    )
    .fetch();
  if (chainedSuccessors.length > 0) {
    return { kind: "skip", reason: "chained_successor" };
  }

  const predecessorId = correctionEvent.predecessorEventId;
  if (predecessorId === null) {
    return { kind: "skip", reason: "missing_predecessor" };
  }

  const predecessors = await scope
    .queryOwned(
      database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
      Q.where("id", predecessorId),
      Q.where("deleted", false)
    )
    .fetch();
  if (predecessors.length !== 1) {
    return { kind: "skip", reason: "missing_predecessor" };
  }
  const predecessor = predecessors[0];

  return { kind: "repair", target: { correctionEvent, predecessor } };
}

/**
 * Repair pending legacy Edit corrections persisted before the Edit writer was
 * fixed: those rows stored lifecycle kind `corrected` (canonical is `correct`)
 * and flipped the accepted predecessor event to ineffective, which breaks the
 * detail read model and dedicated sync after restart.
 *
 * Safety: never touches a root with a non-null `server_outcome` (accepted /
 * idempotent / stale / rejected server evidence) and never rewrites a chained
 * or superseded hashed action. Unsafe chains are reported via the returned
 * `skipped` list and left untouched.
 */
export async function repairLegacyMetalEdits(
  database: Database,
  userId: string
): Promise<LegacyEditRepairResult> {
  const scope = await getCurrentUserDataScope();
  if (scope.userId !== userId) throw new Error("sync_push_auth_scope_lost");

  const roots = await scope
    .queryOwned(
      database.get<FinancialActionGroup>("financial_action_groups"),
      Q.where("domain", "metals"),
      Q.where("kind", "correct"),
      Q.where("deleted", false)
    )
    .fetch();

  let repaired = 0;
  const skipped: LegacyEditRepairSkip[] = [];

  for (const root of roots) {
    if (root.serverOutcome !== null) continue;
    if (!PENDING_STATES.has(root.state)) continue;

    try {
      await database.write(async (): Promise<void> => {
        const decision = await readRepairDecision(database, scope, root);
        if (decision.kind === "repair") {
          const correctionUpdatedAt = decision.target.correctionEvent.updatedAt;
          const predecessorUpdatedAt = decision.target.predecessor.updatedAt;
          await decision.target.correctionEvent.update((record): void => {
            record.kind = CANONICAL_CORRECTION_KIND;
            record.updatedAt = correctionUpdatedAt;
          });
          if (!decision.target.predecessor.isEffective) {
            await decision.target.predecessor.update((record): void => {
              record.isEffective = true;
              record.updatedAt = predecessorUpdatedAt;
            });
          }
          repaired += 1;
        } else if (decision.kind === "skip") {
          skipped.push({ actionId: root.actionId, reason: decision.reason });
        }
      });
    } catch {
      skipped.push({ actionId: root.actionId, reason: "malformed" });
    }
  }

  return { repaired, skipped };
}
