# Feature Specification: Trusted Hybrid SMS Parser

**Feature Branch**: `codex/hybrid-local-first-sms-parser-752`  
**Created**: 2026-07-15  
**Status**: Ready for review  
**Input**: Issue #752 and the approved direction to parse covered financial SMS
with trusted local templates first, then use AI only for unsupported or
ambiguous candidates.

## Clarifications

### Session 2026-07-15

- Q: What evidence threshold must a sanitized template meet before it can run in
  production? -> A: One explicitly reviewer-approved real sanitized template is
  sufficient; no minimum sample count is required.
- Q: How are trusted templates activated or disabled in the first release? -> A:
  Ship a versioned catalog with the app and disable templates through an OTA or
  app update, while preserving a replaceable activation boundary for a future
  cached remote manifest.
- Q: What should users see when local results are available but AI fails for the
  unresolved subset? -> A: Show a compact persistent inline notice with the
  unresolved count and a retry action that processes only unresolved messages.

## User Scenarios & Testing

### User Story 1 - Parse Covered Messages Locally First (Priority: P1)

As a user importing financial SMS, I want messages covered by reviewed trusted
templates to be recognized locally so that supported messages are processed
quickly, predictably, and without requiring the AI provider.

**Why this priority**: This is the core value of the hybrid approach: reduce AI
cost and network dependence without reducing parsing safety.

**Independent Test**: Scan messages that exactly match active trusted templates
while the network is unavailable and verify that reviewable suggestions are
created with the correct financial values and no AI request is attempted for
those messages.

**Acceptance Scenarios**:

1. **Given** an SMS exactly matches one active trusted template, **When** the
   user starts an SMS scan, **Then** the system creates one reviewable local
   suggestion and does not send that SMS to AI.
2. **Given** several SMS match active trusted templates, **When** they are
   scanned offline, **Then** each supported message is parsed locally and shown
   for review.
3. **Given** a message has more than one possible trusted match or an ambiguous
   extraction, **When** it is scanned, **Then** the system does not accept a
   local result as authoritative and routes the unresolved candidate according
   to the approved hybrid policy.

---

### User Story 2 - Use AI Only For Unresolved Messages (Priority: P1)

As a user with messages that are not yet covered by the trusted catalog, I want
the existing AI parser to handle only those unresolved messages so that the
current feature coverage is preserved while AI usage is minimized.

**Why this priority**: Local-first parsing must not reduce support for new or
changed provider templates.

**Independent Test**: Scan a mixed batch containing exact trusted matches and
unknown messages, then verify that AI receives only the unknown subset and that
the combined review list contains no duplicates.

**Acceptance Scenarios**:

1. **Given** a batch contains local matches and local no-matches, **When** AI is
   available and consent is active, **Then** only no-match candidates are sent
   to AI.
2. **Given** AI returns usable suggestions for unresolved candidates, **When**
   local and AI results are combined, **Then** every source SMS produces at most
   one review item.
3. **Given** AI consent is disabled or revoked, **When** the user attempts an AI
   transaction suggestion flow, **Then** the existing feature gate remains in
   force and no hidden local-only flow is introduced.

---

### User Story 3 - Preserve Safe Partial Results (Priority: P1)

As a user scanning a mixed inbox, I want successfully parsed messages to remain
available even if another parser or candidate fails, so that one failure does
not discard valid work.

**Why this priority**: Dropping successful results would be a financial-data
correctness regression and would make failures difficult to understand.

**Independent Test**: Produce local matches, an unknown candidate, and an AI
failure in one scan; verify that safe local results remain reviewable, failed
candidates create no transaction, and repeated attempts do not duplicate
results.

**Acceptance Scenarios**:

1. **Given** local parsing succeeds for part of a batch and AI fails for the
   unresolved subset, **When** parsing completes, **Then** the successful local
   results are preserved.
2. **Given** a candidate cannot be resolved safely by either parser, **When**
   processing completes, **Then** no suggestion is created for that candidate.
