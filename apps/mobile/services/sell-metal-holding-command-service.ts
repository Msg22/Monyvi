import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  AssetMetal,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
  MetalRateReference,
} from "@monyvi/db";
import {
  assertFinancialActionStateEvidence,
  FINANCIAL_ACTION_STATES,
  SERVER_OUTCOMES,
  parseFinancialActionEnvelopeJson,
  parseFinancialActionEvidenceJson,
  serializeFinancialActionEnvelope,
  reduceMetalLifecycle,
  type FinancialActionEnvelopeV1,
  type FinancialActionServerOutcome,
  type FinancialActionState,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  CommitFinancialActionGroupLocallyInput,
  CommitFinancialActionGroupLocallyResult,
  FinancialActionLinkedOperationPlan,
  FinancialActionUserDataScope,
} from "./financial-action-foundation-repository";
import type { CurrentUserDataScope } from "./user-data-access";
import { incrementCanonicalMetalRevision } from "./metal-financial-action-adapter";
import { formatMetalLocalCalendarDate } from "./metal-financial-action-repository";
import {
  resolveLegacyDisposalBaseline,
  toLegacyDisposalActionEvidence,
  toLegacyDisposalRevisionEvidence,
} from "./metal-legacy-disposal-baseline-service";

type SellUserDataScope = FinancialActionUserDataScope &
  Pick<CurrentUserDataScope, "queryChildrenOfOwnedParent">;

export interface SellMetalRateSnapshot {
  readonly referenceId: string;
  readonly role:
    | "terminal_metal"
    | "terminal_purchase_currency"
    | "terminal_proceeds_currency";
  readonly kind: "metal" | "currency";
  readonly instrumentCode: string;
  readonly valueDecimal: string;
  readonly unit:
    | "usd_per_pure_gram"
    | "usd_per_currency_unit"
    | "currency_units_per_usd";
  readonly orientation: "quote_per_base" | "base_per_quote";
  readonly providerObservedAt: string | null;
  readonly source: string | null;
  readonly quality: "valid";
  readonly capturedFreshness: "fresh" | "stale" | "unknown";
  readonly capturedAt: string;
}
export type SellMetalRateSnapshotDraft = Omit<
  SellMetalRateSnapshot,
  "referenceId"
>;

export interface SellMetalHoldingCommandInput {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string | null;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly latestAllowedCalendarDate: string;
  readonly expectedFinancialRevision: string;
  readonly saleDate: string;
  readonly metalType: "GOLD" | "SILVER";
  readonly purchaseCurrency: string;
  readonly saleCurrency: string;
  readonly grossProceedsMinorUnits: string;
  readonly feeMinorUnits: string;
  readonly netProceedsMinorUnits: string;
  readonly notes: string | null;
  readonly rateSnapshots: readonly SellMetalRateSnapshot[];
}
export interface SellMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<SellUserDataScope>;
  readonly commitFinancialActionGroupLocally: (
    input: CommitFinancialActionGroupLocallyInput
  ) => Promise<CommitFinancialActionGroupLocallyResult>;
  readonly createEnvelope: (
    input: SellMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}
export interface SellMetalHoldingCommandResult {
  readonly kind: "committed" | "replay";
  readonly holdingId: string;
}
export interface SellMetalHoldingCommandService {
  readonly sell: (
    input: SellMetalHoldingCommandInput
  ) => Promise<SellMetalHoldingCommandResult>;
}

interface Projection {
  readonly actionRoots: readonly FinancialActionGroup[];
  readonly asset: Asset;
  readonly metal: AssetMetal | null;
  readonly state: MetalHoldingState;
  readonly predecessor: MetalLifecycleEvent | null;
  readonly timeline: readonly MetalLifecycleEvent[];
  readonly revisionEvidence: readonly MetalActionEvidence[];
}

const EFFECTIVE_HOLDING_RECONCILIATION_STATES = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
  "reconciled",
]);

const ACCEPTED_ACTION_ROOT_STATES = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
]);

const REJECTED_ACTION_ROOT_STATES = new Set([
  "rejected_compensating",
  "reconciled",
]);

const SUCCESSFUL_REPLAY_STATES = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
]);

