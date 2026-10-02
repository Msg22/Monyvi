import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import {
  MetalHoldingForm,
  type MetalHoldingFormCopy,
  type MetalHoldingFormPreview,
} from "@/components/metals/MetalHoldingForm";
import type { MetalDetailReadModel } from "@/services/metal-detail-read-model-service";

jest.mock("@/components/navigation/PageHeader", () => {
  const { TouchableOpacity } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      onBack,
    }: {
      readonly onBack?: () => void;
    }): React.JSX.Element => (
      <TouchableOpacity testID="header-back" onPress={onBack} />
    ),
  };
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string): string => key,
  }),
}));

jest.mock("@expo/vector-icons", () => {
  const renderIcon = (): null => null;
  return { Ionicons: renderIcon, MaterialCommunityIcons: renderIcon };
});

jest.mock("@/components/ui/Skeleton", () => ({
  Skeleton: (): null => null,
}));

jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 0 }),
}));

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
}));

const COPY: MetalHoldingFormCopy = {
  title: "Add holding",
  editTitle: "Edit holding",
  back: "Back",
  name: "Holding name",
  namePlaceholder: "e.g. Savings coin",
  metal: "Metal",
  gold: "Gold",
  silver: "Silver",
  weight: "Weight",
  purity: "Karat",
  purchasePrice: "Total purchase price",
  purchasePriceHint: "Total amount paid.",
  purchaseCurrency: "Purchase currency",
  purchaseDate: "Purchase date",
  physicalForm: "Physical form",
  coin: "Coin",
  bar: "Bar",
  jewelry: "Jewelry",
  notes: "Notes (optional)",
  notesPlaceholder: "Add a note",
  preview: "Estimated value",
  valuationUnavailable: "Estimate unavailable",
  savedLocally: "Saved locally.",
  submit: "Add holding",
  submitting: "Adding holding",
  editSubmit: "Save changes",
  editSubmitting: "Saving changes",
  unusualValue: "Unusually large.",
  acknowledge: "I reviewed it",
  staleRateAcknowledgment: "Older saved rate.",
  submitFailed: "Save failed.",
  rateFresh: "Rates are current",
  rateStale: "Older saved rate",
  rateUnknown: "Rate age unavailable",
  rateUnavailable: "Some rate details are unavailable",
  pure: "pure",
  perPureGram: "per pure gram",
  estimatedGainSincePurchase: "estimated gain since purchase",
  estimatedLossSincePurchase: "estimated loss since purchase",
  ratesUpdated: "Rates updated",
  previous: "Previous",
  cancel: "Cancel",
};

const DEFAULT_PREVIEW: MetalHoldingFormPreview = {
  metal: "GOLD",
  purityCode: "gold-999",
  purityLabel: "24K",
  purityFactorDecimal: "0.999",
  physicalForm: "COIN",
  displayCurrency: "EGP",
  valuation: { available: true, valueDecimal: "50000" },
  rateFreshness: "stale",
};

function detailModel(
  reconciliationState: MetalDetailReadModel["reconciliationState"]
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
    notes: null,
    purchaseCurrency: "EGP",
    purchaseDate: new Date("2024-03-14T00:00:00.000Z"),
    purchasePriceDecimal: "151278.20",
    purityCatalogVersion: "1",
    purityCode: "gold-999",
    purityFactorDecimal: "0.999",
    reconciliationState,
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
    terminalFacts: null,
  } as unknown as MetalDetailReadModel;
}

