import {
  Q,
  type Collection,
  type Database,
  type Model,
} from "@nozbe/watermelondb";
import {
  hashFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type Sha256Provider,
} from "@monyvi/logic";
import type {
  FinancialActionGroup,
  MetalActionEvidence,
  MetalHoldingState,
  MetalLifecycleEvent,
} from "@monyvi/db";

import {
  METAL_FINANCIAL_ACTION_REGISTRY,
  incrementCanonicalMetalRevision,
} from "./metal-financial-action-adapter";

export interface MetalPersistenceRecord extends Readonly<Record<string, unknown>> {
  readonly table: string;
  readonly actionId?: string;
  readonly userId?: string;
}

export interface MetalFinancialActionRepositoryDependencies {
  readonly getCurrentUserId: () => Promise<string>;
  readonly runWriter: <T>(writer: () => Promise<T>) => Promise<T>;
  readonly findAction: (
    userId: string,
    actionId: string
  ) => Promise<object | null>;
  readonly findEvidence?: (
    userId: string,
    actionId: string
  ) => Promise<object | null>;
  readonly persistAtomically: (
    records: readonly MetalPersistenceRecord[]
  ) => Promise<void>;
}

export interface CommitMetalFinancialActionInput {
  readonly envelope: FinancialActionEnvelopeV1;
  readonly expectedHoldingRevision?: string | null;
  readonly domainPayload?: Readonly<Record<string, unknown>>;
  readonly hashProvider: Sha256Provider;
}

export type MetalFinancialActionCommitResult =
  | { readonly kind: "committed"; readonly actionId: string }
  | { readonly kind: "replay"; readonly actionId: string };

export interface MetalFinancialActionRepository {
  readonly commit: (
    input: CommitMetalFinancialActionInput
  ) => Promise<MetalFinancialActionCommitResult>;
}

function field(record: object, camel: string, snake: string): unknown {
  const values = record as Readonly<Record<string, unknown>>;
  const camelValue = values[camel];
  return camelValue === undefined ? values[snake] : camelValue;
}

function nullableStringField(record: MetalPersistenceRecord, name: string): string | null {
  const value = record[name];
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("invalid_metal_persistence_record");
  return value;
}

function assertReplayMatches(
  existing: object,
  payloadJson: string,
  payloadHash: string
): void {
  if (
    field(existing, "payloadJson", "payload_json") !== payloadJson ||
    field(existing, "payloadHash", "payload_hash") !== payloadHash
  ) {
    throw new Error("action_id_payload_mismatch");
  }
}

function createRecords(
  input: CommitMetalFinancialActionInput,
  payloadJson: string,
  payloadHash: string
): readonly MetalPersistenceRecord[] {
  const expectedRevision = input.expectedHoldingRevision ?? null;
  const canonicalRevision =
    expectedRevision === null ? "0" : incrementCanonicalMetalRevision(expectedRevision);
  const common = {
    actionId: input.envelope.actionId,
    userId: input.envelope.userId,
  };
  return [
    {
      ...common,
      table: "financial_action_groups",
      domain: "metals",
      kind: input.envelope.kind,
      domainReferenceId: input.envelope.actionId,
      payloadJson,
      payloadHash,
      accountGuardsJson: "[]",
      state: "local_complete",
      serverOutcome: null,
      outcomeJson: null,
      rejectionCode: null,
      deleted: false,
    },
    {
      ...common,
      table: "metal_action_evidence",
      holdingId: input.envelope.payload.holdingId,
      kind: input.envelope.kind,
      expectedHoldingRevision: expectedRevision,
      canonicalHoldingRevision: null,
      domainPayloadJson: JSON.stringify(input.domainPayload ?? {}),
      deleted: false,
    },
    {
      ...common,
      table: "metal_lifecycle_events",
      holdingId: input.envelope.payload.holdingId,
      kind: input.envelope.kind,
      occurredAt: input.envelope.occurredAt,
      payloadJson: JSON.stringify(input.domainPayload ?? {}),
      predecessorEventId: null,
      reversesEventId: null,
      isEffective: true,
      isHistoryVisible: input.envelope.kind !== "delete",
      deleted: false,
    },
    {
      ...common,
      table: "metal_holding_states",
      holdingId: input.envelope.payload.holdingId,
      status:
        input.envelope.kind === "sell"
          ? "sold"
          : input.envelope.kind === "dispose"
            ? "disposed"
            : "active",
      financialRevision: canonicalRevision,
      expectedHoldingRevision: expectedRevision,
      effectiveEventId: null,
      effectiveActionId: input.envelope.actionId,
      isVisible: input.envelope.kind !== "delete",
      reconciliationState: "local_complete",
      deleted: false,
    },
  ];
}

