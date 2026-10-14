import { z } from "zod";
import Decimal from "decimal.js";
import { parseCanonicalUnsignedIntegerString } from "../financial-actions/action-contracts";

/** Review-local unchanged T004 revision and decimal validators. */
export const recordRevision = z.string().refine((value) => {
  try {
    parseCanonicalUnsignedIntegerString(value);
    return true;
  } catch {
    return false;
  }
}, "Expected canonical unsigned financial/review revision");

export const canonicalDecimal = z.string().refine((value) => {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/.test(value) || value.startsWith("-0")) {
    return false;
  }
  const digits = value.replace(/[-.]/g, "");
  const fractional = value.split(".")[1] ?? "";
  if (digits.length > 50 || fractional.length > 18) return false;
  try {
    const amount = new Decimal(value);
    return amount.isFinite() && amount.toFixed() === value;
  } catch {
    return false;
  }
}, "Expected canonical decimal, max 50 digits / 18 fractional digits");
