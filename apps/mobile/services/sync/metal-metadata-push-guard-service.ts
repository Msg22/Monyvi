import type { Database } from "@nozbe/watermelondb";
import * as Crypto from "expo-crypto";
import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import {
  commitCanonicalMetalMetadataEditOutcomeLocally,
  discardRejectedMixedMetadataEvidence,
} from "../metal-metadata-evidence-reconciliation";
import {
  createMetalMetadataDedicatedPushCoordinator,
  type PendingMetalMetadataEditPush,
} from "../metal-metadata-dedicated-sync-service";
import { readCanonicalMixedMetalMetadataOutcome } from "../metal-metadata-server-outcome-service";
import {
  commitMetalRpcOutcomeLocally,
  type MetalRpcOutcome,
} from "../metal-reconciliation-service";
import { getCurrentUserId } from "../supabase";
import { changedRecords, excludeHoldingActions } from "./metal-row-routing";

export const METAL_METADATA_RPC = "apply_metal_metadata_edit_v1";

const metalOutcomeHashProvider = {
  digestUtf8: (value: string): Promise<string> =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
};

export type MetalOutcomeCommitter = (
  outcome: MetalRpcOutcome
) => Promise<"accepted" | "reconciled" | "incomplete">;

export type MetalMetadataOutcomeCommitter = (
  outcome: unknown,
  editId: string,
  holdingId: string
) => Promise<void>;

export type MixedMetalMetadataOutcomeLoader = (
  editId: string,
  holdingId: string,
  userId: string,
  payloadHash: string
) => Promise<unknown>;

export interface MetalRpcResult {
  readonly data: unknown;
  readonly error: unknown;
}

export type MetalSyncRpc = (
  name: string,
  args: Readonly<Record<string, unknown>>
) => Promise<MetalRpcResult>;

export interface ValidatedPendingMetalMetadataEdits {
  readonly editRequests: readonly PendingMetalMetadataEditPush[];
  readonly durableHoldingIds: ReadonlySet<string>;
}

export interface UnversionedMetadataGuardResult {
  readonly metadataHoldingIds: ReadonlySet<string>;
  readonly earlyExit?: {
    readonly acknowledgeAllDedicatedRows: false;
    readonly acknowledgedActionIds: ReadonlySet<string>;
  };
}

export function readChangedColumns(record: unknown): readonly string[] {
  if (typeof record !== "object" || record === null) return [];
  const changed = (record as Record<string, unknown>)._changed;
  if (typeof changed !== "string" || changed.length === 0) return [];
  return Object.freeze(changed.split(","));
}

export function assertNoOrphanedMetalMetadata(
  changes: SyncPushArgs["changes"]
): void {
  const hasOrphanedMetadata = changedRecords(changes, "assets").some(
    (record) =>
      record.type === "METAL" &&
      readChangedColumns(record).some(
        (column) => column === "name" || column === "notes"
      )
  );
  if (hasOrphanedMetadata) {
    throw new Error("metal_metadata_edit_request_missing");
  }
}

export function asRpcObject(
  value: unknown
): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

export function metalMetadataField(
  state: Record<string, unknown>,
  asset: Record<string, unknown>,
  field: "name" | "notes"
): Readonly<Record<string, unknown>> | null | false {
  const writtenAt = state[`${field}_written_at`];
  const writerId = state[`${field}_writer_id`];
  if (writtenAt === null || writtenAt === undefined) {
    return writerId === null || writerId === undefined ? null : false;
  }
  const value = asset[field];
  if (
    typeof writtenAt !== "number" ||
    !Number.isSafeInteger(writtenAt) ||
    typeof writerId !== "string" ||
    (field === "name"
      ? typeof value !== "string"
      : value !== null && typeof value !== "string")
  ) {
    return false;
  }
  return { value, writtenAt, writerId };
}

export function parseAndValidatePendingMetalMetadataEdits(
  changes: SyncPushArgs["changes"],
  userId: string
): ValidatedPendingMetalMetadataEdits {
  const editRecords = changedRecords(changes, "metal_metadata_edit_outcomes");
  const durableHoldingIds = new Set<string>();
  const editRequests: PendingMetalMetadataEditPush[] = editRecords.map(
    (record) => {
      const id = record.id;
      const owner = record.user_id;
      const holdingId = record.holding_id;
      const status = record.status;
      const payloadHash = record.payload_hash;
      const requestJson = record.request_json;
      const actionId = record.action_id;
      const occurredAt = record.occurred_at;
      if (
        typeof id !== "string" ||
        typeof owner !== "string" ||
        typeof holdingId !== "string" ||
        typeof payloadHash !== "string" ||
        typeof requestJson !== "string" ||
        (actionId !== null &&
          actionId !== undefined &&
          typeof actionId !== "string") ||
        !["pending", "applied", "ignored", "rejected"].includes(
          String(status)
        ) ||
        typeof occurredAt !== "number" ||
        !Number.isFinite(occurredAt)
      ) {
        throw new Error("invalid_metal_metadata_edit_request");
      }
      if (owner !== userId) throw new Error("foreign_metal_metadata_patch");
      durableHoldingIds.add(holdingId);
      return {
        id,
        userId: owner,
        holdingId,
        actionId: typeof actionId === "string" ? actionId : null,
        status: status as PendingMetalMetadataEditPush["status"],
        occurredAt: new Date(occurredAt).toISOString(),
        payloadHash,
        requestJson,
      };
    }
  );
  return {
    editRequests: Object.freeze(editRequests),
    durableHoldingIds,
  };
}

