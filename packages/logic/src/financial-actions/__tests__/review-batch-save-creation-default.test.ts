/**
 * #395 T046 tests-first contract regression, NOT an executed Green claim.
 * These deliberately use the real closed payload/envelope and explicit opt-in
 * registry, never a mock validation function or local SQL/state simulation.
 * Root observed Red before the separately authorized production correction.
 */
import {
  canonicalizeFinancialActionEnvelope,
  serializeFinancialActionEnvelope,
} from "../action-contracts";
import {
  createFinancialActionRegistry,
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
} from "../action-registry";
import {
  createReviewFinancialActionDefinitions,
  reviewBatchSavePayloadSchema,
  validateReviewBatchSavePayload,
} from "../review-batch-save";
import type { ReviewNewAccount } from "../review-batch-save-shapes";
import {
  atmTransferEnvelope,
  legacyEditBalanceEnvelope,
  reviewBatchSaveEnvelope,
  reviewBatchSavePayload,
} from "./review-batch-save-fixtures";
import { ungroupedAtmCashDestinationPayload } from "./review-batch-save-regression-fixtures";
import {
  BANK,
  CASH,
  CASH_EGP,
  CASH_USD,
  EXISTING_ACCOUNT_ID,
  SECOND_EXISTING_ID,
  WALLET,
  createdAccounts,
  creationEnvelope,
  makeVoiceCreationPayload,
  withDefaultFlags,
  type CreatedAccountPlan,
  type CreatedReviewPayload,
} from "./review-batch-save-creation-default-fixtures";

const registry = createFinancialActionRegistry([
  ...DEFAULT_FINANCIAL_ACTION_REGISTRY.definitions,
  ...createReviewFinancialActionDefinitions(
    "review_batch_save_invalid_payload"
  ),
]);

function expectValid(payload: CreatedReviewPayload): void {
  expect(validateReviewBatchSavePayload(payload)).toEqual(payload);
  const envelope = creationEnvelope(payload);
  expect(
    canonicalizeFinancialActionEnvelope(envelope, registry).payload
  ).toEqual(payload);
  expect(serializeFinancialActionEnvelope(envelope, registry)).toContain(
    '"creationDefaultSnapshot"'
  );
}

interface AccountFlagSnapshot {
  readonly accountId: string;
  readonly isDefault: boolean;
  readonly type: ReviewNewAccount["after"]["type"];
  readonly currency: string;
  readonly opening: string;
  readonly target: null;
}

function accountFlags(
  payload: CreatedReviewPayload
): readonly AccountFlagSnapshot[] {
  return createdAccounts(payload).map(({ after }) => ({
    accountId: after.id,
    isDefault: after.isDefault,
    type: after.type,
    currency: after.currency,
    opening: after.openingBalanceMinorUnits,
    target: after.targetBalanceMinorUnits,
  }));
}

const BOTH_CASH: readonly CreatedAccountPlan[] = [CASH_EGP, CASH_USD];
const THREE_TYPES: readonly CreatedAccountPlan[] = [BANK, CASH, WALLET];
const MIXED_CASES: ReadonlyArray<{
  readonly title: string;
  readonly accounts: readonly CreatedAccountPlan[];
  readonly expectedDefault: string;
}> = [
  {
    title: "BANK wins despite its last-sorted group",
    accounts: THREE_TYPES,
    expectedDefault: BANK.accountId,
  },
  {
    title: "WALLET wins when its actual create UUID is smallest",
    accounts: [
      BANK,
      CASH,
      { ...WALLET, accountId: "01000000-0000-4000-8000-000000000005" },
    ],
    expectedDefault: "01000000-0000-4000-8000-000000000005",
  },
  {
    title: "CASH wins when its actual create UUID is smallest",
    accounts: [
      WALLET,
      { ...CASH, accountId: "01000000-0000-4000-8000-000000000004" },
      BANK,
    ],
    expectedDefault: "01000000-0000-4000-8000-000000000004",
  },
];

