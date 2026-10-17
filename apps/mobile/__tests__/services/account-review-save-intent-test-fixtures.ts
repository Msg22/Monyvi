/**
 * T048 historical digest regression fixture not present in the existing T043
 * catalog: two originally selected groups, one WHOLE group deduped away.
 * Reuse real canonical SMS row/group builders and original plan freezer.
 */
import {
  accountReviewGroupSchema,
  accountReviewRowSchema,
  accountReviewSessionSchema,
} from "@monyvi/logic";
import {
  FINGERPRINT_C,
  GROUP_WALLET,
  freezeSaveIntent,
  makeSaveFixture,
  testUuid,
  type SaveFixture,
} from "./account-review-save-test-fixtures";

export function smsWithDedupOnlyWalletGroup(): SaveFixture {
  const bank = makeSaveFixture("sms-new-bank");
  const wallet = makeSaveFixture("sms-new-wallet");
  const row = wallet.session.rows[0];
  const group = wallet.session.groups.find(
    (item) => item.groupId === GROUP_WALLET
  );
  if (!row || row.source !== "SMS" || !group || group.status !== "confirmed") {
    throw new Error("Expected canonical confirmed SMS Wallet source");
  }
  const sourceRef = "fixture:4";
  const added = accountReviewRowSchema.parse({
    ...row,
    rowId: testUuid(104),
    sourceRef,
    sourceFingerprint: FINGERPRINT_C,
    accountEvidence: {
      ...row.accountEvidence,
      evidenceSpans: row.accountEvidence.evidenceSpans.map((span) => ({
        ...span,
        sourceRef,
      })),
    },
    transaction: {
      ...row.transaction,
      smsFingerprint: FINGERPRINT_C,
    },
  });
  const addedGroup = accountReviewGroupSchema.parse({
    ...group,
    linkedRowIds: [added.rowId],
  });
  const session = accountReviewSessionSchema.parse({
    ...bank.session,
    saveIntent: null,
    rows: [...bank.session.rows, added],
    groups: [...bank.session.groups, addedGroup],
  });
  const intent = freezeSaveIntent(session);
  return {
    session: accountReviewSessionSchema.parse({
      ...session,
      saveIntent: intent,
    }),
    intent,
  };
}
