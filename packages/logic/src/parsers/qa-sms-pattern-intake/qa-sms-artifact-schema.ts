import { z } from "zod";
import {
  QA_SMS_AUTO_SELECT_POLICY,
  QA_SMS_CANDIDATE_REVIEW_REASONS,
  QA_SMS_MESSAGE_FAMILIES,
  QA_SMS_NO_CURRENCY_FAMILIES,
  QA_SMS_PLACEHOLDER_TOKENS,
  QA_SMS_PROVIDER_ID,
  QA_SMS_RUNTIME_SCOPE,
  QA_SMS_SCHEMA_VERSION,
  QA_SMS_SEMANTIC_ROLES,
  buildQaSanitizedShape,
  getQaSmsCoverageCurrencies,
  getQaSmsTransactionDirection,
  isQaSmsSemanticRoleAllowed,
} from "./qa-sms-pattern-types";

const nonEmptyString = z.string().trim().min(1);
const UUID_SCHEMA = z.string().uuid();
const CANDIDATE_ID_PREFIX = "qa-candidate-";
const qaCandidateId = z
  .string()
  .refine(
    (value) =>
      value.startsWith(CANDIDATE_ID_PREFIX) &&
      UUID_SCHEMA.safeParse(value.slice(CANDIDATE_ID_PREFIX.length)).success,
    { message: "candidate_id_invalid" }
  );
const qaExportId = z.string().uuid();
const evidenceDigest = z.string().regex(/^[a-f0-9]{64}$/);
const nonEmptyPreservedString = z.string().min(1);
const isoTimestamp = z.string().datetime({ offset: true });
const qaMessageFamilySchema = z.enum(QA_SMS_MESSAGE_FAMILIES);
const qaCurrencySchema = z.enum(["EGP", "USD"]).nullable();
const qaSemanticRoleSchema = z.enum(QA_SMS_SEMANTIC_ROLES);
const NO_CURRENCY_FAMILIES = new Set<string>(QA_SMS_NO_CURRENCY_FAMILIES);

function coverageKey(messageFamily: string, currency: string | null): string {
  return `${messageFamily}:${currency ?? "N/A"}`;
}

const REQUIRED_COVERAGE_KEYS = QA_SMS_MESSAGE_FAMILIES.flatMap(
  (messageFamily) =>
    getQaSmsCoverageCurrencies(messageFamily).map((currency) =>
      coverageKey(messageFamily, currency)
    )
);

const qaFixedSegmentSchema = z
  .object({ kind: z.literal("fixed"), text: nonEmptyPreservedString })
  .strict();

const qaPlaceholderSegmentSchema = z
  .object({
    kind: z.literal("placeholder"),
    token: z.enum(QA_SMS_PLACEHOLDER_TOKENS),
    semanticRole: qaSemanticRoleSchema,
    wasOperatorCorrected: z.boolean(),
  })
  .strict()
  .superRefine((segment, context) => {
    if (!isQaSmsSemanticRoleAllowed(segment.token, segment.semanticRole)) {
      context.addIssue({
        code: "custom",
        path: ["semanticRole"],
        message: "placeholder_semantic_role_mismatch",
      });
    }
  });

export const qaSanitizedSegmentSchema = z.discriminatedUnion("kind", [
  qaFixedSegmentSchema,
  qaPlaceholderSegmentSchema,
]);

const qaTransactionOutcomeSchema = z
  .object({
    kind: z.literal("transaction"),
    direction: z.enum(["expense", "income"]),
    requiredPlaceholderRoles: z.array(qaSemanticRoleSchema).min(1),
    confidenceCeiling: z.number().finite().min(0).max(1),
    reviewStatus: z.literal("needs_review"),
    reviewReasons: z.array(z.enum(QA_SMS_CANDIDATE_REVIEW_REASONS)).min(1),
  })
  .strict();

const qaRejectionOutcomeSchema = z
  .object({
    kind: z.literal("rejection"),
    reason: z.enum([
      "failed_transaction",
      "otp",
      "informational",
      "promotional",
    ]),
  })
  .strict();

const qaTransferOutcomeSchema = z
  .object({
    kind: z.literal("transfer"),
    direction: z.literal("bank_to_wallet"),
    requiredPlaceholderRoles: z.array(qaSemanticRoleSchema).min(1),
    confidenceCeiling: z.number().finite().min(0).max(1),
    reviewStatus: z.literal("needs_review"),
    reviewReasons: z.array(z.enum(QA_SMS_CANDIDATE_REVIEW_REASONS)).min(1),
  })
  .strict();

