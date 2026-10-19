/**
 * #395 T035 US3 — creation Red BEFORE T037/T038.
 * Imports future T038 AccountChoiceSheet/CurrencyConfirmationSheet directly,
 * without virtual modules or mocks. The REAL existing CurrencyPicker is also
 * used; its currently non-null input and absent contextSubtitle intentionally
 * produce TypeScript Red until the additive T037 contract lands.
 * Callback assertions are not proof of reducer, DB, route or financial Save.
 */
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import i18next from "i18next";
import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, View } from "react-native";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import { AccountChoiceSheet } from "@/components/transaction-review/AccountChoiceSheet";
import {
  isReviewChoiceFresh,
  presentCanonicalRowDetails,
  presentReviewIssues,
  reviewChoiceStamp,
} from "@/components/transaction-review/shared-account-presentation";
import { makeDefaultInfoSession } from "./account-review-default-info-test-fixtures";
import { CurrencyConfirmationSheet } from "@/components/transaction-review/CurrencyConfirmationSheet";
import {
  GROUP_SCOPE_EN,
  ROW_CONTEXT_AR,
  ROW_CONTEXT_EN,
  countEligibleCandidates,
  getQnbCandidate,
  makeAccountChoiceProps,
  makeCurrencyConflictProps,
  makeGroupChoiceProps,
  makeQnbChoiceCandidates,
  makeManualDraftChoiceProps,
  makeExplicitCurrencyConsentChoiceProps,
  type AccountChoiceViewProps,
  type CurrencyConflictViewProps,
} from "./account-review-choices-test-fixtures";

// Only platform/icon/inset/i18n leaves are controlled; no T035/T037/T038 SUT
// or facade, choice algorithm, currency list, parser, reducer or DB is mocked.
jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 24,
}));
jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: { readonly testID?: string }): React.JSX.Element => {
    const actualReact = jest.requireActual<typeof import("react")>("react");
    const native =
      jest.requireActual<typeof import("react-native")>("react-native");
    return actualReact.createElement(
      native.Text,
      { testID: props.testID },
      "icon"
    );
  },
}));
let mockLocale: "en" | "ar" = "en";
jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string) => string;
    readonly i18n: { readonly language: string };
  } => ({
    t: (key: string): string => key,
    i18n: { language: mockLocale },
  }),
}));

function renderAccounts(
  props: AccountChoiceViewProps = makeAccountChoiceProps()
): void {
  render(<AccountChoiceSheet {...props} />);
}
function renderConflict(
  props: CurrencyConflictViewProps = makeCurrencyConflictProps()
): void {
  render(<CurrencyConfirmationSheet {...props} />);
}
function renderCurrencyPicker(
  selectedCurrency: "EGP" | "USD" | null,
  overrides: {
    readonly onSelect?: (code: string) => void;
    readonly onClose?: () => void;
    readonly contextSubtitle?: string;
  } = {}
): void {
  render(
    <CurrencyPicker
      visible
      testID="account-review-existing-currency-picker"
      selectedCurrency={selectedCurrency}
      allowedCurrencies={["EGP", "USD"]}
      contextSubtitle={overrides.contextSubtitle}
      onSelect={overrides.onSelect ?? jest.fn()}
      onClose={overrides.onClose ?? jest.fn()}
    />
  );
}

function ControlledCurrencyJourney({
  onResolved,
}: {
  readonly onResolved: (code: string) => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<"conflict" | "picker" | "closed">(
    "conflict"
  );
  const [candidate, setCandidate] = useState<string | null>(null);
  return (
    <>
      {mode === "conflict" && (
        <CurrencyConfirmationSheet
          {...makeCurrencyConflictProps({
            selectedCandidateCode: candidate,
            canUseSelection: candidate !== null,
            onSelectCandidate: setCandidate,
            onUseSelected: () => {
              if (candidate !== null) onResolved(candidate);
              setMode("closed");
            },
            onChooseAnother: () => setMode("picker"),
            onClose: () => setMode("closed"),
          })}
        />
      )}
      {mode === "picker" && (
        <CurrencyPicker
          visible
          testID="account-review-existing-currency-picker"
          selectedCurrency={null}
          contextSubtitle={ROW_CONTEXT_EN}
          allowedCurrencies={["EGP", "USD"]}
          onSelect={onResolved}
          onClose={() => setMode("closed")}
        />
      )}
    </>
  );
}

beforeAll(async (): Promise<void> => {
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    ns: ["common"],
    defaultNS: "common",
    resources: { en: { common: enCommon }, ar: { common: arCommon } },
    interpolation: { escapeValue: false },
  });
});
afterEach(async (): Promise<void> => {
  mockLocale = "en";
  await i18next.changeLanguage("en");
  jest.clearAllMocks();
});

