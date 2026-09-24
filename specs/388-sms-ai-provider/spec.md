# Feature Specification: Configurable SMS AI Provider

**Feature Branch**: `388-sms-ai-provider`  
**Created**: 2026-09-24  
**Status**: Draft  
**Input**: User description: "Replace the SMS full-parser's current Gemini dependency with a lower-cost configurable SMS AI provider, initially DeepSeek V4 Flash 0731 through DeepInfra, while keeping Gemini for voice. Make future SMS provider changes easy, preserve the existing SMS safety and client contracts, and reuse stable parser context to reduce recurring input cost. Supported currencies and built-in categories are mostly stable; future user-created categories will be dynamic."

## Clarifications

### Session 2026-09-24

- Q: Should the SMS provider be selected in code or configuration? → A: Configuration-based selection is required.
- Q: Should Gemini remain as a fallback for SMS during this pre-production migration? → A: No. Replace the SMS provider directly; no comparison benchmark or automatic fallback is required.
- Q: Does the voice feature change? → A: No. Voice continues using the current Gemini-based flow.
- Q: How should repeated parser context be treated for cost control? → A: Unchanged shared parser context should be reusable when the selected provider supports discounted reuse, without weakening correctness or mixing user-specific content.
- Q: How stable are currencies and categories? → A: Supported currencies are unlikely to change; built-in categories are also mostly stable, while future user-created categories will be dynamic user-specific context.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Keep SMS import working while changing the AI service (Priority: P1)

As a Monyvi user importing bank and wallet SMS messages, I want the SMS parsing flow to continue producing safe reviewable transaction suggestions after the underlying AI service is replaced, so that changing infrastructure does not change how I use SMS import.

**Why this priority**: SMS parsing feeds financial suggestions. The provider migration is successful only if the existing user flow, safety checks, and result contract remain intact.

**Independent Test**: Run representative SMS import scenarios through the completed SMS parser and verify that valid transactions, non-transactions, malformed provider output, empty results, and provider failures all preserve the existing user-visible flow and safety behavior.

**Acceptance Scenarios**:

1. **Given** an authenticated user with active AI consent submits eligible SMS messages, **When** the configured SMS AI service returns valid transaction suggestions, **Then** the user receives the same reviewable SMS result shape and safety behavior as before the provider migration.
2. **Given** the configured SMS AI service returns a valid result with no transactions, **When** Monyvi processes the response, **Then** the result is treated as a legitimate empty parse rather than retried or converted into invented transactions.
3. **Given** the configured SMS AI service returns malformed, truncated, or structurally invalid financial data, **When** Monyvi validates the response, **Then** no partial invalid transaction is accepted.
4. **Given** an SMS request is rejected by existing consent, quota, fingerprint, scan-window, or other SMS safeguards, **When** the provider migration is active, **Then** the same safeguard outcome occurs without bypassing or duplicating those rules.

---

### User Story 2 - Change the SMS provider without rewriting the SMS workflow (Priority: P1)

As a Monyvi maintainer, I want the active SMS AI provider and model to be selected through deployment configuration, so that a future provider change does not require rewriting the SMS business workflow or changing the voice feature.

**Why this priority**: The current migration is motivated by cost, but model/provider economics change quickly. Provider replaceability is required to avoid repeating a tightly coupled migration later.

**Independent Test**: Change the configured SMS provider/model in a controlled environment and verify that the SMS parsing workflow resolves the approved provider through one provider boundary while the mobile contract, safeguards, validation, reconciliation, and voice parsing remain unchanged.

**Acceptance Scenarios**:

1. **Given** a supported SMS provider configuration, **When** the SMS parser starts, **Then** it uses that configured SMS provider without requiring changes to the SMS client contract or the voice provider.
2. **Given** the SMS provider configuration is missing, incomplete, or unsupported, **When** an SMS full-parse request reaches the provider boundary, **Then** processing fails closed before SMS content is sent to an unintended provider.
3. **Given** a future approved SMS provider is introduced, **When** it satisfies the established SMS provider contract, **Then** the core SMS handler, safeguards, reconciliation, and response contract do not need provider-specific changes.
4. **Given** the SMS provider changes, **When** users use voice entry, **Then** voice continues through its existing provider and behavior unchanged.

---

### User Story 3 - Reduce recurring SMS AI cost without weakening correctness (Priority: P2)

As the product owner, I want unchanged shared SMS parsing instructions to be reusable across requests when the selected provider supports it, so that repeated SMS parsing costs less while user-specific categories and message content remain correctly isolated.

**Why this priority**: Reducing AI cost is the primary reason to retire Gemini from SMS parsing, but cost optimization must not weaken financial correctness or leak one user's dynamic context into another request.

**Independent Test**: Send repeated SMS parsing requests that share the same platform parsing rules but contain different message content, then verify that the reusable shared context can receive discounted reuse when supported while request-specific SMS/category data remains distinct and the functional result is unchanged whether reuse occurs or not.

**Acceptance Scenarios**:

