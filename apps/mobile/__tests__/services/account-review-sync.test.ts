import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import {
  createFinancialActionPushCoordinator,
  createFinancialActionSyncService,
  FINANCIAL_ACTION_SYNC_ERROR_CODES,
  type FinancialActionPushCandidate,
  type FinancialActionPushCoordinatorDependencies,
  type FinancialActionSyncDependencies,
} from "../../services/financial-action-sync-service";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  isProtectedFinancialActionRow,
  readRejectedIdsForTable,
  stripProtectedAccountFields,
} from "../../services/sync/account-protected-fields";
import { resolveFinancialActionServerOutcomeState } from "../../services/financial-action-foundation-contracts";
import {
  ACCOUNT_SMS_SENDER_ID,
  ATM_BANK_ACCOUNT_ID,
  ATM_CASH_ACCOUNT_ID,
  ATM_TRANSFER_RECORD_ID,
  atmTransferChanges,
  BANK_DETAILS_ID,
  legacyChanges,
  legacyEditBalanceEnvelope,
  NEW_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_ACTION_ID,
  reviewBatchSaveChanges,
  reviewBatchSaveEnvelope,
  reviewBatchSaveRootRecord,
  smsNewBankChanges,
  SMS_EXPENSE_RECORD_ID,
  SMS_INCOME_RECORD_ID,
} from "./account-review-sync-test-helpers";

function changesWithAccounts(
  accounts: Array<Record<string, unknown>>
): SyncPushArgs["changes"] {
  return {
    account_financial_effects: { created: [], deleted: [], updated: [] },
    accounts: { created: [], deleted: [], updated: accounts },
    financial_action_groups: { created: [], deleted: [], updated: [] },
    transactions: { created: [], deleted: [], updated: [] },
    transfers: { created: [], deleted: [], updated: [] },
  };
}

function changesWithRoots(
  roots: Array<Record<string, unknown>>
): SyncPushArgs["changes"] {
  return {
    account_financial_effects: { created: [], deleted: [], updated: [] },
    accounts: { created: [], deleted: [], updated: [] },
    financial_action_groups: { created: roots, deleted: [], updated: [] },
    transactions: { created: [], deleted: [], updated: [] },
    transfers: { created: [], deleted: [], updated: [] },
  };
}

interface SyncServiceHarness {
  readonly service: ReturnType<typeof createFinancialActionSyncService>;
  readonly getGroup: jest.Mock;
  readonly markPending: jest.Mock;
  readonly markFailed: jest.Mock;
  readonly recordOutcome: jest.Mock;
  readonly invokeRpc: jest.Mock;
}

function syncServiceHarness(input?: {
  readonly group?: Record<string, unknown> | null;
  readonly rpcOutcome?: unknown;
  readonly rpcError?: Error;
}): SyncServiceHarness {
  const getGroup = jest.fn().mockResolvedValue(input?.group ?? null);
  const markPending = jest.fn().mockResolvedValue(undefined);
  const markFailed = jest.fn().mockResolvedValue(undefined);
  const recordOutcome = jest.fn().mockResolvedValue(undefined);
  const invokeRpc = input?.rpcError
    ? jest.fn().mockRejectedValue(input.rpcError)
    : jest.fn().mockResolvedValue(
        input?.rpcOutcome ?? {
          actionId: REVIEW_ACTION_ID,
          status: "accepted",
        }
      );

  const dependencies: FinancialActionSyncDependencies = {
    foundationRepository: {
      getFinancialActionGroup: getGroup,
      markFinancialActionGroupSyncFailed: markFailed,
      markFinancialActionGroupSyncPending: markPending,
      recordFinancialActionGroupServerOutcome: recordOutcome,
    },
    invokeAccountFinancialActionRpc: invokeRpc,
  };

  return {
    service: createFinancialActionSyncService(dependencies),
    getGroup,
    markPending,
    markFailed,
    recordOutcome,
    invokeRpc,
  };
}

