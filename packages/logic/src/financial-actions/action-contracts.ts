import {
  DEFAULT_FINANCIAL_ACTION_REGISTRY,
  MAX_CANONICAL_ACTION_UTF8_BYTES,
  getFinancialActionUtf8ByteLength,
  type FinancialActionRegistry,
  type RegisteredActionPayload,
} from "./action-registry";

export const FINANCIAL_ACTION_ERROR_CODES = {
  INVALID_JSON: "financial_action_invalid_json",
  DUPLICATE_KEY: "financial_action_duplicate_key",
  INVALID_ENVELOPE: "financial_action_invalid_envelope",
  INVALID_PAYLOAD: "financial_action_invalid_payload",
  INVALID_STRING: "financial_action_invalid_string",
  UNSUPPORTED_VALUE: "financial_action_unsupported_value",
  INVALID_HASH: "financial_action_invalid_hash",
  INVALID_TRANSITION: "financial_action_invalid_transition",
  INVALID_STATE_EVIDENCE: "financial_action_invalid_state_evidence",
  IMMUTABLE_OUTCOME_EVIDENCE: "financial_action_immutable_outcome_evidence",
  PAYLOAD_TOO_LARGE: "financial_action_payload_too_large",
} as const;

export const FINANCIAL_ACTION_STATES = [
  "pending_local",
  "local_complete",
  "sync_pending",
  "sync_failed",
  "accepted",
  "rejected_compensating",
  "reconciled",
  "reconciliation_incomplete",
] as const;

export const SERVER_OUTCOMES = [
  "accepted",
  "idempotent",
  "stale",
  "rejected",
] as const;

export type FinancialActionState = (typeof FINANCIAL_ACTION_STATES)[number];
export type FinancialActionServerOutcome = (typeof SERVER_OUTCOMES)[number];
declare const canonicalUnsignedIntegerStringBrand: unique symbol;
export type CanonicalUnsignedIntegerString = string & {
  readonly [canonicalUnsignedIntegerStringBrand]: true;
};
export interface FinancialActionAccountGuard {
  readonly accountId: string;
  readonly expectedRevision: CanonicalUnsignedIntegerString;
}
export type FinancialActionDomain =
  | "metals"
  | "transactions"
  | "transfers"
  | "recurring_payments"
  | "sms";

export interface FinancialActionEnvelopeV1<
  TPayload extends RegisteredActionPayload = RegisteredActionPayload,
> {
  readonly actionId: string;
  readonly accountGuards: readonly FinancialActionAccountGuard[];
  readonly domain: FinancialActionDomain;
  readonly domainReferenceId: string;
  readonly envelopeVersion: "monyvi.financial-action/v1";
  readonly kind: string;
  readonly occurredAt: string;
  readonly payload: TPayload;
  readonly payloadVersion: string;
  readonly userId: string;
}

export interface Sha256Provider {
  readonly digestUtf8: (canonicalText: string) => Promise<string>;
}

export interface FinancialActionHashResult {
  readonly canonicalText: string;
  readonly payloadHash: string;
}

export interface StoredFinancialActionOutcome {
  readonly serverOutcome: FinancialActionServerOutcome;
  readonly outcomeJson: string;
}

export interface FinancialActionStateEvidence {
  readonly serverOutcome: FinancialActionServerOutcome | null;
  readonly outcomeJson: string | null;
  readonly rejectionCode: string | null;
}

export type FinancialActionReplayResult =
  | {
      readonly kind: "replay";
      readonly outcome: StoredFinancialActionOutcome;
    }
  | {
      readonly kind: "rejected";
      readonly reasonCode: "action_id_payload_mismatch";
    };

