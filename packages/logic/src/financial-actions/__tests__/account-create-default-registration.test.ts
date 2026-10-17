/** #395 T067/T068 explicit feature registry, zero-default action, legacy parity. */
import {
  canonicalizeFinancialActionEnvelope,
  serializeFinancialActionEnvelope,
} from "../action-contracts";
import {
  ACTION_REGISTRY_ERROR_CODES,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
} from "../action-registry";
import {
  createAccountDefaultAndReviewRegistry,
  createAccountCreateDefaultDefinitions,
} from "../account-create-default-registration";
import {
  ADD_DEFAULT_IDS,
  makeAccountCreateDefaultPayload,
} from "./account-create-default-test-fixtures";
import {
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  reviewBatchSavePayload,
} from "./review-batch-save-fixtures";

const registry = createAccountDefaultAndReviewRegistry();
function envelopeFor(
  payload: ReturnType<typeof makeAccountCreateDefaultPayload>,
  amountIsZero: boolean
): object {
  return {
    actionId: ADD_DEFAULT_IDS.action,
    accountGuards: amountIsZero
      ? []
      : [{ accountId: ADD_DEFAULT_IDS.newAccount, expectedRevision: "0" }],
    domain: "accounts",
    domainReferenceId: ADD_DEFAULT_IDS.newAccount,
    envelopeVersion: "monyvi.financial-action/v1",
    kind: "create_with_default",
    occurredAt: "2026-10-16T09:00:00.000Z",
    payload,
    payloadVersion: "account.create-default/v1",
    userId: ADD_DEFAULT_IDS.owner,
  };
}
describe("#395 explicit Add default tuple registration", () => {
  it("keeps DEFAULT legacy registry unchanged while adding one opt-in Add definition", () => {
    expect(() =>
      DEFAULT_FINANCIAL_ACTION_REGISTRY.resolve(
        "accounts",
        "create_with_default",
        "account.create-default/v1"
      )
    ).toThrow(ACTION_REGISTRY_ERROR_CODES.UNKNOWN_DEFINITION);
    const definitions = createAccountCreateDefaultDefinitions(
      ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD
    );
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      domain: "accounts",
      kind: "create_with_default",
      payloadVersion: "account.create-default/v1",
    });
    expect(
      registry.resolve(
        "accounts",
        "create_with_default",
        "account.create-default/v1"
      ).payloadVersion
    ).toBe("account.create-default/v1");
    expect(
      registry.resolve("accounts", "create", "account.balance-effects/v1").kind
    ).toBe("create");
    expect(
      registry.resolve(
        "transactions",
        "review_batch_save",
        "review.batch-save/v1"
      ).kind
    ).toBe("review_batch_save");
  });
  it("accepts exact zero-opening Add metadata envelope and preserves all records", () => {
    const payload = makeAccountCreateDefaultPayload();
    const envelope = envelopeFor(payload, true);
    const canonical = canonicalizeFinancialActionEnvelope(envelope, registry);
    expect(canonical.payload).toEqual(payload);
    expect(canonical.accountGuards).toEqual([]);
    expect(serializeFinancialActionEnvelope(canonical, registry)).toContain(
      '"payloadVersion":"account.create-default/v1"'
    );
    expect(reviewBatchSavePayload.schemaVersion).toBe("review.batch-save/v1");
  });
  it("rejects forged prior-clear ID even when root refs are changed to match it", () => {
    const payload = makeAccountCreateDefaultPayload();
    const records = payload.domainMutation.records.map((record) =>
      record.entity === "account_default"
        ? { ...record, after: { id: ADD_DEFAULT_IDS.other, isDefault: false } }
        : record
    );
    const mutated = {
      ...payload,
      domainRecordRefs: records.map((record) => record.after.id).sort(),
      domainMutation: { records },
    };
    expect(() =>
      registry
        .resolve("accounts", "create_with_default", "account.create-default/v1")
        .validatePayload(mutated)
    ).toThrow(ACTION_REGISTRY_ERROR_CODES.INVALID_PAYLOAD);
  });
  it("keeps unrelated old and Review tuple mismatches rejected", () => {
    expect(() =>
      registry.resolve("accounts", "create", "account.create-default/v1")
    ).toThrow(ACTION_REGISTRY_ERROR_CODES.UNKNOWN_DEFINITION);
    expect(() =>
      registry.resolve(
        "transactions",
        "review_batch_save",
        "account.create-default/v1"
      )
    ).toThrow(ACTION_REGISTRY_ERROR_CODES.UNKNOWN_DEFINITION);
  });

  it("admits nonzero Add only with the created account's sole revision-0 guard", () => {
    const payload = makeAccountCreateDefaultPayload({
      openingMinorUnits: "1001",
    });
    const envelope = envelopeFor(payload, false);
    const canonical = canonicalizeFinancialActionEnvelope(envelope, registry);
    expect(canonical.payload).toEqual(payload);
    expect(canonical.accountGuards).toEqual([
      {
        accountId: ADD_DEFAULT_IDS.newAccount,
        expectedRevision: "0",
      },
    ]);
    expect(payload.createGuards).toContainEqual({
      entity: "account",
      id: ADD_DEFAULT_IDS.newAccount,
      expectedAbsent: true,
    });
    expect(payload.accountEffects).toEqual([
      {
        accountId: ADD_DEFAULT_IDS.newAccount,
        amountMinorUnits: "1001",
        currency: "EGP",
        effectId: ADD_DEFAULT_IDS.effect,
      },
    ]);
    expect(canonical.domainReferenceId).toBe(ADD_DEFAULT_IDS.newAccount);
    expect(serializeFinancialActionEnvelope(canonical, registry)).toContain(
      '"payloadVersion":"account.create-default/v1"'
    );
  });

  it("rejects even an exact revision-0 financial guard for zero-opening Add", () => {
    const zero = makeAccountCreateDefaultPayload();
    expect(() =>
      canonicalizeFinancialActionEnvelope(
        {
          ...envelopeFor(zero, true),
          accountGuards: [
            {
              accountId: ADD_DEFAULT_IDS.newAccount,
              expectedRevision: "0",
            },
          ],
        },
        registry
      )
    ).toThrow("financial_action_invalid_envelope");
  });

  it("rejects absent, wrong-ID, wrong-revision, and additional nonzero guards", () => {
    const nonzero = makeAccountCreateDefaultPayload({
      openingMinorUnits: "1001",
    });
    const good = envelopeFor(nonzero, false);
    const badGuards = [
      [],
      [{ accountId: ADD_DEFAULT_IDS.previous, expectedRevision: "0" }],
      [{ accountId: ADD_DEFAULT_IDS.newAccount, expectedRevision: "1" }],
      [
        { accountId: ADD_DEFAULT_IDS.previous, expectedRevision: "0" },
        { accountId: ADD_DEFAULT_IDS.newAccount, expectedRevision: "0" },
      ],
    ];
    for (const accountGuards of badGuards) {
      expect(() =>
        canonicalizeFinancialActionEnvelope(
          {
            ...good,
            accountGuards,
          },
          registry
        )
      ).toThrow("financial_action_invalid_envelope");
    }
  });

  it("rejects an old-default ref as the action root even when it appears in domainRecordRefs", () => {
    const nonzero = makeAccountCreateDefaultPayload({
      openingMinorUnits: "1001",
    });
    expect(nonzero.domainRecordRefs).toContain(ADD_DEFAULT_IDS.previous);
    expect(() =>
      canonicalizeFinancialActionEnvelope(
        {
          ...envelopeFor(nonzero, false),
          domainReferenceId: ADD_DEFAULT_IDS.previous,
        },
        registry
      )
    ).toThrow("financial_action_invalid_envelope");
  });

  it("requires the exact new-account create absence guard and matching opening effect", () => {
    const original = makeAccountCreateDefaultPayload({
      openingMinorUnits: "1001",
    });
    const withoutAbsent = {
      ...original,
      createGuards: original.createGuards.filter(
        (guard) => guard.entity !== "account"
      ),
    };
    const wrongEffect = {
      ...original,
      accountEffects: [
        {
          ...original.accountEffects[0],
          currency: "USD",
        },
      ],
    };
    expect(() =>
      canonicalizeFinancialActionEnvelope(
        envelopeFor(original, false),
        registry
      )
    ).not.toThrow();
    for (const payload of [withoutAbsent, wrongEffect]) {
      expect(() =>
        canonicalizeFinancialActionEnvelope(
          {
            ...envelopeFor(original, false),
            payload,
          },
          registry
        )
      ).toThrow();
    }
  });

  it("keeps actual legacy and Review envelopes canonical after Add registration", () => {
    expect(
      canonicalizeFinancialActionEnvelope(
        legacyEditBalanceEnvelope,
        DEFAULT_FINANCIAL_ACTION_REGISTRY
      )
    ).toEqual(legacyEditBalanceEnvelope);
    expect(
      canonicalizeFinancialActionEnvelope(legacyEditBalanceEnvelope, registry)
    ).toEqual(legacyEditBalanceEnvelope);
    expect(
      canonicalizeFinancialActionEnvelope(reviewBatchSaveEnvelope, registry)
    ).toEqual(reviewBatchSaveEnvelope);
    expect(() =>
      canonicalizeFinancialActionEnvelope(
        reviewBatchSaveEnvelope,
        DEFAULT_FINANCIAL_ACTION_REGISTRY
      )
    ).toThrow(ACTION_REGISTRY_ERROR_CODES.UNKNOWN_DEFINITION);
  });
});
