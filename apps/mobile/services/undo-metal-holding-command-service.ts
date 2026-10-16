import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import {
  parseFinancialActionEnvelopeJson,
  parseFinancialActionEvidenceJson,
  serializeCanonicalJsonValue,
  type CanonicalJsonValue,
  type FinancialActionEnvelopeV1,
  type RegisteredActionPayload,
  type Sha256Provider,
} from "@monyvi/logic";

import type {
  CommitFinancialActionGroupLocallyInput,
  CommitFinancialActionGroupLocallyResult,
  FinancialActionLinkedOperationPlan,
  FinancialActionUserDataScope,
} from "./financial-action-foundation-repository";
import { incrementCanonicalMetalRevision } from "./metal-financial-action-adapter";
import { resolveMetalLifecycleIdentity } from "./metal-lifecycle-identity-service";

type TerminalKind = "sell" | "dispose";
type Commit = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;

interface UndoMetalHoldingTarget {
  readonly predecessorEventId: string;
  readonly reversesEventId: string;
  readonly holdingId: string;
  readonly userId: string;
  readonly expectedFinancialRevision: string;
}

export interface UndoMetalHoldingCommandInput extends UndoMetalHoldingTarget {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly occurredAt: string;
}

export interface UndoMetalHoldingReadDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<FinancialActionUserDataScope>;
}

export interface UndoMetalHoldingContext {
  readonly holdingId: string;
  readonly userId: string;
  readonly terminalKind: TerminalKind;
  readonly terminalEventId: string;
  readonly expectedFinancialRevision: string;
}

export interface UndoMetalHoldingCommandDependencies extends UndoMetalHoldingReadDependencies {
  readonly commitFinancialActionGroupLocally: Commit;
  readonly createEnvelope: (
    input: UndoMetalHoldingCommandInput,
    payload: RegisteredActionPayload
  ) => FinancialActionEnvelopeV1;
  readonly hashProvider: Sha256Provider;
}

export interface UndoMetalHoldingCommandService {
  readonly undo: (input: UndoMetalHoldingCommandInput) => Promise<{
    readonly kind: "committed" | "replay";
    readonly holdingId: string;
  }>;
}

export interface UndoMetalHoldingConsequences {
  readonly terminalKind: TerminalKind;
  readonly restoresSameHolding: true;
  readonly preservesTerminalHistory: true;
  readonly removesSaleResult: boolean;
  readonly removesDisposalTreatment: boolean;
  readonly hasAccountEffect: false;
  readonly hasOrdinaryIncomeEffect: false;
}

interface HoldingProjection {
  readonly asset: Asset;
  readonly state: MetalHoldingState;
  readonly terminalEvent: MetalLifecycleEvent;
}

interface TerminalProjection extends HoldingProjection {
  readonly terminalKind: TerminalKind;
  readonly terminalRoot: FinancialActionGroup;
  readonly terminalEvidence: MetalActionEvidence;
}

export function shapeUndoMetalHoldingConsequences(
  terminalKind: TerminalKind
): UndoMetalHoldingConsequences {
  return Object.freeze({
    terminalKind,
    restoresSameHolding: true,
    preservesTerminalHistory: true,
    removesSaleResult: terminalKind === "sell",
    removesDisposalTreatment: terminalKind === "dispose",
    hasAccountEffect: false,
    hasOrdinaryIncomeEffect: false,
  });
}

function payloadFor(
  input: UndoMetalHoldingCommandInput
): RegisteredActionPayload {
  return {
    expectedHoldingRevision: input.expectedFinancialRevision,
    holdingId: input.holdingId,
    predecessorEventId: input.predecessorEventId,
    reversesEventId: input.reversesEventId,
  };
}

async function loadHoldingProjection(
  dependencies: UndoMetalHoldingReadDependencies,
  input: UndoMetalHoldingTarget,
  scope: FinancialActionUserDataScope
): Promise<HoldingProjection> {
  const [assets, states, events] = await Promise.all([
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
    scope
      .queryOwned(
        dependencies.database.get<MetalLifecycleEvent>(
          "metal_lifecycle_events"
        ),
        Q.or(
          Q.where("id", input.predecessorEventId),
          Q.where("action_id", input.predecessorEventId)
        ),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false),
        Q.take(2)
      )
      .fetch(),
  ]);
  const [asset] = assets;
  const [state] = states;
  const [terminalEvent] = events;
  if (!asset || !state || asset.type !== "METAL") {
    throw new Error("metal_holding_not_found");
  }
  if (events.length !== 1 || !terminalEvent) {
    throw new Error("metal_undo_terminal_event_not_found");
  }
  return {
    asset: scope.assertOwned(asset),
    state: scope.assertOwned(state),
    terminalEvent: scope.assertOwned(terminalEvent),
  };
}

