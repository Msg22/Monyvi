import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
import React from "react";

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
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly cancelLabel: string;
  readonly retryLabel: string;
  readonly loadError: string;
  readonly categoryRequired: string;
  readonly treatmentRequired: string;
  readonly dateRequired: string;
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
  readonly disposalDate: string;
  readonly notes: string;
  readonly isLoading?: boolean;
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

interface HookHolding {
  readonly holdingId: string;
  readonly name: string;
  readonly userId: string;
  readonly status: "active" | "sold" | "disposed";
  readonly expectedFinancialRevision: string;
  readonly predecessorEventId: string;
}

interface HookDependencies {
  readonly loadHolding: (holdingId: string) => Promise<HookHolding>;
  readonly disposeHolding: (
    input: Readonly<Record<string, unknown>>
  ) => Promise<unknown>;
}

interface DisposeHookResult {
  readonly model: HookHolding | null;
  readonly category: Category | null;
  readonly otherTreatment: Treatment | null;
  readonly disposalDate: string;
  readonly notes: string;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isDirty: boolean;
  readonly loadError: string | null;
  readonly submitError: string | null;
  readonly validationErrors: Readonly<Record<string, string>>;
  readonly setCategory: (value: Category) => void;
  readonly setOtherTreatment: (value: Treatment) => void;
  readonly setDisposalDate: (value: string) => void;
  readonly setNotes: (value: string) => void;
  readonly submit: () => Promise<boolean>;
  readonly retryLoad: () => void;
}

interface DisposeHookModule {
  readonly useDisposeMetalHolding: (input: {
    readonly holdingId: string;
    readonly today: string;
    readonly createId: () => string;
    readonly dependencies: HookDependencies;
  }) => DisposeHookResult;
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
  submitLabel: "Record change",
  pendingLabel: "Recording change",
  cancelLabel: "Cancel",
  retryLabel: "Try again",
  loadError: "We could not load this holding.",
  categoryRequired: "Choose a reason.",
  treatmentRequired: "Choose how to record Other.",
  dateRequired: "Choose a valid date.",
};

const holding: HookHolding = {
  holdingId: "holding-1",
  name: "Wedding coin",
  userId: "user-1",
  status: "active",
  expectedFinancialRevision: "0",
  predecessorEventId: "event-1",
};

function loadScreen(): DisposeScreenModule {
  return jest.requireActual<DisposeScreenModule>(
    "@/components/metals/DisposeMetalHoldingScreen"
  );
}

