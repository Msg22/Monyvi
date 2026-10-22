import { createHash } from "node:crypto";
import type { SyncPushArgs } from "@nozbe/watermelondb/sync";
import {
  parseFinancialActionEnvelopeJson,
  serializeFinancialActionEnvelope,
} from "@monyvi/logic";
import {
  CANONICAL_ACCOUNT_PUSH_OWNER,
  canonicalLegacyAccountEdit,
} from "./sync-push-legacy-test-fixtures";

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

const EFFECT_ID = "018f0c7a-1234-7abc-8def-000000001501";
const CATEGORY_ID = "00000000-0000-0000-0001-000000000201";

/** A registered recurring Pay Now carries BOTH the schedule revision and its
 * linked financial transaction; one reduced recurring stub is not authority.
 */
function recurringPayNowEnvelope(input: {
  readonly actionId: string;
  readonly expectedRevision: string;
  readonly recurringId: string;
  readonly transactionId: string;
}): ReturnType<typeof parseFinancialActionEnvelopeJson> {
  const original = canonicalLegacyAccountEdit({
    actionId: input.actionId,
    accountId: ACCOUNT_ID,
    effectId: EFFECT_ID,
    transactionId: input.transactionId,
  });
  const baseline = parseFinancialActionEnvelopeJson(original.payloadJson);
  return parseFinancialActionEnvelopeJson(
    serializeFinancialActionEnvelope({
      ...baseline,
      accountGuards: [
        { accountId: ACCOUNT_ID, expectedRevision: input.expectedRevision },
      ],
      domain: "recurring_payments",
      kind: "pay_now",
      domainReferenceId: input.recurringId,
      payload: {
        schemaVersion: "account.balance-effects/v1",
        operationCode: "recurring.pay-now",
        accountEffects: [
          {
            accountId: ACCOUNT_ID,
            amountMinorUnits: "-100",
            currency: "EGP",
            effectId: EFFECT_ID,
          },
        ],
        domainMutation: {
          records: [
            {
              entity: "recurring_payment",
              mode: "update",
              expectedRevision: "0",
              before: {
                financialRevision: "0",
                nextDueDate: "2026-09-06",
                status: "ACTIVE",
              },
              after: {
                id: input.recurringId,
                financialRevision: "1",
                nextDueDate: "2026-10-06",
                status: "ACTIVE",
              },
            },
            {
              entity: "transaction",
              mode: "create",
              expectedUpdatedAt: null,
              after: {
                id: input.transactionId,
                accountId: ACCOUNT_ID,
                amountMinorUnits: "100",
                categoryId: CATEGORY_ID,
                counterparty: null,
                createdAt: "2026-09-06T12:00:00.000Z",
                currency: "EGP",
                date: "2026-09-06",
                deleted: false,
                isDraft: false,
                linkedAssetId: null,
                linkedDebtId: null,
                linkedRecurringId: input.recurringId,
                note: null,
                smsFingerprint: null,
                source: "RECURRING",
                type: "EXPENSE",
              },
            },
          ],
        },
        domainRecordRefs: [input.recurringId, input.transactionId].sort(),
      },
    })
  );
}

/** Every test root is a registered canonical envelope with its real SHA256.
 * The legacy dirty-group protections remain under their original contract.
 */
type CanonicalRootFixture = Readonly<Record<string, unknown>> & {
  readonly action_id: string;
  readonly payload_hash: string;
  readonly payload_json: string;
};

function rootRecord(input: {
  readonly actionId: string;
  readonly expectedRevision: string;
  readonly recurringId?: string;
  readonly state?: string;
  readonly transactionId: string;
}): CanonicalRootFixture {
  const legacy = canonicalLegacyAccountEdit({
    actionId: input.actionId,
    accountId: ACCOUNT_ID,
    effectId: EFFECT_ID,
    transactionId: input.transactionId,
  });
  const baseline = parseFinancialActionEnvelopeJson(legacy.payloadJson);
  const envelope = input.recurringId
    ? recurringPayNowEnvelope({
        actionId: input.actionId,
        expectedRevision: input.expectedRevision,
        recurringId: input.recurringId,
        transactionId: input.transactionId,
      })
    : {
        ...baseline,
        accountGuards: [
          { accountId: ACCOUNT_ID, expectedRevision: input.expectedRevision },
        ],
      };
  const payloadJson = serializeFinancialActionEnvelope(envelope);
  const payloadHash = createHash("sha256")
    .update(payloadJson, "utf8")
    .digest("hex");
  return {
    action_id: input.actionId,
    domain: envelope.domain,
    domain_reference_id: envelope.domainReferenceId,
    id: input.actionId,
    kind: envelope.kind,
    payload_hash: payloadHash,
    payload_json: payloadJson,
    state: input.state ?? "local_complete",
    user_id: CANONICAL_ACCOUNT_PUSH_OWNER,
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

    expect(readRejectedIdsForTable(protectedIds, "recurring_payments")).toEqual(
      [RECURRING_ID]
    );
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
    const invokeRpc = jest.fn().mockResolvedValue({
      actionId: "018f0c7a-1234-7abc-8def-000000000303",
      status: "accepted",
    });
    const canonical = rootRecord({
      actionId: "018f0c7a-1234-7abc-8def-000000000303",
      expectedRevision: "0",
      transactionId: TRANSACTION_ID,
      state: "sync_pending",
    });
    const candidate: FinancialActionPushCandidate = {
      actionId: canonical.action_id,
      payloadHash: canonical.payload_hash,
      payloadJson: canonical.payload_json,
      state: "sync_pending",
    };
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: invokeRpc,
      markFinancialActionGroupSyncFailed: jest
        .fn()
        .mockResolvedValue(undefined),
      markFinancialActionGroupSyncPending: markPending,
      recordFinancialActionGroupServerOutcome: jest
        .fn()
        .mockResolvedValue(undefined),
    });

    const result = await coordinator.coordinatePush([candidate]);

    expect(markPending).not.toHaveBeenCalled();
    expect(invokeRpc).toHaveBeenCalledTimes(1);
    expect(invokeRpc).toHaveBeenCalledWith({
      payloadHash: candidate.payloadHash,
      payloadJson: candidate.payloadJson,
    });
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
    const canonical = rootRecord({
      actionId: "018f0c7a-1234-7abc-8def-000000000305",
      expectedRevision: "0",
      transactionId: TRANSACTION_ID,
      state: "reconciled",
    });
    const candidate: FinancialActionPushCandidate = {
      actionId: canonical.action_id,
      payloadHash: canonical.payload_hash,
      payloadJson: canonical.payload_json,
      state: "reconciled",
    };
    const coordinator = createFinancialActionPushCoordinator({
      invokeAccountFinancialActionRpc: invokeRpc,
      markFinancialActionGroupSyncFailed: jest
        .fn()
        .mockResolvedValue(undefined),
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
