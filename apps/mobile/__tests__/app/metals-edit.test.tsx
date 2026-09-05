import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
    i18n: { language: "en", dir: (): "ltr" => "ltr" },
  }),
}));

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

interface EditMetalHoldingFormModule {
  readonly MetalHoldingForm: React.ComponentType<EditMetalHoldingFormProps>;
}

interface EditMetalHoldingFormProps {
  readonly mode: "edit";
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly holdingStatus: "active" | "sold" | "disposed";
  readonly values: {
    readonly name: string;
    readonly metal: "GOLD" | "SILVER";
    readonly weightGrams: string;
    readonly purityCode: string;
    readonly purchasePrice: string;
    readonly purchaseCurrency: string;
    readonly purchaseDate: string;
    readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
    readonly notes: string;
  };
  readonly preview: {
    readonly metal: "GOLD" | "SILVER";
    readonly purityCode: string;
    readonly purityLabel: string;
    readonly purityFactorDecimal: string;
    readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
    readonly name?: string;
    readonly weightGramsDecimal?: string;
    readonly displayCurrency?: string;
    readonly valuation: {
      readonly available: true;
      readonly valueDecimal: string;
    };
  };
  readonly editState: {
    readonly affectedChanges: readonly {
      readonly field: string;
      readonly label: string;
      readonly before: string;
      readonly after: string;
      readonly isFinancial: boolean;
    }[];
    readonly correctionReason: string;
    readonly requiresConsequenceAcknowledgment?: boolean;
  };
  readonly isSubmitting?: boolean;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onChange: (field: string, value: string | null) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
  readonly onCorrectionReasonChange: (value: string) => void;
  readonly onAcknowledgeConsequences: () => void;
}

interface EditFacts {
  readonly name: string;
  readonly metal: "GOLD" | "SILVER";
  readonly weightGramsDecimal: string;
  readonly purityLabel: string;
  readonly purchasePriceDecimal: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
  readonly notes: string | null;
  readonly currentValueDecimal: string | null;
  readonly performanceDecimal: string | null;
}

function loadEditForm(): React.ComponentType<EditMetalHoldingFormProps> {
  return jest.requireActual<EditMetalHoldingFormModule>(
    "@/components/metals/MetalHoldingForm"
  ).MetalHoldingForm;
}

const original: EditFacts = {
  name: "Wedding coin",
  metal: "GOLD",
  weightGramsDecimal: "10.125",
  purityLabel: "24K · 999",
  purchasePriceDecimal: "47800",
  purchaseCurrency: "EGP",
  purchaseDate: "2024-03-14",
  physicalForm: "COIN",
  notes: "هدية 🎁",
  currentValueDecimal: "51200",
  performanceDecimal: "3400",
};

function renderEdit(
  overrides: Partial<EditMetalHoldingFormProps> = {}
): EditMetalHoldingFormProps {
  const props: EditMetalHoldingFormProps = {
    mode: "edit",
    locale: "en",
    isRtl: false,
    width: 390,
    fontScale: 1,
    bottomInset: 34,
    holdingStatus: "active",
    values: toValues(original),
    preview: toPreview(original),
    editState: {
      affectedChanges: [],
      correctionReason: "",
    },
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onRequestExit: jest.fn(),
    onCorrectionReasonChange: jest.fn(),
    onAcknowledgeConsequences: jest.fn(),
    ...overrides,
  };
  const MetalHoldingForm = loadEditForm();
  render(<MetalHoldingForm {...props} />);
  return props;
}

function toValues(facts: EditFacts): EditMetalHoldingFormProps["values"] {
  return {
    name: facts.name,
    metal: facts.metal,
    weightGrams: facts.weightGramsDecimal,
    purityCode: "gold-999",
    purchasePrice: facts.purchasePriceDecimal,
    purchaseCurrency: facts.purchaseCurrency,
    purchaseDate: facts.purchaseDate,
    physicalForm: facts.physicalForm,
    notes: facts.notes ?? "",
  };
}

function toPreview(facts: EditFacts): EditMetalHoldingFormProps["preview"] {
  return {
    metal: facts.metal,
    purityCode: "gold-999",
    purityLabel: facts.purityLabel,
    purityFactorDecimal: "0.999",
    physicalForm: facts.physicalForm,
    name: facts.name,
    weightGramsDecimal: facts.weightGramsDecimal,
    displayCurrency: facts.purchaseCurrency,
    valuation: {
      available: true,
      valueDecimal: facts.currentValueDecimal ?? "0",
    },
  };
}

