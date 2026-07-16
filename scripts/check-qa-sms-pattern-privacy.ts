import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  qaCandidateArtifactSchema,
  qaCandidateBundleSchema,
  qaCoverageDeclarationSchema,
} from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-artifact-schema";
import { serializeQaCandidateBundleIntegrityPayload } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-bundle-builder";
import { QA_SMS_CANDIDATE_REVIEW_REASONS } from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-pattern-types";
import {
  findQaSmsFixedTextPrivacyFindings,
  validateQaSmsCandidatePrivacy,
} from "../packages/logic/src/parsers/qa-sms-pattern-intake/qa-sms-privacy-validator";

export interface QaSmsPrivacyScanFile {
  readonly path: string;
  readonly content: string;
}

export interface QaSmsPrivacyFinding {
  readonly code:
    | "candidate_runtime_import"
    | "bundle_integrity_invalid"
    | "bundle_schema_invalid"
    | "candidate_json_invalid"
    | "candidate_privacy_invalid"
    | "candidate_schema_invalid"
    | "forbidden_raw_key"
    | "invalid_auto_select_policy"
    | "invalid_confidence_ceiling"
    | "invalid_review_reason"
    | "invalid_runtime_scope"
    | "raw_numeric_value"
    | "raw_string_value"
    | "raw_value_canary"
    | "tracked_staging_artifact"
    | "trusted_runtime_private_metadata"
    | "unexpected_candidate_file";
  readonly path: string;
}

const CANDIDATE_ROOT = "packages/logic/src/parsers/qa-sms-pattern-candidates/";
const GENERATED_CANDIDATE_ROOT = `${CANDIDATE_ROOT}qnb/`;
const STAGING_ROOT = ".local/qa-sms-intake/";
const RAW_VALUE_CANARIES = ["QA_SMS_RAW_CANARY_DO_NOT_COMMIT"] as const;
const FORBIDDEN_RAW_KEYS = new Set([
  "_id",
  "address",
  "body",
  "date",
  "deviceSmsId",
  "messageBody",
  "nativeMessageId",
  "rawBody",
  "rawMessage",
  "rawSender",
  "rawSmsBody",
  "receivedAtMs",
  "sender",
  "smsBody",
  "smsFingerprint",
  "sourceMessage",
  "sourceTimestamp",
]);
const NORMALIZED_FORBIDDEN_RAW_KEYS = new Set(
  [...FORBIDDEN_RAW_KEYS].map(normalizeMetadataKey)
);
const ALLOWED_REVIEW_REASONS = new Set<string>(QA_SMS_CANDIDATE_REVIEW_REASONS);
const QA_CANDIDATE_ID_PATTERN =
  /^qa-candidate-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_256_PATTERN = /^[0-9a-f]{64}$/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QA_FAMILY_ID_PATTERN =
  /^qnb-egypt-(?:card-purchase|atm-withdrawal|incoming-ipn-transfer|outgoing-ipn-transfer|bank-to-wallet-transfer|refund-or-reversal|failed-transaction|otp|informational|promotional)-[0-9a-f]{12}$/i;
const QA_CASE_ID_PATTERN = /^qa-case-[a-z0-9][a-z0-9-]*$/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const TIMESTAMP_KEYS = new Set([
  "authorizedAt",
  "createdAt",
  "exportedAt",
  "invalidatedAt",
  "recordedAt",
  "reviewedAt",
]);
const VERIFIED_QNB_ALIASES = new Set(["QNB", "QNB ALAHLI", "QNB EGYPT"]);

function normalizeMetadataKey(key: string): string {
  return key.replaceAll("_", "").toLowerCase();
}

function isForbiddenRawKey(key: string): boolean {
  return NORMALIZED_FORBIDDEN_RAW_KEYS.has(normalizeMetadataKey(key));
}

