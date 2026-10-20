/** #395 account/currency issue presentation and temporary recovery regression.
 * Tests the real source-order filter and approved translations, not native geometry.
 */
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import React from "react";
import {
  accountReviewRowSchema,
  accountReviewSessionSchema,
} from "@monyvi/logic";
import {
  accountNeededReviewRows,
  linkedGroupReviewRows,
} from "@/components/transaction-review/account-review-row-filter";
import { AccountNeededTemporaryHeader } from "@/components/transaction-review/account-review-filter-header";
import {
  isReviewChoiceFresh,
  presentCanonicalRowDetails,
  presentIssueRecoveryTarget,
  presentReviewIssues,
  presentReviewRowIssueKeys,
  reviewChoiceStamp,
} from "@/components/transaction-review/shared-account-presentation";
import { makeDefaultInfoSession } from "./account-review-default-info-test-fixtures";
import {
  makeT025ReviewSession,
  makeT025SmsAtmCodecInput,
  makeT025SmsOriginal,
  T025_IDS,
} from "../../../../packages/logic/src/sms-review-drafts/__tests__/account-review-v2-t025-fixtures";
import enTransactions from "@/locales/en/transactions.json";
import arTransactions from "@/locales/ar/transactions.json";
import enAccounts from "@/locales/en/accounts.json";
import arAccounts from "@/locales/ar/accounts.json";

beforeAll(async (): Promise<void> => {
  i18next.use(initReactI18next);
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    ns: ["transactions", "accounts"],
    defaultNS: "transactions",
    resources: {
      en: { transactions: enTransactions, accounts: enAccounts },
      ar: { transactions: arTransactions, accounts: arAccounts },
    },
    interpolation: { escapeValue: false },
  });
});

afterEach(async (): Promise<void> => {
  await i18next.changeLanguage("en");
});