function loadHook(): DisposeHookModule {
  return jest.requireActual<DisposeHookModule>(
    "@/hooks/useDisposeMetalHolding"
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
      renderScreen({ category });
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

  it("focuses the first invalid group and announces recoverable submit errors", (): void => {
    const props = renderScreen({
      category: "other",
      validationErrors: {
        category: copy.categoryRequired,
        treatment: copy.treatmentRequired,
      },
      submitError: "The change was not recorded. Try again.",
    });
    expect(screen.getByTestId("dispose-category-group")).toHaveProp(
      "autoFocus",
      true
    );
    expect(screen.getByTestId("dispose-category-group")).toHaveProp(
      "aria-invalid",
      true
    );
    expect(screen.getByTestId("dispose-submit-error")).toHaveProp(
      "accessibilityLiveRegion",
      "assertive"
    );
    fireEvent.press(screen.getByTestId("dispose-retry"));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
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
    renderScreen({ category: "donated" });
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

describe("useDisposeMetalHolding lifecycle", () => {
  function createDependencies(
    disposeHolding: HookDependencies["disposeHolding"] = jest.fn(() =>
      Promise.resolve({ kind: "committed" })
    )
  ): HookDependencies {
    return {
      loadHolding: jest.fn(() => Promise.resolve(holding)),
      disposeHolding,
    };
  }

  it("validates required category and conditional Other treatment while notes remain optional", async (): Promise<void> => {
    const dependencies = createDependencies();
    const { result } = renderHook(() =>
      loadHook().useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn(() => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.category).toBe(
      "dispose_category_required"
    );
    act((): void => result.current.setCategory("other"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.treatment).toBe(
      "dispose_other_treatment_required"
    );
    act((): void => result.current.setOtherTreatment("write_off"));
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(dependencies.disposeHolding).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: null,
        category: "other",
        otherTreatment: "write_off",
      })
    );
  });

  it("blocks double submit, preserves facts on error, and retries the complete original command", async (): Promise<void> => {
    let rejectFirst: ((reason: Error) => void) | null = null;
    const firstAttempt = new Promise((_resolve, reject): void => {
      rejectFirst = reject;
    });
    const disposeHolding = jest
      .fn<
        ReturnType<HookDependencies["disposeHolding"]>,
        Parameters<HookDependencies["disposeHolding"]>
      >()
      .mockReturnValueOnce(firstAttempt)
      .mockResolvedValueOnce({ kind: "committed" });
    const dependencies = createDependencies(disposeHolding);
    const ids = ["action-1", "evidence-1", "event-1"];
    const createId = jest.fn(() => ids.shift() ?? "unexpected-id");
    const { result } = renderHook(() =>
      loadHook().useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId,
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act((): void => {
      result.current.setCategory("donated");
      result.current.setNotes("Family gift");
    });
    let first!: Promise<boolean>;
    let duplicate!: Promise<boolean>;
    act((): void => {
      first = result.current.submit();
      duplicate = result.current.submit();
    });
    expect(disposeHolding).toHaveBeenCalledTimes(1);
    await act(async (): Promise<void> => {
      rejectFirst?.(new Error("disk_full"));
      await expect(first).resolves.toBe(false);
      await expect(duplicate).resolves.toBe(false);
    });
    expect(result.current).toMatchObject({
      category: "donated",
      notes: "Family gift",
      submitError: "disk_full",
      isSubmitting: false,
    });
    const firstRequest = disposeHolding.mock.calls[0][0];
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(true);
    });
    expect(disposeHolding).toHaveBeenCalledTimes(2);
    expect(disposeHolding.mock.calls[1][0]).toBe(firstRequest);
    expect(createId).toHaveBeenCalledTimes(3);
  });

  it("contains ID generation failures and releases the pending lock", async (): Promise<void> => {
    const dependencies = createDependencies();
    const createId = jest.fn(() => {
      throw new Error("secure_random_unavailable");
    });
    const { result } = renderHook(() =>
      loadHook().useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId,
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act((): void => result.current.setCategory("donated"));

    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current).toMatchObject({
      isSubmitting: false,
      submitError: "secure_random_unavailable",
    });
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
  });

  it("reports invalid dates and reloads after a recoverable load failure", async (): Promise<void> => {
    const loadHolding = jest
      .fn<Promise<HookHolding>, [string]>()
      .mockRejectedValueOnce(new Error("load_failed"))
      .mockResolvedValueOnce(holding);
    const dependencies: HookDependencies = {
      loadHolding,
      disposeHolding: jest.fn(() => Promise.resolve({ kind: "committed" })),
    };
    const { result } = renderHook(() =>
      loadHook().useDisposeMetalHolding({
        holdingId: holding.holdingId,
        today: "2026-09-05",
        createId: jest.fn(() => "stable-id"),
        dependencies,
      })
    );
    await waitFor(() => expect(result.current.loadError).toBe("load_failed"));
    act((): void => result.current.retryLoad());
    await waitFor(() => expect(result.current.model).toEqual(holding));
    act((): void => {
      result.current.setCategory("donated");
      result.current.setDisposalDate("2026-09-06");
    });
    await act(async (): Promise<void> => {
      await expect(result.current.submit()).resolves.toBe(false);
    });
    expect(result.current.validationErrors.disposalDate).toBe(
      "dispose_date_invalid"
    );
    expect(dependencies.disposeHolding).not.toHaveBeenCalled();
  });
});