export const qaExpectedOutcomeSchema = z.discriminatedUnion("kind", [
  qaTransactionOutcomeSchema,
  qaTransferOutcomeSchema,
  qaRejectionOutcomeSchema,
]);

const qaAuthorizationSchema = z
  .object({
    version: z.literal(QA_SMS_SCHEMA_VERSION),
    authorizationClass: z.literal("qa_operator_explicit"),
    authorizedAt: isoTimestamp,
    providerScope: z.literal(QA_SMS_PROVIDER_ID),
  })
  .strict();

function isOutcomeCompatibleWithFamily(
  family: (typeof QA_SMS_MESSAGE_FAMILIES)[number],
  outcome: z.infer<typeof qaExpectedOutcomeSchema>
): boolean {
  const rejectionFamilies = new Set([
    "failed_transaction",
    "otp",
    "informational",
    "promotional",
  ]);
  if (rejectionFamilies.has(family)) {
    return outcome.kind === "rejection" && outcome.reason === family;
  }
  if (family === "bank_to_wallet_transfer") {
    return (
      outcome.kind === "transfer" && outcome.direction === "bank_to_wallet"
    );
  }
  const direction = getQaSmsTransactionDirection(family);
  return (
    outcome.kind === "transaction" &&
    direction !== null &&
    outcome.direction === direction
  );
}

export const qaCandidateArtifactSchema = z
  .object({
    schemaVersion: z.literal(QA_SMS_SCHEMA_VERSION),
    candidateId: qaCandidateId,
    evidenceDigest,
    providerId: z.literal(QA_SMS_PROVIDER_ID),
    verifiedSenderAlias: nonEmptyString,
    messageFamily: qaMessageFamilySchema,
    currency: qaCurrencySchema,
    expectedOutcome: qaExpectedOutcomeSchema,
    segments: z.array(qaSanitizedSegmentSchema).min(1),
    sanitizedShape: nonEmptyString,
    sourceType: z.literal("qa-real-sms"),
    runtimeScope: z.literal(QA_SMS_RUNTIME_SCOPE),
    autoSelectPolicy: z.literal(QA_SMS_AUTO_SELECT_POLICY),
    authorization: qaAuthorizationSchema,
    createdAt: isoTimestamp,
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.sanitizedShape !== buildQaSanitizedShape(candidate.segments)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sanitizedShape"],
        message: "sanitized_shape_mismatch",
      });
    }
    if (
      !isOutcomeCompatibleWithFamily(
        candidate.messageFamily,
        candidate.expectedOutcome
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedOutcome"],
        message: "family_outcome_mismatch",
      });
    }
    const isNoCurrencyFamily = NO_CURRENCY_FAMILIES.has(
      candidate.messageFamily
    );
    if (
      (isNoCurrencyFamily && candidate.currency !== null) ||
      (!isNoCurrencyFamily && candidate.currency === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "family_currency_mismatch",
      });
    }
    if (
      !getQaSmsCoverageCurrencies(candidate.messageFamily).some(
        (currency) => currency === candidate.currency
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "family_currency_not_supported",
      });
    }
    if (
      candidate.expectedOutcome.kind === "transaction" ||
      candidate.expectedOutcome.kind === "transfer"
    ) {
      const requiredRoles = candidate.expectedOutcome.requiredPlaceholderRoles;
      if (
        requiredRoles.length !== 1 ||
        requiredRoles[0] !== "transaction_amount"
      ) {
        context.addIssue({
          code: "custom",
          path: ["expectedOutcome", "requiredPlaceholderRoles"],
          message: "required_placeholder_roles_invalid",
        });
      }
      const roles = new Set(
        candidate.segments.flatMap((segment) =>
          segment.kind === "placeholder" ? [segment.semanticRole] : []
        )
      );
      if (
        candidate.expectedOutcome.requiredPlaceholderRoles.some(
          (role) => !roles.has(role)
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["expectedOutcome", "requiredPlaceholderRoles"],
          message: "required_placeholder_missing",
        });
      }
    }
  });

