import type { CurrencyType } from "@monyvi/db";

import { SUPPORTED_CURRENCIES } from "../utils/currency-data";
import { parseCanonicalDecimal, serializeDecimal } from "./decimal";

export type MetalRateRole =
  | "acquisition_metal"
  | "current_metal"
  | "terminal_metal";

export type CurrencyRateRole =
  | "acquisition_purchase_currency"
  | "current_purchase_currency"
  | "terminal_purchase_currency"
  | "terminal_proceeds_currency"
  | "display_purchase_currency"
  | "display_preferred_currency";

export type MetalsIsoCurrencyCode = Exclude<CurrencyType, "BTC">;
export type MetalInstrumentCode = `metal:${"GOLD" | "SILVER"}`;
export type CurrencyInstrumentCode = `currency:${MetalsIsoCurrencyCode}`;
export type RateInstrumentCode = MetalInstrumentCode | CurrencyInstrumentCode;

export type RateReferenceUnavailableReason =
  | "missing_reference"
  | "unsupported_role"
  | "unsupported_instrument"
  | "role_kind_mismatch"
  | "instrument_context_mismatch"
  | "invalid_unit_orientation_pair"
  | "invalid_value"
  | "quality_not_valid"
  | "invalid_capture_time";

interface ExactRateReferenceBase {
  readonly valueDecimal: string;
  readonly providerObservedAt: number | null;
  readonly source: string | null;
  readonly quality: "valid";
  readonly capturedAt: number;
  readonly capturedFreshness: "fresh" | "stale" | "unknown";
}

export interface ExactMetalRateReference extends ExactRateReferenceBase {
  readonly role: MetalRateRole;
  readonly kind: "metal";
  readonly instrumentCode: MetalInstrumentCode;
  readonly unit: "usd_per_pure_gram";
  readonly orientation: "quote_per_base";
}

export interface ExactDirectCurrencyRateReference extends ExactRateReferenceBase {
  readonly role: CurrencyRateRole;
  readonly kind: "currency";
  readonly instrumentCode: CurrencyInstrumentCode;
  readonly unit: "usd_per_currency_unit";
  readonly orientation: "quote_per_base";
}

export interface ExactInverseCurrencyRateReference extends ExactRateReferenceBase {
  readonly role: CurrencyRateRole;
  readonly kind: "currency";
  readonly instrumentCode: CurrencyInstrumentCode;
  readonly unit: "currency_units_per_usd";
  readonly orientation: "base_per_quote";
}

export type ExactCurrencyRateReference =
  | ExactDirectCurrencyRateReference
  | ExactInverseCurrencyRateReference;

export type ExactRateReference =
  | ExactMetalRateReference
  | ExactCurrencyRateReference;

export type NormalizedRateReference = ExactRateReference & {
  readonly normalizedUsdPerBaseDecimal: string;
};

export type RawObservedRateReference = unknown;

export type RateReferenceExpectation =
  | {
      readonly role: MetalRateRole;
      readonly instrumentCode: MetalInstrumentCode;
    }
  | {
      readonly role: CurrencyRateRole;
      readonly instrumentCode: CurrencyInstrumentCode;
    };

export type RateReferenceValidationResult =
  | { readonly available: true; readonly value: NormalizedRateReference }
  | {
      readonly available: false;
      readonly reason: RateReferenceUnavailableReason;
    };

const METAL_ROLES: readonly string[] = Object.freeze([
  "acquisition_metal",
  "current_metal",
  "terminal_metal",
]);

const CURRENCY_ROLES: readonly string[] = Object.freeze([
  "acquisition_purchase_currency",
  "current_purchase_currency",
  "terminal_purchase_currency",
  "terminal_proceeds_currency",
  "display_purchase_currency",
  "display_preferred_currency",
]);

const METALS_ISO_CURRENCIES: ReadonlySet<string> = new Set(
  SUPPORTED_CURRENCIES
    .map(({ code }) => code)
    .filter((code) => code !== "BTC")
);

const FRESHNESS_WINDOW_MS = 86_400_000;

export function validateAndNormalizeRateReference(
  reference: RawObservedRateReference,
  expectation: RateReferenceExpectation
): RateReferenceValidationResult {
  if (!isRecord(reference)) {
    return unavailable("missing_reference");
  }
  if (!isSupportedRole(reference.role)) {
    return unavailable("unsupported_role");
  }
  if (!isSupportedInstrument(reference.instrumentCode)) {
    return unavailable("unsupported_instrument");
  }
  if (!doesRoleMatchKind(reference.role, reference.kind)) {
    return unavailable("role_kind_mismatch");
  }
  if (
    reference.role !== expectation.role ||
    reference.instrumentCode !== expectation.instrumentCode ||
    !doesInstrumentMatchKind(reference.instrumentCode, reference.kind)
  ) {
    return unavailable("instrument_context_mismatch");
  }
  if (!isLegalUnitOrientation(reference)) {
    return unavailable("invalid_unit_orientation_pair");
  }

  const normalizedValue = normalizeValue(reference);
  if (normalizedValue === null) {
    return unavailable("invalid_value");
  }
  if (reference.quality !== "valid") {
    return unavailable("quality_not_valid");
  }
  if (!isValidTimestamp(reference.capturedAt)) {
    return unavailable("invalid_capture_time");
  }

  const providerObservedAt = normalizeProviderObservedAt(
    reference.providerObservedAt,
    reference.capturedAt
  );
  const capturedFreshness = classifyCapturedFreshness(
    providerObservedAt,
    reference.capturedAt
  );
  const snapshot = createNormalizedSnapshot(
    reference,
    providerObservedAt,
    capturedFreshness,
    normalizedValue
  );
  if (snapshot === null) {
    return unavailable("invalid_value");
  }
  return { available: true, value: Object.freeze(snapshot) };
}

