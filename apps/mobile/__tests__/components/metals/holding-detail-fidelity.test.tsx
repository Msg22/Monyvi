import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { getHoldingActionDescriptors } from "@/components/metals/holding-actions/registry";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

let mockScreenWidth = 390;
let mockFontScale = 1;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
    readonly fontScale: number;
  } => ({
    width: mockScreenWidth,
    height: 844,
    scale: 1,
    fontScale: mockFontScale,
  }),
}));

const translations: Readonly<Record<string, string>> = {
  "actions.delete": "Delete holding",
  "actions.dispose": "No longer in my possession",
  "actions.edit": "Edit details",
  "actions.sell": "Sell holding",
  "detail.acquired": "Acquired",
  "detail.calculation_breakdown_unavailable":
    "Breakdown unavailable. The total is based on your recorded details.",
  "detail.calculation_disclosure": "How this value was calculated",
  "detail.currency_movement": "Currency movement",
  "detail.current_value": "Current value",
  "detail.current_value_unavailable": "Current value unavailable",
  "detail.current_value_rate_unavailable":
    "A current market rate is unavailable. Your holding details are still saved here.",
  "detail.display_rounding":
    "Displayed amounts are rounded, so the parts may differ slightly from the total.",
  "detail.fact_accessibility": "{{label}}: {{value}}",
  "detail.follow_value": "Follow the value",
  "detail.history": "History",
  "detail.metal_movement": "Metal movement",
  "detail.offline": "Offline mode",
  "detail.paid": "{{amount}} paid",
  "detail.physical_facts": "Physical facts",
  "detail.purchase_premium_costs": "Purchase premium and costs",
  "detail.restored": "Restored to Active",
  "detail.since_purchase": "{{amount}} since purchase",
  "detail.timeline_current_value": "Current value",
  "form.bar": "Bar",
  "form.coin": "Coin",
  "form.jewelry": "Jewelry",
  "form.unknown": "Other form",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "rate.missing": "Rates: current rate unavailable",
  purity_gold_999: "24K · 999",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "status.active": "Active",
  "status.sold": "Sold",
  "status.disposed": "Disposed",
  "timeline.add": "Added",
  "timeline.correct": "Details updated",
  weight: "Weight",
  purity: "Purity",
  form_optional: "Physical form (optional)",
  weight_unit: "g",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Readonly<Record<string, string>>): string => {
      const template = translations[key] ?? key;
      return Object.entries(values ?? {}).reduce(
        (value, [name, replacement]) =>
          value.replace(`{{${name}}}`, replacement),
        template
      );
    },
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const renderIcon = ({ testID }: { readonly testID?: string }): React.JSX.Element => {
    const { View } = jest.requireActual(
      "react-native"
    ) as typeof import("react-native");
    return <View testID={testID} />;
  };
  return {
    Ionicons: renderIcon,
    MaterialCommunityIcons: renderIcon,
  };
});

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 0 }),
}));

function activeDetail(
  overrides: Partial<MetalDetailReadModel> = {}
): MetalDetailReadModel {
  return {
    attribution: null,
    currentValueCurrency: "EGP",
    currentValueDecimal: "162317.87",
    currentValueObservedAt: new Date(2026, 7, 25, 10, 30),
    currentValueRateStatus: {
      ageMs: 1_000,
      providerObservedAt: new Date(2026, 7, 25, 10, 30),
      quality: "valid",
      source: "fixture",
      state: "fresh",
    },
    id: "holding-gold-coin",
    isActiveOwnership: true,
    isFinancialActionLocked: false,
    itemForm: "coin",
    metalType: "GOLD",
    name: "Wedding coin",
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "151278.20",
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    reconciliationState: "accepted",
    renderKey: "gold:coin",
    requiresCompleteMaterialCorrection: false,
    status: "active",
    timeline: [
      {
        id: "corrected",
        kind: "correct",
        occurredAt: new Date("2025-06-02T00:00:00.000Z"),
      },
      {
        id: "created",
        kind: "add",
        occurredAt: new Date("2024-03-14T00:00:00.000Z"),
      },
    ],
    totalGainDecimal: "11039.67",
    unavailableExactFacts: [],
    weightGramsDecimal: "31.125",
    ...overrides,
  };
}

