import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { ReviewActionBar } from "@/components/transaction-review/ReviewActionBar";

const mockShowToast = jest.fn();

jest.mock("@/components/ui/Toast", () => ({
  useToast: (): { readonly showToast: typeof mockShowToast } => ({
    showToast: mockShowToast,
  }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({ top: 0, right: 0, bottom: 24, left: 0 }),
}));

describe("ReviewActionBar", () => {
  it("keeps the discard-all action visible and wired", () => {
    const onDiscard = jest.fn();

    render(
      <ReviewActionBar
        selectedCount={1}
        needsReviewCount={0}
        reviewMode="all"
        isSaving={false}
        onSave={jest.fn().mockResolvedValue(undefined)}
        onDiscard={onDiscard}
        onReviewNeeds={jest.fn()}
        onShowAll={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText("discard_all"));

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
