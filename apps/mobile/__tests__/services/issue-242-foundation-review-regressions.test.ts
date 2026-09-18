import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import {
  createFinancialActionPushCoordinator,
  type FinancialActionPushCandidate,
} from "@/services/financial-action-sync-service";
import { resolveFinancialActionServerOutcomeState } from "@/services/financial-action-foundation-contracts";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
  readRejectedIdsForTable,
} from "@/services/sync/account-protected-fields";

const ACCOUNT_ID = "018f0c7a-1234-7abc-8def-000000000211";
const TRANSACTION_ID = "018f0c7a-1234-7abc-8def-000000001301";
const RECURRING_ID = "018f0c7a-1234-7abc-8def-000000001401";

function payloadJson(input: {
  readonly accountId: string;
  readonly actionId: string;
  readonly expectedRevision: string;
  readonly recurringId?: string;
  readonly transactionId: string;
}): string {
  const records: Array<Readonly<Record<string, unknown>>> = [
    {
      after: { id: input.transactionId },
      entity: "transaction",
      expectedUpdatedAt: null,
      mode: "create",
    },
  ];
  if (input.recurringId) {
    records.push({
      after: { id: input.recurringId },
      before: { id: input.recurringId },
      entity: "recurring_payment",
      expectedUpdatedAt: "2026-09-06T11:00:00.000Z",
      mode: "update",
    });
  }
  return JSON.stringify({
    accountGuards: [
      {
        accountId: input.accountId,
        expectedRevision: input.expectedRevision,
      },
    ],
    actionId: input.actionId,
    domain: "transactions",
    domainReferenceId: input.transactionId,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create",
    occurredAt: "2026-09-06T12:00:00.000Z",
    payload: {
      accountEffects: [
        {
          accountId: input.accountId,
          amountMinorUnits: "-100",
          currency: "EGP",
        },
      ],
      domainMutation: { records },
      domainRecordRefs: records.map((record) => {
        const after = record.after as Readonly<Record<string, unknown>>;
        return String(after.id);
      }),
      operationCode: input.recurringId
        ? "recurring.pay-now"
        : "transaction.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: "018f0c7a-1234-7abc-8def-000000000201",
  });
}

function rootRecord(input: {
  readonly actionId: string;
  readonly expectedRevision: string;
  readonly recurringId?: string;
  readonly state?: string;
  readonly transactionId: string;
}): Readonly<Record<string, unknown>> {
  return {
    action_id: input.actionId,
    id: `root-${input.actionId}`,
    payload_hash: "a".repeat(64),
    payload_json: payloadJson({
      accountId: ACCOUNT_ID,
      actionId: input.actionId,
      expectedRevision: input.expectedRevision,
      recurringId: input.recurringId,
      transactionId: input.transactionId,
    }),
    state: input.state ?? "local_pending",
  };
}

function changes(input: {
  readonly createdRoots?: ReadonlyArray<Readonly<Record<string, unknown>>>;
  readonly updatedRoots?: ReadonlyArray<Readonly<Record<string, unknown>>>;
}): SyncPushArgs["changes"] {
  return {
    account_financial_effects: { created: [], deleted: [], updated: [] },
    financial_action_groups: {
      created: [...(input.createdRoots ?? [])],
      deleted: [],
      updated: [...(input.updatedRoots ?? [])],
    },
  };
}

describe("issue #242 foundation review regressions", () => {
  it("keeps evidence-free rejected outcomes reconciliation-incomplete", () => {
    expect(resolveFinancialActionServerOutcomeState("rejected")).toBe(
      "reconciliation_incomplete"
    );
    expect(resolveFinancialActionServerOutcomeState("stale")).toBe(
      "rejected_compensating"
    );
  });

  it("protects every account referenced by an account effect from generic account sync", () => {
    const root = rootRecord({
      actionId: "018f0c7a-1234-7abc-8def-000000000301",
      expectedRevision: "0",
      transactionId: TRANSACTION_ID,
    });

    const protectedIds = collectProtectedFinancialActionRowIds(
      changes({ createdRoots: [root] })
    );

    expect(readRejectedIdsForTable(protectedIds, "accounts")).toEqual([
      ACCOUNT_ID,
    ]);
    expect(readRejectedIdsForTable(protectedIds, "transactions")).toEqual([
      TRANSACTION_ID,
    ]);
  });

  it("protects recurring schedule updates with recurring Pay Now", () => {
    const root = rootRecord({
      actionId: "018f0c7a-1234-7abc-8def-000000000304",
      expectedRevision: "0",
      recurringId: RECURRING_ID,
      transactionId: TRANSACTION_ID,
    });

    const protectedIds = collectProtectedFinancialActionRowIds(
      changes({ createdRoots: [root] })
    );

    expect(readRejectedIdsForTable(protectedIds, "recurring_payments")).toEqual([
      RECURRING_ID,
    ]);
  });

  it("orders guarded push candidates by account revision instead of Watermelon created/updated buckets", () => {
    const laterActionId = "018f0c7a-1234-7abc-8def-000000000302";
    const earlierActionId = "018f0c7a-1234-7abc-8def-000000000301";
    const later = rootRecord({
      actionId: laterActionId,
      expectedRevision: "1",
      transactionId: "018f0c7a-1234-7abc-8def-000000001302",
    });
    const earlier = rootRecord({
      actionId: earlierActionId,
      expectedRevision: "0",
      transactionId: TRANSACTION_ID,
    });

    const bundles = collectAccountFinancialActionPushBundles(
      changes({ createdRoots: [later], updatedRoots: [earlier] })
    );

    expect(bundles.map((bundle) => bundle.candidate.actionId)).toEqual([
      earlierActionId,
      laterActionId,
    ]);
  });

  it("resumes an already sync-pending candidate without repeating the state transition", async () => {
    const markPending = jest.fn().mockResolvedValue(undefined);
    const candidate: FinancialActionPushCandidate = {
      actionId: "018f0c7a-1234-7abc-8def-000000000303",
      payloadHash: "b".repeat(64),
      payloadJson: "{}",
      state: "sync_pending",
    };
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: jest.fn().mockResolvedValue({
        actionId: candidate.actionId,
        status: "accepted",
      }),
      markFinancialActionGroupSyncFailed: jest.fn().mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      recordFinancialActionGroupServerOutcome: jest
        .fn()
        .mockResolvedValue(undefined),
    });

    const result = await coordinator.coordinatePush([candidate]);

    expect(markPending).not.toHaveBeenCalled();
    expect(result.decisions).toEqual([
      expect.objectContaining({
        actionId: candidate.actionId,
        disposition: "acknowledge",
      }),
    ]);
  });

  it("acknowledges reconciled groups without resubmitting or changing terminal state", async () => {
    const markPending = jest.fn().mockResolvedValue(undefined);
    const invokeRpc = jest.fn().mockResolvedValue({
      actionId: "018f0c7a-1234-7abc-8def-000000000305",
      status: "accepted",
    });
    const candidate: FinancialActionPushCandidate = {
      actionId: "018f0c7a-1234-7abc-8def-000000000305",
      payloadHash: "c".repeat(64),
      payloadJson: "{}",
      state: "reconciled",
    };
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: invokeRpc,
      markFinancialActionGroupSyncFailed: jest.fn().mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      recordFinancialActionGroupServerOutcome: jest
        .fn()
        .mockResolvedValue(undefined),
    });

    const result = await coordinator.coordinatePush([candidate]);

    expect(markPending).not.toHaveBeenCalled();
    expect(invokeRpc).not.toHaveBeenCalled();
    expect(result.decisions).toEqual([
      {
        actionId: candidate.actionId,
        disposition: "acknowledge",
        outcome: null,
      },
    ]);
  });
});