3. **Given** the user cancels processing, **When** cancellation is received,
   **Then** active and pending parser work stops and no late result is appended.

---

### User Story 4 - Keep Every Local Suggestion Reviewable (Priority: P2)

As a user reviewing imported transactions, I want locally parsed suggestions to
remain editable and explicitly reviewed before saving so that a trusted template
cannot silently create incorrect financial records.

**Why this priority**: Trusted templates improve precision, but production
auto-selection has not been approved.

**Independent Test**: Parse an exact trusted match and verify that it enters the
existing review flow, retains its source fingerprint, and cannot bypass account,
category, transfer, or save validation.

**Acceptance Scenarios**:

1. **Given** a trusted local template matches, **When** the result reaches the
   review page, **Then** it is marked for review and follows the existing edit
   and save contracts.
2. **Given** a local result lacks a valid account, category, transfer endpoint,
   or other required financial reference, **When** the user attempts to save,
   **Then** existing validation blocks the unsafe save.
3. **Given** the same source SMS is encountered through batch, live, background,
   or killed-app delivery, **When** it is processed repeatedly, **Then** the
   fingerprint invariant prevents duplicate financial records.

---

### User Story 5 - Operate A Governed Trusted Catalog (Priority: P2)

As a maintainer, I want production parsing to execute only explicitly promoted,
versioned, and disableable templates so that candidate evidence can never become
production behavior accidentally.

**Why this priority**: The Phase 2A catalog is evidence-only. A separate trusted
runtime boundary is required before local parsing can be enabled in production.

**Independent Test**: Attempt to load candidate and development templates in a
production configuration and verify they cannot execute; then disable an active
trusted template and verify messages return to the unresolved path.

**Acceptance Scenarios**:

1. **Given** a pattern is marked `candidate`, `review_ready`, or `dev_test`,
   **When** production parsing runs, **Then** the pattern is unavailable to the
   runtime.
2. **Given** a trusted catalog version is invalid or disabled, **When** parsing
   starts, **Then** the system uses the approved last-known-good behavior or
   routes candidates away from that local pattern.
3. **Given** a trusted pattern is disabled, **When** a matching SMS is scanned,
   **Then** it is treated as unresolved and may use AI under the normal consent
   rules.

### Edge Cases

- A provider changes punctuation, spacing, language, amount order, or sender
  alias without a reviewed template version.
- One message matches multiple templates or contains multiple plausible amounts.
- A trusted template extracts an unsupported currency or malformed date.
- Local parsing succeeds but account/category matching fails later.
- AI returns a duplicate of a local result or returns a result for the wrong
  candidate.
- AI returns partial results and reports an error for the same batch.
- Network availability changes between local classification and AI fallback.
- Consent is revoked after local work starts but before an AI request begins.
- The user cancels while local parsing, AI parsing, or result combination is in
  progress.
- A catalog is missing, malformed, disabled, rolled back, or newer than the app
  can understand.
- The same SMS arrives through foreground, background, and killed-app paths.
- A local parser result is received after the consuming screen unmounts.

## Approved UI Direction

- The approved reference is the second generated mockup image saved as
  `mockups/partial-results-notice-light-dark.png`, including both its light and
  dark variants.
- The notice sits inline between the review controls and transaction list. It is
  persistent while unresolved candidates remain and never overlays content.
- The notice contains a warning icon, unresolved count, concise supporting copy,
  and a compact retry action for only the unresolved candidates.
- Both approved theme variants use the compact bordered notice, vertical
  separator, and right-aligned retry action shown in the reference. The
  implementation MUST use existing Monyvi light and dark theme tokens; generated
  colors are illustrative rather than new design-system colors.
- The component uses the existing review-page spacing, typography, iconography,
  corner-radius, accessibility, and responsive rules.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST evaluate each eligible SMS candidate against only
  active production-trusted local templates before considering AI parsing.