describe("MetalHoldingForm - Additional UI polish", () => {
  it("formats weight with thousands commas and preserves 3 decimal places without rounding", () => {
    const onChange = jest.fn();
    render(
      <MetalHoldingForm
        mode="add"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "Bar",
          metal: "GOLD",
          weightGrams: "1250.755",
          purityCode: "gold-999",
          purchasePrice: "50000",
          purchaseCurrency: "EGP",
          purchaseDate: "2024-03-14",
          physicalForm: "BAR",
          notes: "",
        }}
        copy={COPY}
        preview={DEFAULT_PREVIEW}
        onChange={onChange}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue("1,250.755")).toBeTruthy();

    fireEvent.changeText(
      screen.getByTestId("metal-holding-weight-field"),
      "2,500.123"
    );
    expect(onChange).toHaveBeenCalledWith("weightGrams", "2500.123");
  });

  it("places weight and karat previous value cues under their respective columns with comma formatting and bright text", () => {
    render(
      <MetalHoldingForm
        mode="edit"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "Coin",
          metal: "GOLD",
          weightGrams: "1500.250",
          purityCode: "gold-999",
          purchasePrice: "100000",
          purchaseCurrency: "EGP",
          purchaseDate: "2024-03-14",
          physicalForm: "COIN",
          notes: "",
        }}
        editState={{
          affectedChanges: [
            {
              field: "weight",
              label: "Weight",
              before: "1000.125",
              after: "1500.250",
              isFinancial: true,
            },
            {
              field: "purity",
              label: "Karat",
              before: "21K",
              after: "24K",
              isFinancial: true,
            },
            {
              field: "purchasePrice",
              label: "Purchase price",
              before: "25000",
              after: "100000",
              isFinancial: true,
            },
          ],
          correctionReason: "Typo fix",
        }}
        copy={COPY}
        preview={DEFAULT_PREVIEW}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    expect(screen.getByText("Previous: 1,000.125")).toBeTruthy();
    expect(screen.getByTestId("metal-holding-weight-previous")).toHaveProp(
      "className",
      expect.stringContaining("text-text-secondary")
    );

    expect(screen.getByText("Previous: 21K")).toBeTruthy();
    expect(screen.getByTestId("metal-holding-purity-previous")).toHaveProp(
      "className",
      expect.stringContaining("text-text-secondary")
    );

    expect(screen.getByText("Previous: 25,000")).toBeTruthy();
    expect(
      screen.getByTestId("metal-holding-purchasePrice-previous")
    ).toHaveProp("className", expect.stringContaining("text-text-secondary"));
  });

  it("does not render the older-saved-rate acknowledgment card even when rates are stale", () => {
    render(
      <MetalHoldingForm
        mode="add"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "Bar",
          metal: "GOLD",
          weightGrams: "100",
          purityCode: "gold-999",
          purchasePrice: "50000",
          purchaseCurrency: "EGP",
          purchaseDate: "2024-03-14",
          physicalForm: "BAR",
          notes: "",
        }}
        copy={COPY}
        preview={{ ...DEFAULT_PREVIEW, rateFreshness: "stale" }}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    expect(
      screen.queryByTestId("metal-holding-stale-rate-acknowledgment")
    ).toBeNull();
  });

  it("displays required asterisks on required fields and leaves optional fields unmarked", () => {
    render(
      <MetalHoldingForm
        mode="add"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "",
          metal: "GOLD",
          weightGrams: "",
          purityCode: "gold-999",
          purchasePrice: "",
          purchaseCurrency: "EGP",
          purchaseDate: "",
          physicalForm: null,
          notes: "",
        }}
        copy={COPY}
        preview={DEFAULT_PREVIEW}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    // Required fields: name, metal, weight, purity, purchasePrice,
    // purchaseCurrency, purchaseDate
    expect(screen.getByText("Holding name *")).toBeTruthy();
    expect(screen.getByText("Metal *")).toBeTruthy();
    expect(screen.getByText("Weight *")).toBeTruthy();
    expect(screen.getByText("Karat *")).toBeTruthy();
    expect(screen.getByText("Total purchase price *")).toBeTruthy();
    expect(screen.getByText("Purchase currency *")).toBeTruthy();
    expect(screen.getByText("Purchase date *")).toBeTruthy();

    expect(screen.getByTestId("metal-holding-metal-option-GOLD")).toHaveProp(
      "accessibilityLabel",
      "Metal: Gold"
    );
    expect(screen.getByTestId("metal-holding-metal-option-GOLD")).toHaveProp(
      "accessibilityHint",
      "required_field"
    );
    expect(screen.getByTestId("metal-holding-metal-option-SILVER")).toHaveProp(
      "accessibilityLabel",
      "Metal: Silver"
    );
    expect(screen.getByTestId("metal-holding-metal-option-SILVER")).toHaveProp(
      "accessibilityHint",
      "required_field"
    );

    // Optional fields should NOT have asterisk
    expect(screen.getByText("Physical form")).toBeTruthy();
    expect(screen.queryByText("Physical form *")).toBeNull();
    expect(screen.getByText("Notes (optional)")).toBeTruthy();
    expect(screen.queryByText("Notes (optional) *")).toBeNull();
  });

  it("keeps locked Edit Metal as a non-required display", () => {
    render(
      <MetalHoldingForm
        mode="edit"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "Bar",
          metal: "GOLD",
          weightGrams: "10",
          purityCode: "gold-999",
          purchasePrice: "50000",
          purchaseCurrency: "EGP",
          purchaseDate: "2024-03-14",
          physicalForm: "BAR",
          notes: "",
        }}
        copy={COPY}
        preview={DEFAULT_PREVIEW}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    expect(screen.getByTestId("metal-holding-metal-locked")).toBeTruthy();
    expect(screen.getByText("Metal")).toBeTruthy();
    expect(screen.queryByText("Metal *")).toBeNull();
  });

  it("uses brighter theme tokens in dark mode for helper copy", () => {
    render(
      <MetalHoldingForm
        mode="add"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "",
          metal: "GOLD",
          weightGrams: "",
          purityCode: "gold-999",
          purchasePrice: "",
          purchaseCurrency: "EGP",
          purchaseDate: "",
          physicalForm: null,
          notes: "",
        }}
        copy={COPY}
        preview={DEFAULT_PREVIEW}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    expect(screen.getByText("Total amount paid.")).toHaveProp(
      "className",
      expect.stringContaining("text-text-secondary")
    );
    expect(screen.getByText("Total amount paid.")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-secondary-dark")
    );
  });

  it("rounds estimated gram rate to exactly two decimals in LivePreview", () => {
    render(
      <MetalHoldingForm
        mode="add"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "Coin",
          metal: "GOLD",
          weightGrams: "10",
          purityCode: "gold-999",
          purchasePrice: "50000",
          purchaseCurrency: "EGP",
          purchaseDate: "2024-03-14",
          physicalForm: "COIN",
          notes: "",
        }}
        copy={COPY}
        preview={{
          ...DEFAULT_PREVIEW,
          preferredCurrency: "EGP",
          metalPerPureGramInPreferredCurrencyDecimal: "6945.719895",
        }}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    // 6945.719895 rounded to 2 decimals standard => 6,945.72
    expect(screen.getByText("Gold · EGP 6,945.72 per pure gram")).toBeTruthy();
  });
});

describe("MetalHoldingDetailScreen - passive sync status removal", () => {
  it("does NOT render reconciliation message banner when state is sync_pending", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={detailModel("sync_pending")}
        onRetry={jest.fn()}
      />
    );

    expect(screen.queryByText("reconciliation.sync_pending")).toBeNull();
  });

  it("does NOT render an inline saved-on-device banner for local_complete", () => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={detailModel("local_complete")}
        onRetry={jest.fn()}
      />
    );

    expect(screen.queryByText("reconciliation.local_complete")).toBeNull();
  });

  it("renders incomplete banner with retry when reconciliation is incomplete", () => {
    const onRetry = jest.fn();
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={detailModel("reconciliation_incomplete")}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText("reconciliation.incomplete")).toBeTruthy();
    expect(screen.getByText("detail.retry_sync")).toBeTruthy();
  });

  it("renders failed banner with retry when sync failed", () => {
    const onRetry = jest.fn();
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={detailModel("sync_failed")}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText("reconciliation.sync_failed")).toBeTruthy();
    expect(screen.getByText("detail.retry")).toBeTruthy();
  });
});
