/* eslint-disable @typescript-eslint/consistent-type-assertions */
import React from "react";
import { Text as MockText } from "react-native";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { Budget, Category } from "@monyvi/db";

let mockCategoryError: unknown = new Error("category observation failed");
let mockAreCategoriesLoading = false;
let mockCategoryMap = new Map<string, Category>();
let mockPreferredCurrency = "EGP";
let mockIsPreferredCurrencyLoading = false;
const mockRetryCategories = jest.fn();

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { readonly name: string }) => (
    <MockText>{name}</MockText>
  ),
}));

jest.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    categories: [],
    expenseCategories: [],
    incomeCategories: [],
    isLoading: mockAreCategoriesLoading,
    error: mockCategoryError,
    retry: mockRetryCategories,
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
  usePreferredCurrency: () => ({
    preferredCurrency: mockPreferredCurrency,
    isLoading: mockIsPreferredCurrencyLoading,
  }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

jest.mock("@/services/budget-service", () => ({
  createBudget: jest.fn(),
  updateBudget: jest.fn(),
}));

jest.mock("@/components/modals/CategorySelectorModal", () => ({
  CategorySelectorModal: (): null => null,
}));

jest.mock("@/components/currency/CurrencyPicker", () => ({
  CurrencyPicker: ({
    visible,
    onSelect,
  }: {
    readonly visible: boolean;
    readonly onSelect: (currency: "USD") => void;
  }): React.JSX.Element | null =>
    visible ? (
      <MockText
        testID="currency-picker-option-usd"
        onPress={() => onSelect("USD")}
      >
        USD
      </MockText>
    ) : null,
}));

jest.mock("@/components/budget/AlertThresholdSlider", () => ({
  AlertThresholdSlider: (): null => null,
}));

jest.mock("@react-native-community/datetimepicker", () => () => null);

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

jest.mock("@/utils/dateHelpers", () => ({
  formatDate: (): string => "Aug 14, 2026",
}));

import { BudgetForm } from "@/components/budget/BudgetForm";
import {
  createBudget as createBudgetService,
  updateBudget as updateBudgetService,
} from "@/services/budget-service";

const mockedCreateBudgetService = jest.mocked(createBudgetService);
const mockedUpdateBudgetService = jest.mocked(updateBudgetService);

const RENEWAL_SOURCE = {
  id: "budget-1",
  name: "Education renewal",
  type: "CATEGORY",
  categoryId: "education",
  amount: 5000,
  currency: "USD",
  period: "CUSTOM",
  periodStart: new Date("2026-06-01T00:00:00.000Z"),
  periodEnd: new Date("2026-07-01T00:00:00.000Z"),
  alertThreshold: 80,
} as unknown as Budget;

describe("BudgetForm category recovery", () => {
  beforeEach(() => {
    mockCategoryError = new Error("category observation failed");
    mockAreCategoriesLoading = false;
    mockCategoryMap = new Map<string, Category>();
    mockPreferredCurrency = "EGP";
    mockIsPreferredCurrencyLoading = false;
    mockRetryCategories.mockClear();
    mockedCreateBudgetService.mockReset();
    mockedUpdateBudgetService.mockReset();
  });

  it("preserves a renewal category through an observation failure and recovers after retry", () => {
    const { rerender } = render(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByTestId("budget-category-load-error")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "retry" }));
    expect(mockRetryCategories).toHaveBeenCalledTimes(1);

    mockCategoryError = null;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    rerender(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByText("Education")).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-category-load-error")).toBeNull();
  });

  it("blocks category renewal while categories are still loading", () => {
    mockCategoryError = null;
    mockAreCategoriesLoading = true;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    render(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByTestId("budget-form-submit")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));
    expect(mockedCreateBudgetService).not.toHaveBeenCalled();
  });

  it("submits a renewal with the source currency", async () => {
    mockCategoryError = null;
    mockAreCategoriesLoading = false;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    render(<BudgetForm renewalSource={RENEWAL_SOURCE} />);

    expect(screen.getByTestId("budget-form-submit")).toHaveProp(
      "accessibilityState",
      { disabled: false }
    );
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));

    expect(screen.queryByText("validation_name_required")).toBeNull();
    expect(screen.queryByText("validation_amount_invalid")).toBeNull();
    expect(screen.queryByText("validation_category_required")).toBeNull();
    expect(screen.queryByText("category_load_error")).toBeNull();
    expect(screen.queryByText("validation_date_order")).toBeNull();

    await waitFor(() =>
      expect(mockedCreateBudgetService).toHaveBeenCalledWith(
        expect.objectContaining({ currency: "USD" })
      )
    );
  });

  it("persists the preferred currency for ordinary creation", async () => {
    mockCategoryError = null;
    render(<BudgetForm />);

    fireEvent.press(
      screen.getByRole("button", {
        name: "accessibility_global_budget_type",
      })
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("budget_name_placeholder"),
      "Monthly spending"
    );
    fireEvent.changeText(screen.getByPlaceholderText("0.00"), "5000");
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));

    await waitFor(() =>
      expect(mockedCreateBudgetService).toHaveBeenCalledTimes(1)
    );
    expect(mockedCreateBudgetService).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "EGP" })
    );
  });

  it("blocks ordinary creation until the preferred currency has loaded", () => {
    mockCategoryError = null;
    mockPreferredCurrency = "USD";
    mockIsPreferredCurrencyLoading = true;
    render(<BudgetForm />);

    expect(screen.getByTestId("budget-form-submit")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));
    expect(mockedCreateBudgetService).not.toHaveBeenCalled();
  });

  it("blocks a currency-less renewal until it can use the loaded preference", () => {
    mockCategoryError = null;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    mockPreferredCurrency = "USD";
    mockIsPreferredCurrencyLoading = true;
    const legacyRenewalSource = {
      ...RENEWAL_SOURCE,
      currency: null,
    } as unknown as Budget;

    const { rerender } = render(
      <BudgetForm renewalSource={legacyRenewalSource} />
    );

    expect(screen.getByTestId("budget-form-submit")).toHaveProp(
      "accessibilityState",
      { disabled: true }
    );

    mockIsPreferredCurrencyLoading = false;
    rerender(<BudgetForm renewalSource={legacyRenewalSource} />);

    expect(screen.getByTestId("budget-currency-selector")).toHaveTextContent(
      /USD/
    );
  });

  it("uses the loaded preference unless the user already selected a currency", async () => {
    mockCategoryError = null;
    mockPreferredCurrency = "USD";
    mockIsPreferredCurrencyLoading = true;
    const { rerender } = render(<BudgetForm />);

    mockPreferredCurrency = "EGP";
    mockIsPreferredCurrencyLoading = false;
    rerender(<BudgetForm />);

    await waitFor(() =>
      expect(screen.getByTestId("budget-currency-selector")).toHaveTextContent(
        /EGP/
      )
    );
    fireEvent.press(screen.getByTestId("budget-currency-selector"));
    fireEvent.press(screen.getByTestId("currency-picker-option-usd"));

    mockPreferredCurrency = "EGP";
    rerender(<BudgetForm />);
    expect(screen.getByTestId("budget-currency-selector")).toHaveTextContent(
      /USD/
    );
  });

  it("blocks malformed budget-limit input", () => {
    mockCategoryError = null;
    render(<BudgetForm />);

    fireEvent.press(
      screen.getByRole("button", {
        name: "accessibility_global_budget_type",
      })
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("budget_name_placeholder"),
      "Monthly spending"
    );
    fireEvent.changeText(screen.getByPlaceholderText("0.00"), "1e3");
    fireEvent.press(screen.getByRole("button", { name: "create_budget" }));

    expect(screen.getByText("validation_amount_invalid")).toBeOnTheScreen();
    expect(mockedCreateBudgetService).not.toHaveBeenCalled();
  });

  it("lets creation select a supported currency and explains the choice is final", () => {
    mockCategoryError = null;
    render(<BudgetForm />);

    expect(
      screen.getByText("budget_currency_immutable_info")
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("budget-currency-selector"));
    fireEvent.press(screen.getByTestId("currency-picker-option-usd"));

    expect(screen.getByTestId("budget-currency-selector")).toHaveTextContent(
      /USD/
    );
  });

  it("shows a saved budget currency as read-only during editing", () => {
    mockCategoryError = null;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    render(<BudgetForm existingBudget={RENEWAL_SOURCE} />);

    expect(screen.getByTestId("budget-currency-read-only")).toBeOnTheScreen();
    expect(screen.queryByTestId("budget-currency-selector")).toBeNull();
  });

  it("does not persist the preferred-currency fallback when editing a legacy budget", async () => {
    mockCategoryError = null;
    mockCategoryMap = new Map([
      ["education", { displayName: "Education" } as unknown as Category],
    ]);
    const legacyBudget = {
      ...RENEWAL_SOURCE,
      currency: null,
      period: "MONTHLY",
      periodStart: null,
      periodEnd: null,
    } as unknown as Budget;

    render(<BudgetForm existingBudget={legacyBudget} />);
    fireEvent.press(screen.getByRole("button", { name: "save_changes" }));

    await waitFor(() =>
      expect(mockedUpdateBudgetService).toHaveBeenCalledTimes(1)
    );
    expect(mockedUpdateBudgetService.mock.calls[0]?.[0]).toBe("budget-1");
    expect(mockedUpdateBudgetService.mock.calls[0]?.[1]).not.toHaveProperty(
      "currency"
    );
  });
});