function assertTerminalEligibility(
  projection: HoldingProjection,
  input: UndoMetalHoldingTarget
): void {
  if (projection.terminalEvent.kind === "delete") {
    throw new Error("metal_undo_delete_forbidden");
  }
  if (input.predecessorEventId !== input.reversesEventId) {
    throw new Error("metal_undo_terminal_link_mismatch");
  }
  if (
    projection.state.status !== "sold" &&
    projection.state.status !== "disposed"
  ) {
    throw new Error("metal_undo_terminal_holding_required");
  }
  if (
    projection.state.effectiveEventId !== input.predecessorEventId &&
    !(
      projection.state.effectiveEventId === projection.terminalEvent.id &&
      projection.terminalEvent.actionId === input.predecessorEventId
    )
  ) {
    throw new Error("metal_undo_terminal_not_current");
  }
}

function terminalKindFor(projection: HoldingProjection): TerminalKind {
  if (
    projection.terminalEvent.kind !== "sell" &&
    projection.terminalEvent.kind !== "dispose"
  ) {
    throw new Error("metal_undo_terminal_kind_mismatch");
  }
  return projection.terminalEvent.kind;
}

function assertCurrentTerminal(
  projection: HoldingProjection,
  input: UndoMetalHoldingTarget,
  terminalKind: TerminalKind
): void {
  if (
    (projection.state.status === "sold" && terminalKind !== "sell") ||
    (projection.state.status === "disposed" && terminalKind !== "dispose")
  ) {
    throw new Error("metal_undo_terminal_kind_mismatch");
  }
  if (
    projection.state.financialRevision !== input.expectedFinancialRevision ||
    projection.state.reconciliationState === "reconciliation_incomplete" ||
    !projection.state.isVisible ||
    !projection.terminalEvent.isEffective ||
    !projection.terminalEvent.isHistoryVisible
  ) {
    throw new Error("holding_revision_conflict");
  }
}

async function loadTerminalEvidence(
  dependencies: UndoMetalHoldingReadDependencies,
  input: UndoMetalHoldingTarget,
  projection: HoldingProjection,
  scope: FinancialActionUserDataScope
): Promise<readonly [FinancialActionGroup, MetalActionEvidence]> {
  const [roots, evidenceRows] = await Promise.all([
    scope
      .queryOwned(
        dependencies.database.get<FinancialActionGroup>(
          "financial_action_groups"
        ),
        Q.where("action_id", projection.terminalEvent.actionId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("action_id", projection.terminalEvent.actionId),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
  ]);
  const [root] = roots;
  const [evidence] = evidenceRows;
  if (!root) throw new Error("metal_undo_terminal_action_not_found");
  if (!evidence) throw new Error("metal_undo_terminal_action_mismatch");
  return [scope.assertOwned(root), scope.assertOwned(evidence)];
}

function parseAccountGuardCount(accountGuardsJson: string): number {
  try {
    const value: unknown = JSON.parse(accountGuardsJson);
    if (!Array.isArray(value)) {
      throw new Error("metal_undo_terminal_action_mismatch");
    }
    return value.length;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "metal_undo_terminal_action_mismatch"
    ) {
      throw error;
    }
    throw new Error("metal_undo_terminal_action_mismatch");
  }
}

const MAX_DEVICE_LOCAL_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;

function latestPossibleDeviceLocalDateAtOccurrence(occurredAt: Date): string {
  // New actions use the device's actual local calendar, not Cairo's. The
  // originating timezone is not persisted, so the latest possible civil date
  // at this immutable instant is the global UTC+14 limit. This is a calendar
  // upper bound, not a 24-hour grace period or a new-action date policy.
  const latestPossibleLocalDate = new Date(
    occurredAt.getTime() + MAX_DEVICE_LOCAL_UTC_OFFSET_MS
  );
  return latestPossibleLocalDate.toISOString().slice(0, 10);
}

function isCanonicalEvidenceValue(value: unknown): value is CanonicalJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isCanonicalEvidenceValue);
  return (
    typeof value === "object" &&
    Object.values(value).every(isCanonicalEvidenceValue)
  );
}

