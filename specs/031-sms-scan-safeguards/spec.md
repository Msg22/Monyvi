# Feature Specification: Launch SMS Scan Safeguards

**Feature Branch**: `codex/limit-launch-sms-scans-769`  
**Created**: 2026-07-20  
**Status**: Draft  
**Input**: GitHub issue #769 and the approved direction to limit launch SMS
history scans to a rolling 30-day window while enforcing authenticated AI cost
safeguards without introducing subscriptions.

## Clarifications

### Session 2026-07-20

- Q: What full SMS parser limits apply during the initial release? → A: At most
  50 unresolved candidates per request, 200 per scan, and 200 per rolling 24
  hours per authenticated user, with 128 KiB aggregate payload and 32,000
  estimated input-token request boundaries.
- Q: What separate allowance applies to trusted merchant category enrichment,
  and when is it consumed? → A: At most 20 unique merchants per request and 100
  per rolling 24 hours per authenticated user; reserve on validated admission,
  consume once provider execution begins, and release only when execution
  definitely never reached the provider.
- Q: When does the history-rescan cooldown begin, and are ordinary incremental
  scans still available? → A: The cooldown lasts 24 hours and begins when the
  first full-AI history request is admitted. Cancellation before AI and entirely
  local scans do not start it. Incremental scans remain available within the
  user's remaining AI allowance.
- Q: When does full SMS parser work consume the user's rolling allowance? → A:
  Reserve allowance after authentication and request validation, consume it
  immediately before provider execution, and release it only when execution
  definitely never reached the provider. Failures after execution begins count,
  while an idempotent replay of the same request cannot count twice.
- Q: How much history does an ordinary incremental scan reread around its safe
  checkpoint? → A: Start five minutes before the checkpoint, never earlier than
  the rolling 30-day cutoff, and fingerprint-check every overlapped message
  before paid processing.
- Q: Is the safe SMS checkpoint shared across a user's devices? → A: No. Store
  it locally for the authenticated user within the current app installation so
  another device's different SMS inbox cannot advance or reuse it. Server-side
  AI allowance remains user-wide across devices.
- Q: Which unresolved candidates receive AI capacity when the remaining
  allowance cannot cover all of them? → A: Process the newest received messages
  first, use a stable deterministic tie-breaker for equal timestamps, and leave
  older excess candidates eligible for a later permitted scan without advancing
  the checkpoint past them.
- Q: How does a user deliberately request another rolling 30-day history scan
  after the initial scan? → A: Keep Sync new SMS as the ordinary incremental
  action and provide a separate Rescan recent messages action that rereads the
  rolling 30-day window and is subject to the history-rescan cooldown.
- Q: How is Rescan recent messages presented while its cooldown is active? → A:
  Keep the action visible but disabled, show a friendly localized absolute
  date/time when it becomes available again, avoid a continuously updating
  countdown, and keep Sync new SMS available.
- Q: What happens when a structurally valid successful full-parser response
  omits a submitted candidate from its transactions array? → A: Treat every
  omitted candidate as a durable user-scoped AI non-transaction outcome for
  ordinary scans. Failed, malformed, or invalid responses classify nothing, and
  Rescan recent messages may deliberately re-evaluate prior AI-negative outcomes
  under the approved three-strike rule.
- Q: Does the rolling category-enrichment allowance deduplicate merchants across
  separate scans? → A: No. Deduplicate equal normalized merchants within one
  scan, but count each merchant admitted during a later scan as a new enrichment
  attempt. Enforce 100 admitted enrichment attempts per rolling 24 hours without
  introducing a cross-scan merchant cache.
- Q: How long is a durable AI non-transaction outcome retained, and may it be
  retried? → A: Retain the first and second valid negatives while the original
  SMS remains inside the rolling 30-day window, and allow deliberate Rescan
  recent messages operations to re-evaluate them. If a third structurally valid
  response also classifies the candidate as non-transactional, retain a
  permanent synchronized terminal outcome for that user and never send that
  fingerprint to AI again, even after reinstall, on another device, or after the
  original SMS leaves the rolling window.
- Q: What happens when one candidate cannot fit within the request payload or
  estimated-input boundary by itself? → A: Do not truncate or send it to AI.
  Store a privacy-safe local `candidate_too_large` fingerprint outcome, show
  only aggregate friendly guidance, count it as durably handled for checkpoint
  purposes, and do not retry it while it remains inside the rolling 30-day
  window.
- Q: How does safeguard QA select reduced limits for deterministic scenarios? →
  A: Use named, versioned scenario profiles such as quota exhaustion, partial
  results, cooldown, and oversized request. Each profile supplies its own small
  deterministic boundaries while exercising the same production policy evaluator
  and remaining isolated from other scenario state.
- Q: Which SMS paths share the rolling AI allowances? → A: Batch inbox scans and
  live SMS detection share the same full-parser allowance and the same
  category-enrichment allowance. Voice remains a separate capability with no
  behavior or allowance changes in this feature.
- Q: Does an explicit valid `isTrusted: false` AI result count as a negative
  classification? → A: Yes. It counts as one strike under the same lifecycle as
  a candidate omitted from a structurally valid complete response. A valid
  `isTrusted: true` result remains reviewable even when confidence is low.
- Q: What request burst limit applies to SMS AI capabilities? → A: Permit at
  most 30 provider-starting requests per authenticated user per rolling minute,
  enforced separately for full SMS parsing and category enrichment. Batch and
  live SMS share each capability's limit; validation failures and idempotent
  replays that do not start provider work do not consume it.
- Q: What retry time is shown when a rolling allowance is exhausted? → A: Show
  the earliest localized absolute time when enough capacity for at least one
  candidate becomes available. Local exclusion and trusted local parsing remain
  available; when another blocker also applies, show the later applicable
  availability time.
- Q: May a future trusted local template process a fingerprint with a terminal
  AI-negative outcome? → A: Yes. The terminal outcome permanently prohibits
  further AI submission, but an active exact trusted local template may replace
  it with a local parser outcome without provider usage.

## User Scenarios & Testing

### User Story 1 - Scan Only Recent Messages At Launch (Priority: P1)

As an early-access user importing transactions from SMS, I want the scan to
consider only messages received during the last 30 rolling days so that I can
try the feature without unexpectedly processing a large historical inbox.

**Why this priority**: A bounded launch window is the first protection against
uncontrolled AI usage and gives every early user the same predictable experience
before subscription plans exist.

**Independent Test**: Populate an inbox with otherwise eligible financial
messages immediately before, exactly at, and immediately after the 30-day
boundary, run an initial or manual history scan, and verify that only messages
inside the inclusive rolling window enter candidate processing.

**Acceptance Scenarios**:

1. **Given** the user has never completed a safe SMS scan, **When** an initial
   scan starts, **Then** only messages received within the rolling last 30 days
   are considered.
2. **Given** a message is received exactly at the calculated 30-day cutoff,
   **When** a scan starts, **Then** the message is included.
3. **Given** a message is older than the calculated cutoff, **When** a scan
   starts, **Then** it is excluded before candidate detection, trusted-template
   matching, category enrichment, or full AI parsing.
4. **Given** the user requests another history scan, **When** the request is
   permitted through the separate Rescan recent messages action, **Then** the
   same rolling 30-day boundary applies and no custom date range or paywall is
   shown.
