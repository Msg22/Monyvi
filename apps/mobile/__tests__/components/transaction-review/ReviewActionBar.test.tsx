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

describe("ReviewActionBar", () => {
  function createProps(): React.ComponentProps<typeof ReviewActionBar> {
    return {
      selectedCount: 1,
      needsReviewCount: 0,
      reviewMode: "all",
      isSaving: false,
      onSave: jest.fn().mockResolvedValue(undefined),
      onDiscard: jest.fn(),
      onReviewNeeds: jest.fn(),
      onShowAll: jest.fn(),
    };
  }

  it("exposes an unambiguous review-needed action for E2E", () => {
    const onReviewNeeds = jest.fn();

    render(
      <ReviewActionBar
        selectedCount={2}
        needsReviewCount={1}
        reviewMode="all"
        isSaving={false}
        onSave={jest.fn().mockResolvedValue(undefined)}
        onDiscard={jest.fn()}
        onReviewNeeds={onReviewNeeds}
        onShowAll={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId("review-needs-action"));

    expect(onReviewNeeds).toHaveBeenCalledTimes(1);
  });

  it("keeps discard wired without applying a second safe-area inset", () => {
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

  it("keeps the shared action bar theme-aware outside the SMS workspace", () => {
    render(<ReviewActionBar {...createProps()} />);

    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("bg-white/95")
    );
    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-slate-950/95")
    );
  });

  it("uses the approved dark action surface in the SMS workspace", () => {
    render(<ReviewActionBar {...createProps()} isSmsWorkspace />);

    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("bg-slate-950/95")
    );
  });
});
