import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  canonicalizeFinancialActionEnvelope,
  type FinancialActionEnvelopeV1,
  type FinancialActionRegistry,
  type FinancialActionValidationInput,
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
  readonly validationInput?: FinancialActionValidationInput;
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
  DEFAULT_FINANCIAL_ACTION_REGISTRY;

const METAL_ACTION_PAYLOAD_VERSIONS: Readonly<Record<MetalActionKind, string>> =
  Object.freeze({
    add: "metals.add/v1",
    correct: "metals.correct/v1",
    sell: "metals.sell/v2",
    dispose: "metals.dispose/v1",
    delete: "metals.delete/v1",
    undo: "metals.undo/v1",
  });

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

  const envelope = canonicalizeFinancialActionEnvelope(
    {
      accountGuards: [],
      actionId: input.actionId,
      domain: "metals",
      domainReferenceId: input.holdingId,
      envelopeVersion: "monyvi.financial-action/v1",
      kind: input.kind,
      occurredAt: input.occurredAt,
      payload: input.domainPayload,
      payloadVersion: METAL_ACTION_PAYLOAD_VERSIONS[input.kind],
      userId: input.userId,
    },
    METAL_FINANCIAL_ACTION_REGISTRY,
    input.validationInput
  );
  if (
    envelope.payload.holdingId !== input.holdingId ||
    envelope.payload.expectedHoldingRevision !== input.expectedHoldingRevision
  ) {
    throw new Error("invalid_metal_action_binding");
  }
  return envelope;
}
