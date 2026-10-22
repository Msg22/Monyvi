import React from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";

import { ReviewInlineNotice } from "@/components/transaction-review/ReviewInlineNotice";
import { useReviewNotice, type ReviewNotice } from "@/hooks/useReviewNotice";

let mockLanguage: "en" | "ar" = "en";
let mockIsRTL = false;
jest.mock("@/context/LocaleContext", () => ({
  useLocale: () => ({ language: mockLanguage, isRTL: mockIsRTL }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

beforeEach(() => {
  mockLanguage = "en";
  mockIsRTL = false;
});

const failure: ReviewNotice = {
  tone: "error",
  title: "Couldn't confirm the save",
  message: "Your review and selections remain available.",
};

describe("#395 persistent Review notice presentation", () => {
  it("stays visible beneath its parent header until explicitly dismissed", () => {
    const dismiss = jest.fn();
    const { rerender } = render(
      <ReviewInlineNotice notice={failure} surface="page" onDismiss={dismiss} />
    );
    expect(screen.getByTestId("review-inline-notice-page")).toBeTruthy();
    expect(screen.getByText(failure.title)).toBeTruthy();
    expect(screen.getByText(failure.message)).toBeTruthy();
    rerender(
      <ReviewInlineNotice notice={failure} surface="page" onDismiss={dismiss} />
    );
    expect(screen.getByText(failure.title)).toBeTruthy();
    fireEvent.press(screen.getByTestId("review-inline-notice-dismiss-page"));
    expect(dismiss).toHaveBeenCalledTimes(1);
    rerender(
      <ReviewInlineNotice notice={null} surface="page" onDismiss={dismiss} />
    );
    expect(screen.queryByTestId("review-inline-notice-page")).toBeNull();
  });

  it("keeps modal notices and their dismiss controls local to the modal", () => {
    const dismiss = jest.fn();
    const act = jest.fn();
    render(
      <ReviewInlineNotice
        notice={{
          tone: "warning",
          title: "Check your choice",
          message: "The previous selection remains.",
          action: { label: "Review", onPress: act },
        }}
        surface="modal"
        onDismiss={dismiss}
      />
    );
    expect(screen.getByTestId("review-inline-notice-modal")).toBeTruthy();
    expect(screen.queryByTestId("review-inline-notice-page")).toBeNull();
    fireEvent.press(screen.getByTestId("review-inline-notice-action-modal"));
    expect(act).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("review-inline-notice-dismiss-modal"));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it("keeps Arabic writing direction, locale labels and independent notice actions", () => {
    mockLanguage = "ar";
    mockIsRTL = true;
    const onAction = jest.fn<void, []>();
    const onDismiss = jest.fn<void, []>();
    render(
      <ReviewInlineNotice
        surface="modal"
        notice={{
          ...failure,
          action: { label: "عرض", onPress: onAction },
        }}
        onDismiss={onDismiss}
      />
    );
    const notice = screen.getByTestId("review-inline-notice-modal");
    const action = screen.getByTestId("review-inline-notice-action-modal");
    const close = screen.getByTestId("review-inline-notice-dismiss-modal");
    expect(screen.getByText(failure.title).props.style).toEqual(
      expect.objectContaining({ writingDirection: "rtl" })
    );
    expect(screen.getByText(failure.message).props.style).toEqual(
      expect.objectContaining({ writingDirection: "rtl" })
    );
    expect(notice.props.accessibilityLanguage).toBe("ar");
    expect(action).toHaveProp("accessibilityRole", "button");
    expect(action).toHaveProp("accessibilityLabel", "عرض");
    expect(close).toHaveProp("accessibilityRole", "button");
    expect(close).toHaveProp("accessibilityLabel", "review_notice_dismiss");
    fireEvent.press(action);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.press(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // NativeWind RTL layout and 48dp visual targets remain owner-device QA.
  });

  it("keeps page and modal states separate, dismissing only the chosen surface", () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      const { result } = renderHook(() => useReviewNotice({ source: "VOICE" }));
      act(() => {
        result.current.reportFailure({
          stage: "command",
          surface: "modal",
          reasonCodes: ["account_group_removed"],
        });
      });
      expect(result.current.pageNotice).toBeNull();
      expect(result.current.modalNotice).toMatchObject({
        tone: "warning",
        title: "review_notice_action_title",
        message: "review_notice_action_message",
      });
      act(() => {
        result.current.showNotice({
          surface: "page",
          tone: "success",
          title: "Saved",
          message: "Confirmed.",
        });
      });
      expect(result.current.pageNotice?.tone).toBe("success");
      expect(result.current.modalNotice).not.toBeNull();
      act(() => result.current.dismiss("modal"));
      expect(result.current.modalNotice).toBeNull();
      expect(result.current.pageNotice?.title).toBe("Saved");
      act(() => result.current.dismiss("page"));
      expect(result.current.pageNotice).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });
});
