import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";
import type { MetalHistoryReadModel } from "@/services/metal-history-read-model-service";
import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import { MetalHistoryScreen } from "@/components/metals/MetalHistoryScreen";
import { getHoldingActionDescriptors } from "@/components/metals/holding-actions/registry";

const translations: Readonly<Record<string, string>> = {
  "detail.title": "Holding details",
  "detail.sold_title": "Sold holding",
  "detail.disposed_title": "Disposed holding",
  "detail.current_value": "Current value",
  "detail.current_value_unavailable": "Current value unavailable",
  "detail.since_purchase": "{{amount}} since purchase",
  "detail.holding_story": "Holding story",
  "detail.physical_facts": "Physical facts",
  "detail.acquired": "Acquired",
  "detail.value_unavailable": "Value unavailable",
  "detail.retry": "Try again",
  "detail.offline": "Offline mode",
  "detail.history": "History",
  "detail.view_all": "View all",
  "detail.restored": "Restored to Active",
  "history.title": "History",
  "history.subtitle": "Sales and holdings no longer in your possession.",
  "history.all": "All",
  "history.sold": "Sold",
  "history.disposed": "Disposed",
  "history.empty": "No holdings here yet",
  "history.offline": "Offline mode",
  "history.retry": "Try again",
  "actions.sell": "Sell holding",
  "actions.edit": "Edit details",
  "actions.dispose": "No longer in my possession",
  "actions.delete": "Delete holding",
  "actions.undo_sale": "Undo sale",
  "actions.undo_disposal": "Undo disposal",
  "status.active": "Active",
  "status.sold": "Sold",
  "status.disposed": "Disposed",
  "metal.gold": "Gold",
  "metal.silver": "Silver",
  "form.coin": "Coin",
  "form.bar": "Bar",
  "form.jewelry": "Jewelry",
  "form.unknown": "Other form",
  "render.objectAccessibility": "{{metal}} {{form}} illustration",
  "render.neutralFallback": "Metal holding illustration unavailable",
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
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

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: () => null,
}));

