import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import React from "react";
import { AccessibilityInfo } from "react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
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
  | "lost_or_stolen"
  | "destroyed_or_damaged"
  | "given_away"
  | "donated"
  | "other";
type Treatment = "write_off" | "external_transfer";

interface DisposeCopy {
  readonly title: string;
  readonly intro: string;
  readonly whatHappened: string;
  readonly affectsRecords: string;
  readonly categoryLabels: Readonly<Record<Category, string>>;
  readonly treatmentLabels: Readonly<Record<Treatment, string>>;
  readonly treatmentDescriptions: Readonly<Record<Treatment, string>>;
  readonly dateLabel: string;
  readonly notesLabel: string;
  readonly summaryTitle: string;
  readonly writeOffSummary: string;
  readonly externalTransferSummary: string;
  readonly activeOwnershipSummary: string;
  readonly historySummary: string;
  readonly noSaleMoneyOrAccountSummary: string;
  readonly noSaleProfitLossSummary: string;
  readonly rateEvidenceUnavailable: string;
  readonly ratePendingLabel: string;
  readonly notesTooLong: string;
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
  readonly rateEvidenceError?: string | null;
  readonly isLoading?: boolean;
  readonly isRateLoading?: boolean;
  readonly isSubmitting?: boolean;
  readonly loadError?: string | null;
  readonly submitError?: string | null;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onCategoryChange: (category: Category) => void;
  readonly onOtherTreatmentChange: (treatment: Treatment) => void;
  readonly onDateChange: (value: string) => void;
  readonly onNotesChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
  readonly onRetry: () => void;
}

interface DisposeScreenModule {
  readonly DisposeMetalHoldingScreen: React.ComponentType<DisposeScreenProps>;
  readonly DISPOSE_METAL_HOLDING_COPY_KEYS: Readonly<Record<string, unknown>>;
}

