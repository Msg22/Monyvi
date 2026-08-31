import {
  isSupportedMetalsIsoCurrencyCode,
  validateAndNormalizeRateReference,
  type CurrencyInstrumentCode,
  type ExactRateReference,
  type RateReferenceExpectation,
} from "../rate-reference";
import { SUPPORTED_CURRENCIES } from "../../utils/currency-data";

type AssertFalse<Value extends false> = Value;

interface IllegalInverseMetalReference {
  readonly role: "current_metal";
  readonly kind: "metal";
  readonly instrumentCode: "metal:GOLD";
  readonly valueDecimal: "75";
  readonly unit: "usd_per_pure_gram";
  readonly orientation: "base_per_quote";
  readonly providerObservedAt: 1_000;
  readonly source: "provider-a";
  readonly quality: "valid";
  readonly capturedAt: 2_000;
  readonly capturedFreshness: "fresh";
}

type IllegalMetalRoleCurrencyReference = Omit<
  IllegalInverseMetalReference,
  "kind" | "instrumentCode" | "unit" | "orientation"
> & {
  readonly kind: "currency";
  readonly instrumentCode: "currency:EGP";
  readonly unit: "usd_per_currency_unit";
  readonly orientation: "quote_per_base";
};

type IllegalInverseCurrencyPairReference = Omit<
  IllegalMetalRoleCurrencyReference,
  "role" | "unit"
> & {
  readonly role: "current_purchase_currency";
  readonly unit: "currency_units_per_usd";
};

type _RejectInverseMetalAtCompileTime = AssertFalse<
  IllegalInverseMetalReference extends ExactRateReference ? true : false
>;
type _RejectMetalRoleCurrencyAtCompileTime = AssertFalse<
  IllegalMetalRoleCurrencyReference extends ExactRateReference ? true : false
>;
type _RejectIllegalInversePairAtCompileTime = AssertFalse<
  IllegalInverseCurrencyPairReference extends ExactRateReference ? true : false
>;

type RawRateReference = Readonly<Record<string, unknown>>;

function reference(
  overrides: Readonly<Record<string, unknown>> = {}
): RawRateReference {
  return Object.freeze({
    role: "current_purchase_currency",
    kind: "currency",
    instrumentCode: "currency:EGP",
    valueDecimal: "0.020000000000000000000000000000000000000000000000001",
    unit: "usd_per_currency_unit",
    orientation: "quote_per_base",
    providerObservedAt: 1_000,
    source: "provider-a",
    quality: "valid",
    capturedAt: 2_000,
    capturedFreshness: "fresh",
    ...overrides,
  });
}

const CURRENT_EGP = {
  role: "current_purchase_currency",
  instrumentCode: "currency:EGP",
} satisfies RateReferenceExpectation;

