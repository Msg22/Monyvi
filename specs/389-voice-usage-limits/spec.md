# Feature Specification: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Feature Branch**: `389-voice-usage-limits`  
**Created**: 2026-09-27  
**Status**: Approved  
**Input**: User description: "Expand the voice-limit issue into the approved Add
Transaction redesign: one Add Transaction page with Manual and Voice tabs, the
existing manual form under Manual, the approved voice mockup under Voice, and
the global Add Transaction FAB opening the same page with Manual selected; keep
Gemini voice parsing unchanged, enforce daily voice limits, and remain ready for
future subscription entitlements."

## Clarifications

### Session 2026-09-27

- Q: Does this feature replace the current voice AI provider? → A: No. The
  current voice provider and parsing behavior stay unchanged.
- Q: Is the client-side limit authoritative? → A: No. The server is
  authoritative; the client reflects server state for UX and may proactively
  block known-exhausted usage.
- Q: Does this feature implement subscriptions or paywalls? → A: No. It prepares
  a plan-aware entitlement boundary so a future subscriptions module can provide
  plan-specific allowances without redesigning voice.
- Q: Should users know about the limit before exhausting it? → A: Yes. The voice
  UI must clearly communicate that usage is limited, expose remaining
  availability, and show a friendly exhausted state.
- Q: What is the initial free-launch allowance and anti-abuse burst cap? → A: 5
  provider-starting voice parses per authenticated user per local calendar day,
  with a burst cap of 2 provider-starting logical requests per minute.
- Q: When does a daily allowance reset? → A: At the start of each calendar day
  in the user's local timezone; the policy is not Egypt-specific because Monyvi
  may be used outside Egypt.
- Q: Which failed requests consume allowance? → A: Once provider execution
  actually starts, exactly one daily allowance unit is consumed for that logical
  request even if it later fails, times out, or returns invalid output. Requests
  rejected before provider start consume zero.
- Q: Is the approved mockup now part of this feature scope? → A: Yes. The
  current app does not yet match it; this issue now includes implementing that
  approved Add Transaction / Voice redesign. Do not regenerate or materially
  alter the approved mockup without new product approval.
- Q: How should the unified Add Transaction page behave? → A: It has Manual and
  Voice modes/tabs. Manual renders the existing manual transaction form; Voice
  renders the approved voice design. The global Add Transaction FAB opens this
  same page with Manual selected by default.
- Q: What reset behavior and copy are authoritative? → A: The allowance resets
  at the start of the next calendar day in the user’s local timezone (local
  midnight). The UI copy must reflect that behavior and must not say "tomorrow
  at the same time".

### Session 2026-10-07

- Q: How long must same-key voice replay protection last? → A: Retain request
  identity for 35 elapsed days from its first server-created record, then delete
  eligible terminal records. Preserve active work and records still needed by
  daily/burst accounting. After an expired identity is actually deleted, the
  same key may be admitted as new under current auth, consent, validation and
  quota gates. This is not lifetime replay protection.

### Session 2026-10-10 — approved UI repair

- The owner approved all five exact bindings in
  `mockups/repair-binding-manifest.json`; see `reconciliation.md` for the
  immutable manifest revision and approval receipt. These references supersede
  the old two-reference layout for the repaired surfaces; historical images and
  approvals remain unchanged.
- Manual uses compact ordinary GroupedMoneyInput, a normal-width
  account/category row and shared optional fields. Its custom calculator appears
  only on amount focus, suppresses the native soft keyboard, and Done dismisses
  without saving. Header Save preserves existing local validation/submission.
  Transfer, recurring, currencies/conversion, balances, budgets and offline
  behavior remain intact.
- Manual has no Voice quota or availability-check failure surface. Voice keeps
  the unboxed microphone, exact locale-specific idle/daily-limit compositions,
  shared underline tabs and approved recovery states.
- Standalone navigation, local-midnight reset and current financial/parsing
  contracts remain authoritative. Held-reservation bug #384 remains deferred;
  this repair does not change SQL, snapshots, sync or quota contracts.

### Session 2026-10-10 — approved Voice motion/interaction overlay

