import { createHash } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  qaCandidateArtifactSchema,
  qaCandidateBundleSchema,
  qaCoverageDeclarationSchema,
} from "./qa-sms-artifact-schema";
import {
  buildQaCoverageDeclarations,
  serializeQaCandidateBundleIntegrityPayload,
} from "./qa-sms-bundle-builder";
import { buildQaTemplateFamilies } from "./qa-sms-family-builder";
import type {
  QaCandidateArtifact,
  QaCandidateBundle,
  QaCoverageDeclaration,
  QaTemplateFamily,
} from "./qa-sms-pattern-types";
import { validateQaSmsCandidatePrivacy } from "./qa-sms-privacy-validator";

interface ImportQaCandidateBundleInput {
  readonly inputPath: string;
  readonly stagingRoot: string;
  readonly bundle: unknown;
  readonly existingCandidates: readonly QaCandidateArtifact[];
  readonly acknowledgeNewEvidenceDomain: boolean;
}

interface QaCandidateImportResult {
  readonly bundle: QaCandidateBundle;
  readonly importedCandidates: readonly QaCandidateArtifact[];
  readonly coverageDeclarations: readonly QaCoverageDeclaration[];
  readonly candidates: readonly QaCandidateArtifact[];
  readonly families: readonly QaTemplateFamily[];
  readonly summary: {
    readonly importedCandidateCount: number;
    readonly skippedDuplicateCandidateCount: number;
    readonly totalCandidateCount: number;
    readonly familyCount: number;
    readonly requiresManualDuplicateReview: boolean;
  };
}

interface QaCoverageManifest {
  readonly schemaVersion: 1;
  readonly providerId: "qnb-egypt";
  readonly declarations: readonly QaCoverageDeclaration[];
}

interface QaCandidateImportError extends Error {
  readonly code: string;
}

function importError(code: string): QaCandidateImportError {
  return Object.assign(new Error(code), { code });
}

export function assertQaSmsStagingPath(
  inputPath: string,
  stagingRoot: string
): void {
  const root = path.resolve(stagingRoot);
  const input = path.resolve(inputPath);
  const relative = path.relative(root, input);
  if (
    relative.length === 0 ||
    relative.startsWith(`..${path.sep}`) ||
    relative === ".." ||
    path.isAbsolute(relative)
  ) {
    throw importError("staging_path_required");
  }
}

function coverageKey(declaration: QaCoverageDeclaration): string {
  return `${declaration.messageFamily}:${declaration.currency ?? "N/A"}`;
}

function buildCandidateInterpretation(candidate: QaCandidateArtifact): object {
  return {
    schemaVersion: candidate.schemaVersion,
    providerId: candidate.providerId,
    verifiedSenderAlias: candidate.verifiedSenderAlias,
    messageFamily: candidate.messageFamily,
    currency: candidate.currency,
    expectedOutcome: candidate.expectedOutcome,
    segments: candidate.segments,
    sanitizedShape: candidate.sanitizedShape,
    sourceType: candidate.sourceType,
    runtimeScope: candidate.runtimeScope,
    autoSelectPolicy: candidate.autoSelectPolicy,
    authorization: {
      version: candidate.authorization.version,
      authorizationClass: candidate.authorization.authorizationClass,
      providerScope: candidate.authorization.providerScope,
    },
  };
}

function remapCoverageCandidateIds(
  declarations: readonly QaCoverageDeclaration[],
  duplicateCandidateIds: ReadonlyMap<string, string>
): readonly QaCoverageDeclaration[] {
  return declarations.map((declaration) => ({
    ...declaration,
    candidateIds: [
      ...new Set(
        declaration.candidateIds.map(
          (candidateId) => duplicateCandidateIds.get(candidateId) ?? candidateId
        )
      ),
    ].sort(),
  }));
}

export function validateQaCoverageManifest(
  manifest: unknown,
  candidates: readonly QaCandidateArtifact[],
  requireComplete: boolean
): QaCoverageManifest {
  if (
    typeof manifest !== "object" ||
    manifest === null ||
    !("schemaVersion" in manifest) ||
    !("providerId" in manifest) ||
    !("declarations" in manifest) ||
    manifest.schemaVersion !== 1 ||
    manifest.providerId !== "qnb-egypt" ||
    !Array.isArray(manifest.declarations)
  ) {
    throw importError("coverage_manifest_invalid");
  }
  const parsed = qaCoverageDeclarationSchema
    .array()
    .safeParse(manifest.declarations);
  if (!parsed.success) throw importError("coverage_manifest_invalid");
  const declarations = parsed.data;
  const keys = declarations.map(coverageKey);
  const requiredKeys = buildQaCoverageDeclarations(
    [],
    "2000-01-01T00:00:00.000Z"
  ).map(coverageKey);
  if (
    new Set(keys).size !== keys.length ||
    keys.length !== requiredKeys.length ||
    requiredKeys.some((key) => !keys.includes(key))
  ) {
    throw importError("coverage_scope_incomplete");
  }
  const candidatesById = new Map(
    candidates.map((candidate) => [candidate.candidateId, candidate])
  );
  if (
    declarations.some((declaration) =>
      declaration.candidateIds.some(
        (candidateId) => !candidatesById.has(candidateId)
      )
    )
  ) {
    throw importError("unknown_coverage_candidate");
  }
  if (
    declarations.some((declaration) =>
      declaration.candidateIds.some((candidateId) => {
        const candidate = candidatesById.get(candidateId);
        return (
          candidate !== undefined &&
          (candidate.messageFamily !== declaration.messageFamily ||
            candidate.currency !== declaration.currency)
        );
      })
    )
  ) {
    throw importError("coverage_candidate_scope_mismatch");
  }
  if (
    requireComplete &&
    declarations.some(({ status }) => status === "pending")
  ) {
    throw importError("coverage_pending");
  }
  if (
    requireComplete &&
    candidates.some((candidate) => {
      const declaration = declarations.find(
        (row) =>
          row.messageFamily === candidate.messageFamily &&
          row.currency === candidate.currency
      );
      return (
        declaration?.status !== "candidate_collected" ||
        !declaration.candidateIds.includes(candidate.candidateId)
      );
    })
  ) {
    throw importError("coverage_candidate_missing");
  }
  return {
    schemaVersion: 1,
    providerId: "qnb-egypt",
    declarations,
  };
}