function unavailable(
  reason: RateReferenceUnavailableReason
): RateReferenceValidationResult {
  return { available: false, reason };
}

function isSupportedRole(role: unknown): role is MetalRateRole | CurrencyRateRole {
  return typeof role === "string" &&
    (METAL_ROLES.includes(role) || CURRENCY_ROLES.includes(role));
}

function isSupportedInstrument(code: unknown): code is RateInstrumentCode {
  if (code === "metal:GOLD" || code === "metal:SILVER") {
    return true;
  }
  if (typeof code !== "string" || !code.startsWith("currency:")) {
    return false;
  }
  return isSupportedMetalsIsoCurrencyCode(code.slice("currency:".length));
}

export function isSupportedMetalsIsoCurrencyCode(
  code: unknown
): code is MetalsIsoCurrencyCode {
  return typeof code === "string" &&
    code !== "BTC" &&
    METALS_ISO_CURRENCIES.has(code);
}

function doesRoleMatchKind(
  role: MetalRateRole | CurrencyRateRole,
  kind: unknown
): kind is "metal" | "currency" {
  return METAL_ROLES.includes(role)
    ? kind === "metal"
    : kind === "currency";
}

function doesInstrumentMatchKind(
  instrumentCode: RateInstrumentCode,
  kind: "metal" | "currency"
): boolean {
  return kind === "metal"
    ? instrumentCode.startsWith("metal:")
    : instrumentCode.startsWith("currency:");
}

function isLegalUnitOrientation(
  reference: Readonly<Record<string, unknown>>
): boolean {
  if (reference.kind === "metal") {
    return reference.unit === "usd_per_pure_gram" &&
      reference.orientation === "quote_per_base";
  }
  return (
    (reference.unit === "usd_per_currency_unit" &&
      reference.orientation === "quote_per_base") ||
    (reference.unit === "currency_units_per_usd" &&
      reference.orientation === "base_per_quote")
  );
}

function normalizeValue(
  reference: Readonly<Record<string, unknown>>
): string | null {
  try {
    if (typeof reference.valueDecimal !== "string") {
      return null;
    }
    const raw = parseCanonicalDecimal(reference.valueDecimal);
    if (!raw.greaterThan("0")) {
      return null;
    }
    if (
      reference.instrumentCode === "currency:USD" &&
      !raw.minus("1").isZero()
    ) {
      return null;
    }
    return serializeDecimal(
      reference.orientation === "quote_per_base"
        ? raw
        : parseCanonicalDecimal("1").dividedBy(raw)
    );
  } catch {
    return null;
  }
}

function createNormalizedSnapshot(
  reference: Readonly<Record<string, unknown>>,
  providerObservedAt: number | null,
  capturedFreshness: "fresh" | "stale" | "unknown",
  normalizedUsdPerBaseDecimal: string
): NormalizedRateReference | null {
  if (
    !isSupportedRole(reference.role) ||
    !isSupportedInstrument(reference.instrumentCode) ||
    !isValidTimestamp(reference.capturedAt) ||
    typeof reference.valueDecimal !== "string"
  ) {
    return null;
  }
  const common = {
    valueDecimal: reference.valueDecimal,
    providerObservedAt,
    source: typeof reference.source === "string" ? reference.source : null,
    quality: "valid" as const,
    capturedAt: reference.capturedAt,
    capturedFreshness,
    normalizedUsdPerBaseDecimal,
  };
  if (
    METAL_ROLES.includes(reference.role) &&
    reference.kind === "metal" &&
    reference.instrumentCode.startsWith("metal:") &&
    reference.unit === "usd_per_pure_gram" &&
    reference.orientation === "quote_per_base"
  ) {
    return {
      ...common,
      role: reference.role as MetalRateRole,
      kind: "metal",
      instrumentCode: reference.instrumentCode as MetalInstrumentCode,
      unit: "usd_per_pure_gram",
      orientation: "quote_per_base",
    };
  }
  if (
    CURRENCY_ROLES.includes(reference.role) &&
    reference.kind === "currency" &&
    reference.instrumentCode.startsWith("currency:")
  ) {
    const currencyCommon = {
      ...common,
      role: reference.role as CurrencyRateRole,
      kind: "currency" as const,
      instrumentCode: reference.instrumentCode as CurrencyInstrumentCode,
    };
    if (
      reference.unit === "usd_per_currency_unit" &&
      reference.orientation === "quote_per_base"
    ) {
      return {
        ...currencyCommon,
        unit: "usd_per_currency_unit",
        orientation: "quote_per_base",
      };
    }
    if (
      reference.unit === "currency_units_per_usd" &&
      reference.orientation === "base_per_quote"
    ) {
      return {
        ...currencyCommon,
        unit: "currency_units_per_usd",
        orientation: "base_per_quote",
      };
    }
  }
  return null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeProviderObservedAt(
  value: unknown,
  capturedAt: number
): number | null {
  return isValidTimestamp(value) && value <= capturedAt ? value : null;
}

function classifyCapturedFreshness(
  providerObservedAt: number | null,
  capturedAt: number
): "fresh" | "stale" | "unknown" {
  if (providerObservedAt === null) {
    return "unknown";
  }
  return capturedAt - providerObservedAt > FRESHNESS_WINDOW_MS
    ? "stale"
    : "fresh";
}
