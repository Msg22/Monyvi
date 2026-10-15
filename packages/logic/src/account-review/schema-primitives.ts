import { z } from "zod";
import Decimal from "decimal.js";
import { parseCanonicalUnsignedIntegerString } from "../financial-actions/action-contracts";
import {
  ACCOUNT_REVIEW_ACCOUNT_TYPES,
  ACCOUNT_REVIEW_CURRENCIES,
  ACCOUNT_REVIEW_TRANSACTION_TYPES,
} from "./generated-vocabulary";

/** Canonical T004 value validators; no provider, writer or DB runtime imports. */
export const canonicalUuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    "Expected canonical lowercase UUID"
  );
export const sourceRef = z
  .string()
  .min(1)
  .refine(
    (value) => value.trim().length > 0,
    "Source reference must not be blank"
  );
export const nonblankText = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0, "Text must not be blank");
export const optionalAccountId = canonicalUuid.nullable();
export const cardSuffix = z
  .string()
  .regex(/^[0-9]{4}$/, "Expected four ASCII digits");
export const hash = z.string().regex(/^[0-9a-f]{64}$/, "Expected SHA-256");
export const recordRevision = z.string().refine((value) => {
  try {
    parseCanonicalUnsignedIntegerString(value);
    return true;
  } catch {
    return false;
  }
}, "Expected canonical unsigned financial/review revision");

export const currencyCode = z.enum(ACCOUNT_REVIEW_CURRENCIES);
export const accountType = z.enum(ACCOUNT_REVIEW_ACCOUNT_TYPES);
export const transactionType = z.enum(ACCOUNT_REVIEW_TRANSACTION_TYPES);
export const reviewSource = z.enum(["VOICE", "SMS"]);

export const strictUtcTimestamp = z.string().refine((value) => {
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(
      value
    )
  )
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}, "Expected real UTC millisecond timestamp");

export const calendarDate = z.string().refine((value) => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}, "Expected real YYYY-MM-DD");

export const sourceDate = z.union([calendarDate, strictUtcTimestamp]);

export const canonicalDecimal = z.string().refine((value) => {
  if (
    !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/.test(value) ||
    value.startsWith("-0")
  ) {
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

export function areDistinct(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}

export function addIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string
): void {
  ctx.addIssue({ code: "custom", path, message });
}

export const uuidArray = z
  .array(canonicalUuid)
  .refine(areDistinct, "Duplicate UUID");
export const refArray = z
  .array(sourceRef)
  .refine(areDistinct, "Duplicate reference");
export const textArray = z
  .array(nonblankText)
  .refine(areDistinct, "Duplicate text value");
export const currencyArray = z
  .array(currencyCode)
  .refine(areDistinct, "Duplicate currency");
export const hashArray = z
  .array(hash)
  .refine(areDistinct, "Duplicate evidence key");