- Owner explicitly approved `2026-10-10-voice-motion-r1` in
  `mockups/drafts/2026-10-10-voice-motion-r1/approval.json`:
  “mockups approved” / “Approve the proposal”,
  `approvedManifestSha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799`,
  `proposalSha256:06e5e987543d85a2c90c57aaad695569ca904cc122571da47bae7195d2b9f4b0`.
  The overlay `mockups/voice-motion-binding-context.md` records scoped states,
  copy, components and existing tokens; it is not a new approval gate.
- The new approval applies **only** to dark idle badge/example icon colors,
  account-scoped dismissible examples, immediate Starting/Cancel feedback,
  decorative recording/parsing motion, native permission inline explanation and
  direct/error/unavailable retry transitions. The earlier five original PNGs,
  sidecars, manifest and Manual B remain frozen; server accounting, existing
  Gemini review and 35-day replay retention remain unchanged; #384 deferred.
- New source images are 853×1844 **raster pixels**, not replacement logical
  viewport measurements. Existing normalized 390×844 dp, 104/140/172 dp mic,
  48 dp shared interactive minimum, 16 dp gutters and responsive/RTL/dark
  contract remain authoritative. The approved example dismiss proposal gives
  ≥44 dp; the established ≥48 dp interactive target satisfies both.
- The owner still owns device/rendered/accessibility evidence; no remote test
  authoring, native/device runs or `speckit.analyze` are claimed by this
  planning continuation.

## User Scenarios & Testing _(mandatory)_

### User Story 0 - Use One Unified Add Transaction Experience (Priority: P1)

As a Monyvi user, I want Manual and Voice transaction entry in one Add
Transaction page, so that I can switch entry methods without navigating between
unrelated screens.

**Why this priority**: The approved mockup is now the target product experience
for this issue, and the global Add Transaction entry point must lead to the
redesigned page consistently.

**Independent Test**: Open Add Transaction from the global FAB, verify Manual is
selected and the existing transaction form is shown, switch to Voice and verify
the approved voice experience is shown, then switch back without changing the
underlying manual/voice transaction contracts.

**Acceptance Scenarios**:

1. **Given** the user taps the global Add Transaction FAB, **When** the Add
   Transaction page opens, **Then** the unified page is shown with **Manual**
   selected by default.
2. **Given** Manual is selected, **When** the page renders, **Then** the
   existing manual transaction form and its current submission behavior are
   presented in the approved compact layout inside the redesigned page. Amount
   focus opens only the custom keypad; Done dismisses it without saving, and
   header Save retains existing validation/local submission.
3. **Given** the user switches to Voice, **When** Voice becomes active, **Then**
   the page matches the already-approved voice mockup and exposes the current
   voice transaction flow plus allowance state.
4. **Given** the user switches between Manual and Voice, **When** no submission
   has occurred, **Then** switching modes does not unexpectedly destroy
   unrelated transaction-entry state; exact retention behavior must follow
   current form/voice state contracts established during planning.
5. **Given** the app is in Arabic, **When** the unified page renders, **Then**
   the tab order, navigation affordances, layout direction, and copy are
   RTL-correct while preserving the approved design.
6. **Given** the app is in English, **When** the unified page renders, **Then**
   the same approved design is presented with correct LTR layout.
7. **Given** the approved mockup differs from today's existing screens, **When**
   implementation is reviewed, **Then** the approved mockup is treated as the
   visual target rather than the current screen as the target.
8. **Given** Voice is loading, exhausted, burst-limited or unavailable, **When**
   Manual is selected, **Then** Manual shows no Voice quota/failure notice and
   its ordinary amount input, required selectors and Save remain usable.
9. **Given** the approved English and Arabic references differ, **When** each
   Voice idle/daily state renders, **Then** its respective progress, examples,
   alert and recovery composition is preserved rather than homogenized.
10. **Given** the user's current account has not dismissed examples, **When**
    they tap the accessible dismiss control, **Then** the full card disappears
    and stays hidden for that account on this device after route/restart/theme/
    locale/sign-out/sign-in; another authenticated account's preference is
    independent and no server data changes.