function isSafeStructuredString(
  value: string,
  keyPath: readonly string[]
): boolean {
  const parentKey = keyPath.at(-1) ?? null;
  if (parentKey === "candidateId" || parentKey === "candidateIds") {
    return QA_CANDIDATE_ID_PATTERN.test(value);
  }
  if (
    parentKey === "contentDigest" ||
    parentKey === "evidenceDigest" ||
    parentKey === "structuralSignature" ||
    keyPath.includes("evidenceDigestsByCurrency")
  ) {
    return SHA_256_PATTERN.test(value);
  }
  if (parentKey === "exportId" || parentKey === "sourceExportId") {
    return UUID_PATTERN.test(value);
  }
  if (parentKey !== null && TIMESTAMP_KEYS.has(parentKey)) {
    return ISO_TIMESTAMP_PATTERN.test(value);
  }
  if (parentKey === "familyId" || parentKey === "targetFamilyId") {
    return QA_FAMILY_ID_PATTERN.test(value);
  }
  if (parentKey === "caseId") {
    return QA_CASE_ID_PATTERN.test(value);
  }
  if (
    parentKey === "verifiedSenderAlias" ||
    parentKey === "verifiedSenderAliases"
  ) {
    return VERIFIED_QNB_ALIASES.has(value.toUpperCase());
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidatedCoverageManifest(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    Object.keys(value).sort().join(",") !==
    "declarations,providerId,schemaVersion"
  ) {
    return false;
  }
  return (
    value.schemaVersion === 1 &&
    value.providerId === "qnb-egypt" &&
    Array.isArray(value.declarations) &&
    value.declarations.every(
      (declaration) =>
        qaCoverageDeclarationSchema.safeParse(declaration).success
    )
  );
}

function isValidatedImportedCandidateCatalog(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    Object.keys(value).sort().join(",") !==
    "candidates,coverageDeclarations,evidenceDomainStatus,schemaVersion,sourceExportId"
  ) {
    return false;
  }
  return (
    value.schemaVersion === 1 &&
    typeof value.sourceExportId === "string" &&
    UUID_PATTERN.test(value.sourceExportId) &&
    (value.evidenceDomainStatus === "stable" ||
      value.evidenceDomainStatus ===
        "reset_requires_manual_duplicate_review") &&
    Array.isArray(value.candidates) &&
    value.candidates.length > 0 &&
    value.candidates.every(
      (candidate) => qaCandidateArtifactSchema.safeParse(candidate).success
    ) &&
    Array.isArray(value.coverageDeclarations) &&
    value.coverageDeclarations.every(
      (declaration) =>
        qaCoverageDeclarationSchema.safeParse(declaration).success
    )
  );
}

function hasValidatedNumericContext(value: unknown): boolean {
  return (
    qaCandidateArtifactSchema.safeParse(value).success ||
    qaCandidateBundleSchema.safeParse(value).success ||
    isValidatedImportedCandidateCatalog(value) ||
    isValidatedCoverageManifest(value)
  );
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isCandidateFile(filePath: string): boolean {
  return normalizePath(filePath).startsWith(CANDIDATE_ROOT);
}

function isRuntimeParserFile(filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);
  return (
    normalizedPath.startsWith("packages/logic/src/parsers/") &&
    !normalizedPath.startsWith(CANDIDATE_ROOT) &&
    !normalizedPath.includes("/qa-sms-pattern-intake/") &&
    !normalizedPath.includes("/__tests__/") &&
    !normalizedPath.includes("/testing/")
  );
}

function isTrustedRuntimeCatalogFile(filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);
  return (
    normalizedPath.startsWith(
      "packages/logic/src/parsers/trusted-sms-patterns/"
    ) &&
    normalizedPath.endsWith(".ts") &&
    !normalizedPath.endsWith("/index.ts") &&
    !normalizedPath.endsWith("/promotion-manifest.ts")
  );
}

function collectObjectFindings(
  value: unknown,
  filePath: string,
  findings: QaSmsPrivacyFinding[],
  keyPath: readonly string[] = [],
  hasSafeNumericContext: boolean = false
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectFindings(
        item,
        filePath,
        findings,
        keyPath,
        hasSafeNumericContext
      );
    }
    return;
  }
  if (typeof value === "string") {
    if (
      !isSafeStructuredString(value, keyPath) &&
      findQaSmsFixedTextPrivacyFindings(value).length > 0
    ) {
      findings.push({ code: "raw_string_value", path: filePath });
    }
    return;
  }
  if (typeof value === "number") {
    if (!hasSafeNumericContext) {
      findings.push({ code: "raw_numeric_value", path: filePath });
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenRawKey(key)) {
      findings.push({ code: "forbidden_raw_key", path: filePath });
    }
    if (
      key === "confidenceCeiling" &&
      (typeof child !== "number" ||
        !Number.isFinite(child) ||
        child < 0 ||
        child > 1)
    ) {
      findings.push({ code: "invalid_confidence_ceiling", path: filePath });
    }
    if (key === "reviewReasons" && Array.isArray(child)) {
      if (
        child.some(
          (reason) =>
            typeof reason !== "string" || !ALLOWED_REVIEW_REASONS.has(reason)
        )
      ) {
        findings.push({ code: "invalid_review_reason", path: filePath });
      }
    }
    if (key === "runtimeScope" && child !== "candidate") {
      findings.push({ code: "invalid_runtime_scope", path: filePath });
    }
    if (key === "autoSelectPolicy" && child !== "never") {
      findings.push({ code: "invalid_auto_select_policy", path: filePath });
    }
    collectObjectFindings(
      child,
      filePath,
      findings,
      [...keyPath, key],
      hasSafeNumericContext
    );
  }
}