const ENVELOPE_KEYS = [
  "accountGuards",
  "actionId",
  "domain",
  "domainReferenceId",
  "envelopeVersion",
  "kind",
  "occurredAt",
  "payload",
  "payloadVersion",
  "userId",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STABLE_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type JsonPrimitive = string | boolean | null;
interface CanonicalJsonObject {
  readonly [key: string]: CanonicalJsonValue;
}
type CanonicalJsonArray = readonly CanonicalJsonValue[];
type CanonicalJsonValue =
  | JsonPrimitive
  | CanonicalJsonArray
  | CanonicalJsonObject;

const APPROVED_DOMAINS: readonly FinancialActionDomain[] = [
  "metals",
  "transactions",
  "transfers",
  "recurring_payments",
  "sms",
];

const ALLOWED_TRANSITIONS: Readonly<
  Record<FinancialActionState, readonly FinancialActionState[]>
> = {
  pending_local: ["local_complete", "reconciliation_incomplete"],
  local_complete: ["sync_pending", "reconciliation_incomplete"],
  sync_pending: [
    "sync_failed",
    "accepted",
    "rejected_compensating",
    "reconciliation_incomplete",
  ],
  sync_failed: ["sync_pending", "reconciliation_incomplete"],
  accepted: [],
  rejected_compensating: ["reconciled", "reconciliation_incomplete"],
  reconciled: [],
  reconciliation_incomplete: ["accepted", "rejected_compensating"],
};

function fail(code: string): never {
  throw new Error(code);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function assertSupportedContainer(value: object): void {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries = Object.entries(descriptors).filter(
    ([key]) => !Array.isArray(value) || key !== "length"
  );
  entries.forEach(([key, descriptor]) => {
    if (Array.isArray(value) && !/^(?:0|[1-9][0-9]*)$/.test(key)) {
      fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
    }
    if (!descriptor.enumerable || !("value" in descriptor)) {
      fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
    }
  });
}

function assertValidString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit === 0) fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_STRING);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_STRING);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_STRING);
    }
  }
}

function inspectRuntimeValue(
  value: unknown,
  ancestors: ReadonlySet<object> = new Set()
): void {
  if (typeof value === "string") {
    assertValidString(value);
    return;
  }
  if (typeof value === "boolean" || typeof value === "number" || value === null)
    return;
  if (typeof value !== "object") {
    fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
  }
  assertSupportedContainer(value);
  if (ancestors.has(value)) {
    fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
      }
      inspectRuntimeValue(value[index], nextAncestors);
    }
    return;
  }
  Object.entries(value).forEach(([key, entryValue]) => {
    if (!/^[\x20-\x7e]+$/.test(key)) {
      fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
    }
    inspectRuntimeValue(entryValue, nextAncestors);
  });
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[]
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isStrictUtcMillisecondTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_MILLISECOND_PATTERN.test(value)) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  if (year < 1) return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

export function canonicalizeFinancialActionEnvelope(
  value: unknown,
  registry: FinancialActionRegistry = DEFAULT_FINANCIAL_ACTION_REGISTRY
): FinancialActionEnvelopeV1 {
  inspectRuntimeValue(value);
  if (!isPlainObject(value) || !hasExactKeys(value, ENVELOPE_KEYS)) {
    fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE);
  }
  if (
    !isCanonicalUuid(value.actionId) ||
    !Array.isArray(value.accountGuards) ||
    value.accountGuards.length !== 0 ||
    typeof value.domain !== "string" ||
    !APPROVED_DOMAINS.includes(value.domain as FinancialActionDomain) ||
    !isCanonicalUuid(value.domainReferenceId) ||
    value.envelopeVersion !== "monyvi.financial-action/v1" ||
    typeof value.kind !== "string" ||
    value.kind.trim().length === 0 ||
    !isStrictUtcMillisecondTimestamp(value.occurredAt) ||
    typeof value.payloadVersion !== "string" ||
    value.payloadVersion.trim().length === 0 ||
    !isCanonicalUuid(value.userId)
  ) {
    fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_ENVELOPE);
  }
  const payload = registry
    .resolve(value.domain, value.kind, value.payloadVersion)
    .validatePayload(value.payload);
  inspectRuntimeValue(payload);
  if (containsNumber(payload)) {
    fail(FINANCIAL_ACTION_ERROR_CODES.UNSUPPORTED_VALUE);
  }
  return {
    accountGuards: Object.freeze([]),
    actionId: value.actionId,
    domain: value.domain as FinancialActionDomain,
    domainReferenceId: value.domainReferenceId,
    envelopeVersion: value.envelopeVersion,
    kind: value.kind,
    occurredAt: value.occurredAt,
    payload,
    payloadVersion: value.payloadVersion,
    userId: value.userId,
  };
}

function escapeJsonString(value: string): string {
  let result = '"';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    switch (character) {
      case '"':
        result += '\\"';
        break;
      case "\\":
        result += "\\\\";
        break;
      case "\b":
        result += "\\b";
        break;
      case "\f":
        result += "\\f";
        break;
      case "\n":
        result += "\\n";
        break;
      case "\r":
        result += "\\r";
        break;
      case "\t":
        result += "\\t";
        break;
      default:
        result +=
          codePoint >= 1 && codePoint <= 0x1f
            ? `\\u${codePoint.toString(16).padStart(4, "0")}`
            : character;
    }
  }
  return `${result}"`;
}

