# Implementation Plan: Voice Usage Limits and Subscription-Ready Entitlements

**Branch**: `389-voice-usage-limits` | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/389-voice-usage-limits/spec.md`

**Note**: This plan is produced through the repository's `speckit.plan` workflow. It stops before task generation or production implementation.

## Summary

Add server-authoritative free-launch voice usage controls without changing the current Gemini voice parser or successful transaction response contract.

The free-launch policy is five provider-starting logical voice requests per authenticated user per local calendar day, with at most two provider-starting logical requests per minute. The server owns the current accepted local-day window, reservation/provider-start accounting, replay identity, and exhausted/burst decisions. The mobile client reads authoritative availability for UX only.

The architecture introduces a provider-independent voice entitlement contract so the later subscriptions module can replace the free-launch policy source without redesigning `parse-voice`.

The design uses:

- a voice-only entitlement policy resolver;
- server-only local-day window and work-request ledgers;
- atomic reserve -> provider-start -> complete/release transitions;
- a dedicated `voice-ai-availability` Edge Function;
- IANA timezone context from the device, validated and pinned by the server for the active allowance window;
- a stable logical request key for replay/idempotency;
- a mobile availability service/hook feeding the existing voice flow;
- approved mockups/binding metadata as a blocking prerequisite before visible UI implementation.

## Technical Context

**Language/Version**: TypeScript ~5.9.2 strict mode; PostgreSQL SQL migrations; Deno-based Supabase Edge Functions  
**Primary Dependencies**: Expo 55, React Native 0.83.6, Expo Router, `expo-localization` 55, `expo-crypto` 55, Supabase JS 2.106 mobile / Edge import mapping, Zod 4, existing Gemini `@google/genai`, NativeWind 4.2.6, i18next  
**Storage**: Supabase PostgreSQL server-only voice usage-window/work-request tables; explicitly excluded from WatermelonDB generation/sync  
**Testing**: Jest + React Native Testing Library, Node/`tsx --test` Edge/shared contract tests, Supabase local migration/RPC tests including concurrency, `deno check`, lint/typecheck, Maestro/manual voice journeys where device control is honest  
**Target Platform**: Android/iOS Expo mobile client + Supabase Edge Functions/PostgreSQL  
**Project Type**: Mobile + serverless API monorepo  
**Performance Goals**: Voice availability uses one lightweight authenticated Edge read; parse admission uses bounded local DB/RPC work before Gemini; quota enforcement must remain inside the existing ~30s client voice-analysis timeout; no additional provider call is introduced  
**Constraints**: 5 starts/local calendar day; 2 starts/minute; server authoritative; provider-start failure remains consumed; pre-provider refusals consume zero; multi-device/concurrency safe; user-local timezone worldwide; timezone changes cannot manufacture a new active quota window; successful voice parser response unchanged; no provider migration; no raw audio/transcript/financial content in quota persistence/logging; visible UI blocked on mockup approval  
**Scale/Scope**: One logical voice request = one allowance unit; low per-user volume but correctness required under concurrent multi-device requests and transport replay

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Constitution principle / hard rule | Status | Plan evidence |
| --- | --- | --- |
| I. Offline-First Data Architecture | PASS | Voice parsing is already an online AI capability. New quota tables are server-only operational state; financial/local app data authority is unchanged. |
| II. Documented Business Logic | PASS | Approved 5/day, 2/min, local-timezone, provider-start consumption, server-authoritative, and subscription-readiness rules are recorded in `docs/business/business-decisions.md`. |
| III. Type Safety | PASS | Public availability/refusal payloads are strict typed/Zod boundaries; timezone/policy/work state are explicit types; no `any` or non-null assertion is required. |
| IV. Service-Layer Separation | PASS | Entitlement resolution, availability service, quota persistence/RPCs, voice parser client, hook orchestration, and presentational UI remain separated. Gemini provider code does not own entitlement policy. |
| V. Premium UI / Theming | PASS WITH VISUAL GATE | The feature changes visible voice UX. Production UI work is blocked until approved mockups + binding sidecars cover required states/variants. |
| VI. Monorepo Package Boundaries | PASS | Mobile changes remain under `apps/mobile`; Edge/server logic remains under `supabase/functions`; shared pure types may use `packages/logic` only when needed. No reverse dependency is introduced. |
| VII. Local-First Migrations | PASS | All PostgreSQL tables/RPCs will be introduced through a numbered SQL migration. Server-only tables will be added to every Watermelon/sync exclusion list and tested. |
| VIII. Authenticated User Scope & Sync Correctness | PASS | Quota state is keyed by authenticated user, service-role mutated, unavailable to other users, and excluded from sync. Multi-device concurrency is database-authoritative. |
| External API runtime validation | PASS | New availability/refusal responses are runtime-validated on mobile; existing successful voice response validation remains unchanged. |
| Financial precision | PASS / NOT APPLICABLE | Feature stores counters/timestamps only; no financial arithmetic changes. |
| Privacy | PASS | No audio, transcript, accounts, categories, amounts, counterparties, or provider payloads enter quota ledgers. |
| Implementation-aligned documentation | PASS | Voice business decisions are updated in the same planning branch. |
| Mockup binding / evidence | PASS AS BLOCKING PREREQUISITE | No governed visible UI implementation may begin until mockup workflow approval/verifier gates pass. |

**Gate result**: PASS. No constitutional exception is required.

### Post-design re-check

Phase 1 introduces two server-only operational tables and one availability endpoint, with explicit local-first migration/sync exclusions. The successful `parse-voice` response remains unchanged. The visible client work remains blocked on the constitution's mockup approval/evidence gate. Constitution gate remains PASS.

## Phase 0: Research Decisions

Full rationale is in [research.md](./research.md).

Key decisions:

1. Preserve Gemini voice parsing and the successful transaction contract.
2. Use dedicated voice-only operational ledgers rather than SMS-named tables or a global AI-ledger refactor.
3. Reserve capacity atomically, then consume exactly once at provider start.
4. Use stable client-generated `requestKey` for transport replay idempotency.
5. Enforce local calendar day through a server-owned active window with a pinned accepted IANA timezone.
6. Source the device IANA timezone from existing `expo-localization`; never treat the client as accounting authority.
7. Resolve a provider-independent `VoiceEntitlementPolicy`; free launch is one source, future subscriptions another.
8. Add authenticated `voice-ai-availability` read endpoint.
9. Refresh client availability on focus/foreground, after attempts, on refusals, and at server-provided boundaries.
10. Preserve the successful `parse-voice` response; add only request metadata and structured refusal metadata.
11. Provider-started errors/timeouts/invalid output remain consumed; pre-provider refusals do not.
12. Keep quota persistence server-only, privacy-safe, excluded from Watermelon/sync, with bounded cleanup.
13. Use DB locking for final-unit and multi-device concurrency.
14. Require approved EN/AR/light/dark/responsive voice-limit mockups before visible implementation.
15. Use deterministic provider doubles for routine quota QA; do not consume Gemini allowance.

No unresolved planning questions remain.

## Phase 1: Design

### Entitlement boundary

```text
resolveVoiceEntitlement(userId)
        |
        +-- current: FreeLaunchVoiceEntitlementProvider
        |       -> server operational config
        |
        +-- future: SubscriptionVoiceEntitlementProvider
                -> same VoiceEntitlementPolicy contract
