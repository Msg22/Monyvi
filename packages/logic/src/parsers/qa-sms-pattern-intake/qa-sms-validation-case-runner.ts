import { qaCandidateArtifactSchema } from "./qa-sms-artifact-schema";
import type {
  QaEvaluationResult,
  QaTemplateFamily,
  QaValidationCase,
  QaValidationCaseResult,
} from "./qa-sms-pattern-types";
import { validateQaSmsCandidatePrivacy } from "./qa-sms-privacy-validator";
import { evaluateQaSmsTemplate } from "./testing/qa-sms-template-evaluator";

function invalidResult(code: string): QaEvaluationResult {
  return {
    status: "rejected",
    familyId: null,
    expectedOutcomeKind: null,
    validationCodes: [code],
  };
}

export function runQaSmsValidationCases(
  families: readonly QaTemplateFamily[],
  cases: readonly QaValidationCase[]
): readonly QaValidationCaseResult[] {
  return cases.map((validationCase) => {
    const schema = qaCandidateArtifactSchema.safeParse(
      validationCase.candidate
    );
    const evaluation = !schema.success
      ? invalidResult("candidate_schema_invalid")
      : (() => {
          const privacy = validateQaSmsCandidatePrivacy(schema.data);
          return !privacy.isValid
            ? invalidResult("candidate_privacy_invalid")
            : evaluateQaSmsTemplate(
                families,
                validationCase.targetFamilyId,
                schema.data
              );
        })();
    const hasSetupFailure = evaluation.validationCodes.some((code) =>
      ["candidate_schema_invalid", "candidate_privacy_invalid"].includes(code)
    );
    return {
      caseId: validationCase.caseId,
      kind: validationCase.kind,
      targetFamilyId: validationCase.targetFamilyId,
      expectedStatus: validationCase.expectedStatus,
      actualStatus: evaluation.status,
      expectedOutcomeKind: evaluation.expectedOutcomeKind,
      validationCodes: evaluation.validationCodes,
      didPass:
        !hasSetupFailure && validationCase.expectedStatus === evaluation.status,
    };
  });
}
