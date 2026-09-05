import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
    i18n: { language: "en", dir: (): "ltr" => "ltr" },
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => {
  const { TouchableOpacity } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      onBack,
      backAccessibilityLabel,
    }: {
      readonly onBack?: () => void;
      readonly backAccessibilityLabel?: string;
    }): React.JSX.Element => (
      <TouchableOpacity
        testID="header-back"
        accessibilityLabel={backAccessibilityLabel}
        onPress={onBack}
      />
    ),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP", isLoading: false }),
}));

jest.mock("@/hooks/useAddMetalHolding", () => ({
  useMetalAddPreviewRates: () => ({ getPreviewRates: jest.fn() }),
  useAddMetalHoldingForm: () => ({
    values: {
      name: "",
      metal: "GOLD",
      weightGrams: "",
      purityCode: "gold-999",
      purchasePrice: "",
      purchaseCurrency: "EGP",
      purchaseDate: "2026-09-01",
      physicalForm: null,
      notes: "",
    },
    validationErrors: {},
    preview: {
      metal: "GOLD",
      purityCode: "gold-999",
      purityLabel: "24K · 999",
      purityFactorDecimal: "0.999",
      physicalForm: null,
      valuation: { available: false, reason: "missing_rate" },
    },
    purityOptions: [{ value: "gold-999", label: "24K · 999" }],
    isDirty: false,
    isSubmitting: false,
    submitError: null,
    requiresUnusualValueAcknowledgment: false,
    unusualValueAcknowledged: false,
    updateField: jest.fn(),
    acknowledgeUnusualValue: jest.fn(),
    submit: jest.fn(() => Promise.resolve(null)),
  }),
}));

