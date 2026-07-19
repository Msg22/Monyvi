import { qaCandidateArtifactSchema } from "./qa-sms-artifact-schema";
import {
  findQaSmsResidualDynamicFindings,
  sanitizeQaSmsCandidate,
} from "./qa-sms-candidate-sanitizer";
import {
  buildQaSanitizedShape,
  type QaCandidateArtifact,
  type QaDraftValidationCode,
  type QaDraftValidationFinding,
  type QaSanitizedCandidateDraft,
  type QaSmsPlaceholderToken,
  type QaSmsSemanticRole,
  type QaSanitizedSegment,
} from "./qa-sms-pattern-types";
import { validateQaSmsCandidatePrivacy } from "./qa-sms-privacy-validator";

const VALIDATION_CANDIDATE_ID =
  "qa-candidate-00000000-0000-4000-8000-000000000000";

interface QaRawRangeCorrection {
  readonly rawBody: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly token: QaSmsPlaceholderToken;
  readonly semanticRole: QaSmsSemanticRole;
}

interface QaRawRangeSelection {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly token: QaSmsPlaceholderToken;
  readonly semanticRole: QaSmsSemanticRole;
}

interface QaCandidateArtifactMetadata {
  readonly candidateId: string;
  readonly createdAt: string;
}

interface QaCorrectionMarker {
  readonly value: string;
  readonly correction: QaRawRangeSelection;
}

function buildCorrectionMarker(index: number): string {
  return `[[[QACORR_${index}]]]`;
}

function restoreCorrectionMarkers(
  segments: readonly QaSanitizedSegment[],
  markers: readonly QaCorrectionMarker[]
): readonly QaSanitizedSegment[] {
  const restored = segments.flatMap((segment) => {
    if (segment.kind !== "fixed") return [segment];
    let remaining = segment.text;
    const result: QaSanitizedSegment[] = [];
    while (remaining.length > 0) {
      const next = markers
        .map((marker) => ({ marker, index: remaining.indexOf(marker.value) }))
        .filter(({ index }) => index >= 0)
        .sort((left, right) => left.index - right.index)[0];
      if (!next) {
        result.push({ kind: "fixed", text: remaining });
        break;
      }
      if (next.index > 0) {
        result.push({ kind: "fixed", text: remaining.slice(0, next.index) });
      }
      result.push({
        kind: "placeholder",
        token: next.marker.correction.token,
        semanticRole: next.marker.correction.semanticRole,
        wasOperatorCorrected: true,
      });
      remaining = remaining.slice(next.index + next.marker.value.length);
    }
    return result;
  });
  const restoredCount = restored.filter(
    (segment) => segment.kind === "placeholder" && segment.wasOperatorCorrected
  ).length;
  if (restoredCount !== markers.length) {
    throw new Error("invalid_placeholder_boundary");
  }
  return restored;
}

function finding(
  code: QaDraftValidationCode,
  semanticRole: QaSmsSemanticRole | null = null
): QaDraftValidationFinding {
  return {
    code,
    severity: "blocking",
    segmentIndex: null,
    messageKey: `qaSmsIntake.privacy.${code}`,
    semanticRole,
  };
}

function buildUncheckedArtifact(
  draft: QaSanitizedCandidateDraft,
  metadata: QaCandidateArtifactMetadata
): QaCandidateArtifact {
  if (
    draft.verifiedSenderAlias === null ||
    draft.messageFamily === null ||
    draft.expectedOutcome === null ||
    draft.classificationStatus !== "confirmed"
  ) {
    throw new Error("candidate_metadata_incomplete");
  }

  return {
    schemaVersion: 1,
    candidateId: metadata.candidateId,
    evidenceDigest: draft.evidenceDigest,
    providerId: draft.providerId,
    verifiedSenderAlias: draft.verifiedSenderAlias,
    messageFamily: draft.messageFamily,
    currency: draft.currency,
    expectedOutcome: draft.expectedOutcome,
    segments: draft.segments,
    sanitizedShape: buildQaSanitizedShape(draft.segments),
    sourceType: "qa-real-sms",
    runtimeScope: "candidate",
    autoSelectPolicy: "never",
    authorization: {
      version: draft.authorization.version,
      authorizationClass: draft.authorization.authorizationClass,
      authorizedAt: draft.authorization.authorizedAt,
      providerScope: draft.authorization.providerScope,
    },
    createdAt: metadata.createdAt,
  };
}

export function applyQaRawRangeCorrection(
  draft: QaSanitizedCandidateDraft,
  correction: QaRawRangeCorrection
): QaSanitizedCandidateDraft {
  const { rawBody, ...selection } = correction;
  return applyQaRawRangeCorrections(draft, rawBody, [selection]);
}

