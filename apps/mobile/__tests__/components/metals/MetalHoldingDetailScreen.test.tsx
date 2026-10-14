import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ testID }: { readonly testID?: string }): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    const View = ReactNative.View;
    return <View testID={testID ?? "mock-ionicons"} />;
  },
  MaterialCommunityIcons: (): React.JSX.Element => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    const View = ReactNative.View;
    return <View testID="mock-material-icons" />;
  },
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: (): {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  } => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

let mockCurrentTestLanguage: "en" | "ar" = "en";

function mockResolveTranslationPath(
  source: Record<string, unknown>,
  path: string
): string | null {
  const segments = path.split(".");
  let current: unknown = source;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : null;
}

function mockInterpolateValues(
  template: string,
  values?: Record<string, unknown>
): string {
  if (!values) return template;
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_fullMatch: string, key: string): string => {
      const val = values[key];
      if (
        typeof val === "string" ||
        typeof val === "number" ||
        typeof val === "boolean"
      ) {
        return String(val);
      }
      return "";
    }
  );
}

jest.mock("react-i18next", () => {
  const commonArActual = jest.requireActual<Record<string, unknown>>(
    "@/locales/ar/common.json"
  );
  const metalsArActual = jest.requireActual<Record<string, unknown>>(
    "@/locales/ar/metals.json"
  );
  const commonEnActual = jest.requireActual<Record<string, unknown>>(
    "@/locales/en/common.json"
  );
  const metalsEnActual = jest.requireActual<Record<string, unknown>>(
    "@/locales/en/metals.json"
  );

  const mockTranslations: Record<
    "en" | "ar",
    {
      readonly metals: Record<string, unknown>;
      readonly common: Record<string, unknown>;
    }
  > = {
    en: { metals: metalsEnActual, common: commonEnActual },
    ar: { metals: metalsArActual, common: commonArActual },
  };

  return {
    useTranslation: (
      ns?: string | readonly string[]
    ): {
      readonly t: (key: string, options?: Record<string, unknown>) => string;
      readonly i18n: {
        readonly language: string;
        readonly resolvedLanguage: string;
        readonly changeLanguage: jest.Mock;
      };
    } => {
      const defaultNs: string =
        typeof ns === "string" ? ns : (ns?.[0] ?? "metals");
      const lang = mockCurrentTestLanguage;
      const langResources = mockTranslations[lang];

      const t = (key: string, options?: Record<string, unknown>): string => {
        const explicitNs: string =
          typeof options?.ns === "string" ? options.ns : defaultNs;
        const targetStore =
          explicitNs === "common" ? langResources.common : langResources.metals;
        const resolved = mockResolveTranslationPath(targetStore, key);
        if (resolved !== null) {
          return mockInterpolateValues(resolved, options);
        }
        return key;
      };

      return {
        t,
        i18n: {
          language: lang,
          resolvedLanguage: lang,
          changeLanguage: jest.fn(),
        },
      };
    },
  };
});

function createActiveModel(
  overrides?: Partial<MetalDetailReadModel>
): MetalDetailReadModel {
  return {
    attribution: null,
    currentValueCurrency: "EGP",
    currentValueDecimal: "1000.00",
    currentValueObservedAt: new Date("2026-10-10T12:00:00.000Z"),
    currentValueRateStatus: null,
    id: "holding-1",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    itemForm: "bar",
    metalType: "GOLD",
    name: "Gold Bar",
    notes: null,
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2026-10-10T00:00:00.000Z"),
    purchaseDateMarketReference: {
      status: "fetch_failed",
      error: new Error("Network offline"),
    },
    purchaseDateMarketReferenceContextKey: "context-key-1",
    purchasePriceDecimal: "800.00",
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    reconciliationState: "local_complete",
    renderKey: null,
    requiresCompleteMaterialCorrection: false,
    status: "active",
    terminalFacts: null,
    timeline: [],
    totalGainDecimal: "200.00",
    unavailableExactFacts: [],
    weightGramsDecimal: "10",
    ...overrides,
  };
}