jest.mock("@/services/add-metal-holding-facade-service", () => ({
  addMetalHoldingFromForm: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

interface AddHoldingRouteModule {
  readonly default: React.ComponentType;
}

interface MetalHoldingFormModule {
  readonly MetalHoldingForm: React.ComponentType<MetalHoldingFormProps>;
}

interface MetalHoldingFormProps {
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly isLoading?: boolean;
  readonly isSubmitting?: boolean;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly preview: MetalHoldingPreview;
  readonly onChange: (field: string, value: string | null) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
}

interface MetalHoldingPreview {
  readonly metal: "GOLD" | "SILVER";
  readonly purityCode: string;
  readonly purityLabel: string;
  readonly purityFactorDecimal: string;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
  readonly name?: string;
  readonly weightGramsDecimal?: string;
  readonly displayCurrency?: string;
  readonly metalUsdPerPureGramDecimal?: string | null;
  readonly rateSources?: readonly string[];
  readonly providerObservedAt?: Date | null;
  readonly resultSincePurchaseDecimal?: string | null;
  readonly resultDirection?: "positive" | "negative" | "zero" | "unavailable";
  readonly purityPercentDecimal?: string;
  readonly valuation:
    | { readonly available: true; readonly valueDecimal: string }
    | { readonly available: false; readonly reason: "missing_rate" };
}

function loadAddHoldingRoute(): React.ComponentType {
  return jest.requireActual<AddHoldingRouteModule>("@/app/(private)/metals/add")
    .default;
}

function loadMetalHoldingForm(): React.ComponentType<MetalHoldingFormProps> {
  return jest.requireActual<MetalHoldingFormModule>(
    "@/components/metals/MetalHoldingForm"
  ).MetalHoldingForm;
}

const goldPreview: MetalHoldingPreview = {
  metal: "GOLD",
  purityCode: "gold-999",
  purityLabel: "24K · 999",
  purityFactorDecimal: "0.999",
  physicalForm: "COIN",
  name: "Savings coin",
  weightGramsDecimal: "10",
  displayCurrency: "EGP",
  metalUsdPerPureGramDecimal: "104.51",
  rateSources: ["Monyvi market provider"],
  providerObservedAt: new Date("2026-08-26T10:30:00.000Z"),
  resultSincePurchaseDecimal: "4350.32",
  resultDirection: "positive",
  purityPercentDecimal: "99.9",
  valuation: { available: true, valueDecimal: "52150.32" },
};

const silverPreview: MetalHoldingPreview = {
  metal: "SILVER",
  purityCode: "silver-925",
  purityLabel: "925",
  purityFactorDecimal: "0.925",
  physicalForm: "BAR",
  valuation: { available: false, reason: "missing_rate" },
};

function renderForm(
  overrides: Partial<MetalHoldingFormProps> = {}
): MetalHoldingFormProps {
  const props: MetalHoldingFormProps = {
    locale: "en",
    isRtl: false,
    width: 390,
    fontScale: 1,
    bottomInset: 34,
    preview: goldPreview,
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onRequestExit: jest.fn(),
    ...overrides,
  };

  const MetalHoldingForm = loadMetalHoldingForm();
  render(<MetalHoldingForm {...props} />);
  return props;
}

describe("Add metal holding form", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
  });

  it("renders V1's direct-Add fields in canonical order with the ordinary-phone Weight/Purity row", () => {
    renderForm();

    const expectedOrder = [
      "metal-holding-name-field",
      "metal-holding-metal-field",
      "metal-holding-weight-purity-row",
      "metal-holding-purchase-price-field",
      "metal-holding-purchase-currency-field",
      "metal-holding-purchase-date-field",
      "metal-holding-physical-form-field",
      "metal-holding-notes-field",
      "metal-holding-live-preview",
      "metal-holding-local-first-status",
      "metal-holding-submit",
    ];

    expect(screen.getByTestId("metal-holding-form")).toHaveProp(
      "fieldOrder",
      expectedOrder
    );
    expectedOrder.forEach((testID) => {
      expect(screen.getByTestId(testID)).toBeOnTheScreen();
    });
    expect(screen.getByTestId("metal-holding-weight-purity-row")).toHaveProp(
      "accessibilityRole",
      "none"
    );
    expect(
      screen.getByTestId("metal-holding-weight-field-trailing-adornment")
    ).toHaveTextContent("g");
    expect(
      screen.getByTestId("metal-holding-physical-form-radio-COIN")
    ).toBeOnTheScreen();
  });

  it("stacks the dense Weight/Purity controls at compact width and 200% text while retaining accessible field labels", () => {
    renderForm({ width: 320, fontScale: 2 });

    expect(
      screen.getByTestId("metal-holding-weight-purity-stacked")
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Weight in grams")).toBeOnTheScreen();
    expect(screen.getByLabelText("Purity")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-submit")).toHaveProp(
      "accessibilityRole",
      "button"
    );
  });

  it("uses Monyvi's supplied Gold/Silver render and exact purity identity in a live preview, not a separate review screen", () => {
    renderForm();

    expect(screen.getByTestId("metal-holding-live-preview")).toHaveProp(
      "metal",
      "GOLD"
    );
    expect(screen.getByTestId("metal-holding-live-preview")).toHaveProp(
      "purityCode",
      "gold-999"
    );
    expect(screen.getAllByText("24K · 999").length).toBeGreaterThan(0);
    expect(screen.getByText("Gold · Coin")).toBeOnTheScreen();
    expect(screen.getByText("10 g · 24K · 999")).toBeOnTheScreen();
    expect(screen.getByText("EGP 52,150.32")).toBeOnTheScreen();
    expect(screen.getByText("+ EGP 4,350.32")).toBeOnTheScreen();
    expect(screen.getByText("24K · 999 · 99.9% pure")).toBeOnTheScreen();
    expect(
      screen.getByText("Gold · USD 104.51 per pure gram")
    ).toBeOnTheScreen();
    expect(
      screen.getByText(/Monyvi market provider · Rates updated/)
    ).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-item-render")).toHaveProp(
      "metal",
      "GOLD"
    );
    expect(screen.getByText("24K · 999 · 99.9% pure")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-secondary-dark")
    );
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });

  it("preserves a valid Silver entry when valuation is unavailable and keeps its direct Add action enabled", () => {
    const props = renderForm({ preview: silverPreview });

    expect(screen.getByTestId("metal-holding-live-preview")).toHaveProp(
      "valuationState",
      "unavailable"
    );
    expect(screen.getByText("Valuation unavailable")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("keeps the bottom Add action above the safe area, focuses the first validation error, guards dirty exit, and locks a pending submission", () => {
    const props = renderForm({
      bottomInset: 34,
      isSubmitting: true,
      validationErrors: { name: "required", purchasePrice: "required" },
    });

    expect(screen.getByTestId("metal-holding-submit-area")).toHaveProp(
      "bottomInset",
      34
    );
    expect(screen.getByTestId("metal-holding-name-field")).toHaveProp(
      "aria-invalid",
      true
    );
    expect(screen.getByTestId("metal-holding-name-field")).toHaveProp(
      "autoFocus",
      true
    );
    fireEvent.press(screen.getByTestId("header-back"));
    expect(props.onRequestExit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("metal-holding-submit")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true, busy: true })
    );
    expect(screen.getByTestId("metal-holding-name-field")).toHaveProp(
      "editable",
      false
    );
    expect(
      screen.getByTestId("metal-holding-physical-form-option-COIN")
    ).toBeDisabled();
    expect(
      screen.getByTestId("metal-holding-purchase-date-field")
    ).toBeDisabled();
  });

  it("uses Skeleton while form content is loading and passes Arabic RTL state through without numeric-layout regressions", () => {
    renderForm({
      isLoading: true,
      locale: "ar",
      isRtl: true,
      width: 390,
      fontScale: 2,
    });

    expect(screen.getByTestId("metal-holding-form-skeleton")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-form")).toHaveProp(
      "accessibilityLanguage",
      "ar"
    );
    expect(screen.getByTestId("metal-holding-form")).toHaveProp(
      "writingDirection",
      "rtl"
    );
  });
});

describe("Add metal holding route", () => {
  it("renders the full form directly instead of a modal or a review route", () => {
    const AddHoldingRoute = loadAddHoldingRoute();
    render(<AddHoldingRoute />);

    expect(screen.getByTestId("metal-holding-add-screen")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-form")).toBeOnTheScreen();
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });
});
