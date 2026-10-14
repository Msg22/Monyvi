import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";

import { canonicalMetalJson } from "./metal-canonical-action-group-service";

const FACT_KEYS = [
  "weightGramsDecimal",
  "purityCode",
  "purityCatalogVersion",
  "purityFactorDecimal",
  "purchasePriceDecimal",
  "purchaseCurrency",
  "purchaseDate",
  "physicalForm",
] as const;

interface MaterialFacts {
  readonly weightGramsDecimal: string | null;
  readonly purityCode: string | null;
  readonly purityCatalogVersion: string | null;
  readonly purityFactorDecimal: string | null;
  readonly purchasePriceDecimal: string | null;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: string;
  readonly physicalForm: string | null;
}

type CalendarEvent = Pick<
  MetalLifecycleEvent,
  | "id"
  | "actionId"
  | "kind"
  | "holdingId"
  | "userId"
  | "deleted"
  | "isEffective"
  | "predecessorEventId"
  | "reversesEventId"
  | "payloadJson"
>;

type CalendarEvidence = Pick<
  MetalActionEvidence,
  "actionId" | "kind" | "holdingId" | "userId" | "deleted" | "domainPayloadJson"
>;

type CalendarGroup = Pick<
  FinancialActionGroup,
  | "actionId"
  | "kind"
  | "domain"
  | "domainReferenceId"
  | "userId"
  | "deleted"
  | "state"
  | "serverOutcome"
  | "payloadJson"
>;

export interface MetalDetailCalendarResolutionInput {
  readonly asset: Pick<
    Asset,
    | "id"
    | "userId"
    | "purchaseDate"
    | "purchaseCurrency"
    | "purchasePriceDecimal"
    | "acquisitionActionId"
  >;
  readonly metal: Pick<
    AssetMetal,
    | "metalType"
    | "weightGramsDecimal"
    | "purityCode"
    | "purityCatalogVersion"
    | "purityFactorDecimal"
    | "itemForm"
  >;
  readonly state: Pick<
    MetalHoldingState,
    | "userId"
    | "holdingId"
    | "effectiveActionId"
    | "effectiveEventId"
    | "status"
    | "isVisible"
    | "reconciliationState"
  >;
  readonly events: readonly CalendarEvent[];
  readonly evidence: readonly CalendarEvidence[];
  readonly groups: readonly CalendarGroup[];
}

export interface ResolvedMetalDetailPurchaseCalendar {
  readonly purchaseDate: string;
  readonly acquisitionActionId: string | null;
}

interface ProvenAction {
  readonly event: CalendarEvent;
  readonly payload: Readonly<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(value + "T00:00:00.000Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isMaterialFacts(value: unknown): value is MaterialFacts {
  return (
    isRecord(value) &&
    Object.keys(value).length === FACT_KEYS.length &&
    FACT_KEYS.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(value, key) &&
        (value[key] === null || typeof value[key] === "string")
    ) &&
    isCalendarDate(value["purchaseDate"])
  );
}

function sameFacts(left: MaterialFacts, right: MaterialFacts): boolean {
  return FACT_KEYS.every((key) => left[key] === right[key]);
}

function parsePayload(value: string): Readonly<Record<string, unknown>> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sameCanonicalPayload(
  first: Readonly<Record<string, unknown>>,
  second: Readonly<Record<string, unknown>>,
  third: Readonly<Record<string, unknown>>
): boolean {
  try {
    const canonical = canonicalMetalJson(first);
    return (
      canonical === canonicalMetalJson(second) &&
      canonical === canonicalMetalJson(third)
    );
  } catch {
    return false;
  }
}

function isUsableRoot(group: CalendarGroup): boolean {
  const usableStates = [
    "local_complete",
    "sync_pending",
    "sync_failed",
    "accepted",
  ];
  return (
    !group.deleted &&
    usableStates.includes(group.state) &&
    (group.serverOutcome === null ||
      group.serverOutcome === "accepted" ||
      group.serverOutcome === "idempotent")
  );
}