describe("MetalHoldingDetailScreen purchaseDate rate retry", () => {
  beforeEach(() => {
    mockCurrentTestLanguage = "en";
  });

  it("renders localized retry button accessible by role beside Market rate on purchase date when fetch_failed", () => {
    const onRetryHistorical = jest.fn();
    const model = createActiveModel();

    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onRetry={jest.fn()}
        onRetryHistoricalReference={onRetryHistorical}
      />
    );

    // Holding details remain visible
    expect(screen.getByText("Gold Bar")).toBeTruthy();
    expect(
      screen.getByTestId("metal-holding-purchase-date-market-rate")
    ).toBeTruthy();

    expect(
      screen.getByRole("button", {
        name: "Market rate on purchase date: Retry",
      })
    ).toBeTruthy();

    fireEvent.press(
      screen.getByRole("button", {
        name: "Market rate on purchase date: Retry",
      })
    );
    expect(onRetryHistorical).toHaveBeenCalledTimes(1);
  });

  it("suppresses retry button when offline even if status is fetch_failed", () => {
    const onRetryHistorical = jest.fn();
    const model = createActiveModel({
      purchaseDateMarketReference: {
        status: "fetch_failed",
        error: new Error("network down"),
      },
    });

    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={true}
        model={model}
        onRetry={jest.fn()}
        onRetryHistoricalReference={onRetryHistorical}
      />
    );

    expect(
      screen.queryByRole("button", {
        name: "Market rate on purchase date: Retry",
      })
    ).toBeNull();
    expect(
      screen.queryByTestId("metal-holding-purchase-date-market-rate-retry")
    ).toBeNull();
  });

  it("does not render historical retry button when market rate is available", () => {
    const onRetryHistorical = jest.fn();
    const model = createActiveModel({
      purchaseDateMarketReference: {
        status: "available",
        origin: "daily_history",
        rateDate: "2026-10-10",
        purchaseCurrency: "EGP",
        selectedPurityPerGramDecimal: "5000",
      },
    });

    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onRetry={jest.fn()}
        onRetryHistoricalReference={onRetryHistorical}
      />
    );

    expect(
      screen.queryByRole("button", {
        name: "Market rate on purchase date: Retry",
      })
    ).toBeNull();
    expect(
      screen.queryByTestId("metal-holding-purchase-date-market-rate-retry")
    ).toBeNull();
  });

  it("does not render historical retry button when market rate is unavailable (not failed)", () => {
    const onRetryHistorical = jest.fn();
    const model = createActiveModel({
      purchaseDateMarketReference: {
        status: "unavailable",
        reason: "date_unavailable",
      },
    });

    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onRetry={jest.fn()}
        onRetryHistoricalReference={onRetryHistorical}
      />
    );

    expect(
      screen.queryByRole("button", {
        name: "Market rate on purchase date: Retry",
      })
    ).toBeNull();
    expect(
      screen.queryByTestId("metal-holding-purchase-date-market-rate-retry")
    ).toBeNull();
  });

  it.each([
    { name: "ordinary viewport", width: 390 },
    { name: "compact viewport", width: 320 },
  ])("renders accessible retry button in %s", ({ width }) => {
    const ReactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width,
      height: 800,
      scale: 2,
      fontScale: 1,
    });

    const onRetryHistorical = jest.fn();
    const model = createActiveModel();

    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onRetry={jest.fn()}
        onRetryHistoricalReference={onRetryHistorical}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "Market rate on purchase date: Retry",
      })
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole("button", {
        name: "Market rate on purchase date: Retry",
      })
    );
    expect(onRetryHistorical).toHaveBeenCalledTimes(1);
  });

  it("renders localized retry button accessible in Arabic locale", () => {
    mockCurrentTestLanguage = "ar";
    const onRetryHistorical = jest.fn();
    const model = createActiveModel();

    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onRetry={jest.fn()}
        onRetryHistoricalReference={onRetryHistorical}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "سعر السوق في تاريخ الشراء: إعادة المحاولة",
      })
    ).toBeTruthy();
    fireEvent.press(
      screen.getByRole("button", {
        name: "سعر السوق في تاريخ الشراء: إعادة المحاولة",
      })
    );
    expect(onRetryHistorical).toHaveBeenCalledTimes(1);
  });
});
