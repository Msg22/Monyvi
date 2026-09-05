import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

interface EditMetalHoldingFormModule {
  readonly MetalHoldingForm: React.ComponentType<EditMetalHoldingFormProps>;
}

interface EditMetalHoldingFormProps {
  readonly mode: "edit";
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly colorScheme: "light" | "dark";
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly holdingStatus: "active" | "sold" | "disposed";
  readonly original: EditFacts;
  readonly current: EditFacts;
  readonly correctionReason: string | null;
  readonly isSubmitting?: boolean;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onChange: (field: string, value: string | null) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
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
    colorScheme: "light",
    width: 390,
    fontScale: 1,
    bottomInset: 34,
    holdingStatus: "active",
    original,
    current: original,
    correctionReason: null,
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onRequestExit: jest.fn(),
    ...overrides,
  };
  const MetalHoldingForm = loadEditForm();
  render(<MetalHoldingForm {...props} />);
  return props;
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
      "metal-holding-submit",
    ]);
    expect(screen.getByTestId("metal-holding-metal-field")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByText("24K · 999")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-submit")).toHaveTextContent(
      "Save changes"
    );
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });

  it("keeps metadata-only Save ordinary, then reveals persisted/current cues, reason, and affected-only summary for material changes", (): void => {
    const metadataProps = renderEdit({
      current: { ...original, name: "Coin for wedding" },
    });
    expect(screen.queryByTestId("metal-holding-correction-reason")).toBeNull();
    expect(screen.queryByTestId("metal-holding-what-will-change")).toBeNull();
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(metadataProps.onSubmit).toHaveBeenCalledTimes(1);

    renderEdit({
      current: { ...original, weightGramsDecimal: "11.125" },
      correctionReason: "Corrected scale reading",
    });
    expect(screen.getByTestId("metal-holding-weight-previous")).toHaveTextContent(
      "10.125"
    );
    expect(screen.getByTestId("metal-holding-weight-current")).toHaveTextContent(
      "11.125"
    );
    expect(screen.getByTestId("metal-holding-correction-reason")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-what-will-change")).toHaveTextContent(
      "Weight"
    );
    expect(screen.queryByTestId("metal-holding-purchase-date-previous")).toBeNull();
  });

  it("hides correction state when every material delta is restored while retaining metadata changes", (): void => {
    renderEdit({
      current: { ...original, name: "Corrected name", notes: "Still mine" },
      correctionReason: "No longer needed",
    });

    expect(screen.queryByTestId("metal-holding-correction-reason")).toBeNull();
    expect(screen.queryByTestId("metal-holding-what-will-change")).toBeNull();
    expect(screen.queryByTestId("metal-holding-weight-previous")).toBeNull();
  });

  it("describes physical-form-only correction without inventing a financial delta", (): void => {
    renderEdit({
      current: { ...original, physicalForm: "BAR" },
      correctionReason: "Recorded wrong form",
    });

    expect(screen.getByTestId("metal-holding-what-will-change")).toHaveTextContent(
      "Physical form: Coin → Bar"
    );
    expect(screen.getByTestId("metal-holding-what-will-change")).toHaveTextContent(
      "Current value stays 51200"
    );
    expect(screen.getByTestId("metal-holding-what-will-change")).toHaveTextContent(
      "This correction will appear in History"
    );
  });

  it("limits terminal holdings to metadata and keeps dirty exit, focus, pending lock, safe area, Arabic RTL, theme, and compact 200 percent reflow accessible", (): void => {
    const props = renderEdit({
      holdingStatus: "sold",
      isSubmitting: true,
      validationErrors: { name: "required" },
      locale: "ar",
      isRtl: true,
      colorScheme: "dark",
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
    expect(screen.getByTestId("metal-holding-weight-purity-stacked")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("metal-holding-exit"));
    expect(props.onRequestExit).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
