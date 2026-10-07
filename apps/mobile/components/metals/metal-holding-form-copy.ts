import type { MetalHoldingFormCopy } from "./MetalHoldingForm";

/**
 * Built-in Add/Edit form copy used when a caller does not supply a localized
 * `copy` prop. Production routes always pass their own localized copy; this is
 * the presentational default so the form renders standalone and in unit tests.
 *
 * Kept in its own module to keep `MetalHoldingForm.tsx` within the repository
 * file-size limit. `MetalHoldingFormCopy` is imported as a type only, so this
 * file has no runtime dependency on `MetalHoldingForm.tsx` and introduces no
 * runtime import cycle.
 */
export const DEFAULT_COPY: MetalHoldingFormCopy = {
  title: "Add holding",
  back: "Back",
  name: "Holding name",
  namePlaceholder: "e.g. Savings coin",
  metal: "Metal",
  gold: "Gold",
  silver: "Silver",
  weight: "Weight in grams",
  purity: "Purity",
  purchasePrice: "Total purchase price",
  purchasePriceHint:
    "Include workmanship, dealer premium, and other purchase costs.",
  purchaseCurrency: "Purchase currency",
  purchaseDate: "Purchase date",
  physicalForm: "Physical form (optional)",
  coin: "Coin",
  bar: "Bar",
  jewelry: "Jewelry",
  notes: "Notes (optional)",
  notesPlaceholder: "Add a note",
  preview: "Estimated value",
  valuationUnavailable: "Valuation unavailable",
  savedLocally:
    "Saved on this device first. It will sync when a connection is available.",
  submit: "Add holding",
  submitting: "Adding holding",
  unusualValue: "This value is unusually large. Review it before continuing.",
  acknowledge: "I reviewed it",
  staleRateAcknowledgment:
    "This estimate uses an older saved rate. Review it before continuing.",
  submitFailed: "We couldn't add this holding. Try again.",
  rateFresh: "Rates are current",
  rateStale: "Using an older saved rate",
  rateUnknown: "Rate age is unavailable",
  rateUnavailable: "Some rate details are unavailable",
  pure: "pure",
  perPureGram: "per pure gram",
  estimatedGainSincePurchase: "estimated gain since purchase",
  estimatedLossSincePurchase: "estimated loss since purchase",
  ratesUpdated: "Rates updated",
  rateFreshnessUnknown: "Freshness unknown",
  rateAgeUnavailable: "Rate age is unavailable",
  rateObservationUnavailable: "Observation time unavailable",
  rateJustNow: "just now",
  correctionReason: "Correction reason (optional)",
  unchangedResult: "Your result since purchase stays",
};