export const qaCoverageDeclarationSchema = z
  .object({
    providerId: z.literal(QA_SMS_PROVIDER_ID),
    messageFamily: qaMessageFamilySchema,
    currency: qaCurrencySchema,
    status: z.enum([
      "candidate_collected",
      "unavailable_in_qa_dataset",
      "pending",
    ]),
    candidateIds: z.array(qaCandidateId),
    recordedAt: isoTimestamp,
  })
  .strict()
  .superRefine((declaration, context) => {
    const hasCandidateReferences = declaration.candidateIds.length > 0;
    if (
      (declaration.status === "candidate_collected" &&
        !hasCandidateReferences) ||
      (declaration.status === "unavailable_in_qa_dataset" &&
        hasCandidateReferences)
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidateIds"],
        message: "coverage_candidate_reference_mismatch",
      });
    }
    if (declaration.status === "pending" && hasCandidateReferences) {
      context.addIssue({
        code: "custom",
        path: ["candidateIds"],
        message: "coverage_candidate_reference_mismatch",
      });
    }
    if (
      !getQaSmsCoverageCurrencies(declaration.messageFamily).some(
        (currency) => currency === declaration.currency
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "coverage_currency_not_supported",
      });
    }
    if (
      new Set(declaration.candidateIds).size !== declaration.candidateIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["candidateIds"],
        message: "duplicate_coverage_candidate_id",
      });
    }
  });

export const qaCandidateBundleSchema = z
  .object({
    schemaVersion: z.literal(QA_SMS_SCHEMA_VERSION),
    exportId: qaExportId,
    exportedAt: isoTimestamp,
    evidenceDomainStatus: z.enum([
      "stable",
      "reset_requires_manual_duplicate_review",
    ]),
    candidates: z.array(qaCandidateArtifactSchema).min(1),
    coverageDeclarations: z.array(qaCoverageDeclarationSchema),
    integrity: z
      .object({
        candidateCount: z.number().int().nonnegative(),
        candidateIds: z.array(qaCandidateId),
        contentDigest: evidenceDigest,
      })
      .strict(),
  })
  .strict()
  .superRefine((bundle, context) => {
    const candidateIds = bundle.candidates.map(
      ({ candidateId }) => candidateId
    );
    const evidenceDigests = bundle.candidates.map(
      ({ evidenceDigest }) => evidenceDigest
    );
    const hasDuplicates = (values: readonly string[]): boolean =>
      new Set(values).size !== values.length;

    if (hasDuplicates(candidateIds)) {
      context.addIssue({ code: "custom", message: "duplicate_candidate_id" });
    }
    if (hasDuplicates(evidenceDigests)) {
      context.addIssue({
        code: "custom",
        message: "duplicate_evidence_digest",
      });
    }
    if (
      bundle.integrity.candidateCount !== candidateIds.length ||
      JSON.stringify(bundle.integrity.candidateIds) !==
        JSON.stringify(candidateIds)
    ) {
      context.addIssue({
        code: "custom",
        path: ["integrity"],
        message: "bundle_integrity_mismatch",
      });
    }
    const candidatesById = new Map(
      bundle.candidates.map((candidate) => [candidate.candidateId, candidate])
    );
    const declarationKeys = bundle.coverageDeclarations.map((declaration) =>
      coverageKey(declaration.messageFamily, declaration.currency)
    );
    if (
      hasDuplicates(declarationKeys) ||
      declarationKeys.length !== REQUIRED_COVERAGE_KEYS.length ||
      REQUIRED_COVERAGE_KEYS.some((key) => !declarationKeys.includes(key))
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverageDeclarations"],
        message: "coverage_scope_incomplete",
      });
    }
    for (const [index, declaration] of bundle.coverageDeclarations.entries()) {
      if (declaration.candidateIds.some((id) => !candidatesById.has(id))) {
        context.addIssue({
          code: "custom",
          path: ["coverageDeclarations", index, "candidateIds"],
          message: "unknown_coverage_candidate",
        });
      }
      if (
        declaration.candidateIds.some((id) => {
          const candidate = candidatesById.get(id);
          return (
            candidate !== undefined &&
            (candidate.messageFamily !== declaration.messageFamily ||
              candidate.currency !== declaration.currency)
          );
        })
      ) {
        context.addIssue({
          code: "custom",
          path: ["coverageDeclarations", index, "candidateIds"],
          message: "coverage_candidate_scope_mismatch",
        });
      }
    }
    const declarationsByKey = new Map(
      bundle.coverageDeclarations.map((declaration) => [
        coverageKey(declaration.messageFamily, declaration.currency),
        declaration,
      ])
    );
    bundle.candidates.forEach((candidate, index) => {
      const declaration = declarationsByKey.get(
        coverageKey(candidate.messageFamily, candidate.currency)
      );
      if (
        declaration?.status !== "candidate_collected" ||
        !declaration.candidateIds.includes(candidate.candidateId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["candidates", index, "candidateId"],
          message: "candidate_coverage_reference_missing",
        });
      }
    });
  });
