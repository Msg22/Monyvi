import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { qaCandidateArtifactSchema } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-artifact-schema";
import type { QaCandidateArtifact } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import { validateQaSmsCandidatePrivacy } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-privacy-validator";
import {
  createTrustedSmsCatalogIntegrityDigest,
  createTrustedSmsPatternIntegrityDigest,
} from "../packages/logic/src/parsers/trusted-sms-pattern-catalog";
import {
  TRUSTED_SMS_ELIGIBLE_FAMILIES,
  type TrustedSmsCatalog,
  type TrustedSmsExpectedOutcome,
  type TrustedSmsPattern,
  type TrustedSmsPromotionRecord,
  type TrustedSmsSegment,
} from "../packages/logic/src/parsers/trusted-sms-pattern-types";
import { matchTrustedSmsTemplate } from "../packages/logic/src/parsers/trusted-sms-template-matcher";
import {
  TRUSTED_SMS_CATALOG_VERSION,
  TRUSTED_SMS_DISABLED_PATTERN_IDS,
  TRUSTED_SMS_PROMOTION_RECORDS,
} from "../packages/logic/src/parsers/trusted-sms-patterns/promotion-manifest";

interface PromoteQaSmsPatternsInput {
  readonly candidates: readonly QaCandidateArtifact[];
  readonly promotionRecords: readonly TrustedSmsPromotionRecord[];
  readonly catalogVersion: number;
  readonly disabledPatternIds?: readonly string[];
}

export interface TrustedSmsCatalogSourceFile {
  readonly fileName: string;
  readonly source: string;
}

const ELIGIBLE_FAMILIES = new Set<string>(TRUSTED_SMS_ELIGIBLE_FAMILIES);
const GENERATED_PATTERN_CHUNK_SIZE = 6;
const GENERATED_PATTERN_FILE = /^qnb-egypt-patterns-\d{2}\.ts$/;
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_ROLE_VALUES: Readonly<Record<string, string>> = {
  transaction_currency: "EGP",
  transaction_amount: "125.50",
  available_balance: "5000.00",
  card_last4: "2132",
  account_reference: "7660",
  source_account_suffix: "7660",
  transaction_reference: "qa-reference",
  message_code: "123456",
  otp_code: "123456",
  merchant_name: "QA MERCHANT",
  atm_terminal: "ATM-QA",
  counterparty_person: "QA PERSON",
  phone_number: "19700",
  provider_hotline: "19700",
  transaction_date: "13/07",
  transaction_time: "12:55 PM",
  promotional_amount: "1000",
  promotional_rate: "13.5",
  campaign_year: "2026",
  public_url: "https://example.test",
  public_reference: "204899052",
};

function hasClosedValidation(record: TrustedSmsPromotionRecord): boolean {
  return Object.values(record.validation).every(
    (status) => status === "passed"
  );
}

function mapExpectedOutcome(
  candidate: QaCandidateArtifact,
  messageFamily: TrustedSmsPattern["messageFamily"]
): TrustedSmsExpectedOutcome {
  if (candidate.expectedOutcome.kind === "rejection") {
    return candidate.expectedOutcome;
  }
  if (candidate.expectedOutcome.kind !== "transaction") {
    throw new Error("promotion_family_not_eligible");
  }
  return {
    kind: "transaction",
    direction: candidate.expectedOutcome.direction,
    reviewStatus: "needs_review",
    reviewReasons:
      messageFamily === "atm_withdrawal"
        ? ["low_confidence", "cash_transfer_review"]
        : ["low_confidence"],
    confidenceCeiling: candidate.expectedOutcome.confidenceCeiling,
  };
}

function mapSegments(
  candidate: QaCandidateArtifact
): readonly TrustedSmsSegment[] {
  return candidate.segments.map((segment) =>
    segment.kind === "fixed"
      ? { kind: "fixed", text: segment.text }
      : {
          kind: "placeholder",
          token: segment.token,
          semanticRole: segment.semanticRole,
        }
  );
}

