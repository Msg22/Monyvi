import { render, screen } from "@testing-library/react-native";
import React from "react";

import { FinancialFlowIllustration } from "@/components/auth/FinancialFlowIllustration";

const COLORS = {
  flowColor: "green",
  mutedFlowColor: "gray",
  accentColor: "gold",
  accentSoftColor: "yellow",
  surfaceColor: "white",
} as const;

function renderIllustration(direction: "ltr" | "rtl"): void {
  render(<FinancialFlowIllustration direction={direction} {...COLORS} />);
}

function getDecorativeByTestId(
  testID: string
): ReturnType<typeof screen.getByTestId> {
  return screen.getByTestId(testID, { includeHiddenElements: true });
}

describe("FinancialFlowIllustration", () => {
  it("selects approved LTR geometry and stays hidden from accessibility", () => {
    renderIllustration("ltr");

    expect(getDecorativeByTestId("financial-flow-ltr")).toHaveProp(
      "importantForAccessibility",
      "no-hide-descendants"
    );
    expect(
      getDecorativeByTestId("financial-flow-connections-ltr")
    ).toBeOnTheScreen();
    expect(getDecorativeByTestId("financial-flow-voice")).toBeOnTheScreen();
    expect(getDecorativeByTestId("financial-flow-currency")).toBeOnTheScreen();
    expect(getDecorativeByTestId("financial-flow-gold")).toBeOnTheScreen();
  });

  it("selects approved RTL geometry without reversing the ledger checkmark", () => {
    renderIllustration("rtl");

    expect(getDecorativeByTestId("financial-flow-rtl")).toBeOnTheScreen();
    expect(
      getDecorativeByTestId("financial-flow-connections-rtl")
    ).toBeOnTheScreen();
    expect(getDecorativeByTestId("financial-flow-ledger")).toBeOnTheScreen();
    expect(
      getDecorativeByTestId("financial-flow-check-normal")
    ).toBeOnTheScreen();
  });
});
