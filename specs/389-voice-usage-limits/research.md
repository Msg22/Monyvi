# Research: Voice Usage Limits and Subscription-Ready Entitlements

**Feature**: 389-voice-usage-limits  
**Date**: 2026-09-27  
**Status**: Complete — no unresolved planning clarifications

## R-001: Preserve the current voice provider and parsing contract

**Decision**: Keep the existing `parse-voice` Gemini 2.5 Flash-Lite provider path, audio/transcript/transaction semantics, and review flow unchanged. Insert entitlement and usage-accounting gates around provider start rather than refactoring the provider itself.

**Rationale**:

- The approved scope is cost control, not a provider migration.
- Existing voice quality and structured parsing behavior are already product-approved.
- Separating quota enforcement from provider code lets a later provider migration reuse the same entitlement contract.

**Alternatives considered**:

- Move voice to ASR + LLM in this feature: rejected as out of scope.
- Couple plan names/quotas directly into Gemini code: rejected because it would make future subscriptions/provider changes expensive.

## R-002: Use dedicated voice-only operational ledgers

**Decision**: Add server-only `voice_ai_usage_windows` and `voice_ai_work_requests` tables rather than reusing the existing `sms_ai_*` tables.

**Rationale**:

- Existing SMS ledgers are explicitly SMS-specific and constrain capability values to SMS flows.
- Voice has different daily/local-time semantics and one request consumes one unit rather than candidate counts.
- Reusing the proven reservation/provider-start pattern is valuable; reusing SMS-named persistence would create cross-capability coupling and misleading ownership.
- These tables are operational cost-control state, not synchronized user app data.

**Alternatives considered**:

- Reuse `sms_ai_work_requests`: rejected because its schema/business decisions are SMS-specific.
- Client counters: rejected because reinstall/tampering/multi-device concurrency would bypass them.
- Generalize all AI usage into a new global ledger now: rejected as broader than #347.

## R-003: Separate reservation from provider start

**Decision**: Use a two-phase state machine:

1. reserve one potential daily/burst unit after auth, consent, request/timezone validation, and provider configuration validation;
2. atomically mark the work request provider-started immediately before the first Gemini attempt.

Active reservations count against available capacity until they start or their short lease expires.

**Rationale**:

- Concurrency cannot oversubscribe the fifth daily unit.
- Pre-provider failures can release or avoid reservation without consuming usage.
- Once provider start succeeds, exactly one unit remains consumed even if Gemini later retries internally, fails, times out, or returns invalid output.
- This matches the approved business rule and the established SMS safeguard pattern.

**Alternatives considered**:

- Count successful responses only: rejected because failed provider calls can still cost money.
- Count before request validation: rejected because pre-provider refusals must consume zero.
- Count each internal Gemini retry: rejected because one logical voice request consumes exactly one unit.

## R-004: Stable logical request identity

**Decision**: The mobile voice parser sends a generated `requestKey` for each logical voice submission. The same key is reused only for transport replay of that same submission. Server persistence enforces unique `(user_id, request_key)`.

A replay of an already provider-started/completed request does not call Gemini again and returns an explicit already-processed/unavailable-result decision because the quota ledger does not persist financial provider output.

**Rationale**:

- Prevents double consumption under ambiguous transport retries.
- Avoids persisting sensitive transcript/transaction payloads merely for idempotency.
- A user intentionally records again/retries with a new recording is a new logical request and may consume a new unit.

## R-005: Local calendar-day enforcement uses a pinned accepted window

**Decision**: The client supplies its current IANA timezone. The server validates it against PostgreSQL timezone data and owns an active per-user usage window containing accepted timezone, local date, UTC window start, and UTC window end.

While the current accepted window has not ended, a changed client timezone does **not** create a new quota window. Once the accepted window expires, the next availability/reservation call may establish the next local calendar-day window using the then-current valid client timezone.

**Rationale**:

- Honors the approved “user local timezone” product rule worldwide.
- Prevents users from timezone-hopping to manufacture multiple five-use days.
- Handles DST using timezone-aware database conversion rather than assuming every day is exactly 24 hours.
- Server-provided `resetAt` remains authoritative for UI.

**Alternatives considered**:

- Egypt timezone: explicitly rejected by product decision.
- UTC calendar day: explicitly rejected.
- Trust every reported timezone immediately: rejected because changing timezone could reset allowance.
- Add a permanent profile timezone: unnecessary product/profile expansion for this feature.

## R-006: Device timezone source

**Decision**: Reuse `expo-localization` / `getCalendars()[0].timeZone` as the mobile IANA-timezone source and centralize it in a small utility so both availability and parse calls send the same value.

**Rationale**:

- The app already uses this API for timezone-driven currency hints.
- No new permission is required.
- The client provides context only; the server validates and pins the accepted quota window.

If no valid timezone can be supplied, provider-starting voice work fails closed rather than silently falling back to Egypt or UTC.

## R-007: Provider-independent entitlement resolver

**Decision**: Introduce a server-side `VoiceEntitlementPolicy` contract resolved before usage checks. The free-launch resolver reads operational configuration and returns:

- mode: metered (initially);
- daily limit: 5;
- burst limit: 2;
- burst window: 60 seconds;
- policy version/source metadata.

