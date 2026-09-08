import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo } from "react-native";

jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, Text, View } = jest.requireActual(
    "react-native"
  ) as typeof import("react-native");
  return {
    PageHeader: ({
      title,
      onBack,
    }: {
      readonly title: string;
      readonly onBack?: () => void;
    }) => (
      <View>
        <Text>{title}</Text>
        <Pressable testID="header-back" onPress={onBack}>
          <Text>Back</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

type Category =
  | "lost_stolen"
  | "destroyed_damaged"
  | "given_away"
  | "donated"
  | "other";
type Treatment = "write_off" | "external_transfer";

interface RateEvidenceDisplay {
  readonly role: "terminal_metal" | "terminal_purchase_currency";
  readonly valueLabel: string;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly sourceLabel: string;
  readonly observedLabel: string;
}

interface DisposeCopy {
  readonly title: string;
  readonly intro: string;
  readonly reasonLabel: string;
  readonly categoryLabels: Readonly<Record<Category, string>>;
  readonly otherTreatmentLabel: string;
  readonly treatmentLabels: Readonly<Record<Treatment, string>>;
  readonly dateLabel: string;
  readonly notesLabel: string;
  readonly notesOptional: string;
  readonly summaryTitle: string;
  readonly writeOffSummary: string;
  readonly externalTransferSummary: string;
  readonly activeOwnershipSummary: string;
  readonly historySummary: string;
  readonly noSaleMoneyOrAccountSummary: string;
  readonly noSaleProfitLossSummary: string;
  readonly rateEvidenceTitle: string;
  readonly rateRoles: Readonly<Record<string, string>>;
  readonly rateFreshness: Readonly<Record<string, string>>;
  readonly rateAcknowledgment: string;
  readonly rateAcknowledgmentRequired: string;
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly cancelLabel: string;
  readonly retryLabel: string;
  readonly loadError: string;
  readonly categoryRequired: string;
  readonly treatmentRequired: string;
  readonly dateRequired: string;
  readonly dateInvalid: string;
  readonly dateBeforeAcquisition: string;
  readonly submitFailed: string;
  readonly submitErrorMessages: Readonly<Record<string, string>>;
}

interface DisposeScreenProps {
  readonly holdingName: string;
  readonly copy: DisposeCopy;
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly category: Category | null;
  readonly otherTreatment: Treatment | null;
  readonly treatment: Treatment | null;
  readonly disposalDate: string;
  readonly notes: string;
  readonly rateEvidence?: readonly RateEvidenceDisplay[];
  readonly requiresRateAcknowledgment?: boolean;
  readonly rateAcknowledged?: boolean;
  readonly isLoading?: boolean;
  readonly isSubmitting?: boolean;
  readonly loadError?: string | null;
  readonly submitError?: string | null;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onCategoryChange: (category: Category) => void;
  readonly onOtherTreatmentChange: (treatment: Treatment) => void;
  readonly onDateChange: (value: string) => void;
  readonly onNotesChange: (value: string) => void;
  readonly onRateAcknowledgmentChange?: (acknowledged: boolean) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
  readonly onRetry: () => void;
}

interface DisposeScreenModule {
  readonly DisposeMetalHoldingScreen: React.ComponentType<DisposeScreenProps>;
  readonly DISPOSE_METAL_HOLDING_COPY_KEYS: Readonly<Record<string, unknown>>;
}

const copy: DisposeCopy = {
  title: "No longer in my possession: Wedding coin",
  intro: "Use this when you no longer own the holding and did not sell it.",
  reasonLabel: "Reason",
  categoryLabels: {
    lost_stolen: "Lost or stolen",
    destroyed_damaged: "Destroyed or damaged",
    given_away: "Given away",
    donated: "Donated",
    other: "Other",
  },
  otherTreatmentLabel: "Choose how to record this",
  treatmentLabels: {
    write_off: "Record a loss",
    external_transfer: "Record it as moved out",
  },
  dateLabel: "Date",
  notesLabel: "Notes",
  notesOptional: "Optional",
  summaryTitle: "What will happen",
  writeOffSummary: "Its purchase cost will be recorded as a loss.",
  externalTransferSummary: "It will leave your active metals.",
  activeOwnershipSummary: "This holding will no longer be active.",
  historySummary: "This change will appear in History.",
  noSaleMoneyOrAccountSummary: "There is no sale money or account change.",
  noSaleProfitLossSummary: "There is no profit or loss from a sale.",
  rateEvidenceTitle: "Rates kept with this record",
  rateRoles: {
    terminal_metal: "Metal rate",
    terminal_purchase_currency: "Currency rate",
  },
  rateFreshness: {
    fresh: "Fresh",
    stale: "Old",
    unknown: "Unknown",
  },
  rateAcknowledgment: "I understand these rates may be old or unknown",
  rateAcknowledgmentRequired: "Confirm the rate note to continue.",
  submitLabel: "Record change",
  pendingLabel: "Recording change",
  cancelLabel: "Cancel",
  retryLabel: "Try again",
  loadError: "We could not load this holding.",
  categoryRequired: "Choose a reason.",
  treatmentRequired: "Choose how to record Other.",
  dateRequired: "Choose a valid date.",
  dateInvalid: "Enter a real date that is not in the future.",
  dateBeforeAcquisition: "Choose a date on or after the purchase date.",
  submitFailed: "The change was not recorded. Try again.",
  submitErrorMessages: {
    holding_revision_conflict:
      "This holding changed elsewhere. Check its latest state and try again.",
    metal_holding_not_active: "This holding is no longer active.",
    metal_dispose_lifecycle_conflict:
      "This holding has a conflict to resolve first.",
  },
};

function loadScreen(): DisposeScreenModule {
  return jest.requireActual<DisposeScreenModule>(
    "@/components/metals/DisposeMetalHoldingScreen"
  );
}

function renderScreen(
  overrides: Partial<DisposeScreenProps> = {}
): DisposeScreenProps {
  const props: DisposeScreenProps = {
    holdingName: "Wedding coin",
    copy,
    locale: "en",
    isRtl: false,
    width: 390,
    fontScale: 1,
    bottomInset: 34,
    category: null,
    otherTreatment: null,
    treatment: null,
    disposalDate: "2026-09-05",
    notes: "",
    onCategoryChange: jest.fn(),
    onOtherTreatmentChange: jest.fn(),
    onDateChange: jest.fn(),
    onNotesChange: jest.fn(),
    onSubmit: jest.fn(),
    onRequestExit: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
  const { DisposeMetalHoldingScreen } = loadScreen();
  render(<DisposeMetalHoldingScreen {...props} />);
  return props;
}

describe("Dispose metal holding direct form", () => {
  it("renders exactly five whole-holding categories, optional notes, direct submit, and no review step", (): void => {
    const props = renderScreen();
    expect(
      screen.getByTestId("metal-holding-dispose-screen")
    ).toBeOnTheScreen();
    expect(screen.getByText(copy.intro)).toBeOnTheScreen();
    for (const category of Object.keys(copy.categoryLabels) as Category[]) {
      expect(screen.getByTestId(`dispose-category-${category}`)).toHaveProp(
        "accessibilityRole",
        "radio"
      );
    }
    expect(
      screen.getAllByTestId(
        /^dispose-category-(lost_stolen|destroyed_damaged|given_away|donated|other)$/
      )
    ).toHaveLength(5);
    expect(screen.getByText("Optional")).toBeOnTheScreen();
    expect(screen.queryByTestId("dispose-treatment-group")).toBeNull();
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
    fireEvent.press(screen.getByTestId("dispose-submit"));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows the treatment choice only for Other and exposes selected radio state", (): void => {
    const props = renderScreen({
      category: "other",
      otherTreatment: "write_off",
    });
    expect(screen.getByTestId("dispose-treatment-group")).toBeOnTheScreen();
    expect(screen.getByTestId("dispose-treatment-write_off")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true })
    );
    fireEvent.press(screen.getByTestId("dispose-treatment-external_transfer"));
    expect(props.onOtherTreatmentChange).toHaveBeenCalledWith(
      "external_transfer"
    );
  });

  it.each([
    ["lost_stolen", "writeOffSummary"],
    ["destroyed_damaged", "writeOffSummary"],
    ["given_away", "externalTransferSummary"],
    ["donated", "externalTransferSummary"],
  ] as const)(
    "shows exact affected-only live consequences for %s",
    (category, treatmentSummary): void => {
      const treatment =
        treatmentSummary === "writeOffSummary"
          ? "write_off"
          : "external_transfer";
      renderScreen({ category, treatment });
      expect(screen.getByTestId("dispose-live-summary")).toHaveProp(
        "consequenceOrder",
        [
          "reason",
          "treatment",
          "ownership",
          "sale-money-account",
          "sale-profit-loss",
          "history",
        ]
      );
      expect(screen.getByText(copy.categoryLabels[category])).toBeOnTheScreen();
      expect(screen.getByText(copy[treatmentSummary])).toBeOnTheScreen();
      expect(screen.getByText(copy.activeOwnershipSummary)).toBeOnTheScreen();
      expect(
        screen.getByText(copy.noSaleMoneyOrAccountSummary)
      ).toBeOnTheScreen();
      expect(screen.getByText(copy.noSaleProfitLossSummary)).toBeOnTheScreen();
      expect(screen.getByText(copy.historySummary)).toBeOnTheScreen();
    }
  );

  it("blocks duplicate pending submits, freezes fields, and owns the bottom inset once", (): void => {
    const props = renderScreen({
      category: "donated",
      isSubmitting: true,
      bottomInset: 48,
    });
    fireEvent.press(screen.getByTestId("dispose-submit"));
    fireEvent.press(screen.getByTestId("dispose-submit"));
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("dispose-submit")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ busy: true, disabled: true })
    );
    expect(screen.getByTestId("dispose-submit-area")).toHaveProp(
      "bottomInset",
      48
    );
    expect(screen.getByTestId("dispose-submit-area")).toHaveStyle({
      paddingBottom: 60,
    });
    expect(screen.getByTestId("dispose-date-field")).toHaveProp(
      "editable",
      false
    );
    expect(screen.getByTestId("dispose-category-donated")).toBeDisabled();
  });

  it("keeps long form content scrollable while actions remain outside the scroll region", (): void => {
    renderScreen({
      category: "other",
      otherTreatment: "external_transfer",
      fontScale: 2,
      width: 320,
    });
    expect(screen.getByTestId("dispose-scroll-content")).toHaveProp(
      "keyboardShouldPersistTaps",
      "handled"
    );
    expect(screen.getByTestId("dispose-scroll-content")).toHaveProp(
      "className",
      expect.stringContaining("min-h-0 flex-1")
    );
    expect(
      within(screen.getByTestId("dispose-scroll-content")).queryByTestId(
        "dispose-submit"
      )
    ).toBeNull();
  });

  it("keeps radio choices individually accessible and focuses the first invalid one", async (): Promise<void> => {
    const focus = jest
      .spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation((): void => undefined);
    const props = renderScreen({
      category: "other",
      validationErrors: {
        category: "dispose_category_required",
        treatment: "dispose_other_treatment_required",
      },
      submitError: "holding_revision_conflict",
    });
    expect(screen.getByTestId("dispose-validation-summary")).toHaveProp(
      "accessibilityRole",
      "alert"
    );
    expect(screen.getByTestId("dispose-category-group")).toHaveProp(
      "aria-invalid",
      true
    );
    expect(screen.getByTestId("dispose-category-group")).not.toHaveProp(
      "accessible",
      true
    );
    expect(screen.getByTestId("dispose-category-lost_stolen")).toHaveProp(
      "accessibilityRole",
      "radio"
    );
    expect(screen.getByTestId("dispose-treatment-write_off")).toHaveProp(
      "accessibilityRole",
      "radio"
    );
    expect(screen.getByTestId("dispose-submit-error")).toHaveProp(
      "accessibilityLiveRegion",
      "assertive"
    );
    expect(
      screen.getByText(copy.submitErrorMessages.holding_revision_conflict)
    ).toBeOnTheScreen();
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(3));
    fireEvent.press(screen.getByTestId("dispose-retry"));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });

  it("focuses the submit error for an operational failure", async (): Promise<void> => {
    const focus = jest
      .spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation((): void => undefined);
    renderScreen({ submitError: "unexpected_operational_error" });
    expect(screen.getByTestId("dispose-submit-error")).toHaveTextContent(
      copy.submitFailed
    );
    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    focus.mockRestore();
  });

  it("maps stable command failure codes to localized copy with a safe fallback", (): void => {
    renderScreen({ submitError: "metal_holding_not_active" });
    expect(screen.getByTestId("dispose-submit-error")).toHaveTextContent(
      copy.submitErrorMessages.metal_holding_not_active
    );
  });

  it("explains the exact date boundary that failed", (): void => {
    renderScreen({
      validationErrors: { disposalDate: "dispose_date_invalid" },
    });
    expect(screen.getByTestId("dispose-date-field")).toHaveProp(
      "aria-invalid",
      true
    );
    expect(screen.getAllByText(copy.dateInvalid).length).toBeGreaterThan(1);
    expect(screen.getByTestId("dispose-validation-summary")).toHaveProp(
      "accessibilityLabel",
      copy.dateInvalid
    );
  });

  it("names the acquisition boundary for pre-acquisition disposal dates", (): void => {
    renderScreen({
      validationErrors: {
        disposalDate: "dispose_date_before_acquisition",
      },
    });
    expect(
      screen.getAllByText(copy.dateBeforeAcquisition).length
    ).toBeGreaterThan(1);
    expect(screen.getByTestId("dispose-validation-summary")).toHaveProp(
      "accessibilityLabel",
      copy.dateBeforeAcquisition
    );
  });

  it("renders the shaped treatment prop without reclassifying the category", (): void => {
    renderScreen({
      category: "lost_stolen",
      treatment: "external_transfer",
    });
    expect(screen.getByText(copy.externalTransferSummary)).toBeOnTheScreen();
    expect(screen.queryByText(copy.writeOffSummary)).toBeNull();
  });

  it("renders each consumed terminal rate with its own freshness and provenance", (): void => {
    renderScreen({
      category: "donated",
      treatment: "external_transfer",
      rateEvidence: [
        {
          role: "terminal_metal",
          valueLabel: "3,600 USD/g",
          freshness: "stale",
          sourceLabel: "provider-a",
          observedLabel: "5 Sep 10:00",
        },
        {
          role: "terminal_purchase_currency",
          valueLabel: "0.02 USD/EGP",
          freshness: "fresh",
          sourceLabel: "provider-b",
          observedLabel: "5 Sep 11:30",
        },
      ],
      requiresRateAcknowledgment: true,
    });
    expect(screen.getByTestId("dispose-rate-evidence")).toBeOnTheScreen();
    expect(
      within(
        screen.getByTestId("dispose-rate-evidence-terminal_metal")
      ).getByText(/3,600 USD\/g/)
    ).toBeOnTheScreen();
    expect(
      within(
        screen.getByTestId("dispose-rate-freshness-terminal_metal")
      ).getByText(new RegExp(copy.rateFreshness.stale))
    ).toBeOnTheScreen();
    expect(
      within(
        screen.getByTestId("dispose-rate-freshness-terminal_purchase_currency")
      ).getByText(new RegExp(copy.rateFreshness.fresh))
    ).toBeOnTheScreen();
    expect(screen.getByTestId("dispose-rate-acknowledgment")).toHaveProp(
      "accessibilityRole",
      "checkbox"
    );
  });

  it("hides the rate acknowledgment for fresh evidence and missing references", (): void => {
    renderScreen({});
    expect(screen.queryByTestId("dispose-rate-evidence")).toBeNull();
    expect(screen.queryByTestId("dispose-rate-acknowledgment")).toBeNull();
    renderScreen({
      rateEvidence: [
        {
          role: "terminal_metal",
          valueLabel: "3,600 USD/g",
          freshness: "fresh",
          sourceLabel: "provider-a",
          observedLabel: "5 Sep 11:30",
        },
      ],
    });
    expect(screen.queryByTestId("dispose-rate-acknowledgment")).toBeNull();
  });

  it("surfaces the acknowledgment error and toggles through the callback", (): void => {
    const props = renderScreen({
      validationErrors: {
        rateAcknowledgment: "dispose_rate_acknowledgment_required",
      },
      requiresRateAcknowledgment: true,
      rateAcknowledged: false,
      onRateAcknowledgmentChange: jest.fn(),
    });
    expect(
      screen.getByTestId("dispose-rate-acknowledgment-error")
    ).toHaveTextContent(copy.rateAcknowledgmentRequired);
    expect(screen.getByTestId("dispose-validation-summary")).toHaveProp(
      "accessibilityLabel",
      copy.rateAcknowledgmentRequired
    );
    fireEvent.press(screen.getByTestId("dispose-rate-acknowledgment"));
    expect(props.onRateAcknowledgmentChange).toHaveBeenCalledWith(true);
  });

  it("uses Skeleton for loading", (): void => {
    renderScreen({ isLoading: true });
    expect(screen.getByTestId("dispose-form-skeleton")).toBeOnTheScreen();
    expect(screen.queryByTestId("dispose-submit")).toBeNull();
  });

  it("provides an actionable load retry", (): void => {
    const props = renderScreen({ loadError: "metal_holding_load_failed" });
    expect(screen.getByText(copy.loadError)).toHaveProp(
      "accessibilityRole",
      "alert"
    );
    fireEvent.press(screen.getByTestId("dispose-retry"));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    [390, 1, false, "two-column"],
    [320, 1, false, "stacked"],
    [390, 2, true, "stacked"],
  ] as const)(
    "uses responsive category layout at width %s and font scale %s",
    (width, fontScale, isRtl, expectedLayout): void => {
      renderScreen({ width, fontScale, isRtl, locale: isRtl ? "ar" : "en" });
      expect(screen.getByTestId("dispose-category-group")).toHaveProp(
        "layoutMode",
        expectedLayout
      );
      expect(screen.getByTestId("dispose-form")).toHaveProp(
        "writingDirection",
        isRtl ? "rtl" : "ltr"
      );
      expect(screen.getByTestId("dispose-form")).toHaveProp(
        "accessibilityLanguage",
        isRtl ? "ar" : "en"
      );
    }
  );

  it("includes light/dark NativeWind classes and a complete translation-key inventory", (): void => {
    renderScreen({ category: "donated", treatment: "external_transfer" });
    expect(screen.getByTestId("metal-holding-dispose-screen")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-950")
    );
    expect(screen.getByTestId("dispose-live-summary")).toHaveProp(
      "className",
      expect.stringContaining("dark:")
    );
    expect(loadScreen().DISPOSE_METAL_HOLDING_COPY_KEYS).toMatchObject({
      title: "dispose.title",
      intro: "dispose.intro",
      categories: {
        lost_stolen: "dispose.categories.lostOrStolen",
        destroyed_damaged: "dispose.categories.destroyedOrDamaged",
        given_away: "dispose.categories.givenAway",
        donated: "dispose.categories.donated",
        other: "dispose.categories.other",
      },
    });
  });
});