11. **Given** Voice is ready, **When** they tap the mic once or rapidly again,
    **Then** Starting/Cancel is immediately visible, exactly one valid recorder
    start can occur, and a real recording timer/listening display begins only
    after native capture starts.
12. **Given** a pending start is canceled, native start fails, or microphone
    permission is pending/denied, **When** the deferred work resolves, **Then**
    it cannot resume stale recording or falsely show Listening. Missing native
    permission uses the approved inline custom explanation, while genuine
    first-use AI processing consent remains mandatory.
13. **Given** recording is active, paused or parsing, **When** its state changes,
    **Then** decorative ripple/bars or waveform/receipt motion matches the
    approved state, paused time is frozen, reduced-motion substitutes a static
    representation, and all loops/timers stop on discard/unmount/account change.
14. **Given** a recording failure or authoritative availability check failure,
    **When** Try again is tapped, **Then** it transitions directly to Starting
    without an idle flash only if eligible. A retained-audio submission retry
    reuses the existing request identity without starting a second microphone
    recording; daily/burst/consent gates still hold.

---

### User Story 1 - Understand and Use the Daily Voice Allowance (Priority: P1)

As a Monyvi user, I want to know how much voice usage I have available today and
what happens when I reach the limit, so that I can use voice intentionally
without unexpectedly hitting an invisible restriction.

**Why this priority**: The free-launch limit changes a visible product
capability. It must be understandable before users encounter an exhausted state.

**Independent Test**: Sign in as a user with a known remaining voice allowance,
open the voice-entry flow, use voice until the allowance reaches zero, and
verify that remaining usage, exhausted behavior, and the next availability state
are communicated clearly without changing transaction parsing behavior for
allowed requests.

**Acceptance Scenarios**:

1. **Given** an authenticated user still has voice allowance remaining, **When**
   they open or use voice entry, **Then** the UI clearly communicates that voice
   usage is limited and reflects the current server-authoritative remaining
   allowance or equivalent availability state.
2. **Given** the user's remaining allowance changes after a successful allowed
   voice request, **When** the voice flow returns to an idle/ready state,
   **Then** the client refreshes and displays the updated server-authoritative
   allowance.
3. **Given** the authoritative allowance is exhausted, **When** the user reaches
   the voice entry surface, **Then** the UI shows a friendly exhausted state and
   does not present another voice parse as immediately available.
4. **Given** the client had stale optimistic allowance information, **When** the
   server rejects a request because the authoritative limit is exhausted,
   **Then** the client updates to the exhausted state instead of repeatedly
   retrying the provider.
5. **Given** the app is using Arabic, **When** allowance or exhausted-state copy
   is shown, **Then** it is localized consistently with the rest of the voice
   experience.

---

### User Story 2 - Enforce Voice Cost Controls on the Server (Priority: P1)

As the product owner, I want voice usage to be authoritatively limited per
authenticated user on the server, so that free-launch voice costs and abuse are
bounded even when a client is reinstalled, modified, stale, or making retries.

**Why this priority**: Client-only limits can be bypassed and cannot protect
provider spend. Server-side enforcement is the business control.

**Independent Test**: Exercise allowed, exhausted, repeated, bursty, replayed,
and failed voice requests against the server while manipulating or reinstalling
the client, and verify that allowance is user-scoped, authoritative, idempotent
for the same logical request where supported, and blocks provider execution
after exhaustion.

**Acceptance Scenarios**:

1. **Given** an authenticated user is below the daily allowance and burst cap,
   **When** a valid voice request is submitted, **Then** it may proceed to the
   current voice provider.
2. **Given** a user has exhausted the daily allowance, **When** another voice
   request is submitted, **Then** the server rejects it before any new provider
   execution begins.
3. **Given** a user exceeds the configured short-window burst cap, **When**
   another voice request arrives during the protected window, **Then** the
   server temporarily rejects it without starting additional provider work.
4. **Given** the same logical voice request is retried in a way the existing
   request contract can identify, **When** the server processes the replay
   within the 35-day protection horizon or while its record remains retained,
   **Then** it does not consume multiple allowances for that provider-starting
   request. After eligible deletion, the key may represent a new admitted
   attempt subject to current gates.