interface CoordinatorHarness {
  readonly coordinator: ReturnType<typeof createFinancialActionPushCoordinator>;
  readonly invokeRpc: jest.Mock;
  readonly markPending: jest.Mock;
  readonly markFailed: jest.Mock;
  readonly recordOutcome: jest.Mock;
  readonly reconcile: jest.Mock;
}

function coordinatorHarness(input?: {
  readonly outcome?: unknown;
  readonly reconciliationResult?: "incomplete" | "reconciled" | "replay";
  readonly rpcError?: Error;
}): CoordinatorHarness {
  const invokeRpc = input?.rpcError
    ? jest.fn().mockRejectedValue(input.rpcError)
    : jest
        .fn()
        .mockResolvedValue(
          input?.outcome ?? { actionId: REVIEW_ACTION_ID, status: "accepted" }
        );
  const markPending = jest.fn().mockResolvedValue(undefined);
  const markFailed = jest.fn().mockResolvedValue(undefined);
  const recordOutcome = jest.fn().mockResolvedValue(undefined);
  const reconcile = jest
    .fn()
    .mockResolvedValue(input?.reconciliationResult ?? "reconciled");

  const dependencies: FinancialActionPushCoordinatorDependencies = {
    invokeAccountFinancialActionRpc: invokeRpc,
    markFinancialActionGroupSyncFailed: markFailed,
    markFinancialActionGroupSyncPending: markPending,
    recordFinancialActionGroupServerOutcome: recordOutcome,
    reconcileFinancialActionGroup: reconcile,
  };

  return {
    coordinator: createFinancialActionPushCoordinator(dependencies),
    invokeRpc,
    markPending,
    markFailed,
    recordOutcome,
    reconcile,
  };
}

