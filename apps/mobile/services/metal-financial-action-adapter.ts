import {
  createFinancialActionRegistry,
  type CanonicalJsonValue,
  type FinancialActionEnvelopeV1,
  type FinancialActionRegistry,
  type RegisteredActionPayload,
} from "@monyvi/logic";

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

function asCanonicalJsonValue(value: unknown): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(asCanonicalJsonValue);
  if (typeof value !== "object") throw new Error("invalid_metal_action_payload");
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      asCanonicalJsonValue(child),
    ])
  );
}

function asRegisteredActionPayload(value: unknown): RegisteredActionPayload {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("invalid_metal_action_payload");
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      asCanonicalJsonValue(child),
    ])
  );
}

export const METAL_FINANCIAL_ACTION_REGISTRY: FinancialActionRegistry =
  createFinancialActionRegistry(
    METAL_ACTION_KINDS.map((kind) => ({
      domain: "metals",
      kind,
      payloadVersion: `metals.${kind}/v1`,
      validatePayload: asRegisteredActionPayload,
    }))
  );

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

  return {
    actionId: input.actionId,
    domain: "metals",
    domainReferenceId: input.actionId,
    envelopeVersion: "monyvi.financial-action/v1",
    accountGuards: [],
    kind: input.kind,
    occurredAt: input.occurredAt,
    payload: {
      holdingId: input.holdingId,
      kind: input.kind,
      domainPayload: asCanonicalJsonValue(input.domainPayload),
    },
    payloadVersion: `metals.${input.kind}/v1`,
    userId: input.userId,
  };
}
