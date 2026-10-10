import { fireEvent, screen } from "@testing-library/react-native";

import {
  mockTranslations,
  portfolio,
  renderPortfolio,
} from "./portfolio-surfaces-fixtures";

jest.mock("react-i18next", () => ({
  useTranslation: (): {
    readonly i18n: { readonly resolvedLanguage: string };
    readonly t: (key: string, values?: Record<string, string>) => string;
  } => ({
    i18n: {
      resolvedLanguage: "en",
    },
    t: (key: string, values?: Record<string, string>): string => {
      const template = mockTranslations[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (result, [name, value]) => result.replace(`{{${name}}}`, String(value)),
        template
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");

  return {
    Ionicons: ({ name }: { readonly name: string }): React.JSX.Element =>
      createElement(View, { testID: `icon-${name}` }),
  };
});

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("@/hooks/useUiPolishCopy", () => ({
  useUiPolishCopy: () => ({
    metals_empty: {
      header: "My Metals",
      title: "Start tracking your gold and silver",
      body: "Add your first holding to follow its value over time.",
      cta: "Add your first holding",
    },
  }),
}));

describe("portfolio inline empty states", () => {
  it("keeps summary, Prices per gram, Your items, and empty History around the inline zero-active state", (): void => {
    const onAddHoldingPress = jest.fn();
    const onHistoryPress = jest.fn();
    renderPortfolio({
      onAddHoldingPress,
      onHistoryPress,
      portfolio: {
        ...portfolio,
        activeHoldings: [],
        activeTotalDecimal: "0",
        holdings: [],
        listState: "PORTFOLIO_EMPTY",
        recentHistory: [],
      },
    });

    expect(screen.getByTestId("metal-portfolio-root")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-summary-layout")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-rates-section")).toBeTruthy();
    expect(screen.getByText("Your items")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-empty-state")).toBeTruthy();
    expect(screen.queryByTestId("metal-portfolio-filter-bar")).toBeNull();
    expect(screen.getByTestId("metal-portfolio-recent-history")).toBeTruthy();
    expect(
      screen.getByTestId("metal-portfolio-recent-history-empty")
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId("metal-empty-add"));
    expect(onAddHoldingPress).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId("metal-portfolio-view-all"));
    expect(onHistoryPress).toHaveBeenCalledTimes(1);
  });

  it("preserves latest terminal History when no active items remain", (): void => {
    const disposed = {
      ...portfolio.activeHoldings[0],
      id: "disposed-only",
      name: "Gift",
      status: "disposed" as const,
      recentHistoryOutcome: "neutral" as const,
    };
    renderPortfolio({
      portfolio: {
        ...portfolio,
        activeHoldings: [],
        activeTotalDecimal: "0",
        holdings: [],
        hasTerminalHistory: true,
        listState: "PORTFOLIO_EMPTY",
        recentHistory: [disposed],
      },
    });
    expect(screen.getByTestId("metal-portfolio-empty-state")).toBeTruthy();
    expect(
      screen.getByTestId("metal-portfolio-history-disposed-only")
    ).toBeTruthy();
    expect(
      screen.queryByTestId("metal-portfolio-recent-history-empty")
    ).toBeNull();
  });

  it("keeps filters for a selected-filter empty state and skeletons unready summary values", (): void => {
    renderPortfolio({
      readiness: {
        holdings: true,
        rateCurrency: false,
        recentHistory: false,
        realizedSale: false,
        summary: false,
      },
      portfolio: {
        ...portfolio,
        holdings: [],
        listState: "FILTER_EMPTY",
      },
    });

    expect(screen.getByTestId("metal-portfolio-filter-bar")).toBeTruthy();
    expect(screen.queryByTestId("metal-portfolio-empty-state")).toBeNull();
    expect(screen.getByTestId("metal-portfolio-summary-skeleton")).toBeTruthy();
    expect(screen.getByTestId("metal-portfolio-history-skeleton")).toBeTruthy();
  });
});