1. **Given** two SMS requests use unchanged shared parsing rules, supported currencies, and built-in category definitions, **When** the selected provider supports reusable input context, **Then** the unchanged shared portion is eligible for reuse rather than being treated as entirely new input each time.
2. **Given** two users have different future custom-category context, **When** their SMS requests are processed, **Then** the shared platform context may still be reused while each user's custom categories and SMS content remain isolated.
3. **Given** reusable input context is unavailable or misses, **When** the same SMS request is processed, **Then** financial correctness, validation, and user-visible behavior are unchanged.
4. **Given** built-in categories or supported currencies are intentionally revised in the future, **When** the shared parsing context changes materially, **Then** old reusable context is not relied on as if it still represented the current rules.

### Edge Cases

- SMS provider configuration is missing, blank, unsupported, or names a model unavailable to the selected provider.
- Provider credentials are unavailable or invalid.
- The selected provider is temporarily rate-limited or unavailable.
- A provider request times out after SMS provider usage has started.
- The provider returns valid structured output with an empty transaction list.
- The provider returns malformed JSON, a truncated response, an unknown completion state, or transactions that fail Monyvi's existing semantic validation.
- A retryable provider failure occurs after earlier SMS safeguards have reserved capacity.
- A non-retryable configuration/authentication error occurs; the system must not repeatedly retry it.
- Stable shared parsing context is reusable for one request but not another; both must produce equivalent functional behavior.
- Supported currencies remain stable while a user's future custom categories differ from another user's.
- Built-in categories change in a future release and previously reusable shared context no longer matches current rules.
- A future custom category is renamed; provider replaceability must not require using a mutable display name as durable category identity.
- An operator attempts to configure an unapproved arbitrary provider destination; SMS financial content must not be sent there.
- Voice parsing is exercised during and after the SMS provider migration; it must remain unaffected.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The SMS full-parser MUST use an independently configurable AI provider that is separate from the voice AI provider.
- **FR-002**: The completed feature MUST replace the current SMS Gemini dependency with the approved lower-cost SMS provider for this release.
- **FR-003**: The SMS provider and model MUST be selectable through deployment configuration without changing the mobile SMS request/response contract.
- **FR-004**: Missing, incomplete, or unsupported SMS provider configuration MUST fail closed and MUST NOT silently fall back to Gemini or another provider.
- **FR-005**: SMS financial content MUST be sent only to an explicitly approved configured provider destination.
- **FR-006**: Existing SMS authentication, AI consent, request validation, fingerprint validation, scan-window rules, hard exclusions, quotas, reservations, provider-start accounting, negative-outcome reconciliation, and operational telemetry MUST retain their current behavior.
- **FR-007**: Existing SMS transaction semantic validation MUST remain authoritative regardless of which provider produced the candidate response.
- **FR-008**: A provider-side structured response constraint MUST NOT replace application-side validation of amounts, currencies, transaction direction, dates, categories, confidence, trust state, ATM flags, or card suffixes.
- **FR-009**: A valid provider response containing zero transactions MUST be accepted as a completed parse and MUST NOT be retried solely because it is empty.
- **FR-010**: Malformed, truncated, structurally invalid, or semantically invalid provider output MUST NOT create partial accepted financial suggestions.
- **FR-011**: Retry behavior MUST distinguish transient provider/network failures from non-retryable authentication, authorization, configuration, and malformed-request failures.
- **FR-012**: Retries MUST remain bounded and MUST preserve the existing SMS usage-accounting and idempotency guarantees.
- **FR-013**: The shared SMS parsing rules, supported currencies, and built-in category definitions MUST remain provider-independent.
- **FR-014**: Unchanged shared SMS parser context SHOULD be reusable across requests when the selected provider supports discounted input reuse, without making correctness depend on a reuse hit.
- **FR-015**: Request-specific SMS content MUST remain outside shared reusable identity/context so one request's message content cannot become reusable context for another request.
- **FR-016**: Future user-created custom categories MUST be supportable as dynamic user-specific parsing context without requiring a redesign of the SMS provider boundary.
- **FR-017**: Built-in categories and supported currencies MAY be treated as stable shared context while they remain unchanged; a material change MUST invalidate reliance on the prior shared context.
- **FR-018**: The provider boundary MUST NOT assume that all future categories are permanently identified only by current built-in category names.
- **FR-019**: Provider credentials MUST remain server-side and MUST NOT be committed, returned to clients, or exposed in logs.
- **FR-020**: Operational configuration for SMS provider selection MUST be managed separately from source code so hosted deployments can change provider/model settings without embedding credentials or mutable configuration values in the function bundle.
- **FR-021**: The provider migration MUST NOT change the voice parsing provider, voice request contract, voice usage accounting, or voice user experience.
- **FR-022**: The provider migration MUST NOT introduce a database schema change or a mobile API contract change.
- **FR-023**: The feature MUST NOT add automatic multi-provider fallback, provider benchmarking infrastructure, or a generic abstraction shared by unrelated AI capabilities.
- **FR-024**: Existing provider-specific SMS QA documentation MUST be updated so routine deterministic SMS QA proves zero production-configured SMS AI calls and zero production allowance consumption without incorrectly naming Gemini as the SMS provider.
- **FR-025**: The approved initial SMS provider for this release is DeepSeek V4 Flash 0731 served through DeepInfra; exact request formatting and integration mechanics are planning decisions.
- **FR-026**: The migration does not require a Gemini-versus-DeepSeek quality benchmark before adoption because Monyvi is pre-production; representative SMS functional QA remains required before the feature is considered complete.