describe("#395 accepted review context and modal revision gates", () => {
  it("R2 combined shows one account-needed issue for uncertain currency, never two CTAs", () => {
    const session = makeDefaultInfoSession("r3-combined-en");
    const distinctNeedsReviewCount = session.rows.filter(
      (row) => row.reviewReasons.length > 0
    ).length;
    const issues = presentReviewIssues(
      session.rows,
      distinctNeedsReviewCount,
      "en"
    );
    expect(
      issues.filter((issue) => issue.key === "account_review_issue_account")
    ).toEqual([
      {
        key: "account_review_issue_account",
        label: "Account needed",
        count: 1,
      },
    ]);
    expect(issues.map((issue) => issue.key)).not.toContain(
      "account_review_issue_currency"
    );
    expect(issues.map((issue) => issue.key)).not.toContain(
      "account_review_group_needs_review"
    );
    expect(distinctNeedsReviewCount).toBe(5);
  });

  it("counts the distinct currency/account affected-row union without losing category blockers", () => {
    const session = makeDefaultInfoSession("r3-combined-en");
    const currencyOnly = session.rows.find(
      (row) => row.currency.state === "unconfirmed"
    );
    const pendingGroupRow = session.rows.find(
      (row) =>
        row.currency.state === "known" && row.assignment.state === "suggested"
    );
    if (!currencyOnly || !pendingGroupRow)
      throw new Error("Missing R3 review rows");
    const overlapping = accountReviewRowSchema.parse({
      ...pendingGroupRow,
      assignment: {
        state: "unresolved",
        accountId: null,
        reasonCode: "account_needed",
        candidateAccountIds: [],
      },
      reviewReasons: [
        "account_needed",
        "currency_confirmation_needed",
        "category_needed",
      ],
    });
    const atmBase = session.rows.find(
      (row) =>
        row.assignment.state === "suggested" && row.rowId !== overlapping.rowId
    );
    if (!atmBase) throw new Error("Missing independent ATM fixture row");
    const source = atmBase.transaction;
    const fingerprint = "f".repeat(64);
    const missingAtmDestination = accountReviewRowSchema.parse({
      ...atmBase,
      source: "SMS",
      sourceRef: "sms:atm:union",
      sourceFingerprint: fingerprint,
      toAssignment: null,
      reviewReasons: [],
      transaction: {
        source: "SMS",
        amount: source.amount,
        currency: source.currency,
        type: source.type,
        date: source.date,
        categoryId: source.categoryId,
        categoryDisplayName: source.categoryDisplayName,
        confidence: source.confidence,
        originLabel: "Synthetic ATM",
        smsFingerprint: fingerprint,
        senderDisplayName: "TEST bank",
        rawSmsBody: "TEST ATM withdrawal",
        isAtmWithdrawal: true,
      },
    });
    expect(presentReviewRowIssueKeys(missingAtmDestination)).toContain(
      "account_review_issue_account"
    );
    const issues = presentReviewIssues(
      [currencyOnly, overlapping, missingAtmDestination],
      3,
      "en"
    );
    expect(
      issues.filter((issue) => issue.key === "account_review_issue_account")
    ).toEqual([
      {
        key: "account_review_issue_account",
        label: "Account needed",
        count: 3,
      },
    ]);
    expect(
      issues.find((issue) => issue.key === "account_review_issue_category")
        ?.count
    ).toBe(1);
    expect(issues.map((issue) => issue.key)).not.toContain(
      "account_review_issue_currency"
    );
    expect(presentReviewRowIssueKeys(overlapping)).toEqual(
      expect.arrayContaining([
        "account_review_issue_account",
        "account_review_issue_currency",
      ])
    );
    expect(
      presentIssueRecoveryTarget(
        [currencyOnly, overlapping],
        "account_review_issue_account"
      )?.rowId
    ).toBe(currencyOnly.rowId);
    const union = [currencyOnly, overlapping, missingAtmDestination];
    expect(accountNeededReviewRows({ ...session, rows: union })).toEqual(union);

    const atm = makeT025SmsAtmCodecInput(false).review;
    if (atm.row.toAssignment?.state !== "suggested")
      throw new Error("Missing real SMS ATM Cash destination");
    const pendingCash = accountReviewRowSchema.parse({
      ...atm.row,
      toAssignment: { ...atm.row.toAssignment, confirmation: "pending" },
    });
    const pendingSession = { ...makeT025ReviewSession(), rows: [pendingCash] };
    expect(accountNeededReviewRows(pendingSession)).toEqual([pendingCash]);
  });

  it("presents a real default-origin Cash assignment quietly without an account blocker", () => {
    const session = makeDefaultInfoSession("r3-default-only");
    const row = session.rows.find(
      (item) =>
        item.assignment.state === "existing" &&
        item.assignment.origin === "default"
    );
    if (!row || row.assignment.state !== "existing")
      throw new Error("missing_canonical_default_row");
    const shown = presentCanonicalRowDetails(
      row,
      null,
      [{ id: row.assignment.accountId, name: "Cash", type: "CASH" }],
      "en"
    );
    expect(shown.accountName).toBe("Cash");
    expect(shown.accountType).toBe("CASH");
    expect(shown.accountStatusLabel).toBe("Default account");
    expect(shown.accountStatusTone).toBeUndefined();
    expect(shown.currencyActionLabel).toBeNull();
  });

  it("revokes an open choice on changed owner, session, review, operation or row revision", () => {
    const session = makeDefaultInfoSession("r3-combined-en");
    const row = session.rows.find(
      (item) => item.currency.state === "unconfirmed"
    );
    if (!row) throw new Error("missing_conflicting_currency_row");
    const stamp = reviewChoiceStamp(session, row.revision);
    expect(isReviewChoiceFresh(stamp, session, row.revision)).toBe(true);
    expect(isReviewChoiceFresh(stamp, session, null)).toBe(false);
    expect(isReviewChoiceFresh(stamp, session, "changed-row")).toBe(false);
    expect(
      isReviewChoiceFresh(
        stamp,
        { ...session, revision: "changed-review" },
        row.revision
      )
    ).toBe(false);
    expect(
      isReviewChoiceFresh(
        stamp,
        { ...session, operationGeneration: "changed-generation" },
        row.revision
      )
    ).toBe(false);
    expect(
      isReviewChoiceFresh(
        stamp,
        { ...session, sessionId: "changed-session" },
        row.revision
      )
    ).toBe(false);
    expect(
      isReviewChoiceFresh(
        stamp,
        { ...session, ownerId: "changed-owner" },
        row.revision
      )
    ).toBe(false);
  });
});

