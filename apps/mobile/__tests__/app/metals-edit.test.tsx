import { fireEvent, render, screen } from "@testing-library/react-native";
import { init } from "i18next";
import React from "react";

import arCommon from "@/locales/ar/common.json";
import enCommon from "@/locales/en/common.json";
import type { MetalHoldingFormCopy } from "@/components/metals/MetalHoldingForm";

beforeAll(async () => {
  await init({
    resources: {
      en: { common: enCommon },
      ar: { common: arCommon },
    },
    lng: "en",
    fallbackLng: "en",
    ns: "common",
    defaultNS: "common",
    interpolation: { escapeValue: false },
  });
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string): string => key,
    i18n: { language: "en", dir: (): "ltr" => "ltr" },
  }),
}));

jest.mock("@/components/navigation/PageHeader", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PageHeader: ({
      title,
      onBack,
    }: {
      readonly title: string;
      readonly onBack?: () => void;
    }) => (
      <View>
        <Text>{title}</Text>
        <Pressable testID="header-back" onPress={onBack}>
          <Text>Back</Text>
        </Pressable>
      </View>
    ),
  };
});
jest.mock("@/context/ThemeContext", () => ({
  useTheme: (): { readonly isDark: boolean } => ({ isDark: false }),
}));

interface EditMetalHoldingFormModule {
  readonly MetalHoldingForm: React.ComponentType<EditMetalHoldingFormProps>;
}

interface EditMetalHoldingFormProps {
  readonly mode: "edit";
  readonly locale: "en" | "ar";
  readonly isRtl: boolean;
  readonly width: number;
  readonly fontScale: number;
  readonly bottomInset: number;
  readonly copy?: MetalHoldingFormCopy;
  readonly holdingStatus: "active" | "sold" | "disposed";
  readonly values: {
    readonly name: string;
    readonly metal: "GOLD" | "SILVER";
    readonly weightGrams: string;
    readonly purityCode: string;
    readonly purchasePrice: string;
    readonly purchaseCurrency: string;
    readonly purchaseDate: string;
    readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
    readonly notes: string;
  };
  readonly preview: {
    readonly metal: "GOLD" | "SILVER";
    readonly purityCode: string;
    readonly purityLabel: string;
    readonly purityFactorDecimal: string;
    readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
    readonly name?: string;
    readonly weightGramsDecimal?: string;
    readonly displayCurrency?: string;
    readonly resultSincePurchaseDecimal?: string | null;
    readonly resultDirection?: "positive" | "negative" | "zero" | "unavailable";
    readonly metalRateTrust?: { readonly valueDecimal: string | null; readonly state: "fresh" | "stale" | "unknown" | "missing" | "invalid"; readonly ageMs: number | null; readonly source: string | null; readonly quality: string | null; readonly providerObservedAt: Date | null };
    readonly fxRateTrust?: { readonly valueDecimal: string | null; readonly state: "fresh" | "stale" | "unknown" | "missing" | "invalid"; readonly ageMs: number | null; readonly source: string | null; readonly quality: string | null; readonly providerObservedAt: Date | null };
    readonly valuation:
      | { readonly available: true; readonly valueDecimal: string }
      | { readonly available: false; readonly reason: "missing_rate" };
  };
  readonly editState: {
    readonly affectedChanges: ReadonlyArray<{
      readonly field: string;
      readonly label: string;
      readonly before: string;
      readonly after: string;
      readonly isFinancial: boolean;
    }>;
    readonly correctionReason: string;
    readonly requiresConsequenceAcknowledgment?: boolean;
  };
  readonly isSubmitting?: boolean;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly onChange: (field: string, value: string | null) => void;
  readonly onSubmit: () => void;
  readonly onRequestExit: () => void;
  readonly onCorrectionReasonChange: (value: string) => void;
  readonly onAcknowledgeConsequences: () => void;
}

interface EditFacts {
  readonly name: string;
  readonly metal: "GOLD" | "SILVER";
  readonly weightGramsDecimal: string;
  readonly purityLabel: string;
  readonly purchasePriceDecimal: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: "COIN" | "BAR" | "JEWELRY" | null;
  readonly notes: string | null;
  readonly currentValueDecimal: string | null;
  readonly performanceDecimal: string | null;
}

