import {
  QA_SMS_PLACEHOLDER_TOKENS,
  type QaCandidateArtifact,
  type QaPrivacyFindingCode,
  type QaPrivacyValidationFinding,
  type QaPrivacyValidationResult,
} from "./qa-sms-pattern-types";

interface PrivacyRule {
  readonly code: QaPrivacyFindingCode;
  readonly pattern: RegExp;
}

const PRIVACY_RULES: readonly PrivacyRule[] = [
  {
    code: "raw_phone_value",
    pattern: /(?:^|[^\d])(?:\+?20[\s-]?)?0?1[0125](?:[\s-]?\d){8}\b/,
  },
  { code: "raw_date_value", pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/ },
  {
    code: "raw_date_value",
    pattern:
      /\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4}\b/i,
  },
  {
    code: "raw_time_value",
    pattern:
      /\b(?:(?:1[0-2]|0?[1-9])(?::[0-5]\d(?::[0-5]\d)?)?\s?(?:am|pm)|\d{1,2}:\d{2}(?::\d{2})?)\b/i,
  },
  {
    code: "raw_counterparty_value",
    pattern: /\b(?:merchant|transfer (?:from|to))\s+[A-Z][A-Z\s-]{3,}\b/i,
  },
  {
    code: "raw_counterparty_value",
    pattern:
      /\bat\s+[A-Z0-9][A-Z0-9&*.'/_\-\s]{2,}?(?=\s+(?:for|on|ref(?:erence)?|phone)\b|\s*$)/i,
  },
  {
    code: "raw_counterparty_value",
    pattern:
      /@\s*[A-Z0-9][A-Z0-9&*.'/_\-\s]{1,}?(?=,\s*(?:your\s+)?(?:available\s+)?bal(?:ance)?\b|$)/i,
  },
  {
    code: "raw_counterparty_value",
    pattern:
      /\b(?:[Ff][Rr][Oo][Mm]|[Tt][Oo])\s+(?![Yy]our\s+[Aa]ccount\b)\p{Lu}[\p{L}\p{M}'-]*(?:\s+\p{Lu}[\p{L}\p{M}'-]*)*(?=\s+(?:[Pp][Hh][Oo][Nn][Ee]|[Rr][Ee][Ff]|[Oo][Nn]|[Ff][Aa][Ii][Ll][Ee][Dd])\b|[.,]|$)/u,
  },
  {
    code: "raw_counterparty_value",
    pattern:
      /لدى\s+[\p{Script=Arabic}][\p{Script=Arabic}\p{M}\s&.'’_-]{1,}?(?=\s+(?:بتاريخ|في|مرجع|هاتف|رقم)(?:\s|$)|$)/u,
  },
  {
    code: "raw_counterparty_value",
    pattern:
      /(?:\u0625\u0644\u0649|\u0627\u0644\u0649|\u0645\u0646)\s+(?!(?:\u062d\u0633\u0627\u0628(?:\u0643|\u064a|\u0647|\u0647\u0627|\u0646\u0627)?|\u0645\u062d\u0641\u0638\u062a(?:\u0643|\u064a|\u0647|\u0647\u0627|\u0646\u0627)?|\u062e\u0644\u0627\u0644|\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a|\u0645\u0639\u0644\u0648\u0645\u0627\u062a|\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644|\u062a\u0641\u0627\u0635\u064a\u0644|\u0628\u0637\u0627\u0642\u0629\s+\u0627\u0644\u0631\u0642\u0645\s+\u0627\u0644\u0642\u0648\u0645\u064a|\u0627\u0644\u0631\u0642\u0645\s+\u0627\u0644\u0645\u062d\u0645\u0648\u0644)(?:\s|$))[\p{Script=Arabic}][\p{Script=Arabic}\p{M}\s&.'’_-]{1,}?(?=\s+(?:\u0628\u062a\u0627\u0631\u064a\u062e|\u0641\u064a|\u0645\u0631\u062c\u0639|\u0647\u0627\u062a\u0641|\u0631\u0642\u0645)(?:\s|$)|[.,]|$)/u,
  },
  {
    code: "raw_email_value",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    code: "raw_identifier_value",
    pattern:
      /\bref(?:erence)?(?:(?:\s+(?:number|no\.?))?(?:\s+is)?\s*[:#-]|(?:\s+(?:number|no\.?))(?:\s+is)?|\s+is)\s*[A-Z0-9-]{4,}\b/i,
  },
  {
    code: "raw_identifier_value",
    pattern: /\bref(?:erence)?\s+(?!(?:number|no\.?|is)\b)[A-Z0-9-]{4,}\b/i,
  },
  {
    code: "raw_identifier_value",
    pattern:
      /\b(?:account|card)(?:\s+(?:number|no\.?|ending|reference|ref))?\s*[:#-]?\s*\d(?:[\s-]?\d){5,}\b/i,
  },
  {
    code: "raw_identifier_value",
    pattern: /\b(?=[A-Z0-9-]*\d)[A-Z]{1,5}-?[A-Z0-9]{6,}\b/i,
  },
  {
    code: "raw_numeric_value",
    pattern:
      /\b(?:amount|balance|bal)\b(?:\s+of)?\s*[.:]?\s*(?:(?:EGP|USD)\s*)?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?\b/i,
  },
  {
    code: "raw_numeric_value",
    pattern:
      /(?:\b(?:EGP|USD)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\b|\b(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s+(?:EGP|USD)\b|\b\d{4,}\b|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|[٠-٩۰-۹]{4,}|[٠-٩۰-۹]{1,3}(?:[٬,][٠-٩۰-۹]{3})*(?:[٫.][٠-٩۰-۹]{2}))/i,
  },
] as const;

const VERIFIED_QNB_ALIASES = new Set(["QNB", "QNB ALAHLI", "QNB EGYPT"]);
const KNOWN_TOKENS = new Set<string>(QA_SMS_PLACEHOLDER_TOKENS);

function normalizeLocalizedNumbers(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x0660)
    )
    .replace(/[\u06f0-\u06f9]/g, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0)
    )
    .replaceAll("\u066b", ".")
    .replaceAll("\u066c", ",");
}

function finding(
  code: QaPrivacyFindingCode,
  segmentIndex: number | null
): QaPrivacyValidationFinding {
  return {
    code,
    severity: "blocking",
    segmentIndex,
    messageKey: `qaSmsIntake.privacy.${code}`,
  };
}

export function findQaSmsFixedTextPrivacyFindings(
  value: string,
  segmentIndex: number | null = null
): readonly QaPrivacyValidationFinding[] {
  const normalizedText = normalizeLocalizedNumbers(value);
  return PRIVACY_RULES.flatMap((rule) =>
    rule.pattern.test(normalizedText) ? [finding(rule.code, segmentIndex)] : []
  );
}

export function validateQaSmsCandidatePrivacy(
  candidate: QaCandidateArtifact
): QaPrivacyValidationResult {
  const findings: QaPrivacyValidationFinding[] = [];

  if (!VERIFIED_QNB_ALIASES.has(candidate.verifiedSenderAlias.toUpperCase())) {
    findings.push(finding("unverified_sender", null));
  }

  candidate.segments.forEach((segment, segmentIndex) => {
    if (segment.kind === "placeholder") {
      if (!KNOWN_TOKENS.has(segment.token)) {
        findings.push(finding("unknown_token", segmentIndex));
      }
      return;
    }

    findings.push(
      ...findQaSmsFixedTextPrivacyFindings(segment.text, segmentIndex)
    );
  });

  return { isValid: findings.length === 0, findings };
}
