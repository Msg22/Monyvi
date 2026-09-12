import { readFileSync } from "node:fs";
import path from "node:path";
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
import type { Category } from "@monyvi/db";
import type { BudgetRenewalSource } from "@/components/budget/budget-renewal-form-values";
import { palette } from "@/constants/colors";
import type { CreateBudgetInput } from "@/services/budget-service";

type CategoryLookupFixture = Pick<Category, "id" | "displayName">;
type CreatedBudgetStub = { readonly id: string };

function buildCategoryLookup(): Map<string, CategoryLookupFixture> {
  return new Map([
    ["food", { id: "food", displayName: "Food & Dining" }],
  ]);
}

let mockCategoryMap = buildCategoryLookup();
const mockCreateBudget = jest.fn<
  Promise<CreatedBudgetStub>,
  [CreateBudgetInput]
>();
const mockShouldUseCompactLayout = jest.fn(() => false);

jest.mock("@/constants/ui", () => {
  const actual = jest.requireActual<typeof import("@/constants/ui")>(
    "@/constants/ui"
  );
  return {
    ...actual,
    shouldUseCompactLayout: () => mockShouldUseCompactLayout(),
  };
});

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({
    name,
    color,
  }: {
    readonly name: string;
    readonly color?: string;
  }) => (
    <MockText testID={`icon-${name}`} accessibilityLabel={color}>
      {name}
    </MockText>
  ),
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
  createBudget: (input: CreateBudgetInput) => mockCreateBudget(input),
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
    <>
      <MockText>alert_threshold</MockText>
      <MockTouchableOpacity
        testID="mock-threshold"
        onPress={() => onValueChange(65)}
      >
        <MockText>{value}</MockText>
      </MockTouchableOpacity>
    </>
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

const BUDGET_FORM_SECTIONS_SOURCE = readFileSync(
  path.resolve(__dirname, "../../../components/budget/BudgetFormSections.tsx"),
  "utf8"
);

const RENEWAL_SOURCE: BudgetRenewalSource = {
  name: "Food budget",
  type: "CATEGORY",
  categoryId: "food",
  amount: 5000,
  currency: "EGP",
  period: "CUSTOM",
  periodStart: new Date("2026-08-01T12:00:00.000Z"),
  periodEnd: new Date("2026-08-11T12:00:00.000Z"),
  alertThreshold: 80,
};

describe("BudgetForm premium flow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
    mockCreateBudget.mockReset();
    mockShouldUseCompactLayout.mockReturnValue(false);
    mockCategoryMap = buildCategoryLookup();
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
    expect(within(preview).getByText("EGP 5,000")).toBeOnTheScreen();
    expect(within(preview).getByText(/EGP 3,250/)).toBeOnTheScreen();
    expect(
      within(preview).getByText("preview_resets_on 2026-09-13")
    ).toBeOnTheScreen();
    expect(within(preview).getByText("2026-09-06")).toBeOnTheScreen();
  });

  it("shows an unavailable preview instead of malformed non-empty amount text", () => {
    render(<BudgetForm />);

    fireEvent.changeText(screen.getByPlaceholderText("0.00"), "1e3");

    const preview = screen.getByTestId("budget-live-preview");
    expect(within(preview).queryByText("EGP 1e3")).not.toBeOnTheScreen();
    expect(within(preview).queryByText("EGP 0")).not.toBeOnTheScreen();
    expect(within(preview).getAllByText("EGP —")).toHaveLength(2);
  });

  it("pads sticky actions above the bottom safe-area inset", () => {
    render(<BudgetForm />);

    expect(screen.getByTestId("budget-form-actions")).toHaveStyle({
      paddingBottom: 40,
    });
  });

  it("preserves currency-specific precision in the alert preview", () => {
    const kwdRenewalSource: BudgetRenewalSource = {
      ...RENEWAL_SOURCE,
      amount: 1.01,
      currency: "KWD",
      alertThreshold: 65,
    };

    render(<BudgetForm renewalSource={kwdRenewalSource} />);

    const preview = screen.getByTestId("budget-live-preview");
    expect(within(preview).getByText(/KWD 0\.657/)).toBeOnTheScreen();
  });

  it("uses the NativeWind minimum touch-height utility for currency selection", () => {
    const selectorStart = BUDGET_FORM_SECTIONS_SOURCE.indexOf(
      'testID="budget-currency-selector"'
    );
    expect(selectorStart).toBeGreaterThanOrEqual(0);

    const selectorEnd = BUDGET_FORM_SECTIONS_SOURCE.indexOf(
      "</TouchableOpacity>",
      selectorStart
    );
    expect(selectorEnd).toBeGreaterThan(selectorStart);

    const selectorSource = BUDGET_FORM_SECTIONS_SOURCE.slice(
      selectorStart,
      selectorEnd
    );
    expect(selectorSource).toContain(
      'className="me-2 min-h-11 flex-row items-center"'
    );
    expect(selectorSource).not.toContain("minHeight");
  });

  it("uses palette tokens for white action icons", () => {
    render(<BudgetForm />);

    expect(screen.getByTestId("icon-checkmark")).toHaveProp(
      "accessibilityLabel",
      palette.slate[25]
    );
    expect(screen.getByTestId("icon-add-circle-outline")).toHaveProp(
      "accessibilityLabel",
      palette.slate[25]
    );
  });

  it("keeps preview metrics in a row on an ordinary layout", () => {
    render(<BudgetForm />);

    expect(screen.getByTestId("budget-preview-metrics")).toHaveProp(
      "className",
      "flex-row border-t border-slate-200 px-3 py-4 dark:border-slate-700"
    );
  });

  it("stacks preview metrics on a compact layout", () => {
    mockShouldUseCompactLayout.mockReturnValue(true);

    render(<BudgetForm />);

    expect(screen.getByTestId("budget-preview-metrics")).toHaveProp(
      "className",
      "flex-col border-t border-slate-200 px-3 py-4 dark:border-slate-700"
    );
  });

  it("renders a single alert threshold heading", () => {
    render(<BudgetForm />);

    expect(screen.getAllByText("alert_threshold")).toHaveLength(1);
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
