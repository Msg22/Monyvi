# Metals Pure Logic API

Date: 2026-08-30
Scope: Slice 2 local public surface only
Package boundary: `packages/logic/src/metals/index.ts`

The root `packages/logic/src/index.ts` barrel is intentionally unchanged. This
surface is available only through the owned Metals barrel until a later consumer
slice explicitly owns root-package integration.

## Decimal

From `decimal.ts`:

- `EXACT_DECIMAL_CONFIG`: frozen read-only metadata recording precision 50 and
  `ROUND_HALF_EVEN`; the configured Decimal.js clone itself is private so a
  consumer cannot call mutable constructor configuration APIs.
- `ExactDecimalValue`: opaque immutable exact value returned by the parsers.
  `ExactDecimalInput` permits only a canonical string or one of these branded
  exact values. Public financial helpers do not accept JavaScript numbers,
  arbitrary Decimal.js instances, or exponent strings.
- `parseCanonicalDecimal(value)`: accepts plain base-10 decimal strings and
  rejects exponent/non-canonical syntax and non-string values.
- `parseLocalizedDecimal(value)`: normalizes Arabic-Indic digits, Arabic decimal
  and grouping separators, and decimal comma into the canonical parser.
- `serializeDecimal(value)`: emits a plain non-exponent canonical string.
- `compareDecimal(left, right)`: exact three-way comparison.
- `roundDecimal(value, decimalPlaces)`: final-boundary half-even fixed-scale
  rounding.
- `toMinorUnits(value, decimalPlaces)` and
  `fromMinorUnits(value, decimalPlaces)`: exact integer-minor-unit boundaries.

## Purity and valuation

From `purity-catalog.ts`:

- `PURITY_CATALOG_VERSION`, `SupportedMetal`, `PurityCatalogEntry`,
  `PuritySnapshot`, and `PurityResolution`.
- `getPurityCatalog()`, `getPurityEntry()`, `createPuritySnapshot()`, and
  `resolvePuritySelection()`.
- Catalog v1 contains only approved Gold and Silver choices. Stable codes use
  `<metal>-<fineness>` lowercase literals, including `gold-999` for
  `24K · 999`. Code spelling is an implementation contract, not user copy.

From `valuation.ts`:

- `Availability<T>`, `ExactValueAvailability`, `ExactRateReference`,
  `PureGramInput`, and `MetalReferenceValueInput`.
- `calculatePureGrams()`: exact `weight × purity`.
- `calculateMetalReferenceValue()`: exact `q × metal USD/pure gram ÷ currency
  USD/unit` with unavailable results for invalid inputs.
- `normalizeUsdPerUnitRate()`: preserves direct USD-per-unit orientation and
  exactly reciprocates inverse orientation.
- Weight accepts at most three decimal places and normalized purity at most six;
  excess precision returns the existing invalid-input availability result.

## Attribution

From `attribution.ts`:

- `UnrealizedAttributionInput`, `RealizedAttributionInput`,
  `UnrealizedAttribution`, `RealizedAttribution`, `DisplayAttributionSource`,
  `DisplayAttributionInput`, and `RoundedAttribution`.
- `calculateUnrealizedAttribution()`: FR-050 canonical purchase-currency
  combined P/L plus a separately available detailed breakdown. Missing
  historical acquisition references preserve trustworthy `V - K` and expose
  explicit breakdown-unavailable reasons.
- `calculateRealizedAttribution()`: FR-050 sale-time proceeds conversion,
  canonical gross/fees, original-currency net proceeds, and exact combined
  realized P/L, with separately available sale-difference/fee attribution.
  Positive gross, fee range `0..gross`, and purchase/proceeds currency scales
  are validated before authoritative output; fee equal to gross is valid and
  produces zero net proceeds.
- `roundAttributionForDisplay()`: one half-even display boundary, displayed
  component sum, absolute minor-unit difference, and explanation flag. It adds
  no balancing component.
- `convertAttributionForDisplay()`: preserves unavailable canonical attribution;
  otherwise converts combined P/L and every component with the single exact
  FR-051 factor `x_P,d ÷ x_D,d`, then invokes the final display-rounding boundary.

Unavailable reason strings are stable language-neutral codes named for the
missing/invalid input, including `purchase_cost_unavailable`,
`acquisition_metal_rate_unavailable`,
`acquisition_currency_rate_unavailable`, `valuation_metal_rate_unavailable`,
`valuation_currency_rate_unavailable`, `sale_metal_rate_unavailable`,
`purchase_currency_at_sale_rate_unavailable`, and
`proceeds_currency_at_sale_rate_unavailable`. Display conversion adds
`canonical_currency_display_rate_unavailable` and
`preferred_currency_display_rate_unavailable`.

## Lifecycle and rate trust

From `lifecycle-reducer.ts`:

- `LifecycleKind`, `LifecycleEvent`, and `LifecycleProjection`.
- `orderLifecycleEventsNewestFirst()` and `reduceMetalLifecycle()`.
- Full event time sorts newest first. Within each equal-time group, a stable
  topological order places every successor before its predecessor, including
  transitive causal chains. When multiple unrelated events are eligible, event
  IDs sort ascending by direct lexical comparison. Ascending direction is a
  deterministic technical implementation detail, not approved product policy.

From `rate-trust.ts`:

- `RateTrustInput`, `RateTrustResult`, and `classifyRateTrust()`.
- A valid positive exact value is Fresh through exactly 24 hours and Stale only
  when older. Missing, null, unparseable, non-finite, or future provider
  observation time is Unknown. Capture time never changes freshness.
  Missing/invalid value or quality is Missing.

## Review-blocked contracts

- Rate-role validation remains blocked: approved sources do not enumerate role
  literals, instrument-code grammar, unit literals, or legal
  unit/orientation/role combinations.
- Invalid lifecycle-event diagnostics remain blocked: sources define legal
  transitions and persisted effectiveness fields, but not the pure reducer's
  invalid-event outcome shape or duplicate/cycle diagnostic semantics.

### Resolution note — 2026-08-31

The approved rate-reference role/kind/matrix/context contract and lifecycle
reduction result/reason contract remove the documented requirement blockers above.
This is an authority resolution only, not implementation evidence: T013, T015,
and T017 remain implementation-pending and this historical API record is otherwise
unchanged.

### Implemented contract surface — 2026-08-31

From `rate-reference.ts`:

- `MetalRateRole`, `CurrencyRateRole`, `MetalsIsoCurrencyCode`, typed Metal and
  Currency instrument codes, `RateReferenceUnavailableReason`,
  `ExactRateReference`, `RawObservedRateReference`, `NormalizedRateReference`,
  `RateReferenceExpectation`, and `RateReferenceValidationResult`.
- `validateAndNormalizeRateReference()` validates the approved expected role and
  instrument context, legal role/kind and unit/orientation matrix, Gold/Silver or
  supported ISO currency instrument, exact positive Decimal value and USD identity,
  valid quality, and structural capture time. It returns one of the approved nine
  stable reasons or one frozen normalized USD-per-base snapshot.
- Unknown, malformed, non-finite, or future provider observation time normalizes to
  `null` and captured freshness `unknown` without making an otherwise valid value
  unavailable. `capturedAt` never substitutes for provider time.

`ExactRateReference` is re-exported from `valuation.ts` for existing Metals-local
consumers. `normalizeUsdPerUnitRate()` now delegates to the same contract validator.
Attribution consumes exact role-specific references; current and terminal Metal and
purchase-currency references must also agree on instrument context. Snapshot
deduplication includes role and kind so two independently consumed evidence roles
are never silently collapsed merely because their observed values match.

From `lifecycle-reducer.ts`:

- `LifecycleEvidenceState`, `CanonicalCasStatus`, `LifecycleRejectionReason`,
  `LifecycleRejectedEvent`, and `LifecycleReductionResult` join the existing event,
  projection, and deterministic display-order types.
- `reduceMetalLifecycle()` returns `{ projection, acceptedEvents, rejectedEvents }`.
  `projection` is null without one safe root; accepted evidence is causal-order and
  rejected evidence retains the immutable event/fingerprint, stable reason, and
  related event ID. Canonical CAS evidence, never event time or ID, selects a winner
  between competing valid successors.
- `orderLifecycleEventsNewestFirst()` remains a separate deterministic
  display/diagnostic helper and never selects ownership or a CAS winner.

## Immutability and arithmetic boundary

Catalog entries, purity snapshots, captured rate-reference arrays/objects, and
opaque exact-decimal values are detached immutable values. Financial formulas
use the private precision-50 Decimal.js clone from canonical string input
through exact serialization. JavaScript numbers are used only for timestamps,
decimal-place configuration, and ordering—not financial inputs or arithmetic.

### TypeScript-review boundary refinement — 2026-08-31

`ExactRateReference` is a discriminated union of exact Metal, direct Currency,
and inverse Currency references; illegal role/kind/instrument/unit/orientation
combinations do not type-check. `validateAndNormalizeRateReference()` accepts
`unknown` raw evidence and returns the existing stable availability contract.

Attribution inputs require independent `metalInstrumentCode`,
`purchaseCurrencyInstrumentCode`, and, for realized results,
`proceedsCurrencyInstrumentCode`. Display conversion independently requires
`canonicalCurrencyInstrumentCode` and `preferredCurrencyInstrumentCode`. Missing
historical acquisition evidence therefore cannot cause a mismatched supplied
current or terminal reference to define its own expected context.

### Financial-logic re-review refinement — 2026-08-31

`UnrealizedAttribution` and `RealizedAttribution` expose frozen
`consumedRateReferences` independently of detailed-breakdown availability. Each
snapshot retains raw financial/provenance fields but uses validator-derived provider
observation and captured freshness, so caller-supplied inconsistent freshness is not
authoritative.

Lifecycle reduction maps missing or invalid runtime evidence state to retained
`incomplete_evidence`, treats canonical-CAS `rejected` as ineffective before root
selection, and classifies duplicate replay only when every canonical immutable event
field matches. Equal ID/fingerprint with any unequal event field is a conflict.

### Style/architecture boundary refinement — 2026-08-31

`reduceMetalLifecycle()` accepts raw `unknown` observations and performs full
structural validation before duplicate, root, cycle, or transition logic. Its public
accepted/rejected evidence remains normalized immutable `LifecycleEvent` values;
malformed fields force `incomplete_evidence` and never become ownership evidence.

`isSupportedMetalsIsoCurrencyCode()` is the runtime narrowing boundary for Metals
currency instruments. Its set derives from `SUPPORTED_CURRENCIES` and explicitly
excludes BTC, removing the independent Metals currency allowlist.
