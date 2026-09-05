import { Q, type Database, type Model } from "@nozbe/watermelondb";
import type {
  Asset,
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";
import type {
  FinancialActionEnvelopeV1,
  RegisteredActionPayload,
  Sha256Provider,
} from "@monyvi/logic";

import type {
  CommitFinancialActionGroupLocallyInput,
  CommitFinancialActionGroupLocallyResult,
  FinancialActionLinkedOperationPlan,
  FinancialActionUserDataScope,
} from "./financial-action-foundation-repository";
import { incrementCanonicalMetalRevision } from "./metal-financial-action-adapter";

type TerminalKind = "sell" | "dispose";
type Commit = (
  input: CommitFinancialActionGroupLocallyInput
) => Promise<CommitFinancialActionGroupLocallyResult>;

export interface UndoMetalHoldingCommandInput {
  readonly actionId: string;
  readonly actionEvidenceId: string;
  readonly lifecycleEventId: string;
  readonly predecessorEventId: string;
  readonly reversesEventId: string;
  readonly holdingId: string;
  readonly userId: string;
  readonly occurredAt: string;
  readonly expectedFinancialRevision: string;
}

export interface UndoMetalHoldingCommandDependencies {
  readonly database: Database;
  readonly getCurrentUserDataScope: () => Promise<FinancialActionUserDataScope>;
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
  } as unknown as RegisteredActionPayload;
}

async function loadHoldingProjection(
  dependencies: UndoMetalHoldingCommandDependencies,
  input: UndoMetalHoldingCommandInput,
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
        Q.where("id", input.predecessorEventId),
        Q.where("holding_id", input.holdingId),
        Q.where("deleted", false),
        Q.take(1)
      )
      .fetch(),
  ]);
  const [asset] = assets;
  const [state] = states;
  const [terminalEvent] = events;
  if (!asset || !state || asset.type !== "METAL")
    throw new Error("metal_holding_not_found");
  if (!terminalEvent) throw new Error("metal_undo_terminal_event_not_found");
  return {
    asset: scope.assertOwned(asset),
    state: scope.assertOwned(state),
    terminalEvent: scope.assertOwned(terminalEvent),
  };
}

function assertTerminalEligibility(
  projection: HoldingProjection,
  input: UndoMetalHoldingCommandInput
): void {
  if (projection.terminalEvent.kind === "delete")
    throw new Error("metal_undo_delete_forbidden");
  if (input.predecessorEventId !== input.reversesEventId)
    throw new Error("metal_undo_terminal_link_mismatch");
  if (
    projection.state.status !== "sold" &&
    projection.state.status !== "disposed"
  ) {
    throw new Error("metal_undo_terminal_holding_required");
  }
  if (projection.state.effectiveEventId !== input.predecessorEventId)
    throw new Error("metal_undo_terminal_not_current");
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
  input: UndoMetalHoldingCommandInput,
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
    !projection.state.isVisible ||
    !projection.terminalEvent.isEffective ||
    !projection.terminalEvent.isHistoryVisible
  ) {
    throw new Error("holding_revision_conflict");
  }
}

async function loadTerminalEvidence(
  dependencies: UndoMetalHoldingCommandDependencies,
  input: UndoMetalHoldingCommandInput,
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
    if (!Array.isArray(value))
      throw new Error("metal_undo_terminal_action_mismatch");
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

function assertTerminalEvidence(
  projection: TerminalProjection,
  input: UndoMetalHoldingCommandInput
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
      input.expectedFinancialRevision
  ) {
    throw new Error("metal_undo_terminal_action_mismatch");
  }
  const accountGuardCount = parseAccountGuardCount(
    terminalRoot.accountGuardsJson
  );
  if (terminalKind === "sell" && accountGuardCount > 0)
    throw new Error("metal_undo_credited_sale_blocked");
  if (terminalKind === "dispose" && accountGuardCount > 0)
    throw new Error("metal_undo_terminal_action_mismatch");
}

async function loadProjection(
  dependencies: UndoMetalHoldingCommandDependencies,
  input: UndoMetalHoldingCommandInput
): Promise<TerminalProjection> {
  const scope = await dependencies.getCurrentUserDataScope();
  if (scope.userId !== input.userId)
    throw new Error("financial_action_auth_scope_changed");
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
  return projection;
}

function setPreparedId(model: Model, id: string): void {
  model._raw.id = id;
}

function assertOwnedRows(
  userId: string,
  holdingId: string,
  rows: readonly {
    readonly table: string;
    readonly raw: Readonly<Model["_raw"]>;
  }[]
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
      setPreparedId(record, input.actionEvidenceId);
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
      setPreparedId(record, input.lifecycleEventId);
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
          state.effectiveEventId = input.lifecycleEventId;
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

export function createUndoMetalHoldingCommandService(
  dependencies: UndoMetalHoldingCommandDependencies
): UndoMetalHoldingCommandService {
  return Object.freeze({
    undo: async (input: UndoMetalHoldingCommandInput) => {
      if (input.predecessorEventId !== input.reversesEventId)
        throw new Error("metal_undo_terminal_link_mismatch");
      const envelope = dependencies.createEnvelope(input, payloadFor(input));
      const result = await dependencies.commitFinancialActionGroupLocally({
        envelope,
        hashProvider: dependencies.hashProvider,
        prepareLinkedOperationPlan: async () => {
          const projection = await loadProjection(dependencies, input);
          return preparePlan(dependencies, input, envelope, projection);
        },
      });
      return { kind: result.kind, holdingId: input.holdingId };
    },
  });
}
