/**
 * #395 R2: real suggested-account form with native layout/keyboard leaves stubbed.
 * No reducer, account command, financial Save, modal or form implementation mocks.
 * Actual keyboard occlusion and visual contrast remain owner-device checks.
 */
import {
  act,
  fireEvent,
  fireEventAsync,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import {
  changeLanguage,
  init as initializeI18next,
  use as registerI18nextPlugin,
} from "i18next";
import { initReactI18next } from "react-i18next";
import React from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  type KeyboardEvent,
} from "react-native";
import { EditSuggestedAccountSheet } from "@/components/transaction-review/EditSuggestedAccountSheet";
import type { ReviewFeedbackBoundary } from "@/hooks/useReviewNotice";

jest.mock("@/hooks/useModalBottomInset", () => ({
  useModalBottomInset: (): number => 28,
}));

let mockLanguage: "en" | "ar" = "en";
jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: "en" | "ar" } => ({
    language: mockLanguage,
  }),
}));

// Keep the real form and buttons; replace only the native icon glyph renderer
// so the explicitly selected check can be observed without expo-font.
jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: {
    readonly name: string;
    readonly testID?: string;
  }): React.JSX.Element => {
    const ReactRuntime = jest.requireActual<typeof import("react")>("react");
    const native =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactRuntime.createElement(
      native.Text,
      { testID: props.testID },
      props.name
    );
  },
}));

type SheetProps = React.ComponentProps<typeof EditSuggestedAccountSheet>;
function makeProps(overrides: Partial<SheetProps> = {}): SheetProps {
  return {
    visible: true,
    groupId: "00000000-0000-4000-8000-000000000451",
    groupName: "QNB",
    currentTypeOptionId: "BANK",
    allowedTypeOptions: [
      { id: "BANK", label: "Bank" },
      { id: "DIGITAL_WALLET", label: "Digital wallet" },
    ],
    lockedCurrencyLabel: "EGP",
    identitySummary: "QNB · 0007",
    linkedCount: 3,
    canSubmit: true,
    isBusy: false,
    validationMessage: null,
    onSubmit: jest.fn<void, [{ name: string; typeOptionId: string }]>(),
    onReplace: jest.fn<void, []>(),
    onCancel: jest.fn<void, []>(),
    ...overrides,
  };
}

function layout(
  width: number,
  height: number,
  y = 0
): {
  readonly nativeEvent: {
    readonly layout: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  };
  readonly persist: () => void;
} {
  return {
    nativeEvent: { layout: { x: 0, y, width, height } },
    persist: (): void => undefined,
  };
}

/** KAV processes onLayout asynchronously; observe its settled height. */
async function resizeKeyboardArea(height: number): Promise<void> {
  await fireEventAsync(
    screen.getByTestId("account-review-group-edit-keyboard-area"),
    "layout",
    layout(390, height)
  );
}

beforeAll(async (): Promise<void> => {
  registerI18nextPlugin(initReactI18next);
  await initializeI18next({
    lng: "en",
    fallbackLng: "en",
    ns: ["transactions", "common"],
    defaultNS: "transactions",
    resources: {
      en: {
        transactions: {
          account_review_group_edit_title: "Edit suggested account",
          account_review_group_edit_cancel: "Cancel",
          account_review_group_edit_submit: "Confirm account",
          account_review_group_name: "Account name",
          account_review_group_type: "Account type",
          account_review_group_locked_currency: "Currency",
          account_review_group_linked: "linked",
        },
      },
      ar: {
        transactions: {
          account_review_group_edit_cancel: "إلغاء",
          account_review_group_edit_submit: "تأكيد الحساب",
        },
      },
    },
    interpolation: { escapeValue: false },
  });
});

let platformReplacement: ReturnType<typeof jest.replaceProperty> | null = null;
beforeEach((): void => {
  // The real keyboard-height and focus-reveal branch is Android-specific.
  platformReplacement = jest.replaceProperty(Platform, "OS", "android");
});
afterEach(async (): Promise<void> => {
  platformReplacement?.restore();
  platformReplacement = null;
  mockLanguage = "en";
  await changeLanguage("en");
  jest.restoreAllMocks();
});

