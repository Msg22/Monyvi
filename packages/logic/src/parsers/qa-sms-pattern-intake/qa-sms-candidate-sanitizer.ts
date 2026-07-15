import type {
  QaDraftValidationFinding,
  QaExpectedOutcome,
  QaIntakeAuthorization,
  QaSanitizedCandidateDraft,
  QaSanitizedSegment,
  QaSmsCurrency,
  QaSmsMessageFamily,
  QaSmsPlaceholderToken,
  QaSmsSemanticRole,
} from "./qa-sms-pattern-types";

interface SanitizeQaSmsCandidateInput {
  readonly draftId: string;
  readonly body: string;
  readonly providerId: "qnb-egypt";
  readonly verifiedSenderAlias: string | null;
  readonly messageFamily: QaSmsMessageFamily | null;
  readonly currency: QaSmsCurrency;
  readonly expectedOutcome: QaExpectedOutcome | null;
  readonly evidenceDigest: string;
  readonly authorization: QaIntakeAuthorization;
}

interface QaPlaceholderCorrection {
  readonly segmentIndex: number;
  readonly token: QaSmsPlaceholderToken;
  readonly semanticRole: QaSmsSemanticRole;
}

interface ReplacementRule {
  readonly pattern: RegExp;
  readonly replace: (match: string, ...groups: string[]) => string;
}

const marker = (
  token: QaSmsPlaceholderToken,
  role: QaSmsSemanticRole
): string => `{{${token}:${role}}}`;

export function containsQaSmsCurrencyLiteral(
  value: string,
  currency: Exclude<QaSmsCurrency, null>
): boolean {
  if (currency === "USD") {
    return /(?:^|[^A-Z])USD(?=$|[^A-Z])/i.test(value);
  }
  return /(?:^|[^A-Z])EGP(?=$|[^A-Z])|(?:^|\s)(?:\u062c\.?\s*\u0645|\u062c\u0645|\u062c\u0646\u064a\u0647)(?=$|\s|[.,:])/iu.test(
    value
  );
}

function detectUnambiguousCurrency(value: string): QaSmsCurrency {
  const currencies = new Set<Exclude<QaSmsCurrency, null>>();
  if (containsQaSmsCurrencyLiteral(value, "EGP")) currencies.add("EGP");
  if (containsQaSmsCurrencyLiteral(value, "USD")) currencies.add("USD");
  return currencies.size === 1 ? [...currencies][0] : null;
}