### Key Entities

- **SMS AI Provider Configuration**: The deployment-selected SMS parsing service, model, service class, and required credentials. It is independent from voice provider configuration.
- **SMS Parsing Request Context**: The provider-independent financial parsing instructions and request context, including supported currencies, category context, and the current eligible SMS batch.
- **Reusable Shared Parser Context**: The unchanged platform-level portion of SMS parsing context that may be reused across requests for cost efficiency without containing request-specific SMS content.
- **User-Specific Category Context**: Dynamic category information that may differ by user, including future custom categories, and therefore must remain separate from globally reusable shared context.
- **SMS Provider Result**: A provider candidate response normalized into Monyvi's existing completion and transaction contract before authoritative semantic validation.

## Scope Boundaries

### In Scope

- Direct replacement of the SMS full-parser's current Gemini dependency with the approved replacement provider.
- Configuration-based SMS provider/model selection.
- A provider-neutral SMS parsing boundary that future providers can satisfy.
- Cost-efficient reuse of unchanged shared parsing context when supported.
- Clear separation of stable platform context from future dynamic user category context.
- Safe provider failure, retry, completion, and malformed-response handling.
- Hosted deployment configuration and secret requirements for the SMS provider.
- Provider-neutral SMS QA/business documentation updates required by the migration.
- Representative SMS functional QA after integration.

### Out of Scope

- Any change to voice parsing or its current Gemini provider.
- Automatic fallback from the configured SMS provider to another provider.
- A Gemini-versus-DeepSeek model benchmark or shadow-comparison system.
- Implementing the future user-created custom-category feature.
- Changing the built-in category taxonomy or supported-currency product scope.
- Database schema changes.
- Mobile SMS API contract changes.
- New user-facing SMS screens or redesigns.
- A generic AI-provider abstraction shared across voice, SMS, rates, OCR, or other capabilities.

## Dependencies

- Existing SMS authentication, consent, safeguard, quota, fingerprint, negative-outcome, telemetry, and review behavior remain authoritative.
- Existing SMS semantic validation remains authoritative for accepted provider results.
- Existing business decisions for SMS safeguards remain authoritative except for provider-specific wording that becomes stale when Gemini is retired from SMS.
- The voice feature remains independently owned and continues using its existing provider.
- The approved replacement service must continue supporting the structured financial result contract required by Monyvi.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of existing SMS provider-contract and safeguard acceptance scenarios continue to produce the same client-visible outcome categories after the provider replacement.
- **SC-002**: 100% of missing, unsupported, or incomplete SMS provider configuration scenarios fail before SMS content is sent to an unintended provider.
- **SC-003**: Representative uncached SMS full-parse usage is estimated to cost at least 30% less than the current SMS Gemini baseline when comparing the same input/output token counts at the providers' published rates at deployment time.
- **SC-004**: In repeated-request verification where the provider supports reusable input context, unchanged shared parser context is eligible for discounted reuse while different SMS bodies and user-specific category context remain isolated.
- **SC-005**: 100% of cache/reuse hit and miss verification cases produce equivalent functional parsing and validation behavior for the same request.
- **SC-006**: A future approved SMS provider can be introduced without changing the mobile SMS contract, voice parsing, SMS safeguard policy, negative-outcome reconciliation, or semantic transaction validation.
- **SC-007**: 100% of malformed, truncated, or semantically invalid provider-response fixtures produce no accepted partial financial suggestion.
- **SC-008**: Voice entry continues using its existing provider with no provider-configuration or behavior change attributable to this SMS feature.
- **SC-009**: Routine deterministic SMS QA performs zero calls to the production-configured SMS AI provider and consumes zero production SMS AI allowance.
- **SC-010**: Manual representative SMS QA confirms valid purchase, transfer, ATM, income, promotion/non-transaction, and empty-result scenarios remain reviewable or safely rejected according to existing SMS rules.

## Assumptions

- Monyvi is pre-production, so direct SMS provider replacement is acceptable without a comparative model benchmark or staged production rollout.
- The initial approved SMS replacement provider is DeepInfra serving DeepSeek V4 Flash 0731.
- The current supported-currency set is expected to remain stable for the foreseeable future.
- The built-in category catalogue is expected to remain mostly stable, while a future separately specified feature will allow user-created custom categories.
- Cost reduction is a primary reason for the SMS provider migration; correctness and safety still take precedence over cache/reuse optimization.
- The selected provider's reusable-input feature may miss or be unavailable at times; a miss must affect cost only, never parsing correctness.
- Provider credentials and deployment configuration are available to the hosted SMS parsing environment through the project's existing deployment-secret/configuration mechanism.
- The existing SMS client contract and database schema are sufficient for this provider migration.