function createPattern(
  candidate: QaCandidateArtifact,
  record: TrustedSmsPromotionRecord,
  enabled: boolean
): TrustedSmsPattern {
  const messageFamily =
    record.reviewedMessageFamilyOverride ?? candidate.messageFamily;
  const patternWithoutDigest = {
    schemaVersion: 1 as const,
    patternId: record.patternId,
    patternVersion: record.patternVersion,
    catalogVersion: record.catalogVersion,
    providerId: candidate.providerId,
    verifiedSenderAliases: [candidate.verifiedSenderAlias],
    messageFamily,
    currency: candidate.currency,
    enabled,
    runtimeScope: "trusted_production" as const,
    sourceType: "qa-real-sms" as const,
    autoSelectPolicy: "never" as const,
    provenanceCode: "qa_operator_promoted" as const,
    promotionId: record.promotionId,
    segments: mapSegments(candidate),
    expectedOutcome: mapExpectedOutcome(candidate, messageFamily),
    validationStatus: record.validation,
  };
  const provisional = {
    ...patternWithoutDigest,
    integrityDigest: "",
  } as TrustedSmsPattern;
  return {
    ...patternWithoutDigest,
    integrityDigest: createTrustedSmsPatternIntegrityDigest(provisional),
  } as TrustedSmsPattern;
}

function validatePromotion(
  candidate: QaCandidateArtifact,
  record: TrustedSmsPromotionRecord,
  catalogVersion: number
): void {
  if (
    record.schemaVersion !== 1 ||
    !STABLE_ID.test(record.promotionId) ||
    !STABLE_ID.test(record.patternId) ||
    !Number.isInteger(record.patternVersion) ||
    record.patternVersion < 1 ||
    record.candidateId.trim().length === 0
  ) {
    throw new Error("promotion_record_invalid");
  }
  if (!qaCandidateArtifactSchema.safeParse(candidate).success) {
    throw new Error("promotion_candidate_schema_invalid");
  }
  if (!validateQaSmsCandidatePrivacy(candidate).isValid) {
    throw new Error("promotion_candidate_privacy_invalid");
  }
  if (!ELIGIBLE_FAMILIES.has(candidate.messageFamily)) {
    throw new Error("promotion_family_not_eligible");
  }
  if (
    record.reviewedMessageFamilyOverride !== undefined &&
    !ELIGIBLE_FAMILIES.has(record.reviewedMessageFamilyOverride)
  ) {
    throw new Error("promotion_family_override_not_eligible");
  }
  if (record.evidenceDigest !== candidate.evidenceDigest) {
    throw new Error("promotion_evidence_digest_mismatch");
  }
  if (record.catalogVersion !== catalogVersion) {
    throw new Error("promotion_catalog_version_mismatch");
  }
  if (!hasClosedValidation(record)) {
    throw new Error("promotion_validation_incomplete");
  }
  if (
    record.validationEvidence?.exactPositive !== "rendered_candidate" ||
    record.validationEvidence.nearMatch !== "mutate_each_fixed_segment" ||
    record.validationEvidence.intentionalNegative !== "unverified_sender"
  ) {
    throw new Error("promotion_validation_evidence_missing");
  }
  if (
    record.reviewerId.trim().length === 0 ||
    Number.isNaN(Date.parse(record.approvedAt))
  ) {
    throw new Error("promotion_approval_invalid");
  }
}

function mutateFixedText(text: string): string {
  const characterIndex = [...text].findIndex((character) => character.trim());
  if (characterIndex < 0) return "";
  const characters = [...text];
  characters[characterIndex] = characters[characterIndex] === "!" ? "?" : "!";
  return characters.join("");
}

function renderPattern(
  pattern: TrustedSmsPattern,
  mutatedFixedSegmentIndex?: number
): string {
  return pattern.segments
    .map((segment, segmentIndex) => {
      if (segment.kind === "fixed") {
        return segmentIndex === mutatedFixedSegmentIndex
          ? mutateFixedText(segment.text)
          : segment.text;
      }
      if (
        segment.semanticRole === "transaction_currency" &&
        pattern.currency !== null
      ) {
        return pattern.currency;
      }
      return SAFE_ROLE_VALUES[segment.semanticRole] ?? "VALUE";
    })
    .join("");
}

