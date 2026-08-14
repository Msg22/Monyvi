import { render, screen } from "@testing-library/react-native";
import React from "react";
import { View } from "react-native";

let mockSearchParams: { readonly id?: string; readonly renewFrom?: string } =
  {};
interface MockEditableBudgetResult {
  readonly budget: unknown;
  readonly isLoading: boolean;
  readonly loadErrorKey: "budget_not_found" | "load_budget_error" | null;
}

const mockUseEditableBudget = jest.fn<
  MockEditableBudgetResult,
  [string | undefined, "EDIT" | "RENEWAL"]
>();
const mockBudgetForm = jest.fn(
  (_props: {
    readonly existingBudget?: unknown;
    readonly renewalSource?: unknown;
  }): React.JSX.Element => <View testID="budget-form" />
);

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

jest.mock("@/components/navigation/PageHeader", () => ({
  PageHeader: (): null => null,
}));

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("@/hooks/useEditableBudget", () => ({
  useEditableBudget: (
    budgetId: string | undefined,
    sourceKind: "EDIT" | "RENEWAL"
  ) => mockUseEditableBudget(budgetId, sourceKind),
}));

jest.mock("@/components/budget/BudgetForm", () => ({
  BudgetForm: (props: {
    readonly existingBudget?: unknown;
    readonly renewalSource?: unknown;
  }): React.JSX.Element => mockBudgetForm(props),
}));

import CreateBudgetScreen from "@/app/(private)/create-budget";

describe("budget renewal form integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = {};
    mockUseEditableBudget.mockReturnValue({
      budget: undefined,
      isLoading: false,
      loadErrorKey: null,
    });
  });

  it("loads renewFrom as a create source and never as an edit budget", () => {
    const source = { id: "expired-1", name: "Expired custom" };
    mockSearchParams = { renewFrom: "expired-1" };
    mockUseEditableBudget.mockReturnValue({
      budget: source,
      isLoading: false,
      loadErrorKey: null,
    });

    render(<CreateBudgetScreen />);

    expect(screen.getByTestId("budget-form")).toBeOnTheScreen();
    expect(mockUseEditableBudget).toHaveBeenCalledWith("expired-1", "RENEWAL");
    expect(mockBudgetForm).toHaveBeenCalledWith({
      existingBudget: undefined,
      renewalSource: source,
    });
  });

  it("keeps id in edit mode without treating it as renewal", () => {
    const existing = { id: "budget-1", name: "Current budget" };
    mockSearchParams = { id: "budget-1" };
    mockUseEditableBudget.mockReturnValue({
      budget: existing,
      isLoading: false,
      loadErrorKey: null,
    });

    render(<CreateBudgetScreen />);

    expect(mockUseEditableBudget).toHaveBeenCalledWith("budget-1", "EDIT");
    expect(mockBudgetForm).toHaveBeenCalledWith({
      existingBudget: existing,
      renewalSource: undefined,
    });
  });
});