5. **Given** the user reinstalls the app, signs in on another supported device,
   or tampers with local state, **When** voice availability is checked, **Then**
   the same server-authoritative user allowance applies.
6. **Given** a request is rejected before provider start because of quota,
   burst, consent, authentication, malformed input, or another existing
   pre-provider refusal, **When** accounting is reconciled, **Then** it does not
   consume a provider-start allowance.
7. **Given** voice usage accounting or availability state is temporarily
   unavailable, **When** a new provider-starting voice request is attempted,
   **Then** the server fails closed rather than bypassing the usage control.

---

### User Story 3 - Prepare Voice Entitlements for Future Subscription Plans (Priority: P2)

As a Monyvi maintainer, I want the voice flow to consume a general entitlement
result rather than a permanent hardcoded free-launch rule, so that future
subscription plans can provide different voice allowances without redesigning
the voice parser or client flow.

**Why this priority**: The free-launch limit is temporary product policy. The
architecture must not make today's marketing allowance the permanent voice
contract.

**Independent Test**: Substitute two controlled entitlement profiles with
different allowances and verify that the same voice request flow, UI state
model, and provider integration honor each policy without changing the voice
parsing contract or provider-specific implementation.

**Acceptance Scenarios**:

1. **Given** the free-launch policy is active, **When** voice availability is
   evaluated, **Then** the current configurable free-launch allowance is used.
2. **Given** a future subscription module supplies a different plan entitlement,
   **When** voice availability is evaluated, **Then** the voice flow can consume
   that entitlement without changing the voice transaction parsing contract.
3. **Given** two future plans have different voice allowances, **When** users on
   those plans check or use voice, **Then** each user receives the allowance
   defined by their active entitlement.
4. **Given** a future plan is described as effectively unlimited, **When** that
   entitlement is introduced later, **Then** this feature does not require the
   current free-launch numeric quota to remain hardcoded in voice parsing code.
5. **Given** subscription pricing, tier names, exact paid quotas, or paywall
   behavior have not yet been approved, **When** this feature is delivered,
   **Then** none of those future business decisions are invented or exposed
   prematurely.

### Edge Cases

- The user partially fills the Manual form, switches to Voice, then returns to
  Manual.
- The user records/starts Voice, then attempts to switch to Manual while
  recording or processing.
- The global FAB opens Add Transaction while a previous Add Transaction route
  instance/state exists.
- The Voice mode is exhausted but Manual entry remains fully available.
- The app language changes between English and Arabic while the redesigned page
  is reachable.
- The approved mockup spacing/layout conflicts with a small screen or
  accessibility text scaling; behavior must preserve semantics without silently
  redesigning the approved composition.

- A request reaches the server at the exact daily-reset boundary.
- Two requests arrive concurrently when only one daily allowance unit remains.
- Multiple devices for the same authenticated user submit voice requests at
  nearly the same time.
- The client displays stale remaining usage after another device consumes
  allowance.
- A request is admitted but the provider times out, errors, or returns
  malformed/invalid output.
- A request is retried after an ambiguous network response.
- Cleanup reaches the exact 35-elapsed-day cutoff; a terminal identity is
  deleted only outside active accounting/work, and a later same-key request is
  admitted as new only through current gates.
- Cleanup races with admission/provider start; it must not delete an active
  request or alter current allowance/burst counts.
- The user loses network connectivity while the client believes allowance
  remains.
- The server-side allowance service is unavailable.
- The current voice provider is changed in a later feature while the entitlement
  contract remains the same.
- A future subscription entitlement changes while the app is open.
- The user signs out and another user signs in on the same device; allowance
  state must never leak across users.
- The limit is disabled or increased operationally during the free-launch
  period.
- The UI cannot load a fresh allowance state; it must not falsely claim
  additional usage is available.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The current voice parsing provider, request/response transaction
  contract, and parsing behavior MUST remain unchanged by this feature.
- **FR-002**: The system MUST enforce an authenticated-user-scoped daily
  allowance of 5 provider-starting voice parses per local calendar day.