function detail(
  overrides: Partial<MetalDetailReadModel> = {}
): MetalDetailReadModel {
  return {
    attribution: null,
    currentValueDecimal: "162317.87",
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
    renderKey: "gold:coin",
    requiresCompleteMaterialCorrection: false,
    status: "active",
    timeline: [
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

function history(
  overrides: Partial<MetalHistoryReadModel> = {}
): MetalHistoryReadModel {
  return {
    filter: "all",
    items: [
      {
        holdingId: "sold-bracelet",
        itemForm: "jewelry",
        metalType: "GOLD",
        name: "21K bracelet",
        occurredAt: new Date("2026-08-22T00:00:00.000Z"),
        purityCatalogVersion: "1",
        purityCode: "gold-875",
        purityFactorDecimal: "0.875",
        renderKey: "gold:jewelry",
        status: "sold",
      },
      {
        holdingId: "disposed-bar",
        itemForm: "bar",
        metalType: "SILVER",
        name: "Silver keepsake",
        occurredAt: new Date("2026-08-24T00:00:00.000Z"),
        purityCatalogVersion: "1",
        purityCode: "silver-999",
        purityFactorDecimal: "0.999",
        renderKey: "silver:bar",
        status: "disposed",
      },
    ],
    ...overrides,
  };
}

describe("US3 holding experience", () => {
  it("renders approved Active identity, facts, value, timeline, and descriptor-only actions", () => {
    const onAction = jest.fn();
    const model = detail();

    render(
      <MetalHoldingDetailScreen
        model={model}
        isLoading={false}
        error={null}
        isOffline={false}
        actions={getHoldingActionDescriptors(model)}
        onAction={onAction}
        onRetry={jest.fn()}
        onViewHistory={jest.fn()}
      />
    );

    expect(screen.getByText("Wedding coin")).toBeTruthy();
    expect(screen.getByText("Gold · 24K · 999 · Coin")).toBeTruthy();
    expect(screen.getByLabelText("Gold Coin illustration")).toBeTruthy();
    expect(screen.getByText("EGP 162,317.87")).toBeTruthy();
    expect(screen.getByText("+EGP 11,039.67 since purchase")).toBeTruthy();
    expect(screen.getByText("Sell holding")).toBeTruthy();
    fireEvent.press(screen.getByText("Sell holding"));
    expect(onAction).toHaveBeenCalledWith("sell");
  });

  it("renders Sold, Disposed, and restored states without active valuation claims", () => {
    const sold = detail({
      currentValueDecimal: null,
      isActiveOwnership: false,
      status: "sold",
      totalGainDecimal: null,
    });
    const { rerender } = render(
      <MetalHoldingDetailScreen
        model={sold}
        isLoading={false}
        error={null}
        isOffline={false}
        actions={getHoldingActionDescriptors(sold)}
        onAction={jest.fn()}
        onRetry={jest.fn()}
        onViewHistory={jest.fn()}
      />
    );
    expect(screen.getByText("Sold holding")).toBeTruthy();
    expect(screen.getByText("Undo sale")).toBeTruthy();
    expect(screen.queryByText("Current value")).toBeNull();

    const disposed = detail({
      currentValueDecimal: null,
      isActiveOwnership: false,
      status: "disposed",
      totalGainDecimal: null,
    });
    rerender(
      <MetalHoldingDetailScreen
        model={disposed}
        isLoading={false}
        error={null}
        isOffline={false}
        actions={getHoldingActionDescriptors(disposed)}
        onAction={jest.fn()}
        onRetry={jest.fn()}
        onViewHistory={jest.fn()}
      />
    );
    expect(screen.getByText("Disposed holding")).toBeTruthy();
    expect(screen.getByText("Undo disposal")).toBeTruthy();

    const restored = detail({
      timeline: [
        {
          id: "undo",
          kind: "undo",
          occurredAt: new Date("2026-08-24T00:00:00.000Z"),
        },
      ],
    });
    rerender(
      <MetalHoldingDetailScreen
        model={restored}
        isLoading={false}
        error={null}
        isOffline={false}
        actions={getHoldingActionDescriptors(restored)}
        onAction={jest.fn()}
        onRetry={jest.fn()}
        onViewHistory={jest.fn()}
      />
    );
    expect(screen.getByText("Restored to Active")).toBeTruthy();
  });

  it("keeps loading, unavailable, offline, and retry states explicit", () => {
    const onRetry = jest.fn();
    const { rerender } = render(
      <MetalHoldingDetailScreen
        model={null}
        isLoading
        error={null}
        isOffline={false}
        actions={[]}
        onAction={jest.fn()}
        onRetry={onRetry}
        onViewHistory={jest.fn()}
      />
    );
    expect(screen.getByTestId("metal-holding-detail-loading")).toBeTruthy();

    rerender(
      <MetalHoldingDetailScreen
        model={detail({ currentValueDecimal: null, totalGainDecimal: null })}
        isLoading={false}
        error={new Error("read failed")}
        isOffline
        actions={[]}
        onAction={jest.fn()}
        onRetry={onRetry}
        onViewHistory={jest.fn()}
      />
    );
    expect(screen.getByText("Current value unavailable")).toBeTruthy();
    expect(screen.getByText("Offline mode")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("keeps permanent History ordered, filtered, navigable, and accessible", () => {
    const onFilterChange = jest.fn();
    const onOpenHolding = jest.fn();
    render(
      <MetalHistoryScreen
        history={history()}
        isLoading={false}
        error={null}
        isOffline={false}
        onFilterChange={onFilterChange}
        onOpenHolding={onOpenHolding}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText("Silver keepsake")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Sold filter"));
    expect(onFilterChange).toHaveBeenCalledWith("sold");
    fireEvent.press(screen.getByText("21K bracelet"));
    expect(onOpenHolding).toHaveBeenCalledWith("sold-bracelet");
    expect(screen.getByLabelText("Gold Jewelry illustration")).toBeTruthy();
  });
});
