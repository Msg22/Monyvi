# Feature Specification: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Feature Branch**: `389-voice-usage-limits`  
**Created**: 2026-09-27  
**Status**: Draft  
**Input**: User description: "Expand the voice-limit issue into the approved Add Transaction redesign: one Add Transaction page with Manual and Voice tabs, the existing manual form under Manual, the approved voice mockup under Voice, and the global Add Transaction FAB opening the same page with Manual selected; keep Gemini voice parsing unchanged, enforce daily voice limits, and remain ready for future subscription entitlements."

## Clarifications

### Session 2026-09-27

- Q: Does this feature replace the current voice AI provider? → A: No. The current voice provider and parsing behavior stay unchanged.
- Q: Is the client-side limit authoritative? → A: No. The server is authoritative; the client reflects server state for UX and may proactively block known-exhausted usage.
- Q: Does this feature implement subscriptions or paywalls? → A: No. It prepares a plan-aware entitlement boundary so a future subscriptions module can provide plan-specific allowances without redesigning voice.
- Q: Should users know about the limit before exhausting it? → A: Yes. The voice UI must clearly communicate that usage is limited, expose remaining availability, and show a friendly exhausted state.
- Q: What is the initial free-launch allowance and anti-abuse burst cap? → A: 5 provider-starting voice parses per authenticated user per local calendar day, with a burst cap of 2 provider-starting logical requests per minute.
- Q: When does a daily allowance reset? → A: At the start of each calendar day in the user's local timezone; the policy is not Egypt-specific because Monyvi may be used outside Egypt.
- Q: Which failed requests consume allowance? → A: Once provider execution actually starts, exactly one daily allowance unit is consumed for that logical request even if it later fails, times out, or returns invalid output. Requests rejected before provider start consume zero.
- Q: Is the approved mockup now part of this feature scope? → A: Yes. The current app does not yet match it; this issue now includes implementing that approved Add Transaction / Voice redesign. Do not regenerate or materially alter the approved mockup without new product approval.
- Q: How should the unified Add Transaction page behave? → A: It has Manual and Voice modes/tabs. Manual renders the existing manual transaction form; Voice renders the approved voice design. The global Add Transaction FAB opens this same page with Manual selected by default.
- Q: What reset copy should appear in the UI? → A: The latest approved mockup wording is "Your limit resets tomorrow at the same time" (and equivalent Arabic), but this conflicts with the earlier approved local-calendar-day reset semantics. [NEEDS CLARIFICATION: should the authoritative reset remain next local midnight, or should the accounting semantics change to a rolling 24-hour/same-time reset so UI copy and behavior match?]

## User Scenarios & Testing _(mandatory)_

### User Story 0 - Use One Unified Add Transaction Experience (Priority: P1)

As a Monyvi user, I want Manual and Voice transaction entry in one Add Transaction page, so that I can switch entry methods without navigating between unrelated screens.

**Why this priority**: The approved mockup is now the target product experience for this issue, and the global Add Transaction entry point must lead to the redesigned page consistently.

**Independent Test**: Open Add Transaction from the global FAB, verify Manual is selected and the existing transaction form is shown, switch to Voice and verify the approved voice experience is shown, then switch back without changing the underlying manual/voice transaction contracts.

**Acceptance Scenarios**:

1. **Given** the user taps the global Add Transaction FAB, **When** the Add Transaction page opens, **Then** the unified page is shown with **Manual** selected by default.
2. **Given** Manual is selected, **When** the page renders, **Then** the existing manual transaction form and its current submission behavior are presented inside the redesigned page.
3. **Given** the user switches to Voice, **When** Voice becomes active, **Then** the page matches the already-approved voice mockup and exposes the current voice transaction flow plus allowance state.
4. **Given** the user switches between Manual and Voice, **When** no submission has occurred, **Then** switching modes does not unexpectedly destroy unrelated transaction-entry state; exact retention behavior must follow current form/voice state contracts established during planning.
5. **Given** the app is in Arabic, **When** the unified page renders, **Then** the tab order, navigation affordances, layout direction, and copy are RTL-correct while preserving the approved design.
6. **Given** the app is in English, **When** the unified page renders, **Then** the same approved design is presented with correct LTR layout.
7. **Given** the approved mockup differs from today's existing screens, **When** implementation is reviewed, **Then** the approved mockup is treated as the visual target rather than the current screen as the target.