The interface permits a future subscription resolver to return a different metered allowance or an unmetered mode without changing `parse-voice`.

**Rationale**:

- Today's free-launch marketing policy is temporary.
- Provider code should consume an entitlement result rather than know plan names/prices.
- Operational changes require no mobile release.

**Initial configuration**:

- `VOICE_AI_DAILY_LIMIT=5`
- `VOICE_AI_BURST_LIMIT=2`
- `VOICE_AI_BURST_WINDOW_SECONDS=60`
- `VOICE_AI_RESERVATION_LEASE_SECONDS=120`

Missing/invalid server policy configuration fails closed. A technical unmetered mode may be represented internally for future entitlement compatibility; no commercial “unlimited” plan is defined here.

## R-008: Availability endpoint

**Decision**: Add a dedicated authenticated `voice-ai-availability` Edge Function patterned after `sms-ai-availability`.

It accepts the caller timezone and returns only quota/availability metadata:

- server time;
- accepted timezone;
- daily limit;
- remaining units;
- reset time;
- current blocker/reason;
- temporary burst availability time.

It contains no audio, transcript, account, category, or transaction content.

**Rationale**:

- The UI needs authoritative remaining/exhausted state before users record.
- A dedicated read path avoids invoking or coupling to Gemini.
- The same server policy/window resolver is reused by parse admission.

## R-009: Client availability behavior

**Decision**: Add a mobile availability service + hook that refreshes:

- when the private tab layout becomes active/focused;
- when the app returns to foreground;
- after every voice parse attempt that may have reached provider start;
- after an authoritative quota refusal;
- when a known `availableAt/resetAt` boundary passes.

Unknown/dependency-unavailable authoritative state blocks starting a new provider-bound voice flow; the client must not claim usage is available when it cannot confirm it.

**Rationale**:

- Stale client state is expected under multi-device use.
- The client is UX-only; server refusal always wins.
- Refresh after failed provider-started requests is required because those still consume a unit.

## R-010: Parse-voice request/response changes

**Decision**: Preserve the successful voice transaction response exactly. Extend only request metadata and structured refusal behavior:

New multipart metadata:
- `requestKey`
- `callerTimeZone`

Existing `callerLocalDate` remains for relative transaction-date behavior.

Quota/burst/idempotency refusals use non-2xx responses with privacy-safe reason + availability metadata. Successful parsed transaction responses do not gain quota fields.

**Rationale**:

- Avoids breaking the strict existing success response Zod schema.
- Keeps transaction parsing contract independent from entitlement UX.
- Error metadata lets a stale client immediately reconcile to authoritative exhausted/burst state.

## R-011: Provider-started failure consumption

**Decision**: Internal Gemini retries remain inside one provider-started work request. After provider-start is recorded, completion may be success or provider-error, but the daily unit is never released.

A reservation is released only when the Edge Function can prove provider execution never began.

**Rationale**: This is the explicit approved product rule and accurately reflects provider-cost exposure.

## R-012: Server-only persistence and cleanup

**Decision**:

- Enable RLS on voice operational tables.
- Revoke ordinary `anon` / `authenticated` CRUD.
- Grant mutation/admission RPCs only to `service_role`.
- Exclude voice operational tables from Watermelon schema generation and mobile sync.
- Retain only aggregate identity/accounting metadata; cleanup old work rows on a bounded operational retention schedule (35 days initially, matching existing safeguard practice).

No raw audio, transcript, categories, accounts, amounts, or provider response content enters quota tables.

## R-013: Concurrency

**Decision**: Voice reserve/start RPCs take a per-user advisory/row lock before calculating current window capacity, active reservations, and burst starts.

**Rationale**:

- Two devices submitting when one daily unit remains must not both be admitted.
- Database-side atomicity is the security/cost boundary, not client sequencing.

## R-014: UI and mockup gate

**Decision**: The voice-limit feature is a material visible UI change and therefore requires approved mockups/binding metadata before production UI implementation.

Mockups must cover at least:

- normal available state with remaining count;
- low/last-remaining state if visually distinct;
- daily exhausted state + reset guidance;
- temporary burst-limited state;
- availability/dependency-unavailable recovery state;
- recording/analyzing interaction with allowance display;
- English and Arabic/RTL;
- light/dark;
- ordinary + compact phone, with tablet/landscape/enlarged-text behavior documented where relevant.

Candidate governed surfaces are the central mic/tab-bar entry and/or `VoiceRecordingOverlay`; exact placement is intentionally not chosen in planning.

## R-015: Testing strategy

**Decision**: Use strict TDD around policy/window/accounting before production wiring.

Required deterministic coverage:

- 5/day exact boundary;
- 2/min burst exact boundary;
- concurrent last unit;
- same request-key replay;
- pre-provider rejection consumes zero;
- provider-start success/failure/timeout/invalid output all consume one;
- internal Gemini retries consume one;
- timezone validation;
- DST day length;
- timezone change cannot create a second active day;
- next window adopts newly reported timezone;
- multi-device shared allowance;
- availability endpoint auth/consent/fail-closed behavior;
- client stale/exhausted refresh;
- user-switch isolation;
- existing voice parsing regression;
- no raw voice/financial content in ledgers/logging.

Routine quota tests use provider doubles and must not consume real Gemini allowance.