5. **Given** a valid safe checkpoint exists, **When** the user selects Sync new
   SMS, **Then** the app performs an ordinary incremental scan using the
   checkpoint and five-minute overlap rather than rereading the complete rolling
   window.

---

### User Story 2 - Reduce Repeat Inbox Work After Durable Processing (Priority: P1)

As a returning user, I want later scans on this device to begin near the latest
boundary where all eligible messages in this device's inbox have a durable known
state so that the app reads less of my inbox without risking missed or duplicate
financial suggestions.

**Why this priority**: Fingerprints remain the authoritative protection against
duplicate suggestions, financial records, and AI work. A conservative
user-scoped checkpoint complements them only by reducing how much of the inbox
must be read again.

**Independent Test**: Complete all eligible work through a known message-time
boundary, add newer messages, then run another scan and verify that inbox
reading starts from the approved checkpoint boundary while fingerprint checks
still prevent duplicates and never hide a message with an unknown fingerprint.

**Acceptance Scenarios**:

1. **Given** a valid user-scoped checkpoint exists, **When** an ordinary scan
   starts, **Then** inbox reading begins five minutes before the checkpoint
   while still ignoring messages older than the rolling 30-day maximum window.
2. **Given** any message is read at or after that starting boundary, **When** it
   enters processing, **Then** its fingerprint is checked against every
   authoritative durable state before paid AI work, and an unknown fingerprint
   is never ignored solely because a checkpoint exists.
3. **Given** a message was excluded locally as non-transactional or has a
   durable saved, active-draft, explicitly dismissed, or successful AI
   non-transaction state supported by the current release, **When** the safe
   boundary is evaluated, **Then** that message MUST count as durably handled; a
   parsed suggestion held only in memory MUST NOT count as durably handled.
4. **Given** some candidates remain unresolved, cancelled, quota-limited,
   failed, or parsed but not durably preserved, **When** successful results are
   returned, **Then** the checkpoint does not advance past the earliest affected
   message boundary.
5. **Given** every eligible message through a contiguous boundary has a durable
   known state, **When** the scan is finalized, **Then** the checkpoint may
   advance monotonically for that user within the current app installation and
   can never move backward or become associated with another user or device
   installation.
6. **Given** the checkpoint is missing, malformed, in the future, or belongs to
   another user or app installation, **When** a scan starts, **Then** the app
   falls back safely to the rolling 30-day window and fingerprint deduplication.
7. **Given** the same user signs in on another device or reinstalls the app,
   **When** that installation performs its first scan, **Then** it MUST NOT
   reuse another installation's checkpoint and MUST establish its own boundary
   from the rolling 30-day fallback.
8. **Given** a fingerprint has one or two valid AI non-transaction outcomes,
   **When** a permitted Rescan recent messages operation reaches it inside the
   rolling window, **Then** the message may be submitted to the full parser
   again; a third valid non-transaction outcome makes that fingerprint
   permanently ineligible for further AI submission for that user across app
   reinstalls and devices, even after the message leaves the rolling window.
9. **Given** a terminal synchronized AI-negative fingerprint later matches an
   active exact trusted template, **When** a scan evaluates the message locally,
   **Then** the trusted local result may replace the terminal negative outcome
   without sending the message to AI.

---

### User Story 3 - Preserve Results When AI Capacity Is Reached (Priority: P1)

As a user whose scan reaches an AI usage limit, I want all local and earlier AI
results to remain available in the active review session, with clear guidance
about the remaining messages, so that one refused chunk does not discard useful
work from the current scan.

**Why this priority**: Cost controls must fail closed for additional AI work
without turning a protective limit into data loss or a confusing dead end.

**Independent Test**: Run a mixed scan that produces trusted local matches,
successful AI matches, and candidates beyond the available allowance; verify
that successes reach the current review session, excess candidates create no
false result, and the user sees the approved next step. App-restart persistence
is verified separately under issue #770.

**Acceptance Scenarios**:

1. **Given** a scan has local and AI successes before reaching a limit, **When**
   additional AI work is refused, **Then** every accepted success remains
   available in the current review session for review and saving.
2. **Given** candidates were not processed because a limit was reached, **When**
   the scan finishes, **Then** they remain uncommitted in the source inbox and
   eligible for a later permitted scan without advancing the checkpoint past
   them; this feature does not create a persistent raw-message retry queue.
3. **Given** a limit or cooldown prevents additional work, **When** the user
   views the result, **Then** the app uses simple, non-technical guidance and
   does not mention a free plan or show a subscription paywall.
4. **Given** category enrichment is unavailable or its allowance is exhausted,
   **When** trusted local parsing has succeeded, **Then** the local suggestion
   remains reviewable with its direction-correct fallback and is never sent to
   the full AI parser solely because enrichment was unavailable.
5. **Given** unresolved eligible candidates exceed the user's remaining
   full-parser allowance, **When** the permitted candidates are selected,
   **Then** candidates with the newest inbox-received timestamps are selected
   first, equal timestamps use a stable deterministic tie-breaker, and deferred
   older candidates remain eligible for a later permitted scan.
6. **Given** the full-parser rolling allowance is exhausted, **When** the user
   starts a batch or live SMS operation, **Then** local exclusion and trusted
   local parsing remain available, unresolved AI work is refused, and the user
   sees the earliest localized absolute time when capacity for at least one
   candidate returns.
7. **Given** both a rolling allowance and another time-based blocker apply,
   **When** availability guidance is shown, **Then** it uses the later
   applicable time so the app never invites an attempt that is known to remain
   blocked.

---

### User Story 4 - Enforce Cost Boundaries Independently Of The App (Priority: P1)

As the product owner, I want authenticated server-side safeguards to limit
expensive SMS AI work even when a client is outdated, defective, or modified so
that launch spending cannot depend only on mobile-screen behavior.

**Why this priority**: Client filtering gives the intended experience, but only
an independently enforced boundary protects the service from oversized,
repeated, or unauthorized requests.

**Independent Test**: Submit authenticated and unauthenticated requests that are
within, at, and beyond each configured boundary, including requests that bypass
the normal app flow, and verify that only permitted work is accepted and that
refusal does not erase prior successes.

**Acceptance Scenarios**:

1. **Given** an authenticated request is within every active boundary, **When**
   it is submitted, **Then** it may consume only the requesting user's available
   SMS allowance.
2. **Given** a request exceeds the candidate, payload, estimated-input, usage,
   or frequency boundary, **When** it is submitted, **Then** additional AI work
   is refused before provider cost is incurred.
3. **Given** a request is unauthenticated or cannot be attributed to one active
   user, **When** it is submitted, **Then** no AI work is attempted and no
   allowance is charged to another user.
4. **Given** concurrent requests compete for the same remaining allowance,
   **When** they are evaluated, **Then** their combined accepted work cannot
   exceed that allowance.
5. **Given** an accepted provider call fails before producing an accepted
   outcome after provider execution began, **When** usage is recorded, **Then**
   its admitted candidates consume allowance consistently and an idempotent
   replay cannot consume allowance twice or bypass the boundary.
6. **Given** one candidate cannot fit within an otherwise empty valid request's
   aggregate payload or estimated-input boundary, **When** the client evaluates
   it, **Then** the candidate is not truncated or submitted to AI, receives a
   privacy-safe local oversized outcome, and contributes only to aggregate
   non-technical guidance.
7. **Given** batch and live SMS requests use the same AI capability, **When**
   their work is admitted concurrently, **Then** they consume one shared
   user-wide rolling allowance and one shared 30-request rolling-minute burst
   boundary for that capability.