describe("approved active holding-detail fidelity", () => {
  beforeEach(() => {
    mockScreenWidth = 390;
    mockFontScale = 1;
  });

  it("renders the approved open composition without a duplicate route title or ERP card", () => {
    const model = activeDetail();

    render(
      <MetalHoldingDetailScreen
        actions={getHoldingActionDescriptors(model)}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onAction={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.queryByText("Holding details")).toBeNull();
    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.not.stringContaining("border")
    );
    expect(screen.getByText("Wedding coin")).toBeTruthy();
    expect(screen.getByText("Gold · 24K · 999 · Coin")).toBeTruthy();
    expect(screen.getByText("EGP 162,317.87")).toBeTruthy();
    expect(screen.getByText("+ EGP 11,039.67 since purchase")).toBeTruthy();
    expect(screen.getByText("Follow the value")).toBeTruthy();
    expect(screen.getByText("EGP 151,278.20 paid")).toBeTruthy();
    expect(
      screen.getByText(
        "Prices last updated 25 Aug 2026 at 10:30 AM. They may have changed since then."
      )
    ).toBeTruthy();
    expect(screen.getByText("Physical facts")).toBeTruthy();
    expect(screen.getByText("31.125 g")).toBeTruthy();
    expect(screen.getByText("Coin")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText(/Details updated/)).toBeTruthy();
  });

  it("formats canonical amounts exactly before localized display", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({
          currentValueDecimal: "9007199254740993.245",
          purchasePriceDecimal: "9007199254740993.245",
          totalGainDecimal: "9007199254740993.255",
        })}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("EGP 9,007,199,254,740,993.24")).toBeTruthy();
    expect(
      screen.getByText("+ EGP 9,007,199,254,740,993.26 since purchase")
    ).toBeTruthy();
    expect(screen.getByText("EGP 9,007,199,254,740,993.24 paid")).toBeTruthy();
  });

  it("preserves action callbacks, safe-area spacing, and the approved action hierarchy", () => {
    const model = activeDetail();
    const onAction = jest.fn();

    render(
      <MetalHoldingDetailScreen
        actions={getHoldingActionDescriptors(model)}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onAction={onAction}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByTestId("metal-holding-detail-actions")).toHaveStyle({
      paddingBottom: 40,
    });
    expect(screen.getByTestId("metal-holding-action-delete")).toHaveProp(
      "className",
      expect.not.stringContaining("border")
    );

    fireEvent.press(screen.getByText("Sell holding"));
    fireEvent.press(screen.getByText("Edit details"));
    fireEvent.press(screen.getByText("No longer in my possession"));
    fireEvent.press(screen.getByText("Delete holding"));

    expect(onAction).toHaveBeenNthCalledWith(1, "sell");
    expect(onAction).toHaveBeenNthCalledWith(2, "edit");
    expect(onAction).toHaveBeenNthCalledWith(3, "dispose");
    expect(onAction).toHaveBeenNthCalledWith(4, "delete");
  });

  it("keeps the bottom safe area when a terminal holding has no actions", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({ isActiveOwnership: false, status: "sold" })}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByTestId("metal-holding-detail-root")).toHaveProp(
      "contentContainerStyle",
      { paddingBottom: 40 }
    );
  });

  it("keeps calculable value while hiding stale warnings and raw provider identifiers", () => {
    render(
      <MetalHoldingDetailScreen
        actions={getHoldingActionDescriptors(activeDetail())}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({
          currentValueRateStatus: {
            ageMs: 90_000_000,
            providerObservedAt: new Date(2026, 7, 24, 10, 30),
            quality: "valid",
            source: "provider-cache",
            state: "stale",
          },
        })}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("EGP 162,317.87")).toBeTruthy();
    expect(screen.queryByText(/outdated/i)).toBeNull();
    expect(screen.queryByText(/provider-cache/)).toBeNull();
  });

  it("renders the calculation components when historical acquisition evidence exists", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({
          attribution: {
            breakdown: { available: true },
            currencyGainDecimal: "2000",
            metalGainDecimal: "9000",
            premiumAndCostsDecimal: "39.67",
            roundingDifferenceDecimal: null,
          },
        })}
        onRetry={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText("How this value was calculated"));
    expect(screen.getByText("Metal movement")).toBeTruthy();
    expect(screen.getByText("EGP 9,000.00")).toBeTruthy();
    expect(screen.getByText("Currency movement")).toBeTruthy();
    expect(screen.getByText("EGP 2,000.00")).toBeTruthy();
    expect(screen.getByText("Purchase premium and costs")).toBeTruthy();
    expect(screen.getByText("EGP 39.67")).toBeTruthy();
    expect(screen.queryByText(/Breakdown unavailable/)).toBeNull();
  });

  it("renders the friendly fallback only when historical acquisition evidence is absent", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({ attribution: null })}
        onRetry={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText("How this value was calculated"));
    expect(
      screen.getByText(
        "Breakdown unavailable. The total is based on your recorded details."
      )
    ).toBeTruthy();
  });

  it("explains a missing current rate without hiding the holding's saved facts", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeDetail({
          currentValueDecimal: null,
          currentValueRateStatus: {
            ageMs: null,
            providerObservedAt: null,
            quality: "missing",
            source: null,
            state: "missing",
          },
          totalGainDecimal: null,
        })}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("Current value unavailable")).toBeTruthy();
    expect(
      screen.getByText(
        "A current market rate is unavailable. Your holding details are still saved here."
      )
    ).toBeTruthy();
    expect(screen.getByText("Physical facts")).toBeTruthy();
    expect(screen.queryByText("How this value was calculated")).toBeNull();
  });

  it("keeps text legible in dark mode and uses a loss color for negative performance", () => {
    const model = activeDetail({ totalGainDecimal: "-11039.67" });

    render(
      <MetalHoldingDetailScreen
        actions={getHoldingActionDescriptors(model)}
        error={null}
        isLoading={false}
        isOffline={false}
        model={model}
        onAction={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("Wedding coin")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-primary-dark")
    );
    expect(screen.getByText("- EGP 11,039.67 since purchase")).toHaveProp(
      "className",
      expect.stringContaining("text-red-600")
    );
  });

  it.each(["0.004", "-0.004"])(
    "renders a sub-cent gain %s as neutral display zero",
    (totalGainDecimal) => {
      render(
        <MetalHoldingDetailScreen
          actions={[]}
          error={null}
          isLoading={false}
          isOffline={false}
          model={activeDetail({ totalGainDecimal })}
          onRetry={jest.fn()}
        />
      );

      expect(screen.getByText("EGP 0.00 since purchase")).toHaveProp(
        "className",
        expect.stringContaining("text-text-secondary")
      );
    }
  );

  it("keeps the ordinary hero row and reflows only for compact or enlarged-text layouts", () => {
    const model = activeDetail();
    const props = {
      actions: getHoldingActionDescriptors(model),
      error: null,
      isLoading: false,
      isOffline: false,
      model,
      onAction: jest.fn(),
      onRetry: jest.fn(),
    } as const;
    const { rerender } = render(<MetalHoldingDetailScreen {...props} />);

    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.stringContaining("flex-row")
    );

    mockScreenWidth = 320;
    rerender(<MetalHoldingDetailScreen {...props} />);
    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );

    mockScreenWidth = 390;
    mockFontScale = 1.5;
    rerender(<MetalHoldingDetailScreen {...props} />);
    expect(screen.getByTestId("metal-holding-detail-hero")).toHaveProp(
      "className",
      expect.stringContaining("flex-col")
    );
  });
});
