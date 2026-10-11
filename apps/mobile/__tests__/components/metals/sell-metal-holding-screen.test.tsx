import React from "react";
import metalsEnglish from "../../../locales/en/metals.json";
import { fireEvent, render } from "@testing-library/react-native";
import {
  SellMetalHoldingScreen,
  type SellMetalHoldingScreenProps,
} from "../../../components/metals/SellMetalHoldingScreen";
import { createSellMetalHoldingCopy } from "../../../components/metals/sell-copy";

jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: "PageHeader",
}));

function props(
  overrides: Partial<SellMetalHoldingScreenProps> = {}
): SellMetalHoldingScreenProps {
  return {
    holdingName: "Wedding coin",
    copy: createSellMetalHoldingCopy(
      (key): string =>
        Object.entries(metalsEnglish.sell).find(
          ([name]) => key === `sell.${name}`
        )?.[1] ?? key
    ),
    values: {
      saleDate: "2026-10-11",
      grossProceedsDecimal: "170000",
      saleCurrency: "EGP",
      feeDecimal: "500",
      notes: "",
    },
    purchaseDate: "2024-03-14",
    today: "2026-10-11",
    locale: "en",
    bottomInset: 34,
    width: 390,
    fontScale: 1,
    preview: {
      canSubmit: true,
      validationErrors: {},
      netProceedsLabel: "EGP 169,500.00",
      resultLabel: "EGP 18,221.80",
      resultDirection: "positive",
    },
    isSubmitting: false,
    submitError: null,
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onRetry: jest.fn(),
    onRequestExit: jest.fn(),
    ...overrides,
  };
}

describe("Sell form approved non-credit composition", () => {
  it("shows fixed purchase currency, grouped amounts, live results, and one direct action", (): void => {
    const input = props();
    const screen = render(<SellMetalHoldingScreen {...input} />);
    expect(screen.getByDisplayValue("170,000")).toBeTruthy();
    expect(screen.getByTestId("metal-holding-sell-currency")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    expect(screen.getAllByText("EGP 169,500.00").length).toBeGreaterThan(0);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.press(screen.getByTestId("metal-holding-sell-submit"));
    expect(input.onSubmit).toHaveBeenCalledTimes(1);
  });
  it("includes bottom safe area in actions", (): void => {
    const screen = render(<SellMetalHoldingScreen {...props()} />);
    expect(screen.getByTestId("metal-holding-sell-actions")).toHaveStyle({
      paddingBottom: 50,
    });
  });
  it("blocks submission, input changes, cancel, and retry during commit", (): void => {
    const input = props({ isSubmitting: true, submitError: "Try again" });
    const screen = render(<SellMetalHoldingScreen {...input} />);
    expect(screen.getByTestId("metal-holding-sell-submit")).toBeDisabled();
    expect(screen.getByTestId("metal-holding-sell-submit")).toHaveProp(
      "accessibilityState",
      { disabled: true, busy: true }
    );
    expect(screen.getByTestId("metal-holding-sell-gross-field")).toHaveProp(
      "editable",
      false
    );
    expect(screen.getByTestId("metal-holding-sell-cancel")).toBeDisabled();
    expect(screen.getByTestId("metal-holding-sell-cancel")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    fireEvent.press(screen.getByTestId("metal-holding-sell-submit"));
    fireEvent.press(screen.getByTestId("metal-holding-sell-cancel"));
    expect(screen.getByTestId("metal-holding-sell-retry")).toBeDisabled();
    expect(screen.getByTestId("metal-holding-sell-retry")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    fireEvent.press(screen.getByTestId("metal-holding-sell-retry"));
    expect(input.onSubmit).not.toHaveBeenCalled();
    expect(input.onRequestExit).not.toHaveBeenCalled();
    expect(input.onRetry).not.toHaveBeenCalled();
  });
  it("preserves raw malformed numeric text for inline validation", (): void => {
    const input = props();
    const screen = render(<SellMetalHoldingScreen {...input} />);
    fireEvent.changeText(
      screen.getByTestId("metal-holding-sell-gross-field"),
      "12x"
    );
    expect(input.onChange).toHaveBeenCalledWith("grossProceedsDecimal", "12x");
  });
  it.each([
    [390, 1, "flex-row gap-3"],
    [320, 1, "gap-3"],
    [390, 2, "gap-3"],
    [768, 1, "flex-row gap-3"],
    [844, 1, "flex-row gap-3"],
  ] as const)(
    "reflows amount row at width %s and text scale %s",
    (width, fontScale, expected): void => {
      const screen = render(
        <SellMetalHoldingScreen {...props({ width, fontScale })} />
      );
      expect(screen.getByTestId("metal-holding-sell-field-row")).toHaveProp(
        "className",
        expected
      );
    }
  );
});
