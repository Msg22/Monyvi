import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CompactReviewTranscript } from "@/components/transaction-review/CompactReviewTranscript";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (props: { readonly testID?: string }): React.JSX.Element => {
    const actualReact = jest.requireActual<typeof import("react")>("react");
    const native =
      jest.requireActual<typeof import("react-native")>("react-native");
    return actualReact.createElement(
      native.Text,
      { testID: props.testID },
      "icon"
    );
  },
}));
jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ language: "en" }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function measure(lineCount: number): void {
  fireEvent(
    screen.getByTestId("voice-review-transcript-measure", {
      includeHiddenElements: true,
    }),
    "textLayout",
    {
      nativeEvent: {
        lines: Array.from({ length: lineCount }, () => ({ text: "line" })),
      },
    }
  );
}

describe("compact transcript uses actual native wrapping", () => {
  it.each([1, 2])("hides the toggle for %i visible lines", (lines) => {
    render(
      <CompactReviewTranscript text="Short transcript" detectedLanguage="EN" />
    );
    measure(lines);
    expect(screen.queryByTestId("voice-review-transcript-chevron")).toBeNull();
    expect(screen.getByTestId("voice-review-transcript-toggle")).toBeDisabled();
    expect(screen.getByTestId("voice-review-transcript-text")).toHaveProp(
      "numberOfLines",
      2
    );
  });

  it("expands and collapses only overflowing text, then adapts when width fits it", () => {
    render(
      <CompactReviewTranscript text="Long transcript" detectedLanguage="EN" />
    );
    measure(3);
    expect(
      screen.getByTestId("voice-review-transcript-chevron", {
        includeHiddenElements: true,
      })
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("voice-review-transcript-toggle"));
    expect(
      screen.getByTestId("voice-review-transcript-text").props.numberOfLines
    ).toBeUndefined();
    fireEvent.press(screen.getByTestId("voice-review-transcript-toggle"));
    expect(screen.getByTestId("voice-review-transcript-text")).toHaveProp(
      "numberOfLines",
      2
    );
    measure(2);
    expect(screen.queryByTestId("voice-review-transcript-chevron")).toBeNull();
    expect(screen.getByTestId("voice-review-transcript-toggle")).toBeDisabled();
  });

  it("does not reuse another transcript's overflow measurement", () => {
    const view = render(
      <CompactReviewTranscript
        text="Previous long text"
        detectedLanguage="EN"
      />
    );
    measure(4);
    view.rerender(
      <CompactReviewTranscript text="New short text" detectedLanguage="EN" />
    );
    expect(screen.queryByTestId("voice-review-transcript-chevron")).toBeNull();
    measure(1);
    expect(screen.getByTestId("voice-review-transcript-toggle")).toBeDisabled();
  });
});