describe("account-review-sync", () => {
  describe("protected collector — new review.batch-save/v1 tuple", () => {
    it("recognizes review.batch-save/v1 envelope and returns bundle with all table refs", () => {
      const bundles = collectAccountFinancialActionPushBundles(
        reviewBatchSaveChanges()
      );

      expect(bundles).toHaveLength(1);
      expect(bundles[0]?.candidate.actionId).toBe(REVIEW_ACTION_ID);
      expect(bundles[0]?.rowIds.financial_action_groups).toEqual([
        REVIEW_ACTION_ID,
      ]);
    });

    it("protects bank_details child creates in SMS new bank flow", () => {
      const bundles =
        collectAccountFinancialActionPushBundles(smsNewBankChanges());

      expect(bundles[0]?.rowIds.bank_details).toEqual([BANK_DETAILS_ID]);
      expect(bundles[0]?.rowIds.account_sms_senders).toEqual([
        ACCOUNT_SMS_SENDER_ID,
      ]);
      expect(bundles[0]?.rowIds.transactions).toEqual(
        [SMS_INCOME_RECORD_ID, SMS_EXPENSE_RECORD_ID].sort()
      );
    });

    it("protects account create with non-initial balance", () => {
      const protectedIds = collectProtectedFinancialActionRowIds(
        changesWithAccounts([
          {
            _changed: "balance,financial_revision",
            _status: "created",
            balance: 1500,
            financial_revision: "1",
            id: REVIEW_ACCOUNT_ID,
          },
        ])
      );

      expect(readRejectedIdsForTable(protectedIds, "accounts")).toContain(
        REVIEW_ACCOUNT_ID
      );
    });

    it("protects ATM transfer creates", () => {
      const bundles =
        collectAccountFinancialActionPushBundles(atmTransferChanges());

      expect(bundles[0]?.rowIds.transfers).toEqual([ATM_TRANSFER_RECORD_ID]);
      expect(bundles[0]?.rowIds.accounts).toEqual(
        [ATM_BANK_ACCOUNT_ID, ATM_CASH_ACCOUNT_ID].sort()
      );
    });

    it("suppresses generic LWW for action-owned rows", () => {
      const protectedIds =
        collectProtectedFinancialActionRowIds(smsNewBankChanges());

      expect(
        isProtectedFinancialActionRow(
          protectedIds,
          "accounts",
          NEW_BANK_ACCOUNT_ID
        )
      ).toBe(true);
      expect(
        isProtectedFinancialActionRow(
          protectedIds,
          "transactions",
          SMS_INCOME_RECORD_ID
        )
      ).toBe(true);
    });

    it("strips balance and financial_revision from account records", () => {
      const stripped = stripProtectedAccountFields("accounts", {
        balance: 1500,
        financial_revision: "1",
        id: REVIEW_ACCOUNT_ID,
        name: "Test",
      });

      expect(stripped).not.toHaveProperty("balance");
      expect(stripped).not.toHaveProperty("financial_revision");
      expect(stripped).toHaveProperty("name", "Test");
    });
  });

  describe("protected collector — fail-closed incomplete groups", () => {
    it("rejects partial mutation set — domainRecordRefs missing a create ID", () => {
      const positiveChanges = reviewBatchSaveChanges();
      const incompleteEnvelope = {
        ...reviewBatchSaveEnvelope,
        payload: {
          ...reviewBatchSaveEnvelope.payload,
          domainRecordRefs:
            reviewBatchSaveEnvelope.payload.domainRecordRefs.slice(0, -1),
        },
      };
      const changes: SyncPushArgs["changes"] = {
        ...positiveChanges,
        financial_action_groups: {
          created: [
            {
              ...reviewBatchSaveRootRecord(),
              payload_json: JSON.stringify(incompleteEnvelope),
            },
          ],
          updated: [],
          deleted: [],
        },
      };

      expect(() => collectAccountFinancialActionPushBundles(changes)).toThrow();
    });

    it("rejects guard without matching create in domainMutation", () => {
      const positiveChanges = reviewBatchSaveChanges();
      const incompleteEnvelope = {
        ...reviewBatchSaveEnvelope,
        payload: {
          ...reviewBatchSaveEnvelope.payload,
          createGuards: [
            ...reviewBatchSaveEnvelope.payload.createGuards,
            {
              entity: "transaction" as const,
              id: "99999999-9999-4999-8999-999999999999",
              expectedAbsent: true,
            },
          ],
        },
      };
      const changes: SyncPushArgs["changes"] = {
        ...positiveChanges,
        financial_action_groups: {
          created: [
            {
              ...reviewBatchSaveRootRecord(),
              payload_json: JSON.stringify(incompleteEnvelope),
            },
          ],
          updated: [],
          deleted: [],
        },
      };

      expect(() => collectAccountFinancialActionPushBundles(changes)).toThrow();
    });
  });

  describe("protected collector — legacy account.balance-effects/v1 regression", () => {
    it("recognizes legacy envelope and returns bundle", () => {
      const bundles = collectAccountFinancialActionPushBundles(legacyChanges());

      expect(bundles).toHaveLength(1);
      expect(bundles[0]?.candidate.actionId).toBe(REVIEW_ACTION_ID);
      expect(bundles[0]?.rowIds.financial_action_groups).toContain(
        REVIEW_ACTION_ID
      );
    });

    it("protects legacy account updates", () => {
      const bundles = collectAccountFinancialActionPushBundles(legacyChanges());

      expect(bundles[0]?.rowIds.accounts).toContain(REVIEW_ACCOUNT_ID);
    });

    it("throws on malformed root JSON", () => {
      expect(() =>
        collectAccountFinancialActionPushBundles(
          changesWithRoots([
            {
              action_id: REVIEW_ACTION_ID,
              domain: "accounts",
              id: REVIEW_ACTION_ID,
              payload_hash: "a".repeat(64),
              payload_json: "{malformed-json",
              state: "local_complete",
              user_id: "22222222-2222-4222-8222-222222222222",
            },
          ])
        )
      ).toThrow("account_financial_action_malformed_root");
    });
  });

  describe("sync transport — legacy positive controls", () => {
    it("marks action pending then records accepted outcome", async () => {
      const harness = syncServiceHarness({
        group: {
          actionId: REVIEW_ACTION_ID,
          payloadHash: "d".repeat(64),
          payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        },
        rpcOutcome: { actionId: REVIEW_ACTION_ID, status: "accepted" },
      });

      await harness.service.syncAction(REVIEW_ACTION_ID);

      expect(harness.markPending).toHaveBeenCalledWith(REVIEW_ACTION_ID);
      expect(harness.invokeRpc).toHaveBeenCalledWith({
        payloadHash: "d".repeat(64),
        payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
      });
      expect(harness.recordOutcome).toHaveBeenCalledWith(
        REVIEW_ACTION_ID,
        "accepted",
        expect.any(String),
        null
      );
    });

    it("marks sync_failed with TRANSPORT_FAILED on RPC throw", async () => {
      const harness = syncServiceHarness({
        group: {
          actionId: REVIEW_ACTION_ID,
          payloadHash: "d".repeat(64),
          payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        },
        rpcError: new Error("network error"),
      });

      await expect(
        harness.service.syncAction(REVIEW_ACTION_ID)
      ).rejects.toThrow("network error");
      expect(harness.markFailed).toHaveBeenCalledWith(
        REVIEW_ACTION_ID,
        FINANCIAL_ACTION_SYNC_ERROR_CODES.TRANSPORT_FAILED
      );
    });

    it("throws NOT_FOUND when action group does not exist", async () => {
      const harness = syncServiceHarness({ group: null });

      await expect(
        harness.service.syncAction(REVIEW_ACTION_ID)
      ).rejects.toThrow(FINANCIAL_ACTION_SYNC_ERROR_CODES.NOT_FOUND);
    });

    it("throws INVALID_OUTCOME when server returns wrong actionId", async () => {
      const harness = syncServiceHarness({
        group: {
          actionId: REVIEW_ACTION_ID,
          payloadHash: "d".repeat(64),
          payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        },
        rpcOutcome: { actionId: "different-id", status: "accepted" },
      });

      await expect(
        harness.service.syncAction(REVIEW_ACTION_ID)
      ).rejects.toThrow(FINANCIAL_ACTION_SYNC_ERROR_CODES.INVALID_OUTCOME);
    });
  });

  describe("sync transport — unsupported tuple RPC failure", () => {
    it("marks sync_failed on unsupported tuple RPC throw", async () => {
      const harness = syncServiceHarness({
        group: {
          actionId: REVIEW_ACTION_ID,
          payloadHash: "a".repeat(64),
          payloadJson: JSON.stringify(reviewBatchSaveEnvelope),
        },
        rpcError: new Error("Unsupported tuple registration"),
      });

      await expect(
        harness.service.syncAction(REVIEW_ACTION_ID)
      ).rejects.toThrow("Unsupported tuple registration");
      expect(harness.markFailed).toHaveBeenCalledWith(
        REVIEW_ACTION_ID,
        FINANCIAL_ACTION_SYNC_ERROR_CODES.TRANSPORT_FAILED
      );
    });

    it("does not record business rejection on unsupported tuple", async () => {
      const harness = syncServiceHarness({
        group: {
          actionId: REVIEW_ACTION_ID,
          payloadHash: "a".repeat(64),
          payloadJson: JSON.stringify(reviewBatchSaveEnvelope),
        },
        rpcError: new Error("Unsupported tuple registration"),
      });

      await expect(
        harness.service.syncAction(REVIEW_ACTION_ID)
      ).rejects.toThrow();
      expect(harness.recordOutcome).not.toHaveBeenCalled();
    });
  });

  describe("push coordinator — legacy positive controls", () => {
    it("acknowledges accepted outcome without reconciliation", async () => {
      const harness = coordinatorHarness({
        outcome: { actionId: REVIEW_ACTION_ID, status: "accepted" },
      });
      const candidate: FinancialActionPushCandidate = {
        actionId: REVIEW_ACTION_ID,
        payloadHash: "d".repeat(64),
        payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        state: "sync_pending",
      };

      const result = await harness.coordinator.coordinatePush([candidate]);

      expect(result.decisions[0]?.disposition).toBe("acknowledge");
      expect(harness.reconcile).not.toHaveBeenCalled();
    });

    it("acknowledges already-accepted state without RPC", async () => {
      const harness = coordinatorHarness();
      const candidate: FinancialActionPushCandidate = {
        actionId: REVIEW_ACTION_ID,
        payloadHash: "d".repeat(64),
        payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        state: "accepted",
      };

      const result = await harness.coordinator.coordinatePush([candidate]);

      expect(result.decisions[0]?.disposition).toBe("acknowledge");
      expect(harness.invokeRpc).not.toHaveBeenCalled();
    });

    it("acknowledges already-reconciled state without RPC", async () => {
      const harness = coordinatorHarness();
      const candidate: FinancialActionPushCandidate = {
        actionId: REVIEW_ACTION_ID,
        payloadHash: "d".repeat(64),
        payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        state: "reconciled",
      };

      const result = await harness.coordinator.coordinatePush([candidate]);

      expect(result.decisions[0]?.disposition).toBe("acknowledge");
      expect(harness.invokeRpc).not.toHaveBeenCalled();
    });

    it("routes reconciliation_incomplete to recovery without resubmission", async () => {
      const harness = coordinatorHarness({
        reconciliationResult: "reconciled",
      });
      const candidate: FinancialActionPushCandidate = {
        actionId: REVIEW_ACTION_ID,
        payloadHash: "d".repeat(64),
        payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        state: "reconciliation_incomplete",
      };

      const result = await harness.coordinator.coordinatePush([candidate]);

      expect(harness.reconcile).toHaveBeenCalledWith(REVIEW_ACTION_ID);
      expect(harness.invokeRpc).not.toHaveBeenCalled();
      expect(result.decisions[0]?.disposition).toBe("acknowledge");
    });

    it("keeps rejected result in explicit incomplete recovery when reconciliation fails", async () => {
      const harness = coordinatorHarness({
        outcome: {
          actionId: REVIEW_ACTION_ID,
          code: "INVALID_LINK",
          status: "rejected",
        },
        reconciliationResult: "incomplete",
      });
      const candidate: FinancialActionPushCandidate = {
        actionId: REVIEW_ACTION_ID,
        payloadHash: "d".repeat(64),
        payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        state: "sync_pending",
      };

      const result = await harness.coordinator.coordinatePush([candidate]);

      expect(harness.reconcile).toHaveBeenCalledWith(REVIEW_ACTION_ID);
      expect(result.decisions[0]?.disposition).toBe("recover");
    });

    it("marks sync_failed on transport error", async () => {
      const harness = coordinatorHarness({ rpcError: new Error("timeout") });
      const candidate: FinancialActionPushCandidate = {
        actionId: REVIEW_ACTION_ID,
        payloadHash: "d".repeat(64),
        payloadJson: JSON.stringify(legacyEditBalanceEnvelope),
        state: "sync_pending",
      };

      await expect(
        harness.coordinator.coordinatePush([candidate])
      ).rejects.toThrow("timeout");
      expect(harness.markFailed).toHaveBeenCalledWith(
        REVIEW_ACTION_ID,
        FINANCIAL_ACTION_SYNC_ERROR_CODES.TRANSPORT_FAILED
      );
    });
  });

  describe("resolveFinancialActionServerOutcomeState — mapping", () => {
    it("maps accepted to accepted", () => {
      expect(resolveFinancialActionServerOutcomeState("accepted")).toBe(
        "accepted"
      );
    });

    it("maps idempotent to accepted", () => {
      expect(resolveFinancialActionServerOutcomeState("idempotent")).toBe(
        "accepted"
      );
    });

    it("maps stale to rejected_compensating", () => {
      expect(resolveFinancialActionServerOutcomeState("stale")).toBe(
        "rejected_compensating"
      );
    });

    it("maps rejected to reconciliation_incomplete", () => {
      expect(resolveFinancialActionServerOutcomeState("rejected")).toBe(
        "reconciliation_incomplete"
      );
    });
  });
});
