import type { RegisteredActionPayload } from "../action-registry";
import { validateReviewBatchSavePayload } from "../review-batch-save";
import {
  REVIEW_CATEGORY_ID,
  REVIEW_CREATED_AT,
  REVIEW_EFFECT_ID,
  REVIEW_INCOME_RECORD_ID,
  REVIEW_INCOME_ROW_ID,
  REVIEW_SESSION_ID,
  REVIEW_TRANSACTION_DATE,
  reviewBatchSavePayload,
  smsNewBankPayload,
} from "./review-batch-save-fixtures";

const NEW_CASH_ACCOUNT_ID = "55555555-5555-4555-8555-555555555550";
const CASH_GROUP_ID = "54000000-0000-4000-8000-000000000002";

const validCashPayload = {
  schemaVersion: "review.batch-save/v1",
  operationCode: "review.batch-save",
  source: "VOICE",
  sessionId: REVIEW_SESSION_ID,
  selectedSourceRefs: [
    {
      rowId: REVIEW_INCOME_ROW_ID,
      recordId: REVIEW_INCOME_RECORD_ID,
      sourceFingerprint: null,
    },
  ],
  confirmedGroupRefs: [
    {
      groupId: CASH_GROUP_ID,
      revision: "1",
      accountId: NEW_CASH_ACCOUNT_ID,
    },
  ],
  createGuards: [
    { entity: "account", id: NEW_CASH_ACCOUNT_ID, expectedAbsent: true },
    {
      entity: "transaction",
      id: REVIEW_INCOME_RECORD_ID,
      expectedAbsent: true,
    },
  ],
  accountEffects: [
    {
      accountId: NEW_CASH_ACCOUNT_ID,
      amountMinorUnits: "2001",
      currency: "EGP",
      effectId: REVIEW_EFFECT_ID,
    },
  ],
  domainRecordRefs: [NEW_CASH_ACCOUNT_ID, REVIEW_INCOME_RECORD_ID],
  domainMutation: {
    records: [
      {
        entity: "account",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: NEW_CASH_ACCOUNT_ID,
          name: "Cash",
          type: "CASH",
          currency: "EGP",
          institutionId: null,
          providerDisplayName: null,
          isDefault: true,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
          openingBalanceMinorUnits: "0",
          targetBalanceMinorUnits: null,
        },
      },
      {
        entity: "transaction",
        mode: "create",
        expectedUpdatedAt: null,
        after: {
          id: REVIEW_INCOME_RECORD_ID,
          accountId: NEW_CASH_ACCOUNT_ID,
          amountMinorUnits: "2001",
          currency: "EGP",
          type: "INCOME",
          categoryId: REVIEW_CATEGORY_ID,
          counterparty: null,
          note: null,
          date: REVIEW_TRANSACTION_DATE,
          source: "VOICE",
          smsFingerprint: null,
          isDraft: false,
          linkedAssetId: null,
          linkedDebtId: null,
          linkedRecurringId: null,
          createdAt: REVIEW_CREATED_AT,
          deleted: false,
        },
      },
    ],
  },
  localSmsBookkeeping: [],
  cashDefaultSnapshot: {
    activeAccountIds: [],
    defaultAccount: null,
  },
} as const satisfies RegisteredActionPayload;

