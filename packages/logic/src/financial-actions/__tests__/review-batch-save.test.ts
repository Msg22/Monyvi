// Red-first tests for the frozen review.batch-save/v1 wire contract.
// Static imports: the suite stays Red until the T046 module exists.

import { canonicalizeFinancialActionEnvelope } from "../action-contracts";
import {
  createFinancialActionRegistry,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
} from "../action-registry";
import {
  createReviewFinancialActionDefinitions,
  reviewBatchSavePayloadSchema,
  validateReviewBatchSavePayload,
} from "../review-batch-save";
import {
  NEW_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_EFFECT_ID,
  REVIEW_EXPENSE_RECORD_ID,
  REVIEW_INCOME_RECORD_ID,
  SMS_INCOME_FINGERPRINT,
  SMS_NET_EFFECT_ID,
  atmTransferEnvelope,
  atmTransferPayload,
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  reviewBatchSavePayload,
  smsNewBankEnvelope,
  smsNewBankPayload,
} from "./review-batch-save-fixtures";

const INVALID_PAYLOAD_CODE = "review_batch_save_invalid_payload";

const REQUIRED_ROOT_KEYS = [
  "schemaVersion",
  "operationCode",
  "source",
  "sessionId",
  "selectedSourceRefs",
  "confirmedGroupRefs",
  "createGuards",
  "accountEffects",
  "domainRecordRefs",
  "domainMutation",
  "localSmsBookkeeping",
] as const;

const reviewRegistry = createFinancialActionRegistry([
  ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
  ...createReviewFinancialActionDefinitions(INVALID_PAYLOAD_CODE),
]);

function omitRootKey(key: string): Record<string, unknown> {
  const source: Record<string, unknown> = reviewBatchSavePayload;
  const copy: Record<string, unknown> = {};
  for (const entryKey of Object.keys(source)) {
    if (entryKey !== key) copy[entryKey] = source[entryKey];
  }
  return copy;
}

function selectedRef(
  rowId: string,
  recordId: string,
  sourceFingerprint: string | null
): Record<string, unknown> {
  return { rowId, recordId, sourceFingerprint };
}

function accountEffect(
  accountId: string,
  amountMinorUnits: string
): Record<string, unknown> {
  return {
    accountId,
    amountMinorUnits,
    currency: "EGP",
    effectId: REVIEW_EFFECT_ID,
  };
}

