import { render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHoldingCorrectionState } from "@/components/metals/MetalHoldingCorrectionState";
import type {
  MetalHoldingFormCopy,
  MetalHoldingFormEditState,
} from "@/components/metals/MetalHoldingForm";

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

// Host stub that forwards the icon props the correction rows rely on
// (testID, name, and aria-hidden) so icon semantics stay assertable.
jest.mock("@expo/vector-icons", () => ({
  __esModule: true,
  Ionicons: "Ionicons",
}));

// The correction rows mark their icons decorative (aria-hidden), so the icon
// queries must opt into hidden elements to reach them.
const ICON_QUERY = { includeHiddenElements: true };

const mockCopy: MetalHoldingFormCopy = {
  title: "Edit holding",
  back: "Back",
  name: "Holding name",
  namePlaceholder: "Name",
  metal: "Metal",
  gold: "Gold",
  silver: "Silver",
  weight: "Weight",
  purity: "Purity",
  purchasePrice: "Purchase price",
  purchasePriceHint: "Hint",
  purchaseCurrency: "Currency",
  purchaseDate: "Date",
  physicalForm: "Physical form",
  coin: "Coin",
  bar: "Bar",
  jewelry: "Jewelry",
  notes: "Notes",
  notesPlaceholder: "Notes placeholder",
  preview: "Preview",
  valuationUnavailable: "Valuation unavailable",
  savedLocally: "Saved locally",
  submit: "Save",
  submitting: "Saving",
  unusualValue: "Unusual value",
  acknowledge: "Acknowledge",
  staleRateAcknowledgment: "Older saved rate.",
  submitFailed: "Submit failed",
  rateFresh: "Fresh",
  rateStale: "Stale",
  rateUnknown: "Unknown",
  rateUnavailable: "Unavailable",
  pure: "pure",
  perPureGram: "per pure gram",
  estimatedGainSincePurchase: "gain",
  estimatedLossSincePurchase: "loss",
  ratesUpdated: "Updated",
  whatWillChange: "What will change",
  noFinancialChange: "Current value stays",
  unchangedResult: "Your result since purchase stays",
  unchangedGain: "Your profit since purchase stays",
  unchangedLoss: "Your loss since purchase stays",
  correctionHistory: "This correction will appear in History.",
  correctionReason: "Correction reason (optional)",
};

describe("MetalHoldingCorrectionState", () => {
  it("renders green outline icons for affected changes, current value, gain/loss, and history notice", () => {
    const editState: MetalHoldingFormEditState = {
      correctionReason: "",
      affectedChanges: [
        {
          field: "physicalForm",
          label: "Physical form",
          before: "Coin",
          after: "Jewelry",
          isFinancial: false,
        },
      ],
    };

    render(
      <MetalHoldingCorrectionState
        copy={mockCopy}
        state={editState}
        currency="EGP"
        locale="en"
        currentValue="162317.87"
        resultSincePurchase="11039.67"
        resultDirection="positive"
        isDisabled={false}
        onReasonChange={jest.fn()}
      />
    );

    // Section title
    expect(screen.getByText("What will change")).toBeTruthy();

    // Affected change row
    expect(screen.getByText("Physical form: Coin → Jewelry")).toBeTruthy();
    expect(
      screen.getByTestId("change-icon-physicalForm", ICON_QUERY)
    ).toHaveProp("name", "swap-horizontal-outline");
    expect(
      screen.getByTestId("change-icon-physicalForm", ICON_QUERY)
    ).toHaveProp("aria-hidden", true);

    // Current value stays
    expect(screen.getByText(/Current value stays.*162,317.87/)).toBeTruthy();
    expect(
      screen.getByTestId("change-icon-current-value", ICON_QUERY)
    ).toHaveProp("name", "trending-up-outline");

    // Gain/loss stays
    expect(
      screen.getByText(/Your profit since purchase stays.*11,039.67/)
    ).toBeTruthy();
    expect(screen.getByTestId("change-icon-result", ICON_QUERY)).toHaveProp(
      "name",
      "person-outline"
    );

    // Image update row removed per explicit user direction
    expect(
      screen.queryByText("The holding image and description will update.")
    ).toBeNull();
    expect(screen.queryByTestId("change-icon-image-update")).toBeNull();

    // History notice
    expect(
      screen.getByText("This correction will appear in History.")
    ).toBeTruthy();
    expect(screen.getByTestId("change-icon-history", ICON_QUERY)).toHaveProp(
      "name",
      "time-outline"
    );
  });

  it("renders optional correction reason label without red asterisk", () => {
    const editState: MetalHoldingFormEditState = {
      correctionReason: "",
      affectedChanges: [
        {
          field: "weight",
          label: "Weight",
          before: "10.000 g",
          after: "11.125 g",
          isFinancial: true,
        },
      ],
    };

    render(
      <MetalHoldingCorrectionState
        copy={mockCopy}
        state={editState}
        currency="EGP"
        locale="en"
        currentValue="162317.87"
        resultSincePurchase="11039.67"
        resultDirection="positive"
        isDisabled={false}
        onReasonChange={jest.fn()}
      />
    );

    expect(screen.getByText("Correction reason (optional)")).toBeTruthy();
    expect(screen.queryByText("Correction reason (optional) *")).toBeNull();
  });

  it("renders the correction-reason byte-limit error inline", () => {
    const editState: MetalHoldingFormEditState = {
      correctionReason: "ع".repeat(513),
      affectedChanges: [
        {
          field: "weight",
          label: "Weight",
          before: "10 g",
          after: "11 g",
          isFinancial: true,
        },
      ],
    };

    render(
      <MetalHoldingCorrectionState
        copy={mockCopy}
        state={editState}
        currency="EGP"
        locale="en"
        currentValue="162317.87"
        resultSincePurchase="11039.67"
        resultDirection="positive"
        reasonError="This reason is too long. Shorten it and try again."
        isDisabled={false}
        onReasonChange={jest.fn()}
      />
    );

    expect(
      screen.getByText("This reason is too long. Shorten it and try again.")
    ).toBeTruthy();
  });
});
