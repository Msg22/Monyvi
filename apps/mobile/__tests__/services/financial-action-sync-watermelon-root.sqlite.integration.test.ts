/**
 * #395 protected Add sync: genuine Watermelon model/decorated getters.
 *
 * Tests first. The shared fixture performs a real Add/foundation SQLite
 * writer and registers the actual generated FinancialActionGroup model.
 * Only authenticated-user and remote RPC I/O are doubled; no root is a
 * fabricated plain object and no private scope capability is forged.
 */
import { randomUUID } from "node:crypto";
import { Model } from "@nozbe/watermelondb";
import {
  ADD_DEFAULT_IDS,
  OWNER,
  accepted,
  actionSync,
  coldRestart,
  ledger,
  moduleDb,
  prepareAndCommit,
  root,
  setMockActiveAddOwner,
  type FinancialActionGroup,
} from "./account-default-intent-sync-recovery-sqlite-fixture";
import { FINANCIAL_ACTION_SYNC_ERROR_CODES } from "../../services/financial-action-sync-service";

interface RpcRequest {
  readonly payloadHash: string;
  readonly payloadJson: string;
}

describe("#395 financial sync binds a real Watermelon Add root", () => {
  it("reaches the actual guarded Add RPC after restart and stores its canonical six-field accepted receipt", async (): Promise<void> => {
    const command = await prepareAndCommit(
      "Root with decorated getters",
      "0",
      true,
      "CASH"
    );
    const db = await coldRestart();
    const loaded = await root(command.envelope.actionId, db);

    expect(loaded).toBeInstanceOf(Model);
    expect(Object.keys(loaded)).not.toContain("payloadJson");
    expect(Object.keys(loaded)).not.toContain("payloadHash");
    expect(loaded.actionId).toBe(command.envelope.actionId);
    expect(loaded.userId).toBe(OWNER);
    expect(loaded.payloadJson).toBeTruthy();
    expect(loaded.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    const originalPayloadJson = loaded.payloadJson;
    const originalPayloadHash = loaded.payloadHash;
    const acceptedReceipt = accepted(command);
    const invoke = jest.fn(
      (_input: RpcRequest): Promise<unknown> => Promise.resolve(acceptedReceipt)
    );

    await expect(
      actionSync(invoke, db).syncAction(command.envelope.actionId)
    ).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({
      payloadHash: originalPayloadHash,
      payloadJson: originalPayloadJson,
    });
    const persisted = await root(command.envelope.actionId, db);
    expect(persisted.id).toBe(loaded.id);
    expect(persisted.userId).toBe(OWNER);
    expect(persisted.payloadHash).toBe(originalPayloadHash);
    expect(persisted.payloadJson).toBe(originalPayloadJson);
    expect(persisted.state).toBe("accepted");
    expect(persisted.serverOutcome).toBe("accepted");
    if (typeof persisted.outcomeJson !== "string") {
      throw new Error("missing_actual_persisted_accepted_receipt");
    }
    const receipt: unknown = JSON.parse(persisted.outcomeJson);
    expect(receipt).toEqual(acceptedReceipt);
    if (
      receipt === null ||
      typeof receipt !== "object" ||
      Array.isArray(receipt)
    ) {
      throw new Error("invalid_actual_persisted_accepted_receipt");
    }
    expect(Object.keys(receipt).sort()).toEqual([
      "accountRevisions",
      "actionId",
      "effectiveEventId",
      "holdingRevision",
      "serverAcceptedAt",
      "status",
    ]);
  });

  it("refuses a foreign actor without an Add RPC or a local state transition", async (): Promise<void> => {
    const command = await prepareAndCommit(
      "Owner-scoped root",
      "0",
      true,
      "CASH"
    );
    const invoke = jest.fn(
      (_input: RpcRequest): Promise<unknown> =>
        Promise.resolve(accepted(command))
    );
    setMockActiveAddOwner(ADD_DEFAULT_IDS.foreignOwner);
    try {
      await expect(
        actionSync(invoke).syncAction(command.envelope.actionId)
      ).rejects.toThrow();
    } finally {
      setMockActiveAddOwner(OWNER);
    }
    expect(invoke).not.toHaveBeenCalled();
    expect((await root(command.envelope.actionId)).state).toBe(
      "local_complete"
    );
  });

  it.each([
    "replaced-action-identity",
    "foreign-root-owner",
    "payload-hash-getter-drift",
    "payload-json-getter-drift",
  ] as const)(
    "refuses %s after the initial real root read and before RPC",
    async (scenario): Promise<void> => {
      const command = await prepareAndCommit(
        "Immutable Add root",
        "0",
        true,
        "CASH"
      );
      const actionId = command.envelope.actionId;
      const persisted = await root(actionId);
      const physicalId = persisted.id;
      const originalPayloadHash = persisted.payloadHash;
      const originalPayloadJson = persisted.payloadJson;
      expect(persisted).toBeInstanceOf(Model);

      // The first two auth calls belong to the real foundation's initial
      // owner-scoped getFinancialActionGroup. The third is syncAction's
      // awaited actor check AFTER it has fetched the decorated Model.
      // Change the same genuine SQLite row at this await boundary; never
      // return a fake root or bypass owner/root/capability verification.
      const authModule = jest.requireMock<{
        readonly getCurrentUserId: () => Promise<string>;
      }>("@/services/supabase");
      const originalAuth = authModule.getCurrentUserId;
      let authCalls = 0;
      let physicalDriftCommitted = false;
      const authSpy = jest
        .spyOn(authModule, "getCurrentUserId")
        .mockImplementation((): Promise<string> => {
          authCalls += 1;
          if (authCalls !== 3) return originalAuth();
          return ledger.database
            .write(async (): Promise<void> => {
              await persisted.update((model) => {
                if (scenario === "replaced-action-identity") {
                  model.actionId = randomUUID();
                } else if (scenario === "foreign-root-owner") {
                  model.userId = ADD_DEFAULT_IDS.foreignOwner;
                } else if (scenario === "payload-hash-getter-drift") {
                  model.payloadHash =
                    originalPayloadHash === "f".repeat(64)
                      ? "e".repeat(64)
                      : "f".repeat(64);
                } else {
                  model.payloadJson = originalPayloadJson + " ";
                }
              });
              physicalDriftCommitted = true;
            })
            .then(() => originalAuth());
        });
      const invoke = jest.fn(
        (_input: RpcRequest): Promise<unknown> =>
          Promise.resolve(accepted(command))
      );
      try {
        await expect(actionSync(invoke).syncAction(actionId)).rejects.toThrow(
          FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME
        );
      } finally {
        authSpy.mockRestore();
      }

      expect(authCalls).toBe(3);
      expect(physicalDriftCommitted).toBe(true);
      expect(invoke).not.toHaveBeenCalled();
      const after = await moduleDb.database
        .get<FinancialActionGroup>("financial_action_groups")
        .find(physicalId);
      expect(after.id).toBe(physicalId);
      expect(after.state).toBe("local_complete");
      expect(after.serverOutcome).toBeNull();
      if (scenario === "payload-hash-getter-drift") {
        expect(after.payloadHash).not.toBe(originalPayloadHash);
      } else if (scenario === "payload-json-getter-drift") {
        expect(after.payloadJson).not.toBe(originalPayloadJson);
      } else if (scenario === "replaced-action-identity") {
        expect(after.actionId).not.toBe(actionId);
      } else {
        expect(after.userId).toBe(ADD_DEFAULT_IDS.foreignOwner);
      }
    }
  );
});
