# Feature Specification: Voice Usage Limits and Subscription-Ready Entitlements

**Feature Branch**: `389-voice-usage-limits`  
**Created**: 2026-09-27  
**Status**: Approved  
**Input**: User description: "Keep the current voice provider for the free-launch phase, enforce configurable daily voice usage limits on the server and reflect them in the client UI, and make the quota model ready for future subscription-plan entitlements without redesigning the voice flow."

## Clarifications

### Session 2026-09-27

- Q: Does this feature replace the current voice AI provider? → A: No. The current voice provider and parsing behavior stay unchanged.
- Q: Is the client-side limit authoritative? → A: No. The server is authoritative; the client reflects server state for UX and may proactively block known-exhausted usage.
- Q: Does this feature implement subscriptions or paywalls? → A: No. It prepares a plan-aware entitlement boundary so a future subscriptions module can provide plan-specific allowances without redesigning voice.
- Q: Should users know about the limit before exhausting it? → A: Yes. The voice UI must clearly communicate that usage is limited, expose remaining availability, and show a friendly exhausted state.
- Q: What is the initial free-launch allowance and anti-abuse burst cap? → A: 5 provider-starting voice parses per authenticated user per local calendar day, with a burst cap of 2 provider-starting logical requests per minute.
- Q: When does a daily allowance reset? → A: At the start of each calendar day in the user's local timezone; the policy is not Egypt-specific because Monyvi may be used outside Egypt.
- Q: Which failed requests consume allowance? → A: Once provider execution actually starts, exactly one daily allowance unit is consumed for that logical request even if it later fails, times out, or returns invalid output. Requests rejected before provider start consume zero.

## User Scenarios & Testing _(mandatory)_

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

### Key Entities

- **Voice Entitlement Policy**: The active business allowance applicable to one user, including whether voice is available, a daily allowance when numeric, burst policy, and reset semantics. The free-launch policy is one entitlement source; future subscription plans are another.
- **Voice Usage State**: The authoritative per-user state used to determine remaining daily usage, exhaustion, burst availability, and next availability.
- **Logical Voice Request**: One user-initiated voice parsing operation whose retries/replays should not consume multiple allowances when stable request identity is available.
- **Voice Availability Result**: The server-authoritative result the client can use to render available, limited, temporarily burst-limited, exhausted, or unavailable/recovery states.
- **Future Subscription Entitlement**: A later plan-provided policy that may replace the free-launch allowance without changing voice parsing behavior.

## Scope Boundaries

### In Scope

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
- Any UI redesign beyond the voice-limit states required by this feature.

## Dependencies

- Existing voice authentication, AI consent, request validation, structured transaction parsing, and response validation remain authoritative.
- Current voice parsing continues using its existing provider until a separately approved provider-migration feature changes it.
- Existing user identity/session behavior remains authoritative for allowance ownership.
- Any meaningful visible UI change requires approved mockups and binding metadata before implementation.
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

## Assumptions

- Monyvi remains in a free-launch/pre-subscription phase while this feature ships.
- Users are authenticated when using voice entry; guest voice usage is not introduced.
- The current voice provider is retained for this feature.
- The client will show a concrete remaining count when a numeric daily entitlement applies; exact composition awaits approved mockups.
- Burst protection is a secondary abuse/retry safeguard and does not replace the daily allowance; the initial free-launch policy is 2 provider-starting logical requests per minute.
- Future subscriptions will provide an entitlement policy rather than requiring provider-specific plan branching.
- The allowance policy can be changed operationally without embedding commercial plan details in the mobile client.
- "Daily" means a calendar day in the user's local timezone rather than Egypt time or UTC; timezone-source and anti-abuse mechanics for timezone changes are planning details and must preserve server-authoritative accounting.
- Exact paid subscription policies are intentionally deferred.
