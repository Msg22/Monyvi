import { fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";

import { MetalHoldingDetailScreen } from "@/components/metals/MetalHoldingDetailScreen";
import {
  MetalHoldingForm,
  type MetalHoldingFormPreview,
} from "@/components/metals/MetalHoldingForm";
import {
  formatRateAmount,
  MetalHoldingLivePreview,
} from "@/components/metals/MetalHoldingLivePreview";
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

const FORM_COPY = {
  title: "Add holding",
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
} as const;

function activeModel(
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
    notes: null,
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
        id: "created",
        kind: "add",
        occurredAt: new Date("2024-03-14T00:00:00.000Z"),
      },
    ],
    totalGainDecimal: "11039.67",
    unavailableExactFacts: [],
    weightGramsDecimal: "31.125",
    ...overrides,
    terminalFacts: overrides.terminalFacts ?? null,
  } as unknown as MetalDetailReadModel;
}

describe("metal holding presentation fixes (PR 332)", () => {
  beforeEach((): void => {
    jest.clearAllMocks();
  });

  it("hides How this value was calculated when active attribution has no breakdown", (): void => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeModel({
          attribution: {
            breakdown: { available: false },
            currencyGainDecimal: null,
            metalGainDecimal: null,
            premiumAndCostsDecimal: null,
            roundingDifferenceDecimal: null,
          },
          totalGainDecimal: "11039.67",
        })}
        onRetry={jest.fn()}
      />
    );

    expect(
      screen.queryByTestId("metal-detail-calculation-disclosure")
    ).toBeNull();
  });

  it("hides How this value was calculated when sold result has no display breakdown", (): void => {
    render(
      <MetalHoldingDetailScreen
        actions={[]}
        error={null}
        isLoading={false}
        isOffline={false}
        model={activeModel({
          isActiveOwnership: false,
          status: "sold",
          terminalFacts: {
            actionId: "action-1",
            feeDecimal: "0",
            grossProceedsDecimal: "160000",
            kind: "sold",
            netProceedsDecimal: "160000",
            notes: null,
            proceedsCurrency: "EGP",
            realizedResultCurrency: "EGP",
            realizedResultDecimal: "8721.80",
            realizedResultUnavailableReason: null,
            terminalDate: "2026-08-01",
            displayAttribution: null,
          },
        })}
        onRetry={jest.fn()}
      />
    );

    expect(
      screen.queryByTestId("metal-detail-calculation-disclosure")
    ).toBeNull();
  });

  it("shows estimated per-gram in display currency, never USD, when FX is available", (): void => {
    render(
      <MetalHoldingLivePreview
        copy={FORM_COPY}
        isStacked={false}
        locale="en"
        preview={{
          metal: "GOLD",
          purityCode: "gold-999",
          purityLabel: "24K",
          purityFactorDecimal: "0.999",
          physicalForm: "COIN",
          displayCurrency: "EGP",
          metalUsdPerPureGramDecimal: "100",
          metalRateTrust: {
            valueDecimal: "100",
            state: "fresh",
            ageMs: 60_000,
            source: "Metal feed",
            quality: "verified",
            providerObservedAt: new Date("2026-09-01T10:00:00Z"),
          },
          fxRateTrust: {
            valueDecimal: "0.02",
            state: "fresh",
            ageMs: 60_000,
            source: "FX feed",
            quality: "verified",
            providerObservedAt: new Date("2026-09-01T10:00:00Z"),
          },
          valuation: { available: true, valueDecimal: "50000" },
        }}
      />
    );

    expect(screen.queryByText("Gold · USD 100 per pure gram")).toBeNull();
    expect(
      screen.getByText("Gold · EGP 5,000.00 per pure gram")
    ).toBeOnTheScreen();
  });

  it("hides the per-gram row when display FX is missing instead of fabricating", (): void => {
    render(
      <MetalHoldingLivePreview
        copy={FORM_COPY}
        isStacked={false}
        locale="en"
        preview={{
          metal: "GOLD",
          purityCode: "gold-999",
          purityLabel: "24K",
          purityFactorDecimal: "0.999",
          physicalForm: "COIN",
          displayCurrency: "EGP",
          metalUsdPerPureGramDecimal: "100",
          metalRateTrust: {
            valueDecimal: "100",
            state: "fresh",
            ageMs: 60_000,
            source: "Metal feed",
            quality: "verified",
            providerObservedAt: new Date("2026-09-01T10:00:00Z"),
          },
          fxRateTrust: {
            valueDecimal: null,
            state: "missing",
            ageMs: null,
            source: null,
            quality: null,
            providerObservedAt: null,
          },
          valuation: { available: true, valueDecimal: "50000" },
        }}
      />
    );

    expect(screen.queryByText(/per pure gram/)).toBeNull();
  });

  it("shows the Add estimate section once weight is entered even when valuation is unavailable", (): void => {
    const baseValues = {
      name: "Savings coin",
      metal: "GOLD" as const,
      weightGrams: "",
      purityCode: "gold-999",
      purchasePrice: "",
      purchaseCurrency: "EGP",
      purchaseDate: "2026-09-01",
      physicalForm: null,
      notes: "",
    };
    const unavailablePreview = {
      metal: "GOLD" as const,
      purityCode: "gold-999",
      purityLabel: "24K",
      purityFactorDecimal: "0.999",
      physicalForm: null,
      displayCurrency: "EGP",
      valuation: { available: false, reason: "missing_rate" } as const,
    };
    const { rerender } = render(
      <MetalHoldingForm
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={baseValues}
        copy={FORM_COPY}
        purityOptions={[{ value: "gold-999", label: "24K" }]}
        currencyOptions={[{ value: "EGP", label: "EGP" }]}
        preview={unavailablePreview}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );
    expect(screen.queryByTestId("metal-holding-live-preview")).toBeNull();

    rerender(
      <MetalHoldingForm
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{ ...baseValues, weightGrams: "10" }}
        copy={FORM_COPY}
        purityOptions={[{ value: "gold-999", label: "24K" }]}
        currencyOptions={[{ value: "EGP", label: "EGP" }]}
        preview={unavailablePreview}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );
    expect(screen.getByTestId("metal-holding-live-preview")).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-valuation-unavailable")
    ).toBeOnTheScreen();
  });

  it("shows the Add estimate section after Karat selection alone with other fields untouched", (): void => {
    const onChange = jest.fn();
    const pristineValues = {
      name: "Savings coin",
      metal: "GOLD" as const,
      weightGrams: "",
      purityCode: "gold-999",
      purchasePrice: "",
      purchaseCurrency: "EGP",
      purchaseDate: "2026-09-01",
      physicalForm: null,
      notes: "",
    };
    render(
      <MetalHoldingForm
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={pristineValues}
        copy={FORM_COPY}
        purityOptions={[
          { value: "gold-999", label: "24K" },
          { value: "gold-875", label: "21K" },
        ]}
        currencyOptions={[{ value: "EGP", label: "EGP" }]}
        preview={{
          metal: "GOLD",
          purityCode: "gold-999",
          purityLabel: "24K",
          purityFactorDecimal: "0.999",
          physicalForm: null,
          displayCurrency: "EGP",
          valuation: { available: false, reason: "missing_rate" },
        }}
        onChange={onChange}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );
    expect(screen.queryByTestId("metal-holding-live-preview")).toBeNull();

    fireEvent.press(screen.getByTestId("metal-holding-purity-trigger"));
    fireEvent.press(screen.getByTestId("metal-holding-purity-option-gold-875"));

    expect(onChange).toHaveBeenCalledWith("purityCode", "gold-875");
    expect(screen.getByTestId("metal-holding-live-preview")).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-valuation-unavailable")
    ).toBeOnTheScreen();
  });

  it("groups Edit Total Purchase Price with commas while keeping canonical dot-decimal state", (): void => {
    const onChange = jest.fn();
    render(
      <MetalHoldingForm
        mode="edit"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        values={{
          name: "Wedding coin",
          metal: "GOLD",
          weightGrams: "10.125",
          purityCode: "gold-999",
          purchasePrice: "47800",
          purchaseCurrency: "EGP",
          purchaseDate: "2024-03-14",
          physicalForm: "COIN",
          notes: "",
        }}
        copy={FORM_COPY}
        purityOptions={[{ value: "gold-999", label: "24K" }]}
        currencyOptions={[{ value: "EGP", label: "EGP" }]}
        preview={{
          metal: "GOLD",
          purityCode: "gold-999",
          purityLabel: "24K",
          purityFactorDecimal: "0.999",
          physicalForm: "COIN",
          displayCurrency: "EGP",
          valuation: { available: false, reason: "missing_rate" },
        }}
        onChange={onChange}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    expect(screen.getByDisplayValue("47,800")).toBeOnTheScreen();
    expect(screen.getByDisplayValue("10.125")).toBeOnTheScreen();

    fireEvent.changeText(
      screen.getByTestId("metal-holding-purchase-price-field"),
      "1,234.50"
    );
    expect(onChange).toHaveBeenCalledWith("purchasePrice", "1234.50");

    fireEvent.changeText(
      screen.getByTestId("metal-holding-purchase-price-field"),
      "12,5"
    );
    expect(onChange).toHaveBeenCalledWith("purchasePrice", "12,5");
  });

  it("ships Karat copy for Add/Edit in EN and AR", (): void => {
    const root = resolve(__dirname, "../../../../..");
    const en = JSON.parse(
      readFileSync(resolve(root, "apps/mobile/locales/en/metals.json"), "utf8")
    ) as {
      readonly add: Record<string, string>;
    };
    const ar = JSON.parse(
      readFileSync(resolve(root, "apps/mobile/locales/ar/metals.json"), "utf8")
    ) as {
      readonly add: Record<string, string>;
    };
    expect(en.add.karat).toBe("Karat");
    expect(ar.add.karat).toBe("العيار");
  });

  it("shows per-gram in preferred EGP when purchase currency is CAD", (): void => {
    render(
      <MetalHoldingLivePreview
        copy={FORM_COPY}
        isStacked={false}
        locale="en"
        preview={
          {
            metal: "GOLD",
            purityCode: "gold-999",
            purityLabel: "24K",
            purityFactorDecimal: "0.999",
            physicalForm: "COIN",
            displayCurrency: "CAD",
            preferredCurrency: "EGP",
            metalUsdPerPureGramDecimal: "100",
            metalPerPureGramInPreferredCurrencyDecimal: "5000",
            fxRateTrust: {
              valueDecimal: "0.75",
              state: "fresh",
              ageMs: 60_000,
              source: "FX feed",
              quality: "verified",
              providerObservedAt: new Date("2026-09-01T10:00:00Z"),
            },
            valuation: { available: true, valueDecimal: "1348.65" },
          } as unknown as MetalHoldingFormPreview
        }
      />
    );

    expect(screen.queryByText("Gold · USD 100 per pure gram")).toBeNull();
    expect(screen.queryByText(/CAD.*per pure gram/)).toBeNull();
    expect(
      screen.getByText("Gold · EGP 5,000.00 per pure gram")
    ).toBeOnTheScreen();
  });

  it("hides the per-gram row when preferred FX is missing instead of falling back", (): void => {
    render(
      <MetalHoldingLivePreview
        copy={FORM_COPY}
        isStacked={false}
        locale="en"
        preview={
          {
            metal: "GOLD",
            purityCode: "gold-999",
            purityLabel: "24K",
            purityFactorDecimal: "0.999",
            physicalForm: "COIN",
            displayCurrency: "CAD",
            preferredCurrency: "EGP",
            metalUsdPerPureGramDecimal: "100",
            metalPerPureGramInPreferredCurrencyDecimal: null,
            fxRateTrust: {
              valueDecimal: "0.75",
              state: "fresh",
              ageMs: 60_000,
              source: "FX feed",
              quality: "verified",
              providerObservedAt: new Date("2026-09-01T10:00:00Z"),
            },
            valuation: { available: true, valueDecimal: "1348.65" },
          } as unknown as MetalHoldingFormPreview
        }
      />
    );

    expect(screen.queryByText(/per pure gram/)).toBeNull();
    expect(screen.getByText("CAD 1,348.65")).toBeOnTheScreen();
  });

  it("formatRateAmount safely degrades to em dash on malformed legacy decimals without throwing", (): void => {
    expect(formatRateAmount("EGP", "invalid_decimal", "en")).toBe("—");
    expect(formatRateAmount("EGP", "", "en")).toBe("—");
    expect(formatRateAmount("EGP", "NaN", "en")).toBe("—");
    expect(formatRateAmount("EGP", "3125.50", "en")).toBe("EGP 3,125.50");
  });

  it("renders em dash for empty previous-value cue in edit form", (): void => {
    render(
      <MetalHoldingForm
        mode="edit"
        locale="en"
        isRtl={false}
        width={390}
        fontScale={1}
        bottomInset={24}
        copy={FORM_COPY}
        preview={
          {
            metal: "GOLD",
            purityCode: "gold-999",
            purityLabel: "24K",
            purityFactorDecimal: "0.999",
            physicalForm: "COIN",
            valuation: { available: true, valueDecimal: "5000" },
          } as unknown as MetalHoldingFormPreview
        }
        editState={{
          correctionReason: "",
          affectedChanges: [
            {
              field: "purchasePrice",
              label: "Purchase price",
              before: "",
              after: "47800.00",
              isFinancial: true,
            },
          ],
        }}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
        onRequestExit={jest.fn()}
      />
    );

    expect(
      screen.getByTestId("metal-holding-purchasePrice-previous")
    ).toHaveTextContent("Previous: —");
  });
});
