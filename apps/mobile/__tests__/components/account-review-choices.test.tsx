import { AccountIdentityMark } from "@/components/institutions/AccountIdentityMark";
/** #395 focused existing-account and explicit currency-choice regressions. */
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import i18next from "i18next";
import React from "react";
import { KeyboardAvoidingView, Modal, ScrollView, View } from "react-native";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import { CurrencyPicker } from "@/components/currency/CurrencyPicker";
import {
  AccountChoiceSheet,
  AccountChoiceLinkedRowsContext,
} from "@/components/transaction-review/AccountChoiceSheet";
import enTransactions from "@/locales/en/transactions.json";
import arTransactions from "@/locales/ar/transactions.json";
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
// The real notice component uses the app's locale hook; the existing i18n
// stub and this lightweight test locale must stay in the same language.
jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ language: mockLocale, isRTL: mockLocale === "ar" }),
}));
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

beforeAll(async (): Promise<void> => {
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    ns: ["common", "transactions"],
    defaultNS: "common",
    resources: {
      en: { common: enCommon, transactions: enTransactions },
      ar: { common: arCommon, transactions: arTransactions },
    },
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
    const visibleModals = screen
      .UNSAFE_getAllByType(Modal)
      .filter((modal) => modal.props.visible === true);
    expect(visibleModals).toHaveLength(1);
    const modal = visibleModals[0];
    if (!modal) throw new Error("Expected the single active account chooser");
    fireEvent(modal, "requestClose");
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

  it("group chooser discloses exact linked transaction names and amounts before Use", () => {
    const onUseSelected = jest.fn();
    const option = getQnbCandidate(makeQnbChoiceCandidates(), "0007");
    render(
      <AccountChoiceLinkedRowsContext.Provider
        value={[
          { rowId: "row-1", title: "Game", amountLabel: "-50 EGP" },
          { rowId: "row-3", title: "Groceries", amountLabel: "-180 EGP" },
        ]}
      >
        <AccountChoiceSheet
          {...makeGroupChoiceProps({
            selectedCandidateId: option.id,
            canUseSelection: true,
            onUseSelected,
          })}
        />
      </AccountChoiceLinkedRowsContext.Provider>
    );
    const linked = screen.getByTestId("account-review-account-linked-rows");
    const rows = within(linked);
    expect(rows.getByText("Game")).toBeTruthy();
    expect(rows.getByText("-50 EGP")).toBeTruthy();
    expect(rows.getByText("Groceries")).toBeTruthy();
    expect(rows.getByText("-180 EGP")).toBeTruthy();
    expect(linked).toHaveTextContent("Game-50 EGPGroceries-180 EGP");
    expect(onUseSelected).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("account-review-account-use"));
    expect(onUseSelected).toHaveBeenCalledTimes(1);
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

  it("keeps the actual account chooser, candidates and one inline bottom inset", () => {
    renderAccounts();
    const sheet = screen.getByTestId("account-review-account-choice-sheet");
    expect(sheet).toHaveStyle({ paddingBottom: 24 });
    expect(sheet).toHaveProp("accessibilityViewIsModal", true);
    expect(screen.getAllByTestId("account-review-account-option")).toHaveLength(
      3
    );
    expect(screen.getByLabelText("Close account chooser")).toBeTruthy();
    // Fluid width, spacing and modal chrome require owner-device visual QA;
    // NativeWind CSS is not registered in this isolated Jest suite.
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
    ).toHaveStyle({ paddingBottom: 24 });
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
    expect(sheet).toHaveStyle({ paddingBottom: 24 });
    expect(screen.getByTestId("currency-code-row-EGP")).toBeTruthy();
    expect(screen.getByTestId("currency-code-row-USD")).toBeTruthy();
    // Rounded-corner chrome is an owner-device visual QA check.
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
    expect(screen.getByText("Create account")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-create-draft"));
    expect(screen.getByText("New account")).toBeTruthy();
    expect(screen.queryByText(/\bdraft\b/i)).toBeNull();
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
    expect(onSubmit).toHaveBeenCalledWith({
      name: "New bank",
      type: "BANK",
      currency: "EGP",
    });
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

  it("one final CTA names account and USD, dispatches once without a second confirmation", () => {
    const onUseSelected = jest.fn();
    const onClose = jest.fn();
    renderAccounts({
      ...makeExplicitCurrencyConsentChoiceProps(onUseSelected),
      onClose,
    });
    const finalAction = screen.getByTestId("account-review-account-use");
    expect(finalAction).toHaveProp("accessibilityRole", "button");
    expect(finalAction).toHaveProp("accessibilityLabel", "Use account — USD");
    expect(screen.getByText("QNB Everyday")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-account-currency-no-conversion")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("account-review-confirm-account-currency")
    ).toBeNull();
    fireEvent.press(finalAction);
    expect(onUseSelected).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId("account-review-confirm-account-use")
    ).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("new account uses the shared searchable picker with one visible modal and retains form state", () => {
    const onSubmit = jest.fn();
    const onUseSelected = jest.fn();
    renderAccounts(
      makeManualDraftChoiceProps("BANK", onSubmit, {
        onUseSelected,
        draftCreation: {
          lockedCurrencyLabel: "",
          initialCurrency: null,
          currencyOptions: ["EUR"],
          typeOptions: [{ id: "BANK", label: "Bank" }],
          onSubmit,
        },
      })
    );
    fireEvent.press(screen.getByTestId("account-review-create-draft"));
    fireEvent.changeText(
      screen.getByTestId("account-review-manual-draft-name"),
      "Travel"
    );
    fireEvent.press(screen.getByTestId("account-review-manual-draft-type"));
    fireEvent.press(
      screen.getByTestId("account-review-manual-draft-type-option")
    );
    expect(
      screen.getByTestId("account-review-manual-draft-submit")
    ).toBeDisabled();
    const currency = screen.getByTestId("account-review-manual-draft-currency");
    expect(currency).toHaveProp("accessibilityRole", "button");
    expect(currency).toHaveProp(
      "accessibilityLabel",
      "Currency, Choose currency"
    );
    fireEvent.press(currency);
    const picker = screen.getByTestId(
      "account-review-manual-draft-currency-picker"
    );
    expect(picker).toHaveProp("visible", true);
    expect(
      screen
        .UNSAFE_getAllByType(Modal)
        .filter((modal) => modal.props.visible === true)
    ).toHaveLength(1);
    fireEvent.changeText(
      screen.getByPlaceholderText("search_currency_name_code"),
      "EUR"
    );
    expect(screen.getByTestId("currency-code-row-EUR")).toBeTruthy();
    expect(screen.queryByTestId("currency-code-row-USD")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("currency-code-row-EUR"));
    expect(
      screen.getByTestId("account-review-manual-draft-currency")
    ).toHaveProp("accessibilityLabel", "Currency, EUR");
    expect(screen.getByTestId("account-review-manual-draft-name")).toHaveProp(
      "value",
      "Travel"
    );
    const typeDropdown = screen.getByTestId("account-review-manual-draft-type");
    expect(typeDropdown).toHaveProp("accessibilityRole", "button");
    expect(within(typeDropdown).getByText("Bank")).toBeTruthy();
    expect(
      screen
        .UNSAFE_getAllByType(Modal)
        .filter((modal) => modal.props.visible === true)
    ).toHaveLength(1);
    expect(
      screen.queryByTestId("account-review-confirm-account-currency")
    ).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onUseSelected).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("account-review-manual-draft-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "Travel",
      type: "BANK",
      currency: "EUR",
    });
    expect(onUseSelected).not.toHaveBeenCalled();
  });

  it("picker Back and form Cancel preserve the unsaved form until explicit dismissal", () => {
    const onSubmit = jest.fn();
    const onUseSelected = jest.fn();
    renderAccounts(
      makeManualDraftChoiceProps("BANK", onSubmit, { onUseSelected })
    );
    fireEvent.press(screen.getByTestId("account-review-create-draft"));
    fireEvent.changeText(
      screen.getByTestId("account-review-manual-draft-name"),
      "New bank"
    );
    fireEvent.press(screen.getByTestId("account-review-manual-draft-type"));
    fireEvent.press(
      screen.getByTestId("account-review-manual-draft-type-option")
    );
    fireEvent.press(screen.getByTestId("account-review-manual-draft-currency"));
    expect(
      screen.getByTestId("account-review-manual-draft-currency-picker")
    ).toHaveProp("visible", true);
    fireEvent(
      screen.getByTestId("account-review-manual-draft-currency-picker"),
      "requestClose"
    );
    expect(screen.getByTestId("account-review-manual-draft-name")).toHaveProp(
      "value",
      "New bank"
    );
    const typeDropdown = screen.getByTestId("account-review-manual-draft-type");
    expect(typeDropdown).toHaveProp("accessibilityRole", "button");
    expect(within(typeDropdown).getByText("Bank")).toBeTruthy();
    expect(
      screen.getByTestId("account-review-manual-draft-currency")
    ).toHaveProp("accessibilityLabel", "Currency, EGP");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("account-review-manual-draft-cancel"));
    expect(
      screen.getByTestId("account-review-account-choice-sheet")
    ).toBeTruthy();
    expect(screen.queryByTestId("account-review-manual-draft-name")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onUseSelected).not.toHaveBeenCalled();
  });
});

it.each(["en", "ar"] as const)(
  "uses the filled shared selected-account treatment in %s",
  async (language) => {
    mockLocale = language;
    await i18next.changeLanguage(language);
    const props = makeAccountChoiceProps();
    const candidate = getQnbCandidate(props.candidateOptions, "9221");
    renderAccounts({ ...props, selectedCandidateId: candidate.id });
    const option = screen.getByLabelText(candidate.accessibilityLabel);
    expect(option).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
    expect(within(option).getByText(candidate.displayName)).toHaveProp(
      "className",
      expect.stringContaining("text-white")
    );
    const background = option
      .findAllByType(View)
      .find((view) => view.props.pointerEvents === "none");
    expect(background?.props.className).toContain("bg-nileGreen-600");
    expect(option.findByType(AccountIdentityMark).props.surfaceContext).toBe(
      "colored-card"
    );
    expect(background?.props.className).not.toContain(
      "dark:bg-nileGreen-900/20"
    );
  }
);