describe("review.batch-save/v1 payload schema", () => {
  it("accepts the baseline zero-net same-account payload unchanged", () => {
    const parsed = validateReviewBatchSavePayload(reviewBatchSavePayload);
    expect(parsed).toEqual(reviewBatchSavePayload);
  });

  it("parses the baseline payload through the exported schema", () => {
    const parsed = reviewBatchSavePayloadSchema.parse(reviewBatchSavePayload);
    expect(parsed).toEqual(reviewBatchSavePayload);
  });

  it("accepts the zero-net aggregate effect under the new tuple", () => {
    const parsed = validateReviewBatchSavePayload(reviewBatchSavePayload);
    expect(parsed.accountEffects).toHaveLength(1);
    expect(parsed.accountEffects[0]?.amountMinorUnits).toBe("0");
  });

  it.each(REQUIRED_ROOT_KEYS)(
    "rejects payload when root key %s is missing",
    (key: string) => {
      expect(() => validateReviewBatchSavePayload(omitRootKey(key))).toThrow();
    }
  );

  it("rejects an extra raw transcript or evidence key", () => {
    const withTranscript = {
      ...reviewBatchSavePayload,
      transcript: "raw audio text",
    };
    expect(() => validateReviewBatchSavePayload(withTranscript)).toThrow();
    const withEvidence = {
      ...reviewBatchSavePayload,
      evidenceSpans: [{ field: "body" }],
    };
    expect(() => validateReviewBatchSavePayload(withEvidence)).toThrow();
  });

  it("rejects incomplete source-ref coverage, a mismatched record ref, and duplicate refs", () => {
    const missingCoverage = {
      ...reviewBatchSavePayload,
      selectedSourceRefs: [
        selectedRef(
          "8a000000-0000-4000-8000-000000000011",
          REVIEW_INCOME_RECORD_ID,
          null
        ),
      ],
    };
    expect(() => validateReviewBatchSavePayload(missingCoverage)).toThrow();

    const mismatchedRecord = {
      ...reviewBatchSavePayload,
      selectedSourceRefs: [
        selectedRef(
          "8a000000-0000-4000-8000-000000000011",
          "9b000000-0000-4000-8000-000000000099",
          null
        ),
        selectedRef(
          "8b000000-0000-4000-8000-000000000012",
          REVIEW_EXPENSE_RECORD_ID,
          null
        ),
      ],
    };
    expect(() => validateReviewBatchSavePayload(mismatchedRecord)).toThrow();

    const duplicate = {
      ...reviewBatchSavePayload,
      selectedSourceRefs: [
        selectedRef(
          "8a000000-0000-4000-8000-000000000011",
          REVIEW_INCOME_RECORD_ID,
          null
        ),
        selectedRef(
          "8a000000-0000-4000-8000-000000000011",
          REVIEW_INCOME_RECORD_ID,
          null
        ),
      ],
    };
    expect(() => validateReviewBatchSavePayload(duplicate)).toThrow();
  });

  it("rejects missing and duplicate create guards", () => {
    const missing = {
      ...reviewBatchSavePayload,
      createGuards: [
        {
          entity: "transaction",
          id: REVIEW_INCOME_RECORD_ID,
          expectedAbsent: true,
        },
      ],
    };
    expect(() => validateReviewBatchSavePayload(missing)).toThrow();

    const duplicate = {
      ...reviewBatchSavePayload,
      createGuards: [
        {
          entity: "transaction",
          id: REVIEW_INCOME_RECORD_ID,
          expectedAbsent: true,
        },
        {
          entity: "transaction",
          id: REVIEW_INCOME_RECORD_ID,
          expectedAbsent: true,
        },
      ],
    };
    expect(() => validateReviewBatchSavePayload(duplicate)).toThrow();
  });

  it("rejects an effect aggregate that disagrees with the mutation net", () => {
    const inconsistent = {
      ...reviewBatchSavePayload,
      accountEffects: [accountEffect(REVIEW_ACCOUNT_ID, "2002")],
    };
    expect(() => validateReviewBatchSavePayload(inconsistent)).toThrow();
  });

  it("rejects a sourceFingerprint that disagrees with the financial row", () => {
    const mismatched = {
      ...reviewBatchSavePayload,
      selectedSourceRefs: [
        selectedRef(
          "8a000000-0000-4000-8000-000000000011",
          REVIEW_INCOME_RECORD_ID,
          null
        ),
        selectedRef(
          "8b000000-0000-4000-8000-000000000012",
          REVIEW_EXPENSE_RECORD_ID,
          "0123456789abcdef0123456789abcdef"
        ),
      ],
    };
    expect(() => validateReviewBatchSavePayload(mismatched)).toThrow();
  });
});

