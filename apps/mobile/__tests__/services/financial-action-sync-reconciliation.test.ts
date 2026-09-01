import {
  createFinancialActionReconciliationService,
  FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES,
  type FinancialActionReconciliationBundle,
} from "../../services/financial-action-reconciliation-service";
import {
  createFinancialActionPushCoordinator,
  createFinancialActionSyncService,
} from "../../services/financial-action-sync-service";

const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";

function actionRecord(): {
  readonly payloadHash: string;
  readonly payloadJson: string;
} {
  return {
    payloadHash: "a".repeat(64),
    payloadJson: '{"fixture":true}',
  };
}

function rejectedBundle(
  overrides: Partial<FinancialActionReconciliationBundle> = {}
): FinancialActionReconciliationBundle {
  return {
    accounts: [
      {
        accountId: ACCOUNT_ID,
        balance: 125,
        currency: "EGP",
        financialRevision: "8",
      },
    ],
    actionId: ACTION_ID,
    effects: [
      {
        acceptedAccountRevision: "8",
        accountId: ACCOUNT_ID,
        actionId: ACTION_ID,
        amountMinorUnits: "2500",
        currency: "EGP",
        effectId: "40000000-0000-4000-8000-000000000004",
        isEffective: true,
        reversesEffectId: null,
      },
    ],
    state: "rejected_compensating",
    userId: USER_ID,
    ...overrides,
  };
}

