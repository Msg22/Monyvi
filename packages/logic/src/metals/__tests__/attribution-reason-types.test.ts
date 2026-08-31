import type { AttributionCalculationOutputReason } from "../rate-reference";
import type { Availability } from "../valuation";

type ContractedReason =
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

type IsExactContract = [AttributionCalculationOutputReason] extends [ContractedReason]
  ? [ContractedReason] extends [AttributionCalculationOutputReason]
    ? true
    : false
  : false;
type IsWidenedToString = string extends AttributionCalculationOutputReason
  ? true
  : false;
type FailureReason = Extract<
  Availability<unknown, AttributionCalculationOutputReason>,
  { available: false }
>["reason"];
type AvailabilityKeepsExactReason = [FailureReason] extends [
  AttributionCalculationOutputReason,
]
  ? [AttributionCalculationOutputReason] extends [FailureReason]
    ? true
    : false
  : false;

describe("attribution unavailable reason types", () => {
  it("exports the closed contracted union without widening Availability to string", () => {
    const isExactContract: IsExactContract = true;
    const isWidenedToString: IsWidenedToString = false;
    const availabilityKeepsExactReason: AvailabilityKeepsExactReason = true;

    expect({ isExactContract, isWidenedToString, availabilityKeepsExactReason }).toEqual({
      isExactContract: true,
      isWidenedToString: false,
      availabilityKeepsExactReason: true,
    });
  });
});
