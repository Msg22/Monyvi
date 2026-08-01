import { render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { PitchSlide } from "@/components/onboarding/PitchSlide";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({
    top: 0,
    right: 0,
    bottom: 24,
    left: 0,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("@/components/onboarding/LanguageSwitcherPill", () => ({
  LanguageSwitcherPill: (): null => null,
}));

describe("PitchSlide", () => {
  it("keeps the bottom CTA clear of the Android navigation bar", () => {
    render(
      <PitchSlide
        headline="Track money faster"
        subhead="Use voice and SMS to save time."
        isLast={false}
        hasPrevious
        slideIndex={0}
        totalSlides={3}
        onSkip={jest.fn()}
        onPrevious={jest.fn()}
        onAdvance={jest.fn()}
      >
        <Text>Mock slide body</Text>
      </PitchSlide>
    );

    expect(screen.getByTestId("pitch-slide-root")).toHaveStyle({
      paddingBottom: 56,
    });
  });

  it("uses the approved compact composition on short screens", () => {
    render(
      <PitchSlide
        headline="Track with your voice."
        subhead="Three transactions ready to review."
        isLast={false}
        hasPrevious={false}
        isCompactLayout
        slideIndex={0}
        totalSlides={3}
        onSkip={jest.fn()}
        onPrevious={jest.fn()}
        onAdvance={jest.fn()}
      >
        <Text>Compact voice results</Text>
      </PitchSlide>
    );

    expect(screen.getByTestId("pitch-slide-root")).toHaveProp(
      "className",
      expect.stringContaining("pt-8")
    );
    expect(screen.getByTestId("pitch-slide-headline")).toHaveProp(
      "className",
      expect.stringContaining("text-2xl")
    );
    expect(screen.getByTestId("pitch-slide-content")).toHaveProp(
      "className",
      expect.stringContaining("mt-3")
    );
    expect(screen.getByTestId("pitch-slide-pagination")).toHaveProp(
      "className",
      expect.stringContaining("mb-3")
    );
  });
});
