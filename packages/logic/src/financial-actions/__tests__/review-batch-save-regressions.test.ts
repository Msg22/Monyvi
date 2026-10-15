/**
 * #395 T046 independent regression Reds (A-G), no SUT mocks or copied DTOs.
 * Derive all payloads from the handed-off T042 fixtures and real validators.
 * EXPECT mixed behavioral Red; do not conflate this with missing-module Red.
 */
import {
  canonicalizeFinancialActionEnvelope,
  parseCanonicalUnsignedIntegerString,
} from "../action-contracts";
import {
  createFinancialActionRegistry,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
} from "../action-registry";
import {
  createReviewFinancialActionDefinitions,
  validateReviewBatchSavePayload,
} from "../review-batch-save";
import {
  validateCreateCoverage,
  validateSelectedCoverage,
  validateSourceAndChildren,
} from "../review-batch-save-integrity";
import {
  validateAffectedAccountCoverage,
  validateCreatedAccountBalances,
  validatePostedEffects,
  validateTransferEndpoints,
} from "../review-batch-save-effects";
import {
  ATM_BANK_ACCOUNT_ID,
  ATM_QUEUE_ID,
  ATM_TRANSFER_RECORD_ID,
  NEW_BANK_ACCOUNT_ID,
  REVIEW_ACCOUNT_ID,
  REVIEW_TRANSACTION_DATE,
  SMS_DRAFT_ID,
  SMS_QUEUE_ID,
  SMS_QUEUE_ID_2,
  atmTransferEnvelope,
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  reviewBatchSavePayload,
  smsNewBankEnvelope,
  smsNewBankPayload,
} from "./review-batch-save-fixtures";
import {
  atmAtAmount,
  cashUsedAsAtmSourcePayload,
  cashUsedForOrdinarySmsPayload,
  egpFinancialAmountBounds,
  existingAccountSmsPayload,
  queuedAtmPayload,
  sharedSmsQueuePayload,
  validAtmCashDestinationPayload,
  validVoiceCashPayload,
  voiceNewBankPayload,
  voiceZeroNetAtAmount,
} from "./review-batch-save-regression-fixtures";

const INVALID_CODE = "review_batch_save_invalid_payload";
const registry = createFinancialActionRegistry([
  ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
  ...createReviewFinancialActionDefinitions(INVALID_CODE),
]);

describe("#395 T046 A — same real SMS queue, distinct local drafts", () => {
  it("RED: accepts two selected SMS drafts sharing one queueId and sessionId", () => {
    const payload = sharedSmsQueuePayload();
    expect(payload.localSmsBookkeeping).toHaveLength(2);
    expect(payload.sessionId).toBe(SMS_QUEUE_ID);
    expect(payload.localSmsBookkeeping[0]?.draftId).toBe(SMS_DRAFT_ID);
    expect(payload.localSmsBookkeeping[0]?.queueId).toBe(SMS_QUEUE_ID);
    expect(payload.localSmsBookkeeping[1]?.queueId).toBe(SMS_QUEUE_ID);
    expect(
      payload.localSmsBookkeeping.every(
        (entry) => entry.queueId === payload.sessionId
      )
    ).toBe(true);
    expect(payload.localSmsBookkeeping[0]?.draftId).not.toBe(
      payload.localSmsBookkeeping[1]?.draftId
    );
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
    expect(
      canonicalizeFinancialActionEnvelope(
        { ...smsNewBankEnvelope, payload },
        registry
      ).payload
    ).toEqual(payload);
  });

  it("RED: rejects mixed/foreign queue IDs inside one logical SMS batch", () => {
    const payload = sharedSmsQueuePayload();
    const mixed = {
      ...payload,
      localSmsBookkeeping: payload.localSmsBookkeeping.map((entry, index) =>
        index === 1 ? { ...entry, queueId: SMS_QUEUE_ID_2 } : entry
      ),
    };
    expect(mixed.localSmsBookkeeping[0]?.queueId).not.toBe(
      mixed.localSmsBookkeeping[1]?.queueId
    );
    expect(() => validateReviewBatchSavePayload(mixed)).toThrow();
  });

  it("rejects a repeated local draftId even when the queue is shared", () => {
    const payload = sharedSmsQueuePayload();
    const repeatedDraft = {
      ...payload,
      localSmsBookkeeping: payload.localSmsBookkeeping.map((entry, index) =>
        index === 1 ? { ...entry, draftId: SMS_DRAFT_ID } : entry
      ),
    };
    expect(() => validateReviewBatchSavePayload(repeatedDraft)).toThrow();
  });
});

