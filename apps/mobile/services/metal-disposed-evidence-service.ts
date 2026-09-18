import {
  assertFinancialActionStateEvidence,
  parseFinancialActionEnvelopeJson,
  type CanonicalJsonValue,
  type FinancialActionServerOutcome,
  type FinancialActionState,
} from "@monyvi/logic";

const REPORTABLE_RECONCILIATION_STATES: readonly string[] = Object.freeze([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
]);

export type MetalDisposalReason =
  | "lost_or_stolen"
  | "destroyed_or_damaged"
  | "given_away"
  | "donated"
  | "other";

export type MetalDisposalTreatment = "write_off" | "external_transfer";

export interface MetalDisposedEvidence {
  readonly actionId: string;
  readonly disposalDate: string;
  readonly holdingId: string;
  readonly notes: string | null;
  readonly reason: MetalDisposalReason;
  readonly treatment: MetalDisposalTreatment;
}

export type MetalDisposedEvidenceUnavailableReason =
  | "excluded_disposal"
  | "foreign_disposal_evidence"
  | "invalid_disposal_evidence"
  | "unsupported_disposal_evidence";

export type MetalDisposedEvidenceOutcome =
  | { readonly available: true; readonly value: MetalDisposedEvidence }
  | {
      readonly available: false;
      readonly reason: MetalDisposedEvidenceUnavailableReason;
    };

export interface MetalDisposeHoldingSnapshot {
  readonly effectiveActionId: string | null;
  readonly effectiveEventId: string | null;
  readonly holdingId: string;
  readonly isVisible: boolean;
  readonly reconciliationState: string;
  readonly status: string;
  readonly userId: string;
}

export interface MetalDisposeEventSnapshot {
  readonly actionId: string;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly id: string;
  readonly isEffective: boolean;
  readonly kind: string;
  readonly payloadJson: string;
  readonly userId: string;
}

export interface MetalDisposeGroupSnapshot {
  readonly actionId: string;
  readonly deleted: boolean;
  readonly domain: string;
  readonly domainReferenceId: string;
  readonly kind: string;
  readonly outcomeJson: string | null;
  readonly payloadJson: string;
  readonly rejectionCode: string | null;
  readonly serverOutcome: string | null;
  readonly state: string;
  readonly userId: string;
}

export interface MetalDisposedEvidenceInput {
  readonly event: MetalDisposeEventSnapshot | null;
  readonly group: MetalDisposeGroupSnapshot | null;
  readonly holding: MetalDisposeHoldingSnapshot;
  readonly latestAllowedCalendarDate?: string;
  readonly userId: string;
}

interface ShapedDisposalReason {
  readonly reason: MetalDisposalReason;
  readonly treatment: MetalDisposalTreatment;
}

export function shapeMetalDisposedEvidence(
  input: MetalDisposedEvidenceInput
): MetalDisposedEvidenceOutcome {
  const exclusion = classifyDisposalExclusion(input);
  if (exclusion !== null) return { available: false, reason: exclusion };
  const { event, group, holding } = input;
  if (event === null || group === null) {
    return { available: false, reason: "excluded_disposal" };
  }

  let envelope;
  try {
    envelope = parseFinancialActionEnvelopeJson(group.payloadJson, undefined, {
      latestAllowedCalendarDate: input.latestAllowedCalendarDate,
    });
  } catch {
    return { available: false, reason: "unsupported_disposal_evidence" };
  }

  if (
    envelope.envelopeVersion !== "monyvi.financial-action/v1" ||
    envelope.payloadVersion !== "metals.dispose/v1" ||
    envelope.actionId !== group.actionId ||
    envelope.actionId !== event.actionId ||
    envelope.domain !== "metals" ||
    envelope.domain !== group.domain ||
    envelope.kind !== "dispose" ||
    envelope.kind !== group.kind ||
    envelope.domainReferenceId !== holding.holdingId ||
    envelope.domainReferenceId !== group.domainReferenceId ||
    envelope.userId !== input.userId ||
    envelope.accountGuards.length !== 0
  ) {
    return { available: false, reason: "invalid_disposal_evidence" };
  }

  const eventPayload = parseJsonValue(event.payloadJson);
  if (
    eventPayload === null ||
    canonicalJson(eventPayload) !== canonicalJson(envelope.payload)
  ) {
    return { available: false, reason: "invalid_disposal_evidence" };
  }

  const payload = envelope.payload;
  const reason = shapeReason(payload.reason);
  if (
    reason === null ||
    typeof payload.disposalDate !== "string" ||
    (typeof payload.notes !== "string" && payload.notes !== null)
  ) {
    return { available: false, reason: "invalid_disposal_evidence" };
  }

  return {
    available: true,
    value: {
      actionId: event.actionId,
      disposalDate: payload.disposalDate,
      holdingId: holding.holdingId,
      notes: payload.notes,
      ...reason,
    },
  };
}

