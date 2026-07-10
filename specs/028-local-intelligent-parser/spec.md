# Feature Specification: Local Intelligent Parser

**Feature Branch**: `383-local-intelligent-parser`  
**Created**: 2026-07-09  
**Status**: Draft - revised for phased delivery  
**Tracking Issue**: #743  
**Phase 2 Issue**: #744  
**Input**: User description: "Build a local intelligent parser that can replace
the AI parser during development/testing, reduce real AI cost and
nondeterminism, and stay scalable for a later phase where trusted real SMS
patterns are added with user consent."

## Clarifications

### Session 2026-07-09

- Q: What is the first phase goal? -> A: Phase 1 is a deterministic dev/test
  local parser. It may use fixture, synthetic, internet, or unknown-source SMS
  examples as long as the code explicitly marks them as dev/test-only and never
  treats them as trusted production patterns.
- Q: Should phase 1 support production local fallback? -> A: No. Production
  fallback and trusted real-message parsing are deferred to phase 2.
- Q: Should phase 1 patterns be required to come from trusted real SMS sources?
  -> A: No for dev/test-only patterns. Trusted provenance is required only
  before a pattern can be promoted to production-supported behavior in phase 2.
- Q: How should phase 1 protect future production behavior? -> A: Every pattern
  must carry explicit provenance/scope metadata so dev/test patterns cannot
  accidentally become production-trusted later.
- Q: How will phase 2 grow trusted patterns? -> A: Phase 2 will collect real SMS
  examples gradually from users or QA devices with explicit consent,
  sanitize/tokenize them, review them, and promote only verified templates.
- Q: Should regular users see parser-source labels? -> A: No. Parser source
  remains QA/test diagnostics only.
- Q: Should local parsing follow the current AI transaction suggestions setting
  in phase 1? -> A: Yes. Phase 1 must avoid changing user-facing feature access
  or consent semantics.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Deterministic SMS parsing for development and tests (Priority: P1)

As a developer or QA tester, I want supported SMS fixtures to be parsed without
contacting the paid AI provider, so local development and automated tests are
fast, repeatable, and low cost.

**Why this priority**: This is the first-phase value. The parser is initially a
development and testing tool, not a production replacement for AI.

**Independent Test**: Run representative SMS fixtures in local-parser mode and
confirm the review flow receives stable transaction suggestions without a real
AI-provider call.

**Acceptance Scenarios**:

1. **Given** local-parser mode is enabled for development/testing, **When** a
   supported fixture debit SMS is scanned, **Then** the review flow receives a
   transaction suggestion with amount, currency, direction, sender/counterparty
   details, category hint, confidence, and review status.
2. **Given** the same supported SMS fixture is parsed repeatedly, **When**
   parsing runs multiple times, **Then** the parser returns the same transaction
   suggestion each time.
3. **Given** a supported ATM withdrawal fixture is scanned, **When** local
   parsing runs, **Then** the suggestion is marked as requiring review and
   includes the reason that it may represent a cash transfer.
4. **Given** a fixture or pattern came from an unverified source, **When** it is
   stored in the catalog, **Then** the catalog metadata clearly marks it as
   dev/test-only and prevents production-trusted use.

---

### User Story 2 - Safe parser-source diagnostics for QA (Priority: P2)

As a QA tester, I want to know whether SMS parsing used AI, fixture mode, or the
local parser, so I can verify the correct test path without exposing sensitive
SMS data.

**Why this priority**: Phase 1 is mainly for development and testing. QA must be
able to prove the local parser path is actually used.

**Independent Test**: Run local-parser mode and inspect safe diagnostics or test
assertions that identify parser mode without exposing SMS body, sender, amount,
response body, or account names.

**Acceptance Scenarios**:

1. **Given** local-parser mode is active, **When** SMS parsing completes,
   **Then** QA diagnostics identify local-parser usage with only non-sensitive
   counts or pattern identifiers.
2. **Given** fixture mode is active, **When** SMS parsing completes, **Then** QA
   diagnostics distinguish fixture mode from local-parser mode.
3. **Given** regular user review UI is rendered, **When** suggestions are
   displayed, **Then** implementation labels such as local parser, AI parser, or
   fixture parser are not shown.

---

### User Story 3 - Privacy-preserving dev/test parsing behavior (Priority: P3)

As a privacy-conscious user and tester, I want local parsing to preserve
existing SMS privacy boundaries, so test infrastructure does not normalize
unsafe logging or persistence of financial messages.

**Why this priority**: Even dev/test parsing touches SMS-shaped financial data.
The feature must not introduce logging or persistence habits that would be
unsafe later.

**Independent Test**: Parse candidate and non-candidate SMS fixtures, save
suggestions, and verify unrelated messages are ignored, raw SMS body is not
persisted after review/save, and logs do not expose sensitive raw payloads.

**Acceptance Scenarios**:

1. **Given** an SMS is unrelated to financial activity, **When** local parsing
   evaluates it, **Then** it is ignored and no transaction suggestion is
   produced.
