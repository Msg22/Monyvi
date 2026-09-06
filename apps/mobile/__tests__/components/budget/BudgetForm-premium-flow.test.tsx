/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import React from "react";
import { Text as MockText, TouchableOpacity } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { Budget, Category } from "@monyvi/db";

let mockCategoryMap = new Map<string, Category>([
  ["food", { id: "food", displayName: "Food & Dining" } as unknown as Category],
]);
const mockCreateBudget = jest.fn();

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { readonly name: string }) => <MockText>{name}</MockText>,
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    categories: [],
    expenseCategories: [],
    incomeCategories: [],
    isLoading: false,
    error: null,
    retry: jest.fn(),
  }),
}));

jest.mock("@/context/CategoriesContext", () => ({
  useCategoryLookup: () => mockCategoryMap,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock("@/hooks/usePreferredCurrency", () => ({
  usePreferredCurrency: () => ({ preferredCurrency: "EGP", isLoading: false }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

jest.mock("@/services/budget-service", () => ({
  createBudget: (...args: unknown[]) => mockCreateBudget(...args),
  updateBudget: jest.fn(),
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: ({
    visible,
    onSelect,
  }: {
    readonly visible: boolean;
    readonly onSelect: (id: string) => void;
  }): React.JSX.Element | null =>
    visible ? (
      <TouchableOpacity testID="pick-food" onPress={() => onSelect("food")}>
        <MockText>pick_food</MockText>
      </TouchableOpacity>
    ) : null,
}));

jest.mock("@/components/currency/CurrencyPicker", () => ({
  CurrencyPicker: (): null => null,
}));

jest.mock("@/components/budget/AlertThresholdSlider", () => ({
  AlertThresholdSlider: ({ value }: { readonly value: number }) => (
    <MockText testID="mock-threshold">{value}</MockText>
  ),
}));

jest.mock("@/components/modals/ConfirmationModal", () => ({
  ConfirmationModal: ({
    visible,
    title,
    message,
    confirmLabel,
    onConfirm,
  }: {
    readonly visible: boolean;
    readonly title: string;
    readonly message: string;
    readonly confirmLabel?: string;
    readonly onConfirm: () => void;
  }): React.JSX.Element | null =>
    visible ? (
      <>
        <MockText>{title}</MockText>
        <MockText>{message}</MockText>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={confirmLabel} onPress={onConfirm}>
          <MockText>{confirmLabel}</MockText>
        </TouchableOpacity>
      </>
    ) : null,
}));

jest.mock("@react-native-community/datetimepicker", () => () => null);

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

jest.mock("@/utils/dateHelpers", () => ({
  formatDate: (): string => "Sep 6, 2026",
}));

import { BudgetForm } from "@/components/budget/BudgetForm";

const RENEWAL_SOURCE = {
  id: "expired-budget",
  name: "Food budget",
  type: "CATEGORY",
  categoryId: "food",
  amount: 5000,
  currency: "EGP",
  period: "MONTHLY",
  periodStart: new Date("2026-08-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-01T00:00:00.000Z"),
  alertThreshold: 80,
} as unknown as Budget;

describe("BudgetForm premium flow", () => {
  beforeEach(() => {
    mockCreateBudget.mockReset();
    mockCategoryMap = new Map<string, Category>([
      ["food", { id: "food", displayName: "Food & Dining" } as unknown as Category],
    ]);
  });

  it("renders the approved scope selector and keeps the live preview in sync", () => {
    render(<BudgetForm />);

    expect(screen.getByTestId("budget-scope-selector")).toBeOnTheScreen();
    expect(screen.getByTestId("budget-live-preview")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("budget-scope-global"));
    fireEvent.changeText(screen.getByPlaceholderText("budget_name_placeholder"), "Monthly spending");
    fireEvent.changeText(screen.getByPlaceholderText("0.00"), "5000");

    const preview = screen.getByTestId("budget-live-preview");
    expect(preview).toHaveTextContent("global_type");
    expect(preview).toHaveTextContent("5000");
    expect(preview).toHaveTextContent("EGP");
    expect(preview).toHaveTextContent("monthly");
    expect(preview).toHaveTextContent("80");
  });

  it("requires final confirmation before creating a renewal", async () => {
    mockCreateBudget.mockResolvedValue({ id: "renewed-budget" });
    render(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    fireEvent.press(screen.getByTestId("budget-form-submit"));

    expect(mockCreateBudget).not.toHaveBeenCalled();
    expect(screen.getByText("confirm_budget_renewal_title")).toBeOnTheScreen();
    expect(screen.getByText("confirm_budget_renewal_message")).toBeOnTheScreen();

    fireEvent.press(
      screen.getByRole("button", { name: "confirm_budget_renewal_action" })
    );

    await waitFor(() => expect(mockCreateBudget).toHaveBeenCalledTimes(1));
    expect(mockCreateBudget).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Food budget",
        type: "CATEGORY",
        categoryId: "food",
        currency: "EGP",
      })
    );
  });
});
