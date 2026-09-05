import {
  type FinancialActionEnvelopeV1,
  type FinancialActionRegistry,
} from "@monyvi/logic";

import { APPROVED_FINANCIAL_ACTION_REGISTRY } from "./financial-action-approved-registry";

export const METAL_ACTION_KINDS = [
  "add",
  "correct",
  "sell",
  "dispose",
  "delete",
  "undo",
] as const;

export type MetalActionKind = (typeof METAL_ACTION_KINDS)[number];

export interface CreateMetalFinancialActionEnvelopeInput {
  readonly actionId: string;
  readonly userId: string;
  readonly holdingId: string;
  readonly kind: MetalActionKind;
  readonly expectedHoldingRevision: string | null;
  readonly occurredAt: string;
  readonly domainPayload: Readonly<Record<string, unknown>>;
}

const MAX_REVISION = "9223372036854775807";
const CANONICAL_REVISION_PATTERN = /^(0|[1-9][0-9]*)$/;

export function assertCanonicalMetalRevision(value: string): string {
  if (
    !CANONICAL_REVISION_PATTERN.test(value) ||
    value.length > MAX_REVISION.length ||
    (value.length === MAX_REVISION.length && value > MAX_REVISION)
  ) {
    throw new Error("invalid_metal_revision");
  }
  return value;
}

export function incrementCanonicalMetalRevision(value: string): string {
  const canonical = assertCanonicalMetalRevision(value);
  if (canonical === MAX_REVISION) throw new Error("metal_revision_overflow");
  return (BigInt(canonical) + 1n).toString();
}

export const METAL_FINANCIAL_ACTION_REGISTRY: FinancialActionRegistry =
  APPROVED_FINANCIAL_ACTION_REGISTRY;

export function createMetalFinancialActionEnvelope(
  input: CreateMetalFinancialActionEnvelopeInput
): FinancialActionEnvelopeV1 {
  if (input.kind === "add") {
    if (input.expectedHoldingRevision !== null) {
      throw new Error("invalid_metal_expected_revision");
    }
  } else if (input.expectedHoldingRevision === null) {
    throw new Error("invalid_metal_expected_revision");
  } else {
    assertCanonicalMetalRevision(input.expectedHoldingRevision);
  }
  throw new Error("metal_action_schema_not_approved");
}