const BLOCKING_LIFECYCLE_REJECTIONS = new Set([
  "duplicate_event_id_conflict",
  "incomplete_evidence",
  "missing_predecessor",
  "predecessor_not_accepted",
  "predecessor_not_current",
  "cycle_detected",
  "invalid_transition",
  "invalid_reversal_target",
  "conflicting_effective_successors",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertStableLocalIds(input: SellMetalHoldingCommandInput): void {
  const ids = [
    input.actionEvidenceId,
    input.lifecycleEventId,
    ...input.rateSnapshots.map((snapshot) => snapshot.referenceId),
  ];
  if (
    ids.some((id) => !UUID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error("metal_sell_invalid_local_id");
  }
}

function payloadFor(
  input: SellMetalHoldingCommandInput
): RegisteredActionPayload {
  return {
    holdingId: input.holdingId,
    expectedHoldingRevision: input.expectedFinancialRevision,
    predecessorEventId: input.predecessorEventId,
    reversesEventId: null,
    metalType: input.metalType,
    purchaseCurrency: input.purchaseCurrency,
    saleCurrency: input.saleCurrency,
    saleDate: input.saleDate,
    grossProceedsMinorUnits: input.grossProceedsMinorUnits,
    feeMinorUnits: input.feeMinorUnits,
    netProceedsMinorUnits: input.netProceedsMinorUnits,
    notes: input.notes,
    rateSnapshots: input.rateSnapshots.map(
      (snapshot): RegisteredActionPayload => ({ ...snapshot })
    ),
  };
}

async function loadProjection(
  dependencies: SellMetalHoldingCommandDependencies,
  input: SellMetalHoldingCommandInput
): Promise<Projection> {
  const scope = await dependencies.getCurrentUserDataScope();
  if (scope.userId !== input.userId)
    throw new Error("financial_action_auth_scope_changed");
  const predecessorPromise =
    input.predecessorEventId === null
      ? Promise.resolve([] as MetalLifecycleEvent[])
      : scope
          .queryOwned(
            dependencies.database.get<MetalLifecycleEvent>(
              "metal_lifecycle_events"
            ),
            Q.where("id", input.predecessorEventId),
            Q.where("holding_id", input.holdingId),
            Q.where("deleted", false),
            Q.take(1)
          )
          .fetch();
  const [
    assets,
    states,
    predecessors,
    timeline,
    actionRoots,
    revisionEvidence,
  ] = await Promise.all([
    scope
      .queryOwned(
        dependencies.database.get<Asset>("assets"),
        Q.where("id", input.holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<MetalHoldingState>("metal_holding_states"),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
    predecessorPromise,
    scope
      .queryOwned(
        dependencies.database.get<MetalLifecycleEvent>(
          "metal_lifecycle_events"
        ),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<FinancialActionGroup>(
          "financial_action_groups"
        ),
        Q.where("domain", "metals"),
        Q.where("domain_reference_id", input.holdingId),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  if (
    !assets[0] ||
    !states[0] ||
    (input.predecessorEventId !== null && !predecessors[0])
  )
    throw new Error("metal_holding_not_found");
  const asset = scope.assertOwned(assets[0]);
  const metals = await scope
    .queryChildrenOfOwnedParent(
      dependencies.database.get<AssetMetal>("asset_metals"),
      asset,
      "asset_id",
      Q.where("deleted", false),
      Q.take(1)
    )
    .fetch();
  return {
    actionRoots: actionRoots.map((root) => scope.assertOwned(root)),
    asset,
    metal: metals[0] ?? null,
    state: scope.assertOwned(states[0]),
    predecessor: predecessors[0] ? scope.assertOwned(predecessors[0]) : null,
    timeline: timeline.map((event) => scope.assertOwned(event)),
    revisionEvidence: revisionEvidence.map((evidence) =>
      scope.assertOwned(evidence)
    ),
  };
}

function assertRateSnapshotContext(
  projection: Projection,
  input: SellMetalHoldingCommandInput
): void {
  if (
    !projection.metal ||
    (projection.metal.metalType !== "GOLD" &&
      projection.metal.metalType !== "SILVER") ||
    projection.metal.metalType !== input.metalType ||
    projection.asset.purchaseCurrency !== input.purchaseCurrency
  ) {
    throw new Error("holding_projection_changed");
  }
}

function assertProjection(
  projection: Projection,
  input: SellMetalHoldingCommandInput
): void {
  if (projection.asset.type !== "METAL")
    throw new Error("metal_holding_not_found");
  assertRateSnapshotContext(projection, input);
  if (projection.state.status !== "active")
    throw new Error("metal_holding_not_active");
  if (
    !projection.state.isVisible ||
    !EFFECTIVE_HOLDING_RECONCILIATION_STATES.has(
      projection.state.reconciliationState
    )
  ) {
    throw new Error("metal_sell_effective_active_holding_required");
  }
  if (projection.state.financialRevision !== input.expectedFinancialRevision) {
    throw new Error("holding_revision_conflict");
  }
  if (
    input.saleDate < formatMetalLocalCalendarDate(projection.asset.purchaseDate)
  ) {
    throw new Error("metal_sell_date_before_acquisition");
  }
  const isMigratedRevisionZero =
    input.expectedFinancialRevision === "0" &&
    input.predecessorEventId === null &&
    projection.state.effectiveActionId === null &&
    projection.state.effectiveEventId === null &&
    projection.predecessor === null &&
    projection.timeline.length === 0;
  if (isMigratedRevisionZero) return;
  const legacyDisposalBaseline = resolveLegacyDisposalBaseline({
    assetId: input.holdingId,
    userId: input.userId,
    holdingState: projection.state,
    lifecycleEvents: projection.timeline,
    terminalFacts: null,
    revisionEvidence: toLegacyDisposalRevisionEvidence(
      projection.revisionEvidence
    ),
    actionEvidence: toLegacyDisposalActionEvidence(
      projection.timeline,
      projection.actionRoots
    ),
    latestAllowedCalendarDate: input.latestAllowedCalendarDate,
  });
  const reduced = reduceMetalLifecycle(
    projection.timeline.map((event) =>
      toReducerEvent(
        event,
        projection.actionRoots,
        input.latestAllowedCalendarDate
      )
    ),
    legacyDisposalBaseline
  );
  if (
    projection.predecessor === null ||
    !projection.predecessor.isEffective ||
    !projection.predecessor.isHistoryVisible
  ) {
    throw new Error("metal_sell_effective_active_holding_required");
  }
  if (
    projection.state.effectiveEventId !== input.predecessorEventId ||
    projection.state.effectiveActionId !== projection.predecessor.actionId
  ) {
    throw new Error("holding_revision_conflict");
  }
  const reducedProjection = reduced.projection;
  if (
    reducedProjection === null ||
    reducedProjection.effectiveEventId !== input.predecessorEventId ||
    reducedProjection.status !== "active" ||
    !reducedProjection.isVisible ||
    reduced.rejectedEvents.some(({ reasonCode }) =>
      BLOCKING_LIFECYCLE_REJECTIONS.has(reasonCode)
    )
  ) {
    throw new Error("metal_sell_lifecycle_conflict");
  }
}

function toReducerEvent(
  event: MetalLifecycleEvent,
  actionRoots: readonly FinancialActionGroup[],
  latestAllowedCalendarDate: string
): Readonly<Record<string, unknown>> {
  const matchingRoots = actionRoots.filter(
    (candidate) =>
      candidate.actionId === event.actionId &&
      toReducerKind(candidate.kind) === toReducerKind(event.kind)
  );
  const actionRoot = matchingRoots.length === 1 ? matchingRoots[0] : undefined;
  const hasCompleteRootEvidence =
    actionRoot !== undefined &&
    hasValidRootEvidence(actionRoot, event, latestAllowedCalendarDate);
  const canonicalCasStatus = actionRoot
    ? ACCEPTED_ACTION_ROOT_STATES.has(actionRoot.state)
      ? "accepted"
      : REJECTED_ACTION_ROOT_STATES.has(actionRoot.state)
        ? "rejected"
        : "unknown"
    : "unknown";
  // Unknown CAS is accepted by the shared reducer only with complete evidence;
  // an unfinished or malformed local root cannot prove an effective predecessor.
  return {
    canonicalCasStatus,
    evidenceState:
      !hasCompleteRootEvidence || canonicalCasStatus === "unknown"
        ? "incomplete"
        : event.isEffective
          ? event.isHistoryVisible
            ? "effective"
            : "incomplete"
          : "ineffective",
    fingerprint: event.payloadJson,
    id: event.id,
    kind: toReducerKind(event.kind),
    occurredAt: event.occurredAt.getTime(),
    predecessorEventId: event.predecessorEventId,
    reversesEventId: event.reversesEventId,
  };
}

function hasValidRootEvidence(
  root: FinancialActionGroup,
  event: MetalLifecycleEvent,
  latestAllowedCalendarDate: string
): boolean {
  if (
    !isFinancialActionState(root.state) ||
    (root.serverOutcome !== null &&
      !isFinancialActionServerOutcome(root.serverOutcome))
  ) {
    return false;
  }
  try {
    assertFinancialActionStateEvidence(root.state, {
      serverOutcome: root.serverOutcome,
      outcomeJson: root.outcomeJson,
      rejectionCode: root.rejectionCode,
    });
    const validationInput = { latestAllowedCalendarDate };
    const envelope = parseFinancialActionEnvelopeJson(
      root.payloadJson,
      undefined,
      validationInput
    );
    if (
      envelope.actionId !== event.actionId ||
      envelope.userId !== event.userId ||
      envelope.domain !== "metals" ||
      envelope.domainReferenceId !== event.holdingId ||
      envelope.kind !== root.kind ||
      envelope.occurredAt !== event.occurredAt.toISOString() ||
      envelope.payload.predecessorEventId !== event.predecessorEventId ||
      envelope.payload.reversesEventId !== event.reversesEventId
    ) {
      return false;
    }
    return (
      serializeFinancialActionEnvelope(envelope, undefined, validationInput) ===
      serializeFinancialActionEnvelope(
        {
          ...envelope,
          payload: parseFinancialActionEvidenceJson(event.payloadJson),
        },
        undefined,
        validationInput
      )
    );
  } catch {
    return false;
  }
}

function isFinancialActionState(value: string): value is FinancialActionState {
  return FINANCIAL_ACTION_STATES.some((state) => state === value);
}

function isFinancialActionServerOutcome(
  value: string
): value is FinancialActionServerOutcome {
  return SERVER_OUTCOMES.some((outcome) => outcome === value);
}

function toReducerKind(kind: string): string {
  const kinds: Readonly<Record<string, string>> = {
    add: "created",
    correct: "corrected",
    created: "created",
    corrected: "corrected",
    delete: "deleted",
    deleted: "deleted",
    dispose: "disposed",
    disposed: "disposed",
    sell: "sold",
    sold: "sold",
    undo: "reversed",
    reversed: "reversed",
  };
  return kinds[kind] ?? kind;
}

function assertSuccessfulReplay(
  result: CommitFinancialActionGroupLocallyResult
): void {
  if (
    result.kind === "replay" &&
    !SUCCESSFUL_REPLAY_STATES.has(result.record.state)
  ) {
    throw new Error("metal_sell_replay_requires_recovery");
  }
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}

function hasOwnedRaw(raw: unknown, userId: string, holdingId: string): boolean {
  return (
    raw !== null &&
    typeof raw === "object" &&
    "user_id" in raw &&
    raw.user_id === userId &&
    "holding_id" in raw &&
    raw.holding_id === holdingId
  );
}

function assertOwnedRows(
  userId: string,
  holdingId: string,
  rows: ReadonlyArray<{
    readonly table: string;
    readonly raw: Readonly<Model["_raw"]>;
  }>
): void {
  const allowedTables = new Set([
    "metal_action_evidence",
    "metal_holding_states",
    "metal_lifecycle_events",
    "metal_rate_references",
  ]);
  for (const row of rows) {
    if (
      !allowedTables.has(row.table) ||
      !hasOwnedRaw(row.raw, userId, holdingId)
    ) {
      throw new Error("metal_sell_ownership_failed");
    }
  }
}

function preparePlan(
  dependencies: SellMetalHoldingCommandDependencies,
  input: SellMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1,
  projection: Projection
): FinancialActionLinkedOperationPlan {
  assertProjection(projection, input);
  const occurredAt = new Date(input.occurredAt);
  const nextRevision = incrementCanonicalMetalRevision(
    input.expectedFinancialRevision
  );
  const payloadJson = JSON.stringify(envelope.payload);
  const evidence = dependencies.database
    .get<MetalActionEvidence>("metal_action_evidence")
    .prepareCreate((record): void => {
      // Server 068 (supabase/migrations/068_metals_domain.sql:1879-1884)
      // inserts metal_action_evidence.id = action_id and enforces
      // UNIQUE(user_id, action_id). The canonical local row MUST therefore use
      // actionId so pull updates it in place instead of colliding. The legacy
      // request field input.actionEvidenceId is intentionally ignored here.
      setPreparedId(record, input.actionId);
      record.actionId = input.actionId;
      record.canonicalHoldingRevision = nextRevision;
      record.deleted = false;
      record.domainPayloadJson = payloadJson;
      record.expectedHoldingRevision = input.expectedFinancialRevision;
      record.holdingId = input.holdingId;
      record.kind = "sell";
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const event = dependencies.database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((record): void => {
      // Server 068 (supabase/migrations/068_metals_domain.sql:1886-1896)
      // inserts metal_lifecycle_events.id = action_id and enforces
      // UNIQUE(user_id, action_id). The canonical local row MUST therefore use
      // actionId so pull updates it in place instead of colliding. The legacy
      // request field input.lifecycleEventId is intentionally ignored here.
      setPreparedId(record, input.actionId);
      record.actionId = input.actionId;
      record.deleted = false;
      record.holdingId = input.holdingId;
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.kind = "sell";
      record.occurredAt = occurredAt;
      record.payloadJson = payloadJson;
      record.predecessorEventId = input.predecessorEventId;
      record.reversesEventId = null;
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const rateReferences = input.rateSnapshots.map((snapshot) =>
    dependencies.database
      .get<MetalRateReference>("metal_rate_references")
      .prepareCreate((record): void => {
        setPreparedId(record, snapshot.referenceId);
        record.actionId = input.actionId;
        record.capturedAt = new Date(snapshot.capturedAt);
        record.capturedFreshness = snapshot.capturedFreshness;
        record.deleted = false;
        record.holdingId = input.holdingId;
        record.instrumentCode = snapshot.instrumentCode;
        record.kind = snapshot.kind;
        record.orientation = snapshot.orientation;
        record.providerObservedAt = snapshot.providerObservedAt
          ? new Date(snapshot.providerObservedAt)
          : null;
        record.quality = snapshot.quality;
        record.role = snapshot.role;
        record.source = snapshot.source;
        record.unit = snapshot.unit;
        record.updatedAt = occurredAt;
        record.userId = input.userId;
        record.valueDecimal = snapshot.valueDecimal;
      })
  );
  const plan: FinancialActionLinkedOperationPlan = {
    preparedCreates: [evidence, event, ...rateReferences],
    existingOperations: [
      {
        kind: "update",
        model: projection.state,
        update: (model): void => {
          const state = model as MetalHoldingState;
          state.effectiveActionId = input.actionId;
          state.effectiveEventId = input.actionId;
          state.financialRevision = nextRevision;
          state.reconciliationState = "sync_pending";
          state.status = "sold";
          state.updatedAt = occurredAt;
        },
      },
    ],
    assertCachedOwnership: ({ userId, cachedPreimages }): Promise<void> => {
      assertOwnedRows(userId, input.holdingId, cachedPreimages);
      return Promise.resolve();
    },
    assertPreparedOwnership: ({
      userId,
      preparedPostimages,
    }): Promise<void> => {
      assertOwnedRows(userId, input.holdingId, preparedPostimages);
      return Promise.resolve();
    },
  };
  return plan;
}

export function createSellMetalHoldingCommandService(
  dependencies: SellMetalHoldingCommandDependencies
): SellMetalHoldingCommandService {
  return Object.freeze({
    sell: async (
      input: SellMetalHoldingCommandInput
    ): Promise<SellMetalHoldingCommandResult> => {
      assertStableLocalIds(input);
      if (input.saleCurrency !== input.purchaseCurrency)
        throw new Error("metal_sale_currency_mismatch");
      const envelope = dependencies.createEnvelope(input, payloadFor(input));
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        validationInput: {
          latestAllowedCalendarDate: input.latestAllowedCalendarDate,
        },
        prepareLinkedOperationPlan: async () => {
          const projection = await loadProjection(dependencies, input);
          return preparePlan(dependencies, input, envelope, projection);
        },
      });
      assertSuccessfulReplay(result);
      return {
        kind: result.kind === "replay" ? "replay" : "committed",
        holdingId: input.holdingId,
      };
    },
  });
}
