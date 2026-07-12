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
      isSaving: false,
      onSave: jest.fn().mockResolvedValue(undefined),
      onDiscard: jest.fn(),
    };
  }

  it("keeps discard wired without applying a second safe-area inset", () => {
    const onDiscard = jest.fn();

    render(
      <ReviewActionBar
        selectedCount={1}
        isSaving={false}
        onSave={jest.fn().mockResolvedValue(undefined)}
        onDiscard={onDiscard}
      />
    );

    fireEvent.press(screen.getByText("discard_all"));

    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared action bar theme-aware outside the SMS workspace", () => {
    render(<ReviewActionBar {...createProps()} />);

    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("bg-background")
    );
    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
    expect(screen.queryByText("review_ai_accuracy_notice")).toBeNull();
  });

  it("keeps the SMS action surface compatible with light and dark themes", () => {
    const onDiscard = jest.fn();
    render(
      <ReviewActionBar
        {...createProps()}
        onDiscard={onDiscard}
        isSmsWorkspace
      />
    );

    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("bg-background")
    );
    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
    expect(screen.getByTestId("review-action-bar")).toHaveProp(
      "className",
      expect.stringContaining("px-5 py-2")
    );
    fireEvent.press(screen.getByText("discard_all"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