- **FR-003**: The daily allowance value MUST be configurable operational policy
  rather than permanently hardcoded into voice parsing behavior.
- **FR-004**: The system MUST enforce a configurable burst/rate limit whose
  initial free-launch value is no more than 2 provider-starting logical voice
  requests per minute per authenticated user.
- **FR-005**: The server MUST be authoritative for voice availability, usage
  consumption, reset state, and exhausted decisions.
- **FR-006**: The client MUST NOT be treated as a security, billing, or
  cost-control authority for voice usage.
- **FR-007**: The system MUST reject an exhausted user's new provider-starting
  voice request before starting provider execution.
- **FR-008**: The system MUST reject a burst-limited request before starting
  provider execution.
- **FR-009**: Voice usage accounting MUST be scoped to the authenticated user
  and MUST NOT reset because of app reinstall, local-data deletion, or switching
  devices.
- **FR-010**: Where the request contract identifies one logical request across
  retries/replays, usage accounting MUST avoid multiple daily units for that
  request for 35 elapsed days from its first server-created record, and while
  the record remains retained. At or after that cutoff, cleanup MUST delete
  eligible terminal request identities outside active accounting/work. Active
  work and records needed for current daily/burst accounting MUST survive
  cleanup. After actual deletion, the same key MAY be admitted as a new attempt
  subject to all current gates; lifetime replay protection is not promised.
- **FR-011**: Existing voice authentication, AI consent, request validation,
  response validation, and user-scope protections MUST remain authoritative and
  MUST NOT be bypassed by the new quota flow.
- **FR-012**: Requests refused before provider start because of authentication,
  consent, malformed input, exhausted allowance, burst limit, or unavailable
  authoritative quota state MUST NOT consume a provider-start allowance.
- **FR-013**: Once provider execution actually starts, each admitted logical
  voice request MUST consume exactly one daily allowance unit even if the
  provider later fails, times out, returns malformed/invalid output, or the
  final outcome is otherwise unsuccessful; requests rejected before provider
  start MUST consume zero. Replay identity and any new admission after retention
  expiry follow FR-010; cleanup MUST NOT refund consumption inside an active
  accounting window.
- **FR-014**: The client MUST expose a clear voice-usage-limited state before
  exhaustion and a distinct exhausted state after the authoritative daily
  allowance reaches zero.
- **FR-015**: The client MUST refresh from server-authoritative availability
  after a voice attempt and whenever a server response shows its local allowance
  state is stale.
- **FR-016**: The client SHOULD display remaining voice usage as a concrete
  count when the authoritative policy provides a numeric allowance; exact visual
  placement and styling require the normal Monyvi mockup approval workflow
  before UI implementation.
- **FR-017**: When the allowance is exhausted, the client MUST prevent another
  known-exhausted provider attempt and communicate that voice becomes available
  again at the start of the next local calendar day according to the user's
  local timezone; user-facing copy MUST describe the next-day reset accurately
  and MUST NOT imply a rolling 24-hour or "same time tomorrow" reset.
- **FR-018**: User-visible voice limit, remaining-usage, exhausted, and recovery
  copy MUST support English and Arabic.
- **FR-019**: Voice allowance state shown for one authenticated user MUST NOT be
  shown to another user on the same device.
- **FR-020**: The system MUST expose a provider-independent voice entitlement
  result that can represent at least the current free-launch policy and future
  plan-specific allowances.
- **FR-021**: The voice parser MUST consume entitlement/allowance decisions
  without embedding future subscription tier names, prices, or permanent plan
  logic inside provider-specific code.
- **FR-022**: A future subscriptions module MUST be able to supply plan-specific
  voice entitlements without changing the current voice transaction parsing
  contract.
- **FR-023**: Exact subscription tier names, prices, paid quotas, billing,
  purchase flows, paywall UI, and "unlimited" commercial policy are OUT OF SCOPE
  for this feature.
- **FR-024**: The feature MUST NOT introduce a voice-provider migration, ASR
  pipeline, or alternative-model routing.
