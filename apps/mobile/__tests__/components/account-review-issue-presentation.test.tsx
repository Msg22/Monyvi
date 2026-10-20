/** #395 account/currency issue presentation and temporary recovery regression.
 * Tests the real source-order filter and approved translations, not native geometry.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import React from "react";
import { accountReviewRowSchema } from "@monyvi/logic";
import { accountNeededReviewRows } from "@/components/transaction-review/account-review-row-filter";
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
  it.each(["en", "ar"] as const)(
    "uses current %s labels and Show all without mutating a review",
    async (language) => {
      await i18next.changeLanguage(language);
      const onShowAll = jest.fn<void, []>();
      render(
        <AccountNeededTemporaryHeader
          count={3}
          disabled={false}
          onShowAll={onShowAll}
        />
      );
      const expectedLabel = i18next.t("account_review_issue_account_needed", {
        ns: "transactions",
        defaultValue:
          language === "ar" ? "مطلوب اختيار حساب" : "Account needed",
      });
      expect(screen.getByText(expectedLabel + " · 3")).toBeTruthy();
      expect(
        screen.getByTestId("account-review-account-needed-only")
      ).not.toHaveTextContent("account_review_issue_account_needed");
      const showAll = screen.getByTestId(
        "account-review-account-needed-show-all"
      );
      expect(showAll).toHaveProp(
        "accessibilityLabel",
        i18next.t("account_review_group_view_all", { ns: "transactions" })
      );
      fireEvent.press(showAll);
      expect(onShowAll).toHaveBeenCalledTimes(1);
    }
  );
});