8. **Given** a request would become the thirty-first provider-starting request
   for one SMS AI capability inside a rolling minute, **When** it is evaluated,
   **Then** provider execution is refused without consuming candidate allowance;
   the other SMS capability and voice usage retain their independent boundaries.

---

### User Story 5 - Keep Voice And Local SMS Value Available (Priority: P2)

As a user, I want SMS cost protection to preserve local SMS results and avoid
reducing the availability of voice transaction entry so that the app's primary
AI experience remains dependable.

**Why this priority**: Voice transaction entry is the higher-priority AI
experience, while trusted SMS parsing can still provide value without a full AI
call.

**Independent Test**: Exhaust the SMS full-parser allowance and verify that
trusted local SMS matches remain usable, category-enrichment failure remains
non-blocking, and voice transaction behavior is unchanged.

**Acceptance Scenarios**:

1. **Given** the SMS full-parser allowance is exhausted, **When** a trusted
   exact SMS template matches, **Then** its local result remains available
   without consuming additional full-parser allowance.
2. **Given** SMS parsing or SMS category-enrichment usage is high, **When** the
   user starts a voice transaction, **Then** SMS-specific controls do not block
   or alter the established voice flow.
3. **Given** operational usage is reviewed, **When** maintainers compare AI
   consumption, **Then** full SMS parsing, SMS category enrichment, and voice
   transaction usage are distinguishable without exposing private content.
4. **Given** batch scanning has consumed the user's SMS allowance, **When** a
   live SMS arrives, **Then** it may still use local exclusion and trusted local
   parsing but cannot bypass the shared SMS allowance through the live path.

---

### User Story 6 - Reproduce Safeguard Scenarios Without Production AI Spend (Priority: P1)

As a developer or QA tester, I want a deterministic development environment that
can reproduce every SMS safeguard path on an emulator or physical device without
calling the production AI provider so that release behavior can be verified
safely even when my real inbox contains only trusted local templates.

**Why this priority**: The launch safeguards control cost, partial-result
behavior, cross-path allowance enforcement, durable AI-negative suppression, and
scan correctness. They cannot be considered release-ready if quota refusal,
mixed local/AI processing, date boundaries, checkpoint safety, synchronized
outcomes, and provider failures require real Gemini usage or a specially
prepared personal inbox to test.

**Independent Test**: On a physical device whose real inbox contains only QNB
messages that match trusted templates, start the dedicated safeguard QA mode,
select deterministic scenarios that include local matches and unresolved
financial candidates, and verify local, simulated-AI, quota, burst, failure,
retry, checkpoint, synchronized negative-outcome, trusted-local recovery, and
privacy behavior without any production AI invocation or production allowance
consumption.

**Acceptance Scenarios**:

1. **Given** a tester's real device inbox contains only trusted-template
   messages, **When** safeguard QA mode is enabled, **Then** the tester can use
   a deterministic fixture inbox containing locally excluded messages, trusted
   local matches, unresolved financial candidates, and duplicate fingerprints
   without modifying the real inbox.
2. **Given** a tester explicitly selects a named and versioned safeguard
   profile, **When** the scenario starts, **Then** its reduced limits, simulated
   outcomes, fixture clock, and expected results are loaded independently of
   state left by any other profile.
3. **Given** an unresolved fixture candidate reaches the full-parser stage,
   **When** the configured scenario requests a trusted success, low-confidence
   trusted success, explicit `isTrusted: false`, omitted identity, retryable
   failure, permanent failure, malformed or incomplete response, invalid
   identity, or delayed completion, **Then** a deterministic simulated provider
   produces that exact outcome and no production AI provider is called.
4. **Given** a test profile uses deliberately small request, scan,
   rolling-allowance, payload, input-estimate, cooldown, or request-burst
   boundaries, **When** fixture work crosses a boundary, **Then** the same
   policy evaluator, accounting transitions, refusal codes, and user-visible
   behavior used by the release flow are exercised without consuming production
   allowance.
5. **Given** batch and live SMS fixture events compete for capacity, **When**
   either full parsing or category enrichment reaches its reduced allowance or
   burst boundary, **Then** both SMS paths observe the same simulated
   capability-specific state while the other SMS capability and voice remain
   independent.
6. **Given** simulated rolling usage exhausts a capability, **When** its oldest
   consumed work approaches expiry, **Then** the scenario exposes the earliest
   absolute time when at least one candidate becomes available, combines it with
   any later blocker, and proves that trusted local processing remains usable.
7. **Given** a history-cooldown profile runs, **When** a scan completes locally,
   is cancelled before AI admission, or admits its first full-AI request,
   **Then** only the admitted full-AI case starts the cooldown and ordinary
   incremental scanning remains available.
8. **Given** available full-parser capacity cannot cover every unresolved
   fixture candidate, **When** the policy selects work, **Then** it always
   admits the newest received timestamps first and uses the same stable
   tie-breaker regardless of fixture order, request concurrency, or completion
   order.
9. **Given** a mixed scenario includes trusted local matches, accepted simulated
   AI results, and later quota-limited or failed candidates, **When** the scan
   finishes, **Then** successful results remain in the active review session and
   the checkpoint does not advance past the earliest incomplete work.
10. **Given** a cutoff or incremental-scan scenario is selected, **When** the
    scan runs, **Then** deterministic timestamps and fingerprints cover messages
    immediately before, exactly at, and immediately after the cutoff and
    checkpoint overlap, including duplicate and unknown-fingerprint cases.
11. **Given** a candidate is omitted or returned with `isTrusted: false` by a
    structurally valid complete simulated response, **When** ordinary and
    deliberate history scans run, **Then** the first and second strikes suppress
    ordinary AI retries, permitted history rescans may produce the next strike,
    and the third strike creates a terminal user-scoped synchronized outcome.
12. **Given** malformed, failed, incomplete, duplicate-identity, or
    unknown-identity simulated responses occur between valid negative strikes,
    **When** the negative lifecycle is inspected, **Then** those responses do
    not increment, reset, or fabricate the strike count.
13. **Given** a terminal AI-negative outcome exists for one simulated
    installation, **When** the same QA user is represented on a fresh simulated
    installation or device, **Then** the synchronized terminal fingerprint is
    enforced before provider work; when an active exact trusted template is
    introduced, local parsing may replace it without an AI call.
14. **Given** a fixture candidate cannot fit within an otherwise empty valid
    request, **When** the oversized profile runs, **Then** its content is not
    truncated or sent to the simulated provider, exactly one privacy-safe local
    oversized outcome is recorded, aggregate guidance is shown, and checkpoint
    progress remains safe.
15. **Given** the tester completes or abandons a scenario, **When** QA state is
    reset, **Then** fixture inbox state, simulated local and synchronized
    outcomes, usage, cooldowns, request identities, and checkpoints return to a
    documented baseline without deleting unrelated development data.
16. **Given** the app is a production build or safeguard QA mode is not
    explicitly enabled, **When** any test-only fixture, profile, policy
    override, synchronized-outcome double, or simulated-provider path is
    requested, **Then** it is unavailable and cannot weaken or replace
    production safeguards.
17. **Given** a safeguard scenario runs, **When** its diagnostics are inspected,
    **Then** they identify the profile and version, report aggregate outcome and
    allowance counts using privacy-safe codes, and prove zero production
    provider calls and zero production allowance charges.