- **FR-002**: The system MUST send only locally unresolved candidates to AI.
- **FR-003**: A candidate with an exact unambiguous trusted local match MUST NOT
  be sent to AI.
- **FR-004**: A local no-match, multiple match, conflicting match, malformed
  extraction, or unsupported value MUST remain unresolved rather than producing
  a trusted local suggestion.
- **FR-005**: AI fallback MUST continue to require the existing AI transaction
  suggestion consent and availability checks.
- **FR-006**: This phase MUST NOT make SMS or voice AI features accessible when
  the existing AI transaction feature gate is disabled.
- **FR-007**: Local and AI results MUST be correlated to their source candidate
  using stable language-neutral identity.
- **FR-008**: Combining parser results MUST produce at most one suggestion per
  SMS fingerprint.
- **FR-009**: A usable result from one parser MUST NOT be discarded because a
  different candidate or parser failed.
- **FR-010**: Candidates unresolved by both permitted parsers MUST fail closed
  and MUST NOT create a suggestion or financial record.
- **FR-011**: User cancellation MUST stop active and pending local, AI, and
  combination work and prevent late progress or result delivery.
- **FR-012**: All production local suggestions MUST enter the existing review
  flow and MUST NOT be auto-selected in this release.
- **FR-013**: Existing account, category, transfer, amount, currency, save, and
  fingerprint validation MUST apply equally to local and AI suggestions.
- **FR-014**: Batch scan, foreground live detection, background native events,
  killed-app processing, and notification actions MUST preserve the existing SMS
  fingerprint deduplication invariant.
- **FR-015**: Production execution MUST reject `candidate`, `review_ready`, and
  `dev_test` patterns even if they are imported or referenced accidentally.
- **FR-016**: A production-trusted pattern MUST carry a stable pattern identity,
  provider/template identity, version, enabled state, expected extraction
  contract, review policy, provenance, and validation evidence.
- **FR-017**: One real sanitized template explicitly approved by the designated
  reviewer MAY be promoted to `trusted_production` without a minimum sample
  count. Promotion MUST still require valid schema, integrity and privacy
  checks, an exact positive match, intentional non-match coverage, zero open
  ambiguity findings, and an explicit promotion record.
- **FR-018**: Reviewer approval MUST trust only the approved sanitized
  structure. The system MUST NOT broaden fixed wording, infer additional
  variants, merge structurally different templates, or create a general provider
  rule from one approved message.
- **FR-019**: Structurally different provider templates MUST remain separately
  versioned even when they represent the same transaction family.
- **FR-020**: Disabling or rolling back one trusted pattern MUST NOT disable
  unrelated trusted patterns.
- **FR-021**: The initial production release MUST use a versioned trusted
  catalog bundled with the app. Template activation changes and emergency
  disablement MUST be delivered through an OTA or app update.
- **FR-022**: The catalog activation policy MUST be replaceable without changing
  trusted pattern identities, matching behavior, result contracts, or catalog
  provenance so a future cached remote activation manifest can be introduced if
  update cost, rollout scale, or kill-switch latency justifies it.
- **FR-023**: Offline parsing MUST use the installed approved catalog state and
  MUST NOT require a network call for a trusted match.
- **FR-024**: A failed or invalid OTA/app update MUST NOT become the active
  installed bundle and MUST preserve the previously installed valid catalog. If
  the currently installed bundled catalog nevertheless fails runtime validation,
  local trusted execution MUST fail closed and affected candidates MUST route to
  AI under the normal consent gate.
- **FR-025**: A disabled trusted template MUST route affected candidates to the
  unresolved path and MUST NOT silently drop them.
- **FR-026**: When local results are preserved but AI fallback leaves retryable
  unresolved candidates, the review page MUST show a compact persistent inline
  notice stating that some messages could not be processed, the number of
  unresolved messages, and a retry action. Consent revocation and cancellation
  MUST exit through their existing flows rather than creating a partial review
  session.