---

### User Story 1 - Understand and Use the Daily Voice Allowance (Priority: P1)

As a Monyvi user, I want to know how much voice usage I have available today and what happens when I reach the limit, so that I can use voice intentionally without unexpectedly hitting an invisible restriction.

**Why this priority**: The free-launch limit changes a visible product capability. It must be understandable before users encounter an exhausted state.

**Independent Test**: Sign in as a user with a known remaining voice allowance, open the voice-entry flow, use voice until the allowance reaches zero, and verify that remaining usage, exhausted behavior, and the next availability state are communicated clearly without changing transaction parsing behavior for allowed requests.

**Acceptance Scenarios**:

1. **Given** an authenticated user still has voice allowance remaining, **When** they open or use voice entry, **Then** the UI clearly communicates that voice usage is limited and reflects the current server-authoritative remaining allowance or equivalent availability state.
2. **Given** the user's remaining allowance changes after a successful allowed voice request, **When** the voice flow returns to an idle/ready state, **Then** the client refreshes and displays the updated server-authoritative allowance.
3. **Given** the authoritative allowance is exhausted, **When** the user reaches the voice entry surface, **Then** the UI shows a friendly exhausted state and does not present another voice parse as immediately available.
4. **Given** the client had stale optimistic allowance information, **When** the server rejects a request because the authoritative limit is exhausted, **Then** the client updates to the exhausted state instead of repeatedly retrying the provider.
5. **Given** the app is using Arabic, **When** allowance or exhausted-state copy is shown, **Then** it is localized consistently with the rest of the voice experience.

---

### User Story 2 - Enforce Voice Cost Controls on the Server (Priority: P1)

As the product owner, I want voice usage to be authoritatively limited per authenticated user on the server, so that free-launch voice costs and abuse are bounded even when a client is reinstalled, modified, stale, or making retries.

**Why this priority**: Client-only limits can be bypassed and cannot protect provider spend. Server-side enforcement is the business control.

**Independent Test**: Exercise allowed, exhausted, repeated, bursty, replayed, and failed voice requests against the server while manipulating or reinstalling the client, and verify that allowance is user-scoped, authoritative, idempotent for the same logical request where supported, and blocks provider execution after exhaustion.

**Acceptance Scenarios**:

1. **Given** an authenticated user is below the daily allowance and burst cap, **When** a valid voice request is submitted, **Then** it may proceed to the current voice provider.
2. **Given** a user has exhausted the daily allowance, **When** another voice request is submitted, **Then** the server rejects it before any new provider execution begins.
3. **Given** a user exceeds the configured short-window burst cap, **When** another voice request arrives during the protected window, **Then** the server temporarily rejects it without starting additional provider work.
4. **Given** the same logical voice request is retried in a way the existing request contract can identify, **When** the server processes the replay, **Then** it does not consume multiple allowances for one logical provider-starting request.
5. **Given** the user reinstalls the app, signs in on another supported device, or tampers with local state, **When** voice availability is checked, **Then** the same server-authoritative user allowance applies.
6. **Given** a request is rejected before provider start because of quota, burst, consent, authentication, malformed input, or another existing pre-provider refusal, **When** accounting is reconciled, **Then** it does not consume a provider-start allowance.
7. **Given** voice usage accounting or availability state is temporarily unavailable, **When** a new provider-starting voice request is attempted, **Then** the server fails closed rather than bypassing the usage control.

---

### User Story 3 - Prepare Voice Entitlements for Future Subscription Plans (Priority: P2)

As a Monyvi maintainer, I want the voice flow to consume a general entitlement result rather than a permanent hardcoded free-launch rule, so that future subscription plans can provide different voice allowances without redesigning the voice parser or client flow.

**Why this priority**: The free-launch limit is temporary product policy. The architecture must not make today's marketing allowance the permanent voice contract.

**Independent Test**: Substitute two controlled entitlement profiles with different allowances and verify that the same voice request flow, UI state model, and provider integration honor each policy without changing the voice parsing contract or provider-specific implementation.

**Acceptance Scenarios**:

