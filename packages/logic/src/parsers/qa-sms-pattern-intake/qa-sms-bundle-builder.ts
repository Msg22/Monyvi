import { qaCandidateBundleSchema } from "./qa-sms-artifact-schema";
import {
  QA_SMS_MESSAGE_FAMILIES,
  getQaSmsCoverageCurrencies,
  type QaCandidateArtifact,
  type QaCandidateBundle,
  type QaCoverageDeclaration,
  type QaCoverageStatus,
  type QaSmsCurrency,
  type QaSmsMessageFamily,
} from "./qa-sms-pattern-types";

interface QaCoverageKey {
  readonly messageFamily: QaSmsMessageFamily;
  readonly currency: QaSmsCurrency;
}

interface QaBundleMetadata {
  readonly exportId: string;
  readonly exportedAt: string;
  readonly evidenceDomainStatus:
    | "stable"
    | "reset_requires_manual_duplicate_review";
}

type QaCandidateBundleContent = Omit<QaCandidateBundle, "integrity">;
type QaContentDigest = (value: string) => Promise<string>;

function matchesCoverage(
  candidate: QaCandidateArtifact,
  key: QaCoverageKey
): boolean {
  return (
    candidate.messageFamily === key.messageFamily &&
    candidate.currency === key.currency
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)])
  );
}

function normalizeBundleContent(
  input: QaCandidateBundle | QaCandidateBundleContent
): QaCandidateBundleContent {
  const { integrity: _integrity, ...content } = input as QaCandidateBundle;
  return {
    ...content,
    candidates: [...content.candidates].sort((left, right) =>
      left.candidateId.localeCompare(right.candidateId)
    ),
    coverageDeclarations: [...content.coverageDeclarations]
      .map((declaration) => ({
        ...declaration,
        candidateIds: [...declaration.candidateIds].sort(),
      }))
      .sort((left, right) => {
        const leftKey = `${left.messageFamily}:${left.currency ?? "N/A"}`;
        const rightKey = `${right.messageFamily}:${right.currency ?? "N/A"}`;
        return leftKey.localeCompare(rightKey);
      }),
  };
}

export function serializeQaCandidateBundleIntegrityPayload(
  input: QaCandidateBundle | QaCandidateBundleContent
): string {
  return JSON.stringify(canonicalize(normalizeBundleContent(input)));
}

export function buildQaCoverageDeclarations(
  candidates: readonly QaCandidateArtifact[],
  recordedAt: string
): readonly QaCoverageDeclaration[] {
  return QA_SMS_MESSAGE_FAMILIES.flatMap((messageFamily) =>
    getQaSmsCoverageCurrencies(messageFamily).map((currency) => {
      const candidateIds = candidates
        .filter((candidate) =>
          matchesCoverage(candidate, { messageFamily, currency })
        )
        .map(({ candidateId }) => candidateId)
        .sort();
      return {
        providerId: "qnb-egypt" as const,
        messageFamily,
        currency,
        status:
          candidateIds.length > 0
            ? ("candidate_collected" as const)
            : ("pending" as const),
        candidateIds,
        recordedAt,
      };
    })
  );
}

export function markPendingQaCoverageUnavailable(
  declarations: readonly QaCoverageDeclaration[],
  recordedAt: string
): readonly QaCoverageDeclaration[] {
  return declarations.map((declaration) =>
    declaration.status === "pending"
      ? {
          ...declaration,
          status: "unavailable_in_qa_dataset" as const,
          candidateIds: [],
          recordedAt,
        }
      : declaration
  );
}

export function updateQaCoverageDeclaration(
  declarations: readonly QaCoverageDeclaration[],
  key: QaCoverageKey,
  status: QaCoverageStatus,
  recordedAt: string
): readonly QaCoverageDeclaration[] {
  const current = declarations.find(
    (declaration) =>
      declaration.messageFamily === key.messageFamily &&
      declaration.currency === key.currency
  );
  if (!current) throw new Error("coverage_scope_not_found");
  if (status === "candidate_collected" && current.candidateIds.length === 0) {
    throw new Error("coverage_candidate_required");
  }
  if (
    (status === "unavailable_in_qa_dataset" || status === "pending") &&
    current.candidateIds.length > 0
  ) {
    throw new Error("coverage_candidate_already_collected");
  }

  return declarations.map((declaration) =>
    declaration === current
      ? {
          ...declaration,
          status,
          candidateIds: declaration.candidateIds,
          recordedAt,
        }
      : declaration
  );
}

export async function buildQaCandidateBundle(
  candidates: readonly QaCandidateArtifact[],
  coverageDeclarations: readonly QaCoverageDeclaration[],
  metadata: QaBundleMetadata,
  createContentDigest: QaContentDigest
): Promise<QaCandidateBundle> {
  if (coverageDeclarations.some(({ status }) => status === "pending")) {
    throw new Error("coverage_pending");
  }
  const content = normalizeBundleContent({
    schemaVersion: 1,
    exportId: metadata.exportId,
    exportedAt: metadata.exportedAt,
    evidenceDomainStatus: metadata.evidenceDomainStatus,
    candidates,
    coverageDeclarations,
  });
  const candidateIds = content.candidates.map(({ candidateId }) => candidateId);
  const contentDigest = await createContentDigest(
    serializeQaCandidateBundleIntegrityPayload(content)
  );
  return qaCandidateBundleSchema.parse({
    ...content,
    integrity: {
      candidateCount: content.candidates.length,
      candidateIds,
      contentDigest,
    },
  });
}

export type {
  QaBundleMetadata,
  QaCandidateBundleContent,
  QaContentDigest,
  QaCoverageKey,
};