18. **Given** a prompt or response-schema optimization is proposed, **When** its
    deterministic evaluation runs, **Then** fixed instructions, category
    context, schema, and fixture-candidate token estimates are reported
    separately and the approved corpus expectations are compared without
    silently invoking the production provider; any separately approved
    live-provider evaluation uses an explicitly named non-default workflow.
19. **Given** the QA user does not have active AI processing consent, **When**
    any full-parser safeguard request is attempted, **Then** the shared consent
    boundary refuses it before reservation or provider start, records no usage
    or processing outcome, and the consent profile reports zero production
    provider calls and zero production allowance charges.

---

### User Story 7 - Understand Deterministic QA Outcomes On Device (Priority: P1)

As a developer or QA tester running an explicit safeguard profile, I want a
compact in-app explanation of the active test boundaries and this scan's
aggregate outcome so that I can distinguish an intentional safeguard refusal
from a regression without inspecting private message data or production logs.

**Why this priority**: Named fixture scenarios deliberately reach small limits.
Without visible, privacy-safe context, a correct capacity, cooldown, oversized,
or negative-outcome result can look like a missing transaction or parser defect
and make physical-device verification unreliable.

**Independent Test**: Start each named profile on a physical development device,
complete its device-visible scan, and verify that the scan and review surfaces
identify the active profile, real effective boundaries, aggregate processing
outcomes, and the next availability state without showing fixture contents or
appearing in an ordinary development or release build.

**Acceptance Scenarios**:

1. **Given** explicit safeguard QA mode is enabled in a non-release build,
   **When** a profile reaches a scan completion or review state, **Then** a
   compact, collapsed-by-default QA-only panel identifies the profile and
   version and can be expanded to show safe aggregate diagnostics.
2. **Given** no profile is explicitly enabled, configuration is incomplete, or
   the build is a release build, **When** SMS scan or review UI renders,
   **Then** the QA-only panel is absent and no fixture, simulated-provider, or
   test-limit information is exposed.
3. **Given** a tester expands the panel, **When** its values are displayed,
   **Then** active limits come from the same effective policy used by admission,
   and current-scan counts come from the actual parser and safeguard result; the
   UI MUST NOT duplicate numeric limits or infer outcomes independently.
4. **Given** a scenario reaches an allowance, cooldown, burst, candidate-size,
   response-validity, consent, negative-outcome, or checkpoint boundary,
   **When** the panel is displayed, **Then** it gives a short human-readable
   explanation of the boundary, its aggregate affected count, and the next
   availability time when one exists.
5. **Given** any named QA profile is selected, **When** it is inspected in the
   panel, **Then** it declares its scenario purpose and expected limiting
   condition; automated coverage fails if a supported profile lacks that
   diagnostic metadata.
6. **Given** QA diagnostics render, **When** their props, translations, logs, or
   accessibility labels are inspected, **Then** they contain only profile
   metadata, policy boundaries, aggregate counts, stable reason codes, and
   availability instants; they MUST NOT contain SMS body, sender, fingerprint,
   merchant, financial value, provider prompt, or provider response content.
7. **Given** a partial scan produces reviewable suggestions and deferred work,
   **When** the tester opens the review route, **Then** the same aggregate QA
   state remains available there without changing the normal partial-results
   notice, review selection, save, or back-navigation behavior.

### Edge Cases

- The device clock, time zone, or daylight-saving offset changes near the
  rolling cutoff.
- A message timestamp equals the cutoff exactly or differs by one millisecond.
- The last checkpoint is missing, malformed, in the future, or belongs to a
  different authenticated user.
- The user changes accounts while inbox reading, candidate processing, an AI
  request, or checkpoint persistence is in progress.
- Multiple devices or concurrent requests consume one user's allowance at the
  same time.
- Batch scan and live SMS requests concurrently consume one SMS capability's
  rolling candidate and request-burst allowances.
- The same fingerprint receives valid AI-negative classifications concurrently
  on two devices while its synchronized strike count is below three.
- A fresh installation attempts AI work for a terminal fingerprint before its
  local database has pulled the synchronized outcome.
- A request is individually valid but would exceed the remaining allowance.
- Multiple unresolved candidates share one inbox-received timestamp at the AI
  allowance boundary.
- A history scan is cooling down while an ordinary incremental scan is needed.
- A user attempts Rescan recent messages while its cooldown is active and then
  uses Sync new SMS to check for newly received messages.
- The app resumes after the displayed history-rescan availability time has
  passed while the cooldown state shown before suspension is stale.
- Local parsing succeeds while category enrichment or full parsing is refused,
  times out, is cancelled, or returns malformed data.
- A structurally valid full-parser response returns transactions for only some
  submitted candidates, while a malformed or invalid response returns an
  incomplete-looking transaction list.
- A provider response satisfies the JSON schema but reports truncation, a safety
  stop, or another non-complete finish state.
- A valid known AI result has `isTrusted: false`, while another valid known
  result has `isTrusted: true` with low confidence.
- Some chunks succeed before a later chunk reaches a limit or fails.
- A request includes too many candidates, an oversized individual message, an
  oversized aggregate payload, or an unreasonable estimated input size.
- The usage-control store is unavailable or returns malformed state.
- A client retries the same request after a timeout and the original request may
  already have been accepted.
- A thirty-first provider-starting request arrives inside the rolling minute,
  while an idempotent replay arrives without requiring new provider work.
- A terminal AI-negative fingerprint later matches an active exact trusted local
  template.
- Fingerprint overlap encounters saved records, active future review drafts, or
  dismissed state introduced by issue #770.
- Safe operational counters are delayed or unavailable while enforcement must
  still fail closed.
- A developer runs safeguard QA mode on a physical device whose real inbox has
  only trusted-template messages or has no SMS messages at all.
- A test-only allowance is exhausted midway through a simulated AI chunk while
  earlier local and simulated-AI results already exist.
- A fixture exceeds both a request-size boundary and a rolling allowance; the
  deterministic scenario states which refusal is expected first.
- Test state from a previous run is stale, partially reset, or belongs to a
  different local QA user.
- A production build is accidentally launched with test-only environment flags.

## Requirements

### Functional Requirements

- **FR-001**: Initial and manual history scans MUST use an inclusive rolling
  30-day lookback calculated from the scan's start time, not a calendar-month
  boundary.
- **FR-002**: The 30-day cutoff MUST be applied before candidate detection,
  trusted-template matching, category enrichment, full AI parsing, and any
  related progress count that claims a message was considered.
- **FR-003**: The system MUST NOT offer custom date ranges, subscription
  checkout, plan selection, or a launch "free plan" distinction in this phase.
- **FR-004**: Every launch user MUST receive the same early-access SMS scan
  policy unless an emergency operational disablement is active.
- **FR-005**: One authoritative scan policy MUST define lookback, custom-range
  availability, history-scan availability, per-request and per-scan AI limits,
  per-user allowance period, and history-scan cooldown.
- **FR-006**: Policy changes MUST be configurable without duplicating numeric
  rules across user journeys, and an unavailable or malformed policy MUST fail
  closed for additional paid AI work while preserving local parsing.
- **FR-007**: After a safe checkpoint exists, ordinary scans MUST begin five
  minutes before its boundary and MUST remain subject to the rolling 30-day
  maximum history boundary. The effective start MUST therefore be the later of
  the checkpoint-minus-five-minutes instant and the rolling 30-day cutoff.
