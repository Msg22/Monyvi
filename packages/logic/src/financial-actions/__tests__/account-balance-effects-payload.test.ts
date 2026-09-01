import { canonicalizeFinancialActionEnvelope } from "../action-contracts";
import { DEFAULT_FINANCIAL_ACTION_REGISTRY } from "../action-registry";

const ACTION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000003";

const ACCOUNT_EDIT_ENVELOPE = {
  accountGuards: [{ accountId: ACCOUNT_ID, expectedRevision: "7" }],
  actionId: ACTION_ID,
  domain: "accounts",
  domainReferenceId: ACCOUNT_ID,
  envelopeVersion: "monyvi.financial-action/v1",
  kind: "edit_balance",
  occurredAt: "2026-09-01T12:00:00.000Z",
  payload: {
    accountEffects: [
      { accountId: ACCOUNT_ID, amountMinorUnits: "2500", currency: "EGP" },
    ],
    domainMutation: {
      records: [
        {
          after: {
            createdAt: "2026-08-01T12:00:00.000Z",
            currency: "EGP",
            deleted: false,
            id: ACCOUNT_ID,
            institutionId: null,
            isDefault: true,
            name: "Cash",
            openingBalanceMinorUnits: null,
            providerDisplayName: null,
            targetBalanceMinorUnits: "12500",
            type: "CASH",
          },
          entity: "account",
          expectedUpdatedAt: "2026-08-31T12:00:00.000Z",
          mode: "update",
        },
      ],
    },
    domainRecordRefs: [ACCOUNT_ID],
    operationCode: "account.edit-balance",
    schemaVersion: "account.balance-effects/v1",
  },
  payloadVersion: "account.balance-effects/v1",
  userId: USER_ID,
};
type AccountEditEnvelope = typeof ACCOUNT_EDIT_ENVELOPE;

function accountEditEnvelope(): AccountEditEnvelope {
  return ACCOUNT_EDIT_ENVELOPE;
}

describe("account.balance-effects/v1", () => {
  it("keeps all six Metals definitions and registers every guarded writer tuple", () => {
    expect(DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions).toHaveLength(24);
    expect(
      DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
        "accounts",
        "edit_balance",
        "account.balance-effects/v1"
      )
    ).toBeDefined();
  });

  it("accepts an exact guarded account mutation", () => {
    expect(canonicalizeFinancialActionEnvelope(accountEditEnvelope())).toEqual(
      accountEditEnvelope()
    );
  });

  it("rejects extra payload keys", () => {
    const value = accountEditEnvelope();
    expect(() =>
      canonicalizeFinancialActionEnvelope({
        ...value,
        payload: { ...value.payload, extra: true },
      })
    ).toThrow();
  });

  it("rejects zero effects", () => {
    const value = accountEditEnvelope();
    expect(() =>
      canonicalizeFinancialActionEnvelope({
        ...value,
        payload: {
          ...value.payload,
          accountEffects: [
            { ...value.payload.accountEffects[0], amountMinorUnits: "0" },
          ],
        },
      })
    ).toThrow();
  });

  it("rejects unknown operations", () => {
    const value = accountEditEnvelope();
    expect(() =>
      canonicalizeFinancialActionEnvelope({
        ...value,
        payload: { ...value.payload, operationCode: "account.unknown" },
      })
    ).toThrow();
  });

  it("rejects missing domain mutations", () => {
    const value = accountEditEnvelope();
    const { domainMutation: _domainMutation, ...payload } = value.payload;
    expect(() =>
      canonicalizeFinancialActionEnvelope({ ...value, payload })
    ).toThrow();
  });

  it("rejects guard/effect mismatches", () => {
    const value = accountEditEnvelope();
    expect(() =>
      canonicalizeFinancialActionEnvelope({
        ...value,
        accountGuards: [{ accountId: ACTION_ID, expectedRevision: "7" }],
      })
    ).toThrow();
  });
});