describe("#395 R2 suggested-account form keyboard, type and real content fit", () => {
  it("marks the current account type visibly as well as accessibly, and moves the marker with selection", () => {
    const props = makeProps();
    render(<EditSuggestedAccountSheet {...props} />);
    fireEvent.press(screen.getByTestId("account-review-group-edit-type"));
    const bank = screen.getByTestId(
      "account-review-group-edit-type-option-BANK"
    );
    const wallet = screen.getByTestId(
      "account-review-group-edit-type-option-DIGITAL_WALLET"
    );
    expect(bank).toHaveProp("accessibilityState", { checked: true });
    expect(
      within(bank).getByTestId(
        "account-review-group-edit-selected-type-check",
        {
          includeHiddenElements: true,
        }
      )
    ).toHaveTextContent("checkmark");
    expect(wallet).toHaveProp("accessibilityState", { checked: false });
    expect(
      screen.getByTestId("account-review-group-edit-selected-type-check", {
        includeHiddenElements: true,
      })
    ).toHaveTextContent("checkmark");

    fireEvent.press(wallet);
    fireEvent.press(screen.getByTestId("account-review-group-edit-type"));
    expect(
      screen.getByTestId("account-review-group-edit-type-option-BANK")
    ).toHaveProp("accessibilityState", { checked: false });
    const chosenWallet = screen.getByTestId(
      "account-review-group-edit-type-option-DIGITAL_WALLET"
    );
    expect(chosenWallet).toHaveProp("accessibilityState", { checked: true });
    expect(
      within(chosenWallet).getByTestId(
        "account-review-group-edit-selected-type-check",
        { includeHiddenElements: true }
      )
    ).toHaveTextContent("checkmark");
    expect(
      within(
        screen.getByTestId("account-review-group-edit-type-option-BANK")
      ).queryByTestId("account-review-group-edit-selected-type-check", {
        includeHiddenElements: true,
      })
    ).toBeNull();
    const currencyTrigger = screen.getByTestId(
      "account-review-group-edit-currency"
    );
    expect(currencyTrigger).toHaveProp("accessibilityRole", "button");
    expect(currencyTrigger).toHaveProp("accessibilityState", {
      disabled: false,
    });
    expect(within(currencyTrigger).getByText("EGP")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(props.onSubmit).toHaveBeenCalledWith({
      name: "QNB",
      typeOptionId: "DIGITAL_WALLET",
      currency: "EGP",
    });
  });

  it("limits height once to 80% of the unobstructed usable viewport and the real KAV area", async () => {
    const props = makeProps();
    render(<EditSuggestedAccountSheet {...props} />);
    const sheet = screen.getByTestId("account-review-group-edit-sheet");
    await resizeKeyboardArea(360);
    expect(sheet).toHaveStyle({
      maxHeight: Math.min(
        Math.max(0, (Dimensions.get("window").height - 28) * 0.8),
        360
      ),
      paddingBottom: 28,
    });
    expect(screen.getByTestId("account-review-group-edit-name")).toBeTruthy();
    expect(screen.getByTestId("account-review-group-edit-submit")).toBeTruthy();
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("reveals measured focused name after scroll-viewport shrink and keyboardDidShow, never a guessed scrollTo(0)", () => {
    const scrollSpy = jest
      .spyOn(ScrollView.prototype, "scrollTo")
      .mockImplementation(() => {});
    const keyboard: {
      notifyShown?: (event: KeyboardEvent) => void;
      ownSubscription?: ReturnType<typeof Keyboard.addListener>;
    } = {};
    const originalAddListener = Keyboard.addListener.bind(Keyboard);
    jest
      .spyOn(Keyboard, "addListener")
      .mockImplementation((event, callback) => {
        const subscription = originalAddListener(event, callback);
        // The form's focused-name reveal has no event argument; KAV's native
        // keyboard listener has one. Observe only the form's own subscription.
        if (event === "keyboardDidShow" && callback.length === 0) {
          keyboard.notifyShown = callback;
          keyboard.ownSubscription = subscription;
        }
        return subscription;
      });
    const view = render(<EditSuggestedAccountSheet {...makeProps()} />);
    const name = screen.getByTestId("account-review-group-edit-name");
    fireEvent(name, "focus");
    expect(scrollSpy).not.toHaveBeenCalled();
    fireEvent(
      screen.getByTestId("account-review-group-edit-name-bounds"),
      "layout",
      layout(300, 72, 160)
    );
    expect(scrollSpy).not.toHaveBeenCalled();
    fireEvent(
      screen.getByTestId("account-review-group-edit-scroll"),
      "layout",
      layout(330, 98)
    );
    expect(scrollSpy).toHaveBeenCalledWith({ y: 146, animated: true });
    scrollSpy.mockClear();
    const notify = keyboard.notifyShown;
    const ownSubscription = keyboard.ownSubscription;
    if (!notify || !ownSubscription)
      throw new Error("Android focused-name keyboardDidShow listener missing");
    const removeSpy = jest.spyOn(ownSubscription, "remove");
    const shown: KeyboardEvent = {
      duration: 250,
      easing: "keyboard",
      endCoordinates: { screenX: 0, screenY: 480, width: 390, height: 320 },
    };
    act(() => notify(shown));
    expect(scrollSpy).toHaveBeenCalledWith({ y: 146, animated: true });
    fireEvent(name, "blur");
    scrollSpy.mockClear();
    fireEvent(
      screen.getByTestId("account-review-group-edit-scroll"),
      "layout",
      layout(330, 85)
    );
    expect(scrollSpy).not.toHaveBeenCalled();
    view.unmount();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps modal feedback and field validation directly below the fixed header, outside the scroll body", () => {
    const dismiss = jest.fn<void, ["page" | "modal"]>();
    const reviewFeedback: ReviewFeedbackBoundary = {
      pageNotice: null,
      modalNotice: {
        tone: "warning",
        title: "Cannot confirm this account",
        message: "Check the account details before retrying.",
      },
      reportFailure: jest.fn(),
      showNotice: jest.fn(),
      dismiss,
    };
    render(
      <EditSuggestedAccountSheet
        {...makeProps({
          reviewFeedback,
          validationMessage: "Account name must be different",
        })}
      />
    );
    const fixedHeader = screen.getByTestId(
      "account-review-group-edit-fixed-header"
    );
    const scrollBody = screen.getByTestId("account-review-group-edit-scroll");
    expect(
      within(fixedHeader).getByTestId("review-inline-notice-modal")
    ).toBeTruthy();
    expect(
      within(fixedHeader).getByText("Account name must be different")
    ).toBeTruthy();
    expect(
      within(scrollBody).queryByTestId("review-inline-notice-modal")
    ).toBeNull();
    expect(
      within(scrollBody).queryByText("Account name must be different")
    ).toBeNull();
    fireEvent.press(screen.getByTestId("review-inline-notice-dismiss-modal"));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("modal");
    expect(screen.getByTestId("account-review-group-edit-submit")).toBeTruthy();
  });

  it("keeps notice/validation fixed and reveals name/footer within one form scroller when keyboard space is constrained", async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, "scrollTo")
      .mockImplementation(() => {});
    const onSubmit = jest.fn<void, [{ name: string; typeOptionId: string }]>();
    const feedback: ReviewFeedbackBoundary = {
      pageNotice: null,
      modalNotice: {
        tone: "warning",
        title: "Check this account",
        message: "The account is not ready. Check the details before retrying.",
      },
      reportFailure: jest.fn(),
      showNotice: jest.fn(),
      dismiss: jest.fn(),
    };
    render(
      <EditSuggestedAccountSheet
        {...makeProps({
          onSubmit,
          reviewFeedback: feedback,
          validationMessage: "Name conflicts with another account",
        })}
      />
    );

    await resizeKeyboardArea(360);
    const sheet = screen.getByTestId("account-review-group-edit-sheet");
    expect(sheet).toHaveStyle({
      maxHeight: Math.min(
        Math.max(0, (Dimensions.get("window").height - 28) * 0.8),
        360
      ),
      paddingBottom: 28,
    });
    const fixed = screen.getByTestId("account-review-group-edit-fixed-header");
    const scroll = screen.getByTestId("account-review-group-edit-scroll");
    fireEvent(
      screen.getByTestId("account-review-group-edit-handle-region"),
      "layout",
      layout(390, 24)
    );
    fireEvent(fixed, "layout", layout(390, 224));
    fireEvent(
      screen.getByTestId("account-review-group-edit-footer-region"),
      "layout",
      layout(390, 92)
    );
    expect(
      within(fixed).getByTestId("review-inline-notice-modal")
    ).toBeTruthy();
    expect(
      within(fixed).getByText("Name conflicts with another account")
    ).toBeTruthy();
    expect(
      within(scroll).getByTestId("account-review-group-edit-footer")
    ).toBeTruthy();
    expect(
      within(scroll).getByTestId("account-review-group-edit-name")
    ).toBeTruthy();
    expect(
      within(scroll).queryByTestId("review-inline-notice-modal")
    ).toBeNull();

    fireEvent(scroll, "layout", layout(330, 84));
    fireEvent(
      screen.getByTestId("account-review-group-edit-name-bounds"),
      "layout",
      layout(300, 72, 130)
    );
    fireEvent(screen.getByTestId("account-review-group-edit-name"), "focus");
    expect(scrollTo).toHaveBeenCalledWith({ y: 130, animated: true });
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      name: "QNB",
      typeOptionId: "BANK",
      currency: "EGP",
    });
  });

  it("keeps Cancel and Confirm working after measuring localized footer labels", () => {
    const props = makeProps();
    render(<EditSuggestedAccountSheet {...props} />);
    const footer = screen.getByTestId("account-review-group-edit-footer");
    fireEvent(footer, "layout", layout(270, 108));
    fireEvent(
      screen.getByTestId("account-review-edit-cancel-measure", {
        includeHiddenElements: true,
      }),
      "layout",
      layout(100, 24)
    );
    fireEvent(
      screen.getByTestId("account-review-edit-submit-measure", {
        includeHiddenElements: true,
      }),
      "layout",
      layout(170, 24)
    );
    // This isolated Jest suite does not register NativeWind CSS; actual
    // stacking/visual alignment remains owner-device verification.
    expect(
      within(footer).getByTestId("account-review-group-edit-submit")
    ).not.toBeDisabled();
    fireEvent.press(screen.getByText("Cancel"));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("account-review-group-edit-submit"));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).toHaveBeenCalledWith({
      name: "QNB",
      typeOptionId: "BANK",
      currency: "EGP",
    });
  });
});