```

The parse handler consumes only the resolved entitlement. It does not know subscription tier names, prices, or billing state.

### Server state and admission

```text
authenticated + consented + structurally valid request
        |
        v
validate requestKey + callerTimeZone + provider config
        |
        v
resolve entitlement
        |
        v
voice_ai_reserve_work(...)
        |
        +-- daily/burst/dependency refusal --> no provider start, zero units
        |
        v
reserved (counts against concurrency capacity)
        |
        v
voice_ai_mark_provider_started(...)
        |
        +-- idempotent replay/already-started --> no duplicate provider call
        |
        v
provider_started  [one daily unit permanently consumed]
        |
        v
existing Gemini processWithRetry(...)
        |
        +-- success -> completed
        |
        +-- provider error/timeout/invalid output -> completed_with_provider_error
```

A reservation is released only when provider execution definitely did not start.

### Local-day window

The server owns one active `voice_ai_usage_windows` row per user.

```text
caller reports IANA timezone
        |
        v
server validates timezone
        |
        +-- no active window / expired window
        |       -> establish [local midnight, next local midnight)
        |          using reported timezone
        |
        +-- active window not expired
                -> keep existing accepted timezone/bounds
                   even if device timezone changed
```

This provides local-calendar-day semantics while preventing timezone hopping from creating additional quota inside an already-active window. The next window may adopt the user's then-current valid device timezone.

### Capacity calculation

Under a per-user advisory/transaction lock, effective daily remaining is:

```text
dailyLimit
- provider-started work inside accepted window
- active unexpired reservations inside accepted window
```

Burst capacity similarly includes provider starts within the last 60 seconds plus active reservations.

This guarantees concurrent requests cannot both claim the final daily/burst slot.

### Request identity

The mobile parser generates a fresh `requestKey` when one logical voice upload begins.

- automatic/transport replay of the same upload reuses that key;
- a newly recorded user retry uses a new key;
- server unique `(user_id, request_key)` provides idempotency;
- no financial provider response is persisted in the quota ledger;
- a replay after provider start cannot call Gemini again and returns a typed prior-result-unavailable decision.

### Parse-voice sequencing

Current transaction parsing logic stays intact. New quota logic surrounds provider start:

1. CORS/method.
2. Authenticate.
3. Active AI consent.
4. Parse/validate multipart input, audio size, accounts/categories, caller local date.
5. Validate new `requestKey` and `callerTimeZone`.
6. Validate current Gemini/provider configuration.
7. Resolve voice entitlement.
8. Atomically reserve capacity.
9. Build existing prompt/audio content.
10. Atomically mark provider started.
11. Execute existing Gemini `processWithRetry` (all internal provider retries remain one consumed request).
12. Complete work success/error.
13. Return the existing successful voice payload or typed refusal/error.

### Availability endpoint

New Edge surface:

```text
GET /functions/v1/voice-ai-availability?timeZone=<IANA>
```

It reuses:

- authentication;
- AI consent;
- entitlement resolver;
- active-window resolver;
- authoritative work-request counts.

It returns only:

- serverNow;
- accepted timeZone;
- dailyLimit;
- remaining;
- resetAt;
- reason;
- availableAt;
- burstAvailableAt.

It never calls Gemini and never receives audio/transaction content.

Full API shapes are in [contracts/voice-ai.openapi.yaml](./contracts/voice-ai.openapi.yaml).

### Mobile availability

Planned client layers:

```text
getDeviceTimeZone()
        |
        v
