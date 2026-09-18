import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

interface ObservedBarChartProps {
  readonly scrollToIndex?: number;
  readonly data: readonly unknown[];
}

const mockObservedBarChartProps: ObservedBarChartProps[] = [];

jest.mock("react-native-gifted-charts", () => {
  const react = jest.requireActual<typeof import("react")>("react");
  const reactNative = jest.requireActual<typeof import("react-native")>(
    "react-native"
  );
  return {
    __esModule: true,
    BarChart: (props: ObservedBarChartProps): React.ReactElement => {
      mockObservedBarChartProps.push(props);
      return react.createElement(reactNative.View, {
        testID: "mock-bar-chart",
      });
    },
  };
});

jest.mock("@/hooks/useAnalytics", () => ({
  useMonthlyChartData: jest.fn(
    (
      _months: number,
      _accountIds: string[] | undefined,
      type: string
    ): {
      data: Array<{ label: string; value: number }>;
      isLoading: boolean;
      error: Error | null;
      refetch: () => void;
    } => {
      const series = type === "EXPENSE" ? mockExpenseSeries : mockIncomeSeries;
      return {
        data: series.map((value, index) => ({
          label: `M${index + 1}Extra`,
          value,
        })),
        isLoading: false,
        error: null,
        refetch: (): void => undefined,
      };
    }
  ),
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { isDark: boolean } => ({ isDark: false }),
}));

jest.mock("react-i18next", () => ({
  useTranslation: (): { readonly t: (key: string) => string } => ({
    t: (key: string): string => key,
  }),
}));

import { MonthlyExpenseChart } from "@/components/stats/MonthlyExpenseChart";

let mockExpenseSeries: number[] = [];
let mockIncomeSeries: number[] = [];

function zeros(count: number): number[] {
  return new Array<number>(count).fill(0);
}

function setSeries(expense: number[], income: number[]): void {
  mockExpenseSeries = expense;
  mockIncomeSeries = income;
}

function latestBarChartProps(): ObservedBarChartProps {
  const props = mockObservedBarChartProps.at(-1);
  if (!props) {
    throw new Error("BarChart was not rendered");
  }
  return props;
}

describe("MonthlyExpenseChart initial focus", () => {
  beforeEach(() => {
    setSeries([], []);
    mockObservedBarChartProps.length = 0;
  });

  it("focuses the earliest month with expense activity while keeping leading empty months", () => {
    setSeries([0, 0, 500, 0, 0, 0], zeros(6));

    render(<MonthlyExpenseChart currency="EGP" />);

    screen.getByTestId("mock-bar-chart");
    // Month 3 (index 2) is the earliest with activity; each month renders an
    // income + expense bar pair, so its first bar sits at bar index 4.
    expect(latestBarChartProps().scrollToIndex).toBe(4);
    expect(latestBarChartProps().data).toHaveLength(12);
  });

  it("focuses the earliest month with income-only activity", () => {
    setSeries(zeros(6), [0, 250, 0, 0, 0, 0]);

    render(<MonthlyExpenseChart currency="EGP" />);

    screen.getByTestId("mock-bar-chart");
    expect(latestBarChartProps().scrollToIndex).toBe(2);
  });

  it("keeps the default position when the first displayed month already has activity", () => {
    setSeries([400, 0, 0, 0, 0, 0], zeros(6));

    render(<MonthlyExpenseChart currency="EGP" />);

    screen.getByTestId("mock-bar-chart");
    expect(latestBarChartProps().scrollToIndex).toBe(0);
  });

  it("keeps the default position when the entire period is empty", () => {
    setSeries(zeros(6), zeros(6));

    render(<MonthlyExpenseChart currency="EGP" />);

    screen.getByTestId("mock-bar-chart");
    expect(latestBarChartProps().scrollToIndex).toBe(0);
    expect(latestBarChartProps().data).toHaveLength(12);
  });

  it("recalculates the focus when the period changes to 12 months", () => {
    setSeries(zeros(6), zeros(6));

    render(<MonthlyExpenseChart currency="EGP" />);
    expect(latestBarChartProps().scrollToIndex).toBe(0);

    setSeries([0, 0, 0, 300, 0, 0, 0, 0, 0, 0, 0, 0], zeros(12));
    fireEvent.press(screen.getByText("12m"));

    expect(latestBarChartProps().data).toHaveLength(24);
    expect(latestBarChartProps().scrollToIndex).toBe(6);
  });

  it("recalculates the focus when the selected currency changes", () => {
    setSeries(zeros(6), zeros(6));

    const { rerender } = render(<MonthlyExpenseChart currency="EGP" />);
    expect(latestBarChartProps().scrollToIndex).toBe(0);

    setSeries([0, 100, 0, 0, 0, 0], zeros(6));
    rerender(<MonthlyExpenseChart currency="USD" />);

    expect(latestBarChartProps().scrollToIndex).toBe(2);
  });
});
