import type {
  AssetMetal,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import {
  orderLifecycleEventsNewestFirst,
  type LifecycleEvent,
} from "@monyvi/logic";

import type {
  MetalDetailAssetInput,
  MetalDetailHoldingStateInput,
  MetalDetailLifecycleEventInput,
  MetalDetailMetalInput,
  MetalDetailPhysicalForm,
  MetalDetailRenderKey,
  MetalDetailTimelineItem,
} from "@/services/metal-detail-read-model-service";

export interface MetalDetailAssetRecord {
  readonly acquisitionActionId: string | null;
  readonly id: string;
  readonly name: string;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: Date | null;
  readonly purchasePriceDecimal: string | null;
  readonly userId: string;
}

export function buildTimeline(
  acceptedEvents: readonly LifecycleEvent[],
  sourceEvents: readonly MetalDetailLifecycleEventInput[]
): readonly MetalDetailTimelineItem[] {
  const sourceById = new Map(sourceEvents.map((event) => [event.id, event]));
  return Object.freeze(
    orderLifecycleEventsNewestFirst(acceptedEvents)
      .map((accepted) => sourceById.get(accepted.id))
      .filter(
        (event): event is MetalDetailLifecycleEventInput =>
          event !== undefined && event.isHistoryVisible !== false
      )
      .map((event) =>
        Object.freeze({
          id: event.id,
          kind: event.kind,
          occurredAt: new Date(event.occurredAt.getTime()),
        })
      )
  );
}

export function toDetailAssetInput(
  asset: MetalDetailAssetRecord
): MetalDetailAssetInput {
  return {
    acquisitionActionId: asset.acquisitionActionId,
    id: asset.id,
    name: asset.name,
    purchaseCurrency: asset.purchaseCurrency,
    purchaseDate: copyValidDate(asset.purchaseDate),
    purchasePriceDecimal: asset.purchasePriceDecimal,
    userId: asset.userId,
  };
}

export function toDetailMetalInput(
  metal: AssetMetal,
  metalType: "GOLD" | "SILVER"
): MetalDetailMetalInput {
  return {
    itemForm: metal.itemForm ?? null,
    metalType,
    purityCatalogVersion: metal.purityCatalogVersion,
    purityCode: metal.purityCode,
    purityFactorDecimal: metal.purityFactorDecimal,
    weightGramsDecimal: metal.weightGramsDecimal,
  };
}

export function toDetailHoldingStateInput(
  state: MetalHoldingState
): MetalDetailHoldingStateInput {
  return {
    effectiveActionId: state.effectiveActionId,
    effectiveEventId: state.effectiveEventId,
    holdingId: state.holdingId,
    isVisible: state.isVisible,
    reconciliationState: state.reconciliationState,
    status: state.status,
    userId: state.userId,
  };
}

export function toDetailLifecycleEventInput(
  event: MetalLifecycleEvent,
  evidence: readonly MetalActionEvidence[]
): MetalDetailLifecycleEventInput | null {
  if (!isSupportedLifecycleKind(event.kind)) return null;
  const hasBoundEvidence = evidence.some(
    (candidate) =>
      candidate.actionId === event.actionId &&
      candidate.holdingId === event.holdingId &&
      candidate.kind === event.kind &&
      candidate.userId === event.userId &&
      !candidate.deleted
  );
  return {
    actionId: event.actionId,
    actionState: event.isEffective
      ? hasBoundEvidence
        ? "accepted"
        : "unknown"
      : "rejected",
    id: event.id,
    isEffective: event.isEffective,
    isHistoryVisible: event.isHistoryVisible,
    kind: event.kind,
    occurredAt: copyValidDate(event.occurredAt) ?? new Date(Number.NaN),
    payloadJson: event.payloadJson,
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId,
  };
}

export function toRateReferenceInput(
  reference: MetalRateReference
): Readonly<Record<string, unknown>> {
  return {
    actionId: reference.actionId,
    capturedAt: reference.capturedAt.getTime(),
    capturedFreshness: reference.capturedFreshness,
    instrumentCode: reference.instrumentCode,
    kind: reference.kind,
    orientation: reference.orientation,
    providerObservedAt: reference.providerObservedAt?.getTime() ?? null,
    quality: reference.quality,
    role: reference.role,
    source: reference.source,
    unit: reference.unit,
    valueDecimal: reference.valueDecimal,
  };
}

export function isSupportedMetalType(
  value: string
): value is "GOLD" | "SILVER" {
  return value === "GOLD" || value === "SILVER";
}

export function normalizePhysicalForm(
  value: string | null
): MetalDetailPhysicalForm | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "bar" ||
    normalized === "coin" ||
    normalized === "jewelry"
    ? normalized
    : null;
}

export function toRenderKey(
  metalType: "GOLD" | "SILVER",
  itemForm: MetalDetailPhysicalForm | null
): MetalDetailRenderKey | null {
  return itemForm === null
    ? null
    : `${metalType === "GOLD" ? "gold" : "silver"}:${itemForm}`;
}

export function copyValidDate(value: Date | null): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? new Date(value.getTime())
    : null;
}

function isSupportedLifecycleKind(
  value: string
): value is MetalDetailLifecycleEventInput["kind"] {
  return (
    value === "add" ||
    value === "correct" ||
    value === "sell" ||
    value === "dispose" ||
    value === "delete" ||
    value === "undo"
  );
}
