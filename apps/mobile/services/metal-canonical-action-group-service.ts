import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  FinancialActionGroup,
  MetalActionEvidence,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import type { Sha256Provider } from "@monyvi/logic";

import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
  type CachedModelSnapshot,
} from "./watermelon-cache-snapshot";

export interface CanonicalMetalHolding {
  readonly holdingId: string;
  readonly asset: {
    readonly acquisitionActionId: string | null;
    readonly currency: string;
    readonly name: string;
    readonly notes: string | null;
    readonly purchaseCurrency: string | null;
    readonly purchaseDate: string;
    readonly purchasePrice: number;
    readonly purchasePriceDecimal: string | null;
  };
  readonly metal: {
    readonly metalType: string;
    readonly physicalForm: string | null;
    readonly purityCatalogVersion: string | null;
    readonly purityCode: string | null;
    readonly purityFactorDecimal: string | null;
    readonly purityFraction: number;
    readonly weightGrams: number;
    readonly weightGramsDecimal: string | null;
  };
  readonly state: {
    readonly effectiveActionId: string;
    readonly effectiveEventId: string;
    readonly financialRevision: string;
    readonly isVisible: boolean;
    readonly nameWrittenAt: number | null;
    readonly nameWriterId: string | null;
    readonly notesWrittenAt: number | null;
    readonly notesWriterId: string | null;
    readonly status: "active" | "sold" | "disposed";
  };
}

interface CanonicalFinancialActionGroupRoot {
  readonly id: string;
  readonly accountGuardsJson: string;
  readonly actionId: string;
  readonly createdAt: string;
  readonly deleted: boolean;
  readonly domain: string;
  readonly domainReferenceId: string;
  readonly kind: string;
  readonly outcomeJson: string | null;
  readonly payloadHash: string;
  readonly payloadJson: string;
  readonly rejectionCode: string | null;
  readonly serverOutcome: string | null;
  readonly state: string;
  readonly updatedAt: string;
  readonly userId: string;
}

interface CanonicalMetalActionEvidence {
  readonly id: string;
  readonly actionId: string;
  readonly canonicalHoldingRevision: string | null;
  readonly createdAt: string;
  readonly deleted: boolean;
  readonly domainPayloadJson: string;
  readonly expectedHoldingRevision: string | null;
  readonly holdingId: string;
  readonly kind: string;
  readonly updatedAt: string;
  readonly userId: string;
}

interface CanonicalMetalLifecycleEvent {
  readonly id: string;
  readonly actionId: string;
  readonly createdAt: string;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly isEffective: boolean;
  readonly isHistoryVisible: boolean;
  readonly kind: string;
  readonly occurredAt: string;
  readonly payloadJson: string;
  readonly predecessorEventId: string | null;
  readonly reversesEventId: string | null;
  readonly updatedAt: string;
  readonly userId: string;
}

interface CanonicalMetalRateReference {
  readonly id: string;
  readonly actionId: string;
  readonly capturedAt: string;
  readonly capturedFreshness: string;
  readonly createdAt: string;
  readonly deleted: boolean;
  readonly holdingId: string;
  readonly instrumentCode: string;
  readonly kind: string;
  readonly orientation: string;
  readonly providerObservedAt: string | null;
  readonly quality: string;
  readonly role: string;
  readonly source: string | null;
  readonly unit: string;
  readonly updatedAt: string;
  readonly userId: string;
  readonly valueDecimal: string;
}

export interface CanonicalMetalActionGroup {
  readonly root: CanonicalFinancialActionGroupRoot;
  readonly evidence: CanonicalMetalActionEvidence;
  readonly event: CanonicalMetalLifecycleEvent;
  readonly rates: readonly CanonicalMetalRateReference[];
}

export interface CanonicalMetalStaleOutcome {
  readonly canonicalActionGroup?: CanonicalMetalActionGroup;
  readonly canonicalHoldingActionId: string | null;
  readonly canonicalHoldingEvidenceHash: string;
  readonly canonicalHoldingRevision: string;
  readonly canonicalHolding: CanonicalMetalHolding;
}