describe("approved Metals rate-reference contract", () => {
  it("derives every runtime Metals ISO currency from the canonical catalog while excluding BTC", () => {
    for (const { code } of SUPPORTED_CURRENCIES) {
      expect(isSupportedMetalsIsoCurrencyCode(code)).toBe(code !== "BTC");
      if (isSupportedMetalsIsoCurrencyCode(code)) {
        const instrumentCode: CurrencyInstrumentCode = `currency:${code}`;
        expect(
          validateAndNormalizeRateReference(
            reference({
              instrumentCode,
              valueDecimal: code === "USD" ? "1" : "0.02",
            }),
            { role: "current_purchase_currency", instrumentCode }
          )
        ).toMatchObject({ available: true });
      }
    }
    expect(isSupportedMetalsIsoCurrencyCode("BTC")).toBe(false);
    expect(isSupportedMetalsIsoCurrencyCode("ZZZ")).toBe(false);
  });

  it.each([
    [
      reference({
        role: "current_metal",
        kind: "metal",
        instrumentCode: "metal:GOLD",
        valueDecimal: "75.125",
        unit: "usd_per_pure_gram",
        orientation: "quote_per_base",
      }),
      { role: "current_metal", instrumentCode: "metal:GOLD" },
      "75.125",
    ],
    [reference(), CURRENT_EGP, "0.020000000000000000000000000000000000000000000000001"],
    [reference({ valueDecimal: "50", unit: "currency_units_per_usd", orientation: "base_per_quote" }), CURRENT_EGP, "0.02"],
    [reference({ instrumentCode: "currency:USD", valueDecimal: "1" }), { role: "current_purchase_currency", instrumentCode: "currency:USD" }, "1"],
  ] as const)("normalizes every legal direct/inverse matrix form exactly", (input, expected, normalized) => {
    expect(validateAndNormalizeRateReference(input, expected)).toMatchObject({
      available: true,
      value: { normalizedUsdPerBaseDecimal: normalized },
    });
  });

  it.each([
    [null, CURRENT_EGP, "missing_reference"],
    [reference({ role: "future_role" }), CURRENT_EGP, "unsupported_role"],
    [reference({ instrumentCode: "currency:BTC" }), CURRENT_EGP, "unsupported_instrument"],
    [reference({ instrumentCode: "currency:ZZZ" }), CURRENT_EGP, "unsupported_instrument"],
    [reference({ kind: "metal" }), CURRENT_EGP, "role_kind_mismatch"],
    [reference({ role: "current_metal", kind: "currency" }), { role: "current_metal", instrumentCode: "metal:GOLD" }, "role_kind_mismatch"],
    [reference({ instrumentCode: "currency:SAR" }), CURRENT_EGP, "instrument_context_mismatch"],
    [reference({ role: "terminal_purchase_currency" }), CURRENT_EGP, "instrument_context_mismatch"],
    [reference({ unit: "currency_units_per_usd", orientation: "quote_per_base" }), CURRENT_EGP, "invalid_unit_orientation_pair"],
    [reference({ unit: "usd_per_currency_unit", orientation: "base_per_quote" }), CURRENT_EGP, "invalid_unit_orientation_pair"],
    [reference({ kind: "metal", role: "current_metal", instrumentCode: "metal:GOLD", unit: "usd_per_pure_gram", orientation: "base_per_quote" }), { role: "current_metal", instrumentCode: "metal:GOLD" }, "invalid_unit_orientation_pair"],
    [reference({ valueDecimal: "0" }), CURRENT_EGP, "invalid_value"],
    [reference({ quality: "unknown" }), CURRENT_EGP, "quality_not_valid"],
    [reference({ capturedAt: "bad-time" }), CURRENT_EGP, "invalid_capture_time"],
  ] as const)("returns stable reason %s", (input, expected, reason) => {
    expect(validateAndNormalizeRateReference(input, expected)).toEqual({ available: false, reason });
  });

  it.each([undefined, null, "bad-time", Number.NaN, Number.POSITIVE_INFINITY, 3_000] as const)(
    "keeps usable values available but provider time %p unknown",
    (providerObservedAt) => {
      expect(validateAndNormalizeRateReference(reference({ providerObservedAt }), CURRENT_EGP)).toMatchObject({
        available: true,
        value: { providerObservedAt: null, capturedFreshness: "unknown" },
      });
    }
  );

  it.each([
    ["missing", (() => {
      const raw = { ...reference() };
      Reflect.deleteProperty(raw, "source");
      return raw;
    })()],
    ["non-string", reference({ source: 42 })],
  ] as const)("keeps valid rates with %s provenance and normalizes source to null", (_case, raw) => {
    expect(validateAndNormalizeRateReference(raw, CURRENT_EGP)).toMatchObject({
      available: true,
      value: { source: null },
    });
  });

  it("returns a detached immutable snapshot and never mutates raw evidence", () => {
    const raw = { ...reference(), valueDecimal: "50", unit: "currency_units_per_usd", orientation: "base_per_quote" };
    const result = validateAndNormalizeRateReference(raw, CURRENT_EGP);
    raw.valueDecimal = "100";
    expect(result).toMatchObject({
      available: true,
      value: { valueDecimal: "50", unit: "currency_units_per_usd", orientation: "base_per_quote", normalizedUsdPerBaseDecimal: "0.02" },
    });
    if (result.available) {
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });
});

export {};