- **FR-008**: A checkpoint MUST represent a contiguous boundary for one
  authenticated user within one local app installation through which every
  eligible message in that installation's device inbox has a durable known
  state. It MUST move monotonically and MUST never be reused across users or app
  installations.
- **FR-009**: Partial failure, cancellation, consent loss, quota refusal,
  unresolved candidates, or parsed suggestions that exist only in memory MUST
  NOT advance a checkpoint past affected work.
- **FR-010**: Existing SMS fingerprints MUST remain the authoritative
  correctness and idempotency boundary across inbox overlap, review suggestions,
  transactions, transfers, live delivery, and future draft/dismissed states. A
  checkpoint MUST NOT replace or bypass fingerprint checks.
- **FR-011**: Existing local rejection rules MUST run before AI eligibility,
  including promotional, OTP, informational, corrupted, and approved
  hard-excluded message handling.
- **FR-012**: Active exact trusted-template matches MUST remain local and MUST
  NOT consume or be sent through the full SMS AI parser.
- **FR-013**: Trusted sender identity by itself MUST NOT make a message eligible
  for full AI parsing.
- **FR-014**: Only unresolved eligible financial candidates MAY consume the full
  SMS AI allowance.
- **FR-015**: Full SMS parsing MUST accept no more than 50 unresolved candidates
  per request, 200 unresolved candidates per scan, and 200 unresolved candidates
  per authenticated user during any rolling 24-hour period. Each request MUST
  also remain at or below 128 KiB of aggregate request payload and 32,000
  estimated input tokens. These are Monyvi launch safeguards and MUST remain
  enforced even when the selected AI provider supports larger requests. Batch
  inbox scans and live SMS detection MUST share the same user-wide rolling
  allowance; the per-scan boundary applies to batch scan sessions only.
- **FR-016**: SMS category enrichment MUST have a separate configurable
  allowance from full SMS parsing and voice usage. Equal normalized merchants
  MUST be deduplicated within one scan, each request MUST accept no more than 20
  resulting merchants, and each authenticated user MUST receive no more than 100
  admitted enrichment attempts during any rolling 24-hour period. A merchant
  submitted during a later scan counts as another attempt. Allowance MUST be
  reserved when a validated request is admitted for provider execution, MUST
  count as consumed once provider execution begins even if the provider fails,
  and MAY be released only when execution definitely never reached the provider.
  Batch and live SMS enrichment MUST share this user-wide allowance.
- **FR-017**: Historical rescans MUST use a 24-hour cooldown that begins when
  the first full-AI request from that history scan is admitted. Cancellation or
  failure before any full-AI request is admitted and scans completed entirely
  through local exclusion or trusted local parsing MUST NOT start the cooldown.
  Once provider execution may have begun, later cancellation or failure MUST NOT
  remove the cooldown. Ordinary incremental scans MUST remain available during
  the cooldown subject to the user's remaining rolling AI allowance.
- **FR-018**: The server-side boundary MUST independently enforce
  authentication, request candidate count, aggregate payload size, bounded input
  estimate, per-user usage, and request frequency before additional AI provider
  cost is incurred. Full SMS parsing and SMS category enrichment MUST each allow
  no more than 30 provider-starting requests per authenticated user during a
  rolling minute. Each capability MUST have an independent burst counter, while
  batch and live callers share that capability's counter.
- **FR-019**: Concurrent requests and retries MUST NOT allow accepted usage to
  exceed the same user's remaining allowance.
- **FR-020**: Usage accounting MUST use stable request identity so a retried
  accepted request cannot be charged or admitted twice unintentionally.
  Validation failures and idempotent replays that do not start new provider work
  MUST NOT consume the rolling-minute request allowance.
- **FR-021**: Full-parser allowance MUST be reserved only after authentication,
  consent, request validation, and boundary checks succeed. It MUST become
  consumed immediately before provider execution begins and MUST remain consumed
  if that execution times out, fails, returns malformed output, returns no
  transaction, or is cancelled afterward. The reservation MUST be released when
  provider execution definitely never began, and an idempotent replay of the
  same stable request identity MUST NOT reserve or consume allowance twice.
- **FR-022**: A safeguard dependency failure or malformed usage state MUST fail
  closed for additional paid AI work and MUST NOT delete local or previously
  accepted results.
- **FR-023**: When a limit is reached during a mixed scan, all trusted local and
  earlier accepted AI results MUST remain reviewable and saveable in the active
  review session. Persistence across route abandonment or restart belongs to
  issue #770.
- **FR-024**: Candidates not processed because of limits MUST remain uncommitted
  in the source inbox, MUST create no fabricated result or persistent
  raw-message retry queue, and MUST remain eligible for a later permitted scan
  without moving the checkpoint past them. When capacity cannot cover every
  unresolved candidate, selection MUST use inbox-received timestamp descending
  with a stable deterministic tie-breaker, so the newest candidates are
  processed first and the result does not depend on provider chunk timing.
- **FR-025**: User-facing limit and cooldown guidance MUST be simple,
  non-technical, translated, and explicit about what was processed and when the
  user can try remaining messages again. For rolling allowance exhaustion, the
  server MUST provide the earliest absolute instant when capacity for at least
  one candidate becomes available. The app MUST present that instant in the
  user's localized date/time format without a live countdown. When another known
  blocker ends later, the app MUST show the later applicable instant.
- **FR-025A**: While the history-rescan cooldown is active, Rescan recent
  messages MUST remain visible but disabled and MUST show a friendly localized
  absolute date/time when it becomes available again. The state MUST refresh
  when the screen is opened or resumed without requiring a continuously updating
  countdown, and Sync new SMS MUST remain available.
- **FR-026**: Sync new SMS MUST perform an ordinary incremental scan after a
  safe checkpoint exists. A separate Rescan recent messages action MUST
  deliberately request the rolling 30-day history window and receive the
  historical-rescan cooldown. That cooldown MUST NOT block Sync new SMS, though
  incremental paid AI work remains subject to the user's applicable allowance.
- **FR-027**: Category-enrichment refusal or failure MUST preserve the trusted
  local result with its existing fallback and review behavior and MUST NOT route
  that SMS to the full parser solely to obtain a category.
- **FR-027A**: Exhausted full-parser or category-enrichment allowance MUST NOT
  prevent local exclusion or active trusted local parsing in batch or live SMS
  paths. Only the unavailable AI work MUST be refused.
- **FR-028**: SMS-specific safeguards MUST NOT change voice consent, voice
  parsing, voice review, or voice availability.
- **FR-029**: Operational reporting MUST distinguish messages considered,
  locally excluded, locally matched, full-AI attempted, full-AI matched,
  enrichment attempted, enrichment matched, unresolved, quota-limited, and
  duplicate outcomes.
- **FR-030**: Operational reporting MUST distinguish full SMS parsing, SMS
  category enrichment, and voice AI usage so their budgets can be managed
  independently.
- **FR-031**: Logs, diagnostics, allowance records, and operational reporting
  MUST NOT contain SMS text, sender, amount, balance, currency, account/card
  data, merchant/person, category association, reference, phone, date/time,
  transcript, fingerprint in raw form, or AI response body.
- **FR-032**: Safe telemetry MUST use aggregate counts and stable,
  language-neutral reason codes only.
- **FR-033**: The product MUST document and verify provider spending caps and
  billing alerts before launch enablement.