export function createMetalFinancialActionRepository(
  dependencies: MetalFinancialActionRepositoryDependencies
): MetalFinancialActionRepository {
  async function commit(
    input: CommitMetalFinancialActionInput
  ): Promise<MetalFinancialActionCommitResult> {
    const currentUserId = await dependencies.getCurrentUserId();
    if (currentUserId !== input.envelope.userId) {
      throw new Error("metal_action_auth_scope_changed");
    }
    const payload = await hashFinancialActionEnvelope(
      input.envelope,
      input.hashProvider,
      METAL_FINANCIAL_ACTION_REGISTRY
    );

    return dependencies.runWriter(async (): Promise<MetalFinancialActionCommitResult> => {
      if ((await dependencies.getCurrentUserId()) !== currentUserId) {
        throw new Error("metal_action_auth_scope_changed");
      }
      const existing = await dependencies.findAction(currentUserId, input.envelope.actionId);
      if (existing) {
        assertReplayMatches(existing, payload.canonicalText, payload.payloadHash);
        const evidence = await dependencies.findEvidence?.(
          currentUserId,
          input.envelope.actionId
        );
        if (
          evidence &&
          field(evidence, "expectedHoldingRevision", "expected_holding_revision") !==
            (input.expectedHoldingRevision ?? null)
        ) {
          throw new Error("action_id_payload_mismatch");
        }
        return { kind: "replay", actionId: input.envelope.actionId };
      }
      await dependencies.persistAtomically(
        createRecords(input, payload.canonicalText, payload.payloadHash)
      );
      if ((await dependencies.getCurrentUserId()) !== currentUserId) {
        throw new Error("metal_action_auth_scope_changed");
      }
      return { kind: "committed", actionId: input.envelope.actionId };
    });
  }

  return Object.freeze({ commit });
}

export interface WatermelonMetalRepositoryInput {
  readonly database: Database;
  readonly userId: string;
}

function prepareRoot(
  collection: Collection<FinancialActionGroup>,
  record: MetalPersistenceRecord
): Model {
  return collection.prepareCreate((candidate) => {
    candidate.actionId = String(record.actionId);
    candidate.userId = String(record.userId);
    candidate.domain = String(record.domain);
    candidate.kind = String(record.kind);
    candidate.domainReferenceId = String(record.domainReferenceId);
    candidate.payloadJson = String(record.payloadJson);
    candidate.payloadHash = String(record.payloadHash);
    candidate.accountGuardsJson = String(record.accountGuardsJson);
    candidate.state = String(record.state);
    candidate.serverOutcome = null;
    candidate.outcomeJson = null;
    candidate.rejectionCode = null;
    candidate.deleted = false;
    candidate.updatedAt = new Date();
  });
}

function prepareEvidence(
  collection: Collection<MetalActionEvidence>,
  record: MetalPersistenceRecord
): Model {
  return collection.prepareCreate((candidate) => {
    candidate.actionId = String(record.actionId);
    candidate.userId = String(record.userId);
    candidate.holdingId = String(record.holdingId);
    candidate.kind = String(record.kind);
    candidate.expectedHoldingRevision = nullableStringField(
      record,
      "expectedHoldingRevision"
    );
    candidate.canonicalHoldingRevision = null;
    candidate.domainPayloadJson = String(record.domainPayloadJson);
    candidate.deleted = false;
    candidate.updatedAt = new Date();
  });
}