describe("T035 R1-03/R1-12 — explicit existing-account choice", () => {
  it("distinguishes two real catalogue roles from one UI-only third QNB option", () => {
    const options = makeQnbChoiceCandidates();
    expect(options).toHaveLength(3);
    expect(countEligibleCandidates(options)).toBe(3);
    expect(getQnbCandidate(options, "0007").displayName).toBe("QNB Everyday");
    expect(getQnbCandidate(options, "9221").displayName).toBe("QNB Savings");
    expect(getQnbCandidate(options, "4402").id).toBe(
      "synthetic-ui-only-third-QNB-candidate"
    );
  });

  it("opens with three distinctive QNB/EGP options and no implied first/default selection", () => {
    const props = makeAccountChoiceProps();
    const onUseSelected = jest.fn();
    renderAccounts({ ...props, onUseSelected });
    expect(
      screen.getByTestId("account-review-account-choice-sheet")
    ).toBeTruthy();
    expect(screen.getAllByTestId("account-review-account-option")).toHaveLength(
      3
    );
    for (const candidate of props.candidateOptions) {
      expect(screen.getByLabelText(candidate.accessibilityLabel)).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected: false })
      );
    }
    const use = screen.getByTestId("account-review-account-use");
    expect(use).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(use);
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("stages exactly the tapped candidate without submitting or closing the sheet", () => {
    const props = makeAccountChoiceProps();
    const selected = getQnbCandidate(props.candidateOptions, "9221");
    const onSelectCandidate = jest.fn();
    const onUseSelected = jest.fn();
    const onClose = jest.fn();
    renderAccounts({ ...props, onSelectCandidate, onUseSelected, onClose });
    fireEvent.press(screen.getByLabelText(selected.accessibilityLabel));
    expect(onSelectCandidate).toHaveBeenCalledTimes(1);
    expect(onSelectCandidate).toHaveBeenCalledWith(selected.id);
    expect(onUseSelected).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses an explicitly controlled selected ID and separate Use button to commit once", () => {
    const props = makeAccountChoiceProps();
    const selected = getQnbCandidate(props.candidateOptions, "0007");
    const onUseSelected = jest.fn();
    const onSelectCandidate = jest.fn();
    renderAccounts({
      ...props,
      selectedCandidateId: selected.id,
      canUseSelection: true,
      onUseSelected,
      onSelectCandidate,
    });
    expect(screen.getByLabelText(selected.accessibilityLabel)).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
    fireEvent.press(screen.getByTestId("account-review-account-use"));
    expect(onUseSelected).toHaveBeenCalledTimes(1);
    expect(onSelectCandidate).not.toHaveBeenCalled();
  });

  it("disambiguates same nicknames by masked bank suffix instead of assuming identity", () => {
    const props = makeAccountChoiceProps();
    const qnb0007 = getQnbCandidate(props.candidateOptions, "0007");
    const qnb4402 = getQnbCandidate(props.candidateOptions, "4402");
    expect(qnb0007.displayName).toBe(qnb4402.displayName);
    renderAccounts(props);
    expect(screen.getByLabelText(qnb0007.accessibilityLabel)).toBeTruthy();
    expect(screen.getByLabelText(qnb4402.accessibilityLabel)).toBeTruthy();
    expect(screen.queryByText(/full account number/i)).toBeNull();
  });

  it("does not enable Use for an empty list, null selection, or ineligible option", () => {
    const candidates = makeQnbChoiceCandidates();
    const candidate = getQnbCandidate(candidates, "0007");
    const eligible = getQnbCandidate(candidates, "9221");
    const props = makeAccountChoiceProps({
      // A genuinely ineligible option stays disabled while another eligible
      // option keeps Use visible, but disabled until explicitly selected.
      candidateOptions: [{ ...candidate, isEligible: false }, eligible],
      canUseSelection: false,
    });
    const onSelectCandidate = jest.fn();
    const onUseSelected = jest.fn();
    renderAccounts({ ...props, onSelectCandidate, onUseSelected });
    const option = screen.getByLabelText(candidate.accessibilityLabel);
    expect(option).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(option);
    fireEvent.press(screen.getByTestId("account-review-account-use"));
    expect(onSelectCandidate).not.toHaveBeenCalled();
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("cancels a staged account without applying its choice to any row or group", () => {
    const selected = getQnbCandidate(makeQnbChoiceCandidates(), "0007");
    const onClose = jest.fn();
    const onUseSelected = jest.fn();
    renderAccounts(
      makeAccountChoiceProps({
        selectedCandidateId: selected.id,
        canUseSelection: true,
        onClose,
        onUseSelected,
      })
    );
    fireEvent.press(screen.getByTestId("account-review-account-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("uses Android hardware Back for cancellation only", () => {
    const onClose = jest.fn();
    const onUseSelected = jest.fn();
    renderAccounts(makeAccountChoiceProps({ onClose, onUseSelected }));
    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("dismisses through an accessible backdrop without confirming", () => {
    const onClose = jest.fn();
    const onUseSelected = jest.fn();
    renderAccounts(makeAccountChoiceProps({ onClose, onUseSelected }));
    fireEvent.press(screen.getByLabelText("Close account chooser"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("renders neither candidates nor Use when the parent closes the chooser", () => {
    renderAccounts(makeAccountChoiceProps({ visible: false }));
    expect(
      screen.queryByTestId("account-review-account-choice-sheet")
    ).toBeNull();
    expect(screen.queryByTestId("account-review-account-use")).toBeNull();
  });

  it("preserves row scope versus disclosed group-wide replacement without selecting other rows", () => {
    const rowUse = jest.fn();
    const groupUse = jest.fn();
    const candidateId = getQnbCandidate(makeQnbChoiceCandidates(), "0007").id;
    const first = render(
      <AccountChoiceSheet
        {...makeAccountChoiceProps({
          selectedCandidateId: candidateId,
          canUseSelection: true,
          onUseSelected: rowUse,
        })}
      />
    );
    expect(screen.getByText(ROW_CONTEXT_EN)).toBeTruthy();
    expect(screen.getByText("Only this transaction will change.")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-account-use"));
    expect(rowUse).toHaveBeenCalledTimes(1);
    first.unmount();
    renderAccounts(
      makeGroupChoiceProps({
        selectedCandidateId: candidateId,
        canUseSelection: true,
        onUseSelected: groupUse,
      })
    );
    expect(screen.getByText(GROUP_SCOPE_EN)).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-account-use"));
    expect(groupUse).toHaveBeenCalledTimes(1);
    expect(rowUse).toHaveBeenCalledTimes(1);
    // Real row/group mutation scope is T034/T036/T039, not this callback.
  });

  it("suppresses competing Use while the facade is busy even with a selected ID", () => {
    const id = getQnbCandidate(makeQnbChoiceCandidates(), "0007").id;
    const onUseSelected = jest.fn();
    renderAccounts(
      makeAccountChoiceProps({
        selectedCandidateId: id,
        canUseSelection: true,
        isBusy: true,
        onUseSelected,
      })
    );
    const use = screen.getByTestId("account-review-account-use");
    expect(use).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(use);
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("uses a scrollable keyboard-aware sheet with one runtime bottom inset", () => {
    renderAccounts();
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView)).toBeTruthy();
    expect(screen.UNSAFE_getByType(ScrollView)).toBeTruthy();
    expect(
      screen.getByTestId("account-review-account-choice-sheet")
    ).toHaveStyle({ paddingBottom: 24 });
    expect(
      screen.getByTestId("account-review-account-choice-sheet")
    ).toHaveProp("accessibilityViewIsModal", true);
  });

  it("uses the existing currency/account sheet with fluid content width at 390 and larger layouts", () => {
    renderAccounts();
    const content = screen
      .UNSAFE_getAllByType(View)
      .find((node) => node.props.className === "w-full gap-3");
    expect(content).toBeDefined();
    expect(content?.props.className).not.toContain("max-w-[350px]");
    expect(
      screen.getByTestId("account-review-account-choice-sheet")
    ).toHaveStyle({
      paddingBottom: 24,
    });
  });

  it("retains long names, visible dark semantic tokens, and Arabic user data unchanged", async () => {
    mockLocale = "ar";
    await i18next.changeLanguage("ar");
    const original = getQnbCandidate(makeQnbChoiceCandidates(), "0007");
    const arLabel = "حساب يومي بنك QNB، EGP، ينتهي بـ0007";
    const longName = "حساب بنكي طويل جداً QNB Everyday and family";
    renderAccounts(
      makeAccountChoiceProps({
        contextSubtitle: ROW_CONTEXT_AR,
        scopeDisclosure: "سيُغيَّر حساب هذه المعاملة فقط.",
        candidateOptions: [
          {
            ...original,
            displayName: longName,
            accessibilityLabel: arLabel,
          },
        ],
      })
    );
    expect(screen.getByText(ROW_CONTEXT_AR)).toBeTruthy();
    expect(screen.getByText(longName).props.numberOfLines).not.toBe(1);
    expect(screen.getByLabelText(arLabel)).toBeTruthy();
    expect(
      screen.getByTestId("account-review-account-choice-sheet")
    ).toHaveProp("className", expect.stringContaining("dark:"));
    // RTL mirroring, real focus, 340/390/600 dp and font1.35 are owner device gates.
  });
});

describe("T035 R1-11/R3-03 — unconfirmed currency conflict", () => {
  it("shows EGP/USD unselected and keeps Use disabled without picking preferred EGP", () => {
    const props = makeCurrencyConflictProps();
    const onUseSelected = jest.fn();
    renderConflict({ ...props, onUseSelected });
    expect(
      screen.getByTestId("account-review-currency-conflict-sheet")
    ).toBeTruthy();
    expect(
      screen.getAllByTestId("account-review-currency-option")
    ).toHaveLength(2);
    for (const option of props.candidateOptions) {
      expect(screen.getByLabelText(option.accessibilityLabel)).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected: false })
      );
    }
    const use = screen.getByTestId("account-review-currency-use");
    expect(use).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(use);
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("choosing one proposed currency only stages that candidate", () => {
    const onSelectCandidate = jest.fn();
    const onUseSelected = jest.fn();
    renderConflict(
      makeCurrencyConflictProps({ onSelectCandidate, onUseSelected })
    );
    fireEvent.press(screen.getByLabelText("US Dollar, USD"));
    expect(onSelectCandidate).toHaveBeenCalledWith("USD");
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("requires explicit Use after controlled selection, without changing another currency", () => {
    const onUseSelected = jest.fn();
    const onChooseAnother = jest.fn();
    renderConflict(
      makeCurrencyConflictProps({
        selectedCandidateCode: "USD",
        canUseSelection: true,
        onUseSelected,
        onChooseAnother,
      })
    );
    expect(screen.getByLabelText("US Dollar, USD")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
    fireEvent.press(screen.getByTestId("account-review-currency-use"));
    expect(onUseSelected).toHaveBeenCalledTimes(1);
    expect(onChooseAnother).not.toHaveBeenCalled();
  });

  it("cancel and Android Back preserve the unconfirmed state without currency Use", () => {
    const close = jest.fn();
    const use = jest.fn();
    const view = render(
      <CurrencyConfirmationSheet
        {...makeCurrencyConflictProps({ onClose: close, onUseSelected: use })}
      />
    );
    fireEvent.press(screen.getByLabelText("Close currency confirmation"));
    expect(close).toHaveBeenCalledTimes(1);
    expect(use).not.toHaveBeenCalled();
    view.unmount();
    renderConflict(
      makeCurrencyConflictProps({ onClose: close, onUseSelected: use })
    );
    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose");
    expect(close).toHaveBeenCalledTimes(2);
    expect(use).not.toHaveBeenCalled();
  });

  it("Choose another dispatches only its mode-change callback, never accepts EGP/USD", () => {
    const onChooseAnother = jest.fn();
    const onUseSelected = jest.fn();
    renderConflict(
      makeCurrencyConflictProps({ onChooseAnother, onUseSelected })
    );
    fireEvent.press(screen.getByTestId("account-review-currency-another"));
    expect(onChooseAnother).toHaveBeenCalledTimes(1);
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("uses the transaction-specific human explanation, never parsing jargon", () => {
    renderConflict();
    expect(screen.getByText(ROW_CONTEXT_EN)).toBeTruthy();
    expect(screen.queryByText(/parser|parse|parsing/i)).toBeNull();
  });

  it("blocks Use while pending a command and does not render when hidden", () => {
    const onUseSelected = jest.fn();
    const p = makeCurrencyConflictProps({
      selectedCandidateCode: "EGP",
      canUseSelection: true,
      isBusy: true,
      onUseSelected,
    });
    const view = render(<CurrencyConfirmationSheet {...p} />);
    const use = screen.getByTestId("account-review-currency-use");
    expect(use).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    fireEvent.press(use);
    expect(onUseSelected).not.toHaveBeenCalled();
    view.rerender(<CurrencyConfirmationSheet {...p} visible={false} />);
    expect(
      screen.queryByTestId("account-review-currency-conflict-sheet")
    ).toBeNull();
  });
});

describe("T035 T037 — real existing CurrencyPicker nullable/additive regression", () => {
  it("preserves the existing concrete EGP caller's highlight and direct selection contract", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    renderCurrencyPicker("EGP", { onSelect, onClose });
    expect(screen.getByTestId("currency-selected-checkmark-EGP")).toBeTruthy();
    expect(screen.getByTestId("currency-row-highlight-EGP")).toBeTruthy();
    expect(screen.queryByTestId("currency-selected-checkmark-USD")).toBeNull();
    fireEvent.press(screen.getByTestId("currency-code-row-USD"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("USD");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders no ISO checkmark or highlight with a true null currency", () => {
    renderCurrencyPicker(null);
    for (const code of ["EGP", "USD"]) {
      expect(screen.getByTestId("currency-code-" + code)).toBeTruthy();
      expect(
        screen.queryByTestId("currency-selected-checkmark-" + code)
      ).toBeNull();
      expect(screen.queryByTestId("currency-row-highlight-" + code)).toBeNull();
    }
  });

  it("does not fabricate a subtitle or account when context is absent", () => {
    renderCurrencyPicker(null);
    expect(screen.queryByTestId("account-review-currency-context")).toBeNull();
    expect(screen.queryByText(ROW_CONTEXT_EN)).toBeNull();
  });

  it("places the approved contextual subtitle in the existing picker, not a new modal", () => {
    renderCurrencyPicker(null, { contextSubtitle: ROW_CONTEXT_EN });
    expect(
      screen.getByTestId("account-review-existing-currency-picker")
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-review-currency-context")
    ).toHaveTextContent(ROW_CONTEXT_EN);
    expect(
      screen.getByPlaceholderText("search_currency_name_code")
    ).toBeTruthy();
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((m) => m.props.visible === true)
    ).toHaveLength(1);
  });

  it("keeps the existing searchable ISO/code list and allowed-currency restriction", () => {
    renderCurrencyPicker(null, { contextSubtitle: ROW_CONTEXT_EN });
    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency_name_code"),
      "usd"
    );
    expect(screen.getByTestId("currency-code-USD")).toHaveTextContent("USD");
    expect(screen.queryByTestId("currency-code-AED")).toBeNull();
    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency_name_code"),
      "EGP"
    );
    expect(screen.getByTestId("currency-code-EGP")).toHaveTextContent("EGP");
  });

  it("filters by the existing English currency name without changing picker chrome", () => {
    renderCurrencyPicker(null);
    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency_name_code"),
      "Egyptian Pound"
    );
    expect(screen.getByText("Egyptian Pound")).toBeTruthy();
    expect(screen.getByTestId("currency-code-EGP")).toBeTruthy();
  });

  it("retains the actual Arabic name search and localized review context", async () => {
    mockLocale = "ar";
    await i18next.changeLanguage("ar");
    renderCurrencyPicker(null, { contextSubtitle: ROW_CONTEXT_AR });
    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency_name_code"),
      "الدولار الأمريكي"
    );
    expect(screen.getByText("الدولار الأمريكي")).toBeTruthy();
    expect(screen.getByTestId("currency-code-USD")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-currency-context")
    ).toHaveTextContent(ROW_CONTEXT_AR);
  });

  it("accepts only the explicitly tapped currency with the original direct callback", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    renderCurrencyPicker(null, {
      onSelect,
      onClose,
      contextSubtitle: ROW_CONTEXT_EN,
    });
    fireEvent.press(screen.getByTestId("currency-code-row-USD"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("USD");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Android Back cancels unconfirmed currency without invoking onSelect", () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    renderCurrencyPicker(null, { onSelect, onClose });
    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the existing modal bottom inset once without fixed navigation bars", () => {
    renderCurrencyPicker(null);
    // Query the actual host View, not the composite View component wrapper.
    const sheets = screen.getAllByTestId("currency-picker-sheet");
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0];
    if (sheet === undefined)
      throw new Error("Expected the real existing picker sheet");
    expect(sheet).toHaveProp(
      "className",
      expect.stringContaining("rounded-t-[32px]")
    );
    expect(sheet).toHaveStyle({ paddingBottom: 24 });
  });
});

describe("T035 — conflict/picker parent mode transition", () => {
  it("stages a conflict currency in the parent and resolves only after explicit Use", () => {
    const onResolved = jest.fn();
    render(<ControlledCurrencyJourney onResolved={onResolved} />);
    fireEvent.press(screen.getByLabelText("US Dollar, USD"));
    expect(onResolved).not.toHaveBeenCalled();
    const use = screen.getByTestId("account-review-currency-use");
    expect(use).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: false })
    );
    fireEvent.press(use);
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith("USD");
    expect(
      screen.queryByTestId("account-review-currency-conflict-sheet")
    ).toBeNull();
  });

  it("closes the conflict sheet before showing only the existing picker", () => {
    const onResolved = jest.fn();
    render(<ControlledCurrencyJourney onResolved={onResolved} />);
    expect(
      screen.getByTestId("account-review-currency-conflict-sheet")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("account-review-existing-currency-picker")
    ).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-currency-another"));
    expect(
      screen.queryByTestId("account-review-currency-conflict-sheet")
    ).toBeNull();
    expect(
      screen.getByTestId("account-review-existing-currency-picker")
    ).toBeTruthy();
    expect(
      screen.UNSAFE_getAllByType(Modal).filter((m) => m.props.visible === true)
    ).toHaveLength(1);
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("chooses a different currency through the existing search/list and returns once", () => {
    const onResolved = jest.fn();
    render(<ControlledCurrencyJourney onResolved={onResolved} />);
    fireEvent.press(screen.getByTestId("account-review-currency-another"));
    expect(screen.getByText(ROW_CONTEXT_EN)).toBeTruthy();
    expect(screen.queryByTestId("currency-selected-checkmark-EGP")).toBeNull();
    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency_name_code"),
      "USD"
    );
    fireEvent.press(screen.getByTestId("currency-code-row-USD"));
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith("USD");
    expect(
      screen.queryByTestId("account-review-existing-currency-picker")
    ).toBeNull();
    // T034/T036 prove true row-only currency interpretation and unchanged amount.
  });

  it("cancels the existing picker without confirming a currency or an account", () => {
    const onResolved = jest.fn();
    render(<ControlledCurrencyJourney onResolved={onResolved} />);
    fireEvent.press(screen.getByTestId("account-review-currency-another"));
    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose");
    expect(onResolved).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("account-review-existing-currency-picker")
    ).toBeNull();
  });

  it("does not make a new modal or a new Save path when the conflict is closed", () => {
    const onResolved = jest.fn();
    render(<ControlledCurrencyJourney onResolved={onResolved} />);
    fireEvent(screen.UNSAFE_getByType(Modal), "requestClose");
    expect(
      screen.queryByTestId("account-review-currency-conflict-sheet")
    ).toBeNull();
    expect(
      screen.queryByTestId("account-review-existing-currency-picker")
    ).toBeNull();
    expect(onResolved).not.toHaveBeenCalled();
  });
});

describe("#395 accepted review context and modal revision gates", () => {
  it("R3 combined shows currency issue without duplicating the pending shared-account blocker", () => {
    const session = makeDefaultInfoSession("r3-combined-en");
    const distinctNeedsReviewCount = session.rows.filter(
      (row) => row.reviewReasons.length > 0
    ).length;
    const issues = presentReviewIssues(
      session.rows,
      distinctNeedsReviewCount,
      "en"
    );
    expect(issues.map((issue) => issue.key)).toContain(
      "account_review_issue_currency"
    );
    expect(issues.map((issue) => issue.key)).not.toContain(
      "account_review_issue_account"
    );
    expect(distinctNeedsReviewCount).toBe(5);
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

describe("#395 owner recovery: account drafts and currency consent", () => {
  it("empty source offers a typed draft, never invokes existing account Use", () => {
    const onSubmit = jest.fn();
    const onUseSelected = jest.fn();
    renderAccounts(
      makeManualDraftChoiceProps("BANK", onSubmit, {
        onUseSelected,
      })
    );
    expect(screen.queryByTestId("account-review-account-use")).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-create-draft"));
    expect(
      within(
        screen.getByTestId("account-review-manual-draft-currency")
      ).getByText("EGP", { exact: true })
    ).toBeTruthy();
    expect(
      screen.getByTestId("account-review-manual-draft-submit")
    ).toBeDisabled();
    fireEvent.changeText(
      screen.getByTestId("account-review-manual-draft-name"),
      "New bank"
    );
    fireEvent.press(screen.getByTestId("account-review-manual-draft-type"));
    fireEvent.press(
      screen.getByTestId("account-review-manual-draft-type-option")
    );
    fireEvent.press(screen.getByTestId("account-review-manual-draft-submit"));
    expect(onSubmit).toHaveBeenCalledWith({ name: "New bank", type: "BANK" });
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("missing ATM Cash offers Cash draft; group replacement retains Edit/Keep", () => {
    const onEditExistingDraft = jest.fn();
    const onCash = jest.fn();
    const r = render(
      <AccountChoiceSheet {...makeManualDraftChoiceProps("CASH", onCash)} />
    );
    fireEvent.press(screen.getByTestId("account-review-create-draft"));
    fireEvent.press(screen.getByTestId("account-review-manual-draft-cancel"));
    expect(onCash).not.toHaveBeenCalled();
    r.rerender(
      <AccountChoiceSheet
        {...makeGroupChoiceProps({
          candidateOptions: [],
          onEditExistingDraft,
        })}
      />
    );
    expect(screen.queryByTestId("account-review-create-draft")).toBeNull();
    fireEvent.press(screen.getByTestId("account-review-edit-existing-draft"));
    expect(onEditExistingDraft).toHaveBeenCalledTimes(1);
  });

  it("a chosen account and its USD currency require clear confirmation; Back commits nothing", () => {
    const onUseSelected = jest.fn();
    renderAccounts(makeExplicitCurrencyConsentChoiceProps(onUseSelected));
    fireEvent.press(screen.getByTestId("account-review-account-use"));
    expect(
      screen.getByTestId("account-review-confirm-account-currency")
    ).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getByText("Not confirmed")).toBeTruthy();
    expect(onUseSelected).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("account-review-confirm-account-back"));
    expect(onUseSelected).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("account-review-account-use"));
    fireEvent.press(screen.getByTestId("account-review-confirm-account-use"));
    expect(onUseSelected).toHaveBeenCalledTimes(1);
  });
});
