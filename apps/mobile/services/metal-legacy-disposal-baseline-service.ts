import type { MetalActionEvidence } from "@monyvi/db";
import type { LegacyDisposalBaseline } from "@monyvi/logic";
import {
  readMetalDisposeActionEnvelope,
  type MetalDisposeEventSnapshot,
  type MetalDisposeGroupSnapshot,
} from "@/services/metal-disposed-evidence-service";
import type { MetalDetailLifecycleEventRecord } from "@/services/metal-detail-read-model-shaping";
import type { MetalTerminalFacts } from "@/services/metal-terminal-read-model-service";

export interface LegacyDisposalRevisionEvidence {
  readonly actionId: string;
  readonly canonicalHoldingRevision: string | null;
  readonly deleted: boolean;
  readonly expectedHoldingRevision: string | null;
  readonly holdingId: string;
  readonly kind: string;
  readonly userId: string;
}

export interface LegacyDisposalBaselineHoldingState {
  readonly effectiveActionId?: string | null;
  readonly effectiveEventId?: string | null;
  readonly holdingId: string;
  readonly isVisible: boolean;
  readonly status: string;
  readonly userId: string;
}

export interface LegacyDisposalBaselineLifecycleEvent {
  readonly actionId?: string | null;
  readonly id: string;
  readonly kind: string;
  readonly predecessorEventId: string | null;
  readonly reversesEventId?: string | null;
  readonly isEffective?: boolean;
  readonly isHistoryVisible?: boolean;
  readonly actionState?: string | null;
  readonly payloadJson?: string;
  readonly occurredAt?: Date;
}

export interface LegacyDisposalActionEvidence {
  readonly event: MetalDisposeEventSnapshot & {
    readonly predecessorEventId: string | null;
    readonly reversesEventId: string | null;
    readonly isHistoryVisible: boolean;
    readonly occurredAt: Date;
  };
  readonly group: MetalDisposeGroupSnapshot | null;
}

function snapshotDisposalGroup(
  group: MetalDisposeGroupSnapshot
): MetalDisposeGroupSnapshot {
  return {
    actionId: group.actionId,
    deleted: group.deleted,
    domain: group.domain,
    domainReferenceId: group.domainReferenceId,
    kind: group.kind,
    outcomeJson: group.outcomeJson,
    payloadJson: group.payloadJson,
    rejectionCode: group.rejectionCode,
    serverOutcome: group.serverOutcome,
    state: group.state,
    userId: group.userId,
  };
}

export function toLegacyDisposalActionEvidence(
  events: readonly MetalDetailLifecycleEventRecord[],
  groups: readonly MetalDisposeGroupSnapshot[]
): readonly LegacyDisposalActionEvidence[] {
  return events
    .filter((event) => event.kind === "dispose")
    .map((event) => {
      const matchingGroups = groups.filter(
        (group) => group.actionId === event.actionId
      );
      return {
        event: {
          actionId: event.actionId,
          deleted: event.deleted,
          holdingId: event.holdingId,
          id: event.id,
          isEffective: event.isEffective,
          isHistoryVisible: event.isHistoryVisible,
          kind: event.kind,
          payloadJson: event.payloadJson,
          userId: event.userId,
          predecessorEventId: event.predecessorEventId,
          reversesEventId: event.reversesEventId,
          occurredAt: new Date(event.occurredAt.getTime()),
        },
        group:
          matchingGroups.length === 1
            ? snapshotDisposalGroup(matchingGroups[0])
            : null,
      };
    });
}

export interface ResolveLegacyDisposalBaselineInput {
  readonly assetId: string;
  readonly userId: string;
  readonly holdingState: LegacyDisposalBaselineHoldingState;
  readonly lifecycleEvents: readonly LegacyDisposalBaselineLifecycleEvent[];
  readonly terminalFacts: MetalTerminalFacts | null;
  readonly revisionEvidence: readonly LegacyDisposalRevisionEvidence[] | null;
  readonly actionEvidence?: readonly LegacyDisposalActionEvidence[] | null;
}

export function toLegacyDisposalRevisionEvidence(
  evidence: readonly MetalActionEvidence[]
): readonly LegacyDisposalRevisionEvidence[] {
  return evidence.map((candidate) => ({
    actionId: candidate.actionId,
    canonicalHoldingRevision: candidate.canonicalHoldingRevision,
    deleted: candidate.deleted,
    expectedHoldingRevision: candidate.expectedHoldingRevision,
    holdingId: candidate.holdingId,
    kind: candidate.kind,
    userId: candidate.userId,
  }));
}

function hasOwnedOriginalDisposalProof(
  input: ResolveLegacyDisposalBaselineInput,
  root: LegacyDisposalBaselineLifecycleEvent
): boolean {
  const matches = (input.actionEvidence ?? []).filter(
    ({ event }) => event.id === root.id && event.actionId === root.actionId
  );
  if (matches.length !== 1) return false;
  const { event, group } = matches[0];
  if (
    !event.isHistoryVisible ||
    event.predecessorEventId !== null ||
    event.reversesEventId !== null ||
    root.payloadJson !== event.payloadJson ||
    !Number.isFinite(event.occurredAt.getTime()) ||
    root.occurredAt?.getTime() !== event.occurredAt.getTime()
  )
    return false;
  const proof = readMetalDisposeActionEnvelope({
    event,
    group,
    holdingId: input.assetId,
    userId: input.userId,
  });
  if (!proof.available) return false;
  const payload = proof.envelope.payload;
  return (
    proof.envelope.occurredAt === event.occurredAt.toISOString() &&
    payload.expectedHoldingRevision === "0" &&
    payload.holdingId === input.assetId &&
    payload.predecessorEventId === null &&
    payload.reversesEventId === null
  );
}

export function resolveLegacyDisposalBaseline(
  input: ResolveLegacyDisposalBaselineInput
): LegacyDisposalBaseline | null {
  // Legacy lineage is proved by the original owned 0 -> 1 Dispose, not by
  // the current head. The lifecycle reducer validates every later successor.
  if (
    !input.holdingState.isVisible ||
    input.holdingState.userId !== input.userId ||
    input.holdingState.holdingId !== input.assetId ||
    input.lifecycleEvents.some((candidate) => candidate.kind === "add")
  ) {
    return null;
  }

  const roots = input.lifecycleEvents.filter(
    (event) =>
      event.kind === "dispose" &&
      (event.actionState === "accepted" || event.actionState === undefined) &&
      event.isEffective === true &&
      event.isHistoryVisible === true &&
      event.predecessorEventId === null &&
      (event.reversesEventId ?? null) === null &&
      hasOwnedOriginalDisposalProof(input, event) &&
      (input.revisionEvidence ?? []).some(
        (candidate) =>
          !candidate.deleted &&
          candidate.userId === input.userId &&
          candidate.holdingId === input.assetId &&
          candidate.actionId === event.actionId &&
          candidate.kind === "dispose" &&
          candidate.expectedHoldingRevision === "0" &&
          candidate.canonicalHoldingRevision === "1"
      )
  );
  const [root] = roots;
  return roots.length === 1 && root !== undefined
    ? { terminalEventId: root.id }
    : null;
}
