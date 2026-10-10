import type { MetalActionEvidence } from "@monyvi/db";
import type { LegacyDisposalBaseline } from "@monyvi/logic";
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
}

export interface ResolveLegacyDisposalBaselineInput {
  readonly assetId: string;
  readonly userId: string;
  readonly holdingState: LegacyDisposalBaselineHoldingState;
  readonly lifecycleEvents: readonly LegacyDisposalBaselineLifecycleEvent[];
  readonly terminalFacts: MetalTerminalFacts | null;
  readonly revisionEvidence: readonly LegacyDisposalRevisionEvidence[] | null;
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

export function resolveLegacyDisposalBaseline(
  input: ResolveLegacyDisposalBaselineInput
): LegacyDisposalBaseline | null {
  const revisionEvidence = (input.revisionEvidence ?? []).find(
    (candidate) =>
      !candidate.deleted &&
      candidate.userId === input.userId &&
      candidate.holdingId === input.assetId &&
      candidate.actionId === input.holdingState.effectiveActionId &&
      candidate.kind === "dispose" &&
      candidate.expectedHoldingRevision === "0" &&
      candidate.canonicalHoldingRevision === "1"
  );
  const terminalActionId = input.holdingState.effectiveActionId;
  const terminalEventId = input.holdingState.effectiveEventId;
  const terminalEvent = input.lifecycleEvents.find(
    (candidate) => candidate.id === terminalEventId
  );
  if (
    revisionEvidence === undefined ||
    terminalActionId === null ||
    terminalEventId === null ||
    terminalEvent === undefined ||
    input.terminalFacts === null ||
    input.terminalFacts.kind !== "disposed" ||
    input.terminalFacts.actionId !== terminalActionId ||
    input.holdingState.status !== "disposed" ||
    !input.holdingState.isVisible ||
    input.holdingState.userId !== input.userId ||
    input.holdingState.holdingId !== input.assetId ||
    terminalEvent.id !== terminalEventId ||
    terminalEvent.actionId !== terminalActionId ||
    terminalEvent.kind !== "dispose" ||
    terminalEvent.actionState !== "accepted" ||
    terminalEvent.isEffective !== true ||
    terminalEvent.isHistoryVisible !== true ||
    terminalEvent.predecessorEventId !== null ||
    (terminalEvent.reversesEventId ?? null) !== null ||
    input.lifecycleEvents.some((candidate) => candidate.kind === "add")
  ) {
    return null;
  }
  return { terminalEventId: terminalEvent.id };
}