function canonicalEvidencePayload(raw: string): string {
  const parsed = parseFinancialActionEvidenceJson(raw);
  if (
    !isCanonicalEvidenceValue(parsed) ||
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
  return serializeCanonicalJsonValue(parsed);
}

function assertImmutableTerminalPayload(
  projection: TerminalProjection,
  input: UndoMetalHoldingTarget
): void {
  const { terminalEvent, terminalEvidence, terminalKind, terminalRoot } =
    projection;
  if (!Number.isFinite(terminalEvent.occurredAt.getTime())) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
  try {
    // Historical evidence is bounded by its immutable occurrence, not the
    // current device clock. This does not relax new-action date validation.
    const envelope = parseFinancialActionEnvelopeJson(
      terminalRoot.payloadJson,
      undefined,
      {
        latestAllowedCalendarDate: latestPossibleDeviceLocalDateAtOccurrence(
          terminalEvent.occurredAt
        ),
      }
    );
    const payload = envelope.payload;
    const canonicalPayload = serializeCanonicalJsonValue(payload);
    if (
      envelope.envelopeVersion !== "monyvi.financial-action/v1" ||
      envelope.payloadVersion !==
        (terminalKind === "sell" ? "metals.sell/v2" : "metals.dispose/v1") ||
      envelope.actionId !== terminalRoot.actionId ||
      envelope.userId !== input.userId ||
      envelope.domain !== "metals" ||
      envelope.domainReferenceId !== input.holdingId ||
      envelope.kind !== terminalKind ||
      envelope.occurredAt !== terminalEvent.occurredAt.toISOString() ||
      envelope.accountGuards.length !== 0 ||
      terminalRoot.userId !== input.userId ||
      terminalEvent.userId !== input.userId ||
      terminalEvent.holdingId !== input.holdingId ||
      terminalEvidence.userId !== input.userId ||
      payload.holdingId !== input.holdingId ||
      payload.expectedHoldingRevision !==
        terminalEvidence.expectedHoldingRevision ||
      payload.predecessorEventId !== terminalEvent.predecessorEventId ||
      payload.reversesEventId !== terminalEvent.reversesEventId ||
      terminalEvent.reversesEventId !== null ||
      typeof terminalEvidence.expectedHoldingRevision !== "string" ||
      incrementCanonicalMetalRevision(
        terminalEvidence.expectedHoldingRevision
      ) !== input.expectedFinancialRevision ||
      canonicalPayload !==
        canonicalEvidencePayload(terminalEvent.payloadJson) ||
      canonicalPayload !==
        canonicalEvidencePayload(terminalEvidence.domainPayloadJson)
    ) {
      throw new Error("metal_undo_terminal_action_mismatch");
    }
  } catch {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
}

function assertTerminalEvidence(
  projection: TerminalProjection,
  input: UndoMetalHoldingTarget
): void {
  const { terminalEvent, terminalEvidence, terminalKind, terminalRoot } =
    projection;
  if (
    terminalRoot.actionId !== terminalEvent.actionId ||
    terminalRoot.domain !== "metals" ||
    terminalRoot.domainReferenceId !== input.holdingId ||
    terminalRoot.kind !== terminalKind ||
    projection.state.effectiveActionId !== terminalRoot.actionId ||
    terminalEvidence.actionId !== terminalRoot.actionId ||
    terminalEvidence.holdingId !== input.holdingId ||
    terminalEvidence.kind !== terminalKind ||
    terminalEvidence.canonicalHoldingRevision !==
      input.expectedFinancialRevision ||
    !SUCCESSFUL_ACTION_STATES.has(terminalRoot.state)
  ) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
  const accountGuardCount = parseAccountGuardCount(
    terminalRoot.accountGuardsJson
  );
  if (terminalKind === "sell" && accountGuardCount > 0) {
    throw new Error("metal_undo_credited_sale_blocked");
  }
  if (terminalKind === "dispose" && accountGuardCount > 0) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
  assertImmutableTerminalPayload(projection, input);
}

async function loadProjection(
  dependencies: UndoMetalHoldingReadDependencies,
  input: UndoMetalHoldingTarget
): Promise<TerminalProjection> {
  const scope = await dependencies.getCurrentUserDataScope();
  if (scope.userId !== input.userId) {
    throw new Error("financial_action_auth_scope_changed");
  }
  const holding = await loadHoldingProjection(dependencies, input, scope);
  assertTerminalEligibility(holding, input);
  const terminalKind = terminalKindFor(holding);
  assertCurrentTerminal(holding, input, terminalKind);
  const [terminalRoot, terminalEvidence] = await loadTerminalEvidence(
    dependencies,
    input,
    holding,
    scope
  );
  const projection: TerminalProjection = {
    ...holding,
    terminalKind,
    terminalRoot,
    terminalEvidence,
  };
  assertTerminalEvidence(projection, input);
  if (projection.terminalEvent.id !== projection.terminalEvent.actionId) {
    await assertOwnedLegacyTerminalAlias(
      dependencies,
      scope,
      input.userId,
      input.holdingId,
      projection.terminalEvent
    );
  }
  return projection;
}

export async function readUndoMetalHoldingContext(
  dependencies: UndoMetalHoldingReadDependencies,
  holdingId: string,
  userId: string
): Promise<UndoMetalHoldingContext> {
  const scope = await dependencies.getCurrentUserDataScope();
  if (scope.userId !== userId)
    throw new Error("financial_action_auth_scope_changed");
  const [state] = await scope
    .queryOwned(
      dependencies.database.get<MetalHoldingState>("metal_holding_states"),
      Q.where("holding_id", holdingId),
      Q.where("deleted", false),
      Q.take(1)
    )
    .fetch();
  if (!state) throw new Error("metal_holding_not_found");
  scope.assertOwned(state);
  const terminalEventId = state.effectiveEventId;
  if (terminalEventId === null)
    throw new Error("metal_undo_terminal_event_not_found");
  const projection = await loadProjection(dependencies, {
    holdingId,
    userId,
    predecessorEventId: terminalEventId,
    reversesEventId: terminalEventId,
    expectedFinancialRevision: state.financialRevision,
  });
  return Object.freeze({
    holdingId,
    userId,
    terminalEventId,
    terminalKind: projection.terminalKind,
    expectedFinancialRevision: projection.state.financialRevision,
  });
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
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
  ]);
  for (const row of rows) {
    const raw = row.raw as unknown as Readonly<Record<string, unknown>>;
    if (
      !allowedTables.has(row.table) ||
      raw["user_id"] !== userId ||
      raw["holding_id"] !== holdingId
    ) {
      throw new Error("metal_undo_ownership_failed");
    }
  }
}

