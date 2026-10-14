import {
  createMetalMetadataDedicatedPushCoordinator,
  type MetalMetadataRpcCall,
  type PendingMetalMetadataEditPush,
} from "../../services/metal-metadata-dedicated-sync-service";

const USER = "018f0c7a-1234-7abc-8def-000000000001";
const HOLDING = "018f0c7a-1234-7abc-8def-000000000003";
const EDIT_A = "018f0c7a-1234-7abc-8def-000000000010";
const EDIT_B = "018f0c7a-1234-7abc-8def-000000000011";
const HASH = "a".repeat(64);

function makeRow(
  editId: string,
  occurredAt: string
): PendingMetalMetadataEditPush {
  return {
    id: editId,
    userId: USER,
    holdingId: HOLDING,
    actionId: null,
    status: "pending",
    occurredAt,
    requestJson: JSON.stringify({ editId }),
    payloadHash: HASH,
  };
}

function parseRequestEditId(args: MetalMetadataRpcCall): string {
  const payload: unknown = JSON.parse(args.p_request_json);
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("editId" in payload) ||
    typeof payload.editId !== "string"
  ) {
    throw new Error("invalid_test_request_identity");
  }
  return payload.editId;
}

describe("#363 dedicated per-edit metadata push", () => {
  it("submits distinct offline requests in stable order and commits each canonical result", async () => {
    const rpc = jest.fn((args: MetalMetadataRpcCall) =>
      Promise.resolve({
        data: {
          status: "ignored",
          editId: parseRequestEditId(args),
          holdingId: HOLDING,
        },
        error: null,
      })
    );
    const commit = jest.fn(
      (_outcome: unknown): Promise<void> => Promise.resolve()
    );
    const coordinator = createMetalMetadataDedicatedPushCoordinator({
      getCurrentUserId: () => Promise.resolve(USER),
      readPending: () =>
        Promise.resolve([
          makeRow(EDIT_B, "2026-10-10T12:02:00.000Z"),
          makeRow(EDIT_A, "2026-10-10T12:01:00.000Z"),
        ]),
      hashRequest: () => Promise.resolve(HASH),
      rpc,
      commitOutcome: commit,
    });

    await coordinator.push(USER);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, {
      p_request_json: JSON.stringify({ editId: EDIT_A }),
      p_request_hash: HASH,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, {
      p_request_json: JSON.stringify({ editId: EDIT_B }),
      p_request_hash: HASH,
    });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenNthCalledWith(1, {
      status: "ignored",
      editId: EDIT_A,
      holdingId: HOLDING,
    });
    expect(commit).toHaveBeenNthCalledWith(2, {
      status: "ignored",
      editId: EDIT_B,
      holdingId: HOLDING,
    });
  });

  it("propagates an offline RPC failure without acknowledging the edit", async () => {
    const commit = jest.fn();
    const coordinator = createMetalMetadataDedicatedPushCoordinator({
      getCurrentUserId: () => Promise.resolve(USER),
      readPending: () =>
        Promise.resolve([makeRow(EDIT_A, "2026-10-10T12:01:00.000Z")]),
      hashRequest: () => Promise.resolve(HASH),
      rpc: () => Promise.resolve({ data: null, error: { message: "offline" } }),
      commitOutcome: commit,
    });
    await expect(coordinator.push(USER)).rejects.toThrow(
      "metal_metadata_rpc_failed"
    );
    expect(commit).not.toHaveBeenCalled();
  });

  it("rejects foreign rows without a network call", async () => {
    const rpc = jest.fn();
    const coordinator = createMetalMetadataDedicatedPushCoordinator({
      getCurrentUserId: () => Promise.resolve(USER),
      readPending: () =>
        Promise.resolve([
          {
            ...makeRow(EDIT_A, "2026-10-10T12:01:00.000Z"),
            userId: "foreign",
          },
        ]),
      hashRequest: () => Promise.resolve(HASH),
      rpc,
      commitOutcome: jest.fn(),
    });
    await expect(coordinator.push(USER)).rejects.toThrow(
      "foreign_metal_metadata_patch"
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a mutated request hash before calling the provider", async () => {
    const rpc = jest.fn();
    const coordinator = createMetalMetadataDedicatedPushCoordinator({
      getCurrentUserId: () => Promise.resolve(USER),
      readPending: () =>
        Promise.resolve([makeRow(EDIT_A, "2026-10-10T12:01:00.000Z")]),
      hashRequest: () => Promise.resolve("b".repeat(64)),
      rpc,
      commitOutcome: jest.fn(),
    });
    await expect(coordinator.push(USER)).rejects.toThrow(
      "metal_metadata_edit_payload_hash_mismatch"
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("aborts when the authenticated user changes before the edit is sent", async () => {
    const rpc = jest.fn();
    const getCurrentUserId = jest
      .fn<Promise<string | null>, []>()
      .mockResolvedValueOnce(USER)
      .mockResolvedValueOnce(null);
    const coordinator = createMetalMetadataDedicatedPushCoordinator({
      getCurrentUserId,
      readPending: () =>
        Promise.resolve([makeRow(EDIT_A, "2026-10-10T12:01:00.000Z")]),
      hashRequest: () => Promise.resolve(HASH),
      rpc,
      commitOutcome: jest.fn(),
    });
    await expect(coordinator.push(USER)).rejects.toThrow(
      "sync_push_auth_scope_lost"
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});