- **FR-025**: Operational limit changes MUST NOT require a mobile release solely
  to adjust the free-launch daily allowance or burst cap.
- **FR-026**: Voice usage/entitlement failures MUST fail closed for new
  provider-starting requests and MUST NOT silently bypass the authoritative
  limit.
- **FR-027**: Usage/availability telemetry MUST be privacy-safe and MUST NOT
  expose raw voice audio, transcript text, credentials, or financial transaction
  content solely for quota accounting.
- **FR-028**: The feature MUST implement the exact approved Add Transaction
  reference set identified by `mockups/repair-binding-manifest.json` and
  `reconciliation.md`. Each active image/sidecar MUST pass the binding verifier.
  Superseded references remain history; no substitution or material redesign is
  permitted without renewed product approval.
- **FR-029**: The app MUST expose one unified Add Transaction page containing
  Manual and Voice modes/tabs.
- **FR-030**: Manual mode MUST use the approved compact layout and preserve
  existing financial transaction-entry/submission behavior, including transfer,
  currencies/conversion, recurring and offline writes. Ordinary amount entry
  MUST use GroupedMoneyInput; the custom keypad appears only during amount focus
  with no native soft keyboard. Done applies existing equals behavior where
  needed and dismisses without saving; header Save remains the save action.
- **FR-031**: Voice mode MUST render the approved voice design and preserve the
  current voice provider/parsing transaction contract while integrating
  allowance/remaining/exhausted states.
- **FR-032**: The global Add Transaction FAB MUST navigate to the unified Add
  Transaction page with Manual selected by default.
- **FR-033**: Switching between Manual and Voice MUST use one page/shell and
  MUST NOT require separate unrelated navigation destinations.
- **FR-034**: Manual entry MUST remain available when Voice is exhausted,
  burst-limited, or temporarily unavailable. Voice quota and availability-check
  failure notices MUST appear only in Voice and MUST NOT appear in Manual.
- **FR-035**: The redesigned Add Transaction page MUST support English/LTR and
  Arabic/RTL behavior consistent with the approved mockup and existing
  application localization standards, preserving the approved locale-specific
  progress, examples, daily alerts and actions. Shared primitives, required
  markers, responsive reflow and bottom safe-area treatment remain mandatory.
- **FR-036**: Any implementation-specific handling of mode switching during
  active recording/processing or partially completed manual entry MUST preserve
  current transaction safety and MUST be documented in planning before
  implementation.

- **FR-037**: The approved scoped Voice idle overlay MUST change the dark
  allowance badge to a slate-700 field with green microphone glyph and retain
  light appearance. EN example icons MUST retain restaurant/car/cafe identities
  with orange/blue/gold registered colors; AR examples remain typographically
  quoted and icon-free. Approved daily-reset copy remains next local midnight.
- **FR-038**: The examples card MUST support immediate dismissal via a localized
  accessible control with at least a 48 dp touch target; dismissal MUST persist
  **per authenticated account on the same device** through route changes,
  restart, theme/locale changes and sign-out/sign-in, without cross-account
  leakage or hosted schema/sync. Absence/error defaults to examples visible.
- **FR-039**: Mic initiation MUST show Starting/Cancel immediately, prevent
  duplicate starts, and start Listening/elapsed time only after native capture
  starts. Cancellation, account switch, stale async permission/allowance checks,
  and native start failure MUST not leave false active recording or use an
  unauthorized provider start.
- **FR-040**: Recording MUST show two staggered outward decorative ripple
  strokes (~1.4 s, +700 ms) and gently cycling activity bars (~1.2 s) over
  existing geometry, with a true timer; paused stops activity and freezes time,
  resume restores it, reduced-motion uses static indicators and lifecycle
  cleanup cancels loops. Parsing/analyzing MUST replace its processing
  skeleton with a restrained ~1.6 s waveform-to-receipt loop and exact approved
  localized copy, no percentage, staged result claim or invented financial data.
  True allowance-fetch loading MUST remain a separate Skeleton state.