describe("#395 T046 B — no order-dependent revision-schema module cycle", () => {
  it("RED: loads the real review shapes FIRST in an isolated Jest module registry", () => {
    jest.isolateModules(() => {
      const module = jest.requireActual<
        typeof import("../review-batch-save-shapes")
      >("../review-batch-save-shapes");
      expect(module.reviewBatchSaveWireSchema).toBeDefined();
      const parsed = module.reviewBatchSaveWireSchema.safeParse(
        reviewBatchSavePayload
      );
      expect(parsed.success).toBe(true);
    });
  });

  it("preserves the public canonical unsigned revision values and error code", () => {
    for (const revision of ["0", "7", "9223372036854775807"]) {
      expect(parseCanonicalUnsignedIntegerString(revision)).toBe(revision);
    }
    for (const invalid of ["", "01", "+1", "-1", "9223372036854775808"]) {
      expect(() => parseCanonicalUnsignedIntegerString(invalid)).toThrow(
        "financial_action_invalid_revision"
      );
    }
  });

  it("retains original guarded v1 and review envelope canonicalization", () => {
    expect(
      canonicalizeFinancialActionEnvelope(legacyEditBalanceEnvelope, registry)
    ).toEqual(legacyEditBalanceEnvelope);
    expect(
      canonicalizeFinancialActionEnvelope(reviewBatchSaveEnvelope, registry)
        .payload
    ).toEqual(reviewBatchSavePayload);
  });
});

describe("#395 T046 C — current currency precision and major-amount maximum", () => {
  it("accepts inclusive EGP maximum on two opposite selected transactions", () => {
    const { maximumMinorUnits } = egpFinancialAmountBounds();
    const payload = voiceZeroNetAtAmount(maximumMinorUnits);
    expect(
      payload.domainMutation.records.map((record) => {
        if (record.entity !== "transaction")
          throw new Error(
            "Expected only selected Voice financial transactions"
          );
        return record.after.amountMinorUnits;
      })
    ).toEqual([maximumMinorUnits, maximumMinorUnits]);
    expect(payload.accountEffects[0]?.amountMinorUnits).toBe("0");
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
  });

  it("rejects one minor unit over EGP maximum on both balanced rows", () => {
    const { oneMinorUnitOver } = egpFinancialAmountBounds();
    const payload = voiceZeroNetAtAmount(oneMinorUnitOver);
    expect(payload.accountEffects[0]?.amountMinorUnits).toBe("0");
    expect(() => validateReviewBatchSavePayload(payload)).toThrow();
  });

  it("accepts the inclusive maximum on one ATM transfer and exact endpoint effects", () => {
    const { maximumMinorUnits } = egpFinancialAmountBounds();
    const payload = atmAtAmount(maximumMinorUnits);
    expect(
      payload.accountEffects.map((effect) => effect.amountMinorUnits)
    ).toEqual(["-" + maximumMinorUnits, maximumMinorUnits]);
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
    expect(
      canonicalizeFinancialActionEnvelope(
        { ...atmTransferEnvelope, payload },
        registry
      ).payload
    ).toEqual(payload);
  });

  it("rejects a one-minor-unit ATM overflow with otherwise exact balanced effects", () => {
    const { oneMinorUnitOver } = egpFinancialAmountBounds();
    const payload = atmAtAmount(oneMinorUnitOver);
    expect(
      payload.accountEffects.map((effect) => effect.amountMinorUnits)
    ).toEqual(["-" + oneMinorUnitOver, oneMinorUnitOver]);
    expect(() => validateReviewBatchSavePayload(payload)).toThrow();
  });
});

describe("#395 T046 D — SMS bookkeeping IDs are local-only", () => {
  it("accepts the valid ATM transfer with aligned queue/session and local IDs", () => {
    const payload = queuedAtmPayload();
    expect(payload.sessionId).toBe(ATM_QUEUE_ID);
    expect(payload.localSmsBookkeeping[0]?.queueId).toBe(payload.sessionId);
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
    expect(
      canonicalizeFinancialActionEnvelope(
        { ...atmTransferEnvelope, payload },
        registry
      ).payload
    ).toEqual(payload);
  });

  it("RED: rejects local draftId aliasing a created transfer/domainRecordRef", () => {
    const source = queuedAtmPayload();
    const aliased = {
      ...source,
      localSmsBookkeeping: [
        {
          ...source.localSmsBookkeeping[0],
          draftId: ATM_TRANSFER_RECORD_ID,
        },
      ],
    };
    expect(aliased.domainRecordRefs).toContain(ATM_TRANSFER_RECORD_ID);
    expect(() => validateReviewBatchSavePayload(aliased)).toThrow();
  });

  it("RED: rejects local queueId aliasing a created transfer/domainRecordRef", () => {
    const source = queuedAtmPayload();
    const aliased = {
      ...source,
      sessionId: ATM_TRANSFER_RECORD_ID,
      localSmsBookkeeping: [
        {
          ...source.localSmsBookkeeping[0],
          queueId: ATM_TRANSFER_RECORD_ID,
        },
      ],
    };
    expect(() => validateReviewBatchSavePayload(aliased)).toThrow();
  });

  it("rejects reuse of the same UUID for one local draft and its queue", () => {
    const source = queuedAtmPayload();
    const aliased = {
      ...source,
      localSmsBookkeeping: [
        {
          ...source.localSmsBookkeeping[0],
          draftId: ATM_QUEUE_ID,
        },
      ],
    };
    expect(aliased.localSmsBookkeeping[0]?.draftId).toBe(
      aliased.localSmsBookkeeping[0]?.queueId
    );
    expect(() => validateReviewBatchSavePayload(aliased)).toThrow();
  });
});

