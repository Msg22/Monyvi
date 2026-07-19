import { createHash } from "node:crypto";
import type {
  QaCandidateArtifact,
  QaExpectedOutcome,
  QaSanitizedSegment,
  QaTemplateFamily,
} from "./qa-sms-pattern-types";

interface FamilyAccumulator {
  readonly signature: string;
  readonly candidates: readonly QaCandidateArtifact[];
}

function normalizeFixedText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ");
}

function normalizeSenderFamily(value: string): string {
  const normalized = value.normalize("NFKC").trim().toUpperCase();
  return new Set(["QNB", "QNB ALAHLI", "QNB EGYPT"]).has(normalized)
    ? "QNB"
    : normalized;
}

function outcomeSignature(outcome: QaExpectedOutcome): object {
  if (outcome.kind === "rejection") return outcome;
  return {
    kind: outcome.kind,
    direction: outcome.direction,
    requiredPlaceholderRoles: [...outcome.requiredPlaceholderRoles].sort(),
    confidenceCeiling: outcome.confidenceCeiling,
    reviewStatus: outcome.reviewStatus,
    reviewReasons: [...outcome.reviewReasons].sort(),
  };
}

function segmentSignature(segments: readonly QaSanitizedSegment[]): object[] {
  return segments.map((segment) =>
    segment.kind === "fixed"
      ? { kind: segment.kind, text: normalizeFixedText(segment.text) }
      : {
          kind: segment.kind,
          token: segment.token,
          semanticRole: segment.semanticRole,
        }
  );
}

export function buildQaStructuralSignature(
  candidate: QaCandidateArtifact
): string {
  const hasCurrencyToken = candidate.segments.some(
    (segment) => segment.kind === "placeholder" && segment.token === "CURRENCY"
  );
  const canonical = JSON.stringify({
    providerId: candidate.providerId,
    senderFamily: normalizeSenderFamily(candidate.verifiedSenderAlias),
    messageFamily: candidate.messageFamily,
    segments: segmentSignature(candidate.segments),
    expectedOutcome: outcomeSignature(candidate.expectedOutcome),
    currencyWithoutToken: hasCurrencyToken ? null : candidate.currency,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function buildFamily(accumulator: FamilyAccumulator): QaTemplateFamily {
  const candidates = [...accumulator.candidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId)
  );
  const first = candidates[0];
  const supportedCurrencies = [
    ...new Set(
      candidates.flatMap(({ currency }) =>
        currency === null ? [] : [currency]
      )
    ),
  ].sort();
  const evidenceDigestsByCurrency = Object.fromEntries(
    (["EGP", "USD", "N/A"] as const).flatMap((currencyKey) => {
      const digests = candidates
        .filter(({ currency }) => (currency ?? "N/A") === currencyKey)
        .map(({ evidenceDigest }) => evidenceDigest)
        .sort();
      return digests.length > 0 ? [[currencyKey, digests]] : [];
    })
  );
  const shortSignature = accumulator.signature.slice(0, 12);
  return {
    familyId: `${first.providerId}-${first.messageFamily.replaceAll("_", "-")}-${shortSignature}`,
    version: 1,
    providerId: first.providerId,
    verifiedSenderAliases: [
      ...new Set(
        candidates.map(({ verifiedSenderAlias }) => verifiedSenderAlias)
      ),
    ].sort(),
    messageFamily: first.messageFamily,
    structuralSignature: accumulator.signature,
    supportedCurrencies,
    evidenceDigestsByCurrency,
    expectedOutcome: first.expectedOutcome,
    reviewState: "candidate",
    humanReview: null,
    validationCoverage: {
      positive: "pending",
      nearMatch: "pending",
      negative: "pending",
      currencies: Object.fromEntries(
        supportedCurrencies.map((currency) => [
          currency,
          {
            positive: "pending" as const,
            nearMatch: "pending" as const,
            negative: "pending" as const,
          },
        ])
      ),
    },
    versionHistory: [],
    runtimeScope: "candidate",
    autoSelectPolicy: "never",
  };
}

export function buildQaTemplateFamilies(
  candidates: readonly QaCandidateArtifact[]
): readonly QaTemplateFamily[] {
  const evidenceDigests = candidates.map(
    ({ evidenceDigest }) => evidenceDigest
  );
  if (new Set(evidenceDigests).size !== evidenceDigests.length) {
    throw new Error("duplicate_evidence_digest");
  }

  const bySignature = new Map<string, FamilyAccumulator>();
  for (const candidate of candidates) {
    const signature = buildQaStructuralSignature(candidate);
    const existing = bySignature.get(signature);
    if (existing) {
      bySignature.set(signature, {
        ...existing,
        candidates: [...existing.candidates, candidate],
      });
    } else {
      bySignature.set(signature, { signature, candidates: [candidate] });
    }
  }
  return [...bySignature.values()]
    .map(buildFamily)
    .sort((left, right) => left.familyId.localeCompare(right.familyId));
}