function serializeCanonicalValue(value: CanonicalJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return escapeJsonString(value);
  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalValue).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${escapeJsonString(key)}:${serializeCanonicalValue(
          (value as Readonly<Record<string, CanonicalJsonValue>>)[
            key
          ] as CanonicalJsonValue
        )}`
    )
    .join(",")}}`;
}

export function serializeFinancialActionEnvelope(
  value: unknown,
  registry: FinancialActionRegistry = DEFAULT_FINANCIAL_ACTION_REGISTRY
): string {
  const envelope = canonicalizeFinancialActionEnvelope(value, registry);
  const canonicalText = serializeCanonicalValue(
    envelope as unknown as CanonicalJsonValue
  );
  if (
    getFinancialActionUtf8ByteLength(canonicalText) >
    MAX_CANONICAL_ACTION_UTF8_BYTES
  ) {
    fail(FINANCIAL_ACTION_ERROR_CODES.PAYLOAD_TOO_LARGE);
  }
  return canonicalText;
}

function skipWhitespace(rawText: string, start: number): number {
  let index = start;
  while (/\s/.test(rawText[index] ?? "")) index += 1;
  return index;
}

function scanStringEnd(rawText: string, start: number): number {
  let index = start + 1;
  while (index < rawText.length) {
    if (rawText[index] === "\\") {
      index += 2;
      continue;
    }
    if (rawText[index] === '"') return index + 1;
    index += 1;
  }
  fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
}

function scanValue(rawText: string, start: number): number {
  let index = skipWhitespace(rawText, start);
  if (rawText[index] === '"') return scanStringEnd(rawText, index);
  if (rawText[index] === "[") {
    index = skipWhitespace(rawText, index + 1);
    if (rawText[index] === "]") return index + 1;
    while (index < rawText.length) {
      index = skipWhitespace(rawText, scanValue(rawText, index));
      if (rawText[index] === "]") return index + 1;
      if (rawText[index] !== ",")
        fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
      index = skipWhitespace(rawText, index + 1);
    }
  }
  if (rawText[index] === "{") {
    const keys = new Set<string>();
    index = skipWhitespace(rawText, index + 1);
    if (rawText[index] === "}") return index + 1;
    while (index < rawText.length) {
      if (rawText[index] !== '"')
        fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
      const keyEnd = scanStringEnd(rawText, index);
      const key = JSON.parse(rawText.slice(index, keyEnd)) as unknown;
      if (typeof key !== "string")
        fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
      if (keys.has(key)) fail(FINANCIAL_ACTION_ERROR_CODES.DUPLICATE_KEY);
      keys.add(key);
      index = skipWhitespace(rawText, keyEnd);
      if (rawText[index] !== ":")
        fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
      index = skipWhitespace(rawText, scanValue(rawText, index + 1));
      if (rawText[index] === "}") return index + 1;
      if (rawText[index] !== ",")
        fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
      index = skipWhitespace(rawText, index + 1);
    }
  }
  while (index < rawText.length && !/[\s,\]}]/.test(rawText[index] ?? "")) {
    index += 1;
  }
  return index;
}

function assertNoDuplicateJsonKeys(rawText: string): void {
  const end = skipWhitespace(rawText, scanValue(rawText, 0));
  if (end !== rawText.length) fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
}

export function parseFinancialActionEnvelopeJson(
  rawText: string,
  registry: FinancialActionRegistry = DEFAULT_FINANCIAL_ACTION_REGISTRY
): FinancialActionEnvelopeV1 {
  if (
    getFinancialActionUtf8ByteLength(rawText) > MAX_CANONICAL_ACTION_UTF8_BYTES
  ) {
    fail(FINANCIAL_ACTION_ERROR_CODES.PAYLOAD_TOO_LARGE);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_JSON);
  }
  assertNoDuplicateJsonKeys(rawText);
  return canonicalizeFinancialActionEnvelope(parsed, registry);
}

export async function hashFinancialActionEnvelope(
  value: unknown,
  provider: Sha256Provider,
  registry: FinancialActionRegistry = DEFAULT_FINANCIAL_ACTION_REGISTRY
): Promise<FinancialActionHashResult> {
  const canonicalText = serializeFinancialActionEnvelope(value, registry);
  const payloadHash = await provider.digestUtf8(canonicalText);
  if (!SHA256_PATTERN.test(payloadHash)) {
    fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_HASH);
  }
  return { canonicalText, payloadHash };
}