function readProvenAction(
  input: MetalDetailCalendarResolutionInput,
  eventId: string
): ProvenAction | null {
  const events = input.events.filter(
    (event) => event.id === eventId || event.actionId === eventId
  );
  if (events.length !== 1) return null;
  const event = events[0];
  if (
    event === undefined ||
    event.id !== event.actionId ||
    event.id !== eventId ||
    event.holdingId !== input.asset.id ||
    event.userId !== input.asset.userId ||
    event.deleted ||
    !event.isEffective
  ) {
    return null;
  }
  const evidence = input.evidence.filter(
    (candidate) => candidate.actionId === event.actionId
  );
  const roots = input.groups.filter(
    (candidate) => candidate.actionId === event.actionId
  );
  if (evidence.length !== 1 || roots.length !== 1) return null;
  const proof = evidence[0];
  const root = roots[0];
  if (
    proof === undefined ||
    root === undefined ||
    proof.deleted ||
    proof.holdingId !== input.asset.id ||
    proof.userId !== input.asset.userId ||
    proof.kind !== event.kind ||
    root.domain !== "metals" ||
    root.domainReferenceId !== input.asset.id ||
    root.userId !== input.asset.userId ||
    root.kind !== event.kind ||
    !isUsableRoot(root)
  ) {
    return null;
  }

  const payload = parsePayload(event.payloadJson);
  const evidencePayload = parsePayload(proof.domainPayloadJson);
  const envelope = parsePayload(root.payloadJson);
  const rootPayload = envelope?.["payload"];
  return payload !== null &&
    evidencePayload !== null &&
    envelope !== null &&
    envelope["envelopeVersion"] === "monyvi.financial-action/v1" &&
    envelope["actionId"] === event.actionId &&
    envelope["userId"] === input.asset.userId &&
    envelope["domain"] === "metals" &&
    envelope["domainReferenceId"] === input.asset.id &&
    envelope["kind"] === event.kind &&
    isRecord(rootPayload) &&
    sameCanonicalPayload(payload, evidencePayload, rootPayload) &&
    payload["holdingId"] === input.asset.id &&
    payload["predecessorEventId"] === event.predecessorEventId &&
    payload["reversesEventId"] === event.reversesEventId
    ? { event, payload }
    : null;
}

function isPlausibleStoredMidnight(value: Date | null, date: string): boolean {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return false;
  }
  // The epoch was written at local midnight on a previous device/timezone.
  // Offset bounds prove consistency without interpreting it in today's timezone.
  const utcMidnight = Date.parse(date + "T00:00:00.000Z");
  const hoursFromUtcMidnight = (value.getTime() - utcMidnight) / 3_600_000;
  return hoursFromUtcMidnight >= -14 && hoursFromUtcMidnight <= 12;
}

function readUtcMidnightOnly(value: Date | null): string | null {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(value.getTime()) ||
    value.getUTCHours() !== 0 ||
    value.getUTCMinutes() !== 0 ||
    value.getUTCSeconds() !== 0 ||
    value.getUTCMilliseconds() !== 0
  ) {
    return null;
  }
  const date = value.toISOString().slice(0, 10);
  return isCalendarDate(date) ? date : null;
}

function matchesCurrentMaterial(
  input: MetalDetailCalendarResolutionInput,
  facts: MaterialFacts
): boolean {
  const { asset, metal } = input;
  return (
    facts.purchaseCurrency === asset.purchaseCurrency &&
    facts.purchasePriceDecimal === asset.purchasePriceDecimal &&
    facts.weightGramsDecimal === metal.weightGramsDecimal &&
    facts.purityCode === metal.purityCode &&
    facts.purityCatalogVersion === metal.purityCatalogVersion &&
    facts.purityFactorDecimal === metal.purityFactorDecimal &&
    facts.physicalForm === (metal.itemForm ?? null) &&
    isPlausibleStoredMidnight(asset.purchaseDate, facts.purchaseDate)
  );
}

/**
 * Restore a civil date from the durable, owner-scoped, effective action lineage.
 * Stored epochs may represent the same civil date in Cairo or another timezone;
 * never call getDate()/getUTCDate() to guess the original day.
 */
