import { createMetalHoldingLivePreview } from "../services/metal-holding-preview-service";

export type SupportedMetalType = "GOLD" | "SILVER";
export type MetalPhysicalForm = "COIN" | "BAR" | "JEWELRY";

export interface MetalPurityCatalogEntry {
  readonly code: string;
  readonly catalogVersion: "1";
  readonly factorDecimal: string;
  readonly labelKey: string;
  readonly displayLabel: string;
  readonly metal: SupportedMetalType;
}

export interface MetalHoldingFormData {
  readonly name: string;
  readonly metal: string | null;
  readonly weightGrams: string;
  readonly purityCode: string | null;
  readonly purchasePrice: string;
  readonly purchaseCurrency: string | null;
  readonly purchaseDate: string | null;
  readonly physicalForm: string | null;
  readonly notes: string | null;
  readonly unusualValueAcknowledged: boolean;
}

export interface MetalHoldingFormValidationContext {
  readonly locale: "en" | "ar";
  readonly decimalSeparator?: "." | ",";
  readonly today: string;
  readonly currencyMinorUnits: number;
  readonly safeRange: {
    readonly maximumWeightGramsDecimal: string;
    readonly maximumPurchasePriceDecimal: string;
  };
  readonly isUnusualValue: (field: string, valueDecimal: string) => boolean;
  readonly isUnusualHolding?: (
    holding: NormalizedMetalHoldingFormData
  ) => boolean;
}

export interface NormalizedMetalHoldingFormData {
  readonly name: string;
  readonly metal: SupportedMetalType;
  readonly weightGramsDecimal: string;
  readonly purity: {
    readonly code: string;
    readonly catalogVersion: "1";
    readonly factorDecimal: string;
    readonly labelKey: string;
  };
  readonly purchasePriceDecimal: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly physicalForm: MetalPhysicalForm | null;
  readonly notes: string | null;
}

export interface MetalHoldingFormValidationResult {
  readonly isValid: boolean;
  readonly errors: Readonly<Record<string, string | undefined>>;
  readonly normalized: NormalizedMetalHoldingFormData | null;
  readonly requiresUnusualValueAcknowledgment: boolean;
}

const PURITY_CATALOG: readonly MetalPurityCatalogEntry[] = Object.freeze([
  purity("GOLD", "gold-9999", "0.9999", "24K · 999.9"),
  purity("GOLD", "gold-999", "0.999", "24K · 999"),
  purity("GOLD", "gold-995", "0.995", "24K · 995"),
  purity("GOLD", "gold-97916", "0.97916", "23.5K · 979.16"),
  purity("GOLD", "gold-9167", "0.9167", "22K · 916.7"),
  purity("GOLD", "gold-875", "0.875", "21K · 875"),
  purity("GOLD", "gold-750", "0.75", "18K · 750"),
  purity("GOLD", "gold-58333", "0.58333", "14K · 583.33"),
  purity("GOLD", "gold-500", "0.5", "12K · 500"),
  purity("GOLD", "gold-375", "0.375", "9K · 375"),
  purity("SILVER", "silver-9999", "0.9999", "999.9"),
  purity("SILVER", "silver-999", "0.999", "999"),
  purity("SILVER", "silver-925", "0.925", "925"),
  purity("SILVER", "silver-900", "0.9", "900"),
  purity("SILVER", "silver-800", "0.8", "800"),
  purity("SILVER", "silver-600", "0.6", "600"),
]);

const APPROVED_CURRENCIES = new Set([
  "EGP",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "IQD",
  "LYD",
  "TND",
  "MAD",
  "DZD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "KRW",
  "KPW",
  "SGD",
  "HKD",
  "MYR",
  "AUD",
  "NZD",
  "CAD",
  "SEK",
  "NOK",
  "DKK",
  "ISK",
  "TRY",
  "RUB",
  "ZAR",
]);

const PHYSICAL_FORMS = new Set<MetalPhysicalForm>(["COIN", "BAR", "JEWELRY"]);
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function purity(
  metal: SupportedMetalType,
  code: string,
  factorDecimal: string,
  displayLabel: string
): MetalPurityCatalogEntry {
  return Object.freeze({
    metal,
    code,
    catalogVersion: "1",
    factorDecimal,
    labelKey: `purity_${code.replaceAll("-", "_")}`,
    displayLabel,
  });
}

