/**
 * #395 T014-P present-invalid review version vs truly untagged legacy fixtures.
 * Keep mapped finance, original source identity, and captured owner context.
 * No copied provider DTO, schema relaxation, or test-only normalizer.
 */
import { z } from "zod";
import {
  accountReviewSmsFinancialRowSchema,
  accountReviewVoiceFinancialRowSchema,
} from "../parser-schemas";
import type {
  SmsReviewNormalizationInput,
  VoiceReviewNormalizationInput,
} from "../normalization-types";
import { makeSmsInput, makeVoiceInput } from "./normalization-fixtures";

export interface InvalidVersionCase {
  readonly name: string;
  readonly version: unknown;
}

export const INVALID_VERSION_CASES: readonly InvalidVersionCase[] = [
  { name: "unsupported v3 string", version: "account-review/v3" },
  { name: "present null", version: null },
  { name: "present undefined", version: undefined },
  { name: "present empty string", version: "" },
  { name: "present number", version: 3 },
];

export function makeTaggedInvalidVoice(
  version: unknown
): VoiceReviewNormalizationInput {
  const original = makeVoiceInput();
  return {
    ...original,
    providerResponse: {
      ...original.providerResponse,
      reviewContractVersion: version,
    },
  };
}

export function makeTaggedInvalidSms(
  version: unknown
): SmsReviewNormalizationInput {
  const original = makeSmsInput();
  return {
    ...original,
    providerResponse: {
      ...original.providerResponse,
      reviewContractVersion: version,
    },
  };
}

/** Mimics legacy financial-only response with no discriminator of any kind. */
export function makeUntaggedVoice(): VoiceReviewNormalizationInput {
  const original = makeVoiceInput();
  const { reviewContractVersion, suggestedAccounts, ...legacy } =
    original.providerResponse;
  if (
    reviewContractVersion !== "account-review/v2" ||
    suggestedAccounts.length === 0
  )
    throw new Error("Invalid Voice control");
  return {
    ...original,
    providerResponse: {
      ...legacy,
      transactions: original.financialRows.map((row) =>
        z.object(accountReviewVoiceFinancialRowSchema.shape).parse(row)
      ),
    },
  };
}

/** Keep original financial and SMS completion metadata, never inferred proof. */
export function makeUntaggedSms(): SmsReviewNormalizationInput {
  const original = makeSmsInput();
  const { reviewContractVersion, suggestedAccounts, ...legacy } =
    original.providerResponse;
  if (
    reviewContractVersion !== "account-review/v2" ||
    suggestedAccounts.length === 0
  )
    throw new Error("Invalid SMS control");
  return {
    ...original,
    providerResponse: {
      ...legacy,
      transactions: original.financialRows.map((row) =>
        z.object(accountReviewSmsFinancialRowSchema.shape).parse(row)
      ),
    },
  };
}