- **FR-034**: The product MUST support emergency disablement of full SMS parsing
  and SMS category enrichment independently without disabling trusted local SMS
  parsing or voice transaction entry.
- **FR-035**: Staged and local-development modes MUST remain deterministic and
  MUST NOT consume production AI allowance unless explicitly configured to use
  the production service.
- **FR-036**: Visible 30-day, partial-limit, and cooldown states MUST receive
  focused mockup approval before implementation, including the separate Rescan
  recent messages action and its unavailable state.
- **FR-037**: Resumable review-draft persistence, dismissed-fingerprint storage,
  subscription billing, custom date ranges, trusted-template expansion,
  cross-scan merchant-category caching, and category learning MUST remain
  outside this feature.
- **FR-038**: The design MUST remain compatible with future subscription
  entitlements that expand lookback and usage without replacing the scan
  workflow or weakening server enforcement.
- **FR-039**: Development and automated QA MUST provide a deterministic
  safeguard mode that can use a fixture inbox independently of the physical
  device inbox and can exercise local exclusion, trusted local matching,
  unresolved full-parser eligibility, duplicates, date boundaries, batch/live
  shared allowance, and cross-installation synchronized outcome behavior.
- **FR-040**: Safeguard QA mode MUST provide a deterministic simulated full SMS
  parser capable of producing trusted matches, low-confidence trusted results,
  explicit `isTrusted: false` results, omitted identities, retryable and
  permanent failures, malformed or incomplete responses, invalid identities, and
  delayed completion without calling a production AI provider.
- **FR-041**: Safeguard QA mode MUST provide explicitly named and versioned
  scenario profiles, including cutoff/checkpoint, quota exhaustion, partial
  results, history cooldown, request burst, AI-negative lifecycle,
  cross-installation synchronization, trusted-local recovery, and oversized
  request, authenticated consent denial, plus a deterministic prompt-boundary
  evaluation profile. Each profile MUST define the reduced request, scan,
  rolling-allowance, payload, estimated-input, cooldown, and burst boundaries
  needed to reproduce its behavior with a small fixture set. Profile selection
  MUST be explicit and MUST NOT depend on state left by another scenario.
- **FR-042**: Test policy values MUST exercise the same policy interpretation,
  enforcement decisions, accounting rules, partial-result handling, and
  user-visible states as the release policy; the test harness MUST NOT replace
  these behaviors with test-only approximations.
- **FR-043**: Fixture inboxes MUST include deterministic cases for the rolling
  cutoff, checkpoint boundary, unknown and completed fingerprints, mixed local
  and simulated-AI outcomes, quota exhaustion, cancellation, retry identity,
  batch/live competition, three negative strikes, synchronized terminal state,
  trusted-template recovery, oversized work, account switching, and malformed
  safeguard state.
- **FR-044**: Safeguard QA mode MUST be unavailable in production builds and
  MUST fail closed when its configuration is incomplete, contradictory, or
  requests a real provider implicitly.
- **FR-045**: A safeguard QA command or scenario MUST NOT silently fall back to
  the production AI provider or consume production allowance. Any deliberate
  real-provider integration test MUST be separately named, explicitly enabled,
  and outside the default safeguard QA workflow.
- **FR-046**: Testers MUST be able to reset simulated usage, cooldowns, request
  identities, checkpoints, local processing outcomes, synchronized terminal
  outcomes, and fixture state to a documented baseline without deleting
  unrelated local development data.
- **FR-047**: Privacy-safe QA diagnostics MUST expose the scenario identifier,
  effective test-policy version, aggregate processing outcomes, simulated
  per-capability rolling and burst allowance state, checkpoint decision,
  synchronized-outcome transition counts, earliest available time,
  production-provider call count, and production-allowance charge count without
  exposing prohibited SMS or financial values.
- **FR-048**: The development workflow MUST support the same deterministic
  safeguard scenarios on an Android emulator and a physical Android device.
- **FR-049**: The full SMS parser's fixed instructions, dynamic category
  context, structured-output schema, and candidate content MUST have separately
  measurable input-token baselines so optimization decisions identify where
  tokens are actually consumed.
- **FR-050**: A prompt or schema optimization MAY ship only when it reduces the
  measured input-token cost and meets or exceeds the current approved evaluation
  baseline for transaction detection, false-positive rejection, field
  extraction, category selection, trust assessment, and confidence behavior.
  Instructions MUST NOT be removed solely to meet a token target.
- **FR-051**: After a structurally valid, complete, successful full-parser
  response, every submitted candidate absent from the returned transactions
  array and every known uniquely identified result with `isTrusted: false` MUST
  receive one `ai_no_transaction` strike. A valid `isTrusted: true` result MUST
  remain reviewable regardless of low confidence and MUST NOT receive a negative
  strike. Completion MUST be established from the provider response state as
  well as schema validation; truncated, safety-blocked, or otherwise incomplete
  provider output MUST NOT be treated as a complete omission decision.
- **FR-052**: AI non-transaction outcomes MUST be keyed by authenticated user
  and SMS fingerprint, synchronized through Supabase under user-scoped access
  control, available locally for offline fingerprint checks, and contain no raw
  SMS or extracted financial content. They MUST be server-authored and pull-only
  for ordinary mobile sync so a modified client cannot fabricate, increment,
  clear, or terminalize a strike. The first and second strikes MUST prevent
  ordinary scans from resubmitting the fingerprint and MUST count as durably
  handled for local checkpoint advancement. They MUST expire when the original
  message timestamp leaves the rolling 30-day window unless a third strike has
  made the outcome terminal.
- **FR-053**: A deliberate Rescan recent messages operation MUST be allowed to
  re-evaluate a synchronized AI-negative outcome whose strike count is one or
  two, subject to the history cooldown and remaining allowance. A valid
  transaction result MUST clear the non-terminal negative outcome. A third valid
  negative classification MUST atomically create a terminal user-scoped outcome
  that is retained until the user's corresponding account data is deleted and
  MUST prevent every batch or live path, device, app reinstall, and idempotent
  retry from submitting that fingerprint to the full parser again.
- **FR-054**: A transport failure, timeout, cancellation before a complete valid
  response, malformed or incomplete response, invalid response envelope,
  duplicate returned identity, or unknown returned identity MUST create no
  `ai_no_transaction` strike for the affected candidate. Such outcomes MUST NOT
  increment, reset, or fabricate an existing strike count.
- **FR-055**: The server MUST check synchronized terminal AI-negative
  fingerprints before provider execution and MUST update non-terminal strike
  counts atomically so concurrent devices cannot exceed the three-strike rule.
  Stable request identity MUST prevent replaying one accepted provider result
  from incrementing a strike count twice.
- **FR-056**: A terminal AI-negative outcome prohibits only further full-AI
  submission. If the message later matches an active exact trusted local
  template, the trusted local result MAY supersede the negative classification
  for review and saving without provider usage. The synchronized terminal record
  MUST remain authoritative for blocking every future full-AI submission; local
  recovery MUST NOT clear or weaken it.
- **FR-057**: A candidate that cannot fit within the aggregate payload or
  estimated-input boundaries of an otherwise empty valid request MUST be
  rejected before provider execution without truncating its content. The app
  MUST persist a user- and installation-scoped `candidate_too_large` outcome
  containing only privacy-safe fingerprint metadata and the original message
  timestamp, MUST count it as durably handled for checkpoint purposes, MUST NOT
  retry it while it remains inside the rolling 30-day window, and MUST expose
  only an aggregate, friendly explanation to the user. The outcome MUST expire
  after the original message leaves that window.