voice-ai-availability-service
        |
        v
useVoiceAiAvailability
        |
        +--> refresh on focus / app active / reset boundary
        +--> refresh after voice attempt
        +--> ingest authoritative refusal metadata
        |
        v
useVoiceTransactionFlow + tab layout
        |
        v
governed voice-limit UI
```

If authoritative availability cannot be loaded, the client does not claim another provider attempt is available.

### Successful response compatibility

The strict success response remains:

- `transcript`;
- `original_transcript`;
- `detected_language`;
- `transactions`.

Quota data is obtained through availability reads and error/refusal metadata, so existing transaction mapping/review behavior is unchanged.

### Public client error mapping

`VoiceParserErrorKind` will gain quota-aware client states only as needed to distinguish:

- daily exhausted;
- temporary burst limit;
- already-processed/replay result unavailable;
- authoritative availability unavailable.

These errors carry privacy-safe availability metadata; no audio/transcript/provider body is logged.

### Operational policy

Initial server configuration:

```text
VOICE_AI_DAILY_LIMIT=5
VOICE_AI_BURST_LIMIT=2
VOICE_AI_BURST_WINDOW_SECONDS=60
VOICE_AI_RESERVATION_LEASE_SECONDS=120
VOICE_AI_POLICY_VERSION=free-launch-v1
```

No mobile release is required to alter those values. Invalid/missing policy fails closed.

### Server-only migration/sync boundary

A numbered migration will add:

- `voice_ai_usage_windows`;
- `voice_ai_work_requests`;
- service-role-only resolve/availability/reserve/start/release/complete/cleanup functions.

The two tables must be added to:

- `scripts/transform-schema.js` exclusions;
- `scripts/sql-to-watermelon-migration.js` exclusions;
- `apps/mobile/services/sync/config.ts` exclusions.

Tests must prove no local Watermelon/sync representation is generated.

### Privacy

Quota persistence/logging may include:

- user ID;
- opaque request key;
- accepted timezone/local-date window;
- status/decision;
- reservation/provider-start timestamps;
- aggregate remaining/limit metadata.

It must not include:

- audio bytes/URI;
- transcript/original transcript;
- categories/accounts;
- amount/currency/counterparty/note;
- Gemini request/response content;
- credentials.

### UI/mockup approval gate

Visible implementation is not yet authorized by a binding reference. Before UI tasks begin, use the repository mockup workflow and obtain explicit approval for every governed state.

Likely affected surfaces:

- `apps/mobile/components/tab-bar/CustomBottomTabBar.tsx`;
- `apps/mobile/components/voice/VoiceRecordingOverlay.tsx`;
- `apps/mobile/app/(private)/(tabs)/_layout.tsx`.

Planning does **not** decide exact placement of remaining count, exhausted messaging, or burst messaging. Those are mockup decisions.

Required state/variant coverage is listed in [quickstart.md](./quickstart.md).

## Project Structure

### Documentation (this feature)

```text
specs/389-voice-usage-limits/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── contracts/
    └── voice-ai.openapi.yaml
