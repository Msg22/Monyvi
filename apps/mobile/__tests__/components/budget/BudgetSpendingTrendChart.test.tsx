import React from "react";
import { render, screen } from "@testing-library/react-native";
import { I18nManager } from "react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let mockIsReducedMotion = false;
const mockCancelAnimation = jest.fn();
const mockWithTiming = jest.fn((value: number): number => value);

jest.mock("react-native-reanimated", () => {
  const ReactNative =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View: ReactNative.View },
    cancelAnimation: (...args: readonly unknown[]): void => {
      mockCancelAnimation(...args);
    },
    useAnimatedStyle: (factory: () => object): object => factory(),
    useReducedMotion: (): boolean => mockIsReducedMotion,
    useSharedValue: (value: number): { value: number } => ({ value }),
    withTiming: (value: number): number => mockWithTiming(value),
    Easing: { out: (value: unknown): unknown => value, cubic: "cubic" },
  };
});
jest.mock("@/context/LocaleContext", () => ({
  useLocale: (): { readonly language: string } => ({ language: "en" }),
}));

import { BudgetSpendingTrendChart } from "@/components/budget/BudgetSpendingTrendChart";

const weeks = Array.from({ length: 6 }, (_, index) => ({
  id: `week-${index + 1}`,
  start: new Date(2026, 7, 1 + index * 7),
  end: new Date(2026, 7, Math.min(7 + index * 7, 31)),
  actualAmount: 200 + index * 100,
  paceAmount: 500,
}));

describe("BudgetSpendingTrendChart", () => {
  beforeEach(() => {
    mockIsReducedMotion = false;
    mockCancelAnimation.mockClear();
    mockWithTiming.mockClear();
  });

  it("keeps the axis fixed and every equal-width week horizontally scrollable", () => {
    render(
      <BudgetSpendingTrendChart data={weeks} currency="EGP" paceState="BELOW" />
    );

    expect(screen.getByText("Weekly spending trend")).toBeOnTheScreen();
    expect(screen.getByTestId("budget-trend-y-axis")).toBeOnTheScreen();
    expect(screen.getByTestId("budget-trend-scroll")).toHaveProp(
      "horizontal",
      true
    );
    expect(screen.getAllByTestId(/^budget-trend-week-/)).toHaveLength(6);
    expect(screen.getByText("200 EGP")).toBeOnTheScreen();
    expect(screen.getByText("Below budget pace")).toBeOnTheScreen();
    expect(
      screen.getByLabelText(/Week 1.*You spent.*Budget pace/)
    ).toBeOnTheScreen();
  });

  it("uses AA graphical tones for actual and pace series", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../components/budget/BudgetSpendingTrendChart.tsx"
      ),
      "utf8"
    );
    expect(source).toContain("bg-nileGreen-700 dark:bg-nileGreen-400");
    expect(source).toContain("border-slate-500 dark:border-slate-400");
  });

  it("omits active pace insight when pace state is unavailable", () => {
    render(
      <BudgetSpendingTrendChart data={weeks} currency="EGP" paceState={null} />
    );
    expect(screen.queryByText("Below budget pace")).toBeNull();
    expect(screen.queryByText("On budget pace")).toBeNull();
    expect(screen.queryByText("Above budget pace")).toBeNull();
  });

  it("renders without timing motion when reduced motion is requested", () => {
    mockIsReducedMotion = true;
    const view = render(
      <BudgetSpendingTrendChart
        data={weeks.slice(0, 1)}
        currency="EGP"
        paceState="ON"
      />
    );
    expect(mockWithTiming).not.toHaveBeenCalled();
    view.unmount();
    expect(mockCancelAnimation).toHaveBeenCalled();
  });

  it("uses RTL logical week ordering without reversing source data", () => {
    const original = I18nManager.isRTL;
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: true,
    });
    render(
      <BudgetSpendingTrendChart
        data={weeks.slice(0, 2)}
        currency="EGP"
        paceState="ABOVE"
      />
    );
    expect(screen.getByTestId("budget-trend-scroll-content")).toBeOnTheScreen();
    expect(
      readFileSync(
        resolve(
          __dirname,
          "../../../components/budget/BudgetSpendingTrendChart.tsx"
        ),
        "utf8"
      )
    ).toContain('I18nManager.isRTL ? "flex-row-reverse" : "flex-row"');
    Object.defineProperty(I18nManager, "isRTL", {
      configurable: true,
      value: original,
    });
  });

  it("includes years when a custom period crosses a calendar year", () => {
    render(
      <BudgetSpendingTrendChart
        data={[
          {
            id: "year-boundary",
            start: new Date(2025, 11, 29),
            end: new Date(2026, 0, 4),
            actualAmount: 200,
            paceAmount: 300,
          },
        ]}
        currency="EGP"
        paceState={null}
      />
    );

    expect(screen.getByText("Dec 29, 2025–Jan 4, 2026")).toBeOnTheScreen();
  });
});