- **FR-058**: Server-authoritative time MUST govern rolling AI allowances,
  request-burst windows, admitted history cooldowns, strike transitions, and
  returned availability instants. One immutable scan-start instant MUST govern a
  client's rolling 30-day cutoff and checkpoint calculation for the complete
  scan so a long-running scan cannot move its own boundary.
- **FR-059**: Every scan session, AI request, synchronized processing outcome,
  and checkpoint write MUST remain pinned to the authenticated user who started
  it. An account change before completion MUST cancel or discard stale work and
  MUST NOT charge, persist, display, or advance state for the newly active user.
- **FR-060**: Declared history-scan cooldown enforcement MUST remain defense in
  depth and MUST NOT be represented as proof that a client supplied truthful
  inbox dates or scan kind. User-wide rolling candidate and request-burst
  allowances MUST remain the authoritative server cost boundaries even when a
  modified client mislabels a history request as incremental.
- **FR-061**: An in-app safeguard QA diagnostics panel MUST render only when an
  explicitly named safeguard profile is active in a non-release build. It MUST
  be absent when QA configuration is disabled, incomplete, contradictory, or
  release-bound, and it MUST not change scan, parser, review, or save behavior.
- **FR-062**: The QA diagnostics panel MUST identify its profile and version;
  show only the active scenario's purpose, effective policy boundaries,
  aggregate current-scan outcomes, stable refusal reason, and earliest relevant
  availability instant; and source those values from the same policy/result
  contracts used by the runtime rather than duplicated UI constants.
- **FR-063**: Every named safeguard QA scenario MUST declare privacy-safe
  diagnostic metadata describing the expected limiting condition and verifier
  intent. A focused test MUST fail if a registered scenario has no such
  metadata.
- **FR-064**: QA diagnostics MUST appear on both the scan completion and active
  review surfaces, remain collapsed by default, use translated plain-language
  labels, respect the existing safe areas and themes, and expose no raw SMS,
  sender, fingerprint, merchant, financial value, prompt, or provider response.
- **FR-065**: The QA diagnostics component MUST consume a shaped safe diagnostic
  view model. It MUST NOT access the inbox, raw parser candidates, WatermelonDB,
  Edge responses, or runtime environment directly from a presentational UI
  component.

### Key Entities

- **SMS Scan Policy**: The versioned launch entitlement describing the rolling
  history window, available scan actions, AI allowances, request boundaries,
  cooldown, and emergency enablement state.
- **SMS Scan Session**: One user-scoped attempt with a stable identity, start
  time, requested scan kind, effective boundary, aggregate outcomes, and final
  completion state.
- **Safe Scan Checkpoint**: The latest message-time boundary, stored locally for
  one authenticated user within one app installation, through which that
  device's relevant inbox work can safely be considered complete.
- **AI Usage Allowance**: A user-scoped budget for one AI capability over a
  defined period, including consumed, reserved, remaining, and earliest-next
  capacity. Batch and live SMS share the allowance for each SMS capability;
  voice remains separate.
- **AI Work Request**: One idempotent authenticated request for bounded full SMS
  parsing or SMS category enrichment.
- **Candidate Processing Outcome**: A privacy-safe result code indicating local
  exclusion, local match, AI match, AI non-transaction, unresolved, duplicate,
  quota-limited, cancelled, or failed processing. An AI non-transaction outcome
  is user-scoped and synchronized and carries its bounded strike count, original
  message timestamp, terminal state, and privacy-safe fingerprint so the
  three-strike lifecycle works across devices and reinstalls without retaining
  raw SMS content. An oversized outcome remains installation-local and carries
  only the privacy-safe identity and timestamp needed to suppress impossible
  retries until rolling-window expiry.
- **Operational Usage Summary**: Aggregate privacy-safe counts separated by AI
  capability and stable outcome code.
- **Safeguard QA Scenario**: A deterministic development-only definition of
  fixture inbox state, timestamps, fingerprints, simulated provider outcomes,
  expected enforcement decision, and expected user-visible result.
- **Safeguard Test Policy**: A named and versioned development-only scenario
  profile with deliberately small boundaries that exercises the release policy
  evaluator and enforcement path without modifying production policy or
  inheriting another scenario's mutable state.
- **Safeguard QA Diagnostic View Model**: A presentation-safe projection of the
  active scenario metadata, effective policy, aggregate scan outcomes, and next
  availability state. It excludes all raw SMS and extracted financial content.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In 100% of cutoff-boundary tests, initial and history scans admit
  messages at the rolling 30-day boundary and reject messages older by at least
  one millisecond before candidate processing.
- **SC-002**: Repeating a completed scan over an unchanged inbox produces zero
  duplicate review suggestions, zero duplicate financial records, and zero
  full-AI submissions for fingerprints already in an authoritative completed
  state.
- **SC-003**: In 100% of partial-failure, cancellation, and quota-limit tests,
  the safe checkpoint never advances beyond affected candidates and every
  earlier accepted result remains available in the active review session.
- **SC-004**: Requests exceeding any active server boundary produce zero AI
  provider calls in automated enforcement tests.
- **SC-005**: Concurrent and replay tests never admit more than 100% of one
  user's configured allowance and never charge one accepted request twice.
- **SC-006**: Trusted exact local matches produce zero full-parser AI usage even
  when the user's full-parser allowance is exhausted.
- **SC-007**: Privacy validation finds zero prohibited financial or message
  values in logs, diagnostics, allowance records, and operational summaries.
- **SC-008**: Full SMS parsing, SMS category enrichment, and voice usage can be
  reported independently for 100% of accepted AI work.
- **SC-009**: Every tested safeguard outage or malformed policy state preserves
  prior/local results and permits zero unbounded additional paid AI work.
- **SC-010**: At least 95% of manual QA participants can correctly identify the
  30-day scan scope and the next available action after a limit or cooldown
  without technical assistance.
- **SC-011**: SMS-specific limit tests produce zero changes to established voice
  transaction behavior.
- **SC-012**: Spending caps and billing alerts are documented, enabled, and
  verified before the launch policy is marked production-ready.
- **SC-013**: Every acceptance scenario in User Stories 1 through 5 can be
  reproduced through deterministic safeguard QA scenarios without using a real
  personal inbox or making a production AI provider call.
- **SC-014**: On both an Android emulator and a physical Android device, a
  trusted-only or empty real inbox can still produce a mixed scan containing at
  least one local match, one simulated-AI success, and one quota-limited
  candidate.
- **SC-015**: In 100% of safeguard QA runs, diagnostics report zero production
  provider calls and zero production allowance charges.
- **SC-016**: Resetting safeguard QA state produces the same expected fixture,
  allowance, cooldown, and checkpoint baseline in 100% of repeated runs.
- **SC-017**: The current and any proposed optimized full-parser request report
  separate token measurements for fixed instructions, category context,
  structured-output schema, and candidate messages using the selected model's
  tokenizer or counting service.
- **SC-018**: Any adopted prompt or schema optimization reduces measured input
  tokens while producing no regression against the approved SMS evaluation
  corpus and its expected transaction, rejection, field, category, trust, and
  confidence outcomes.
- **SC-019**: In 100% of allowance-boundary tests, the same candidate set and
  allowance select the same newest candidates regardless of input order,
  provider concurrency, or chunk completion order.