describe("dedicated financial action sync", () => {
  it("submits one canonical root and records an accepted outcome", async () => {
    const repository = {
      getFinancialActionGroup: jest.fn(() => Promise.resolve(actionRecord())),
      markFinancialActionGroupSyncPending: jest.fn(() => Promise.resolve()),
      markFinancialActionGroupSyncFailed: jest.fn(() => Promise.resolve()),
      recordFinancialActionGroupServerOutcome: jest.fn(() => Promise.resolve()),
    };
    const invoke = jest.fn(() =>
      Promise.resolve({
        accountRevisions: [{ accountId: ACCOUNT_ID, revision: "8" }],
        actionId: ACTION_ID,
        status: "accepted",
      })
    );
    const service = createFinancialActionSyncService({
      foundationRepository: repository,
      invokeAccountFinancialActionRpc: invoke,
    });

    await service.syncAction(ACTION_ID);

    expect(invoke).toHaveBeenCalledWith({
      payloadHash: "a".repeat(64),
      payloadJson: '{"fixture":true}',
    });
    expect(
      repository.recordFinancialActionGroupServerOutcome
    ).toHaveBeenCalledWith(ACTION_ID, "accepted", expect.any(String), null);
  });

  it("keeps transport failures retryable without fabricating an outcome", async () => {
    const transportError = new Error("offline");
    const repository = {
      getFinancialActionGroup: jest.fn(() => Promise.resolve(actionRecord())),
      markFinancialActionGroupSyncPending: jest.fn(() => Promise.resolve()),
      markFinancialActionGroupSyncFailed: jest.fn(() => Promise.resolve()),
      recordFinancialActionGroupServerOutcome: jest.fn(() => Promise.resolve()),
    };
    const service = createFinancialActionSyncService({
      foundationRepository: repository,
      invokeAccountFinancialActionRpc: () => Promise.reject(transportError),
    });

    await expect(service.syncAction(ACTION_ID)).rejects.toBe(transportError);
    expect(repository.markFinancialActionGroupSyncFailed).toHaveBeenCalledTimes(
      1
    );
    expect(
      repository.recordFinancialActionGroupServerOutcome
    ).not.toHaveBeenCalled();
  });

  it("acknowledges only accepted account-action rows during a Watermelon push", async () => {
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({ actionId: ACTION_ID, status: "accepted" })
      .mockResolvedValueOnce({
        actionId: "10000000-0000-4000-8000-000000000009",
        code: "ACCOUNT_REVISION_STALE",
        status: "stale",
      });
    const markPending = jest.fn().mockResolvedValue(undefined);
    const recordOutcome = jest.fn().mockResolvedValue(undefined);
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: invoke,
      markFinancialActionGroupSyncFailed: jest
        .fn()
        .mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      recordFinancialActionGroupServerOutcome: recordOutcome,
    });

    const result = await coordinator.coordinatePush([
        {
          actionId: ACTION_ID,
          payloadHash: "a".repeat(64),
          payloadJson: '{"accepted":true}',
          state: "local_complete",
        },
        {
          actionId: "10000000-0000-4000-8000-000000000009",
          payloadHash: "b".repeat(64),
          payloadJson: '{"stale":true}',
          state: "sync_failed",
        },
      ]);
    expect(
      result.decisions.map((decision) => ({
        actionId: decision.actionId,
        code: decision.outcome?.code ?? null,
        disposition: decision.disposition,
        status: decision.outcome?.status ?? null,
      }))
    ).toEqual([
        {
          actionId: ACTION_ID,
          code: null,
          disposition: "acknowledge",
          status: "accepted",
        },
        {
          actionId: "10000000-0000-4000-8000-000000000009",
          code: "ACCOUNT_REVISION_STALE",
          disposition: "reject",
          status: "stale",
        },
      ]
    );
    expect(markPending).toHaveBeenCalledTimes(2);
    expect(recordOutcome).toHaveBeenCalledTimes(2);
  });

  it("acknowledges an already accepted local outcome without resubmitting it", async () => {
    const invoke = jest.fn();
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: invoke,
      markFinancialActionGroupSyncFailed: jest.fn(),
      markFinancialActionGroupSyncPending: jest.fn(),
      recordFinancialActionGroupServerOutcome: jest.fn(),
    });

    await expect(
      coordinator.coordinatePush([
        {
          actionId: ACTION_ID,
          payloadHash: "a".repeat(64),
          payloadJson: '{"accepted":true}',
          state: "accepted",
        },
      ])
    ).resolves.toEqual({
      decisions: [
        {
          actionId: ACTION_ID,
          disposition: "acknowledge",
          outcome: null,
        },
      ],
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("financial action reconciliation", () => {
  it("creates one exact inverse effect and advances the current account revision", async () => {
    const commit = jest.fn(() => Promise.resolve());
    const service = createFinancialActionReconciliationService({
      loadReconciliationBundle: () => Promise.resolve(rejectedBundle()),
      commitCompensationAtomically: commit,
    });

    await expect(service.reconcileRejectedAction(ACTION_ID)).resolves.toBe(
      "reconciled"
    );
    expect(commit).toHaveBeenCalledWith({
      accountMutations: [
        {
          accountId: ACCOUNT_ID,
          expectedRevision: "8",
          nextBalance: 100,
          nextRevision: "9",
        },
      ],
      actionId: ACTION_ID,
      effectMutations: [
        {
          acceptedAccountRevision: "9",
          accountId: ACCOUNT_ID,
          amountMinorUnits: "-2500",
          currency: "EGP",
          originalEffectId: "40000000-0000-4000-8000-000000000004",
        },
      ],
      userId: USER_ID,
    });
  });

  it("replays only fully compensated evidence", async () => {
    const commit = jest.fn(() => Promise.resolve());
    const service = createFinancialActionReconciliationService({
      loadReconciliationBundle: () =>
        Promise.resolve(
          rejectedBundle({
            state: "reconciled",
            effects: rejectedBundle().effects.map((effect) => ({
              ...effect,
              isEffective: false,
            })),
          })
        ),
      commitCompensationAtomically: commit,
    });

    await expect(service.reconcileRejectedAction(ACTION_ID)).resolves.toBe(
      "replay"
    );
    expect(commit).not.toHaveBeenCalled();
  });

  it("fails closed on partially compensated evidence", async () => {
    const service = createFinancialActionReconciliationService({
      loadReconciliationBundle: () =>
        Promise.resolve(
          rejectedBundle({
            effects: rejectedBundle().effects.map((effect) => ({
              ...effect,
              isEffective: false,
            })),
          })
        ),
      commitCompensationAtomically: () => Promise.resolve(),
    });

    await expect(service.reconcileRejectedAction(ACTION_ID)).rejects.toThrow(
      FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE
    );
  });
});
