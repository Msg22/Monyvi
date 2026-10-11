/**
 * #363 dedicated metadata-outcome push, invoked by the generic push coordinator.
 *
 * Every offline request is sent by durable identity; never synthesize a patch
 * from the latest coalesced assets/metal_holding_states projection.
 */
export interface PendingMetalMetadataEditPush {
  readonly id: string;
  readonly userId: string;
  readonly holdingId: string;
  readonly actionId: string | null;
  readonly status: "pending" | "applied" | "ignored" | "rejected";
  readonly occurredAt: string;
  readonly requestJson: string;
  readonly payloadHash: string;
}

export interface MetalMetadataRpcCall {
  readonly p_request_json: string;
  readonly p_request_hash: string;
}

export interface MetalMetadataDedicatedPushDependencies {
  readonly getCurrentUserId: () => Promise<string | null>;
  readonly readPending: (
    userId: string
  ) => Promise<readonly PendingMetalMetadataEditPush[]>;
  readonly hashRequest: (canonicalJson: string) => Promise<string>;
  readonly rpc: (args: MetalMetadataRpcCall) => Promise<{
    readonly data: unknown;
    readonly error: unknown;
  }>;
  readonly commitOutcome: (outcome: unknown) => Promise<void>;
}

export interface MetalMetadataDedicatedPushCoordinator {
  readonly push: (userId: string) => Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function createMetalMetadataDedicatedPushCoordinator(
  dependencies: MetalMetadataDedicatedPushDependencies
): MetalMetadataDedicatedPushCoordinator {
  async function assertUser(userId: string): Promise<void> {
    if ((await dependencies.getCurrentUserId()) !== userId) {
      throw new Error("sync_push_auth_scope_lost");
    }
  }

  return Object.freeze({
    push: async (userId: string): Promise<void> => {
      await assertUser(userId);
      const pending = [...(await dependencies.readPending(userId))].sort(
        (a, b) =>
          a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)
      );
      for (const row of pending) {
        await assertUser(userId);
        if (row.userId !== userId) {
          throw new Error("foreign_metal_metadata_patch");
        }
        if (row.actionId !== null || row.status !== "pending") continue;
        if (
          (await dependencies.hashRequest(row.requestJson)) !== row.payloadHash
        )
          throw new Error("metal_metadata_edit_payload_hash_mismatch");
        const { data, error } = await dependencies.rpc({
          p_request_json: row.requestJson,
          p_request_hash: row.payloadHash,
        });
        if (error) throw new Error("metal_metadata_rpc_failed");
        const outcome = asRecord(data);
        if (
          !outcome ||
          (outcome.status !== "applied" && outcome.status !== "ignored") ||
          outcome.editId !== row.id ||
          outcome.holdingId !== row.holdingId
        )
          throw new Error("invalid_metal_metadata_edit_outcome");
        await assertUser(userId);
        // Reconciliation owns durable acknowledgment; on failure do NOT mark
        // this request sent or advance the containing Watermelon sync watermark.
        await dependencies.commitOutcome(data);
      }
    },
  });
}
