import { render, screen } from "@testing-library/react-native";
import type { ReviewableTransaction } from "@monyvi/logic";
import React from "react";
import {
  ReviewTransactionItemSkeleton,
  TransactionItem,
} from "@/components/transaction-review/TransactionItem";

const mockInstitutionLogoMark = jest.fn();

jest.mock("@/components/institutions/InstitutionLogoMark", () => ({
  InstitutionLogoMark: (props: Record<string, unknown>): React.JSX.Element => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    mockInstitutionLogoMark(props);
    return ReactActual.createElement(ReactNative.View, {
      testID: typeof props.testID === "string" ? props.testID : undefined,
    });
  },
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): React.JSX.Element => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    return ReactActual.createElement(ReactNative.View, {
      testID: "skeleton-block",
    });
  },
}));

jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "ar" }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

function createTransaction(): ReviewableTransaction {
  return {
    amount: 125,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Fixture Shop",
    date: new Date("2026-01-02T10:30:00.000Z"),
    categoryId: "cat-food",
    categoryDisplayName: "Food",
    confidence: 0.95,
    originLabel: "QNB",
    source: "SMS",
  };
}

function renderItem(isSmsWorkspace = false): void {
  render(
    <TransactionItem
      transaction={createTransaction()}
      index={0}
      isSelected
      accountName="QNB Account"
      onToggleSelect={jest.fn()}
      onPress={jest.fn()}
      isSmsWorkspace={isSmsWorkspace}
      institutionLogo={{ format: "image", source: 1 }}
    />
  );
}

describe("TransactionItem", () => {
  beforeEach(() => {
    mockInstitutionLogoMark.mockClear();
  });

  it("keeps merchant details out of the compact SMS review row", () => {
    renderItem();

    expect(screen.queryByText("Fixture Shop")).toBeNull();
  });

  it("keeps the provider logo visible when the row is selected", () => {
    renderItem();

    expect(screen.getByTestId("transaction-review-provider-logo")).toBeTruthy();
    expect(mockInstitutionLogoMark).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "compact",
        testID: "transaction-review-provider-logo",
      })
    );
  });

  it("provides a compact row skeleton with the same themed surface", () => {
    render(<ReviewTransactionItemSkeleton />);

    expect(screen.getByTestId("transaction-review-row-skeleton")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
    expect(screen.getAllByTestId("skeleton-block").length).toBeGreaterThan(3);
  });

  it("uses the debit color for an expense amount", () => {
    renderItem();

    expect(screen.getByTestId("transaction-review-amount")).toHaveProp(
      "className",
      expect.stringContaining("text-red-400")
    );
  });

  it("formats review dates using the active app locale", () => {
    const dateSpy = jest.spyOn(Date.prototype, "toLocaleDateString");
    const timeSpy = jest.spyOn(Date.prototype, "toLocaleTimeString");

    renderItem();

    expect(dateSpy).toHaveBeenCalledWith(
      "ar-EG-u-nu-latn",
      expect.objectContaining({ month: "short", day: "numeric" })
    );
    expect(timeSpy).toHaveBeenCalledWith(
      "ar-EG-u-nu-latn",
      expect.objectContaining({ hour: "2-digit", minute: "2-digit" })
    );

    dateSpy.mockRestore();
    timeSpy.mockRestore();
  });

  it("uses the remaining metadata width to show the full account name", () => {
    renderItem();

    expect(screen.getByTestId("transaction-account-match")).toHaveProp(
      "className",
      expect.stringContaining("shrink")
    );
    expect(screen.getByTestId("transaction-account-match")).not.toHaveProp(
      "className",
      expect.stringContaining("flex-1")
    );
    expect(screen.getByText("QNB Account")).toHaveProp(
      "adjustsFontSizeToFit",
      true
    );
  });

  it("keeps the shared row theme-aware outside the SMS workspace", () => {
    renderItem();

    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("bg-background")
    );
    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
  });

  it("keeps the SMS row surface compatible with light and dark themes", () => {
    renderItem(true);

    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("bg-background")
    );
    expect(screen.getByTestId("transaction-review-row")).toHaveProp(
      "className",
      expect.stringContaining("dark:bg-background-dark")
    );
  });
});