describe("#395 T046 E — selected group must justify every newly created account", () => {
  it("RED: rejects account create when no confirmed group references it", () => {
    const baseline = voiceNewBankPayload();
    expect(baseline.source).toBe("VOICE");
    expect(baseline.localSmsBookkeeping).toEqual([]);
    expect(validateReviewBatchSavePayload(baseline)).toEqual(baseline);
    const payload = { ...baseline, confirmedGroupRefs: [] };
    expect(
      payload.domainMutation.records.some(
        (record) =>
          record.entity === "account" && record.after.id === NEW_BANK_ACCOUNT_ID
      )
    ).toBe(true);
    expect(() => validateReviewBatchSavePayload(payload)).toThrow();
  });

  it("accepts independently valid Voice new Bank with an owned confirmed group", () => {
    const payload = voiceNewBankPayload();
    expect(payload.source).toBe("VOICE");
    expect(payload.localSmsBookkeeping).toEqual([]);
    expect(
      payload.selectedSourceRefs.every((ref) => ref.sourceFingerprint === null)
    ).toBe(true);
    expect(payload.confirmedGroupRefs[0]?.accountId).toBe(NEW_BANK_ACCOUNT_ID);
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
    expect(
      canonicalizeFinancialActionEnvelope(
        { ...smsNewBankEnvelope, payload },
        registry
      ).payload
    ).toEqual(payload);
  });

  it("accepts existing-account SMS with no new account and no group", () => {
    const payload = existingAccountSmsPayload();
    expect(payload.confirmedGroupRefs).toEqual([]);
    expect(payload.sessionId).toBe(SMS_QUEUE_ID);
    expect(payload.localSmsBookkeeping[0]?.queueId).toBe(payload.sessionId);
    expect(
      payload.domainMutation.records.some(
        (record) => record.entity === "account"
      )
    ).toBe(false);
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
    expect(
      canonicalizeFinancialActionEnvelope(
        {
          ...smsNewBankEnvelope,
          accountGuards: [
            {
              accountId: REVIEW_ACCOUNT_ID,
              expectedRevision: parseCanonicalUnsignedIntegerString("7"),
            },
          ],
          payload,
        },
        registry
      ).payload
    ).toEqual(payload);
  });

  it("accepts a confirmed group explicitly reusing an existing account", () => {
    const base = existingAccountSmsPayload();
    const payload = {
      ...base,
      confirmedGroupRefs: [
        {
          ...smsNewBankPayload.confirmedGroupRefs[0],
          accountId: REVIEW_ACCOUNT_ID,
        },
      ],
    };
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
  });
});

describe("#395 T046 F — explicit latest-allowed calendar-date input", () => {
  it("accepts exact-cutoff finance and unchanged no-cutoff fallback", () => {
    const cutoff = { latestAllowedCalendarDate: REVIEW_TRANSACTION_DATE };
    expect(
      canonicalizeFinancialActionEnvelope(
        reviewBatchSaveEnvelope,
        registry,
        cutoff
      ).payload
    ).toEqual(reviewBatchSavePayload);
    expect(
      canonicalizeFinancialActionEnvelope(reviewBatchSaveEnvelope, registry)
        .payload
    ).toEqual(reviewBatchSavePayload);
  });

  it("RED: rejects transaction rows later than supplied cutoff through real envelope", () => {
    expect(() =>
      canonicalizeFinancialActionEnvelope(reviewBatchSaveEnvelope, registry, {
        latestAllowedCalendarDate: "2026-10-13",
      })
    ).toThrow();
  });

  it("RED: rejects transfer later than cutoff, without consulting ambient time", () => {
    expect(() =>
      canonicalizeFinancialActionEnvelope(
        { ...atmTransferEnvelope, payload: queuedAtmPayload() },
        registry,
        { latestAllowedCalendarDate: "2026-10-13" }
      )
    ).toThrow();
  });

  it("passes the configured date bound to the actual registered validator", () => {
    const definition = registry.resolve(
      "transactions",
      "review_batch_save",
      "review.batch-save/v1"
    );
    expect(
      definition.validatePayload(reviewBatchSavePayload, {
        latestAllowedCalendarDate: REVIEW_TRANSACTION_DATE,
      })
    ).toEqual(reviewBatchSavePayload);
    expect(() =>
      definition.validatePayload(reviewBatchSavePayload, {
        latestAllowedCalendarDate: "2026-10-13",
      })
    ).toThrow(INVALID_CODE);
  });
});

