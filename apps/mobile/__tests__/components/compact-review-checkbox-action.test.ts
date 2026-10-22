/** #395 compact checkbox routing regression: source and Cash destination are independent. */
import {
  accountReviewRowSchema,
  type AccountReviewGroup,
  type AccountReviewRow,
} from "@monyvi/logic";
import { compactReviewCheckboxAction } from "@/components/transaction-review/compact-review-checkbox-action";
import { makeDefaultInfoSession } from "./account-review-default-info-test-fixtures";
import {
  makeT025ConfirmedSession,
  makeT025ReviewSession,
  makeT025SmsAtmCodecInput,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";

const unresolvedCashDestination: NonNullable<AccountReviewRow["toAssignment"]> =
  {
    state: "unresolved",
    accountId: null,
    reasonCode: "account_needed",
    candidateAccountIds: [],
  };

function byId(
  groups: readonly AccountReviewGroup[]
): ReadonlyMap<string, AccountReviewGroup> {
  const result = new Map<string, AccountReviewGroup>();
  for (const group of groups) result.set(group.groupId, group);
  return result;
}

function requireGroup(
  groups: readonly AccountReviewGroup[],
  type: "BANK" | "CASH"
): AccountReviewGroup {
  const group = groups.find((item) => item.type === type);
  if (!group) throw new Error("Missing synthetic " + type + " ATM group");
  return group;
}

function confirmedSourceAtm(): {
  readonly row: AccountReviewRow;
  readonly bank: AccountReviewGroup;
  readonly cash: AccountReviewGroup;
} {
  const { review } = makeT025SmsAtmCodecInput(true);
  if (review.row.assignment.state !== "suggested") {
    throw new Error("Expected pending suggested Bank source");
  }
  const source = requireGroup(review.groups, "BANK");
  return {
    row: accountReviewRowSchema.parse({
      ...review.row,
      assignment: {
        ...review.row.assignment,
        confirmation: "confirmed",
      },
      reviewReasons: [],
    }),
    bank: {
      ...source,
      status: "confirmed",
      confirmedIdentityRevision: source.revision,
    },
    cash: requireGroup(review.groups, "CASH"),
  };
}

describe("#395 compact review checkbox routing", () => {
  it("routes a valid SMS ATM existing Bank source with unresolved Cash destination to the destination chooser", () => {
    const { review } = makeT025SmsAtmCodecInput(false);
    const row = accountReviewRowSchema.parse({
      ...review.row,
      toAssignment: unresolvedCashDestination,
      reviewReasons: ["cash_transfer_review"],
    });
    expect(row.source).toBe("SMS");
    expect(row.source === "SMS" && row.transaction.isAtmWithdrawal).toBe(true);
    expect(row.assignment.state).toBe("existing");
    expect(compactReviewCheckboxAction(row, byId(review.groups))).toBe(
      "choose_destination_account"
    );
  });

  it("does not let a confirmed suggested Bank source hide an unresolved Cash destination", () => {
    const { row, bank } = confirmedSourceAtm();
    const unresolved = accountReviewRowSchema.parse({
      ...row,
      toAssignment: unresolvedCashDestination,
      reviewReasons: ["cash_transfer_review"],
    });
    expect(compactReviewCheckboxAction(unresolved, byId([bank]))).toBe(
      "choose_destination_account"
    );
  });

  it("does not let a confirmed suggested source hide a pending Cash group", () => {
    const { row, bank, cash } = confirmedSourceAtm();
    if (row.toAssignment?.state !== "suggested") {
      throw new Error("Expected suggested Cash destination");
    }
    const pendingCash: AccountReviewGroup = {
      ...cash,
      status: "pending",
      confirmedIdentityRevision: null,
    };
    const pendingDestination = accountReviewRowSchema.parse({
      ...row,
      toAssignment: {
        ...row.toAssignment,
        confirmation: "pending",
      },
      reviewReasons: ["account_group_unconfirmed"],
    });
    expect(
      compactReviewCheckboxAction(pendingDestination, byId([bank, pendingCash]))
    ).toBe("confirm_group");
    // The router is pure; it never confirms a group or checks a row.
    expect(pendingCash.status).toBe("pending");
    expect(pendingDestination.selected).toBe(false);
  });

  it("keeps both pending Bank source and pending Cash destination behind explicit group confirmation", () => {
    const { review } = makeT025SmsAtmCodecInput(true);
    if (review.row.toAssignment?.state !== "suggested") {
      throw new Error("Expected suggested Cash destination");
    }
    const source = requireGroup(review.groups, "BANK");
    const cash = requireGroup(review.groups, "CASH");
    const pendingCash: AccountReviewGroup = {
      ...cash,
      status: "pending",
      confirmedIdentityRevision: null,
    };
    const row = accountReviewRowSchema.parse({
      ...review.row,
      toAssignment: {
        ...review.row.toAssignment,
        confirmation: "pending",
      },
      reviewReasons: ["account_group_unconfirmed"],
    });
    expect(compactReviewCheckboxAction(row, byId([source, pendingCash]))).toBe(
      "confirm_group"
    );
    expect(source.status).toBe("pending");
    expect(pendingCash.status).toBe("pending");
  });

  it("prioritizes pending Bank confirmation before choosing an unresolved Cash destination", () => {
    const { review } = makeT025SmsAtmCodecInput(true);
    const row = accountReviewRowSchema.parse({
      ...review.row,
      toAssignment: unresolvedCashDestination,
      reviewReasons: ["account_group_unconfirmed", "cash_transfer_review"],
    });
    expect(compactReviewCheckboxAction(row, byId(review.groups))).toBe(
      "confirm_group"
    );
    expect(review.groups[0]?.status).toBe("pending");
  });

  it("preserves source choice when an ATM Bank source itself is unresolved", () => {
    const { review } = makeT025SmsAtmCodecInput(false);
    const row = accountReviewRowSchema.parse({
      ...review.row,
      assignment: {
        state: "unresolved",
        accountId: null,
        reasonCode: "account_needed",
        candidateAccountIds: [],
      },
      reviewReasons: ["account_needed"],
    });
    expect(compactReviewCheckboxAction(row, byId(review.groups))).toBe(
      "choose_account"
    );
  });

  it("preserves non-ATM shared-group confirmation and subsequent ready-row selection", () => {
    const session = makeT025ReviewSession();
    const row = session.rows[0];
    if (!row) throw new Error("Missing non-ATM SMS source");
    expect(compactReviewCheckboxAction(row, byId(session.groups))).toBe(
      "confirm_group"
    );
    const confirmed = makeT025ConfirmedSession(session);
    const confirmedRow = confirmed.rows[0];
    if (!confirmedRow) throw new Error("Missing confirmed SMS source");
    expect(
      compactReviewCheckboxAction(confirmedRow, byId(confirmed.groups))
    ).toBe("select");
  });

  it("preserves Voice default selection, account choice, and category shortcut", () => {
    const session = makeDefaultInfoSession("r3-default-only");
    const voice = session.rows[0];
    if (!voice || voice.source !== "VOICE")
      throw new Error("Missing canonical Voice default");
    const readyUnchecked = accountReviewRowSchema.parse({
      ...voice,
      selected: false,
    });
    expect(
      compactReviewCheckboxAction(readyUnchecked, byId(session.groups))
    ).toBe("select");
    const unresolved = accountReviewRowSchema.parse({
      ...voice,
      assignment: {
        state: "unresolved",
        accountId: null,
        reasonCode: "account_needed",
        candidateAccountIds: [],
      },
      selected: false,
      reviewReasons: ["account_needed"],
    });
    expect(compactReviewCheckboxAction(unresolved, byId(session.groups))).toBe(
      "choose_account"
    );
    const needsCategory = accountReviewRowSchema.parse({
      ...voice,
      selected: false,
      reviewReasons: ["category_needed"],
    });
    expect(
      compactReviewCheckboxAction(needsCategory, byId(session.groups))
    ).toBe("choose_category");
  });

  it("keeps non-account review reasons in the existing transaction editor", () => {
    const session = makeDefaultInfoSession("r3-default-only");
    const row = session.rows[0];
    if (!row || row.source !== "VOICE")
      throw new Error("Missing canonical Voice default");
    const needsEdit = accountReviewRowSchema.parse({
      ...row,
      selected: false,
      reviewReasons: ["ambiguous_amount"],
    });
    expect(compactReviewCheckboxAction(needsEdit, byId(session.groups))).toBe(
      "edit_row"
    );
  });
});