describe("review.batch-save/v1 invariant validation", () => {
  describe("positive baseline controls", () => {
    it("accepts the baseline voice review payload unchanged", () => {
      expect(validateReviewBatchSavePayload(reviewBatchSavePayload)).toEqual(
        reviewBatchSavePayload
      );
    });

    it("accepts the baseline SMS new-bank payload unchanged", () => {
      expect(validateReviewBatchSavePayload(smsNewBankPayload)).toEqual(
        smsNewBankPayload
      );
    });

    it("accepts the valid first-active cash payload unchanged", () => {
      expect(validateReviewBatchSavePayload(validCashPayload)).toEqual(
        validCashPayload
      );
    });
  });

  describe("nested closed privacy fields", () => {
    it("rejects payload when selectedSourceRefs contains unapproved privacy or evidence fields", () => {
      const leakedRefPayload = {
        ...smsNewBankPayload,
        selectedSourceRefs: [
          {
            ...smsNewBankPayload.selectedSourceRefs[0],
            rawSmsBody: "Payment of EGP 2001 received",
          },
          smsNewBankPayload.selectedSourceRefs[1],
        ],
      };
      expect(() => validateReviewBatchSavePayload(leakedRefPayload)).toThrow();
    });

    it("rejects payload when transaction mutation record leaks raw audio transcript", () => {
      const leakedRecordPayload = {
        ...reviewBatchSavePayload,
        domainMutation: {
          records: [
            {
              ...reviewBatchSavePayload.domainMutation.records[0],
              after: {
                ...reviewBatchSavePayload.domainMutation.records[0].after,
                rawTranscript: "spent twenty pounds on groceries",
              },
            },
            reviewBatchSavePayload.domainMutation.records[1],
          ],
        },
      };
      expect(() =>
        validateReviewBatchSavePayload(leakedRecordPayload)
      ).toThrow();
    });

    it("rejects payload when localSmsBookkeeping contains unapproved draft payload preimage", () => {
      const leakedBookkeepingPayload = {
        ...smsNewBankPayload,
        localSmsBookkeeping: [
          {
            ...smsNewBankPayload.localSmsBookkeeping[0],
            rawPayloadJson: '{"sender":"BANK"}',
          },
          smsNewBankPayload.localSmsBookkeeping[1],
        ],
      };
      expect(() =>
        validateReviewBatchSavePayload(leakedBookkeepingPayload)
      ).toThrow();
    });
  });

  describe("canonical signed integer and unsigned revision strings", () => {
    it("rejects non-canonical revision string with leading zeros in confirmedGroupRefs", () => {
      const nonCanonicalRevisionPayload = {
        ...smsNewBankPayload,
        confirmedGroupRefs: [
          {
            ...smsNewBankPayload.confirmedGroupRefs[0],
            revision: "03",
          },
        ],
      };
      expect(() =>
        validateReviewBatchSavePayload(nonCanonicalRevisionPayload)
      ).toThrow();
    });

    it("rejects non-canonical minor units string with explicit plus sign in accountEffects", () => {
      const explicitPlusEffectPayload = {
        ...smsNewBankPayload,
        accountEffects: [
          {
            ...smsNewBankPayload.accountEffects[0],
            amountMinorUnits: "+1500",
          },
        ],
      };
      expect(() =>
        validateReviewBatchSavePayload(explicitPlusEffectPayload)
      ).toThrow();
    });

    it("rejects non-canonical negative zero minor units string in zero-net accountEffects", () => {
      const negativeZeroEffectPayload = {
        ...reviewBatchSavePayload,
        accountEffects: [
          {
            ...reviewBatchSavePayload.accountEffects[0],
            amountMinorUnits: "-0",
          },
        ],
      };
      expect(() =>
        validateReviewBatchSavePayload(negativeZeroEffectPayload)
      ).toThrow();
    });
  });

  describe("guards and selected-only records correspondence", () => {
    it("rejects dangling createGuard that has no matching create record in domainMutation", () => {
      const DANGLING_GUARD_ID = "8c000000-0000-4000-8000-000000000003";
      const danglingGuardPayload = {
        ...reviewBatchSavePayload,
        createGuards: [
          ...reviewBatchSavePayload.createGuards,
          {
            entity: "transaction",
            id: DANGLING_GUARD_ID,
            expectedAbsent: true,
          },
        ],
      };
      expect(() =>
        validateReviewBatchSavePayload(danglingGuardPayload)
      ).toThrow();
    });

    it("rejects selectedSourceRef pointing to a non-existent financial recordId", () => {
      const DANGLING_RECORD_ID = "8c000000-0000-4000-8000-000000000099";
      const danglingSelectedRefPayload = {
        ...reviewBatchSavePayload,
        selectedSourceRefs: [
          {
            ...reviewBatchSavePayload.selectedSourceRefs[0],
            recordId: DANGLING_RECORD_ID,
          },
          reviewBatchSavePayload.selectedSourceRefs[1],
        ],
      };
      expect(() =>
        validateReviewBatchSavePayload(danglingSelectedRefPayload)
      ).toThrow();
    });

    it("rejects created financial record that is missing from selectedSourceRefs", () => {
      const missingSelectedRefPayload = {
        ...reviewBatchSavePayload,
        selectedSourceRefs: [reviewBatchSavePayload.selectedSourceRefs[0]],
      };
      expect(() =>
        validateReviewBatchSavePayload(missingSelectedRefPayload)
      ).toThrow();
    });
  });

  describe("Cash snapshot exact presence", () => {
    it("rejects unexpected cashDefaultSnapshot when no Cash account is created", () => {
      const unexpectedCashSnapshotPayload = {
        ...smsNewBankPayload,
        cashDefaultSnapshot: {
          activeAccountIds: [],
          defaultAccount: null,
        },
      };
      expect(() =>
        validateReviewBatchSavePayload(unexpectedCashSnapshotPayload)
      ).toThrow();
    });

    it("rejects Cash account creation when cashDefaultSnapshot is omitted", () => {
      const {
        cashDefaultSnapshot: _omittedSnapshot,
        ...missingCashSnapshotPayload
      } = validCashPayload;
      expect(() =>
        validateReviewBatchSavePayload(missingCashSnapshotPayload)
      ).toThrow();
    });
  });
});