export function resolveFinancialActionReplay(
  storedCanonicalText: string,
  storedPayloadHash: string,
  candidateCanonicalText: string,
  candidatePayloadHash: string,
  storedOutcome: StoredFinancialActionOutcome
): FinancialActionReplayResult {
  if (
    storedCanonicalText === candidateCanonicalText &&
    storedPayloadHash === candidatePayloadHash
  ) {
    return { kind: "replay", outcome: storedOutcome };
  }
  return { kind: "rejected", reasonCode: "action_id_payload_mismatch" };
}

function containsNumber(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.some(containsNumber);
  if (isPlainObject(value)) return Object.values(value).some(containsNumber);
  return false;
}

function isCanonicalOutcomeJson(rawText: string): boolean {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    assertNoDuplicateJsonKeys(rawText);
    inspectRuntimeValue(parsed);
    if (containsNumber(parsed)) return false;
    return serializeCanonicalValue(parsed as CanonicalJsonValue) === rawText;
  } catch {
    return false;
  }
}

function hasStableRejectionCode(value: string | null): value is string {
  return typeof value === "string" && STABLE_ERROR_CODE_PATTERN.test(value);
}

export function assertFinancialActionTransition(
  from: FinancialActionState,
  to: FinancialActionState
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_TRANSITION);
  }
}

export function assertFinancialActionStateEvidence(
  state: FinancialActionState,
  evidence: FinancialActionStateEvidence
): void {
  const hasOutcome = evidence.serverOutcome !== null;
  const hasOutcomeJson = evidence.outcomeJson !== null;
  const outcomePairIsValid = hasOutcome === hasOutcomeJson;
  const hasKnownOutcome =
    evidence.serverOutcome !== null &&
    SERVER_OUTCOMES.includes(evidence.serverOutcome);
  const hasCanonicalOutcome =
    evidence.outcomeJson !== null &&
    isCanonicalOutcomeJson(evidence.outcomeJson);
  let isValid = false;

  if (["pending_local", "local_complete", "sync_pending"].includes(state)) {
    isValid = !hasOutcome && !hasOutcomeJson && evidence.rejectionCode === null;
  } else if (state === "sync_failed") {
    isValid =
      !hasOutcome &&
      !hasOutcomeJson &&
      hasStableRejectionCode(evidence.rejectionCode);
  } else if (state === "accepted") {
    isValid =
      (evidence.serverOutcome === "accepted" ||
        evidence.serverOutcome === "idempotent") &&
      hasCanonicalOutcome &&
      evidence.rejectionCode === null;
  } else if (state === "rejected_compensating" || state === "reconciled") {
    isValid =
      (evidence.serverOutcome === "stale" ||
        evidence.serverOutcome === "rejected") &&
      hasCanonicalOutcome &&
      hasStableRejectionCode(evidence.rejectionCode);
  } else if (state === "reconciliation_incomplete") {
    isValid =
      outcomePairIsValid &&
      hasStableRejectionCode(evidence.rejectionCode) &&
      (!hasOutcome || (hasKnownOutcome && hasCanonicalOutcome));
  }

  if (!isValid) fail(FINANCIAL_ACTION_ERROR_CODES.INVALID_STATE_EVIDENCE);
}

export function assertFinancialActionEvidenceTransition(
  fromState: FinancialActionState,
  fromEvidence: FinancialActionStateEvidence,
  toState: FinancialActionState,
  toEvidence: FinancialActionStateEvidence
): void {
  assertFinancialActionTransition(fromState, toState);
  assertFinancialActionStateEvidence(fromState, fromEvidence);
  assertFinancialActionStateEvidence(toState, toEvidence);

  if (fromEvidence.serverOutcome === null) return;

  const hasSameOutcome =
    toEvidence.serverOutcome === fromEvidence.serverOutcome &&
    toEvidence.outcomeJson === fromEvidence.outcomeJson;
  const mayFinalizeAcceptedReconciliation =
    fromState === "reconciliation_incomplete" &&
    toState === "accepted" &&
    (fromEvidence.serverOutcome === "accepted" ||
      fromEvidence.serverOutcome === "idempotent") &&
    hasSameOutcome &&
    toEvidence.rejectionCode === null;

  if (mayFinalizeAcceptedReconciliation) return;

  if (
    !hasSameOutcome ||
    toEvidence.rejectionCode !== fromEvidence.rejectionCode
  ) {
    fail(FINANCIAL_ACTION_ERROR_CODES.IMMUTABLE_OUTCOME_EVIDENCE);
  }
}
