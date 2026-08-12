import { render, screen } from "@testing-library/react-native";
import React from "react";

import { Slide1Voice } from "@/components/onboarding/Slide1Voice";

let mockDirection: "ltr" | "rtl" = "ltr";

const copy: Readonly<Record<string, string>> = {
  pitch_slide_voice_listening: "Listening…",
  pitch_slide_voice_count: "3 found",
  pitch_slide_voice_transcript:
    "I drank coffee for 40 pounds at Starbucks, bought clothes for 2,000 pounds, and borrowed 500 pounds from Ahmed.",
  pitch_slide_voice_result_coffee_title: "Coffee at Starbucks",
  pitch_slide_voice_result_coffee_category: "Food & Drinks",
  pitch_slide_voice_result_clothes_title: "Clothes",
  pitch_slide_voice_result_clothes_category: "Shopping",
  pitch_slide_voice_result_borrowed_title: "Borrowed from Ahmed",
  pitch_slide_voice_result_borrowed_category: "Borrowed Money · Income",
  pitch_slide_voice_review_ready: "3 transactions ready to review",
  pitch_slide_voice_result_coffee_accessibility:
    "Expense, Coffee at Starbucks, 40 EGP, Food & Drinks",
  pitch_slide_voice_result_clothes_accessibility:
    "Expense, Clothes, 2,000 EGP, Shopping",
  pitch_slide_voice_result_borrowed_accessibility:
    "Income, Borrowed from Ahmed, 500 EGP, Borrowed Money",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (key: string) => string;
    readonly i18n: { readonly dir: () => "ltr" | "rtl" };
  } => ({
    t: (key: string): string => copy[key] ?? key,
    i18n: { dir: (): "ltr" | "rtl" => mockDirection },
  }),
}));

describe("Slide1Voice", () => {
  beforeEach(() => {
    mockDirection = "ltr";
  });

  it("shows one review row for every event in the compound transcript", () => {
    render(<Slide1Voice />);

    expect(
      screen.getByText(`“${copy.pitch_slide_voice_transcript}”`)
    ).toBeVisible();
    expect(screen.getByText("3 found")).toBeVisible();
    expect(screen.getByTestId("voice-pitch-result-coffee")).toBeVisible();
    expect(screen.getByTestId("voice-pitch-result-clothes")).toBeVisible();
    expect(screen.getByTestId("voice-pitch-result-borrowed")).toBeVisible();
    expect(screen.getByText("−40 EGP")).toBeVisible();
    expect(screen.getByText("−2,000 EGP")).toBeVisible();
    expect(screen.getByText("+500 EGP")).toBeVisible();
    expect(screen.getByText("3 transactions ready to review")).toBeVisible();
  });

  it("removes the false auto-save and invented account claims", () => {
    render(<Slide1Voice />);

    expect(screen.queryByText("Saved automatically")).not.toBeOnTheScreen();
    expect(screen.queryByText("Main CIB Account")).not.toBeOnTheScreen();
    expect(screen.queryByText("200 EGP")).not.toBeOnTheScreen();
  });

  it("mirrors review rows for Arabic while keeping currency amounts LTR", () => {
    mockDirection = "rtl";

    render(<Slide1Voice />);

    expect(screen.getByTestId("voice-pitch-results")).toHaveStyle({
      direction: "rtl",
    });
    expect(screen.getByTestId("voice-pitch-result-coffee")).toHaveProp(
      "className",
      expect.stringContaining("flex-row items-center")
    );
    expect(screen.getByTestId("voice-pitch-result-coffee-amount")).toHaveStyle({
      writingDirection: "ltr",
    });
    expect(screen.getByTestId("voice-pitch-result-clothes-amount")).toHaveStyle(
      {
        writingDirection: "ltr",
      }
    );
    expect(
      screen.getByTestId("voice-pitch-result-borrowed-amount")
    ).toHaveStyle({
      writingDirection: "ltr",
    });
  });

  it("gives each parsed result a complete accessible description", () => {
    render(<Slide1Voice />);

    expect(
      screen.getByLabelText(copy.pitch_slide_voice_result_coffee_accessibility)
    ).toBeVisible();
    expect(
      screen.getByLabelText(copy.pitch_slide_voice_result_clothes_accessibility)
    ).toBeVisible();
    expect(
      screen.getByLabelText(
        copy.pitch_slide_voice_result_borrowed_accessibility
      )
    ).toBeVisible();
  });
});