describe("review.batch-save/v1 registry integration", () => {
  it("registers the review tuple and rejects wrong domain/kind/version", () => {
    expect(
      reviewRegistry.resolve(
        "transactions",
        "review_batch_save",
        "review.batch-save/v1"
      )
    ).toBeDefined();

    expect(() =>
      reviewRegistry.resolve(
        "accounts",
        "review_batch_save",
        "review.batch-save/v1"
      )
    ).toThrow("financial_action_unknown_definition");
    expect(() =>
      reviewRegistry.resolve(
        "transactions",
        "batch_import",
        "review.batch-save/v1"
      )
    ).toThrow("financial_action_unknown_definition");
    expect(() =>
      reviewRegistry.resolve(
        "transactions",
        "review_batch_save",
        "account.balance-effects/v1"
      )
    ).toThrow("financial_action_unknown_definition");
  });

  it("keeps every legacy definition unchanged by key and validator", () => {
    for (const legacy of DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions) {
      const resolved = reviewRegistry.resolve(
        legacy.domain,
        legacy.kind,
        legacy.payloadVersion
      );
      expect(resolved.validatePayload).toBe(legacy.validatePayload);
    }
  });

  it("canonicalizes the valid review envelope and rejects a broken payload", () => {
    const canonical = canonicalizeFinancialActionEnvelope(
      reviewBatchSaveEnvelope,
      reviewRegistry
    );
    expect(canonical.payload).toEqual(reviewBatchSavePayload);
    expect(canonical.accountGuards).toEqual(
      reviewBatchSaveEnvelope.accountGuards
    );

    const brokenEnvelope = { ...reviewBatchSaveEnvelope, payload: {} };
    expect(() =>
      canonicalizeFinancialActionEnvelope(brokenEnvelope, reviewRegistry)
    ).toThrow();
  });

  it("still rejects zero effects under the old canonical operation", () => {
    const validLegacyEnvelope = legacyEditBalanceEnvelope;
    const canonicalLegacy = canonicalizeFinancialActionEnvelope(
      validLegacyEnvelope,
      reviewRegistry
    );
    expect(canonicalLegacy).toEqual(validLegacyEnvelope);

    const zeroEffectEnvelope = {
      ...validLegacyEnvelope,
      payload: {
        ...validLegacyEnvelope.payload,
        accountEffects: [accountEffect(REVIEW_ACCOUNT_ID, "0")],
      },
    };
    expect(() =>
      canonicalizeFinancialActionEnvelope(zeroEffectEnvelope, reviewRegistry)
    ).toThrow();
  });
});

describe("review.batch-save/v1 acceptance scenarios", () => {
  it("accepts the SMS new-bank payload and canonical envelope", () => {
    const parsed = validateReviewBatchSavePayload(smsNewBankPayload);
    expect(parsed).toEqual(smsNewBankPayload);
    const canonical = canonicalizeFinancialActionEnvelope(
      smsNewBankEnvelope,
      reviewRegistry
    );
    expect(canonical.payload).toEqual(smsNewBankPayload);
    expect(canonical.accountGuards).toEqual(smsNewBankEnvelope.accountGuards);
  });

  it("rejects the SMS scenario when only the net aggregate is wrong", () => {
    const wrongNet = {
      ...smsNewBankPayload,
      accountEffects: [
        {
          accountId: NEW_BANK_ACCOUNT_ID,
          amountMinorUnits: "2501",
          currency: "EGP",
          effectId: SMS_NET_EFFECT_ID,
        },
      ],
    };
    expect(() => validateReviewBatchSavePayload(wrongNet)).toThrow();
  });

  it("rejects the SMS scenario when both records share one fingerprint", () => {
    const sharedFingerprint = SMS_INCOME_FINGERPRINT;
    const duplicateFingerprint = {
      ...smsNewBankPayload,
      selectedSourceRefs: smsNewBankPayload.selectedSourceRefs.map((ref) => ({
        ...ref,
        sourceFingerprint: sharedFingerprint,
      })),
      domainMutation: {
        records: [
          ...smsNewBankPayload.domainMutation.records.slice(0, 3),
          {
            ...smsNewBankPayload.domainMutation.records[3],
            after: {
              ...smsNewBankPayload.domainMutation.records[3].after,
              smsFingerprint: sharedFingerprint,
            },
          },
        ],
      },
    };
    expect(() =>
      validateReviewBatchSavePayload(duplicateFingerprint)
    ).toThrow();
  });

  it("accepts the ATM transfer payload and canonical envelope", () => {
    const parsed = validateReviewBatchSavePayload(atmTransferPayload);
    expect(parsed).toEqual(atmTransferPayload);
    const canonical = canonicalizeFinancialActionEnvelope(
      atmTransferEnvelope,
      reviewRegistry
    );
    expect(canonical.payload).toEqual(atmTransferPayload);
    expect(canonical.accountGuards).toEqual(atmTransferEnvelope.accountGuards);
  });

  it("rejects the ATM scenario when the second account effect is missing", () => {
    const missingSecondEffect = {
      ...atmTransferPayload,
      accountEffects: atmTransferPayload.accountEffects.slice(0, 1),
    };
    expect(() => validateReviewBatchSavePayload(missingSecondEffect)).toThrow();
  });
});