- **FR-027**: Retrying a partial result MUST process only unresolved candidates,
  preserve existing successful suggestions, prevent duplicate suggestions, and
  update or dismiss the notice when the retry completes. If a mixed retry adds
  successful suggestions but leaves only non-retryable candidates, the system
  MUST preserve those successes, keep Save enabled, and show the unresolved
  count without an acknowledgment or retry action. The remaining messages MUST
  stay uncommitted, and saving the successful suggestions MUST NOT advance the
  incremental SMS checkpoint so those messages can be attempted by a later sync.
- **FR-028**: Diagnostics MUST expose only safe counts, parser source, reason
  codes, catalog version, and pattern IDs.
- **FR-029**: Diagnostics and logs MUST NOT include raw or sanitized SMS text,
  sender, amount, balance, account/card data, merchant/person, reference, phone,
  date/time values, transcript, or AI response body.
- **FR-030**: Parser-source and failure-reason values MUST be stable codes, not
  translated display text.
- **FR-031**: The hybrid transaction-parsing capability MUST support staged
  enablement and complete disablement without activating candidate-only
  patterns. Complete disablement MUST route eligible transaction candidates to
  the existing AI path, while exact active trusted rejection templates (such as
  OTP or promotional messages) remain pre-AI eligibility filters and MUST NOT be
  sent to AI.
- **FR-032**: Existing explicit development modes for fixture-only and
  local-development parsing MUST remain available and must not be confused with
  the production hybrid policy.
- **FR-033**: User-contributed pattern collection from #751 MUST remain out of
  scope and MUST NOT be required for this release.
- **FR-034**: Voice parsing behavior MUST remain unchanged.
- **FR-035**: The system MUST report progress without counting the same
  candidate or transaction twice when work moves between parsers.
- **FR-036**: Reprocessing the same candidate set under the same catalog version
  and parser availability MUST produce deterministic local-routing outcomes.
- **FR-037**: A production trusted catalog MAY contain only the reviewed fixed
  template fragments and placeholder-role metadata required for exact matching.
  It MUST NOT contain raw evidence messages, full evidence samples, or concrete
  private placeholder values.
- **FR-038**: The initial trusted QNB catalog MUST use an explicit family and
  currency allowlist. Card purchases, ATM withdrawals, incoming/outgoing IPN
  transfers, refunds/reversals, and reviewed rejection templates MAY be promoted
  when their exact candidate passes promotion checks. ATM withdrawals MUST
  retain the existing `isAtmWithdrawal` review/save behavior; incoming/outgoing
  IPN messages map to external-counterparty income/expense.
  `bank_to_wallet_transfer` MUST remain unresolved and route to AI until an
  explicit internal-transfer result contract is separately approved.
- **FR-039**: Every promoted placeholder semantic role MUST have a documented
  runtime extraction, validation, or ignore policy. Unknown or disallowed roles
  MUST invalidate promotion rather than being guessed at runtime.
- **FR-040**: Raw unresolved candidates and retry parse context MUST remain
  memory-only and MUST be cleared on save, discard, explicit reset, review Back
  navigation, route replacement that abandons review, logout, and private
  runtime unmount.

### Key Entities

- **SMS Candidate**: One filtered source message with a stable message identity
  and fingerprint, eligible for one parser-routing outcome.
- **Trusted Pattern**: A reviewed, versioned provider template permitted to run
  in production with an exact extraction and review contract.
- **Catalog Version**: An immutable set of trusted patterns plus activation and
  compatibility metadata.
- **Promotion Record**: An immutable privacy-safe approval record connecting one
  candidate ID to one exact trusted pattern/version, catalog version, reviewer
  identity, approval time, and validation evidence status.
- **Candidate Routing Outcome**: The per-candidate result of local match,
  unresolved no-match, ambiguity, local failure, AI result, AI failure, or
  cancellation.