describe("#395 temporary account-needed JSX header", () => {
  it("filters discontiguous account-needed positions without reordering or changing the source session", () => {
    const session = makeDefaultInfoSession("r3-combined-en");
    const sourceBefore = JSON.stringify(session);
    // Change a default row with NO active linked group: the resulting session
    // remains canonical instead of leaving a dangling reciprocal group.
    const existingDefault = session.rows.find(
      (row) =>
        row.assignment.state === "existing" &&
        row.assignment.origin === "default"
    );
    const last = session.rows[session.rows.length - 1];
    if (!existingDefault || !last)
      throw new Error("Missing discontiguous R3 review rows");
    const needed = accountReviewRowSchema.parse({
      ...existingDefault,
      assignment: {
        state: "unresolved",
        accountId: null,
        reasonCode: "account_needed",
        candidateAccountIds: [],
      },
      reviewReasons: ["account_needed"],
      selected: false,
    });
    const changed = accountReviewSessionSchema.parse({
      ...session,
      rows: session.rows.map((row) =>
        row.rowId === needed.rowId ? needed : row
      ),
    });
    expect(accountNeededReviewRows(changed).map((row) => row.rowId)).toEqual([
      needed.rowId,
      last.rowId,
    ]);
    const linked = [session.rows[1], session.rows[3], session.rows[5]];
    if (linked.some((row) => !row))
      throw new Error("Missing distant linked rows");
    const groupIds = [linked[2]?.rowId, linked[0]?.rowId].filter(
      (id): id is string => id !== undefined
    );
    expect(
      linkedGroupReviewRows(session, groupIds).map((row) => row.rowId)
    ).toEqual([linked[0]?.rowId, linked[2]?.rowId]);
    expect(JSON.stringify(session)).toBe(sourceBefore);
  });

  it("canonical discontiguous SMS rows include a pending ATM Cash destination in the account-needed union", () => {
    const baseline = makeT025ReviewSession(
      T025_IDS.queue,
      [makeT025SmsOriginal(0), makeT025SmsOriginal(1)],
      [T025_IDS.rowOne, T025_IDS.rowTwo]
    );
    const first = baseline.rows[0];
    const middle = baseline.rows[1];
    const sourceGroup = baseline.groups[0];
    const atm = makeT025SmsAtmCodecInput(false).review;
    const cashGroup = atm.groups.find((group) => group.type === "CASH");
    if (
      !first ||
      !middle ||
      !sourceGroup ||
      !cashGroup ||
      atm.row.toAssignment?.state !== "suggested"
    )
      throw new Error("Missing canonical SMS/ATM fixture endpoints");

    const unresolvedFirst = accountReviewRowSchema.parse({
      ...first,
      assignment: {
        state: "unresolved",
        accountId: null,
        reasonCode: "account_needed",
        candidateAccountIds: [],
      },
      reviewReasons: ["account_needed"],
      selected: false,
    });
    const thirdId = "00000000-0000-4000-8000-000000002509";
    const thirdFingerprint = "c".repeat(64);
    const pendingCash = accountReviewRowSchema.parse({
      ...atm.row,
      rowId: thirdId,
      sourceRef: "t025-third-sms-atm",
      sourceFingerprint: thirdFingerprint,
      transaction: {
        ...atm.row.transaction,
        smsFingerprint: thirdFingerprint,
        rawSmsBody: "TEST ATM withdrawal",
      },
      toAssignment: { ...atm.row.toAssignment, confirmation: "pending" },
    });
    const session = accountReviewSessionSchema.parse({
      ...baseline,
      groups: [
        { ...sourceGroup, linkedRowIds: [middle.rowId] },
        {
          ...cashGroup,
          status: "pending",
          confirmedIdentityRevision: null,
          linkedRowIds: [thirdId],
        },
      ],
      rows: [unresolvedFirst, middle, pendingCash],
    });
    expect(accountNeededReviewRows(session).map((row) => row.rowId)).toEqual([
      first.rowId,
      thirdId,
    ]);
    expect(presentReviewRowIssueKeys(middle)).not.toContain(
      "account_review_issue_account"
    );
    expect(presentReviewRowIssueKeys(pendingCash)).toContain(
      "account_review_issue_account"
    );
    expect(session.rows).toHaveLength(3);
    expect(session.rows[1]?.rowId).toBe(middle.rowId);
    expect(session.rows[2]?.transaction.amount).toBe(
      atm.row.transaction.amount
    );
  });

  it.each(["en", "ar"] as const)(
    "linked group header in %s discloses scoped context and Show all independently",
    async (language) => {
      await i18next.changeLanguage(language);
      const onShowAll = jest.fn<void, []>();
      render(
        <AccountNeededTemporaryHeader
          count={3}
          linkedGroupName="QNB"
          disabled={false}
          onShowAll={onShowAll}
        />
      );
      const header = screen.getByTestId(
        "account-review-linked-transactions-only"
      );
      const expectedHeading =
        language === "ar"
          ? "عرض 3 معاملات مرتبطة بـQNB"
          : "Showing 3 transactions linked to QNB";
      const expectedShowAll = language === "ar" ? "عرض الكل" : "Show all";
      expect(within(header).getByText(expectedHeading)).toBeTruthy();
      expect(header).toHaveTextContent(expectedHeading + expectedShowAll);
      expect(
        screen.queryByTestId("account-review-account-needed-only")
      ).toBeNull();
      const showAll = within(header).getByTestId(
        "account-review-account-needed-show-all"
      );
      expect(showAll).toHaveProp("accessibilityLabel", expectedShowAll);
      fireEvent.press(showAll);
      expect(onShowAll).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["en", "ar"] as const)(
    "disabled linked-row Show all in %s retains truthful singular scope without firing",
    async (language) => {
      await i18next.changeLanguage(language);
      const onShowAll = jest.fn<void, []>();
      render(
        <AccountNeededTemporaryHeader
          count={1}
          linkedGroupName="CIB"
          disabled
          onShowAll={onShowAll}
        />
      );
      const expectedHeading =
        language === "ar"
          ? "عرض معاملة مرتبطة بـCIB"
          : "Showing 1 transaction linked to CIB";
      const header = screen.getByTestId(
        "account-review-linked-transactions-only"
      );
      expect(within(header).getByText(expectedHeading)).toBeTruthy();
      const showAll = within(header).getByTestId(
        "account-review-account-needed-show-all"
      );
      expect(showAll).toHaveProp(
        "accessibilityLabel",
        i18next.t("compact_review_show_all", { ns: "transactions" })
      );
      expect(showAll).toBeDisabled();
      fireEvent.press(showAll);
      expect(onShowAll).not.toHaveBeenCalled();
      expect(
        screen.queryByTestId("account-review-account-needed-only")
      ).toBeNull();
    }
  );
});