1. **Given** the free-launch policy is active, **When** voice availability is evaluated, **Then** the current configurable free-launch allowance is used.
2. **Given** a future subscription module supplies a different plan entitlement, **When** voice availability is evaluated, **Then** the voice flow can consume that entitlement without changing the voice transaction parsing contract.
3. **Given** two future plans have different voice allowances, **When** users on those plans check or use voice, **Then** each user receives the allowance defined by their active entitlement.
4. **Given** a future plan is described as effectively unlimited, **When** that entitlement is introduced later, **Then** this feature does not require the current free-launch numeric quota to remain hardcoded in voice parsing code.
5. **Given** subscription pricing, tier names, exact paid quotas, or paywall behavior have not yet been approved, **When** this feature is delivered, **Then** none of those future business decisions are invented or exposed prematurely.

### Edge Cases

- The user partially fills the Manual form, switches to Voice, then returns to Manual.
- The user records/starts Voice, then attempts to switch to Manual while recording or processing.
- The global FAB opens Add Transaction while a previous Add Transaction route instance/state exists.
- The Voice mode is exhausted but Manual entry remains fully available.
- The app language changes between English and Arabic while the redesigned page is reachable.
- The approved mockup spacing/layout conflicts with a small screen or accessibility text scaling; behavior must preserve semantics without silently redesigning the approved composition.

- A request reaches the server at the exact daily-reset boundary.
- Two requests arrive concurrently when only one daily allowance unit remains.
- Multiple devices for the same authenticated user submit voice requests at nearly the same time.
- The client displays stale remaining usage after another device consumes allowance.
- A request is admitted but the provider times out, errors, or returns malformed/invalid output.
- A request is retried after an ambiguous network response.
- The user loses network connectivity while the client believes allowance remains.
- The server-side allowance service is unavailable.
- The current voice provider is changed in a later feature while the entitlement contract remains the same.
- A future subscription entitlement changes while the app is open.
- The user signs out and another user signs in on the same device; allowance state must never leak across users.
- The limit is disabled or increased operationally during the free-launch period.
- The UI cannot load a fresh allowance state; it must not falsely claim additional usage is available.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The current voice parsing provider, request/response transaction contract, and parsing behavior MUST remain unchanged by this feature.
- **FR-002**: The system MUST enforce an authenticated-user-scoped daily allowance of 5 provider-starting voice parses per local calendar day.
- **FR-003**: The daily allowance value MUST be configurable operational policy rather than permanently hardcoded into voice parsing behavior.
- **FR-004**: The system MUST enforce a configurable burst/rate limit whose initial free-launch value is no more than 2 provider-starting logical voice requests per minute per authenticated user.
- **FR-005**: The server MUST be authoritative for voice availability, usage consumption, reset state, and exhausted decisions.
- **FR-006**: The client MUST NOT be treated as a security, billing, or cost-control authority for voice usage.
- **FR-007**: The system MUST reject an exhausted user's new provider-starting voice request before starting provider execution.
- **FR-008**: The system MUST reject a burst-limited request before starting provider execution.
- **FR-009**: Voice usage accounting MUST be scoped to the authenticated user and MUST NOT reset because of app reinstall, local-data deletion, or switching devices.
- **FR-010**: Where the current request contract can identify one logical request across retries/replays, usage accounting MUST avoid consuming multiple daily units for that same logical provider-starting request.
- **FR-011**: Existing voice authentication, AI consent, request validation, response validation, and user-scope protections MUST remain authoritative and MUST NOT be bypassed by the new quota flow.
- **FR-012**: Requests refused before provider start because of authentication, consent, malformed input, exhausted allowance, burst limit, or unavailable authoritative quota state MUST NOT consume a provider-start allowance.
- **FR-013**: Once provider execution actually starts, the logical voice request MUST consume exactly one daily allowance unit even if the provider later fails, times out, returns malformed/invalid output, or the final outcome is otherwise unsuccessful; requests rejected before provider start MUST consume zero.
- **FR-014**: The client MUST expose a clear voice-usage-limited state before exhaustion and a distinct exhausted state after the authoritative daily allowance reaches zero.
- **FR-015**: The client MUST refresh from server-authoritative availability after a voice attempt and whenever a server response shows its local allowance state is stale.
- **FR-016**: The client SHOULD display remaining voice usage as a concrete count when the authoritative policy provides a numeric allowance; exact visual placement and styling require the normal Monyvi mockup approval workflow before UI implementation.
- **FR-017**: When the allowance is exhausted, the client MUST prevent another known-exhausted provider attempt and communicate that voice becomes available again at the start of the next local calendar day according to the user's local timezone.
- **FR-018**: User-visible voice limit, remaining-usage, exhausted, and recovery copy MUST support English and Arabic.
- **FR-019**: Voice allowance state shown for one authenticated user MUST NOT be shown to another user on the same device.
- **FR-020**: The system MUST expose a provider-independent voice entitlement result that can represent at least the current free-launch policy and future plan-specific allowances.
- **FR-021**: The voice parser MUST consume entitlement/allowance decisions without embedding future subscription tier names, prices, or permanent plan logic inside provider-specific code.
- **FR-022**: A future subscriptions module MUST be able to supply plan-specific voice entitlements without changing the current voice transaction parsing contract.
- **FR-023**: Exact subscription tier names, prices, paid quotas, billing, purchase flows, paywall UI, and "unlimited" commercial policy are OUT OF SCOPE for this feature.
- **FR-024**: The feature MUST NOT introduce a voice-provider migration, ASR pipeline, or alternative-model routing.
- **FR-025**: Operational limit changes MUST NOT require a mobile release solely to adjust the free-launch daily allowance or burst cap.
- **FR-026**: Voice usage/entitlement failures MUST fail closed for new provider-starting requests and MUST NOT silently bypass the authoritative limit.
- **FR-027**: Usage/availability telemetry MUST be privacy-safe and MUST NOT expose raw voice audio, transcript text, credentials, or financial transaction content solely for quota accounting.
- **FR-028**: The feature MUST implement the already-approved Add Transaction / Voice mockup as the target user-facing redesign; it MUST NOT generate, substitute, or materially redesign that approved mockup without new product approval.
- **FR-029**: The app MUST expose one unified Add Transaction page containing Manual and Voice modes/tabs.
- **FR-030**: Manual mode MUST render the existing manual transaction form and preserve its existing transaction-entry/submission behavior.
- **FR-031**: Voice mode MUST render the approved voice design and preserve the current voice provider/parsing transaction contract while integrating allowance/remaining/exhausted states.
- **FR-032**: The global Add Transaction FAB MUST navigate to the unified Add Transaction page with Manual selected by default.
- **FR-033**: Switching between Manual and Voice MUST use one page/shell and MUST NOT require separate unrelated navigation destinations.
- **FR-034**: Manual entry MUST remain available when Voice is exhausted, burst-limited, or temporarily unavailable.
- **FR-035**: The redesigned Add Transaction page MUST support English/LTR and Arabic/RTL behavior consistent with the approved mockup and existing application localization standards.
- **FR-036**: Any implementation-specific handling of mode switching during active recording/processing or partially completed manual entry MUST preserve current transaction safety and MUST be documented in planning before implementation.

