# Rate Reference Contract

## Authority And Shape

Freshness uses provider observation time only. Every immutable observed reference
is discriminated by `role` and `kind` and retains raw value/provenance before one
adapter/pure-logic normalization to canonical USD-per-base.

```ts
import type { CurrencyType } from "@monyvi/db";

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

export type AttributionCalculationOutputReason =
  | "purchase_cost_unavailable"
  | "acquisition_metal_rate_unavailable"
  | "acquisition_currency_rate_unavailable"
  | "valuation_metal_rate_unavailable"
  | "valuation_currency_rate_unavailable"
  | "sale_metal_rate_unavailable"
  | "purchase_currency_at_sale_rate_unavailable"
  | "proceeds_currency_at_sale_rate_unavailable"
  | "canonical_currency_display_rate_unavailable"
  | "preferred_currency_display_rate_unavailable";

export type MetalInstrumentCode = `metal:${"GOLD" | "SILVER"}`;
export type CurrencyInstrumentCode = `currency:${MetalsIsoCurrencyCode}`;

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

export type RawObservedRateReference = unknown;
```

`MetalsIsoCurrencyCode` is an approved ISO currency; BTC is excluded from Metals
V1. `instrumentCode` is exact grammar, not display copy.

| Kind and roles | Allowed instrument | Unit and orientation | Normalized canonical value |
| --- | --- | --- | --- |
| `metal`; all metal roles | `metal:GOLD`, `metal:SILVER` | `usd_per_pure_gram`, `quote_per_base` only | USD per pure gram |
| `currency`; all currency roles | `currency:<MetalsIsoCurrencyCode>` | `usd_per_currency_unit`, `quote_per_base` | USD per currency unit |
| `currency`; all currency roles | `currency:<MetalsIsoCurrencyCode>` | `currency_units_per_usd`, `base_per_quote` | reciprocal USD per currency unit |

USD is exact identity `1`. Inverse metal references, any role/kind mismatch, and
any unit/orientation combination outside this table are rejected. Future
`068_metals_domain` SQL CHECK constraints enforce this matrix.

## Expected-Context Validation

Every calculation validates raw input against its expected reference context before
normalization. `RawObservedRateReference` is `unknown`, so the adapter/validator
must narrow every untrusted upstream field, including unparseable timestamps. It
either produces `ExactRateReference` or one of the nine
`RateReferenceUnavailableReason` values. It rejects a missing required role, a
duplicate role, a role from another context, or any reference that fails the matrix
above.

| Context | Required roles |
| --- | --- |
| Acquisition | `acquisition_metal`, `acquisition_purchase_currency` |
| Current valuation | `current_metal`, `current_purchase_currency` |
| Terminal sale | `terminal_metal`, `terminal_purchase_currency`, `terminal_proceeds_currency` |
| Display conversion, different canonical/preferred currencies | `display_purchase_currency`, `display_preferred_currency` |
| Display conversion, same canonical/preferred currency | No arithmetic references required; factor is exact `1` |


When canonical and preferred currency are same, display conversion is an exact
identity and no missing, invalid, stale, or unknown redundant display snapshot may
make arithmetic unavailable or change the factor. Such snapshots may be retained as
immutable audit provenance only. Cross-currency conversion still requires both
validated display references.

`RateReferenceUnavailableReason` describes raw-reference/context validation only.
Position-specific unavailable results belong to
`AttributionCalculationOutputReason`; its `purchase_cost_unavailable` member
describes missing purchase-cost evidence, not a rate-reference failure and not a
stored rate reason.

## Trust And Availability

Value, unit/orientation, and quality must be valid. Thresholds use one policy and
an injected clock. `capturedAt` is required structural evidence: missing,
unparseable, non-finite, or otherwise invalid capture time returns
`invalid_capture_time`; it cannot be normalized or snapshotted. A validated
`ExactRateReference` therefore exposes `capturedAt` as a valid number.

`providerObservedAt` has different meaning. A null, unknown, unparseable,
non-finite, or future provider observation time leaves an otherwise valid reference
eligible for calculation but makes freshness Unknown, regardless of fetch/storage
time. After validation, `ExactRateReference.providerObservedAt` is either a valid
number or `null`; unknown/unparseable provider time maps to `null`, not to
`invalid_capture_time` or any other unavailable reason by itself. Capture time never
alters freshness.

Historical evidence never depends on mutable latest rate. Zero/current-rate
backfill and network freshness gates are forbidden. Every acquisition, correction,
sale, or attribution command snapshots every consumed Metal/FX reference.

`RateReferenceUnavailableReason` contains the approved nine stable,
language-neutral validation codes. Neither it nor
`AttributionCalculationOutputReason` is a persisted `metal_rate_references` column.
