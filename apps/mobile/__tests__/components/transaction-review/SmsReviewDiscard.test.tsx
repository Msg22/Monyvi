import { fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import React from "react";
import { Text } from "react-native";

import { SmsReviewAnimatedItem } from "@/components/transaction-review/SmsReviewAnimatedItem";
import { SmsReviewUndoBanner } from "@/components/transaction-review/SmsReviewUndoBanner";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly name?: string }): string =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: (): null => null,
}));

describe("SMS review discard feedback", () => {
  it("shows one named inline Undo banner with Undo and close actions", () => {
    const onUndo = jest.fn();
    const onClose = jest.fn();

    render(
      <SmsReviewUndoBanner
        discardedName="Fawry Market"
        onUndo={onUndo}
        onClose={onClose}
      />
    );

    expect(screen.getByText("sms_review_undo_title:Fawry Market")).toBeTruthy();
    expect(screen.getByText("sms_review_undo_description")).toBeTruthy();
    expect(screen.getByTestId("sms-review-undo-banner")).toBeTruthy();
    expect(screen.getByText("sms_review_undo_title:Fawry Market")).toHaveProp(
      "numberOfLines",
      2
    );
    expect(screen.getByText("sms_review_undo_description")).toHaveProp(
      "className",
      expect.stringContaining("text-text-secondary")
    );
    expect(
      readFileSync(
        require.resolve("@/components/transaction-review/SmsReviewUndoBanner"),
        "utf8"
      )
    ).not.toMatch(/className="[^"]*\babsolute\b/);
    fireEvent.press(screen.getByText("sms_review_undo"));
    fireEvent.press(screen.getByTestId("sms-review-undo-close"));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses system reduced-motion settings for removal, restore, and banner motion", () => {
    render(
      <SmsReviewAnimatedItem>
        <Text>Suggestion</Text>
      </SmsReviewAnimatedItem>
    );
    const itemSource = readFileSync(
      require.resolve("@/components/transaction-review/SmsReviewAnimatedItem"),
      "utf8"
    );
    const bannerSource = readFileSync(
      require.resolve("@/components/transaction-review/SmsReviewUndoBanner"),
      "utf8"
    );

    expect(screen.getByText("Suggestion")).toBeTruthy();
    expect(itemSource).toMatch(/reduceMotion\(\s*ReduceMotion\.System\s*\)/);
    expect(bannerSource).toMatch(/reduceMotion\(\s*ReduceMotion\.System\s*\)/);
  });
});