function validatePromotedPatternBehavior(
  patterns: readonly TrustedSmsPattern[],
  recordsByPatternId: ReadonlyMap<string, TrustedSmsPromotionRecord>
): void {
  const validationPatterns = patterns.map((pattern) => ({
    ...pattern,
    enabled: true,
  }));
  for (const pattern of validationPatterns) {
    const record = recordsByPatternId.get(pattern.patternId);
    if (record === undefined) throw new Error("promotion_record_missing");
    const body = renderPattern(pattern);
    const candidate = {
      sender: pattern.verifiedSenderAliases[0] ?? "",
      body,
      receivedAtMs: 1_750_000_000_000,
    };
    const exact = matchTrustedSmsTemplate({
      candidate,
      patterns: validationPatterns,
      supportedCurrencies: ["EGP", "USD"],
    });
    const expectedStatus =
      pattern.expectedOutcome.kind === "transaction" ? "matched" : "rejected";
    if (exact.status === "ambiguous") {
      throw new Error("promotion_pattern_ambiguous");
    }
    const exactPatternId =
      exact.status === "matched"
        ? exact.pattern.patternId
        : exact.status === "rejected"
          ? exact.patternId
          : null;
    if (
      exact.status !== expectedStatus ||
      exactPatternId !== pattern.patternId
    ) {
      throw new Error("promotion_exact_validation_failed");
    }
    const fixedSegmentIndices = pattern.segments.flatMap(
      (segment, segmentIndex) =>
        segment.kind === "fixed" && segment.text.length > 0
          ? [segmentIndex]
          : []
    );
    const nonMatchCandidates = [
      ...fixedSegmentIndices.map((segmentIndex) => ({
        ...candidate,
        body: renderPattern(pattern, segmentIndex),
      })),
      { ...candidate, sender: "unreviewed-sender" },
    ];
    for (const nonMatchCandidate of nonMatchCandidates) {
      const nonMatch = matchTrustedSmsTemplate({
        candidate: nonMatchCandidate,
        patterns: validationPatterns,
        supportedCurrencies: ["EGP", "USD"],
      });
      if (nonMatch.status !== "unresolved") {
        throw new Error("promotion_negative_validation_failed");
      }
    }
  }
}

export function promoteQaSmsPatterns(
  input: PromoteQaSmsPatternsInput
): TrustedSmsCatalog {
  if (!Number.isInteger(input.catalogVersion) || input.catalogVersion < 1) {
    throw new Error("promotion_catalog_version_invalid");
  }
  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate])
  );
  const disabledPatternIds = new Set(input.disabledPatternIds ?? []);
  const identities = new Set<string>();
  const patternIds = new Set<string>();
  const promotionIds = new Set<string>();
  const recordsByPatternId = new Map<string, TrustedSmsPromotionRecord>();
  const patterns = input.promotionRecords.flatMap((record) => {
    if (record.decision === "reject") return [];
    const candidate = candidatesById.get(record.candidateId);
    if (candidate === undefined) throw new Error("promotion_candidate_missing");
    validatePromotion(candidate, record, input.catalogVersion);
    const identity = `${record.patternId}@${record.patternVersion}`;
    if (identities.has(identity))
      throw new Error("promotion_identity_duplicate");
    if (patternIds.has(record.patternId)) {
      throw new Error("promotion_pattern_id_duplicate");
    }
    if (promotionIds.has(record.promotionId)) {
      throw new Error("promotion_id_duplicate");
    }
    identities.add(identity);
    patternIds.add(record.patternId);
    promotionIds.add(record.promotionId);
    recordsByPatternId.set(record.patternId, record);
    return [
      createPattern(
        candidate,
        record,
        !disabledPatternIds.has(record.patternId)
      ),
    ];
  });
  if ([...disabledPatternIds].some((patternId) => !patternIds.has(patternId))) {
    throw new Error("promotion_disabled_pattern_missing");
  }
  validatePromotedPatternBehavior(patterns, recordsByPatternId);
  const provisional = {
    schemaVersion: 1 as const,
    catalogVersion: input.catalogVersion,
    patterns,
    integrityDigest: "",
  };
  return {
    ...provisional,
    integrityDigest: createTrustedSmsCatalogIntegrityDigest(provisional),
  };
}