export function mergeQaCoverageManifest(
  manifest: QaCoverageManifest,
  incoming: readonly QaCoverageDeclaration[],
  candidates: readonly QaCandidateArtifact[]
): QaCoverageManifest {
  const validated = validateQaCoverageManifest(manifest, candidates, false);
  const updates = new Map(incoming.map((row) => [coverageKey(row), row]));
  return {
    ...validated,
    declarations: validated.declarations.map((row) => {
      const update = updates.get(coverageKey(row));
      if (!update) return row;
      if (row.status !== "candidate_collected") return update;
      if (update.status !== "candidate_collected") return row;
      return {
        ...update,
        candidateIds: [
          ...new Set([...row.candidateIds, ...update.candidateIds]),
        ].sort(),
      };
    }),
  };
}

export function importQaCandidateBundle(
  input: ImportQaCandidateBundleInput
): QaCandidateImportResult {
  assertQaSmsStagingPath(input.inputPath, input.stagingRoot);
  const existingCatalog = qaCandidateArtifactSchema
    .array()
    .safeParse(input.existingCandidates);
  if (!existingCatalog.success) {
    throw importError("existing_candidate_catalog_invalid");
  }
  const existingCandidates = existingCatalog.data;
  if (
    existingCandidates.some(
      (candidate) => !validateQaSmsCandidatePrivacy(candidate).isValid
    )
  ) {
    throw importError("existing_candidate_privacy_invalid");
  }
  const existingCandidateIds = existingCandidates.map(
    ({ candidateId }) => candidateId
  );
  const existingEvidenceDigests = existingCandidates.map(
    ({ evidenceDigest }) => evidenceDigest
  );
  if (
    new Set(existingCandidateIds).size !== existingCandidateIds.length ||
    new Set(existingEvidenceDigests).size !== existingEvidenceDigests.length
  ) {
    throw importError("existing_candidate_catalog_invalid");
  }
  const parsed = qaCandidateBundleSchema.safeParse(input.bundle);
  if (!parsed.success) throw importError("bundle_schema_invalid");
  const bundle = parsed.data;
  const contentDigest = createHash("sha256")
    .update(serializeQaCandidateBundleIntegrityPayload(bundle), "utf8")
    .digest("hex");
  if (contentDigest !== bundle.integrity.contentDigest) {
    throw importError("bundle_integrity_digest_mismatch");
  }
  if (bundle.coverageDeclarations.some(({ status }) => status === "pending")) {
    throw importError("coverage_pending");
  }
  const requiresManualDuplicateReview =
    bundle.evidenceDomainStatus === "reset_requires_manual_duplicate_review";
  if (requiresManualDuplicateReview && !input.acknowledgeNewEvidenceDomain) {
    throw importError("new_evidence_domain_acknowledgement_required");
  }
  if (
    bundle.candidates.some(
      (candidate) => !validateQaSmsCandidatePrivacy(candidate).isValid
    )
  ) {
    throw importError("candidate_privacy_invalid");
  }

  const existingById = new Map(
    existingCandidates.map((candidate) => [candidate.candidateId, candidate])
  );
  const existingByEvidence = new Map(
    existingCandidates.map((candidate) => [candidate.evidenceDigest, candidate])
  );
  const duplicateCandidateIds = new Map<string, string>();
  const importedCandidates: QaCandidateArtifact[] = [];
  for (const candidate of bundle.candidates) {
    const idCollision = existingById.get(candidate.candidateId);
    if (
      idCollision !== undefined &&
      idCollision.evidenceDigest !== candidate.evidenceDigest
    ) {
      throw importError("duplicate_candidate_id");
    }
    const existing = existingByEvidence.get(candidate.evidenceDigest);
    if (existing === undefined) {
      importedCandidates.push(candidate);
      continue;
    }
    if (
      !isDeepStrictEqual(
        buildCandidateInterpretation(existing),
        buildCandidateInterpretation(candidate)
      )
    ) {
      throw importError("conflicting_duplicate_evidence");
    }
    duplicateCandidateIds.set(candidate.candidateId, existing.candidateId);
  }
  const coverageDeclarations = remapCoverageCandidateIds(
    bundle.coverageDeclarations,
    duplicateCandidateIds
  );
  const candidates = [...existingCandidates, ...importedCandidates].sort(
    (left, right) => left.candidateId.localeCompare(right.candidateId)
  );
  const families = buildQaTemplateFamilies(candidates);
  return {
    bundle,
    importedCandidates,
    coverageDeclarations,
    candidates,
    families,
    summary: {
      importedCandidateCount: importedCandidates.length,
      skippedDuplicateCandidateCount: duplicateCandidateIds.size,
      totalCandidateCount: candidates.length,
      familyCount: families.length,
      requiresManualDuplicateReview,
    },
  };
}

export type {
  ImportQaCandidateBundleInput,
  QaCandidateImportError,
  QaCandidateImportResult,
  QaCoverageManifest,
};