function loadEditForm(): React.ComponentType<EditMetalHoldingFormProps> {
  return jest.requireActual<EditMetalHoldingFormModule>(
    "@/components/metals/MetalHoldingForm"
  ).MetalHoldingForm;
}

const original: EditFacts = {
  name: "Wedding coin",
  metal: "GOLD",
  weightGramsDecimal: "10.125",
  purityLabel: "24K · 999",
  purchasePriceDecimal: "47800",
  purchaseCurrency: "EGP",
  purchaseDate: "2024-03-14",
  physicalForm: "COIN",
  notes: "هدية 🎁",
  currentValueDecimal: "51200",
  performanceDecimal: "3400",
};

const ARABIC_EDIT_COPY: MetalHoldingFormCopy = {
  title: "حفظ التغييرات",
  back: "رجوع",
  name: "اسم المقتنى",
  namePlaceholder: "مثال: خاتم الزواج",
  metal: "المعدن",
  gold: "ذهب",
  silver: "فضة",
  weight: "الوزن",
  purity: "النقاء",
  purchasePrice: "سعر الشراء",
  purchasePriceHint: "إجمالي المبلغ المدفوع",
  purchaseCurrency: "عملة الشراء",
  purchaseDate: "تاريخ الشراء",
  physicalForm: "الشكل",
  coin: "عملة",
  bar: "سبيكة",
  jewelry: "مجوهرات",
  notes: "ملاحظات",
  notesPlaceholder: "أضف ملاحظة",
  preview: "القيمة التقديرية",
  valuationUnavailable: "التقدير غير متاح",
  savedLocally: "سيتم حفظ هذا التغيير على هذا الجهاز أولاً.",
  submit: "حفظ التغييرات",
  submitting: "جارٍ حفظ التغييرات…",
  unusualValue: "هذه القيمة كبيرة على نحو غير معتاد.",
  acknowledge: "راجعت القيمة",
  staleRateAcknowledgment: "يعتمد هذا التقدير على سعر محفوظ أقدم.",
  submitFailed: "تعذر الحفظ",
  rateFresh: "الأسعار حديثة",
  rateStale: "نستخدم سعراً محفوظاً أقدم",
  rateUnknown: "عمر السعر غير متاح",
  rateFreshnessUnknown: "حداثة السعر غير معروفة",
  rateAgeUnavailable: "عمر السعر غير متاح",
  rateObservationUnavailable: "وقت الرصد غير متاح",
  rateJustNow: "الآن",
  rateUnavailable: "بعض تفاصيل السعر غير متاحة",
  pure: "نقي",
  perPureGram: "لكل غرام نقي",
  estimatedGainSincePurchase: "مكسب تقديري منذ الشراء",
  estimatedLossSincePurchase: "خسارة تقديرية منذ الشراء",
  ratesUpdated: "تم تحديث الأسعار",
  metalRateLabel: "سعر المعدن",
  fxRateLabel: "سعر الصرف",
  unknownRateSource: "المصدر غير معروف",
  unknownRateQuality: "الجودة غير معروفة",
  noFinancialChange: "تظل القيمة الحالية",
  unchangedGain: "يبقى ربحك منذ الشراء",
  unchangedLoss: "تبقى خسارتك منذ الشراء",
  unchangedResult: "تبقى نتيجتك منذ الشراء",
  whatWillChange: "ما الذي سيتغير",
  correctionReason: "سبب التصحيح",
  imageDescriptionUpdate: "سيتم تحديث صورة المقتنى ووصفه.",
  correctionHistory: "سيظهر هذا التصحيح في السجل.",
};

function renderEdit(
  overrides: Partial<EditMetalHoldingFormProps> = {}
): EditMetalHoldingFormProps {
  const props: EditMetalHoldingFormProps = {
    mode: "edit",
    locale: "en",
    isRtl: false,
    width: 390,
    fontScale: 1,
    bottomInset: 34,
    holdingStatus: "active",
    values: toValues(original),
    preview: toPreview(original),
    editState: {
      affectedChanges: [],
      correctionReason: "",
    },
    copy: overrides.copy,
    onChange: jest.fn(),
    onSubmit: jest.fn(),
    onRequestExit: jest.fn(),
    onCorrectionReasonChange: jest.fn(),
    onAcknowledgeConsequences: jest.fn(),
    ...overrides,
  };
  const MetalHoldingForm = loadEditForm();
  render(<MetalHoldingForm {...props} />);
  return props;
}

