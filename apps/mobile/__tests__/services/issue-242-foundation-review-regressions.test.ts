import type { SyncPushArgs } from "@nozbe/watermelondb/sync";

import {
  createFinancialActionPushCoordinator,
  type FinancialActionPushCandidate,
} from "@/services/financial-action-sync-service";
import {
  collectAccountFinancialActionPushBundles,
  collectProtectedFinancialActionRowIds,
} from "@/services/sync/account-protected-fields";

const ACCOUNT_ID = "018f0c7a-1234-7abc-8def-000000000211";
const TRANSACTION_ID = "018f0c7a-1234-7abc-8def-000000001301";

function payloadJson(input: {
  readonly accountId: string;
  readonly actionId: string;
  readonly expectedRevision: string;
  readonly transactionId: string;
}): string {
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
      domainMutation: {
        records: [
          {
            after: { id: input.transactionId },
            entity: "transaction",
            expectedUpdatedAt: null,
            mode: "create",
          },
        ],
      },
      domainRecordRefs: [input.transactionId],
      operationCode: "transaction.create",
      schemaVersion: "account.balance-effects/v1",
    },
    payloadVersion: "account.balance-effects/v1",
    userId: "018f0c7a-1234-7abc-8def-000000000201",
  });
}

function rootRecord(input: {
  readonly actionId: string;
  readonly expectedRevision: string;
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
      transactionId: input.transactionId,
    }),
    state: "local_pending",
  };
}

function changes(input: {
  readonly createdRoots?: readonly Readonly<Record<string, unknown>>[];
  readonly updatedRoots?: readonly Readonly<Record<string, unknown>>[];
}): SyncPushArgs["changes"] {
  return {
    account_financial_effects: { created: [], deleted: [], updated: [] },
    financial_action_groups: {
      created: [...(input.createdRoots ?? [])],
      deleted: [],
      updated: [...(input.updatedRoots ?? [])],
    },
  } as unknown as SyncPushArgs["changes"];
}

describe("issue #242 foundation review regressions", () => {
  it("protects every account referenced by an account effect from generic account sync", () => {
    const root = rootRecord({
      actionId: "018f0c7a-1234-7abc-8def-000000000301",
      expectedRevision: "0",
      transactionId: TRANSACTION_ID,
    });

    const protectedIds = collectProtectedFinancialActionRowIds(
      changes({ createdRoots: [root] })
    );

    expect(protectedIds?.accounts).toEqual([ACCOUNT_ID]);
    expect(protectedIds?.transactions).toEqual([TRANSACTION_ID]);
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
});
