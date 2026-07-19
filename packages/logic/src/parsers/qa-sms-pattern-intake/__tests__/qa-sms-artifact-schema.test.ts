import {
  qaCandidateArtifactSchema,
  qaCandidateBundleSchema,
} from "../qa-sms-artifact-schema";
import { buildQaCoverageDeclarations } from "../qa-sms-bundle-builder";
import type { QaCandidateArtifact } from "../qa-sms-pattern-types";
import { buildTestCandidateId } from "./qa-sms-test-fixtures";

const CANDIDATE_ID = buildTestCandidateId("candidate-001");
const DUPLICATE_CANDIDATE_ID = buildTestCandidateId("candidate-002");

function buildCandidate(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    candidateId: CANDIDATE_ID,
    evidenceDigest: "a".repeat(64),
    providerId: "qnb-egypt",
    verifiedSenderAlias: "QNB",
    messageFamily: "card_purchase",
    currency: "EGP",
    expectedOutcome: {
      kind: "transaction",
      direction: "expense",
      requiredPlaceholderRoles: ["transaction_amount"],
      confidenceCeiling: 0.8,
      reviewStatus: "needs_review",
      reviewReasons: ["candidate_pattern"],
    },
    segments: [
      { kind: "fixed", text: "QA fixed phrase " },
      {
        kind: "placeholder",
        token: "AMOUNT",
        semanticRole: "transaction_amount",
        wasOperatorCorrected: false,
      },
    ],
    sanitizedShape: "QA fixed phrase <AMOUNT>",
    sourceType: "qa-real-sms",
    runtimeScope: "candidate",
    autoSelectPolicy: "never",
    authorization: {
      version: 1,
      authorizationClass: "qa_operator_explicit",
      authorizedAt: "2026-07-13T00:00:00.000Z",
      providerScope: "qnb-egypt",
    },
    createdAt: "2026-07-13T00:01:00.000Z",
  };
}

function buildBundle(candidate = buildCandidate()): Record<string, unknown> {
  const recordedAt = "2026-07-13T00:02:00.000Z";
  return {
    schemaVersion: 1,
    exportId: "123e4567-e89b-42d3-a456-426614174000",
    exportedAt: "2026-07-13T00:02:00.000Z",
    evidenceDomainStatus: "stable",
    candidates: [candidate],
    coverageDeclarations: buildQaCoverageDeclarations(
      [candidate as unknown as QaCandidateArtifact],
      recordedAt
    ),
    integrity: {
      candidateCount: 1,
      candidateIds: [CANDIDATE_ID],
      contentDigest: "b".repeat(64),
    },
  };
}