export interface CanonicalActionGroupInstallPlan {
  readonly operations: readonly Model[];
  readonly snapshots: readonly CachedModelSnapshot[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function isCanonicalMetalRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalMetalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalMetalJson).join(",")}]`;
  if (!isCanonicalMetalRecord(value))
    throw new Error("incomplete_metal_action_group");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalMetalJson(value[key])}`)
    .join(",")}}`;
}

function parseCanonicalJson(value: string): unknown {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (canonicalMetalJson(parsed) !== value) {
      throw new Error("incomplete_metal_action_group");
    }
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "incomplete_metal_action_group"
    ) {
      throw error;
    }
    throw new Error("incomplete_metal_action_group");
  }
}

function hasCanonicalTimestamp(value: string): boolean {
  return (
    ISO_TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}

function nextCanonicalRevision(value: string | null): string | null {
  if (value === null) return "0";
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  try {
    const revision = BigInt(value);
    return revision < 9223372036854775807n ? (revision + 1n).toString() : null;
  } catch {
    return null;
  }
}

function canonicalRateSnapshot(
  rate: CanonicalMetalRateReference
): Readonly<Record<string, unknown>> {
  return {
    capturedAt: rate.capturedAt,
    capturedFreshness: rate.capturedFreshness,
    instrumentCode: rate.instrumentCode,
    kind: rate.kind,
    orientation: rate.orientation,
    providerObservedAt: rate.providerObservedAt,
    quality: rate.quality,
    referenceId: rate.id,
    role: rate.role,
    source: rate.source,
    unit: rate.unit,
    valueDecimal: rate.valueDecimal,
  };
}

function payloadRateSnapshots(
  payload: Readonly<Record<string, unknown>>
): readonly Readonly<Record<string, unknown>>[] {
  const candidate = Array.isArray(payload.rateSnapshots)
    ? payload.rateSnapshots
    : isCanonicalMetalRecord(payload.materialCorrection) &&
        Array.isArray(payload.materialCorrection.rateSnapshots)
      ? payload.materialCorrection.rateSnapshots
      : [];
  if (!candidate.every(isCanonicalMetalRecord)) {
    throw new Error("incomplete_metal_action_group");
  }
  return candidate;
}

export async function assertCanonicalActionGroup(
  outcome: CanonicalMetalStaleOutcome,
  expectedUserId: string,
  hashProvider: Sha256Provider
): Promise<CanonicalMetalActionGroup> {
  const group = outcome.canonicalActionGroup;
  if (!group) throw new Error("incomplete_metal_action_group");
  const { root, evidence, event, rates } = group;
  const timestamps = [
    root.createdAt,
    root.updatedAt,
    evidence.createdAt,
    evidence.updatedAt,
    event.createdAt,
    event.updatedAt,
    event.occurredAt,
    ...rates.flatMap((rate) => [
      rate.createdAt,
      rate.updatedAt,
      rate.capturedAt,
      ...(rate.providerObservedAt === null ? [] : [rate.providerObservedAt]),
    ]),
  ];
  if (
    !UUID_PATTERN.test(root.id) ||
    !UUID_PATTERN.test(root.actionId) ||
    !UUID_PATTERN.test(root.domainReferenceId) ||
    !UUID_PATTERN.test(expectedUserId) ||
    !HASH_PATTERN.test(root.payloadHash) ||
    !HASH_PATTERN.test(outcome.canonicalHoldingEvidenceHash) ||
    !timestamps.every(hasCanonicalTimestamp) ||
    root.userId !== expectedUserId ||
    evidence.userId !== expectedUserId ||
    event.userId !== expectedUserId ||
    rates.some((rate) => rate.userId !== expectedUserId) ||
    root.actionId !== outcome.canonicalHoldingActionId ||
    root.actionId !== outcome.canonicalHolding.state.effectiveActionId ||
    evidence.actionId !== root.actionId ||
    evidence.id !== root.actionId ||
    event.actionId !== root.actionId ||
    event.id !== outcome.canonicalHolding.state.effectiveEventId ||
    (event.predecessorEventId !== null &&
      !UUID_PATTERN.test(event.predecessorEventId)) ||
    (event.reversesEventId !== null &&
      !UUID_PATTERN.test(event.reversesEventId)) ||
    root.domain !== "metals" ||
    root.domainReferenceId !== outcome.canonicalHolding.holdingId ||
    evidence.holdingId !== root.domainReferenceId ||
    event.holdingId !== root.domainReferenceId ||
    root.kind !== evidence.kind ||
    root.kind !== event.kind ||
    root.deleted ||
    evidence.deleted ||
    event.deleted ||
    rates.some((rate) => rate.deleted) ||
    root.state !== "accepted" ||
    root.serverOutcome !== "accepted" ||
    root.rejectionCode !== null ||
    evidence.canonicalHoldingRevision !== outcome.canonicalHoldingRevision ||
    nextCanonicalRevision(evidence.expectedHoldingRevision) !==
      evidence.canonicalHoldingRevision ||
    !event.isEffective ||
    event.isHistoryVisible !== (event.kind !== "delete") ||
    rates.some(
      (rate) =>
        !UUID_PATTERN.test(rate.id) ||
        rate.actionId !== root.actionId ||
        rate.holdingId !== root.domainReferenceId
    )
  ) {
    throw new Error("incomplete_metal_action_group");
  }

  const envelope = parseCanonicalJson(root.payloadJson);
  const accountGuards = parseCanonicalJson(root.accountGuardsJson);
  const acceptedOutcome =
    root.outcomeJson === null ? null : parseCanonicalJson(root.outcomeJson);
  if (
    !isCanonicalMetalRecord(envelope) ||
    !Array.isArray(accountGuards) ||
    accountGuards.length !== 0 ||
    !isCanonicalMetalRecord(acceptedOutcome) ||
    acceptedOutcome.status !== "accepted" ||
    acceptedOutcome.actionId !== root.actionId ||
    envelope.actionId !== root.actionId ||
    envelope.userId !== expectedUserId ||
    envelope.domain !== "metals" ||
    envelope.domainReferenceId !== root.domainReferenceId ||
    envelope.kind !== root.kind ||
    !isCanonicalMetalRecord(envelope.payload) ||
    canonicalMetalJson(envelope.payload) !== evidence.domainPayloadJson ||
    evidence.domainPayloadJson !== event.payloadJson ||
    event.occurredAt !== envelope.occurredAt ||
    event.predecessorEventId !== envelope.payload.predecessorEventId ||
    event.reversesEventId !== envelope.payload.reversesEventId
  ) {
    throw new Error("incomplete_metal_action_group");
  }
  if ((await hashProvider.digestUtf8(root.payloadJson)) !== root.payloadHash) {
    throw new Error("incomplete_metal_action_group");
  }
  const snapshots = payloadRateSnapshots(envelope.payload);
  const snapshotsById = new Map<string, Readonly<Record<string, unknown>>>();
  for (const snapshot of snapshots) {
    if (typeof snapshot.referenceId !== "string") {
      throw new Error("incomplete_metal_action_group");
    }
    snapshotsById.set(snapshot.referenceId, snapshot);
  }
  if (
    snapshots.length !== rates.length ||
    snapshotsById.size !== snapshots.length ||
    new Set(rates.map((rate) => rate.id)).size !== rates.length ||
    rates.some((rate) => {
      const snapshot = snapshotsById.get(rate.id);
      return (
        snapshot === undefined ||
        canonicalMetalJson(canonicalRateSnapshot(rate)) !==
          canonicalMetalJson(snapshot)
      );
    })
  ) {
    throw new Error("incomplete_metal_action_group");
  }

  const actionEvidenceFingerprint = await hashProvider.digestUtf8(
    canonicalMetalJson({
      actionId: evidence.actionId,
      canonicalHoldingRevision: evidence.canonicalHoldingRevision,
      domainPayload: parseCanonicalJson(evidence.domainPayloadJson),
      expectedHoldingRevision: evidence.expectedHoldingRevision,
      holdingId: evidence.holdingId,
      kind: evidence.kind,
      userId: evidence.userId,
    })
  );
  const eventFingerprint = await hashProvider.digestUtf8(
    canonicalMetalJson({
      actionId: event.actionId,
      holdingId: event.holdingId,
      id: event.id,
      isHistoryVisible: event.isHistoryVisible,
      kind: event.kind,
      occurredAt: event.occurredAt,
      payload: parseCanonicalJson(event.payloadJson),
      predecessorEventId: event.predecessorEventId,
      reversesEventId: event.reversesEventId,
      userId: event.userId,
    })
  );
  const holdingHash = await hashProvider.digestUtf8(
    canonicalMetalJson({
      actionEvidenceFingerprint,
      effectiveActionId: outcome.canonicalHolding.state.effectiveActionId,
      effectiveEventId: outcome.canonicalHolding.state.effectiveEventId,
      eventFingerprint,
      financialRevision: outcome.canonicalHolding.state.financialRevision,
      holdingId: outcome.canonicalHolding.holdingId,
      isVisible: outcome.canonicalHolding.state.isVisible,
      status: outcome.canonicalHolding.state.status,
      userId: expectedUserId,
    })
  );
  if (holdingHash !== outcome.canonicalHoldingEvidenceHash) {
    throw new Error("incomplete_metal_action_group");
  }
  return group;
}

function setServerIdentity(model: Model, id: string, createdAt: string): void {
  model._raw.id = id;
  Object.assign(model._raw, { created_at: Date.parse(createdAt) });
}

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

function assertExistingCanonicalRoot(
  row: FinancialActionGroup,
  value: CanonicalFinancialActionGroupRoot
): void {
  if (
    row.actionId !== value.actionId ||
    row.userId !== value.userId ||
    row.domain !== value.domain ||
    row.kind !== value.kind ||
    row.domainReferenceId !== value.domainReferenceId ||
    row.payloadJson !== value.payloadJson ||
    row.payloadHash !== value.payloadHash ||
    row.accountGuardsJson !== value.accountGuardsJson ||
    row.deleted
  ) {
    throw new Error("incomplete_metal_action_group");
  }
}

function assertExistingCanonicalEvidence(
  row: MetalActionEvidence,
  value: CanonicalMetalActionEvidence
): void {
  if (
    row.id !== value.id ||
    row.actionId !== value.actionId ||
    row.userId !== value.userId ||
    row.holdingId !== value.holdingId ||
    row.kind !== value.kind ||
    row.expectedHoldingRevision !== value.expectedHoldingRevision ||
    row.domainPayloadJson !== value.domainPayloadJson ||
    row.deleted
  ) {
    throw new Error("incomplete_metal_action_group");
  }
}

function assertExistingCanonicalEvent(
  row: MetalLifecycleEvent,
  value: CanonicalMetalLifecycleEvent
): void {
  if (
    row.id !== value.id ||
    row.actionId !== value.actionId ||
    row.userId !== value.userId ||
    row.holdingId !== value.holdingId ||
    row.kind !== value.kind ||
    row.occurredAt.getTime() !== Date.parse(value.occurredAt) ||
    row.payloadJson !== value.payloadJson ||
    row.predecessorEventId !== value.predecessorEventId ||
    row.reversesEventId !== value.reversesEventId ||
    row.deleted
  ) {
    throw new Error("incomplete_metal_action_group");
  }
}

function assertExistingCanonicalRate(
  row: MetalRateReference,
  value: CanonicalMetalRateReference
): void {
  if (
    row.id !== value.id ||
    row.actionId !== value.actionId ||
    row.userId !== value.userId ||
    row.holdingId !== value.holdingId ||
    row.capturedAt.getTime() !== Date.parse(value.capturedAt) ||
    row.capturedFreshness !== value.capturedFreshness ||
    row.instrumentCode !== value.instrumentCode ||
    row.kind !== value.kind ||
    row.orientation !== value.orientation ||
    (row.providerObservedAt?.getTime() ?? null) !==
      (value.providerObservedAt === null
        ? null
        : Date.parse(value.providerObservedAt)) ||
    row.quality !== value.quality ||
    row.role !== value.role ||
    row.source !== value.source ||
    row.unit !== value.unit ||
    row.valueDecimal !== value.valueDecimal ||
    row.deleted
  ) {
    throw new Error("incomplete_metal_action_group");
  }
}

export async function prepareCanonicalActionGroupInstall(
  database: Database,
  group: CanonicalMetalActionGroup,
  userId: string
): Promise<CanonicalActionGroupInstallPlan> {
  const [existingRoot, existingEvidence, existingEvent, existingRates] =
    await Promise.all([
      findOwnedByActionId<FinancialActionGroup>(
        database,
        "financial_action_groups",
        group.root.actionId,
        userId
      ),
      findOwnedByActionId<MetalActionEvidence>(
        database,
        "metal_action_evidence",
        group.evidence.actionId,
        userId
      ),
      findOwnedByActionId<MetalLifecycleEvent>(
        database,
        "metal_lifecycle_events",
        group.event.actionId,
        userId
      ),
      database
        .get<MetalRateReference>("metal_rate_references")
        .query(
          Q.where("action_id", group.root.actionId),
          Q.where("user_id", userId)
        )
        .fetch(),
    ]);

  if (existingRoot) assertExistingCanonicalRoot(existingRoot, group.root);
  if (existingEvidence)
    assertExistingCanonicalEvidence(existingEvidence, group.evidence);
  if (existingEvent) assertExistingCanonicalEvent(existingEvent, group.event);

  const canonicalRatesById = new Map(
    group.rates.map((rate) => [rate.id, rate] as const)
  );
  if (existingRates.length > group.rates.length) {
    throw new Error("incomplete_metal_action_group");
  }
  for (const existingRate of existingRates) {
    const canonicalRate = canonicalRatesById.get(existingRate.id);
    if (!canonicalRate) throw new Error("incomplete_metal_action_group");
    assertExistingCanonicalRate(existingRate, canonicalRate);
  }

  const existingModels = [
    existingRoot,
    existingEvidence,
    existingEvent,
    ...existingRates,
  ].filter((model): model is Model => model !== null);
  const snapshots = existingModels.map(captureCachedModelSnapshot);
  const operations: Model[] = [];
  const now = new Date();

  try {
    if (existingRoot) {
      operations.push(
        existingRoot.prepareUpdate((row) => {
          row.state = group.root.state;
          row.serverOutcome = group.root.serverOutcome;
          row.outcomeJson = group.root.outcomeJson;
          row.rejectionCode = group.root.rejectionCode;
          row.updatedAt = now;
        })
      );
    } else {
      operations.push(
        database
          .get<FinancialActionGroup>("financial_action_groups")
          .prepareCreate((row) => {
            setServerIdentity(row, group.root.id, group.root.createdAt);
            row.accountGuardsJson = group.root.accountGuardsJson;
            row.actionId = group.root.actionId;
            row.deleted = false;
            row.domain = group.root.domain;
            row.domainReferenceId = group.root.domainReferenceId;
            row.kind = group.root.kind;
            row.outcomeJson = group.root.outcomeJson;
            row.payloadHash = group.root.payloadHash;
            row.payloadJson = group.root.payloadJson;
            row.rejectionCode = group.root.rejectionCode;
            row.serverOutcome = group.root.serverOutcome;
            row.state = group.root.state;
            row.updatedAt = new Date(group.root.updatedAt);
            row.userId = group.root.userId;
          })
      );
    }
    if (existingEvidence) {
      operations.push(
        existingEvidence.prepareUpdate((row) => {
          row.canonicalHoldingRevision = group.evidence.canonicalHoldingRevision;
          row.updatedAt = now;
        })
      );
    } else {
      operations.push(
        database
          .get<MetalActionEvidence>("metal_action_evidence")
          .prepareCreate((row) => {
            setServerIdentity(row, group.evidence.id, group.evidence.createdAt);
            row.actionId = group.evidence.actionId;
            row.canonicalHoldingRevision =
              group.evidence.canonicalHoldingRevision;
            row.deleted = false;
            row.domainPayloadJson = group.evidence.domainPayloadJson;
            row.expectedHoldingRevision = group.evidence.expectedHoldingRevision;
            row.holdingId = group.evidence.holdingId;
            row.kind = group.evidence.kind;
            row.updatedAt = new Date(group.evidence.updatedAt);
            row.userId = group.evidence.userId;
          })
      );
    }
    if (existingEvent) {
      operations.push(
        existingEvent.prepareUpdate((row) => {
          row.isEffective = group.event.isEffective;
          row.isHistoryVisible = group.event.isHistoryVisible;
          row.updatedAt = now;
        })
      );
    } else {
      operations.push(
        database
          .get<MetalLifecycleEvent>("metal_lifecycle_events")
          .prepareCreate((row) => {
            setServerIdentity(row, group.event.id, group.event.createdAt);
            row.actionId = group.event.actionId;
            row.deleted = false;
            row.holdingId = group.event.holdingId;
            row.isEffective = group.event.isEffective;
            row.isHistoryVisible = group.event.isHistoryVisible;
            row.kind = group.event.kind;
            row.occurredAt = new Date(group.event.occurredAt);
            row.payloadJson = group.event.payloadJson;
            row.predecessorEventId = group.event.predecessorEventId;
            row.reversesEventId = group.event.reversesEventId;
            row.updatedAt = new Date(group.event.updatedAt);
            row.userId = group.event.userId;
          })
      );
    }

    const existingRatesById = new Map(
      existingRates.map((rate) => [rate.id, rate])
    );
    for (const rate of group.rates) {
      if (existingRatesById.has(rate.id)) continue;
      operations.push(
        database
          .get<MetalRateReference>("metal_rate_references")
          .prepareCreate((row) => {
            setServerIdentity(row, rate.id, rate.createdAt);
            row.actionId = rate.actionId;
            row.capturedAt = new Date(rate.capturedAt);
            row.capturedFreshness = rate.capturedFreshness;
            row.deleted = false;
            row.holdingId = rate.holdingId;
            row.instrumentCode = rate.instrumentCode;
            row.kind = rate.kind;
            row.orientation = rate.orientation;
            row.providerObservedAt =
              rate.providerObservedAt === null
                ? null
                : new Date(rate.providerObservedAt);
            row.quality = rate.quality;
            row.role = rate.role;
            row.source = rate.source;
            row.unit = rate.unit;
            row.updatedAt = new Date(rate.updatedAt);
            row.userId = rate.userId;
            row.valueDecimal = rate.valueDecimal;
          })
      );
    }
    return { operations, snapshots };
  } catch (error) {
    snapshots.forEach(restoreCachedModelSnapshot);
    throw error;
  }
}