### Key Entities

- **Voice Entitlement Policy**: The active business allowance applicable to one user, including whether voice is available, a daily allowance when numeric, burst policy, and reset semantics. The free-launch policy is one entitlement source; future subscription plans are another.
- **Voice Usage State**: The authoritative per-user state used to determine remaining daily usage, exhaustion, burst availability, and next availability.
- **Logical Voice Request**: One user-initiated voice parsing operation whose retries/replays should not consume multiple allowances when stable request identity is available.
- **Voice Availability Result**: The server-authoritative result the client can use to render available, limited, temporarily burst-limited, exhausted, or unavailable/recovery states.
- **Future Subscription Entitlement**: A later plan-provided policy that may replace the free-launch allowance without changing voice parsing behavior.

## Scope Boundaries

### In Scope

- Implementation of the already-approved Add Transaction / Voice mockup as a new unified Manual/Voice transaction-entry page.
- Routing the global Add Transaction FAB to the unified page with Manual selected by default.
- Reusing the existing manual transaction form inside Manual mode.
- Reusing the existing voice parsing contract inside the approved Voice redesign.
- Server-authoritative daily per-user voice usage limits.
- Configurable free-launch allowance and burst protection.
- Idempotent usage accounting where the existing request identity supports it.
- Voice availability/remaining usage state for the client.
- Client-side UX that communicates limits, remaining availability, exhausted state, and next availability.
- English and Arabic limit-related copy.
- A provider-independent entitlement boundary prepared for future subscription plans.
- Safe multi-device and user-switch behavior for allowance state.
- Manual and automated QA for quota, reset, replay, burst, concurrency, stale-client, and exhausted scenarios.

