import { render, screen } from "@testing-library/react-native";
import React from "react";
import i18next from "i18next";

import { Slide1Voice } from "@/components/onboarding/Slide1Voice";
import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";

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
    "Expense, Coffee at Starbucks, {{amount}}, Food & Drinks",
  pitch_slide_voice_result_clothes_accessibility:
    "Expense, Clothes, {{amount}}, Shopping",
  pitch_slide_voice_result_borrowed_accessibility:
    "Income, Borrowed from Ahmed, {{amount}}, Borrowed Money",
};

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly t: (
      key: string,
      values?: Readonly<Record<string, string>>
    ) => string;
    readonly i18n: { readonly dir: () => "ltr" | "rtl" };
  } => ({
    t: (key: string, values?: Readonly<Record<string, string>>): string => {
      const template = copy[key] ?? key;
      return values?.amount
        ? template.replace("{{amount}}", values.amount)
        : template;
    },
    i18n: { dir: (): "ltr" | "rtl" => mockDirection },
  }),
}));

describe("Slide1Voice", () => {
  beforeAll(async () => {
    await i18next.init({
      resources: {
        en: { common: enCommon },
        ar: { common: arCommon },
      },
      lng: "en",
      fallbackLng: "en",
      ns: "common",
      defaultNS: "common",
      interpolation: { escapeValue: false },
    });
  });
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
    expect(screen.getByText("؜-٤٠ جنيه مصري")).toBeVisible();
    expect(screen.getByText("؜-٢٬٠٠٠ جنيه مصري")).toBeVisible();
    expect(screen.getByText("؜+٥٠٠ جنيه مصري")).toBeVisible();
  });

  it("gives each parsed result a complete accessible description", () => {
    render(<Slide1Voice />);

    expect(
      screen.getByLabelText(
        "Expense, Coffee at Starbucks, −40 EGP, Food & Drinks"
      )
    ).toBeVisible();
    expect(
      screen.getByLabelText("Expense, Clothes, −2,000 EGP, Shopping")
    ).toBeVisible();
    expect(
      screen.getByLabelText(
        "Income, Borrowed from Ahmed, +500 EGP, Borrowed Money"
      )
    ).toBeVisible();
  });
});
