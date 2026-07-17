import { MAX_TRANSACTION_AMOUNT } from "../utils/amount-helpers";
import type {
  TrustedSmsExtractedValue,
  TrustedSmsPattern,
  TrustedSmsPlaceholderRole,
  TrustedSmsTemplateCandidate,
  TrustedSmsTemplateResult,
} from "./trusted-sms-pattern-types";

interface MatchTrustedSmsTemplateInput {
  readonly candidate: TrustedSmsTemplateCandidate;
  readonly patterns: readonly TrustedSmsPattern[];
  readonly supportedCurrencies: readonly string[];
  readonly includeDisabledPatterns?: boolean;
}

interface StructuralMatch {
  readonly pattern: TrustedSmsPattern;
  readonly extractedValues: readonly TrustedSmsExtractedValue[];
}

interface EvaluatedMatch extends StructuralMatch {
  readonly validation: "valid" | "malformed" | "unsupported_currency";
}

const COMPILED_PATTERN_CACHE = new WeakMap<TrustedSmsPattern, RegExp>();

interface CompiledPlaceholderMarker {
  readonly marker: string;
  readonly captureSource: string;
}

function normalizeBody(body: string): string {
  return body
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSender(sender: string): string {
  return sender.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCompiledPattern(pattern: TrustedSmsPattern): RegExp {
  const cached = COMPILED_PATTERN_CACHE.get(pattern);
  if (cached !== undefined) return cached;
  let placeholderIndex = 0;
  const markers: CompiledPlaceholderMarker[] = [];
  const template = pattern.segments
    .map((segment) => {
      if (segment.kind === "fixed") return segment.text;
      const marker = `\uE000${placeholderIndex}\uE001`;
      placeholderIndex += 1;
      const captureSource =
        segment.semanticRole === "transaction_currency" &&
        pattern.currency !== null
          ? `(${escapeRegExp(pattern.currency)})`
          : "(.+?)";
      markers.push({ marker, captureSource });
      return marker;
    })
    .join("");
  let source = escapeRegExp(normalizeBody(template));
  for (const { marker, captureSource } of markers) {
    source = source.replace(marker, captureSource);
  }
  const compiled = new RegExp(`^${source}$`);
  COMPILED_PATTERN_CACHE.set(pattern, compiled);
  return compiled;
}

function senderMatches(sender: string, aliases: readonly string[]): boolean {
  const normalizedSender = normalizeSender(sender);
  return aliases.some((alias) => normalizeSender(alias) === normalizedSender);
}

function structuralMatch(
  candidate: TrustedSmsTemplateCandidate,
  pattern: TrustedSmsPattern,
  includeDisabledPatterns: boolean
): StructuralMatch | null {
  if (
    (!pattern.enabled && !includeDisabledPatterns) ||
    !senderMatches(candidate.sender, pattern.verifiedSenderAliases)
  ) {
    return null;
  }
  const match = getCompiledPattern(pattern).exec(normalizeBody(candidate.body));
  if (match === null) return null;
  const captures = match.slice(1);
  if (captures.some((value) => value !== value.trim())) return null;
  let captureIndex = 1;
  const extractedValues = pattern.segments.flatMap<TrustedSmsExtractedValue>(
    (segment) => {
      if (segment.kind === "fixed") return [];
      const value = match[captureIndex] ?? "";
      captureIndex += 1;
      return [
        { token: segment.token, semanticRole: segment.semanticRole, value },
      ];
    }
  );
  const structural = { pattern, extractedValues };
  return hasCompatibleSemanticValues(structural) ? structural : null;
}

function valuesForRole(
  match: StructuralMatch,
  role: TrustedSmsPlaceholderRole
): readonly string[] {
  return match.extractedValues
    .filter(({ semanticRole }) => semanticRole === role)
    .map(({ value }) => value);
}

function hasAtmTerminalMarker(value: string): boolean {
  return /(?:^|[\s-])ATM(?:[\s-]|\d|$)/i.test(value);
}

function hasCompatibleSemanticValues(match: StructuralMatch): boolean {
  return match.extractedValues.every(({ semanticRole, value }) => {
    if (semanticRole === "atm_terminal") return hasAtmTerminalMarker(value);
    if (semanticRole === "merchant_name") return !hasAtmTerminalMarker(value);
    return true;
  });
}

function isNumeric(value: string, allowNegative: boolean = false): boolean {
  const normalized = value.replaceAll(",", "");
  const numberPattern = allowNegative ? /^-?\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?$/;
  return numberPattern.test(normalized) && Number.isFinite(Number(normalized));
}

function isValidTransactionDate(value: string): boolean {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(value);
  if (match === null) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] === undefined ? 2000 : Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isValidTransactionTime(value: string): boolean {
  const match = /^(\d{1,2}):(\d{2})(?:\s(AM|PM))?$/.exec(value);
  if (match === null) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return false;
  return match[3] === undefined
    ? hour >= 0 && hour <= 23
    : hour >= 1 && hour <= 12;
}

function areValuesValid(
  role: TrustedSmsPlaceholderRole,
  values: readonly string[]
): boolean {
  if (values.some((value) => value.length === 0)) return false;
  switch (role) {
    case "transaction_amount":
      return values.every((value) => {
        const amount = Number(value.replaceAll(",", ""));
        return (
          isNumeric(value) && amount > 0 && amount <= MAX_TRANSACTION_AMOUNT
        );
      });
    case "available_balance":
      return values.every((value) => isNumeric(value, true));
    case "transaction_currency":
      return values.every((value) => value === "EGP" || value === "USD");
    case "card_last4":
      return values.every((value) => /^\d{4}$/.test(value));
    case "transaction_date":
      return values.every(isValidTransactionDate);
    case "transaction_time":
      return values.every(isValidTransactionTime);
    case "phone_number":
    case "provider_hotline":
      return values.every((value) => /^\+?[\d\s-]{5,20}$/.test(value));
    case "promotional_rate":
      return values.every((value) => /^\d+(?:\.\d+)?%?$/.test(value));
    case "campaign_year":
      return values.every((value) => /^\d{4}$/.test(value));
    case "public_url":
      return values.every((value) => /^https?:\/\/\S+$/.test(value));
    default:
      return true;
  }
}

function evaluateMatch(
  match: StructuralMatch,
  supportedCurrencies: ReadonlySet<string>
): EvaluatedMatch | null {
  if (match.pattern.expectedOutcome.kind === "rejection") {
    return { ...match, validation: "valid" };
  }
  const currencyValues = valuesForRole(match, "transaction_currency");
  if (
    currencyValues.length === 0 ||
    new Set(currencyValues).size !== 1 ||
    currencyValues[0] !== match.pattern.currency
  ) {
    return null;
  }
  const groupedValues = new Map<TrustedSmsPlaceholderRole, string[]>();
  for (const extracted of match.extractedValues) {
    const values = groupedValues.get(extracted.semanticRole) ?? [];
    groupedValues.set(extracted.semanticRole, [...values, extracted.value]);
  }
  if (
    [...groupedValues].some(([role, values]) => !areValuesValid(role, values))
  ) {
    return { ...match, validation: "malformed" };
  }
  if (currencyValues.some((currency) => !supportedCurrencies.has(currency))) {
    return { ...match, validation: "unsupported_currency" };
  }
  return { ...match, validation: "valid" };
}

export function matchTrustedSmsTemplate(
  input: MatchTrustedSmsTemplateInput
): TrustedSmsTemplateResult {
  const supportedCurrencies = new Set(
    input.supportedCurrencies.map((currency) => currency.toUpperCase())
  );
  const evaluated = input.patterns.flatMap((pattern) => {
    const structural = structuralMatch(
      input.candidate,
      pattern,
      input.includeDisabledPatterns === true
    );
    if (structural === null) return [];
    const result = evaluateMatch(structural, supportedCurrencies);
    return result === null ? [] : [result];
  });
  const valid = evaluated.filter(({ validation }) => validation === "valid");
  if (valid.length > 1) {
    return {
      status: "ambiguous",
      patternIds: valid.map(({ pattern }) => pattern.patternId).sort(),
    };
  }
  const resolved = valid[0];
  if (resolved !== undefined) {
    if (resolved.pattern.expectedOutcome.kind === "rejection") {
      return {
        status: "rejected",
        patternId: resolved.pattern.patternId,
        reason: resolved.pattern.expectedOutcome.reason,
      };
    }
    return {
      status: "matched",
      pattern: resolved.pattern,
      extractedValues: resolved.extractedValues,
    };
  }
  const invalid = evaluated.filter(({ validation }) => validation !== "valid");
  if (invalid.length > 0) {
    const isUnsupported = invalid.every(
      ({ validation }) => validation === "unsupported_currency"
    );
    return {
      status: "unresolved",
      reason: isUnsupported ? "unsupported_currency" : "malformed_value",
      patternIds: invalid.map(({ pattern }) => pattern.patternId).sort(),
    };
  }
  return { status: "unresolved", reason: "no_match", patternIds: [] };
}

export type { MatchTrustedSmsTemplateInput };