const copy: DisposeCopy = {
  title: "No longer owned",
  intro: "Use this when you no longer own the holding and did not sell it.",
  whatHappened: "What happened?",
  affectsRecords: "How should this affect your records?",
  categoryLabels: {
    lost_or_stolen: "Lost or stolen",
    destroyed_or_damaged: "Destroyed or damaged",
    given_away: "Given away",
    donated: "Donated",
    other: "Other",
  },
  treatmentLabels: {
    write_off: "Record a loss",
    external_transfer: "Record it as moved out",
  },
  treatmentDescriptions: {
    write_off:
      "Its purchase cost will be recorded as a loss. No sale money is added.",
    external_transfer:
      "It leaves your metals. No sale profit or loss is recorded.",
  },
  dateLabel: "Date",
  notesLabel: "Notes (optional)",
  summaryTitle: "What will happen",
  writeOffSummary: "Its purchase cost will be recorded as a loss.",
  externalTransferSummary: "It will leave your active metals.",
  activeOwnershipSummary: "This holding will no longer be active.",
  historySummary: "This change will appear in History.",
  noSaleMoneyOrAccountSummary: "There is no sale money or account change.",
  noSaleProfitLossSummary: "There is no profit or loss from a sale.",
  rateEvidenceUnavailable: "We could not check the rates. Try again.",
  ratePendingLabel: "Checking rates",
  notesTooLong: "Shorten your notes and try again.",
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
        /^dispose-category-(lost_or_stolen|destroyed_or_damaged|given_away|donated|other)$/
      )
    ).toHaveLength(5);
    expect(screen.getByText("No longer owned")).toBeOnTheScreen();
    expect(screen.queryByText("Wedding coin")).toBeNull();
    expect(screen.getByText("Notes (optional)")).toBeOnTheScreen();
    expect(screen.queryByText("Optional")).toBeNull();
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
    ["lost_or_stolen", "writeOffSummary"],
    ["destroyed_or_damaged", "writeOffSummary"],
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
    expect(screen.getByTestId("dispose-date-input")).toHaveProp(
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
    expect(screen.getByTestId("dispose-category-lost_or_stolen")).toHaveProp(
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
    expect(screen.getByTestId("dispose-date-input")).toHaveProp(
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
      category: "lost_or_stolen",
      treatment: "external_transfer",
    });
    expect(screen.getByText(copy.externalTransferSummary)).toBeOnTheScreen();
    expect(screen.queryByText(copy.writeOffSummary)).toBeNull();
  });

  it("keeps terminal rate evidence out of the No Longer form", (): void => {
    renderScreen({ category: "donated", treatment: "external_transfer" });
    expect(screen.queryByTestId("dispose-rate-evidence")).toBeNull();
    expect(screen.queryByTestId("dispose-rate-acknowledgment")).toBeNull();
    expect(screen.queryByText(/Rates kept with this record/i)).toBeNull();
    expect(screen.queryByText(/I understand the rates/i)).toBeNull();
  });

  it("surfaces a terminal rate-store failure separately with a retry", (): void => {
    const props = renderScreen({
      rateEvidenceError: "rate_store_unavailable",
      validationErrors: { rateEvidence: "dispose_rate_evidence_unavailable" },
    });
    expect(screen.getByTestId("dispose-rate-evidence-error")).toHaveTextContent(
      copy.rateEvidenceUnavailable
    );
    expect(screen.getByTestId("dispose-validation-summary")).toHaveProp(
      "accessibilityLabel",
      copy.rateEvidenceUnavailable
    );
    expect(screen.queryByText("rate_store_unavailable")).toBeNull();
    fireEvent.press(screen.getByTestId("dispose-rate-evidence-retry"));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps the form visible but blocks recording while date rates load", (): void => {
    const props = renderScreen({ isRateLoading: true });
    expect(screen.getByTestId("dispose-date-field")).toBeOnTheScreen();
    expect(screen.getByTestId("dispose-submit")).toHaveProp(
      "accessibilityState",
      { disabled: true, busy: true }
    );
    expect(screen.getByTestId("dispose-submit")).toHaveTextContent(
      copy.ratePendingLabel
    );
    fireEvent.press(screen.getByTestId("dispose-submit"));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("explains the notes byte limit in the field and validation summary", (): void => {
    renderScreen({ validationErrors: { notes: "dispose_notes_too_long" } });
    expect(screen.getByTestId("dispose-notes-field")).toHaveProp(
      "aria-invalid",
      true
    );
    expect(screen.getByTestId("dispose-validation-summary")).toHaveProp(
      "accessibilityLabel",
      copy.notesTooLong
    );
    expect(screen.getAllByText(copy.notesTooLong).length).toBeGreaterThan(1);
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
      expect.stringContaining("bg-background")
    );
    expect(screen.getByTestId("metal-holding-dispose-screen")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
    expect(screen.getByTestId("dispose-submit-area")).toHaveProp(
      "className",
      expect.stringContaining("bg-background")
    );
    expect(screen.getByTestId("dispose-submit-area")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
    expect(screen.getByTestId("dispose-live-summary")).toHaveProp(
      "className",
      expect.stringContaining("dark:")
    );
    expect(loadScreen().DISPOSE_METAL_HOLDING_COPY_KEYS).toMatchObject({
      title: "dispose.title",
      intro: "dispose.intro",
      whatHappened: "dispose.whatHappened",
      affectsRecords: "dispose.affectsRecords",
      categories: {
        lost_or_stolen: "dispose.categories.lostOrStolen",
        destroyed_or_damaged: "dispose.categories.destroyedOrDamaged",
        given_away: "dispose.categories.givenAway",
        donated: "dispose.categories.donated",
        other: "dispose.categories.other",
      },
      treatments: {
        write_off: "dispose.treatments.writeOff",
        external_transfer: "dispose.treatments.externalTransfer",
      },
      treatmentDescriptions: {
        write_off: "dispose.treatments.writeOffDescription",
        external_transfer: "dispose.treatments.externalTransferDescription",
      },
    });
  });

  it("renders an icon per reason and a selected radio indicator", (): void => {
    renderScreen({ category: "other", otherTreatment: "write_off" });
    for (const category of Object.keys(copy.categoryLabels) as Category[]) {
      expect(
        screen.getByTestId(`dispose-category-icon-${category}`)
      ).toBeOnTheScreen();
    }
    expect(
      screen.getByTestId("dispose-category-selected-indicator")
    ).toBeOnTheScreen();
    expect(
      screen.getByText(copy.whatHappened, { exact: false })
    ).toBeOnTheScreen();
  });

  it("uses the approved reason icon semantics and defined dark Nile Green tokens", (): void => {
    renderScreen({
      category: "other",
      otherTreatment: "write_off",
      treatment: "write_off",
    });

    const presentation = readFileSync(
      resolve(
        __dirname,
        "../../components/metals/dispose-form-presentation.tsx"
      ),
      "utf8"
    );
    const screenSource = readFileSync(
      resolve(
        __dirname,
        "../../components/metals/DisposeMetalHoldingScreen.tsx"
      ),
      "utf8"
    );

    expect(presentation).toContain("DisposeReasonIcon");
    expect(presentation).not.toContain("shield-outline");
    expect(presentation).not.toContain("heart-outline");
    expect([presentation, screenSource].join("\n")).not.toContain(
      "dark:text-nileGreen-300"
    );
    expect(screenSource).not.toContain("border-nileGreen-200");
    expect(screen.getByText(copy.categoryLabels.other)).toHaveProp(
      "className",
      expect.stringContaining("dark:text-nileGreen-400")
    );
    expect(screen.getByText(copy.treatmentLabels.write_off)).toHaveProp(
      "className",
      expect.stringContaining("dark:text-nileGreen-400")
    );
    expect(screen.getByText(copy.summaryTitle)).toHaveProp(
      "className",
      expect.stringContaining("dark:text-nileGreen-400")
    );
  });

  it("keeps the intro and What happened group compact while preserving validation summary access", (): void => {
    renderScreen({
      validationErrors: { category: "dispose_category_required" },
    });
    expect(screen.getByTestId("dispose-intro-reason-group")).toHaveProp(
      "className",
      expect.stringContaining("gap-4")
    );
    expect(screen.getByTestId("dispose-validation-summary")).toHaveProp(
      "accessibilityRole",
      "alert"
    );
  });

  it("shows each Other treatment with its explanatory copy", (): void => {
    renderScreen({ category: "other", otherTreatment: "write_off" });
    expect(
      screen.getByText(copy.affectsRecords, { exact: false })
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId("dispose-treatment-description-write_off")
    ).toHaveTextContent(copy.treatmentDescriptions.write_off);
    expect(
      screen.getByTestId("dispose-treatment-description-external_transfer")
    ).toHaveTextContent(copy.treatmentDescriptions.external_transfer);
  });

  it("marks reason and treatment as required and keeps the standard date required label", (): void => {
    renderScreen({ category: "other" });
    expect(screen.getByTestId("dispose-required-reason")).toBeOnTheScreen();
    expect(screen.getByTestId("dispose-required-treatment")).toBeOnTheScreen();
    expect(screen.queryByTestId("dispose-required-date")).toBeNull();
    expect(screen.getByTestId("dispose-date-input")).toHaveProp(
      "accessibilityHint",
      "required_field"
    );
  });

  it("opens the shared date picker from the date field", (): void => {
    const props = renderScreen({});
    fireEvent.press(screen.getByTestId("dispose-date-field"));
    expect(props.onDateChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("dispose-date-picker")).toBeOnTheScreen();
    expect(screen.getByTestId("dispose-date-input")).toBeOnTheScreen();
  });

  it("prefixes every live consequence with a check icon and outlines Cancel", (): void => {
    renderScreen({ category: "donated", treatment: "external_transfer" });
    expect(screen.getAllByTestId("dispose-summary-check")).toHaveLength(5);
    expect(screen.getByTestId("dispose-cancel")).toHaveProp(
      "accessibilityRole",
      "button"
    );
    expect(screen.getByText(copy.cancelLabel)).toBeOnTheScreen();
    const source = readFileSync(
      resolve(
        __dirname,
        "../../components/metals/DisposeMetalHoldingScreen.tsx"
      ),
      "utf8"
    );
    const cancelBlock = source.slice(source.indexOf('testID="dispose-cancel"'));
    expect(cancelBlock).toMatch(
      /testID="dispose-cancel"[\s\S]*?className="[^"]*border border-slate-300/
    );
  });
});