### Out of Scope

- Changing the current voice AI provider or model.
- Implementing Cohere/Qwen/Whisper/self-hosted ASR pipelines.
- Subscription checkout, billing, payment processing, paywalls, trials, upgrade flows, prices, plan names, or final paid-plan quotas.
- Automatic model/provider fallback.
- Voice-quality benchmarking or ASR research.
- Changing the voice transaction schema or transaction-review behavior.
- Unrelated SMS AI provider work.
- Database or sync changes not strictly required by the approved voice usage/accounting contract.
- Any additional UI redesign beyond the already-approved Add Transaction / Voice mockup and the states required to make that approved design functional.

## Dependencies

- Existing voice authentication, AI consent, request validation, structured transaction parsing, and response validation remain authoritative.
- Current voice parsing continues using its existing provider until a separately approved provider-migration feature changes it.
- Existing user identity/session behavior remains authoritative for allowance ownership.
- The approved Add Transaction / Voice mockup from this discussion is the binding visual target for this feature; implementation planning must preserve it and record the repository binding metadata required by Monyvi's UI workflow.
- Future subscriptions work will own paid plan definitions, commercial rules, and the source that supplies plan-specific entitlements.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of test cases beyond the 5-per-local-calendar-day allowance reject new provider-starting voice requests before provider execution.
- **SC-002**: 100% of test cases above 2 provider-starting logical voice requests per minute reject the excess provider-starting request before provider execution.
- **SC-003**: 100% of pre-provider refusals covered by this feature consume zero daily provider-start allowance.
- **SC-004**: Replaying the same identifiable logical voice request does not consume more than one daily allowance unit in 100% of idempotency test cases.
- **SC-005**: Concurrent last-unit test cases never permit more provider-starting requests than the authoritative allowance permits.
- **SC-006**: Client-visible remaining/exhausted state matches server-authoritative state after every tested voice attempt, stale-state rejection, user switch, and multi-device update.
- **SC-007**: 100% of English and Arabic voice-limit states have localized user-visible copy before release.
- **SC-008**: Existing representative voice parsing scenarios that are within allowance produce the same transaction result contract and user flow as before this feature.
- **SC-009**: A controlled alternate entitlement profile with a different allowance can be applied without changing the voice transaction parsing contract.
- **SC-010**: Adjusting the free-launch daily allowance or burst cap can be performed operationally without requiring a new mobile application release.
- **SC-011**: Routine quota/accounting QA records no raw audio, transcript, provider credential, or financial content in usage telemetry.
- **SC-012**: 100% of FAB-entry navigation tests open the unified Add Transaction page with Manual selected and the existing manual form available.
- **SC-013**: Manual-to-Voice and Voice-to-Manual switching tests use the same Add Transaction page and preserve the existing manual/voice transaction contracts.
- **SC-014**: Approved-mockup review confirms the implemented Voice mode and unified Add Transaction shell match the approved design in English/LTR and Arabic/RTL, subject only to explicitly approved accessibility/responsive adaptations.
- **SC-015**: Exhausting or temporarily blocking Voice never prevents the user from switching to and using Manual entry.

## Assumptions

- Monyvi remains in a free-launch/pre-subscription phase while this feature ships.
- Users are authenticated when using voice entry; guest voice usage is not introduced.
- The current voice provider is retained for this feature.
- The client will show the concrete remaining count and exhausted state using the already-approved Add Transaction / Voice mockup; no new mockup should be generated unless the product owner explicitly requests a redesign.
- Burst protection is a secondary abuse/retry safeguard and does not replace the daily allowance; the initial free-launch policy is 2 provider-starting logical requests per minute.
- Future subscriptions will provide an entitlement policy rather than requiring provider-specific plan branching.
- The allowance policy can be changed operationally without embedding commercial plan details in the mobile client.
- "Daily" means a calendar day in the user's local timezone rather than Egypt time or UTC; timezone-source and anti-abuse mechanics for timezone changes are planning details and must preserve server-authoritative accounting.
- Exact paid subscription policies are intentionally deferred.
