import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    t: (key: string, options?: { count?: number }) => string;
  } => ({
    t: (key: string, options?: { count?: number }): string => {
      if (key === "sms_review_continue") {
        return `Continue reviewing ${options?.count ?? 0} transactions`;
      }
      if (key === "sms_review_pending_description") {
        return "Your saved suggestions are ready when you are.";
      }
      if (key === "sms_review_check_new") return "Check for new messages";
      if (key === "back_to_dashboard") return "Back to dashboard";
      return key;
    },
  }),
}));

import { SmsReviewResumeState } from "@/components/sms-sync/SmsReviewResumeState";

describe("SmsReviewResumeState", () => {
  it("makes durable review recovery primary and new scanning secondary", () => {
    const onContinueReview = jest.fn();
    const onCheckNewMessages = jest.fn();
    const onBack = jest.fn();
    const screen = render(
      <SmsReviewResumeState
        itemCount={4}
        onContinueReview={onContinueReview}
        onCheckNewMessages={onCheckNewMessages}
        onBack={onBack}
      />
    );

    expect(screen.getByText("Continue reviewing 4 transactions")).toBeTruthy();
    expect(screen.getByText("Check for new messages")).toBeTruthy();

    fireEvent.press(screen.getByTestId("sms-review-resume-primary"));
    fireEvent.press(screen.getByTestId("sms-review-check-new"));
    fireEvent.press(screen.getByTestId("sms-review-resume-back"));

    expect(onContinueReview).toHaveBeenCalledTimes(1);
    expect(onCheckNewMessages).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
