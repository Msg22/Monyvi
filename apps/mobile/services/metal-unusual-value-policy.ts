import { parseCanonicalDecimal } from "@monyvi/logic";

export const METALS_UNUSUAL_VALUE_POLICY_VERSION =
  "metals-unusual-value/v1" as const;

const GOLD_WEIGHT_WARNING_GRAMS = "1000";
const SILVER_WEIGHT_WARNING_GRAMS = "10000";
const PURCHASE_AMOUNT_WARNING_EGP = "10000000";

export type MetalUnusualValueReason = "weight" | "purchase_amount";

export interface MetalUnusualValuePolicyInput {
  readonly metal: "GOLD" | "SILVER";
  readonly weightGramsDecimal: string;
  readonly purchasePriceDecimal: string;
  readonly purchaseCurrencyUsdPerUnitDecimal: string | null;
  readonly egpUsdPerUnitDecimal: string | null;
}

export interface MetalUnusualValuePolicyResult {
  readonly policyVersion: typeof METALS_UNUSUAL_VALUE_POLICY_VERSION;
  readonly isUnusual: boolean;
  readonly reasons: readonly MetalUnusualValueReason[];
}

export function evaluateMetalUnusualValuePolicy(
  input: MetalUnusualValuePolicyInput
): MetalUnusualValuePolicyResult {
  const reasons: MetalUnusualValueReason[] = [];
  const weightBoundary =
    input.metal === "GOLD"
      ? GOLD_WEIGHT_WARNING_GRAMS
      : SILVER_WEIGHT_WARNING_GRAMS;

  if (
    parseCanonicalDecimal(input.weightGramsDecimal).greaterThanOrEqualTo(
      weightBoundary
    )
  ) {
    reasons.push("weight");
  }

  const purchaseAmountEgp = convertPurchaseAmountToEgp(input);
  if (
    purchaseAmountEgp?.greaterThanOrEqualTo(PURCHASE_AMOUNT_WARNING_EGP) ===
    true
  ) {
    reasons.push("purchase_amount");
  }

  return Object.freeze({
    policyVersion: METALS_UNUSUAL_VALUE_POLICY_VERSION,
    isUnusual: reasons.length > 0,
    reasons: Object.freeze(reasons),
  });
}

function convertPurchaseAmountToEgp(
  input: MetalUnusualValuePolicyInput
): ReturnType<typeof parseCanonicalDecimal> | null {
  if (
    input.purchaseCurrencyUsdPerUnitDecimal === null ||
    input.egpUsdPerUnitDecimal === null
  ) {
    return null;
  }
  try {
    const currencyRate = parseCanonicalDecimal(
      input.purchaseCurrencyUsdPerUnitDecimal
    );
    const egpRate = parseCanonicalDecimal(input.egpUsdPerUnitDecimal);
    if (!currencyRate.greaterThan("0") || !egpRate.greaterThan("0")) {
      return null;
    }
    return parseCanonicalDecimal(input.purchasePriceDecimal)
      .times(currencyRate)
      .dividedBy(egpRate);
  } catch {
    return null;
  }
}