function getAtCounterpartyMarker(value: string): string {
  const descriptor = value.trim();
  const hasExplicitAtmPrefix = /^ATM-/i.test(descriptor);
  const hasExplicitAtmMarker = /(?:^|[\s-])ATM(?=$|[\s#-]|\d)/i.test(
    descriptor
  );
  const hasTrailingTerminalCode = /(?:^|[\s-])[A-Z]*\d[A-Z0-9]*$/i.test(
    descriptor
  );
  const hasAtmTerminalIdentifier =
    hasExplicitAtmPrefix || (hasExplicitAtmMarker && hasTrailingTerminalCode);
  return hasAtmTerminalIdentifier
    ? marker("ATM_TERMINAL", "atm_terminal")
    : marker("MERCHANT", "merchant_name");
}

function normalizeDigits(value: string): string {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabic = "۰۱۲۳۴۵۶۷۸۹";
  return value
    .replace(/[٠-٩]/g, (digit) => String(arabicIndic.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(easternArabic.indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

const REPLACEMENT_RULES: readonly ReplacementRule[] = [
  {
    pattern: /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)]/gi,
    replace: () => marker("URL", "public_url"),
  },
  {
    pattern: /\b\d+(?:[.,]\d+)?\s*%/g,
    replace: () => marker("PERCENTAGE", "promotional_rate"),
  },
  {
    pattern: /(^|[^\d])((?:\+?20|0)?1[0125]\d{8})\b/g,
    replace: (_match, prefix) => `${prefix}${marker("PHONE", "phone_number")}`,
  },
  {
    pattern:
      /(\b(?:terms?\s+)?ref(?:erence)?(?:\s+(?:number|no\.?))?(?:\s+is)?\s*[:#-]?\s*)([A-Z0-9-]{4,})\b/gi,
    replace: (_match, prefix) =>
      `${prefix}${marker(
        "REFERENCE",
        /^terms?/i.test(prefix) ? "public_reference" : "transaction_reference"
      )}`,
  },
  {
    pattern: /((?:\u062a\s*\.\s*\u0636)\s*[:#-]?\s*)(\d{6,})\b/gu,
    replace: (_match, prefix) =>
      `${prefix}${marker("REFERENCE", "public_reference")}`,
  },
  {
    pattern:
      /(\b(?:otp|one[-\s]?time(?:\s+(?:password|pin))?|verification\s+code|security\s+code|pin)\s*[:#-]?\s*)(\d{4,8})\b/gi,
    replace: (_match, prefix) => `${prefix}${marker("REFERENCE", "otp_code")}`,
  },
  {
    pattern:
      /(\b(?:call|contact|hotline)\s*(?:us\s+)?(?:(?:at|on)\s+)?[:#-]?\s*)(\d{4,7})\b/gi,
    replace: (_match, prefix) =>
      `${prefix}${marker("PHONE", "provider_hotline")}`,
  },
  {
    pattern:
      /((?:\u064a\u0631\u062c\u0649\s+)?(?:\u0627\u0644\u0627\u062a\u0635\u0627\u0644|\u0627\u062a\u0635\u0644)(?:\s+\u0639\u0644\u0649)?\s*[:#-]?\s*)(\d{4,7})\b/gu,
    replace: (_match, prefix) =>
      `${prefix}${marker("PHONE", "provider_hotline")}`,
  },
  {
    pattern: /(\bfrom\s+)(\d{4})(?=\s+(?:on\s+\d{1,2}[/-]\d{1,2}\b|to\b))/gi,
    replace: (_match, prefix) =>
      `${prefix}${marker("ACCOUNT", "source_account_suffix")}`,
  },
  {
    pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    replace: () => marker("DATE", "transaction_date"),
  },
  {
    pattern: /(\bon\s+)(\d{1,2}[/-]\d{1,2})(?!\d|[/-]\d)/gi,
    replace: (_match, prefix) =>
      `${prefix}${marker("DATE", "transaction_date")}`,
  },
  {
    pattern: /\b(?:1[0-2]|0?[1-9])(?::[0-5]\d(?::[0-5]\d)?)?\s?(?:am|pm)\b/gi,
    replace: () => marker("TIME", "transaction_time"),
  },
  {
    pattern: /\b\d{1,2}:\d{2}(?::\d{2})?\b/g,
    replace: () => marker("TIME", "transaction_time"),
  },
  {
    pattern: /\b20\d{2}\b/g,
    replace: () => marker("DATE", "campaign_year"),
  },
  {
    pattern: /(\baccount\s+)([A-Z0-9-]{6,})\b/gi,
    replace: (_match, prefix) =>
      `${prefix}${marker("ACCOUNT", "account_reference")}`,
  },
  {
    pattern: /((?:\bcard|البطاقة)\s+(?:ending\s+)?[*•Xx-]*)(\d{4})\b/gi,
    replace: (_match, prefix) => `${prefix}${marker("LAST4", "card_last4")}`,
  },
  {
    pattern:
      /(\b(?:available\s+)?bal(?:ance)?\.?\s*)(?:(EGP|USD)\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\b/gi,
    replace: (_match, prefix, currency) =>
      `${prefix}${currency ? `${marker("CURRENCY", "transaction_currency")} ` : ""}${marker("BALANCE", "available_balance")}`,
  },
  {
    pattern:
      /((?:\u0645\u0628\u0644\u063a)\s*[:#-]?\s*)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\s*(\u062c\.?\s*\u0645|\u062c\u0645|\u062c\u0646\u064a\u0647)(?=$|\s|[.,])/gu,
    replace: (_match, prefix) =>
      `${prefix}${marker("AMOUNT", "transaction_amount")} ${marker("CURRENCY", "transaction_currency")}`,
  },
  {
    pattern: /\b(EGP|USD)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\b/g,
    replace: () =>
      `${marker("CURRENCY", "transaction_currency")} ${marker("AMOUNT", "transaction_amount")}`,
  },
  {
    pattern:
      /(@\s*)([A-Z0-9][A-Z0-9&*.'/_\-\s]{1,}?)(?=,\s*(?:your\s+)?(?:available\s+)?bal(?:ance)?\.?|$)/gi,
    replace: (_match, prefix, value) =>
      `${prefix}${getAtCounterpartyMarker(value)}`,
  },
  {
    pattern:
      /\b(?:at|لدى)\s+([A-Z][A-Z\s-]{2,}?)(?=\s+(?:for|phone|ref|on|بتاريخ)\b|$)/gi,
    replace: (match, value) =>
      match.replace(value, marker("MERCHANT", "merchant_name")),
  },
  {
    pattern:
      /(لدى\s+)([\p{Script=Arabic}][\p{Script=Arabic}\p{M}\s&.'’_-]{1,}?)(?=\s+(?:بتاريخ|في|مرجع|هاتف|رقم)(?:\s|$)|$)/gu,
    replace: (_match, prefix) =>
      `${prefix}${marker("MERCHANT", "merchant_name")}`,
  },
  {
    pattern:
      /\b(?:[Ff][Oo][Rr]|[Ff][Rr][Oo][Mm]|[Tt][Oo])\s+((?:\p{Lu}{2,}[\p{Lu}\p{M}'-]*)(?:\s+\p{Lu}{2,}[\p{Lu}\p{M}'-]*)+)(?=\s+(?:[Pp][Hh][Oo][Nn][Ee]|[Rr][Ee][Ff]|[Oo][Nn])\b|[.,]|$)/gu,
    replace: (match, value) =>
      match.replace(value, marker("PERSON", "counterparty_person")),
  },
  {
    pattern:
      /\b(?:[Ff][Rr][Oo][Mm]|[Tt][Oo])\s+(?![Yy]our\s+[Aa]ccount\b)((?:\p{Lu}[\p{L}\p{M}'-]*)(?:\s+\p{Lu}[\p{L}\p{M}'-]*)+)(?=\s+(?:[Pp][Hh][Oo][Nn][Ee]|[Rr][Ee][Ff]|[Oo][Nn])\b|[.,]|$)/gu,
    replace: (match, value) =>
      match.replace(value, marker("PERSON", "counterparty_person")),
  },
  {
    pattern:
      /(\b(?:from|to)\s+)(?!\u062d\u0633\u0627\u0628\u0643\b|\u0645\u062d\u0641\u0638\u062a\u0643\b)([\p{Script=Arabic}][\p{Script=Arabic}\p{M}'-]*(?:\s+[\p{Script=Arabic}][\p{Script=Arabic}\p{M}'-]*)+)(?=\s+(?:on|phone|ref)\b|[.,]|$)/giu,
    replace: (_match, prefix) =>
      `${prefix}${marker("PERSON", "counterparty_person")}`,
  },
] as const;

function toSegments(value: string): readonly QaSanitizedSegment[] {
  const markerPattern = /\{\{([A-Z0-9_]+):([a-z0-9_]+)\}\}/g;
  const segments: QaSanitizedSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(markerPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ kind: "fixed", text: value.slice(cursor, index) });
    }
    segments.push({
      kind: "placeholder",
      token: match[1] as QaSmsPlaceholderToken,
      semanticRole: match[2] as QaSmsSemanticRole,
      wasOperatorCorrected: false,
    });
    cursor = index + match[0].length;
  }
  if (cursor < value.length) {
    segments.push({ kind: "fixed", text: value.slice(cursor) });
  }
  return segments;
}

export function findQaSmsResidualDynamicFindings(
  value: string
): readonly QaDraftValidationFinding[] {
  const residualValues =
    value.match(/\b(?=[A-Z0-9.-]*\d)[A-Z0-9.-]{4,}\b/gi) ?? [];
  if (residualValues.length === 0) return [];
  const code =
    residualValues.length > 1
      ? "ambiguous_dynamic_value"
      : "unknown_dynamic_value";
  return [
    {
      code,
      severity: "blocking",
      segmentIndex: null,
      messageKey: `qaSmsIntake.privacy.${code}`,
      semanticRole: null,
    },
  ];
}

export function sanitizeQaSmsCandidate(
  input: SanitizeQaSmsCandidateInput
): QaSanitizedCandidateDraft {
  const currency =
    input.currency ??
    (input.messageFamily === null
      ? detectUnambiguousCurrency(input.body)
      : null);
  let sanitized = normalizeDigits(input.body).replace(/\s+/g, " ").trim();
  for (const rule of REPLACEMENT_RULES) {
    sanitized = sanitized.replace(rule.pattern, rule.replace);
  }
  const findings = findQaSmsResidualDynamicFindings(
    sanitized.replace(/\{\{[^}]+\}\}/g, "")
  );

  return {
    draftId: input.draftId,
    verifiedSenderAlias: input.verifiedSenderAlias,
    providerId: input.providerId,
    messageFamily: input.messageFamily,
    currency,
    expectedOutcome: input.expectedOutcome,
    classificationStatus:
      input.messageFamily === null ? "pending" : "confirmed",
    segments: toSegments(sanitized),
    evidenceDigest: input.evidenceDigest,
    authorization: input.authorization,
    validationFindings: findings,
    status: findings.length > 0 ? "blocked" : "draft",
  };
}

export function applyQaPlaceholderCorrection(
  draft: QaSanitizedCandidateDraft,
  correction: QaPlaceholderCorrection
): QaSanitizedCandidateDraft {
  const target = draft.segments[correction.segmentIndex];
  if (!target || target.kind !== "placeholder") {
    throw new Error("invalid_placeholder_correction");
  }
  const segments = draft.segments.map((segment, index) =>
    index === correction.segmentIndex
      ? {
          kind: "placeholder" as const,
          token: correction.token,
          semanticRole: correction.semanticRole,
          wasOperatorCorrected: true,
        }
      : segment
  );
  return {
    ...draft,
    segments,
    validationFindings: [],
    status: "draft",
  };
}