export async function executePendingStandaloneMetalMetadata(
  editRequests: readonly PendingMetalMetadataEditPush[],
  userId: string,
  rpc: MetalSyncRpc,
  commitMetadataOutcome?: MetalMetadataOutcomeCommitter
): Promise<void> {
  const pendingStandalone = editRequests.filter(
    (edit) => edit.status === "pending" && edit.actionId === null
  );
  if (pendingStandalone.length === 0) return;
  if (!commitMetadataOutcome) {
    throw new Error("metal_metadata_commit_not_configured");
  }
  const coordinator = createMetalMetadataDedicatedPushCoordinator({
    getCurrentUserId,
    readPending: (): Promise<readonly PendingMetalMetadataEditPush[]> =>
      Promise.resolve(editRequests),
    hashRequest: metalOutcomeHashProvider.digestUtf8,
    rpc: ({ p_request_hash, p_request_json }) =>
      rpc(METAL_METADATA_RPC, {
        p_request_hash,
        p_request_json,
      }),
    commitOutcome: async (outcome): Promise<void> => {
      const parsed = asRpcObject(outcome);
      if (
        !parsed ||
        typeof parsed.editId !== "string" ||
        typeof parsed.holdingId !== "string" ||
        !commitMetadataOutcome
      ) {
        throw new Error("invalid_metal_metadata_edit_outcome");
      }
      await commitMetadataOutcome(outcome, parsed.editId, parsed.holdingId);
    },
  });
  await coordinator.push(userId);
}

export function assertCanonicalMixedMetadataOutcomesAvailable(
  editRequests: readonly PendingMetalMetadataEditPush[],
  invalidMetadataActionIds: ReadonlySet<string>,
  metadataOutcomeActionIds: ReadonlySet<string>,
  localTerminalActionIds: ReadonlySet<string>
): void {
  for (const edit of editRequests) {
    if (
      edit.actionId !== null &&
      edit.status === "pending" &&
      !invalidMetadataActionIds.has(edit.actionId) &&
      !metadataOutcomeActionIds.has(edit.actionId) &&
      !localTerminalActionIds.has(edit.actionId)
    ) {
      throw new Error("metal_metadata_canonical_outcome_unavailable");
    }
  }
}

export async function reconcileMixedMetalMetadataOutcomes(
  editRequests: readonly PendingMetalMetadataEditPush[],
  userId: string,
  invalidMetadataActionIds: ReadonlySet<string>,
  metadataOutcomeActionIds: ReadonlySet<string>,
  localTerminalActionIds: ReadonlySet<string>,
  readMixedOutcome?: MixedMetalMetadataOutcomeLoader,
  commitMetadataOutcome?: MetalMetadataOutcomeCommitter
): Promise<void> {
  for (const edit of editRequests) {
    if (
      edit.actionId === null ||
      edit.status !== "pending" ||
      invalidMetadataActionIds.has(edit.actionId) ||
      (!metadataOutcomeActionIds.has(edit.actionId) &&
        !localTerminalActionIds.has(edit.actionId))
    ) {
      continue;
    }
    if (!readMixedOutcome || !commitMetadataOutcome) {
      throw new Error("metal_metadata_canonical_outcome_unavailable");
    }
    const canonical = await readMixedOutcome(
      edit.id,
      edit.holdingId,
      userId,
      edit.payloadHash
    );
    await commitMetadataOutcome(canonical, edit.id, edit.holdingId);
  }
}

export function guardUnversionedHoldingStateMetadata(
  states: ReadonlyArray<Record<string, unknown>>,
  assets: ReadonlyMap<string, Record<string, unknown>>,
  durableHoldingIds: ReadonlySet<string>,
  handledActionIds: ReadonlySet<string>,
  safeActionIds: ReadonlySet<string>,
  changes: SyncPushArgs["changes"]
): UnversionedMetadataGuardResult {
  const metadataHoldingIds = new Set<string>(durableHoldingIds);
  for (const state of states) {
    const holdingId =
      typeof state.holding_id === "string"
        ? state.holding_id
        : String(state.id);
    if (metadataHoldingIds.has(holdingId)) continue;
    if (
      typeof state.effective_action_id === "string" &&
      handledActionIds.has(state.effective_action_id)
    ) {
      metadataHoldingIds.add(holdingId);
      continue;
    }
    const asset = assets.get(holdingId);
    const name = asset ? metalMetadataField(state, asset, "name") : null;
    const notes = asset ? metalMetadataField(state, asset, "notes") : null;
    if (name === false || notes === false || name || notes) {
      return {
        metadataHoldingIds,
        earlyExit: {
          acknowledgeAllDedicatedRows: false,
          acknowledgedActionIds: excludeHoldingActions(
            safeActionIds,
            changes,
            holdingId
          ),
        },
      };
    }
  }
  return { metadataHoldingIds };
}

export function createDefaultMetalOutcomeCommitter(
  database: Database,
  userId: string
): MetalOutcomeCommitter {
  return async (outcome): Promise<"accepted" | "reconciled" | "incomplete"> => {
    const disposition = await commitMetalRpcOutcomeLocally(
      database,
      outcome,
      userId,
      metalOutcomeHashProvider
    );
    if (
      outcome.status === "rejected" ||
      (outcome.status === "stale" && outcome.code !== "HOLDING_REVISION_STALE")
    ) {
      await discardRejectedMixedMetadataEvidence(
        database,
        outcome.actionId,
        userId
      );
    }
    return disposition;
  };
}

export function createDefaultMetalMetadataOutcomeCommitter(
  database: Database,
  userId: string
): MetalMetadataOutcomeCommitter {
  return (outcome, editId, holdingId): Promise<void> =>
    commitCanonicalMetalMetadataEditOutcomeLocally(
      database,
      outcome,
      editId,
      holdingId,
      userId
    );
}

export { readCanonicalMixedMetalMetadataOutcome };