```

### Source Code (repository root)

Planned implementation surfaces:

```text
supabase/
├── migrations/
│   └── <next>_voice_ai_usage_limits.sql
└── functions/
    ├── _shared/
    │   ├── voice-ai-entitlement.ts
    │   ├── voice-ai-entitlement.test.ts
    │   ├── voice-ai-safeguard-contract.ts
    │   ├── voice-ai-safeguard-service.ts
    │   ├── voice-ai-availability-handler.ts
    │   └── voice-ai-availability-handler.test.ts
    ├── voice-ai-availability/
    │   ├── index.ts
    │   └── deno.json
    └── parse-voice/
        └── index.ts

apps/mobile/
├── services/
│   ├── ai-voice-parser-service.ts
│   └── voice-ai-availability-service.ts
├── hooks/
│   ├── useVoiceTransactionFlow.ts
│   └── useVoiceAiAvailability.ts
├── utils/
│   └── device-time-zone.ts
├── components/
│   ├── tab-bar/CustomBottomTabBar.tsx       # governed by approved mockup
│   └── voice/VoiceRecordingOverlay.tsx      # governed by approved mockup
├── app/(private)/(tabs)/_layout.tsx
├── locales/en/common.json
├── locales/ar/common.json
└── __tests__/
    ├── services/
    ├── hooks/
    └── components/

packages/logic/src/
└── types.ts                                  # only if quota-aware VoiceParserError typing belongs in shared public type

scripts/
├── transform-schema.js
├── sql-to-watermelon-migration.js
└── __tests__/                                # server-only exclusion/migration contracts
```

**Structure Decision**: Keep the existing voice service -> hook -> presentational UI architecture. Add one cohesive voice safeguard/entitlement capability under Edge shared modules, a separate availability Edge Function, and server-only SQL state. Do not generalize SMS ledgers or create an all-AI quota framework in this feature.

## Verification Gates

Implementation is not complete until:

- local migration/RPC tests prove 5/day and 2/min exact boundaries;
- concurrent final-unit test permits exactly one provider start;
- same request-key replay never double-consumes or recalls Gemini;
- pre-provider auth/consent/validation/policy/timezone refusals consume zero;
- provider-start success/failure/timeout/invalid response each consume exactly one logical unit;
- internal Gemini retries still consume one unit;
- timezone/DST tests prove local-midnight boundaries;
- mid-window timezone change does not reset usage;
- expired window adopts a newly reported valid timezone;
- server-only tables are absent from Watermelon generation/sync;
- availability endpoint auth/consent/fail-closed contracts pass;
- mobile availability state is user-scoped and refreshed after attempts/focus/foreground/boundaries;
- existing representative voice parsing tests remain unchanged/Green;
- privacy tests prove no raw audio/transcript/financial content in ledger/logging;
- EN/AR/i18n checks pass;
- governed UI mockup verifier, visual comparison evidence, responsive/dark/RTL/enlarged-text evidence, and accessibility evidence all pass after UI implementation;
- no voice provider/model migration occurs.

## Implementation Sequencing Guidance

This is plan guidance for the later `speckit.tasks` command; no implementation occurs here.

1. Approve voice-limit mockups/binding metadata before any governed UI production work.
2. Add Red migration/RPC tests for active local-day windows, reservation/start accounting, concurrency, replay, failure consumption, timezone/DST, privacy, and server-only exclusions.
3. Add the local SQL migration and exclusion wiring; bring DB/RPC tests Green.
4. Add Red entitlement/policy and availability-handler tests.
5. Implement provider-independent entitlement resolver, safeguard service, and availability endpoint.
6. Add Red `parse-voice` admission/accounting tests with Gemini double.
7. Wire requestKey/timezone + reserve/start/complete around the existing Gemini path without changing the successful parsing response.
8. Add Red mobile availability/timezone/parser-service/hook tests.
9. Implement device-timezone utility, availability service/hook, quota-aware parser refusal mapping, and flow refresh behavior.
10. Implement approved visual states exactly from mockups, including EN/AR and accessibility.
11. Run affected voice regression, migration/sync, type/lint/i18n, integration, rendered visual/accessibility evidence, and manual multi-device/timezone QA.
12. Configure/deploy only after separate deployment authorization and current verification.

## Complexity Tracking

No constitutional violations require an exception.