export function applyQaRawRangeCorrections(
  draft: QaSanitizedCandidateDraft,
  rawBody: string,
  corrections: readonly QaRawRangeSelection[]
): QaSanitizedCandidateDraft {
  const normalized = normalizeCorrections(rawBody, corrections);
  const indexedCorrections = normalized.map((correction, index) => ({
    correction,
    marker: buildCorrectionMarker(index),
  }));
  const bodyWithCorrections = [...indexedCorrections]
    .sort(
      (left, right) =>
        right.correction.startOffset - left.correction.startOffset
    )
    .reduce(
      (body, { correction, marker }) =>
        body.slice(0, correction.startOffset) +
        marker +
        body.slice(correction.endOffset),
      rawBody
    );
  const sanitized = sanitizeQaSmsCandidate({
    draftId: draft.draftId,
    body: bodyWithCorrections,
    providerId: draft.providerId,
    verifiedSenderAlias: draft.verifiedSenderAlias,
    messageFamily: draft.messageFamily,
    currency: draft.currency,
    expectedOutcome: draft.expectedOutcome,
    evidenceDigest: draft.evidenceDigest,
    authorization: draft.authorization,
  });
  const segments = restoreCorrectionMarkers(
    sanitized.segments,
    indexedCorrections.map(({ correction, marker }) => ({
      correction,
      value: marker,
    }))
  );

  return { ...sanitized, segments, status: "draft" };
}

function normalizeCorrections(
  rawBody: string,
  corrections: readonly QaRawRangeSelection[]
): readonly QaRawRangeSelection[] {
  return corrections.reduce<readonly QaRawRangeSelection[]>(
    (normalized, correction) => {
      validateCorrection(rawBody, correction);
      const withoutSameRange = normalized.filter(
        (current) =>
          current.startOffset !== correction.startOffset ||
          current.endOffset !== correction.endOffset
      );
      const hasOverlap = withoutSameRange.some(
        (current) =>
          correction.startOffset < current.endOffset &&
          correction.endOffset > current.startOffset
      );
      if (hasOverlap) throw new Error("invalid_placeholder_boundary");
      return [...withoutSameRange, correction];
    },
    []
  );
}

function validateCorrection(
  rawBody: string,
  correction: QaRawRangeSelection
): void {
  if (
    !Number.isInteger(correction.startOffset) ||
    !Number.isInteger(correction.endOffset) ||
    correction.startOffset < 0 ||
    correction.endOffset <= correction.startOffset ||
    correction.endOffset > rawBody.length ||
    correction.semanticRole.trim().length === 0
  ) {
    throw new Error("invalid_placeholder_boundary");
  }
}

export function validateQaSmsDraft(
  draft: QaSanitizedCandidateDraft
): QaSanitizedCandidateDraft {
  const currentFixedText = draft.segments
    .flatMap((segment) => (segment.kind === "fixed" ? [segment.text] : []))
    .join(" ");
  const findings: QaDraftValidationFinding[] = [
    ...findQaSmsResidualDynamicFindings(currentFixedText),
  ];
  if (
    draft.classificationStatus !== "confirmed" ||
    draft.messageFamily === null
  ) {
    findings.push(finding("classification_required"));
  }
  if (draft.expectedOutcome === null) {
    findings.push(finding("expected_outcome_required"));
  }

  if (
    draft.expectedOutcome?.kind === "transaction" ||
    draft.expectedOutcome?.kind === "transfer"
  ) {
    const roles = new Set(
      draft.segments.flatMap((segment) =>
        segment.kind === "placeholder" ? [segment.semanticRole] : []
      )
    );
    for (const role of draft.expectedOutcome.requiredPlaceholderRoles) {
      if (!roles.has(role)) {
        findings.push(finding("required_placeholder_missing", role));
      }
    }
  }

  if (
    findings.length === 0 &&
    draft.verifiedSenderAlias !== null &&
    draft.messageFamily !== null &&
    draft.expectedOutcome !== null
  ) {
    const artifact = buildUncheckedArtifact(draft, {
      candidateId: VALIDATION_CANDIDATE_ID,
      createdAt: draft.authorization.authorizedAt,
    });
    findings.push(
      ...validateQaSmsCandidatePrivacy(artifact).findings.map((item) => ({
        ...item,
        semanticRole: null,
      }))
    );
    if (!qaCandidateArtifactSchema.safeParse(artifact).success) {
      findings.push(finding("unknown_dynamic_value"));
    }
  } else if (draft.verifiedSenderAlias === null) {
    findings.push(finding("unverified_sender"));
  }

  const uniqueFindings = findings.filter(
    (item, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.code === item.code &&
          candidate.segmentIndex === item.segmentIndex &&
          candidate.semanticRole === item.semanticRole
      ) === index
  );
  return {
    ...draft,
    validationFindings: uniqueFindings,
    status: uniqueFindings.length === 0 ? "validated" : "blocked",
  };
}

export function approveQaSmsDraft(
  draft: QaSanitizedCandidateDraft
): QaSanitizedCandidateDraft {
  if (draft.status !== "validated") {
    throw new Error("candidate_not_validated");
  }
  return { ...draft, status: "approved" };
}

export function buildQaCandidateArtifact(
  draft: QaSanitizedCandidateDraft,
  metadata: QaCandidateArtifactMetadata
): QaCandidateArtifact {
  if (draft.status !== "approved") {
    throw new Error("candidate_not_approved");
  }
  return qaCandidateArtifactSchema.parse(
    buildUncheckedArtifact(draft, metadata)
  );
}

export type {
  QaCandidateArtifactMetadata,
  QaRawRangeCorrection,
  QaRawRangeSelection,
};