function scanCandidateFile(
  file: QaSmsPrivacyScanFile,
  findings: QaSmsPrivacyFinding[]
): void {
  for (const canary of RAW_VALUE_CANARIES) {
    if (file.content.includes(canary)) {
      findings.push({ code: "raw_value_canary", path: file.path });
    }
  }

  if (file.path.endsWith("/.gitkeep")) return;
  if (!file.path.endsWith(".json")) {
    if (file.path.startsWith(GENERATED_CANDIDATE_ROOT)) {
      findings.push({ code: "unexpected_candidate_file", path: file.path });
    }
    return;
  }

  try {
    const parsedJson = JSON.parse(file.content) as unknown;
    collectObjectFindings(
      parsedJson,
      file.path,
      findings,
      [],
      hasValidatedNumericContext(parsedJson)
    );
    scanCandidateArtifacts(parsedJson, file.path, findings);
  } catch {
    findings.push({ code: "candidate_json_invalid", path: file.path });
  }
}

function scanCandidateArtifacts(
  value: unknown,
  filePath: string,
  findings: QaSmsPrivacyFinding[]
): void {
  if (Array.isArray(value)) {
    for (const item of value) scanCandidateArtifacts(item, filePath, findings);
    return;
  }
  if (value === null || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if ("exportId" in record && "candidates" in record && "integrity" in record) {
    const bundle = qaCandidateBundleSchema.safeParse(record);
    if (!bundle.success) {
      findings.push({ code: "bundle_schema_invalid", path: filePath });
    } else {
      const digest = createHash("sha256")
        .update(serializeQaCandidateBundleIntegrityPayload(bundle.data), "utf8")
        .digest("hex");
      if (digest !== bundle.data.integrity.contentDigest) {
        findings.push({ code: "bundle_integrity_invalid", path: filePath });
      }
    }
  }
  if ("segments" in record) {
    scanCandidateArtifact(record, filePath, findings);
    return;
  }

  if (Array.isArray(record.candidates)) {
    for (const candidate of record.candidates) {
      scanCandidateArtifact(candidate, filePath, findings);
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "candidates") continue;
    scanCandidateArtifacts(child, filePath, findings);
  }
}

function scanCandidateArtifact(
  value: unknown,
  filePath: string,
  findings: QaSmsPrivacyFinding[]
): void {
  const candidate = qaCandidateArtifactSchema.safeParse(value);
  if (!candidate.success) {
    findings.push({ code: "candidate_schema_invalid", path: filePath });
    return;
  }
  if (!validateQaSmsCandidatePrivacy(candidate.data).isValid) {
    findings.push({ code: "candidate_privacy_invalid", path: filePath });
  }
}

export function scanQaSmsPatternPrivacy(
  files: readonly QaSmsPrivacyScanFile[]
): readonly QaSmsPrivacyFinding[] {
  const findings: QaSmsPrivacyFinding[] = [];

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (normalizedPath.startsWith(STAGING_ROOT)) {
      findings.push({
        code: "tracked_staging_artifact",
        path: normalizedPath,
      });
      continue;
    }
    if (isCandidateFile(normalizedPath)) {
      scanCandidateFile({ ...file, path: normalizedPath }, findings);
    }
    if (
      isRuntimeParserFile(normalizedPath) &&
      /(?:from\s+|(?:require|import)\s*\(\s*)["'][^"']*(?:qa-sms-pattern-candidates|qa-sms-template-evaluator|qa-sms-validation-case-runner)/.test(
        file.content
      )
    ) {
      findings.push({ code: "candidate_runtime_import", path: normalizedPath });
    }
    if (
      isTrustedRuntimeCatalogFile(normalizedPath) &&
      /\b(?:candidateId|evidenceDigest|rawSmsBody|smsFingerprint|receivedAtMs|nativeMessageId|sourceTimestamp)\b/.test(
        file.content
      )
    ) {
      findings.push({
        code: "trusted_runtime_private_metadata",
        path: normalizedPath,
      });
    }
  }

  return findings;
}

function listGitPaths(
  rootDirectory: string,
  args: readonly string[]
): readonly string[] {
  return execFileSync("git", [...args, "-z"], {
    cwd: rootDirectory,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

function isPrivacyRelevantPath(filePath: string): boolean {
  const normalizedPath = normalizePath(filePath);
  return (
    normalizedPath.startsWith(CANDIDATE_ROOT) ||
    normalizedPath.startsWith(STAGING_ROOT) ||
    isRuntimeParserFile(normalizedPath)
  );
}

function readCommittedFiles(
  rootDirectory: string
): readonly QaSmsPrivacyScanFile[] {
  try {
    return listGitPaths(rootDirectory, ["ls-tree", "-r", "--name-only", "HEAD"])
      .filter(isPrivacyRelevantPath)
      .map((filePath) => ({
        path: filePath,
        content: execFileSync("git", ["show", `HEAD:${filePath}`], {
          cwd: rootDirectory,
          encoding: "utf8",
        }),
      }));
  } catch {
    return [];
  }
}

interface QaSmsPrivacyCommitRange {
  readonly baseSha: string;
  readonly headSha: string;
}

function readConfiguredCommitRange(): QaSmsPrivacyCommitRange | null {
  const baseSha = process.env.QA_SMS_PRIVACY_BASE_SHA?.trim() ?? "";
  const headSha = process.env.QA_SMS_PRIVACY_HEAD_SHA?.trim() ?? "";
  if (baseSha.length === 0 && headSha.length === 0) return null;
  if (!/^[0-9a-f]{40}$/i.test(baseSha) || !/^[0-9a-f]{40}$/i.test(headSha)) {
    throw new Error("qa_sms_privacy_commit_range_invalid");
  }
  return { baseSha, headSha };
}

function readFileAtCommit(
  rootDirectory: string,
  commitSha: string,
  filePath: string
): QaSmsPrivacyScanFile | null {
  try {
    return {
      path: filePath,
      content: execFileSync("git", ["show", `${commitSha}:${filePath}`], {
        cwd: rootDirectory,
        encoding: "utf8",
      }),
    };
  } catch {
    return null;
  }
}

function readCommitRangeFiles(
  rootDirectory: string
): readonly QaSmsPrivacyScanFile[] {
  const range = readConfiguredCommitRange();
  if (range === null) return [];
  const commitShas = execFileSync(
    "git",
    ["rev-list", "--reverse", `${range.baseSha}..${range.headSha}`],
    { cwd: rootDirectory, encoding: "utf8" }
  )
    .split(/\r?\n/)
    .filter(Boolean);

  return commitShas.flatMap((commitSha) =>
    listGitPaths(rootDirectory, ["ls-tree", "--name-only", "-r", commitSha])
      .filter(isPrivacyRelevantPath)
      .flatMap((filePath) => {
        const file = readFileAtCommit(rootDirectory, commitSha, filePath);
        return file === null ? [] : [file];
      })
  );
}

function readWorkingTreeFiles(
  rootDirectory: string
): readonly QaSmsPrivacyScanFile[] {
  return listGitPaths(rootDirectory, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
  ])
    .filter(isPrivacyRelevantPath)
    .filter((filePath) => existsSync(path.resolve(rootDirectory, filePath)))
    .map((filePath) => ({
      path: filePath,
      content: readFileSync(path.resolve(rootDirectory, filePath), "utf8"),
    }));
}

function readPrivacyCheckFiles(
  rootDirectory: string
): readonly QaSmsPrivacyScanFile[] {
  const uniqueFiles = new Map<string, QaSmsPrivacyScanFile>();
  for (const file of [
    ...readCommitRangeFiles(rootDirectory),
    ...readCommittedFiles(rootDirectory),
    ...readWorkingTreeFiles(rootDirectory),
  ]) {
    const contentDigest = createHash("sha256")
      .update(file.content, "utf8")
      .digest("hex");
    uniqueFiles.set(`${normalizePath(file.path)}:${contentDigest}`, file);
  }
  return [...uniqueFiles.values()];
}

export function runQaSmsPatternPrivacyCheck(rootDirectory: string): void {
  const findings = scanQaSmsPatternPrivacy(
    readPrivacyCheckFiles(rootDirectory)
  );
  if (findings.length === 0) {
    process.stdout.write("QA SMS privacy check passed.\n");
    return;
  }

  for (const finding of findings) {
    process.stderr.write(`${finding.code}: ${finding.path}\n`);
  }
  throw new Error(`qa_sms_privacy_check_failed:${findings.length}`);
}

if (require.main === module) {
  runQaSmsPatternPrivacyCheck(process.cwd());
}