- **Parsed Suggestion**: A reviewable income/expense transaction proposal tied
  to one source fingerprint and one parser source. ATM withdrawals use the
  existing specialized transfer-on-save path; unsupported internal transfers are
  not emitted locally in this release.
- **Hybrid Parse Summary**: Privacy-safe aggregate counts and reason codes for a
  parsing operation, excluding message content and financial values.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of exact matches for active trusted templates are processed
  without sending those SMS candidates to AI.
- **SC-002**: 100% of candidates not resolved safely by local parsing are sent
  to AI only when consent and availability permit, or fail closed otherwise.
- **SC-003**: Mixed local/AI batches produce zero duplicate review items or
  duplicate saved financial records across all tested delivery paths.
- **SC-004**: 100% of production local suggestions require review and pass the
  existing financial validation before save.
- **SC-005**: `candidate`, `review_ready`, and `dev_test` patterns produce zero
  production local suggestions in automated and staged-release validation.
- **SC-006**: Covered trusted templates remain usable without network access,
  and trusted-catalog matching for a 1,000-candidate batch completes within one
  second on the supported QA development profile. Screen navigation and inbox
  reading are measured separately because they are outside the pure matcher.
- **SC-007**: Cancellation produces zero late results, writes, or progress
  updates after cancellation is acknowledged.
- **SC-008**: Catalog validation, per-pattern disablement, OTA/app activation,
  and rollback tests preserve the prior valid installed catalog when an update
  fails and fail closed to AI when the current bundle is invalid in 100% of
  tested invalid-update scenarios.
- **SC-009**: Privacy scanning finds zero raw evidence messages, full sanitized
  evidence samples, or concrete private placeholder values in logs, diagnostics,
  committed runtime catalogs, and test snapshots. Reviewed fixed template
  fragments required for exact structural matching are permitted.
- **SC-010**: Staged validation records local-match precision, unknown-message
  behavior, AI-fallback rate, ambiguity rate, and false-positive rate before
  wider enablement; no false-positive financial suggestion is accepted for the
  initial trusted QNB template set.

## Assumptions

- Phase 2A issue #750 and PR #753 provide the reviewed, privacy-safe evidence
  catalog and governance foundation.
- User contribution issue #751 remains deferred and is not a dependency.
- The first production-trusted provider scope is QNB Egypt; other providers
  remain AI-only until separately reviewed evidence is promoted.
- The first promotion allowlist excludes `bank_to_wallet_transfer` even when a
  Phase 2A candidate exists, because the current parsed-SMS contract cannot
  represent both owned transfer endpoints safely.
- Reviewer approval of one real sanitized template is sufficient for production
  trust, but applies only to that exact structure and does not establish support
  for unreviewed provider variants.
- The existing known-financial-candidate filtering remains the first filtering
  boundary before hybrid parsing.
- The existing AI transaction feature gate remains unchanged for this release.
- Local-only SMS access while AI consent is disabled requires a later product
  and disclosure decision.
- Production auto-selection remains out of scope regardless of local confidence.
- The first release does not fetch a remote catalog or activation manifest.
  Remote activation remains a future operational enhancement, not a prerequisite
  for hybrid parsing.
- The approved partial-results notice is a focused addition to the existing
  transaction-review surface rather than a new page or modal.
- The current review, edit, save, sync, and fingerprint contracts remain the
  user-facing source of truth.
- No new database schema, user contribution backend, or machine-learning model
  is required for this phase.

## Required Validation Journeys

- Deterministic automated journeys MUST cover mixed trusted/unknown scanning,
  offline trusted matching, retryable AI failure/timeout, partial-result retry,
  cancellation, consent revocation, global hybrid disablement, and duplicate SMS
  delivery where the harness can honestly control the state.
- Background and killed-app behavior that cannot be controlled reliably by the
  CI runner MUST be documented as physical-device manual-only coverage with the
  reason; it MUST NOT be claimed as automated coverage.