2. **Given** a financial SMS fixture is parsed locally, **When** the suggestion
   is reviewed and saved, **Then** raw SMS text is not persisted into
   transaction or transfer records.
3. **Given** local parsing fails or returns low confidence, **When** diagnostic
   logs are produced, **Then** logs do not include SMS body, sender, amount,
   AI/local response body, transcript, or user account names.

---

### User Story 4 - Future-ready trusted pattern promotion (Priority: P4)

As the product team, I want the phase-1 parser catalog to be structured for
future trusted promotion, so phase 2 can add real user-consented SMS templates
without rewriting the parser.

**Why this priority**: Phase 2 will be safer and cheaper if phase 1 already
separates dev/test patterns from trusted production candidates.

**Independent Test**: Review the pattern catalog and confirm each pattern
declares scope, provenance, source confidence, auto-select policy, and promotion
eligibility.

**Acceptance Scenarios**:

1. **Given** a dev/test fixture pattern exists, **When** its metadata is
   inspected, **Then** it is explicitly marked as not production-trusted.
2. **Given** a future trusted real SMS pattern is added, **When** the catalog
   validates it, **Then** it requires consent-backed or provider-backed
   provenance before production use is allowed.
3. **Given** a pattern contains personal-looking values, **When** it is added to
   source control, **Then** those values are sanitized or tokenized.

---

### Out Of Scope For Phase 1

- Production local fallback when the AI provider is unavailable.
- Production auto-confirm or auto-select rules based on local parsing.
- Collecting real user SMS examples.
- Promoting trusted production SMS templates.
- Local audio transcription.
- Direct voice-flow integration beyond keeping future text reuse possible.
- Changing the current AI transaction suggestions setting or consent model.

### Edge Cases

- A dev/test fixture comes from an unknown or internet source.
- A source-controlled example contains personal-looking names, account hints, or
  merchant details.
- A message contains multiple amounts, such as balance, fee, cashback, or
  available limit.
- A message looks financial but is informational only, such as OTP, card
  activation, statement reminder, failed transaction, or marketing.
- A duplicate SMS appears during batch scan or live detection.
- Currency is missing, abbreviated, localized, or different from the user's
  preferred currency.
- Message language, spacing, punctuation, or digit format varies from the known
  fixture shape.
- The local parser and existing fixture mode both exist; tests must prove which
  one is active.
- The app is accidentally run in a non-test environment with dev/test-only local
  patterns.
- A future phase attempts to promote a pattern without trusted consent-backed or
  provider-backed provenance.
- AI transaction suggestions are disabled, even though local parsing itself does
  not contact an external AI provider.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a local parsing path for candidate financial
  SMS messages that can operate without contacting the AI provider in
  development and automated-test environments.
- **FR-002**: System MUST support a configuration that lets development and
  automated-test environments use local parsing as the primary parsing path.
- **FR-003**: System MUST keep production AI parsing behavior unchanged in
  phase 1.
- **FR-004**: System MUST NOT enable production local fallback in phase 1.
- **FR-005**: System MUST return local parsing results in a form that the
  existing transaction review flow can handle without a separate user journey.
- **FR-006**: System MUST include a confidence assessment and review reasons for
  every local parsing result.
- **FR-007**: System MUST force ambiguous, low-confidence, unsupported,
  incomplete, ATM-withdrawal, missing-account, or missing-category local results
  into review rather than treating them as safe.
- **FR-008**: System MUST NOT allow dev/test-only local parser patterns to be
  treated as production-trusted patterns.
- **FR-009**: System MUST ignore unrelated, marketing, OTP, activation,
  failed-transaction, and informational-only messages rather than converting
  them into financial suggestions.
- **FR-010**: System MUST preserve existing duplicate SMS expectations by
  carrying the same `smsFingerprint` through local parsing and review/save
  flows.
- **FR-011**: System MUST extract, when available and safe, transaction
  direction, amount, currency, sender/provider context, merchant or
  counterparty, date/time hint, account/card hint, category hint, and
  transfer/ATM indicators.
- **FR-012**: System MUST preserve existing privacy boundaries: no whole-inbox
  parsing, no unrelated SMS parsing, no raw SMS persistence after review/save,
  and no sensitive raw payload logging.
- **FR-013**: System MUST make parser outcomes visible enough for QA/test
  diagnostics to identify whether a suggestion came from local parsing, AI
  parsing, or fixture parsing.
- **FR-014**: System MUST NOT show regular users implementation labels such as
  local parser, AI parser, or fixture parser.
- **FR-015**: System MUST provide fixture coverage for representative supported
  and unsupported SMS scenarios before phase 1 is considered ready.
- **FR-016**: System MUST keep local audio transcription and direct voice-flow
  integration out of scope for phase 1.
- **FR-017**: System MUST keep supported local parser patterns in a reviewed
  catalog that includes provider, runtime scope, source type, source confidence,
  sanitized example shape, expected parser outcome, confidence expectation,
  review expectation, promotion eligibility, and edge cases.