function classifyDisposalExclusion(
  input: MetalDisposedEvidenceInput
): MetalDisposedEvidenceUnavailableReason | null {
  const { event, group, holding, userId } = input;
  if (
    holding.userId !== userId ||
    (event !== null && event.userId !== userId) ||
    (group !== null && group.userId !== userId)
  ) {
    return "foreign_disposal_evidence";
  }
  if (
    holding.status !== "disposed" ||
    !holding.isVisible ||
    !REPORTABLE_RECONCILIATION_STATES.includes(holding.reconciliationState) ||
    event === null ||
    group === null ||
    event.deleted ||
    group.deleted ||
    !event.isEffective ||
    event.kind !== "dispose" ||
    group.kind !== "dispose" ||
    event.holdingId !== holding.holdingId ||
    group.domainReferenceId !== holding.holdingId ||
    event.id !== holding.effectiveEventId ||
    event.actionId !== holding.effectiveActionId ||
    event.actionId !== group.actionId ||
    !isReportableGroup(group)
  ) {
    return "excluded_disposal";
  }
  return null;
}

function isReportableGroup(group: MetalDisposeGroupSnapshot): boolean {
  if (
    !isFinancialActionState(group.state) ||
    (group.serverOutcome !== null &&
      !isFinancialActionServerOutcome(group.serverOutcome))
  ) {
    return false;
  }
  try {
    assertFinancialActionStateEvidence(group.state, {
      outcomeJson: group.outcomeJson,
      rejectionCode: group.rejectionCode,
      serverOutcome: group.serverOutcome,
    });
  } catch {
    return false;
  }
  return REPORTABLE_RECONCILIATION_STATES.includes(group.state);
}

function isFinancialActionState(value: string): value is FinancialActionState {
  return (
    value === "pending_local" ||
    value === "local_complete" ||
    value === "sync_pending" ||
    value === "sync_failed" ||
    value === "accepted" ||
    value === "rejected_compensating" ||
    value === "reconciled" ||
    value === "reconciliation_incomplete"
  );
}

function isFinancialActionServerOutcome(
  value: string
): value is FinancialActionServerOutcome {
  return (
    value === "accepted" ||
    value === "idempotent" ||
    value === "stale" ||
    value === "rejected"
  );
}

function shapeReason(value: CanonicalJsonValue): ShapedDisposalReason | null {
  switch (value) {
    case "lost_or_stolen":
    case "destroyed_or_damaged":
      return { reason: value, treatment: "write_off" };
    case "given_away":
    case "donated":
      return { reason: value, treatment: "external_transfer" };
    case "other_write_off":
      return { reason: "other", treatment: "write_off" };
    case "other_external_transfer":
      return { reason: "other", treatment: "external_transfer" };
    default:
      return null;
  }
}

function parseJsonValue(value: string): CanonicalJsonValue | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isCanonicalJsonValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isCanonicalJsonValue(value: unknown): value is CanonicalJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isCanonicalJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isCanonicalJsonValue);
}

function canonicalJson(value: CanonicalJsonValue): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: CanonicalJsonValue): CanonicalJsonValue {
  if (isCanonicalJsonArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])])
  );
}

function isCanonicalJsonArray(
  value: CanonicalJsonValue
): value is readonly CanonicalJsonValue[] {
  return Array.isArray(value);
}