async function loadCommittedCandidates(
  rootDirectory: string
): Promise<readonly QaCandidateArtifact[]> {
  const candidateDirectory = path.resolve(
    rootDirectory,
    "packages/logic/src/parsers/qa-sms-pattern-candidates/qnb"
  );
  const fileNames = (await fs.readdir(candidateDirectory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
  const candidates: QaCandidateArtifact[] = [];
  for (const fileName of fileNames) {
    const rawCatalog = JSON.parse(
      await fs.readFile(path.resolve(candidateDirectory, fileName), "utf8")
    ) as { readonly candidates?: readonly unknown[] };
    if (!Array.isArray(rawCatalog.candidates)) {
      throw new Error("promotion_candidate_catalog_invalid");
    }
    candidates.push(
      ...rawCatalog.candidates.map((candidate) =>
        qaCandidateArtifactSchema.parse(candidate)
      )
    );
  }
  return candidates;
}

function toPatternChunkConstantName(chunkNumber: number): string {
  return `QNB_EGYPT_TRUSTED_SMS_PATTERNS_${String(chunkNumber).padStart(2, "0")}`;
}

function serializePatternChunkSource(
  patterns: TrustedSmsCatalog["patterns"],
  chunkNumber: number
): TrustedSmsCatalogSourceFile {
  const suffix = String(chunkNumber).padStart(2, "0");
  const constantName = toPatternChunkConstantName(chunkNumber);
  return {
    fileName: `qnb-egypt-patterns-${suffix}.ts`,
    source: [
      'import type { TrustedSmsPattern } from "../trusted-sms-pattern-types";',
      "",
      `export const ${constantName} = ${JSON.stringify(
        patterns,
        null,
        2
      )} as const satisfies readonly TrustedSmsPattern[];`,
      "",
    ].join("\n"),
  };
}

export function serializeTrustedSmsCatalogSources(
  catalog: TrustedSmsCatalog
): readonly TrustedSmsCatalogSourceFile[] {
  const chunks: TrustedSmsCatalogSourceFile[] = [];
  for (
    let startIndex = 0;
    startIndex < catalog.patterns.length;
    startIndex += GENERATED_PATTERN_CHUNK_SIZE
  ) {
    chunks.push(
      serializePatternChunkSource(
        catalog.patterns.slice(
          startIndex,
          startIndex + GENERATED_PATTERN_CHUNK_SIZE
        ),
        chunks.length + 1
      )
    );
  }
  const imports = chunks.map(({ fileName }, index) => {
    const moduleName = fileName.replace(/\.ts$/, "");
    return `import { ${toPatternChunkConstantName(index + 1)} } from "./${moduleName}";`;
  });
  const patternSpreads = chunks.map(
    (_, index) => `    ...${toPatternChunkConstantName(index + 1)},`
  );
  const catalogSource = [
    'import type { TrustedSmsCatalog } from "../trusted-sms-pattern-types";',
    ...imports,
    "",
    "export const QNB_EGYPT_TRUSTED_SMS_CATALOG = {",
    `  schemaVersion: ${catalog.schemaVersion},`,
    `  catalogVersion: ${catalog.catalogVersion},`,
    "  patterns: [",
    ...patternSpreads,
    "  ],",
    `  integrityDigest: ${JSON.stringify(catalog.integrityDigest)},`,
    "} as const satisfies TrustedSmsCatalog;",
    "",
  ].join("\n");

  return [{ fileName: "qnb-egypt.ts", source: catalogSource }, ...chunks];
}

async function writeCatalogSources(
  rootDirectory: string,
  catalog: TrustedSmsCatalog
): Promise<void> {
  const targetDirectory = path.resolve(
    rootDirectory,
    "packages/logic/src/parsers/trusted-sms-patterns"
  );
  const sources = serializeTrustedSmsCatalogSources(catalog);
  await Promise.all(
    sources.map(({ fileName, source }) =>
      fs.writeFile(path.resolve(targetDirectory, fileName), source, "utf8")
    )
  );
  const activeFiles = new Set(sources.map(({ fileName }) => fileName));
  const staleFiles = (await fs.readdir(targetDirectory)).filter(
    (fileName) =>
      GENERATED_PATTERN_FILE.test(fileName) && !activeFiles.has(fileName)
  );
  await Promise.all(
    staleFiles.map((fileName) =>
      fs.unlink(path.resolve(targetDirectory, fileName))
    )
  );
}

export async function runTrustedSmsPromotionCommand(
  rootDirectory: string = process.cwd()
): Promise<void> {
  const catalog = promoteQaSmsPatterns({
    candidates: await loadCommittedCandidates(rootDirectory),
    promotionRecords: TRUSTED_SMS_PROMOTION_RECORDS,
    catalogVersion: TRUSTED_SMS_CATALOG_VERSION,
    disabledPatternIds: TRUSTED_SMS_DISABLED_PATTERN_IDS,
  });
  await writeCatalogSources(rootDirectory, catalog);
  process.stdout.write(
    `${JSON.stringify({
      status: "promoted",
      catalogVersion: catalog.catalogVersion,
      patternCount: catalog.patterns.length,
    })}\n`
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runTrustedSmsPromotionCommand().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    process.stderr.write(
      `${/^[a-z0-9_]+$/.test(message) ? message : "trusted_sms_promotion_failed"}\n`
    );
    process.exitCode = 1;
  });
}

export type { PromoteQaSmsPatternsInput };
