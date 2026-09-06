import { canonicalizeFinancialActionEnvelope } from "../action-contracts";

const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";
const ROOT_RECORD_ID = "40000000-0000-4000-8000-000000000004";
const TRANSACTION_ID = "50000000-0000-4000-8000-000000000005";
const CATEGORY_ID = "60000000-0000-4000-8000-000000000006";
const QUEUE_ID = "70000000-0000-4000-8000-000000000007";

function transactionAfter(input: {
  readonly linkedRecurringId: string | null;
  readonly smsFingerprint: string | null;
  readonly source: "RECURRING" | "SMS";
}): Readonly<Record<string, unknown>> {
  return {
    accountId: ACCOUNT_ID,
    amountMinorUnits: "12500",
    categoryId: CATEGORY_ID,
    counterparty: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    currency: "EGP",
    date: "2026-09-01",
    deleted: false,
    id: TRANSACTION_ID,
    isDraft: false,
    linkedAssetId: null,
    linkedDebtId: null,
    linkedRecurringId: input.linkedRecurringId,
    note: null,
    smsFingerprint: input.smsFingerprint,
    source: input.source,
    type: "EXPENSE",
  };
}

describe("account.balance-effects/v1 composite writer variants", () => {
  it("accepts recurring Pay Now with only its linked schedule transition", () => {
    const value = {
      accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
      actionId: ACTION_ID,
      domain: "recurring_payments",
      domainReferenceId: ROOT_RECORD_ID,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "pay_now",
      occurredAt: "2026-09-01T12:00:00.000Z",
      payload: {
        accountEffects: [
          {
            accountId: ACCOUNT_ID,
            amountMinorUnits: "-12500",
            currency: "EGP",
          },
        ],
        domainMutation: {
          records: [
            {
              after: {
                id: ROOT_RECORD_ID,
                nextDueDate: "2026-10-01",
                status: "ACTIVE",
              },
              entity: "recurring_payment",
              expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
              mode: "update",
            },
            {
              after: transactionAfter({
                linkedRecurringId: ROOT_RECORD_ID,
                smsFingerprint: null,
                source: "RECURRING",
              }),
              entity: "transaction",
              expectedUpdatedAt: null,
              mode: "create",
            },
          ],
        },
        domainRecordRefs: [ROOT_RECORD_ID, TRANSACTION_ID],
        operationCode: "recurring.pay-now",
        schemaVersion: "account.balance-effects/v1",
      },
      payloadVersion: "account.balance-effects/v1",
      userId: USER_ID,
    };

    expect(canonicalizeFinancialActionEnvelope(value)).toEqual(value);
  });

  it("accepts SMS review confirmation with only its selected draft deletion", () => {
    const value = {
      accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
      actionId: ACTION_ID,
      domain: "sms",
      domainReferenceId: ROOT_RECORD_ID,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: "review_confirm",
      occurredAt: "2026-09-01T12:00:00.000Z",
      payload: {
        accountEffects: [
          {
            accountId: ACCOUNT_ID,
            amountMinorUnits: "-12500",
            currency: "EGP",
          },
        ],
        domainMutation: {
          records: [
            {
              after: {
                id: ROOT_RECORD_ID,
                queueId: QUEUE_ID,
                smsFingerprint: "sms-fingerprint-1",
                snapshotHash:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
              entity: "sms_review_draft_item",
              expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
              mode: "delete",
            },
            {
              after: transactionAfter({
                linkedRecurringId: null,
                smsFingerprint: "sms-fingerprint-1",
                source: "SMS",
              }),
              entity: "transaction",
              expectedUpdatedAt: null,
              mode: "create",
            },
          ],
        },
        domainRecordRefs: [ROOT_RECORD_ID, TRANSACTION_ID],
        operationCode: "sms.review-durable",
        schemaVersion: "account.balance-effects/v1",
      },
      payloadVersion: "account.balance-effects/v1",
      userId: USER_ID,
    };

    expect(canonicalizeFinancialActionEnvelope(value)).toEqual(value);
    const descriptor = value.payload.domainMutation.records[0];
    for (const forbiddenKey of [
      "payloadJson",
      "originalSms",
      "position",
      "selectionOverride",
    ]) {
      expect(() =>
        canonicalizeFinancialActionEnvelope({
          ...value,
          payload: {
            ...value.payload,
            domainMutation: {
              records: [
                {
                  ...descriptor,
                  after: {
                    ...descriptor.after,
                    [forbiddenKey]: "private review data",
                  },
                },
                value.payload.domainMutation.records[1],
              ],
            },
          },
        })
      ).toThrow();
    }
  });
});