describe("#395 T046 G — source-specific created Cash eligibility", () => {
  it("accepts selected Voice Cash with a complete first-active default snapshot", () => {
    const payload = validVoiceCashPayload();
    const cashId = payload.confirmedGroupRefs[0]?.accountId;
    if (!cashId) throw new Error("Missing confirmed Voice Cash group");
    expect(payload.cashDefaultSnapshot).toEqual({
      activeAccountIds: [],
      defaultAccount: null,
    });
    expect(payload.accountEffects[0]?.amountMinorUnits).toBe("0");
    expect(
      payload.domainMutation.records.some(
        (record) => record.entity === "bank_details"
      )
    ).toBe(false);
    expect(
      payload.createGuards.some((guard) => guard.entity === "bank_details")
    ).toBe(false);
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
    const envelope = {
      ...reviewBatchSaveEnvelope,
      accountGuards: [
        {
          accountId: cashId,
          expectedRevision: parseCanonicalUnsignedIntegerString("0"),
        },
      ],
      payload,
    };
    expect(
      canonicalizeFinancialActionEnvelope(envelope, registry).payload
    ).toEqual(payload);
  });

  it("accepts newly created Cash only as selected ATM transfer destination", () => {
    const payload = validAtmCashDestinationPayload();
    const newCash = payload.domainMutation.records.find(
      (record) => record.entity === "account"
    );
    if (!newCash) throw new Error("Missing selected ATM Cash destination");
    expect(payload.cashDefaultSnapshot).toEqual({
      activeAccountIds: [ATM_BANK_ACCOUNT_ID],
      defaultAccount: null,
    });
    expect(payload.sessionId).toBe(ATM_QUEUE_ID);
    expect(payload.localSmsBookkeeping[0]?.queueId).toBe(payload.sessionId);
    expect(
      payload.domainMutation.records.some(
        (record) => record.entity === "bank_details"
      )
    ).toBe(false);
    expect(
      payload.createGuards.some((guard) => guard.entity === "bank_details")
    ).toBe(false);
    expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
    const envelope = {
      ...atmTransferEnvelope,
      accountGuards: [
        atmTransferEnvelope.accountGuards[0],
        {
          accountId: newCash.after.id,
          expectedRevision: parseCanonicalUnsignedIntegerString("0"),
        },
      ],
      payload,
    };
    expect(
      canonicalizeFinancialActionEnvelope(envelope, registry).payload
    ).toEqual(payload);
  });

  it("RED: disallows SMS ordinary transaction using newly created ATM-destination Cash", () => {
    const payload = cashUsedForOrdinarySmsPayload();
    expect(validateCreateCoverage(payload)).toBeNull();
    expect(validateSelectedCoverage(payload)).toBeNull();
    expect(validatePostedEffects(payload)).toBeNull();
    expect(validateTransferEndpoints(payload)).toBeNull();
    expect(validateAffectedAccountCoverage(payload)).toBeNull();
    expect(validateCreatedAccountBalances(payload)).toBeNull();
    // The same Cash IS a legitimate ATM destination in another selected row.
    // Source eligibility must inspect EVERY financial use, not just some().
    expect(validateSourceAndChildren(payload)).not.toBeNull();
  });

  it("RED: disallows Cash as ATM source despite another selected ATM destination", () => {
    const payload = cashUsedAsAtmSourcePayload();
    expect(validateCreateCoverage(payload)).toBeNull();
    expect(validateSelectedCoverage(payload)).toBeNull();
    expect(validatePostedEffects(payload)).toBeNull();
    expect(validateTransferEndpoints(payload)).toBeNull();
    expect(validateAffectedAccountCoverage(payload)).toBeNull();
    expect(validateCreatedAccountBalances(payload)).toBeNull();
    expect(validateSourceAndChildren(payload)).not.toBeNull();
  });
});