function toValues(facts: EditFacts): EditMetalHoldingFormProps["values"] {
  return {
    name: facts.name,
    metal: facts.metal,
    weightGrams: facts.weightGramsDecimal,
    purityCode: "gold-999",
    purchasePrice: facts.purchasePriceDecimal,
    purchaseCurrency: facts.purchaseCurrency,
    purchaseDate: facts.purchaseDate,
    physicalForm: facts.physicalForm,
    notes: facts.notes ?? "",
  };
}

function toPreview(facts: EditFacts): EditMetalHoldingFormProps["preview"] {
  return {
    metal: facts.metal,
    purityCode: "gold-999",
    purityLabel: facts.purityLabel,
    purityFactorDecimal: "0.999",
    physicalForm: facts.physicalForm,
    name: facts.name,
    weightGramsDecimal: facts.weightGramsDecimal,
    displayCurrency: facts.purchaseCurrency,
    resultSincePurchaseDecimal: facts.performanceDecimal,
    resultDirection: "positive",
    valuation: {
      available: true,
      valueDecimal: facts.currentValueDecimal ?? "0",
    },
  };
}

function materialOverride(
  current: EditFacts,
  field: string,
  label: string,
  before: string,
  after: string,
  isFinancial = true
): Partial<EditMetalHoldingFormProps> {
  return {
    values: toValues(current),
    preview: toPreview(current),
    editState: {
      affectedChanges: [{ field, label, before, after, isFinancial }],
      correctionReason: "Corrected details",
    },
  };
}