export function resolveMetalDetailPurchaseCalendar(
  input: MetalDetailCalendarResolutionInput
): ResolvedMetalDetailPurchaseCalendar | null {
  const { asset, state } = input;
  if (
    state.userId !== asset.userId ||
    state.holdingId !== asset.id ||
    state.status !== "active" ||
    !state.isVisible ||
    state.reconciliationState === "reconciliation_incomplete"
  ) {
    return null;
  }

  if (state.effectiveEventId === null || state.effectiveActionId === null) {
    if (
      state.effectiveEventId !== null ||
      state.effectiveActionId !== null ||
      asset.acquisitionActionId !== null ||
      input.events.length !== 0 ||
      input.evidence.length !== 0 ||
      input.groups.length !== 0
    ) {
      return null;
    }
    const purchaseDate = readUtcMidnightOnly(asset.purchaseDate);
    return purchaseDate === null
      ? null
      : { purchaseDate, acquisitionActionId: null };
  }

  const chain: ProvenAction[] = [];
  const visited = new Set<string>();
  let cursor: string | null = state.effectiveEventId;
  while (cursor !== null) {
    if (visited.has(cursor) || chain.length >= input.events.length) {
      return null;
    }
    visited.add(cursor);
    const action = readProvenAction(input, cursor);
    if (action === null) return null;
    chain.push(action);
    cursor = action.event.predecessorEventId;
  }
  if (
    chain.length === 0 ||
    chain[0]?.event.actionId !== state.effectiveActionId
  ) {
    return null;
  }

  let material: MaterialFacts | null = null;
  let lifecycle: "active" | "sold" | "disposed" | null = null;
  let predecessor: ProvenAction | null = null;
  const materialActionFacts = new Map<string, MaterialFacts>();
  for (const action of chain.reverse()) {
    const { event, payload } = action;
    if (event.kind === "add") {
      if (
        lifecycle !== null ||
        event.predecessorEventId !== null ||
        event.reversesEventId !== null ||
        payload["metalType"] !== input.metal.metalType ||
        !isMaterialFacts(payload["materialFacts"])
      ) {
        return null;
      }
      material = payload["materialFacts"];
      materialActionFacts.set(event.actionId, material);
      lifecycle = "active";
    } else if (event.kind === "correct") {
      if (
        (lifecycle !== "active" &&
          !(
            lifecycle === null &&
            event.predecessorEventId === null &&
            payload["expectedHoldingRevision"] === "0"
          )) ||
        !Object.prototype.hasOwnProperty.call(payload, "materialCorrection")
      ) {
        return null;
      }
      const correction = payload["materialCorrection"];
      if (correction === null) {
        if (material === null || !isRecord(payload["metadataChange"])) {
          return null;
        }
      } else {
        if (
          !isRecord(correction) ||
          !isMaterialFacts(correction["before"]) ||
          !isMaterialFacts(correction["after"]) ||
          (material !== null && !sameFacts(material, correction["before"]))
        ) {
          return null;
        }
        material = correction["after"];
        materialActionFacts.set(event.actionId, material);
      }
      lifecycle = "active";
    } else if (event.kind === "sell" || event.kind === "dispose") {
      if (lifecycle !== "active" || event.reversesEventId !== null) {
        return null;
      }
      lifecycle = event.kind === "sell" ? "sold" : "disposed";
    } else if (event.kind === "undo") {
      if (
        (lifecycle !== "sold" && lifecycle !== "disposed") ||
        predecessor?.event.actionId !== event.predecessorEventId ||
        event.reversesEventId !== event.predecessorEventId
      ) {
        return null;
      }
      lifecycle = "active";
    } else {
      return null;
    }
    predecessor = action;
  }

  if (
    lifecycle !== "active" ||
    material === null ||
    !matchesCurrentMaterial(input, material)
  ) {
    return null;
  }
  const acquisitionId = asset.acquisitionActionId;
  const referenceFacts =
    acquisitionId === null ? undefined : materialActionFacts.get(acquisitionId);
  return {
    purchaseDate: material.purchaseDate,
    acquisitionActionId:
      referenceFacts !== undefined &&
      referenceFacts.purchaseDate === material.purchaseDate &&
      referenceFacts.purchaseCurrency === material.purchaseCurrency
        ? acquisitionId
        : null,
  };
}