function prepareEvent(
  collection: Collection<MetalLifecycleEvent>,
  record: MetalPersistenceRecord
): MetalLifecycleEvent {
  return collection.prepareCreate((candidate) => {
    candidate.actionId = String(record.actionId);
    candidate.userId = String(record.userId);
    candidate.holdingId = String(record.holdingId);
    candidate.kind = String(record.kind);
    candidate.occurredAt = new Date(String(record.occurredAt));
    candidate.payloadJson = String(record.payloadJson);
    candidate.predecessorEventId = null;
    candidate.reversesEventId = null;
    candidate.isEffective = true;
    candidate.isHistoryVisible = Boolean(record.isHistoryVisible);
    candidate.deleted = false;
    candidate.updatedAt = new Date();
  });
}

async function prepareState(
  collection: Collection<MetalHoldingState>,
  record: MetalPersistenceRecord,
  effectiveEventId: string
): Promise<Model> {
  const existing = (
    await collection
      .query(
        Q.where("user_id", String(record.userId)),
        Q.where("holding_id", String(record.holdingId))
      )
      .fetch()
  )[0];
  const expectedRevision = record.expectedHoldingRevision;
  if (expectedRevision !== null && typeof expectedRevision !== "string") {
    throw new Error("invalid_metal_persistence_record");
  }
  if (expectedRevision === null) {
    if (existing) throw new Error("metal_holding_already_exists");
  } else if (
    !existing ||
    existing.financialRevision !== expectedRevision
  ) {
    throw new Error("metal_holding_revision_stale");
  }
  const update = (candidate: MetalHoldingState): void => {
    candidate.userId = String(record.userId);
    candidate.holdingId = String(record.holdingId);
    candidate.status = String(record.status);
    candidate.financialRevision = String(record.financialRevision);
    candidate.effectiveEventId = effectiveEventId;
    candidate.effectiveActionId = String(record.effectiveActionId);
    candidate.isVisible = Boolean(record.isVisible);
    candidate.reconciliationState = String(record.reconciliationState);
    candidate.deleted = false;
    candidate.updatedAt = new Date();
  };
  return existing ? existing.prepareUpdate(update) : collection.prepareCreate(update);
}

export function createWatermelonMetalFinancialActionRepositoryDependencies(
  input: WatermelonMetalRepositoryInput
): MetalFinancialActionRepositoryDependencies {
  const roots = input.database.get<FinancialActionGroup>("financial_action_groups");
  const evidence = input.database.get<MetalActionEvidence>("metal_action_evidence");
  const events = input.database.get<MetalLifecycleEvent>("metal_lifecycle_events");
  const states = input.database.get<MetalHoldingState>("metal_holding_states");

  return {
    getCurrentUserId: () => Promise.resolve(input.userId),
    runWriter: (writer) => input.database.write(writer),
    findAction: async (userId, actionId) =>
      (
        await roots
          .query(Q.where("user_id", userId), Q.where("action_id", actionId))
          .fetch()
      )[0] ?? null,
    findEvidence: async (userId, actionId) =>
      (
        await evidence
          .query(Q.where("user_id", userId), Q.where("action_id", actionId))
          .fetch()
      )[0] ?? null,
    persistAtomically: async (records): Promise<void> => {
      const operations: Model[] = [];
      let effectiveEventId: string | null = null;
      for (const record of records) {
        if (record.table === "financial_action_groups") operations.push(prepareRoot(roots, record));
        if (record.table === "metal_action_evidence") operations.push(prepareEvidence(evidence, record));
        if (record.table === "metal_lifecycle_events") {
          const event = prepareEvent(events, record);
          effectiveEventId = event.id;
          operations.push(event);
        }
        if (record.table === "metal_holding_states") {
          if (effectiveEventId === null) throw new Error("metal_lifecycle_event_missing");
          operations.push(await prepareState(states, record, effectiveEventId));
        }
      }
      await input.database.batch(...operations);
    },
  };
}