function prepareReversalEvidence(
  dependencies: UndoMetalHoldingCommandDependencies,
  input: UndoMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1,
  occurredAt: Date,
  nextRevision: string
): readonly [MetalActionEvidence, MetalLifecycleEvent] {
  const payloadJson = JSON.stringify(envelope.payload);
  const evidence = dependencies.database
    .get<MetalActionEvidence>("metal_action_evidence")
    .prepareCreate((record): void => {
      setPreparedId(record, input.actionId);
      record.actionId = input.actionId;
      record.canonicalHoldingRevision = nextRevision;
      record.deleted = false;
      record.domainPayloadJson = payloadJson;
      record.expectedHoldingRevision = input.expectedFinancialRevision;
      record.holdingId = input.holdingId;
      record.kind = "undo";
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  const event = dependencies.database
    .get<MetalLifecycleEvent>("metal_lifecycle_events")
    .prepareCreate((record): void => {
      setPreparedId(record, input.actionId);
      record.actionId = input.actionId;
      record.deleted = false;
      record.holdingId = input.holdingId;
      record.isEffective = true;
      record.isHistoryVisible = true;
      record.kind = "undo";
      record.occurredAt = occurredAt;
      record.payloadJson = payloadJson;
      record.predecessorEventId = input.predecessorEventId;
      record.reversesEventId = input.reversesEventId;
      record.updatedAt = occurredAt;
      record.userId = input.userId;
    });
  return [evidence, event];
}

function preparePlan(
  dependencies: UndoMetalHoldingCommandDependencies,
  input: UndoMetalHoldingCommandInput,
  envelope: FinancialActionEnvelopeV1,
  projection: TerminalProjection
): FinancialActionLinkedOperationPlan {
  const occurredAt = new Date(input.occurredAt);
  const nextRevision = incrementCanonicalMetalRevision(
    input.expectedFinancialRevision
  );
  const preparedCreates = prepareReversalEvidence(
    dependencies,
    input,
    envelope,
    occurredAt,
    nextRevision
  );
  return {
    preparedCreates,
    existingOperations: [
      {
        kind: "update",
        model: projection.state,
        update: (model): void => {
          const state = model as MetalHoldingState;
          state.effectiveActionId = input.actionId;
          state.effectiveEventId = input.actionId;
          state.financialRevision = nextRevision;
          state.isVisible = true;
          state.reconciliationState = "sync_pending";
          state.status = "active";
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
}

async function assertOwnedLegacyTerminalAlias(
  dependencies: UndoMetalHoldingReadDependencies,
  scope: FinancialActionUserDataScope,
  userId: string,
  holdingId: string,
  candidate: MetalLifecycleEvent
): Promise<void> {
  if (
    candidate.kind !== "dispose" ||
    candidate.predecessorEventId !== null ||
    candidate.reversesEventId !== null
  ) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
  const [events, groups, evidence] = await Promise.all([
    scope
      .queryOwned(
        dependencies.database.get<MetalLifecycleEvent>(
          "metal_lifecycle_events"
        ),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<FinancialActionGroup>(
          "financial_action_groups"
        ),
        Q.where("domain", "metals"),
        Q.where("domain_reference_id", holdingId),
        Q.where("deleted", false)
      )
      .fetch(),
    scope
      .queryOwned(
        dependencies.database.get<MetalActionEvidence>("metal_action_evidence"),
        Q.where("holding_id", holdingId),
        Q.where("deleted", false)
      )
      .fetch(),
  ]);
  const identity = resolveMetalLifecycleIdentity({
    userId,
    holdingId,
    events,
    groups,
    evidence,
  });
  if (
    identity.legacyRootEventId !== candidate.id ||
    identity.canonicalRootActionId !== candidate.actionId
  ) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
}

async function canonicalUndoInput(
  dependencies: UndoMetalHoldingReadDependencies,
  input: UndoMetalHoldingCommandInput
): Promise<UndoMetalHoldingCommandInput> {
  // Resolve the immutable original action before hashing. This lookup does not
  // require a still-terminal holding: replay after Restore must retain the
  // same canonical payload/hash as the first offline commit.
  const scope = await dependencies.getCurrentUserDataScope();
  if (scope.userId !== input.userId) {
    throw new Error("financial_action_auth_scope_changed");
  }
  const rows = await scope
    .queryOwned(
      dependencies.database.get<MetalLifecycleEvent>("metal_lifecycle_events"),
      Q.or(
        Q.where("id", input.predecessorEventId),
        Q.where("action_id", input.predecessorEventId)
      ),
      Q.where("holding_id", input.holdingId),
      Q.where("deleted", false),
      Q.take(2)
    )
    .fetch();
  if (rows.length !== 1) {
    throw new Error("metal_undo_terminal_event_not_found");
  }
  const candidate = scope.assertOwned(rows[0]);
  if (candidate.actionId === candidate.id) return input;
  if (
    candidate.kind !== "dispose" ||
    candidate.predecessorEventId !== null ||
    candidate.reversesEventId !== null
  ) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
  await assertOwnedLegacyTerminalAlias(
    dependencies,
    scope,
    input.userId,
    input.holdingId,
    candidate
  );
  return {
    ...input,
    predecessorEventId: candidate.actionId,
    reversesEventId: candidate.actionId,
  };
}

export function createUndoMetalHoldingCommandService(
  dependencies: UndoMetalHoldingCommandDependencies
): UndoMetalHoldingCommandService {
  return Object.freeze({
    undo: async (
      input: UndoMetalHoldingCommandInput
    ): Promise<{
      readonly kind: "committed" | "replay";
      readonly holdingId: string;
    }> => {
      if (input.predecessorEventId !== input.reversesEventId) {
        throw new Error("metal_undo_terminal_link_mismatch");
      }
      const canonicalInput = await canonicalUndoInput(dependencies, input);
      const envelope = dependencies.createEnvelope(
        canonicalInput,
        payloadFor(canonicalInput)
      );
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        prepareLinkedOperationPlan:
          async (): Promise<FinancialActionLinkedOperationPlan> => {
            const projection = await loadProjection(dependencies, input);
            return preparePlan(
              dependencies,
              canonicalInput,
              envelope,
              projection
            );
          },
      });
      if (
        result.kind === "replay" &&
        !SUCCESSFUL_ACTION_STATES.has(result.record.state)
      ) {
        throw new Error("metal_undo_replay_requires_recovery");
      }
      return { kind: result.kind, holdingId: input.holdingId };
    },
  });
}

const SUCCESSFUL_ACTION_STATES: ReadonlySet<string> = new Set([
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
]);