describe("#395 T046 reconciled review account-creation default contract", () => {
  describe("positive controls: closed payload, exact effects, and canonical envelope", () => {
    it("keeps an existing-only VOICE zero-net review without a creation snapshot", () => {
      expect(validateReviewBatchSavePayload(reviewBatchSavePayload)).toEqual(
        reviewBatchSavePayload
      );
      expect(
        canonicalizeFinancialActionEnvelope(reviewBatchSaveEnvelope, registry)
          .payload
      ).toEqual(reviewBatchSavePayload);
      expect(reviewBatchSavePayload.accountEffects[0].amountMinorUnits).toBe(
        "0"
      );
    });

    it("accepts two independently confirmed Voice Cash EGP/USD groups together", () => {
      const payload = makeVoiceCreationPayload(BOTH_CASH);
      expect(payload.selectedSourceRefs).toHaveLength(2);
      expect(payload.confirmedGroupRefs).toHaveLength(2);
      expect(payload.creationDefaultSnapshot).toEqual({
        activeAccountIds: [],
        defaultAccount: null,
      });
      expect(
        payload.accountEffects.map(({ currency, amountMinorUnits }) => [
          currency,
          amountMinorUnits,
        ])
      ).toEqual([
        ["USD", "-3500"],
        ["EGP", "2001"],
      ]);
      expect(accountFlags(payload)).toEqual([
        {
          accountId: CASH_USD.accountId,
          isDefault: true,
          type: "CASH",
          currency: "USD",
          opening: "0",
          target: null,
        },
        {
          accountId: CASH_EGP.accountId,
          isDefault: false,
          type: "CASH",
          currency: "EGP",
          opening: "0",
          target: null,
        },
      ]);
      expect(
        creationEnvelope(payload).accountGuards.map((g) => g.expectedRevision)
      ).toEqual(["0", "0"]);
      expect(payload.createGuards).toHaveLength(4);
      expectValid(payload);
    });

    it("does not use incoming/group ordering or currency as the first-default sort", () => {
      const forward = makeVoiceCreationPayload(BOTH_CASH);
      const reversed = makeVoiceCreationPayload([...BOTH_CASH].reverse());
      expect(reversed).toEqual(forward);
      const swappedCurrency = makeVoiceCreationPayload([
        { ...CASH_EGP, currency: "USD", nickname: "Other USD Cash" },
        { ...CASH_USD, currency: "EGP", nickname: "Other EGP Cash" },
      ]);
      expect(
        createdAccounts(swappedCurrency)
          .filter((r) => r.after.isDefault)
          .map((r) => r.after.id)
      ).toEqual([CASH_USD.accountId]);
      expectValid(forward);
      expectValid(swappedCurrency);
    });

    it.each(MIXED_CASES)(
      "chooses first active across CASH/BANK/WALLET: $title",
      ({ accounts, expectedDefault }) => {
        const payload = makeVoiceCreationPayload(accounts);
        expect(createdAccounts(payload)).toHaveLength(3);
        expect(
          createdAccounts(payload)
            .filter((r) => r.after.isDefault)
            .map((r) => r.after.id)
        ).toEqual([expectedDefault]);
        expect(
          createdAccounts(payload).every(
            (r) =>
              r.after.openingBalanceMinorUnits === "0" &&
              r.after.targetBalanceMinorUnits === null
          )
        ).toBe(true);
        expect(payload.createGuards).toHaveLength(7);
        // T043: BANK has one owned bank_details child; WALLET/CASH have none.
        const bankDetails = payload.domainMutation.records.filter(
          (record) => record.entity === "bank_details"
        );
        expect(bankDetails).toHaveLength(1);
        const bankChild = bankDetails[0];
        if (bankChild?.entity !== "bank_details")
          throw new Error("Missing expected synthetic BANK child");
        expect(bankChild.after.accountId).toBe(
          accounts.find((account) => account.accountType === "BANK")?.accountId
        );
        expect(payload.domainMutation.records).toHaveLength(7);
        expect(payload.accountEffects).toHaveLength(3);
        expectValid(payload);
      }
    );

    it.each([BANK, CASH, WALLET])(
      "marks the sole first-active $accountType account default at Save",
      (account) => {
        const payload = makeVoiceCreationPayload([account]);
        expect(createdAccounts(payload)[0]?.after.isDefault).toBe(true);
        expectValid(payload);
      }
    );

    it("rejects missing mandatory BANK child with otherwise complete creates and effects", () => {
      const valid = makeVoiceCreationPayload([BANK]);
      expectValid(valid);
      const bankDetails = valid.domainMutation.records.find(
        (record) => record.entity === "bank_details"
      );
      if (bankDetails?.entity !== "bank_details")
        throw new Error("Missing synthetic bank details");
      const childId = bankDetails.after.id;
      const noChild = {
        ...valid,
        createGuards: valid.createGuards.filter(
          (guard) => guard.id !== childId
        ),
        domainRecordRefs: valid.domainRecordRefs.filter((id) => id !== childId),
        domainMutation: {
          records: valid.domainMutation.records.filter(
            (record) => record.entity !== "bank_details"
          ),
        },
      };
      const result = reviewBatchSavePayloadSchema.safeParse(noChild);
      expect(result.success).toBe(false);
      if (result.success)
        throw new Error("Expected missing-bank-child rejection");
      expect(
        result.error.issues.some(
          (issue) => issue.message === "review_bank_details_missing"
        )
      ).toBe(true);
    });

    it("preserves existing default and makes all new account types nondefault", () => {
      const payload = makeVoiceCreationPayload(
        THREE_TYPES,
        [EXISTING_ACCOUNT_ID, SECOND_EXISTING_ID],
        EXISTING_ACCOUNT_ID
      );
      expect(payload.creationDefaultSnapshot.defaultAccount).toEqual({
        accountId: EXISTING_ACCOUNT_ID,
        isDefault: true,
      });
      expect(createdAccounts(payload).every((r) => !r.after.isDefault)).toBe(
        true
      );
      expectValid(payload);
    });

    it("preserves deliberately no active default with nonempty captured owner set", () => {
      const payload = makeVoiceCreationPayload(
        BOTH_CASH,
        [EXISTING_ACCOUNT_ID],
        null
      );
      expect(payload.creationDefaultSnapshot).toEqual({
        activeAccountIds: [EXISTING_ACCOUNT_ID],
        defaultAccount: null,
      });
      expect(createdAccounts(payload).every((r) => !r.after.isDefault)).toBe(
        true
      );
      expectValid(payload);
    });

    it("keeps the current ATM transfer with an eligible existing CASH destination", () => {
      expect(
        validateReviewBatchSavePayload(atmTransferEnvelope.payload)
      ).toEqual(atmTransferEnvelope.payload);
      expect(
        canonicalizeFinancialActionEnvelope(atmTransferEnvelope, registry)
          .payload
      ).toEqual(atmTransferEnvelope.payload);
      expect(atmTransferEnvelope.payload.confirmedGroupRefs).toEqual([]);
      expect(atmTransferEnvelope.payload.domainMutation.records).toHaveLength(
        1
      );
      expect(
        atmTransferEnvelope.payload.domainMutation.records[0]?.entity
      ).toBe("transfer");
      const validated = validateReviewBatchSavePayload(
        atmTransferEnvelope.payload
      );
      expect(
        validated.domainMutation.records.some(
          (record) => record.entity === "account"
        )
      ).toBe(false);
    });
  });

  describe("negative controls: snapshot required iff any creation", () => {
    it.each([BANK, CASH, WALLET])(
      "rejects a new $accountType without creationDefaultSnapshot",
      (account) => {
        const valid = makeVoiceCreationPayload([account]);
        const { creationDefaultSnapshot, ...missing } = valid;
        expect(creationDefaultSnapshot.activeAccountIds).toEqual([]);
        expect(() => validateReviewBatchSavePayload(missing)).toThrow();
      }
    );

    it("rejects the old unshipped cashDefaultSnapshot spelling for a Cash create", () => {
      const valid = makeVoiceCreationPayload([CASH_USD]);
      const { creationDefaultSnapshot, ...withoutNewKey } = valid;
      expect(() =>
        validateReviewBatchSavePayload({
          ...withoutNewKey,
          cashDefaultSnapshot: creationDefaultSnapshot,
        })
      ).toThrow();
    });

    it("rejects old cashDefaultSnapshot even if the new field is also supplied", () => {
      const valid = makeVoiceCreationPayload([CASH_USD]);
      expect(() =>
        validateReviewBatchSavePayload({
          ...valid,
          cashDefaultSnapshot: valid.creationDefaultSnapshot,
        })
      ).toThrow();
    });

    it("rejects creationDefaultSnapshot without any created account", () => {
      expect(() =>
        validateReviewBatchSavePayload({
          ...reviewBatchSavePayload,
          creationDefaultSnapshot: {
            activeAccountIds: [],
            defaultAccount: null,
          },
        })
      ).toThrow();
    });

    it("rejects snapshot not sorted or containing duplicate owned active UUIDs", () => {
      const valid = makeVoiceCreationPayload([BANK], [EXISTING_ACCOUNT_ID]);
      for (const ids of [
        [SECOND_EXISTING_ID, EXISTING_ACCOUNT_ID],
        [EXISTING_ACCOUNT_ID, EXISTING_ACCOUNT_ID],
      ]) {
        const malformed = {
          ...valid,
          creationDefaultSnapshot: {
            activeAccountIds: ids,
            defaultAccount: null,
          },
        };
        expect(() => validateReviewBatchSavePayload(malformed)).toThrow();
      }
    });

    it("rejects a snapshot default UUID outside its declared active set", () => {
      const valid = makeVoiceCreationPayload([WALLET], [EXISTING_ACCOUNT_ID]);
      expect(() =>
        validateReviewBatchSavePayload({
          ...valid,
          creationDefaultSnapshot: {
            activeAccountIds: [EXISTING_ACCOUNT_ID],
            defaultAccount: { accountId: SECOND_EXISTING_ID, isDefault: true },
          },
        })
      ).toThrow();
    });

    it("rejects a created account UUID already in the captured active set", () => {
      const valid = makeVoiceCreationPayload([CASH_USD], [EXISTING_ACCOUNT_ID]);
      expect(() =>
        validateReviewBatchSavePayload({
          ...valid,
          creationDefaultSnapshot: {
            activeAccountIds: [CASH_USD.accountId, EXISTING_ACCOUNT_ID].sort(
              (a, b) => (a < b ? -1 : a > b ? 1 : 0)
            ),
            defaultAccount: null,
          },
        })
      ).toThrow();
    });

    it("rejects malformed or extra snapshot fields without coercion", () => {
      const valid = makeVoiceCreationPayload([BANK]);
      expect(() =>
        validateReviewBatchSavePayload({
          ...valid,
          creationDefaultSnapshot: {
            activeAccountIds: [],
            defaultAccount: null,
            expectedUpdatedAt: "2026-10-14T00:00:00.000Z",
          },
        })
      ).toThrow();
      expect(() =>
        validateReviewBatchSavePayload({
          ...valid,
          creationDefaultSnapshot: {
            activeAccountIds: [],
            defaultAccount: {
              accountId: EXISTING_ACCOUNT_ID,
              isDefault: false,
            },
          },
        })
      ).toThrow();
    });
  });

  describe("negative controls: exact first-active flags across all account types", () => {
    it("rejects two new Cash defaults in the empty-account case", () => {
      const baseline = makeVoiceCreationPayload(BOTH_CASH);
      const duplicate = withDefaultFlags(baseline, {
        [CASH_USD.accountId]: true,
        [CASH_EGP.accountId]: true,
      });
      expect(
        createdAccounts(duplicate).filter((a) => a.after.isDefault)
      ).toHaveLength(2);
      expect(() => validateReviewBatchSavePayload(duplicate)).toThrow();
    });

    it("rejects no default when the captured active set is empty", () => {
      const baseline = makeVoiceCreationPayload(THREE_TYPES);
      const missing = withDefaultFlags(baseline, {
        [BANK.accountId]: false,
        [CASH.accountId]: false,
        [WALLET.accountId]: false,
      });
      expect(createdAccounts(missing).every((a) => !a.after.isDefault)).toBe(
        true
      );
      expect(() => validateReviewBatchSavePayload(missing)).toThrow();
    });

    it("rejects group-first or currency-first choice instead of minimum actual ID", () => {
      const baseline = makeVoiceCreationPayload(BOTH_CASH);
      const wrong = withDefaultFlags(baseline, {
        [CASH_EGP.accountId]: true,
        [CASH_USD.accountId]: false,
      });
      expect(
        createdAccounts(wrong)
          .filter((a) => a.after.isDefault)
          .map((a) => a.after.id)
      ).toEqual([CASH_EGP.accountId]);
      expect(() => validateReviewBatchSavePayload(wrong)).toThrow();
    });

    it.each([
      { name: "existing default", defaultId: EXISTING_ACCOUNT_ID },
      { name: "intentional no-default", defaultId: null },
    ])(
      "rejects a new default with nonempty owned set: $name",
      ({ defaultId }) => {
        const baseline = makeVoiceCreationPayload(
          THREE_TYPES,
          [EXISTING_ACCOUNT_ID],
          defaultId
        );
        const wrong = withDefaultFlags(baseline, { [BANK.accountId]: true });
        expect(() => validateReviewBatchSavePayload(wrong)).toThrow();
      }
    );

    it("rejects a wrong default on the sole first newly created Bank/Wallet", () => {
      for (const account of [BANK, WALLET]) {
        const baseline = makeVoiceCreationPayload([account]);
        const wrong = withDefaultFlags(baseline, {
          [account.accountId]: false,
        });
        expect(() => validateReviewBatchSavePayload(wrong)).toThrow();
      }
    });
  });

  describe("boundary compatibility and current ATM destination proof", () => {
    it("rejects the previously accepted invented ungrouped ATM CASH create", () => {
      const ungrouped = ungroupedAtmCashDestinationPayload();
      expect(
        validateReviewBatchSavePayload(atmTransferEnvelope.payload)
      ).toEqual(atmTransferEnvelope.payload);
      expect(ungrouped.confirmedGroupRefs).toHaveLength(0);
      expect(
        ungrouped.domainMutation.records.some(
          (r) => r.entity === "account" && r.after.type === "CASH"
        )
      ).toBe(true);
      // No fake toAssignment group or row-index alias is introduced to save it.
      expect(() => validateReviewBatchSavePayload(ungrouped)).toThrow();
    });

    it("rejects an incorrect exact signed minor-unit effect on otherwise valid Cash", () => {
      const valid = makeVoiceCreationPayload(BOTH_CASH);
      const invalid = {
        ...valid,
        accountEffects: valid.accountEffects.map((effect) =>
          effect.accountId === CASH_USD.accountId
            ? { ...effect, amountMinorUnits: "-3499" }
            : effect
        ),
      };
      expect(() => validateReviewBatchSavePayload(invalid)).toThrow();
    });

    it("retains the existing v1 tuple and its nonzero-only effect restriction", () => {
      expect(
        canonicalizeFinancialActionEnvelope(legacyEditBalanceEnvelope, registry)
      ).toEqual(legacyEditBalanceEnvelope);
      const invalidLegacy = {
        ...legacyEditBalanceEnvelope,
        payload: {
          ...legacyEditBalanceEnvelope.payload,
          accountEffects: legacyEditBalanceEnvelope.payload.accountEffects.map(
            (effect) => ({ ...effect, amountMinorUnits: "0" })
          ),
        },
      };
      expect(() =>
        canonicalizeFinancialActionEnvelope(invalidLegacy, registry)
      ).toThrow();
    });
  });
});
