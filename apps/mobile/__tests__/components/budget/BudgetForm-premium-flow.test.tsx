/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import React from "react";
import {
  Text as MockText,
  TouchableOpacity as MockTouchableOpacity,
} from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react-native";
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

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 24, left: 0 }),
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
      <MockTouchableOpacity testID="pick-food" onPress={() => onSelect("food")}>
        <MockText>pick_food</MockText>
      </MockTouchableOpacity>
    ) : null,
}));

jest.mock("@/components/currency/CurrencyPicker", () => ({
  CurrencyPicker: (): null => null,
}));

jest.mock("@/components/budget/AlertThresholdSlider", () => ({
  AlertThresholdSlider: ({
    value,
    onValueChange,
  }: {
    readonly value: number;
    readonly onValueChange: (value: number) => void;
  }) => (
    <MockTouchableOpacity
      testID="mock-threshold"
      onPress={() => onValueChange(65)}
    >
      <MockText>{value}</MockText>
    </MockTouchableOpacity>
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
        <MockTouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          onPress={onConfirm}
        >
          <MockText>{confirmLabel}</MockText>
        </MockTouchableOpacity>
      </>
    ) : null,
}));

jest.mock("@react-native-community/datetimepicker", () => () => null);

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
    i18n: { language: "en" },
  }),
}));

jest.mock("@/utils/dateHelpers", () => ({
  formatDate: (date: Date): string => date.toISOString().slice(0, 10),
}));

import { BudgetForm } from "@/components/budget/BudgetForm";

const RENEWAL_SOURCE = {
  id: "expired-budget",
  name: "Food budget",
  type: "CATEGORY",
  categoryId: "food",
  amount: 5000,
  currency: "EGP",
  period: "CUSTOM",
  periodStart: new Date("2026-08-01T12:00:00.000Z"),
  periodEnd: new Date("2026-08-11T12:00:00.000Z"),
  alertThreshold: 80,
} as unknown as Budget;

describe("BudgetForm premium flow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
    mockCreateBudget.mockReset();
    mockCategoryMap = new Map<string, Category>([
      ["food", { id: "food", displayName: "Food & Dining" } as unknown as Category],
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the approved scope selector and keeps nondefault preview fields in sync", () => {
    render(<BudgetForm />);

    expect(screen.getByTestId("budget-scope-selector")).toBeOnTheScreen();
    const preview = screen.getByTestId("budget-live-preview");
    expect(preview).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("budget-scope-global"));
    fireEvent.changeText(
      screen.getByPlaceholderText("budget_name_placeholder"),
      "Weekly spending"
    );
    fireEvent.changeText(screen.getByPlaceholderText("0.00"), "5000");
    fireEvent.press(screen.getByTestId("budget-period-weekly"));
    fireEvent.press(screen.getByTestId("mock-threshold"));

    expect(within(preview).getByText("global_type")).toBeOnTheScreen();
    expect(within(preview).getByText("weekly")).toBeOnTheScreen();
    expect(within(preview).getByText(/preview_alert_at 65%/)).toBeOnTheScreen();
    expect(within(preview).getByText(/EGP 3,250/)).toBeOnTheScreen();
    expect(
      within(preview).getByText("preview_resets_on 2026-09-13")
    ).toBeOnTheScreen();
    expect(within(preview).getByText("2026-09-06")).toBeOnTheScreen();
  });

  it("pads sticky actions above the bottom safe-area inset", () => {
    render(<BudgetForm />);

    expect(screen.getByTestId("budget-form-actions")).toHaveStyle({
      paddingBottom: 40,
    });
  });

  it("requires final confirmation before creating a valid custom renewal", async () => {
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
        period: "CUSTOM",
        periodStart: new Date("2026-09-06T12:00:00.000Z"),
        periodEnd: new Date("2026-09-16T12:00:00.000Z"),
      })
    );
  });
});