export function getSupportedMetalPurities(
  metal: SupportedMetalType
): readonly MetalPurityCatalogEntry[] {
  return PURITY_CATALOG.filter((entry) => entry.metal === metal);
}

export function validateMetalHoldingForm(
  data: MetalHoldingFormData,
  context: MetalHoldingFormValidationContext
): MetalHoldingFormValidationResult {
  const errors: Record<string, string | undefined> = {};
  const name = data.name.trim();
  if (name.length === 0) errors.name = "required";

  const metal = normalizeMetal(data.metal, errors);
  const weight = validateDecimalField({
    raw: data.weightGrams,
    field: "weightGrams",
    maximumDecimalPlaces: 3,
    maximumValue: context.safeRange.maximumWeightGramsDecimal,
    context,
    errors,
  });
  const purchasePrice = validateDecimalField({
    raw: data.purchasePrice,
    field: "purchasePrice",
    maximumDecimalPlaces: context.currencyMinorUnits,
    maximumValue: context.safeRange.maximumPurchasePriceDecimal,
    context,
    precisionError: "currency_precision",
    errors,
  });
  const purityEntry = normalizePurity(data.purityCode, metal, errors);
  const purchaseCurrency = normalizeCurrency(data.purchaseCurrency, errors);
  const purchaseDate = normalizeDate(data.purchaseDate, context.today, errors);
  const physicalForm = normalizePhysicalForm(data.physicalForm, errors);
  const notes = normalizeOptionalText(data.notes);

  const fieldRequiresUnusualValueAcknowledgment =
    (weight !== null && context.isUnusualValue("weightGrams", weight)) ||
    (purchasePrice !== null &&
      context.isUnusualValue("purchasePrice", purchasePrice));

  const normalized =
    name.length > 0 &&
    metal !== null &&
    weight !== null &&
    purityEntry !== null &&
    purchasePrice !== null &&
    purchaseCurrency !== null &&
    purchaseDate !== null
      ? Object.freeze({
          name,
          metal,
          weightGramsDecimal: weight,
          purity: Object.freeze({
            code: purityEntry.code,
            catalogVersion: purityEntry.catalogVersion,
            factorDecimal: purityEntry.factorDecimal,
            labelKey: purityEntry.labelKey,
          }),
          purchasePriceDecimal: purchasePrice,
          purchaseCurrency,
          purchaseDate,
          physicalForm,
          notes,
        })
      : null;

  const requiresUnusualValueAcknowledgment =
    fieldRequiresUnusualValueAcknowledgment ||
    (normalized !== null && context.isUnusualHolding?.(normalized) === true);
  if (requiresUnusualValueAcknowledgment && !data.unusualValueAcknowledged) {
    errors.unusualValueAcknowledged = "required";
  }

  return Object.freeze({
    isValid: Object.values(errors).every((value) => value === undefined),
    errors: Object.freeze(errors),
    normalized,
    requiresUnusualValueAcknowledgment,
  });
}

interface ValidateDecimalFieldInput {
  readonly raw: string;
  readonly field: "weightGrams" | "purchasePrice";
  readonly maximumDecimalPlaces: number;
  readonly maximumValue: string;
  readonly context: Pick<
    MetalHoldingFormValidationContext,
    "locale" | "decimalSeparator"
  >;
  readonly errors: Record<string, string | undefined>;
  readonly precisionError?: "currency_precision";
}

function validateDecimalField(input: ValidateDecimalFieldInput): string | null {
  if (input.raw.trim().length === 0) {
    input.errors[input.field] = "required";
    return null;
  }
  const normalized = normalizeLocalizedDecimal(input.raw, input.context);
  if (normalized === null) {
    input.errors[input.field] = "invalid";
    return null;
  }
  if (normalized === "0") {
    input.errors[input.field] = "non_positive";
    return normalized;
  }
  if (decimalPlaces(normalized) > input.maximumDecimalPlaces) {
    input.errors[input.field] = input.precisionError ?? "precision";
  } else if (compareCanonicalDecimals(normalized, input.maximumValue) > 0) {
    input.errors[input.field] = "out_of_range";
  }
  return normalized;
}

