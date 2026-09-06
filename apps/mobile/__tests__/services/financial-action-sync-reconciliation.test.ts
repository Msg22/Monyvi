import {
  createFinancialActionReconciliationService,
  FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES,
  type FinancialActionReconciliationBundle,
} from "../../services/financial-action-reconciliation-service";
import { parseFinancialActionEnvelopeJson } from "@monyvi/logic";
import {
  createFinancialActionPushCoordinator,
  createFinancialActionSyncService,
} from "../../services/financial-action-sync-service";

const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const DRAFT_ID = "50000000-0000-4000-8000-000000000005";
const QUEUE_ID = "60000000-0000-4000-8000-000000000006";
const TRANSACTION_ID = "70000000-0000-4000-8000-000000000007";
const SNAPSHOT_HASH = "a".repeat(64);

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
    domain: "transactions",
    localSmsReviewDraftSnapshot: null,
    payloadJson: "{}",
    state: "rejected_compensating",
    userId: USER_ID,
    ...overrides,
  };
}

function localSmsSnapshot(): Readonly<Record<string, string | boolean | null>> {
  return {
    createdAt: "2026-08-31T11:00:00.000Z",
    id: DRAFT_ID,
    parsedAt: "2026-08-31T11:55:00.000Z",
    payloadJson: '{"amount":25,"currency":"EGP"}',
    payloadVersion: "1",
    position: "0",
    queueId: QUEUE_ID,
    selectionOverride: true,
    smsFingerprint: "sms-fingerprint-1",
    updatedAt: "2026-08-31T12:00:00.000Z",
    userId: USER_ID,
  };
}

function smsPayloadJson(snapshotHash = SNAPSHOT_HASH): string {
  return JSON.stringify({
    accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
    actionId: ACTION_ID,
    domain: "sms",
    domainReferenceId: DRAFT_ID,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "review_confirm",
    occurredAt: "2026-09-01T12:00:00.000Z",
    payload: {
      accountEffects: [
        {
          accountId: ACCOUNT_ID,
          amountMinorUnits: "2500",
          currency: "EGP",
        },
      ],
      domainMutation: {
        records: [
          {
            after: {
              id: DRAFT_ID,
              queueId: QUEUE_ID,
              smsFingerprint: "sms-fingerprint-1",
              snapshotHash,
            },
            entity: "sms_review_draft_item",
            expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
            mode: "delete",
          },
          {
            after: {
              accountId: ACCOUNT_ID,
              amountMinorUnits: "2500",
              categoryId: "80000000-0000-4000-8000-000000000008",
              counterparty: null,
              createdAt: "2026-09-01T12:00:00.000Z",
              currency: "EGP",
              date: "2026-09-01",
              deleted: false,
              id: TRANSACTION_ID,
              isDraft: false,
              linkedAssetId: null,
              linkedDebtId: null,
              linkedRecurringId: null,
              note: null,
              smsFingerprint: "sms-fingerprint-1",
              source: "SMS",
              type: "INCOME",
            },
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [DRAFT_ID, TRANSACTION_ID],
      operationCode: "sms.review-durable",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: USER_ID,
  });
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
    ]);
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
      hashProvider: {
        digestUtf8: () => Promise.resolve(SNAPSHOT_HASH),
      },
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
      smsReviewDraftRestore: null,
    });
  });

  it("restores the exact local SMS draft in the same compensation commit", async () => {
    const commit = jest.fn(() => Promise.resolve());
    const hashProvider = {
      digestUtf8: jest.fn(() => Promise.resolve(SNAPSHOT_HASH)),
    };
    const service = createFinancialActionReconciliationService({
      commitCompensationAtomically: commit,
      hashProvider,
      loadReconciliationBundle: () =>
        Promise.resolve(
          rejectedBundle({
            domain: "sms",
            payloadJson: smsPayloadJson(),
            localSmsReviewDraftSnapshot: localSmsSnapshot(),
          })
        ),
    });

    expect(() =>
      parseFinancialActionEnvelopeJson(smsPayloadJson())
    ).not.toThrow();

    await expect(service.reconcileRejectedAction(ACTION_ID)).resolves.toBe(
      "reconciled"
    );
    expect(hashProvider.digestUtf8).toHaveBeenCalledWith(
      JSON.stringify({
        createdAt: "2026-08-31T11:00:00.000Z",
        id: DRAFT_ID,
        parsedAt: "2026-08-31T11:55:00.000Z",
        payloadJson: '{"amount":25,"currency":"EGP"}',
        payloadVersion: "1",
        position: "0",
        queueId: QUEUE_ID,
        selectionOverride: true,
        smsFingerprint: "sms-fingerprint-1",
        updatedAt: "2026-08-31T12:00:00.000Z",
        userId: USER_ID,
      })
    );
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        smsReviewDraftRestore: {
          createdAt: "2026-08-31T11:00:00.000Z",
          draftId: DRAFT_ID,
          parsedAt: "2026-08-31T11:55:00.000Z",
          payloadJson: '{"amount":25,"currency":"EGP"}',
          payloadVersion: 1,
          position: 0,
          queueId: QUEUE_ID,
          selectionOverride: true,
          smsFingerprint: "sms-fingerprint-1",
          updatedAt: "2026-08-31T12:00:00.000Z",
        },
      })
    );
  });

  it("fails closed when the immutable SMS draft snapshot hash differs", async () => {
    const commit = jest.fn(() => Promise.resolve());
    const service = createFinancialActionReconciliationService({
      commitCompensationAtomically: commit,
      hashProvider: {
        digestUtf8: () => Promise.resolve("b".repeat(64)),
      },
      loadReconciliationBundle: () =>
        Promise.resolve(
          rejectedBundle({
            domain: "sms",
            payloadJson: smsPayloadJson(),
            localSmsReviewDraftSnapshot: localSmsSnapshot(),
          })
        ),
    });

    await expect(service.reconcileRejectedAction(ACTION_ID)).rejects.toThrow(
      FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE
    );
    expect(commit).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...localSmsSnapshot(), userId: ACCOUNT_ID },
    { ...localSmsSnapshot(), id: ACCOUNT_ID },
    { ...localSmsSnapshot(), queueId: ACCOUNT_ID },
    { ...localSmsSnapshot(), smsFingerprint: "different-message" },
    { ...localSmsSnapshot(), position: "9007199254740992" },
  ])(
    "refuses missing, foreign or mismatched local draft recovery data %#",
    async (snapshot) => {
      const commit = jest.fn(() => Promise.resolve());
      const service = createFinancialActionReconciliationService({
        commitCompensationAtomically: commit,
        hashProvider: { digestUtf8: () => Promise.resolve(SNAPSHOT_HASH) },
        loadReconciliationBundle: () =>
          Promise.resolve(
            rejectedBundle({
              domain: "sms",
              payloadJson: smsPayloadJson(),
              localSmsReviewDraftSnapshot: snapshot,
            })
          ),
      });
      await expect(service.reconcileRejectedAction(ACTION_ID)).rejects.toThrow(
        FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE
      );
      expect(commit).not.toHaveBeenCalled();
    }
  );

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
      hashProvider: {
        digestUtf8: () => Promise.resolve(SNAPSHOT_HASH),
      },
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
      hashProvider: {
        digestUtf8: () => Promise.resolve(SNAPSHOT_HASH),
      },
    });

    await expect(service.reconcileRejectedAction(ACTION_ID)).rejects.toThrow(
      FINANCIAL_ACTION_RECONCILIATION_ERROR_CODES.INVALID_EVIDENCE
    );
  });
});