describe("QA SMS artifact schemas", () => {
  it("accepts a strict versioned candidate and bundle", () => {
    expect(qaCandidateArtifactSchema.parse(buildCandidate())).toBeDefined();
    expect(qaCandidateBundleSchema.parse(buildBundle())).toBeDefined();
  });

  it.each([
    ["unknown candidate key", { extra: true }],
    ["raw body", { body: "forbidden" }],
    ["raw sender", { sender: "forbidden" }],
    ["native message id", { nativeMessageId: "forbidden" }],
    ["SMS fingerprint", { smsFingerprint: "forbidden" }],
  ])("rejects %s", (_label, extra) => {
    expect(() =>
      qaCandidateArtifactSchema.parse({ ...buildCandidate(), ...extra })
    ).toThrow();
  });

  it.each(["123456", "native-message-42", "device_sms_9"])(
    "rejects non-namespaced candidate identifier %s",
    (candidateId) => {
      expect(() =>
        qaCandidateArtifactSchema.parse({ ...buildCandidate(), candidateId })
      ).toThrow();
    }
  );

  it("rejects source-like values wrapped in the candidate prefix", () => {
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...buildCandidate(),
        candidateId: "qa-candidate-01012345678",
      })
    ).toThrow();
  });

  it.each(["123456", "native-message-42", "qa-export-001"])(
    "rejects non-UUID export identifier %s",
    (exportId) => {
      expect(() =>
        qaCandidateBundleSchema.parse({ ...buildBundle(), exportId })
      ).toThrow();
    }
  );

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid confidence ceiling %s",
    (confidenceCeiling) => {
      const candidate = buildCandidate();
      const expectedOutcome = candidate.expectedOutcome as Record<
        string,
        unknown
      >;
      expect(() =>
        qaCandidateArtifactSchema.parse({
          ...candidate,
          expectedOutcome: { ...expectedOutcome, confidenceCeiling },
        })
      ).toThrow();
    }
  );

  it("rejects arbitrary review reasons", () => {
    const candidate = buildCandidate();
    const expectedOutcome = candidate.expectedOutcome as Record<
      string,
      unknown
    >;
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...candidate,
        expectedOutcome: {
          ...expectedOutcome,
          reviewReasons: ["invented_reason"],
        },
      })
    ).toThrow();
  });

  it("rejects a transaction direction that contradicts its message family", () => {
    const candidate = buildCandidate();
    const expectedOutcome = candidate.expectedOutcome as Record<
      string,
      unknown
    >;

    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...candidate,
        expectedOutcome: { ...expectedOutcome, direction: "income" },
      })
    ).toThrow();
  });

  it("requires sanitizedShape to equal the shape derived from segments", () => {
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...buildCandidate(),
        sanitizedShape: "different <AMOUNT>",
      })
    ).toThrow();
  });

  it("rejects placeholder token and semantic-role mismatches", () => {
    const candidate = buildCandidate();
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...candidate,
        segments: [
          {
            kind: "placeholder",
            token: "MERCHANT",
            semanticRole: "transaction_amount",
            wasOperatorCorrected: true,
          },
        ],
        sanitizedShape: "<MERCHANT>",
      })
    ).toThrow();
  });

  it.each([
    ["ACCOUNT", "source_account_suffix"],
    ["REFERENCE", "otp_code"],
    ["PHONE", "provider_hotline"],
    ["ATM_TERMINAL", "atm_terminal"],
  ])("accepts %s with its supported %s role", (token, semanticRole) => {
    const candidate = buildCandidate();
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...candidate,
        messageFamily: "otp",
        currency: null,
        expectedOutcome: { kind: "rejection", reason: "otp" },
        segments: [
          {
            kind: "placeholder",
            token,
            semanticRole,
            wasOperatorCorrected: true,
          },
        ],
        sanitizedShape: `<${token}>`,
      })
    ).not.toThrow();
  });

  it("rejects transaction outcomes whose required roles are absent", () => {
    const candidate = buildCandidate();
    const expectedOutcome = candidate.expectedOutcome as Record<
      string,
      unknown
    >;
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...candidate,
        expectedOutcome: {
          ...expectedOutcome,
          requiredPlaceholderRoles: ["merchant_name"],
        },
      })
    ).toThrow();
  });

  it("rejects optional transaction roles even when their placeholders exist", () => {
    const candidate = buildCandidate();
    const expectedOutcome = candidate.expectedOutcome as Record<
      string,
      unknown
    >;
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...candidate,
        expectedOutcome: {
          ...expectedOutcome,
          requiredPlaceholderRoles: ["transaction_amount", "merchant_name"],
        },
        segments: [
          ...(candidate.segments as readonly unknown[]),
          {
            kind: "placeholder",
            token: "MERCHANT",
            semanticRole: "merchant_name",
            wasOperatorCorrected: false,
          },
        ],
        sanitizedShape: "QA fixed phrase <AMOUNT><MERCHANT>",
      })
    ).toThrow();
  });

  it("rejects invalid evidence digests and incompatible family currencies", () => {
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...buildCandidate(),
        evidenceDigest: "device-message-id",
      })
    ).toThrow();
    expect(() =>
      qaCandidateArtifactSchema.parse({ ...buildCandidate(), currency: null })
    ).toThrow();
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...buildCandidate(),
        messageFamily: "otp",
        currency: "EGP",
        expectedOutcome: { kind: "rejection", reason: "otp" },
      })
    ).toThrow();
  });

  it("rejects USD bank-to-wallet candidates and coverage declarations", () => {
    const candidate = buildCandidate();
    expect(() =>
      qaCandidateArtifactSchema.parse({
        ...candidate,
        messageFamily: "bank_to_wallet_transfer",
        currency: "USD",
        expectedOutcome: {
          kind: "transfer",
          direction: "bank_to_wallet",
          requiredPlaceholderRoles: ["transaction_amount"],
          confidenceCeiling: 0.8,
          reviewStatus: "needs_review",
          reviewReasons: ["candidate_pattern", "transfer_accounts_required"],
        },
      })
    ).toThrow();

    const bundle = buildBundle();
    const declarations = bundle.coverageDeclarations as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(() =>
      qaCandidateBundleSchema.parse({
        ...bundle,
        coverageDeclarations: declarations.map((declaration) =>
          declaration.messageFamily === "bank_to_wallet_transfer"
            ? { ...declaration, currency: "USD" }
            : declaration
        ),
      })
    ).toThrow();
  });

  it("rejects duplicate candidate IDs, duplicate evidence, and bad integrity", () => {
    const first = buildCandidate();
    const duplicate = {
      ...buildCandidate(),
      candidateId: DUPLICATE_CANDIDATE_ID,
    };

    expect(() =>
      qaCandidateBundleSchema.parse({
        ...buildBundle(),
        candidates: [first, duplicate],
        integrity: {
          candidateCount: 2,
          candidateIds: [CANDIDATE_ID, DUPLICATE_CANDIDATE_ID],
          contentDigest: "b".repeat(64),
        },
      })
    ).toThrow();

    expect(() =>
      qaCandidateBundleSchema.parse({
        ...buildBundle(),
        integrity: {
          candidateCount: 2,
          candidateIds: [CANDIDATE_ID],
          contentDigest: "b".repeat(64),
        },
      })
    ).toThrow();
  });

  it("rejects coverage declarations that disagree with candidate references", () => {
    const bundle = buildBundle();
    expect(() =>
      qaCandidateBundleSchema.parse({
        ...bundle,
        coverageDeclarations: [
          {
            providerId: "qnb-egypt",
            messageFamily: "card_purchase",
            currency: "EGP",
            status: "unavailable_in_qa_dataset",
            candidateIds: [CANDIDATE_ID],
            recordedAt: "2026-07-13T00:02:00.000Z",
          },
        ],
      })
    ).toThrow();
  });

  it("rejects pending coverage that retains candidate references", () => {
    const bundle = buildBundle();
    const declarations = bundle.coverageDeclarations as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(() =>
      qaCandidateBundleSchema.parse({
        ...bundle,
        coverageDeclarations: declarations.map((declaration) =>
          declaration.messageFamily === "card_purchase" &&
          declaration.currency === "EGP"
            ? { ...declaration, status: "pending" }
            : declaration
        ),
      })
    ).toThrow();
  });

  it("rejects duplicate candidate IDs within one coverage declaration", () => {
    const bundle = buildBundle();
    const declarations = bundle.coverageDeclarations as ReadonlyArray<
      Record<string, unknown>
    >;

    expect(() =>
      qaCandidateBundleSchema.parse({
        ...bundle,
        coverageDeclarations: declarations.map((declaration) =>
          declaration.messageFamily === "card_purchase" &&
          declaration.currency === "EGP"
            ? {
                ...declaration,
                candidateIds: [CANDIDATE_ID, CANDIDATE_ID],
              }
            : declaration
        ),
      })
    ).toThrow();
  });

  it("rejects coverage references whose candidate belongs to another scope", () => {
    const bundle = buildBundle();
    const declarations = bundle.coverageDeclarations as ReadonlyArray<
      Record<string, unknown>
    >;

    expect(() =>
      qaCandidateBundleSchema.parse({
        ...bundle,
        coverageDeclarations: declarations.map((declaration) =>
          declaration.messageFamily === "card_purchase" &&
          declaration.currency === "USD"
            ? {
                ...declaration,
                status: "candidate_collected",
                candidateIds: [CANDIDATE_ID],
              }
            : declaration
        ),
      })
    ).toThrow();
  });

  it("rejects candidates omitted from their matching coverage declaration", () => {
    const bundle = buildBundle();
    const declarations = bundle.coverageDeclarations as ReadonlyArray<
      Record<string, unknown>
    >;

    expect(() =>
      qaCandidateBundleSchema.parse({
        ...bundle,
        coverageDeclarations: declarations.map((declaration) =>
          declaration.messageFamily === "card_purchase" &&
          declaration.currency === "EGP"
            ? {
                ...declaration,
                status: "unavailable_in_qa_dataset",
                candidateIds: [],
              }
            : declaration
        ),
      })
    ).toThrow();
  });

  it.each([
    ["missing", (declarations: readonly unknown[]) => declarations.slice(1)],
    [
      "duplicate",
      (declarations: readonly unknown[]) => [...declarations, declarations[0]],
    ],
    ["empty", () => []],
  ])("rejects %s required coverage declarations", (_label, alter) => {
    const bundle = buildBundle();
    const declarations = bundle.coverageDeclarations as readonly unknown[];

    expect(() =>
      qaCandidateBundleSchema.parse({
        ...bundle,
        coverageDeclarations: alter(declarations),
      })
    ).toThrow();
  });
});