- **FR-041**: A genuinely missing native microphone permission MUST show the
  approved **inline** custom explanation before the OS request, not a
  record-introduction modal; granted users skip it and stale initial
  `hasPermission=false` must not be mistaken for denial. Blocked/revoked
  permission retains Settings/Manual recovery. The distinct first-use AI
  processing consent sheet and privacy gate remain required.
- **FR-042**: Recording-error Try again MUST go directly into Starting with no
  visible idle detour. Availability-failure Try again MUST refresh
  server-authoritative allowance and automatically enter Starting only if
  eligible, without requiring a second mic tap. Retained-audio submission
  retry MUST reuse the same logical request identity without recording anew
  or double charging; #384 and all server policies stay unchanged.

### Key Entities

- **Voice Entitlement Policy**: The active business allowance applicable to one
  user, including whether voice is available, a daily allowance when numeric,
  burst policy, and reset semantics. The free-launch policy is one entitlement
  source; future subscription plans are another.
- **Voice Usage State**: The authoritative per-user state used to determine
  remaining daily usage, exhaustion, burst availability, and next availability.
- **Logical Voice Request**: One user-initiated voice parsing operation whose
  retries/replays must not consume multiple allowances while stable request
  identity is retained under FR-010. An eligible deleted identity may be
  admitted again as new.
- **Voice Availability Result**: The server-authoritative result the client can
  use to render available, limited, temporarily burst-limited, exhausted, or
  unavailable/recovery states.
- **Future Subscription Entitlement**: A later plan-provided policy that may
  replace the free-launch allowance without changing voice parsing behavior.

## Scope Boundaries

### In Scope

- Implementation of the already-approved Add Transaction / Voice mockup as a new
  unified Manual/Voice transaction-entry page.
- Routing the global Add Transaction FAB to the unified page with Manual
  selected by default.
- Reusing the existing manual transaction form inside Manual mode.
- Reusing the existing voice parsing contract inside the approved Voice
  redesign.
- Server-authoritative daily per-user voice usage limits.
- Configurable free-launch allowance and burst protection.
- Idempotent usage accounting within the approved 35-day request-identity
  horizon, with safe deletion of eligible old terminal records.
- Voice availability/remaining usage state for the client.
- Client-side UX that communicates limits, remaining availability, exhausted
  state, and next availability.
- English and Arabic limit-related copy.
- A provider-independent entitlement boundary prepared for future subscription
  plans.
- Safe multi-device and user-switch behavior for allowance state.
- Manual and automated QA for quota, reset, replay, burst, concurrency,
  stale-client, and exhausted scenarios.

### Out of Scope

- Changing the current voice AI provider or model.
- Implementing Cohere/Qwen/Whisper/self-hosted ASR pipelines.
- Subscription checkout, billing, payment processing, paywalls, trials, upgrade
  flows, prices, plan names, or final paid-plan quotas.
- Automatic model/provider fallback.
- Voice-quality benchmarking or ASR research.
- Changing the voice transaction schema or transaction-review behavior.
- Regenerating the frozen five binding images/sidecars, expanding the approved
  motion proposal into a new Manual redesign, volume metering, hosted dismissal
  sync, fabricated processing percentages or new voice permission policy.
- Unrelated SMS AI provider work.
- Database or sync changes not strictly required by the approved voice
  usage/accounting contract.
- Any additional UI redesign beyond the already-approved Add Transaction / Voice
  mockup and the states required to make that approved design functional.

## Dependencies

- Existing voice authentication, AI consent, request validation, structured
  transaction parsing, and response validation remain authoritative.
- Current voice parsing continues using its existing provider until a separately
  approved provider-migration feature changes it.
- Existing user identity/session behavior remains authoritative for allowance
  ownership.
- The approved Add Transaction / Voice mockup from this discussion is the
  binding visual target for this feature; implementation planning must preserve
  it and record the repository binding metadata required by Monyvi's UI
  workflow.
- Future subscriptions work will own paid plan definitions, commercial rules,
  and the source that supplies plan-specific entitlements.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of test cases beyond the 5-per-local-calendar-day allowance
  reject new provider-starting voice requests before provider execution.
- **SC-002**: 100% of test cases above 2 provider-starting logical voice
  requests per minute reject the excess provider-starting request before
  provider execution.