- **FR-018**: System MAY use fixture, synthetic, internet, or unknown-source
  examples for phase-1 dev/test patterns, but those patterns MUST be explicitly
  marked as dev/test-only.
- **FR-019**: System MUST require trusted real-message provenance before any
  pattern can be marked production-supported in a future phase.
- **FR-020**: System MUST treat the local parser as a template/pattern parser,
  not a broad financial-keyword parser. Keyword detection may only be used as an
  early candidate filter or inside a declared pattern rule; it must not by
  itself create a transaction suggestion.
- **FR-021**: System MUST run negative classification before template extraction
  so OTPs, promotions, offers, activation notices, failed transactions,
  reminders, and informational-only messages are ignored even when they contain
  financial words such as card, wallet, transfer, balance, cashback, amount, or
  currency.
- **FR-022**: System MUST extract transaction fields only after a declared
  provider/template rule matches. If the parser cannot identify the transaction
  amount, movement direction, and counterparty/account context with the
  confidence required by that template, it must return no suggestion or a
  needs-review suggestion rather than an auto-selectable result.
- **FR-023**: System MUST keep local parsing controlled by the existing AI
  transaction suggestions setting for phase 1 so SMS/voice suggestion feature
  access does not change.
- **FR-024**: System SHOULD keep the parser design scalable for phase 2 by
  separating parser logic, pattern metadata, catalog validation, and mobile
  runtime-mode selection.

### Key Entities _(include if feature involves data)_

- **Parsing Request**: The candidate financial message context made available to
  a parser. It includes only the information needed to propose transactions and
  must respect existing privacy boundaries.
- **Parser Outcome**: The result of parsing a candidate message. It can be a
  transaction suggestion, a transfer/cash-withdrawal suggestion, a no-suggestion
  result, or an error/degraded result.
- **Transaction Suggestion**: A reviewable proposed financial record with
  amount, currency, direction, date/time, counterparty/provider context,
  category hint, account/card hint, confidence, and review reasons.
- **Review Reason**: A user-facing or QA-facing explanation for why a suggestion
  requires human review, such as low confidence, account needed, category
  needed, cash-transfer risk, unsupported sender, or ambiguous amount.
- **Supported Message Pattern**: A known sender/provider and message shape that
  local parsing can evaluate deterministically.
- **Pattern Runtime Scope**: Whether a pattern is allowed only for
  development/testing, is a candidate for future review, or is trusted enough
  for future production behavior.
- **Pattern Source Type**: The provenance category for the pattern, such as
  fixture, synthetic, internet/unknown source, consented user SMS, QA real SMS,
  provider-published example, or controlled real transaction.
- **Parser Source**: The non-sensitive source classification for a suggestion,
  such as AI provider, local parser, or test fixture. It is used for QA/test
  diagnostics and observability only, not regular user-facing copy.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: In development/test mode, at least 90% of agreed SMS parsing
  fixtures complete without contacting the real AI provider.
- **SC-002**: Re-running the same fixture suite 10 times produces identical
  parser outcomes every time.
- **SC-003**: For agreed supported SMS fixtures, at least 85% produce a
  reviewable suggestion with the expected amount, currency, direction, and
  review status.
- **SC-004**: For agreed unsupported or non-financial SMS fixtures, at least 95%
  produce no transaction suggestion.
- **SC-005**: The phase-1 dev/test corpus includes at least 100 concrete
  SMS-shaped fixtures and covers every selectable bank and wallet provider in
  the local Egyptian institution registry.
- **SC-006**: 100% of dev/test-only patterns are explicitly marked so they
  cannot be interpreted as production-trusted behavior.
- **SC-007**: 100% of low-confidence, ambiguous, ATM-withdrawal,
  missing-account, missing-category, and non-exact-template local results are
  shown as requiring review.
- **SC-008**: No automated test or diagnostic output introduced by this feature
  includes raw SMS body, sender, amount, transcript, AI/local response body, or
  user account names.
- **SC-009**: Manual QA can clearly verify whether parsing used AI, local
  parser, or fixture mode through QA/test diagnostics without exposing
  parser-source labels in the regular user UI.
- **SC-010**: The phase-1 catalog can accept a future trusted production pattern
  by adding provenance metadata and tests, without rewriting the parser core.

## Assumptions

- Phase 1 is SMS-first and dev/test-focused.
- Local parsing is intentionally deterministic and does not need to match AI
  quality for unknown or novel message templates.
- The review page remains the safety boundary for uncertain suggestions.
- The same user consent and privacy expectations that apply to AI transaction
  suggestions still gate access to SMS/voice suggestions in phase 1.
- Phase-1 SMS examples may be synthetic, fixture-based, internet-sourced, or
  unknown-source as long as they are clearly marked dev/test-only.
- Real SMS collection, trusted production promotion, and production fallback are
  deferred to phase 2.
- Pattern examples will be sanitized before being stored in fixtures or
  documentation.
- Development and E2E stability are primary goals; production behavior must not
  change in phase 1.