function normalizeMetal(
  value: string | null,
  errors: Record<string, string | undefined>
): SupportedMetalType | null {
  if (value === null) {
    errors.metal = "required";
    return null;
  }
  if (value !== "GOLD" && value !== "SILVER") {
    errors.metal = "unsupported_metal";
    return null;
  }
  return value;
}

function normalizePurity(
  value: string | null,
  metal: SupportedMetalType | null,
  errors: Record<string, string | undefined>
): MetalPurityCatalogEntry | null {
  if (value === null) {
    errors.purityCode = "required";
    return null;
  }
  if (value.length === 0) {
    errors.purityCode = "invalid";
    return null;
  }
  const entry = PURITY_CATALOG.find(
    (candidate) => candidate.code === value && candidate.metal === metal
  );
  if (!entry) errors.purityCode = "unknown_purity";
  return entry ?? null;
}

function normalizeCurrency(
  value: string | null,
  errors: Record<string, string | undefined>
): string | null {
  if (value === null) {
    errors.purchaseCurrency = "required";
    return null;
  }
  if (!APPROVED_CURRENCIES.has(value)) {
    errors.purchaseCurrency = "invalid";
    return null;
  }
  return value;
}

function normalizeDate(
  value: string | null,
  today: string,
  errors: Record<string, string | undefined>
): string | null {
  if (value === null || value.trim().length === 0) {
    errors.purchaseDate = "required";
    return null;
  }
  if (!isCalendarDate(value)) {
    errors.purchaseDate = "invalid";
    return null;
  }
  if (value > today) errors.purchaseDate = "future_date";
  return value;
}

function normalizePhysicalForm(
  value: string | null,
  errors: Record<string, string | undefined>
): MetalPhysicalForm | null {
  if (value === null) return null;
  if (!PHYSICAL_FORMS.has(value as MetalPhysicalForm)) {
    errors.physicalForm = "invalid";
    return null;
  }
  return value as MetalPhysicalForm;
}

function normalizeOptionalText(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function normalizeLocalizedDecimal(
  raw: string,
  context: Pick<
    MetalHoldingFormValidationContext,
    "locale" | "decimalSeparator"
  >
): string | null {
  let normalized = raw
    .trim()
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(EASTERN_ARABIC_DIGITS.indexOf(digit)))
    .replaceAll("٫", ".")
    .replaceAll("٬", ",");
  if (!/^[0-9.,]+$/.test(normalized)) return null;

  const decimalSeparator = context.decimalSeparator ?? ".";
  if (decimalSeparator === ",") {
    if ((normalized.match(/,/g) ?? []).length > 1) return null;
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else if (normalized.includes(",")) {
    if (!isValidGroupedInteger(normalized)) return null;
    normalized = normalized.replaceAll(",", "");
  }
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const [rawInteger, rawFraction = ""] = normalized.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  const fraction = rawFraction.replace(/0+$/, "");
  return fraction.length > 0 ? `${integer}.${fraction}` : integer;
}

function isValidGroupedInteger(value: string): boolean {
  const [integer, fraction] = value.split(".");
  if (fraction !== undefined && !/^\d+$/.test(fraction)) return false;
  return /^\d{1,3}(?:,\d{3})+$/.test(integer);
}

function decimalPlaces(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

function compareCanonicalDecimals(left: string, right: string): number {
  const [leftInteger, leftFraction = ""] = left.split(".");
  const [rightInteger, rightFraction = ""] = right.split(".");
  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length > rightInteger.length ? 1 : -1;
  }
  if (leftInteger !== rightInteger) return leftInteger > rightInteger ? 1 : -1;
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftScaled = leftFraction.padEnd(scale, "0");
  const rightScaled = rightFraction.padEnd(scale, "0");
  if (leftScaled === rightScaled) return 0;
  return leftScaled > rightScaled ? 1 : -1;
}

export { createMetalHoldingLivePreview };