function materialOverride(
  current: EditFacts,
  field: string,
  label: string,
  before: string,
  after: string,
  isFinancial = true
): Partial<EditMetalHoldingFormProps> {
  return {
    values: toValues(current),
    preview: toPreview(current),
    editState: {
      affectedChanges: [{ field, label, before, after, isFinancial }],
      correctionReason: "Corrected details",
    },
  };
}

describe("Edit metal holding form", () => {
  it("uses exact shared Add/Edit order, direct Save, and visibly locked Metal", (): void => {
    renderEdit();

    expect(screen.getByTestId("metal-holding-edit-screen")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-form")).toHaveProp("fieldOrder", [
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
    ]);
    expect(screen.getByTestId("metal-holding-metal-field")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByTestId("metal-holding-metal-locked")).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-metal-locked-guidance")
    ).toBeOnTheScreen();
    expect(screen.getByText("Gold")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-primary-dark")
    );
    expect(screen.getAllByText("24K · 999").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("14 Mar 2024")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("metal-holding-purchase-date-field"));
    expect(
      screen.getByTestId("metal-holding-purchase-date-picker")
    ).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-submit")).toHaveTextContent(
      "Save changes"
    );
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });

  it("keeps metadata-only Save ordinary, then reveals persisted/current cues, reason, and affected-only summary for material changes", (): void => {
    const metadataProps = renderEdit({
      values: toValues({ ...original, name: "Coin for wedding" }),
      preview: toPreview({ ...original, name: "Coin for wedding" }),
    });
    expect(screen.queryByTestId("metal-holding-correction-reason")).toBeNull();
    expect(screen.queryByTestId("metal-holding-what-will-change")).toBeNull();
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(metadataProps.onSubmit).toHaveBeenCalledTimes(1);

    renderEdit(
      materialOverride(
        { ...original, weightGramsDecimal: "11.125" },
        "weight",
        "Weight",
        "10.125",
        "11.125"
      )
    );
    const weightSection = screen.getByTestId(
      "metal-holding-weight-purity-section"
    );
    expect(weightSection).toBeOnTheScreen();
    expect(screen.getAllByText("Previous: 10.125")).toHaveLength(1);
    expect(screen.getByDisplayValue("11.125")).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-correction-reason")
    ).toBeOnTheScreen();
    expect(screen.getByText("Weight: 10.125 → 11.125")).toBeOnTheScreen();
    expect(screen.queryByTestId("metal-holding-live-preview")).toBeNull();
    expect(
      screen.queryByTestId("metal-holding-consequence-acknowledgment")
    ).toBeNull();
    expect(
      screen.queryByTestId("metal-holding-purchase-date-previous")
    ).toBeNull();
  });

  it("hides correction state when every material delta is restored while retaining metadata changes", (): void => {
    renderEdit({
      values: toValues({
        ...original,
        name: "Corrected name",
        notes: "Still mine",
      }),
      preview: toPreview({
        ...original,
        name: "Corrected name",
        notes: "Still mine",
      }),
    });

    expect(screen.queryByTestId("metal-holding-correction-reason")).toBeNull();
    expect(screen.queryByTestId("metal-holding-what-will-change")).toBeNull();
    expect(screen.queryByTestId("metal-holding-weight-previous")).toBeNull();
  });

  it("describes physical-form-only correction without inventing a financial delta", (): void => {
    renderEdit(
      materialOverride(
        { ...original, physicalForm: "BAR" },
        "physicalForm",
        "Physical form",
        "Coin",
        "Bar",
        false
      )
    );

    expect(screen.getByText("Physical form: Coin → Bar")).toBeOnTheScreen();
    expect(screen.getByText("Current value stays 51200")).toBeOnTheScreen();
    expect(
      screen.getByText("This correction will appear in History")
    ).toBeOnTheScreen();
  });

  it("limits terminal holdings to metadata and keeps dirty exit, focus, pending lock, safe area, Arabic RTL, theme, and compact 200 percent reflow accessible", (): void => {
    const props = renderEdit({
      holdingStatus: "sold",
      isSubmitting: true,
      validationErrors: { name: "required" },
      locale: "ar",
      isRtl: true,
      width: 320,
      fontScale: 2,
    });

    expect(screen.queryByTestId("metal-holding-weight-field")).toBeNull();
    expect(screen.getByTestId("metal-holding-name-field")).toHaveProp(
      "autoFocus",
      true
    );
    expect(screen.getByTestId("metal-holding-submit-area")).toHaveProp(
      "bottomInset",
      34
    );
    expect(screen.getByTestId("metal-holding-form")).toHaveProp(
      "writingDirection",
      "rtl"
    );
    expect(
      screen.queryByTestId("metal-holding-weight-purity-stacked")
    ).toBeNull();
    fireEvent.press(screen.getByTestId("header-back"));
    expect(props.onRequestExit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