describe("Edit metal holding form", () => {
  it("uses exact shared Add/Edit order, direct Save, and visibly locked Metal", (): void => {
    renderEdit();

    expect(screen.getByTestId("metal-holding-edit-screen")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-form")).toHaveProp("fieldOrder", [
      "metal-holding-name-field",
      "metal-holding-metal-field",
      "metal-holding-weight-purity-row",
      "metal-holding-purchase-price-field",
      "metal-holding-purchase-currency-field",
      "metal-holding-purchase-date-field",
      "metal-holding-physical-form-field",
      "metal-holding-notes-field",
      "metal-holding-live-preview",
      "metal-holding-local-first-status",
      "metal-holding-submit",
    ]);
    expect(screen.getByTestId("metal-holding-metal-field")).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ disabled: true })
    );
    expect(screen.getByTestId("metal-holding-metal-locked")).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-metal-locked-guidance")
    ).toBeOnTheScreen();
    expect(screen.getByText("Gold")).toHaveProp(
      "className",
      expect.stringContaining("dark:text-text-primary-dark")
    );
    expect(screen.getAllByText("24K · 999").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("14 Mar 2024")).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId("metal-holding-purchase-date-field"));
    expect(
      screen.getByTestId("metal-holding-purchase-date-picker")
    ).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-submit")).toHaveTextContent(
      "Save changes"
    );
    expect(screen.queryByTestId("metal-holding-review-screen")).toBeNull();
  });

  it("keeps metadata-only Save ordinary, then reveals persisted/current cues, reason, and affected-only summary for material changes", (): void => {
    const metadataProps = renderEdit({
      values: toValues({ ...original, name: "Coin for wedding" }),
      preview: toPreview({ ...original, name: "Coin for wedding" }),
    });
    expect(screen.queryByTestId("metal-holding-correction-reason")).toBeNull();
    expect(screen.queryByTestId("metal-holding-what-will-change")).toBeNull();
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(metadataProps.onSubmit).toHaveBeenCalledTimes(1);

    renderEdit(
      materialOverride(
        { ...original, weightGramsDecimal: "11.125" },
        "weight",
        "Weight",
        "10.125",
        "11.125"
      )
    );
    expect(
      screen.getByTestId("metal-holding-weight-purity-section")
    ).toBeOnTheScreen();
    expect(screen.getAllByText("Previous: 10.125")).toHaveLength(1);
    expect(screen.getByDisplayValue("11.125")).toBeOnTheScreen();
    expect(
      screen.getByTestId("metal-holding-correction-reason")
    ).toBeOnTheScreen();
    expect(screen.getByText("Weight: 10.125 → 11.125")).toBeOnTheScreen();
    expect(screen.getByTestId("metal-holding-live-preview")).toBeOnTheScreen();
    expect(screen.getByText("EGP 51,200")).toBeOnTheScreen();
    expect(
      screen.queryByTestId("metal-holding-consequence-acknowledgment")
    ).toBeNull();
    expect(
      screen.queryByTestId("metal-holding-purchase-date-previous")
    ).toBeNull();
  });

  it("hides correction state when every material delta is restored while retaining metadata changes", (): void => {
    renderEdit({
      values: toValues({
        ...original,
        name: "Corrected name",
        notes: "Still mine",
      }),
      preview: toPreview({
        ...original,
        name: "Corrected name",
        notes: "Still mine",
      }),
    });

    expect(screen.queryByTestId("metal-holding-correction-reason")).toBeNull();
    expect(screen.queryByTestId("metal-holding-what-will-change")).toBeNull();
    expect(screen.queryByTestId("metal-holding-weight-previous")).toBeNull();
  });

  it("describes physical-form-only correction without inventing a financial delta", (): void => {
    renderEdit(
      materialOverride(
        { ...original, physicalForm: "BAR" },
        "physicalForm",
        "Physical form",
        "Coin",
        "Bar",
        false
      )
    );

    expect(screen.getByText("Physical form: Coin → Bar")).toBeOnTheScreen();
    expect(screen.getByText("Current value stays EGP 51,200")).toBeOnTheScreen();
    expect(screen.getByText("Your gain since purchase stays EGP 3,400")).toBeOnTheScreen();
    expect(screen.getByText("The holding image and description will update.")).toBeOnTheScreen();
    expect(
      screen.getByText("This correction will appear in History")
    ).toBeOnTheScreen();
  });

  it("formats physical-form correction with negative and zero results in English", (): void => {
    renderEdit({
      ...materialOverride(
        { ...original, physicalForm: "BAR", performanceDecimal: "-500" },
        "physicalForm",
        "Physical form",
        "Coin",
        "Bar",
        false
      ),
      preview: {
        ...toPreview({ ...original, physicalForm: "BAR", performanceDecimal: "-500" }),
        resultDirection: "negative",
      },
    });

    expect(screen.getByText("Current value stays EGP 51,200")).toBeOnTheScreen();
    expect(screen.getByText("Your loss since purchase stays EGP 500")).toBeOnTheScreen();

    renderEdit({
      ...materialOverride(
        { ...original, physicalForm: "BAR", performanceDecimal: "0" },
        "physicalForm",
        "Physical form",
        "Coin",
        "Bar",
        false
      ),
      preview: {
        ...toPreview({ ...original, physicalForm: "BAR", performanceDecimal: "0" }),
        resultDirection: "zero",
      },
    });

    expect(screen.getByText("Your result since purchase stays EGP 0")).toBeOnTheScreen();
  });

  it("formats physical-form correction with positive, negative, and zero results in Arabic", (): void => {
    renderEdit({
      locale: "ar",
      isRtl: true,
      copy: ARABIC_EDIT_COPY,
      ...materialOverride(
        { ...original, physicalForm: "BAR" },
        "physicalForm",
        "الشكل",
        "عملة",
        "سبيكة",
        false
      ),
    });

    expect(screen.getByText("تظل القيمة الحالية ٥١٬٢٠٠ جنيه مصري")).toBeOnTheScreen();
    expect(screen.getByText("يبقى ربحك منذ الشراء ٣٬٤٠٠ جنيه مصري")).toBeOnTheScreen();

    renderEdit({
      locale: "ar",
      isRtl: true,
      copy: ARABIC_EDIT_COPY,
      ...materialOverride(
        { ...original, physicalForm: "BAR", performanceDecimal: "-500" },
        "physicalForm",
        "الشكل",
        "عملة",
        "سبيكة",
        false
      ),
      preview: {
        ...toPreview({ ...original, physicalForm: "BAR", performanceDecimal: "-500" }),
        resultDirection: "negative",
      },
    });

    expect(screen.getByText("تبقى خسارتك منذ الشراء ٥٠٠ جنيه مصري")).toBeOnTheScreen();

    renderEdit({
      locale: "ar",
      isRtl: true,
      copy: ARABIC_EDIT_COPY,
      ...materialOverride(
        { ...original, physicalForm: "BAR", performanceDecimal: "0" },
        "physicalForm",
        "الشكل",
        "عملة",
        "سبيكة",
        false
      ),
      preview: {
        ...toPreview({ ...original, physicalForm: "BAR", performanceDecimal: "0" }),
        resultDirection: "zero",
      },
    });

    expect(screen.getByText("تبقى نتيجتك منذ الشراء ٠ جنيه مصري")).toBeOnTheScreen();
  });

  it("shows and focuses the missing correction reason error", (): void => {
    renderEdit({
      ...materialOverride(
        { ...original, weightGramsDecimal: "11.125" },
        "weight",
        "Weight",
        "10.125",
        "11.125"
      ),
      editState: {
        affectedChanges: [{ field: "weight", label: "Weight", before: "10.125", after: "11.125", isFinancial: true }],
        correctionReason: "",
      },
      validationErrors: { correctionReason: "Reason is required" },
    });

    expect(screen.getByTestId("metal-holding-correction-reason")).toHaveProp("autoFocus", true);
    expect(screen.getByTestId("metal-holding-correction-reason-error")).toHaveTextContent("Reason is required");
    expect(screen.getByText("Reason is required")).toBeOnTheScreen();
  });

  it("does not focus correction reason when an earlier field is invalid", (): void => {
    renderEdit({
      ...materialOverride(
        { ...original, weightGramsDecimal: "11.125" },
        "weight",
        "Weight",
        "10.125",
        "11.125"
      ),
      editState: {
        affectedChanges: [{ field: "weight", label: "Weight", before: "10.125", after: "11.125", isFinancial: true }],
        correctionReason: "",
      },
      validationErrors: {
        name: "Name is required",
        correctionReason: "Reason is required",
      },
    });

    expect(screen.getByTestId("metal-holding-name-field")).toHaveProp("autoFocus", true);
    expect(screen.getByTestId("metal-holding-correction-reason")).toHaveProp("autoFocus", false);
  });

  it("shows image update consequence alongside financial changes without unchanged value claims", (): void => {
    renderEdit({
      values: toValues({ ...original, weightGramsDecimal: "11.125", physicalForm: "BAR" }),
      preview: toPreview({ ...original, weightGramsDecimal: "11.125", physicalForm: "BAR", currentValueDecimal: "56000", performanceDecimal: "8200" }),
      editState: {
        affectedChanges: [
          { field: "weight", label: "Weight", before: "10.125", after: "11.125", isFinancial: true },
          { field: "physicalForm", label: "Physical form", before: "Coin", after: "Bar", isFinancial: false },
        ],
        correctionReason: "Updated weight and form",
      },
    });

    expect(screen.getByText("Weight: 10.125 → 11.125")).toBeOnTheScreen();
    expect(screen.getByText("Physical form: Coin → Bar")).toBeOnTheScreen();
    expect(screen.getByText("The holding image and description will update.")).toBeOnTheScreen();
    expect(screen.queryByText(/Current value stays/)).toBeNull();
    expect(screen.queryByText(/Your gain since purchase stays/)).toBeNull();
    expect(screen.getByText("EGP 56,000")).toBeOnTheScreen();
    expect(screen.getByText("+ EGP 8,200")).toBeOnTheScreen();
  });

  it("shows valuation unavailable during financial edit when market rates are missing without inventing values", (): void => {
    renderEdit({
      values: toValues({ ...original, weightGramsDecimal: "11.125" }),
      preview: {
        ...toPreview({ ...original, weightGramsDecimal: "11.125" }),
        valuation: { available: false, reason: "missing_rate" },
        resultSincePurchaseDecimal: null,
      },
      editState: {
        affectedChanges: [
          { field: "weight", label: "Weight", before: "10.125", after: "11.125", isFinancial: true },
        ],
        correctionReason: "Corrected weight",
      },
    });

    expect(screen.getByTestId("metal-holding-valuation-unavailable")).toHaveTextContent("Valuation unavailable");
    expect(screen.queryByText(/Current value stays/)).toBeNull();
  });

  it("shows metal and FX value, source, quality, age, and freshness independently", (): void => {
    renderEdit({
      preview: {
        ...toPreview(original),
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
          state: "stale",
          ageMs: 3_600_000,
          source: "FX feed",
          quality: "indicative",
          providerObservedAt: new Date("2026-09-01T09:00:00Z"),
        },
      },
    });
    expect(screen.getByText("Metal rate · USD 100")).toBeOnTheScreen();
    expect(screen.getByText("Metal feed · verified · Rates are current · 1 minute ago")).toBeOnTheScreen();
    expect(screen.getByText("FX rate · USD 0.02 / EGP")).toBeOnTheScreen();
    expect(screen.getByText("FX feed · indicative · Using an older saved rate · 1 hour ago")).toBeOnTheScreen();
  });

  it("explicitly discloses distinct unknown freshness, unknown age, and unknown observation time and formats age under 1 minute as just now", (): void => {
    renderEdit({
      preview: {
        ...toPreview(original),
        metalRateTrust: {
          valueDecimal: "100",
          state: "unknown",
          ageMs: null,
          source: "Metal feed",
          quality: "unverified",
          providerObservedAt: null,
        },
        fxRateTrust: {
          valueDecimal: "0.02",
          state: "fresh",
          ageMs: 30_000,
          source: "FX feed",
          quality: "verified",
          providerObservedAt: new Date("2026-09-01T09:00:00Z"),
        },
      },
    });

    expect(screen.getByText("Metal rate · USD 100")).toBeOnTheScreen();
    expect(
      screen.getByText("Metal feed · unverified · Freshness unknown · Rate age is unavailable")
    ).toBeOnTheScreen();
    expect(screen.getByText("Observation time unavailable")).toBeOnTheScreen();
    expect(screen.getByText("FX rate · USD 0.02 / EGP")).toBeOnTheScreen();
    expect(screen.getByText("FX feed · verified · Rates are current · just now")).toBeOnTheScreen();
  });

  it("renders distinct unknown trust copy and just now in Arabic", (): void => {
    renderEdit({
      locale: "ar",
      isRtl: true,
      copy: ARABIC_EDIT_COPY,
      preview: {
        ...toPreview(original),
        metalRateTrust: {
          valueDecimal: "100",
          state: "unknown",
          ageMs: null,
          source: "Metal feed",
          quality: "unverified",
          providerObservedAt: null,
        },
        fxRateTrust: {
          valueDecimal: "0.02",
          state: "fresh",
          ageMs: 25_000,
          source: "FX feed",
          quality: "verified",
          providerObservedAt: new Date("2026-09-01T09:00:00Z"),
        },
      },
    });

    expect(
      screen.getByText("Metal feed · unverified · حداثة السعر غير معروفة · عمر السعر غير متاح")
    ).toBeOnTheScreen();
    expect(screen.getByText("وقت الرصد غير متاح")).toBeOnTheScreen();
    expect(screen.getByText("FX feed · verified · الأسعار حديثة · الآن")).toBeOnTheScreen();
  });

  it("limits terminal holdings to metadata and keeps dirty exit, focus, pending lock, safe area, Arabic RTL, theme, and compact 200 percent reflow accessible", (): void => {
    const props = renderEdit({
      holdingStatus: "sold",
      isSubmitting: true,
      validationErrors: { name: "required" },
      locale: "ar",
      isRtl: true,
      width: 320,
      fontScale: 2,
    });

    expect(screen.queryByTestId("metal-holding-weight-field")).toBeNull();
    expect(screen.getByTestId("metal-holding-name-field")).toHaveProp(
      "autoFocus",
      true
    );
    expect(screen.getByTestId("metal-holding-submit-area")).toHaveProp(
      "bottomInset",
      34
    );
    expect(screen.getByTestId("metal-holding-form")).toHaveProp(
      "writingDirection",
      "rtl"
    );
    expect(
      screen.queryByTestId("metal-holding-weight-purity-stacked")
    ).toBeNull();
    fireEvent.press(screen.getByTestId("header-back"));
    expect(props.onRequestExit).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId("metal-holding-submit"));
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});
