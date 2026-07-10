# Data Model: Local Intelligent Parser

No database schema changes are planned. The entities below are TypeScript domain
contracts and source-controlled catalog data.

## Parsing Request

Represents one candidate financial SMS after existing sender/body filtering and
fingerprint calculation.

Fields:

- `messageId`: stable parser-session identifier, not a persistence key.
- `body`: raw SMS body, used only in memory during parsing.
- `sender`: SMS sender/provider display name, used only in memory.
- `receivedAtMs`: received timestamp in milliseconds.
- `smsFingerprint`: existing sender/body/time deduplication key.
- `supportedCurrencies`: currency codes accepted by the app.
- `categories`: category sources used to resolve `categorySystemName` to an ID.

Validation rules:

- `body`, `sender`, and `smsFingerprint` must be non-empty.
- `receivedAtMs` must be a finite timestamp.
- Request data must not be logged verbatim.

## Supported Message Pattern

Source-controlled definition for one provider/template shape.

Fields:

- `id`: stable lowercase identifier for tests and diagnostics.
- `provider`: normalized sender/provider name.
- `runtimeScope`: `dev_test`, `candidate`, or `trusted_production`.
- `sourceType`: provenance such as `fixture`, `synthetic`,
  `internet_or_unknown`, `qa-real-sms`, `consented-user-real-sms`,
  `provider-published-example`, or `controlled-real-transaction`.
- `sourceConfidence`: `unknown`, `low`, `medium`, or `verified`.
- `sanitizedExampleShape`: redacted example or tokenized shape, never a raw
  unsanitized user SMS.
- `matchRules`: deterministic rules for provider, transaction type, amount,
  currency, date/time, counterparty, and account/card hints.
- `expectedOutcome`: expected transaction/transfer extraction for acceptance
  tests.
- `confidence`: expected confidence for exact matches.
- `reviewExpectation`: whether exact matches may be auto-selected in the current
  allowed scope or must require review.
- `autoSelectPolicy`: `dev_only`, `never`, or `production_allowed`.
- `promotionEligibility`: whether the pattern is blocked, needs trusted
  provenance, or can be reviewed for future production use.
- `reviewReasons`: reasons added when the match is ambiguous or incomplete.
- `edgeCases`: known variations and intentional non-matches.

Validation rules:

- Pattern IDs must be unique.
- Phase-1 fixture/synthetic/internet/unknown-source patterns must be
  `runtimeScope: dev_test`.
- Dev/test-only patterns must not have `autoSelectPolicy: production_allowed`.
- Trusted-production patterns are disallowed in phase 1 unless explicitly
  created by a later approved phase-2 change.
- Sanitized examples must redact or tokenize personal identifiers.
- Unsupported or partial matches must fail closed or require review.

## Parser Outcome

Result returned by the local parser before mobile mapping into review/save flow.

States:

- `no_suggestion`: message is unsupported or non-financial.
- `suggestion`: one reviewable transaction candidate. A parser request can
  return multiple `suggestion` outcomes, one per candidate SMS transaction.
- `error`: parser could not safely complete due to invalid configuration.

Fields for one `suggestion` candidate:

- `messageId`
- `smsFingerprint`
- `amount`
- `currency`
- `type`
- `counterparty`
- `date`
- `categorySystemName`
- `confidence`
- `patternRuntimeScope`
- `reviewStatus`
- `reviewReasons`
- `isAtmWithdrawal`
- `cardLast4`
- `parserSource`: diagnostics-only value `local`

Validation rules:

- Amount must be finite, positive, and within existing max transaction limits.
- Currency and transaction type must normalize through existing logic helpers.
- Unknown category names must resolve through the existing category fallback
  behavior, but missing category confidence/review reasons must be preserved.
- ATM withdrawals, missing account hints, missing category, low confidence,
  partial patterns, and non-exact templates must require review.
- Dev/test-only suggestions must remain limited to local-parser dev/test mode.

## Parser Orchestration Decision

Mobile service-level decision describing which parser ran and why.

Fields:

- `mode`: `ai-primary`, `local-primary`, or `fixture`.
- `attemptedAi`: boolean.
- `attemptedLocal`: boolean.
- `diagnostics`: non-sensitive counts, parser source, and pattern IDs; never raw
  message data.

State transitions for phase 1:

- Development/test local-primary: `local-primary` -> local parser result.
- E2E fixture: `fixture` -> fixture parser result.
- Production/default behavior: `ai-primary` -> AI result.

Explicitly deferred to phase 2:

- Production AI unavailable/unusable -> local fallback.
- Production trusted template auto-selection.
- Promoting real SMS templates to `trusted_production`.

## Transaction Suggestion Compatibility

Local parser suggestions must map to the existing `ParsedSmsTransaction` /
`ReviewableTransaction` shape consumed by the review page.

Relationships:

- A `Parsing Request` can produce zero, one, or multiple `Parser Outcome`
  records.
- Each `suggestion` `Parser Outcome` maps to one existing review/save
  transaction contract.
- Existing account matching can enrich suggestions after parsing.
- Existing deduplication prevents the same `smsFingerprint` from being saved
  twice across transactions and transfers.