- **SC-003**: 100% of pre-provider refusals covered by this feature consume zero
  daily provider-start allowance.
- **SC-004**: In 100% of replay tests within 35 elapsed days or while identity
  remains retained, the same identifiable request starts no second provider call
  and consumes no second daily unit. Cutoff/deletion tests prove eligible
  terminal identities are deleted at or after 35 days, active work/current
  accounting survives cleanup, and a same-key request after deletion is
  evaluated as new under current gates.
- **SC-005**: Concurrent last-unit test cases never permit more
  provider-starting requests than the authoritative allowance permits.
- **SC-006**: Client-visible remaining/exhausted state matches
  server-authoritative state after every tested voice attempt, stale-state
  rejection, user switch, and multi-device update.
- **SC-007**: 100% of English and Arabic voice-limit states have localized
  user-visible copy before release.
- **SC-008**: Existing representative voice parsing scenarios that are within
  allowance produce the same transaction result contract and user flow as before
  this feature.
- **SC-009**: A controlled alternate entitlement profile with a different
  allowance can be applied without changing the voice transaction parsing
  contract.
- **SC-010**: Adjusting the free-launch daily allowance or burst cap can be
  performed operationally without requiring a new mobile application release.
- **SC-011**: Routine quota/accounting QA records no raw audio, transcript,
  provider credential, or financial content in usage telemetry.
- **SC-012**: 100% of FAB-entry navigation tests open the unified Add
  Transaction page with Manual selected and the existing manual form available.
- **SC-013**: Manual-to-Voice and Voice-to-Manual switching tests use the same
  Add Transaction page and preserve the existing manual/voice transaction
  contracts.
- **SC-014**: Rendered comparisons confirm Manual idle/focused, Voice idle and
  daily-limit baselines match all five active approved references at their
  declared contexts. Voice recovery/active states and English/LTR, Arabic/RTL,
  light/dark, compact/ordinary/tablet/landscape and enlarged-text variants
  preserve their approved composition. Separate accessibility evidence verifies
  controls, focus and hidden-tree behavior; missing proof leaves completion
  open.
- **SC-015**: Exhausting or temporarily blocking Voice never prevents the user
  from switching to and using Manual entry.
- **SC-016**: Deterministic tests of Starting/Cancel, duplicate taps,
  permission-granted/unknown/missing/denied, recorder start failure,
  deferred cancellation and both retry types show no false Listening,
  duplicate recording, unauthorized provider start or changed request identity.
- **SC-017**: Device-local examples dismissal tests cover persistence across
  route changes, app restart, language/theme, same-account sign-out/sign-in,
  multi-account isolation, missing/corrupt preference and read/write failures;
  no global/hosted record participates.
- **SC-018**: Approved motion/permission/parsing/idle states match the new
  scoped proposal while the five frozen references remain intact; rendered
  EN/AR/light/dark/compact/ordinary/tablet/landscape/font-scale comparisons
  and separate accessibility-tree evidence are required. Until owner captures
  these, visual/accessibility completion is **NOT RUN**, not Green.

## Assumptions

- Monyvi remains in a free-launch/pre-subscription phase while this feature
  ships.
- Users are authenticated when using voice entry; guest voice usage is not
  introduced.
- The current voice provider is retained for this feature.
- The client will show the concrete remaining count and exhausted state using
  the already-approved Add Transaction / Voice mockup; no new mockup should be
  generated unless the product owner explicitly requests a redesign.
- Burst protection is a secondary abuse/retry safeguard and does not replace the
  daily allowance; the initial free-launch policy is 2 provider-starting logical
  requests per minute.
- Future subscriptions will provide an entitlement policy rather than requiring
  provider-specific plan branching.
- The allowance policy can be changed operationally without embedding commercial
  plan details in the mobile client.
- "Daily" means a calendar day in the user's local timezone rather than Egypt
  time or UTC; the reset occurs at local midnight. Timezone-source and
  anti-abuse mechanics for timezone changes are planning details and must
  preserve server-authoritative accounting.
- Exact paid subscription policies are intentionally deferred.