- **SC-020**: In 100% of response-reconciliation tests, a valid partial
  transaction array produces one durable `ai_no_transaction` outcome for each
  omitted submitted identity, while malformed, failed, duplicate-identity, and
  unknown-identity responses produce zero durable negative outcomes.
- **SC-021**: In 100% of AI non-transaction lifecycle tests, ordinary scans
  suppress a fingerprint after its first or second valid negative strike,
  permitted deliberate history rescans may re-evaluate it, a third valid strike
  prevents every further AI submission for that user across devices and
  reinstalls, and invalid or incomplete responses neither increment nor reset
  the strike count.
- **SC-022**: In 100% of oversized-candidate tests, a candidate that cannot fit
  within an otherwise empty valid request is never truncated or sent to the
  provider, creates exactly one privacy-safe local oversized outcome, does not
  repeatedly block checkpoint progress, and becomes eligible for cleanup only
  after its original message timestamp leaves the rolling 30-day window.
- **SC-023**: Every named safeguard QA profile reports its version and effective
  boundaries, reproduces the same outcome after a documented reset, and produces
  zero production-provider calls and zero production-allowance charges.
- **SC-024**: In 100% of shared-allowance tests, batch and live SMS work cannot
  collectively exceed the same full-parser or enrichment allowance, while voice
  behavior and accounting remain unchanged.
- **SC-025**: In 100% of burst-boundary and replay tests, the first 30
  provider-starting requests for one user and SMS capability inside a rolling
  minute may be admitted subject to all other limits, the thirty-first is
  refused before provider execution, and non-provider replays consume no second
  burst slot.
- **SC-026**: In 100% of allowance-expiry tests, the reported availability is
  the earliest absolute time when at least one candidate slot returns, adjusted
  to any later known blocker, and local parsing remains usable while AI is
  unavailable.
- **SC-027**: In 100% of terminal-outcome synchronization tests, a third valid
  strike prevents AI submission from a fresh installation for the same user,
  while activating an exact trusted local template permits local recovery with
  zero full-parser provider calls.
- **SC-028**: In 100% of account-switch tests, work started by one user creates
  zero allowance charges, synchronized outcomes, checkpoints, or visible results
  for the newly active user.
- **SC-029**: In 100% of modified-client tests, mislabeling history work as an
  incremental request never permits the user to exceed rolling candidate or
  request-burst allowances.
- **SC-030**: In 100% of named safeguard QA profile tests, the expanded
  development-only panel reports the selected profile/version, declared scenario
  purpose, active runtime boundaries, and actual aggregate scan outcomes without
  exposing prohibited content or altering scan behavior.
- **SC-031**: In 100% of production, release, disabled, and malformed-QA
  configuration tests, neither scan nor review UI renders safeguard QA
  diagnostics.

## Assumptions

- Issue #752 and #763 behavior remains authoritative: local exclusions run
  first, exact trusted templates run second, and only unresolved eligible
  candidates may use full AI parsing.
- The launch lookback is a rolling 30 times 24-hour window anchored to the scan
  start instant.
- All launch users share one internal early-access entitlement; subscriptions
  and paywalls are not yet active.
- The client owns actual inbox-date filtering because the server cannot inspect
  the Android inbox independently.
- The server independently owns spend-related request and user-usage enforcement
  and does not trust the client to stay within those boundaries.
- The server cannot independently prove an Android inbox timestamp or whether a
  client truthfully labeled a request as history or incremental. History
  cooldown enforcement is therefore defense in depth; rolling candidate and
  request-burst allowances remain the hard server cost boundary.
- The current raw unresolved-candidate lifecycle remains memory-only until issue
  #770 introduces approved local review drafts.
- Durable `ai_no_transaction` outcomes are privacy-safe processing metadata for
  cost and checkpoint correctness, not review drafts or financial records. They
  are synchronized per user so strike counts and terminal suppression survive
  reinstall and apply across devices, and they contain no raw SMS or extracted
  financial content. Device-inbox checkpoints remain local and unsynchronized.
- Cross-device and reinstall suppression uses the existing canonical
  `smsFingerprint` identity. This feature does not change its normalized
  sender/body/received-timestamp definition; two deliveries that produce
  different canonical fingerprints remain distinct messages.
- Preservation promised by User Story 3 is limited to the active scan and review
  session. Surviving route abandonment, app restart, or device restart is owned
  by issue #770.
- Incremental scans use a fixed five-minute overlap before the safe checkpoint,
  bounded by the rolling 30-day cutoff. Fingerprints remain mandatory for every
  message read from that overlap.
- SMS checkpoints are local to one authenticated user within one app
  installation and are not synchronized across devices. Reinstallation or a new
  device safely falls back to the rolling 30-day window and fingerprint checks.
  Server-side AI allowances and synchronized AI-negative outcomes remain
  user-wide across all devices.
- Existing successful partial-result and retry behavior remains the baseline;
  this feature adds bounded refusal outcomes rather than replacing the hybrid
  parser.
- A synchronized terminal AI-negative outcome remains until the user's
  corresponding account data is deleted unless a later active exact trusted
  template supersedes it locally under the approved no-AI recovery rule.
- Existing SMS consent and privacy disclosures remain applicable; this feature
  sends no new data categories to AI.
- The launch numeric allowances and cooldown policy are fixed by the 2026-07-20
  clarification session and will be documented in the business decisions before
  implementation.
- Prompt optimization is evidence-led: duplicated wording may be consolidated,
  but only an approved evaluation comparison can establish that extraction and
  rejection quality remain unchanged.
- Focused mockups will cover only the affected scope, partial-result, and
  cooldown states rather than redesigning the review page.
- The proposed safeguard QA diagnostic panel is an internal development aid, not
  a production-facing product surface. Its mockup governs only the compact
  layout, hierarchy, and disclosure behavior; existing light/dark theme tokens
  govern its colors.
- Existing fixture, local-parser, and hybrid-fixture modes are the foundation
  for safeguard QA, but the feature requires scenario-level policy controls,
  simulated refusal outcomes, reset behavior, and explicit production-call proof
  rather than relying on the current happy-path fixture corpus alone.

## Dependencies

- Existing hybrid trusted SMS parser and category-enrichment behavior from
  issues #752 and #763.
- Existing fingerprint deduplication across batch, live, transaction, and
  transfer paths.
- Existing authenticated AI consent enforcement.
- Existing deterministic fixture inbox and fixture parser infrastructure.
- Authenticated user-scoped local and Supabase persistence capable of enforcing
  synchronized AI-negative strikes and terminal fingerprints without storing raw
  SMS or extracted financial content.
- Issue #770 must consume the checkpoint and fingerprint contracts established
  here but is not required to deliver the 30-day and server safeguards.

## Out Of Scope

- Subscription checkout, billing, plan management, paywalls, or premium
  entitlement purchase.
- User-selected date ranges or unlimited scanning.
- Resumable local review drafts and dismissed-fingerprint persistence (#770).
- New trusted SMS templates or changes to template matching.
- Automatic merchant-category learning (#768).
- Bank-account suffix identifiers (#759).
- Voice quotas or changes to voice transaction behavior.
- Cross-device synchronization or reuse of mobile scan checkpoints.
- A production-facing QA screen, production fixture controls, or ordinary users
  selecting simulated AI outcomes.
- Routine safeguard QA against paid Gemini calls; any narrowly approved live
  provider smoke test is a separate explicit workflow.
