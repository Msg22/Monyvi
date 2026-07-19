import { buildQaStructuralSignature } from "../qa-sms-family-builder";
import type {
  QaCandidateArtifact,
  QaEvaluationResult,
  QaTemplateFamily,
} from "../qa-sms-pattern-types";

export function evaluateQaSmsTemplate(
  families: readonly QaTemplateFamily[],
  targetFamilyId: string,
  candidate: QaCandidateArtifact
): QaEvaluationResult {
  const family = families.find(({ familyId }) => familyId === targetFamilyId);
  if (!family) {
    return {
      status: "unsupported",
      familyId: null,
      expectedOutcomeKind: null,
      validationCodes: ["family_not_found"],
    };
  }
  if (
    candidate.currency !== null &&
    !family.supportedCurrencies.includes(candidate.currency)
  ) {
    return {
      status: "rejected",
      familyId: family.familyId,
      expectedOutcomeKind: family.expectedOutcome.kind,
      validationCodes: ["unsupported_currency"],
    };
  }
  const signature = buildQaStructuralSignature(candidate);
  if (signature !== family.structuralSignature) {
    return {
      status: "rejected",
      familyId: family.familyId,
      expectedOutcomeKind: family.expectedOutcome.kind,
      validationCodes: ["structural_mismatch"],
    };
  }
  return {
    status: "matched",
    familyId: family.familyId,
    expectedOutcomeKind: family.expectedOutcome.kind,
    validationCodes: [],
  };
}
