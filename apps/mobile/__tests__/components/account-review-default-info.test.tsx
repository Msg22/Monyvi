/**
 * #395 T018 — T020/T021 disclosure, editability and Why-sheet Red.
 *
 * REAL FUTURE SUT at DefaultAccountInfo.tsx is intentionally absent until
 * story implementation. Never mock this module or manufacture a passing UI.
 * This tests presentation; actual screen-reader focus, keyboard/safe-area
 * geometry and canonical route/Save require owner device + T054 evidence.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import {
  changeLanguage,
  init as initializeI18next,
  use as registerI18nextPlugin,
} from "i18next";
import { initReactI18next } from "react-i18next";
import enTransactions from "../../locales/en/transactions.json";
import arTransactions from "../../locales/ar/transactions.json";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  ScrollView,
} from "react-native";
import {
  DefaultAccountInfo,
  DefaultAccountWhySheet,
} from "@/components/transaction-review/DefaultAccountInfo";
import { TransactionItem } from "@/components/transaction-review/TransactionItem";
import {
  countDefaultAssignments,
  countNeedsReview,
  countSelected,
  makeDefaultInfoSession,
} from "./account-review-default-info-test-fixtures";

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 24,
}));

// Narrow existing visual/platform leaves only. Never mock the T020/T021 SUT.
jest.mock("@/components/institutions/InstitutionLogoMark", () => ({
  InstitutionLogoMark: (): null => null,
}));
jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));
let mockLocale: "en" | "ar" = "en";
jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: "en" | "ar" } => ({ language: mockLocale }),
}));

interface InfoProps {
  readonly defaultAccountName: string;
  readonly assignmentCount: number;
  readonly onWhyPress: () => void;
}

function makeInfoProps(
  overrides: Partial<InfoProps> = {}
): InfoProps {
  return {
    defaultAccountName: "Cash",
    assignmentCount: 2,
    onWhyPress: jest.fn(),
    ...overrides,
  };
}

function renderSheet(visible = true, onClose = jest.fn()): void {
  render(
    <DefaultAccountWhySheet
      visible={visible}
      defaultAccountName="Cash"
      assignmentCount={2}
      onClose={onClose}
    />
  );
}

function DefaultDisclosureJourney(): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <DefaultAccountInfo
        defaultAccountName="Cash"
        assignmentCount={2}
        onWhyPress={() => setVisible(true)}
      />
      <DefaultAccountWhySheet
        visible={visible}
        defaultAccountName="Cash"
        assignmentCount={2}
        onClose={() => setVisible(false)}
      />
    </>
  );
}

beforeAll(async (): Promise<void> => {
  // Real i18next singleton + actual react-i18next hook binding.
  // Initializing i18next alone leaves useTranslation with an empty fallback.
  registerI18nextPlugin(initReactI18next);
  await initializeI18next({
    lng: "en",
    fallbackLng: "en",
    ns: ["transactions"],
    defaultNS: "transactions",
    resources: {
      en: { transactions: enTransactions },
      ar: { transactions: arTransactions },
    },
    interpolation: { escapeValue: false },
  });
});

afterEach(async (): Promise<void> => {
  await changeLanguage("en");
  mockLocale = "en";
  jest.clearAllMocks();
});

describe("T018: B1 R3-07 quiet accepted-default disclosure", () => {
  it("renders absolutely no note, Why action or empty details container for count zero", () => {
    const onWhyPress = jest.fn();
    render(<DefaultAccountInfo {...makeInfoProps({ assignmentCount: 0, onWhyPress })} />);

    expect(screen.queryByTestId("account-review-default-info")).toBeNull();
    expect(screen.queryByTestId("account-review-default-why-trigger")).toBeNull();
    expect(screen.queryByText("Review details")).toBeNull();
    expect(onWhyPress).not.toHaveBeenCalled();
  });

  it("shows the real R3-07 2/0/2 default-only assignment as quiet note with editable context", () => {
    const session = makeDefaultInfoSession("r3-default-only");
    const onWhyPress = jest.fn();
    expect(session.rows).toHaveLength(2);
    expect(countDefaultAssignments(session)).toBe(2);
    expect(countNeedsReview(session)).toBe(0);
    expect(countSelected(session)).toBe(2);

    render(
      <DefaultAccountInfo
        {...makeInfoProps({
          assignmentCount: countDefaultAssignments(session),
          onWhyPress,
        })}
      />
    );

    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();
    expect(screen.getByText("Cash was used for 2 transactions.")).toBeTruthy();
    expect(screen.queryByText("Review details")).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-default-why-trigger"));
    expect(onWhyPress).toHaveBeenCalledTimes(1);
  });

  it("keeps R3-05 combined default count distinct from 7 total, 5 review, 2 selected", () => {
    const session = makeDefaultInfoSession("r3-combined-en");
    expect(session.rows).toHaveLength(7);
    expect(session.groups).toHaveLength(2);
    expect(countNeedsReview(session)).toBe(5);
    expect(countSelected(session)).toBe(2);
    expect(countDefaultAssignments(session)).toBe(2);
    expect(session.rows.filter((row) => row.assignment.state === "suggested"))
      .toHaveLength(4);

    render(
      <DefaultAccountInfo
        defaultAccountName="Cash"
        assignmentCount={countDefaultAssignments(session)}
        onWhyPress={jest.fn()}
      />
    );

    expect(screen.getByText("Cash was used for 2 transactions.")).toBeTruthy();
    expect(screen.queryByText(/used for 7 transactions/)).toBeNull();
    expect(screen.queryByText(/used for 5 transactions/)).toBeNull();
  });

  it("never leaves a stale default note or Why trigger after count becomes zero", () => {
    const onWhyPress = jest.fn();
    const view = render(<DefaultAccountInfo {...makeInfoProps({ onWhyPress })} />);
    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();

    view.rerender(<DefaultAccountInfo {...makeInfoProps({ assignmentCount: 0, onWhyPress })} />);
    expect(screen.queryByTestId("account-review-default-info")).toBeNull();
    expect(screen.queryByTestId("account-review-default-why-trigger")).toBeNull();
    expect(onWhyPress).not.toHaveBeenCalled();
  });

  it("does not open a Why sheet merely by rendering the quiet note", () => {
    render(<DefaultDisclosureJourney />);
    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();
    expect(screen.queryByTestId("account-review-default-why-sheet")).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-default-why-trigger"));
    expect(screen.getByTestId("account-review-default-why-sheet")).toBeTruthy();
  });

  it("retains unrelated category/low-confidence review blockers and the real row account edit action", () => {
    const session = makeDefaultInfoSession("r3-default-only");
    const row = session.rows[0];
    if (!row) throw new Error("R3-07 must have a default row");
    const edit = jest.fn<void, [index: number]>();
    const select = jest.fn<void, [index: number]>();
    const otherReasons = ["category_needed", "low_confidence"] as const;

    render(
      <>
        <DefaultAccountInfo
          defaultAccountName="Cash"
          assignmentCount={countDefaultAssignments(session)}
          onWhyPress={jest.fn()}
        />
        <TransactionItem
          transaction={row.transaction}
          index={0}
          isSelected={false}
          accountName="Cash"
          hasMissingInfo
          reviewMeta={{ isAutoSelectable: false, reasons: otherReasons }}
          onToggleSelect={select}
          onPress={edit}
        />
      </>
    );

    expect(screen.getByTestId("transaction-account-match")).toBeTruthy();
    expect(screen.getByTestId("account-review-default-info")).toBeTruthy();
    // Real TransactionItem must retain its amber "Review details" blocker
    // while default-account disclosure stays visible and independently editable.
    expect(screen.getByText("review_badge_review_details")).toBeTruthy();
    fireEvent.press(screen.getByTestId("transaction-review-edit-action"));
    expect(edit).toHaveBeenCalledWith(0);
    expect(select).not.toHaveBeenCalled();
  });

  it("is silent for unconfirmed/explicit/named/ineligible account states passed as count zero", () => {
    for (const reason of ["explicit", "currency_conflict", "ineligible_sms_cash"] as const) {
      const view = render(
        <DefaultAccountInfo
          {...makeInfoProps({ assignmentCount: 0, defaultAccountName: reason })}
        />
      );
      expect(screen.queryByTestId("account-review-default-info")).toBeNull();
      view.unmount();
    }
  });
});

describe("T018: B1 R3-12 Why explanation and dismissal", () => {
  it("keeps the approved account, count and per-transaction edit reminder visible", () => {
    renderSheet();
    expect(screen.getByTestId("account-review-default-why-sheet")).toBeTruthy();
    expect(screen.getByText("Default account used")).toBeTruthy();
    expect(screen.getByText(
      "Cash was selected for 2 transactions because no account was mentioned and the currency matches."
    )).toBeTruthy();
    expect(screen.getByText(
      "You can change the account on each transaction before saving."
    )).toBeTruthy();
    expect(screen.getByText(
      "A named account or an uncertain currency still needs your review."
    )).toBeTruthy();
    expect(screen.getByText("Got it")).toBeTruthy();
  });

  it("renders no active Why surface when visible is false", () => {
    renderSheet(false);
    expect(screen.queryByTestId("account-review-default-why-sheet")).toBeNull();
    expect(screen.queryByText("Got it")).toBeNull();
  });

  it("calls the parent's close exactly once when Got it is pressed, without an account change", () => {
    const onClose = jest.fn();
    renderSheet(true, onClose);
    fireEvent.press(screen.getByTestId("account-review-default-why-dismiss"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wires Android hardware Back to informational dismissal, not confirmation", () => {
    const onClose = jest.fn();
    renderSheet(true, onClose);
    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses the outside pointer backdrop to dismiss once; accessible Got it remains inside the modal", () => {
    const onClose = jest.fn();
    renderSheet(true, onClose);
    // accessibilityViewIsModal hides sibling overlays from screen readers:
    // this backdrop is a pointer target, not another inaccessible button.
    expect(screen.getByTestId("account-review-default-why-backdrop"))
      .toHaveProp("accessible", false);
    fireEvent.press(screen.getByTestId("account-review-default-why-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns to the same accessible Why trigger after informational dismissal", () => {
    render(<DefaultDisclosureJourney />);
    expect(screen.getByTestId("account-review-default-why-trigger"))
      .toHaveProp("accessibilityRole", "button");
    fireEvent.press(screen.getByTestId("account-review-default-why-trigger"));
    expect(screen.getByTestId("account-review-default-why-sheet")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-default-why-dismiss"));
    expect(screen.queryByTestId("account-review-default-why-sheet")).toBeNull();
    expect(screen.getByTestId("account-review-default-why-trigger")).toBeTruthy();
    // Presence does not prove native screen-reader focus restoration.
  });

  it("has named modal boundaries and accessible dismiss and Why actions", () => {
    render(<DefaultDisclosureJourney />);
    expect(screen.getByTestId("account-review-default-why-trigger"))
      .toHaveProp("accessibilityRole", "button");
    fireEvent.press(screen.getByTestId("account-review-default-why-trigger"));
    expect(screen.getByTestId("account-review-default-why-dismiss"))
      .toHaveProp("accessibilityRole", "button");
    expect(screen.getByTestId("account-review-default-why-sheet"))
      .toHaveProp("accessibilityViewIsModal", true);
  });

  it("uses a scrollable/keyboard-aware bottom sheet and one runtime bottom inset", () => {
    renderSheet();
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView)).toBeTruthy();
    expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy();
    expect(screen.getByTestId("account-review-default-why-sheet"))
      .toHaveStyle({ paddingBottom: 24 });
    // Native measured inset, focus and keyboard overlap remain device-only.
  });

  it("keeps long names and explanations untruncated at the semantic level", () => {
    const name = "QNB Everyday - حساب يومي very long owner-defined Arabic/English account name 0007";
    render(
      <DefaultAccountWhySheet
        visible
        defaultAccountName={name}
        assignmentCount={2}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText(new RegExp(name)))
      .not.toHaveProp("numberOfLines", 1);
    expect(screen.getByText(/You can change the account/)).toBeTruthy();
    // Native 340dp, font-scale 1.35 and viewport scrolling need owner render.
  });

  it("provides real EN singular pluralization without concatenating an account name", () => {
    render(
      <DefaultAccountInfo
        defaultAccountName="QNB Salary 0007"
        assignmentCount={1}
        onWhyPress={jest.fn()}
      />
    );
    expect(screen.getByText("QNB Salary 0007 was used for 1 transaction.")).toBeTruthy();
  });

  it("renders approved Arabic dual-count Why explanation and keeps user account name intact", async () => {
    await changeLanguage("ar");
    mockLocale = "ar";
    render(
      <>
        <DefaultAccountInfo
          defaultAccountName="كاش"
          assignmentCount={2}
          onWhyPress={jest.fn()}
        />
        <DefaultAccountWhySheet
          visible
          defaultAccountName="كاش"
          assignmentCount={2}
          onClose={jest.fn()}
        />
      </>
    );
    expect(screen.getByText("تم استخدام كاش لمعاملتين.")).toBeTruthy();
    expect(screen.getByText("تم استخدام الحساب الافتراضي")).toBeTruthy();
    expect(screen.getByText(
      "تم اختيار كاش لمعاملتين لأن الحساب لم يُذكر والعملة تطابق عملة الحساب."
    )).toBeTruthy();
    expect(screen.getByText("يمكنك تغيير الحساب لكل معاملة قبل الحفظ.")).toBeTruthy();
    expect(screen.getByText(
      "إذا ذُكر حساب بالاسم أو كانت العملة غير مؤكدة، فستظل المعاملة بحاجة إلى مراجعتك."
    )).toBeTruthy();
    expect(screen.getByText("فهمت")).toBeTruthy();
  });

  it("isolates mixed Arabic/Latin account names and suffixes inside Arabic disclosure copy", async () => {
    await changeLanguage("ar");
    mockLocale = "ar";
    const originalName = "QNB راتب 0007";
    const isolatedName = "\u2068" + originalName + "\u2069";

    render(
      <>
        <DefaultAccountInfo
          defaultAccountName={originalName}
          assignmentCount={2}
          onWhyPress={jest.fn()}
        />
        <DefaultAccountWhySheet
          visible
          defaultAccountName={originalName}
          assignmentCount={2}
          onClose={jest.fn()}
        />
      </>
    );

    expect(screen.getByText(`تم استخدام ${isolatedName} لمعاملتين.`)).toBeTruthy();
    expect(screen.getByText(
      `تم اختيار ${isolatedName} لمعاملتين لأن الحساب لم يُذكر والعملة تطابق عملة الحساب.`
    )).toBeTruthy();
    expect(originalName).toBe("QNB راتب 0007");
  });

  it("retains semantic light/dark theme classes without adding a new decorative palette", () => {
    render(<DefaultAccountInfo {...makeInfoProps()} />);
    expect(screen.getByTestId("account-review-default-info"))
      .toHaveProp("className", expect.stringContaining("dark:"));
    expect(screen.getByTestId("account-review-default-info"))
      .not.toHaveProp("className", expect.stringContaining("bg-blue-"));
  });
});
