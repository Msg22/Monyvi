# Implementation Plan: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Branch**: `389-voice-usage-limits` | **Date**: 2026-10-07 | **Spec**:
[spec.md](./spec.md)\
**Input**: Feature specification from `/specs/389-voice-usage-limits/spec.md`

**Note**: This plan is produced through the repository's `speckit.plan`
workflow. It stops before task generation or production implementation.

## Summary

Expand the current voice-limit work into the approved Add Transaction redesign
while preserving all existing transaction/business behavior.

The user-facing result is one `/add-transaction` page with **Manual** and
**Voice** modes:

- Manual reuses the existing transaction form and remains the default when
  opened from the Add Transaction FAB.
- Voice uses the already-approved mockup and reuses the existing Gemini voice
  parsing/review flow.
- The center microphone, onboarding voice entry, and voice-review Retry navigate
  to the same page in Voice mode.
- Safe Manual state remains mounted across mode switches.
- Mode switching is disabled while voice recording/finalization/analysis is
  active.

The free-launch voice policy is enforced server-side:

- 5 provider-starting logical requests per authenticated user per local calendar
  day;
- 2 provider-starting logical requests per minute;
- reset at the next local midnight in a server-pinned IANA timezone window;
- pre-provider refusals consume zero;
- after provider start, exactly one unit remains consumed even when Gemini
  ultimately fails, times out, or returns invalid output.

The design introduces a provider-independent entitlement boundary so a later
subscriptions module can replace the free-launch policy source without
redesigning the Add Transaction page or Gemini parser.

No voice provider/model migration is included.

## Technical Context

**Language/Version**: TypeScript ~5.9.2 strict mode; PostgreSQL SQL migrations;
Deno-based Supabase Edge Functions\
**Primary Dependencies**: Expo 55, React Native 0.83.6, Expo Router,
`expo-localization` 55, `expo-crypto` 55, Supabase JS 2.106 mobile / Edge import
mapping, Zod 4, existing Gemini `@google/genai`, NativeWind 4.2.6, i18next\
**Storage**: Existing WatermelonDB financial data unchanged; new server-only
Supabase PostgreSQL `voice_ai_usage_windows` and `voice_ai_work_requests` tables
excluded from WatermelonDB generation/sync\
**Testing**: Jest + React Native Testing Library; Node/`tsx --test` shared/Edge
tests; SQL/migration/RPC tests including concurrency; `deno check`;
TypeScript/lint/format/i18n checks; approved-mockup visual evidence;
device/manual QA where honestly executable\
**Target Platform**: Expo React Native Android/iOS client + Supabase Edge
Functions/PostgreSQL\
**Project Type**: Mobile + serverless API monorepo\
**Performance Goals**: Availability lookup is one lightweight authenticated Edge
request with no provider call; quota admission completes before Gemini and
within the existing voice request latency budget; no additional AI/provider
call; unified page switching produces no visible form reset/jank\
**Constraints**: 5 starts/local calendar day; 2 starts/minute; server
authoritative; local-midnight reset; timezone hopping cannot create an extra
active window; provider-start failure remains consumed; pre-provider refusal
consumes zero; multi-device/concurrency safe; successful Gemini transaction
response unchanged; Manual entry stays usable when Voice is unavailable; no raw
audio/transcript/financial content in quota persistence/logging; no provider
migration; no new mockup generation\
**Scale/Scope**: One allowance unit per logical voice request; low individual
volume but strict correctness under two-device/concurrent final-unit races,
ambiguous transport replay, timezone travel/DST, and stale client state

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

| Constitution principle / hard rule                | Status                           | Plan evidence                                                                                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Offline-First Data Architecture                | PASS                             | Manual transaction entry and persisted finance data remain local-first. Voice is already network-dependent; the new quota state is server-only operational metadata and does not become app financial source-of-truth data.                           |
| II. Documented Business Logic                     | PASS                             | The approved 5/day, 2/min, local-midnight reset, provider-start consumption, subscription-readiness, and unified Add Transaction Manual/Voice behavior are recorded in `docs/business/business-decisions.md`.                                         |
| III. Type Safety                                  | PASS                             | Route mode, entitlement, availability, work-state, refusal, timezone, and client parser-error boundaries use explicit readonly types/Zod where external data crosses runtime boundaries. No `any` or non-null assertions are required by design.      |
| IV. Service-Layer Separation                      | PASS                             | Manual form behavior stays in its form component/service layer; voice hook stays orchestration-only; entitlement/safeguard service owns cost policy; Edge handlers own authoritative enforcement; Gemini provider code does not own plan/quota rules. |
| V. Premium UI / Theming                           | PASS WITH BINDING GATE           | The exact existing approved mockup is the required visual target. No UI implementation starts until that exact image is persisted unchanged, its binding sidecar is approved, and the binding verifier passes.                                        |
| VI. Monorepo Package Boundaries                   | PASS                             | Mobile UI/services/hooks remain under `apps/mobile`; Edge/runtime quota logic under `supabase/functions`; no reverse imports or unnecessary new package.                                                                                              |
| VII. Local-First Migrations                       | PASS WITH REQUIRED SQL MIGRATION | New server-only tables/RPCs use the next numbered SQL migration, normal local migration workflow, generated Supabase types, and explicit Watermelon/sync exclusions.                                                                                  |
| VIII. Authenticated User Scope & Sync Correctness | PASS                             | Quota rows are authenticated-user scoped, mutated by service-role RPCs after JWT verification, unavailable via ordinary client CRUD, and excluded from sync. DB locking owns multi-device concurrency.                                                |
| External API runtime validation                   | PASS                             | New availability/refusal payloads are runtime-validated on mobile; existing successful `parse-voice` response validation remains intact.                                                                                                              |
| Financial precision                               | PASS / NOT CHANGED               | No financial arithmetic, transaction schema, or saving semantics change.                                                                                                                                                                              |
| Privacy                                           | PASS                             | Quota persistence contains user/request/timezone/timestamps/status only; no audio, transcript, accounts, categories, amounts, counterparties, Gemini content, or credentials.                                                                         |
| Approved mockup binding                           | PASS AS PRE-IMPLEMENTATION GATE  | Planning consumes the user's existing approval but does not recreate the image. Exact bytes + approved sidecar must be persisted before UI tasks.                                                                                                     |
| Accessibility / i18n                              | PASS WITH REQUIRED EVIDENCE      | Unified mode controls and hidden content require correct semantics; English/LTR and Arabic/RTL are required; visual evidence covers enlarged text/small screens without silently redesigning the approved composition.                                |

**Gate result**: PASS. No constitutional exception is required.

### Post-design re-check

Phase 1 adds two server-only operational tables, one availability Edge endpoint,
additive `parse-voice` request/refusal metadata, and a unified client route. The
successful financial response and Watermelon financial schema remain unchanged.
Manual remains available independent of Voice quota state. The mockup binding
remains a hard implementation gate. Constitution gate remains PASS.

## Phase 0: Research Decisions

Full rationale is in [research.md](./research.md).

Key decisions:

1. Preserve Gemini 2.5 Flash-Lite and the existing successful voice transaction
   response/review behavior.
2. Keep `/add-transaction` as the single unified route with `manual | voice`
   mode and Manual default.
3. Route FAB -> Manual; center mic/onboarding/review retry -> Voice.
4. Keep the mature manual form behavior intact and mounted across safe mode
   switches.
5. Move voice hook/consent/availability ownership from the global tab layout
   into the unified Add Transaction page.
6. Disable mode switching during recording/paused/finalizing/analyzing rather
   than implicitly discarding active voice work.
7. Persist/bind the exact already-approved mockup before UI implementation; do
   not generate a replacement.
8. Use dedicated voice-only server ledgers modeled after the proven SMS
   reserve/start lifecycle, not SMS tables or a global AI-ledger refactor.
9. Reserve atomically, consume exactly once immediately before the first Gemini
   attempt, and never release after provider start.
10. Generate a stable opaque request key with existing `expo-crypto` support.
11. Use validated device IANA timezone context with a server-pinned active
    local-day window; timezone changes apply only after the active window
    expires.
12. Use a provider-independent `VoiceEntitlementPolicy`; free-launch environment
    config is the first source and future subscriptions can replace it.
13. Add a dedicated authenticated `voice-ai-availability` read endpoint.
14. Keep the successful `parse-voice` response unchanged; add request metadata
    and typed non-success quota/refusal metadata only.
15. Keep quota persistence server-only, privacy-safe, and excluded from
    Watermelon/sync.
16. Reset copy must describe next-day/local-midnight behavior and must not say
    "tomorrow at the same time".

Technical reconciliation is recorded in `reconciliation.md`. The owner has
approved both immutable mockup bindings/EN-AR copy and 35-day replay identity
retention. Final read-only analysis remains the planning gate; a represented
future entitlement is not launch authority.

## Phase 1: Design

### Unified Add Transaction ownership

```text
/add-transaction?mode=manual|voice
        |
        +-- AddTransaction page shell
        |     |
        |     +-- Manual mode
        |     |     -> existing manual transaction form logic/component
        |     |        remains mounted while Voice is selected
        |     |
        |     +-- Voice mode
        |           -> approved mockup
        |           -> useVoiceAiAvailability
        |           -> useVoiceTransactionFlow
        |           -> AI consent recovery
        |
        +-- mode selected from route intent / user control
```

Navigation:

```text
QuickActionFab Add Transaction -> /add-transaction?mode=manual
Center mic                     -> /add-transaction?mode=voice
openVoiceEntry/onboarding      -> /add-transaction?mode=voice
voice-review Retry             -> /add-transaction?mode=voice&retry=true
invalid/missing mode           -> manual
```

The private tab layout retains the bottom navigation/mic button but no longer
owns the recording overlay or voice parser hook.

### Manual form preservation

The existing `apps/mobile/app/(private)/add-transaction.tsx` form is extracted
into a reusable Manual entry component with no business-behavior rewrite:

- amount calculator;
- type/transfer behavior;
- account/category selection;
- optional fields;
- recurring-payment creation;
- market-rate conversion;
- budget alert;
- validation/error scrolling;
- transaction/transfer save behavior.

The unified page keeps this component mounted and hides it
visually/accessibility-wise when Voice is selected. This preserves partial
Manual state without introducing persistent drafts.

### Voice mode

Voice mode composes existing behavior rather than reimplementing parsing:

```text
VoiceTransactionEntry (approved mockup)
        |
        +-- authoritative availability display/gating
        +-- useVoiceTransactionFlow
        +-- existing useVoiceRecorder
        +-- existing parseVoiceWithAi
        +-- existing voice-review navigation
```

The current `VoiceRecordingOverlay` is not assumed to remain the visual
authority. Its logic/components may be reused/refactored only as consistent with
the approved binding.

Mode controls are disabled while `flowStatus` is recording, paused,
completed/finalizing, or analyzing. Manual is available during
idle/error/exhausted/burst-limited/availability-unavailable states.

### Mockup authority

Before any governed UI implementation:

1. persist the exact already-approved image bytes unchanged under
   `specs/389-voice-usage-limits/mockups/`;
2. create sidecar from `.specify/templates/mockup-binding-template.md`;
3. populate only evidenced binding facts and UNKNOWNs;
4. obtain explicit approval of the binding metadata + combined revision;
5. run `node scripts/verify-mockup-binding.js <sidecar>`.

No recreated screenshot or regenerated image is a substitute.

[contracts/add-transaction-ui-contract.md](./contracts/add-transaction-ui-contract.md)
defines the non-visual navigation/mode behavior.

### Entitlement boundary

```text
resolveVoiceEntitlementPolicy()
        |
        +-- current: FreeLaunchVoiceEntitlementProvider
        |       -> validated server env configuration
        |
        +-- future: SubscriptionVoiceEntitlementProvider
                -> same VoiceEntitlementPolicy contract
```

Initial configuration:

```text
VOICE_AI_DAILY_LIMIT=5
VOICE_AI_BURST_LIMIT=2
VOICE_AI_BURST_WINDOW_SECONDS=60
VOICE_AI_RESERVATION_LEASE_SECONDS=120
VOICE_AI_POLICY_VERSION=free-launch-v1
```

Invalid/missing policy fails closed. The mobile app never owns authoritative
numeric policy.

### Server operational state

Two server-only tables:

```text
voice_ai_usage_windows
  one current pinned local-day/timezone window per user

voice_ai_work_requests
  one idempotent logical request/reservation/provider-start lifecycle
```

No separate usage-events table is necessary: daily/burst counts derive from
provider-started/completed work-request rows plus active unexpired reservations
under one per-user lock.

No raw audio/transcript/financial content is stored.

### Local-day timezone window

```text
client IANA timezone
      |
      v
validate against PostgreSQL timezone names
      |
      +-- no row / expired window
      |      -> pin supplied timezone
      |      -> compute [local midnight, next local midnight)
      |
      +-- active window
             -> preserve pinned timezone/window
                even if device timezone changed
```

After `window_ends_at`, the next authoritative evaluation may adopt the user's
then-current valid device timezone. This supports travel without allowing
timezone hopping to reset quota mid-window and naturally handles 23/25-hour DST
days.

If the client cannot provide a valid timezone or authoritative storage is
unavailable, new Voice provider work fails closed. Manual remains usable.

### Atomic reserve/provider-start lifecycle

```text
auth + consent + validated input/timezone/provider config
        |
        v
resolve entitlement
        |
        v
voice_ai_reserve_work()
        |
        +-- refused daily/burst/dependency
        |      -> zero units
        |
        v
reserved
(counts against concurrent capacity)
        |
        +-- definitely no provider start
        |      -> release -> zero units
        |
        v
voice_ai_mark_provider_started()
        |
        +-- exactly one provider-start consumption
        |
        v
existing Gemini processWithRetry()
        |
        +-- success -> completed
        +-- error/timeout/invalid output -> completed_with_provider_error
```

All internal Gemini retries happen after one provider-start transition and
therefore consume one daily unit total.

RPCs use a per-user advisory/row lock so two devices cannot both claim the final
daily/burst slot.

### Request identity

The mobile client creates one opaque `requestKey` with `expo-crypto` for one
logical upload.

- transport replay of the same logical submission reuses the key;
- a newly recorded attempt gets a new key;
- unique `(user_id, request_key)` prevents duplicate provider starts for the
  35-day protection horizon and while the identity remains retained;
- provider financial output is not persisted in the quota ledger;
- replay after provider start returns a typed
  `already_processed_result_unavailable` refusal rather than recalling Gemini or
  fabricating a result.

### Request retention and bounded cleanup

Owner-approved on 2026-10-07: retain request identities for 35 elapsed days (35
× 24 hours) from immutable server `created_at`, then delete eligible whole
terminal work-request rows. Do not extend retention on retry/status update.
Eligibility and admission/start share the same per-user lock; cleanup must
recheck terminal state and exclude active work/leases and all current daily,
burst and reservation accounting. Never delete an active usage-window row or
refund a started unit through cleanup. Data-model §3 defines the canonical
eligibility predicate; scheduling/batch size require migration tests.

While an old record remains, ordinary replay refusal still applies. After actual
eligible deletion, the same key may be admitted as new only through current
auth/consent/validation/entitlement/quota gates. There is no lifetime tombstone,
third table or sensitive payload. SQL and HTTP tests cover just before/exactly
at/after the cutoff, cleanup races, active-record preservation and post-deletion
readmission/refusal.

Technical execution parameters frozen on 7 October 2026: schedule cleanup hourly
at minute 17 (cron `17 * * * *`), with a hard maximum of 500 eligible
work-request rows per invocation. Use descriptive SQL constants/defaults and
test the job definition, bounded batch and repeated backlog drainage. Candidate
selection is not deletion authority: recheck terminal/current-accounting safety
under each candidate user's admission/start lock. Busy or unsafe rows may remain
retained until a later run; replay protection continues until actual deletion.
Cadence/batch tuning cannot change the 35 × 24 elapsed-hour cutoff, release
active work, refund quota or add client/hosted mutation authority.

### parse-voice sequence

Existing parsing logic remains inside the provider boundary. New flow:

1. CORS/method.
2. JWT authentication.
3. AI consent.
4. Preserve current audio/categories/accounts validation and optional
   `callerLocalDate`: omitted/empty retains the UTC-date fallback, while a
   non-empty invalid date is refused before provider start. This fallback is
   relative-date context only; it never supplies the required quota timezone.
5. Validate new `requestKey` and `callerTimeZone`.
6. Validate Gemini/provider configuration.
7. Resolve entitlement.
8. Atomically reserve work.
9. Build existing category/account prompt and audio content.
10. Atomically mark provider started.
11. Run existing Gemini `processWithRetry`.
12. Complete provider-started work as success or provider error.
13. Return existing success payload unchanged, or typed quota/dependency
    refusal.

### Availability endpoint

New authenticated POST endpoint:

`/functions/v1/voice-ai-availability`

Request:

```json
{ "timeZone": "Africa/Cairo" }
```

It calls no AI provider and returns authoritative:

- server time;
- pinned accepted timezone;
- daily limit;
- remaining units;
- resetAt;
- current reason;
- availableAt;
- burstAvailableAt;
- policy version.

See
[contracts/voice-ai-availability.openapi.yaml](./contracts/voice-ai-availability.openapi.yaml).

### parse-voice contract extension

Multipart adds:

- `requestKey`;
- `callerTimeZone`.

Existing `callerLocalDate`, audio, categories, and accounts stay.

Successful 200 response stays unchanged.

Quota/burst/replay refusals return privacy-safe non-financial metadata before
Gemini start. See
[contracts/parse-voice-quota.openapi.yaml](./contracts/parse-voice-quota.openapi.yaml).

### Mobile availability and error mapping

Planned layers:

```text
getDeviceTimeZone()
        |
        v
voice-ai-availability-service
        |
        v
useVoiceAiAvailability
        |
        +-- refresh on page focus / app active
        +-- refresh after every voice attempt
        +-- refresh at server reset/burst boundary
        +-- ingest authoritative parse refusal metadata
        |
        v
VoiceTransactionEntry + useVoiceTransactionFlow
```

Availability state is user-scoped in memory and cleared on authenticated-user
change/unmount. The client never durably decrements quota.

`VoiceParserErrorKind` gains quota-aware states only as needed:

- daily exhausted;
- temporary burst-limited;
- already-processed result unavailable;
- authoritative usage unavailable.

### Test-first bootstrap for new server interfaces

The existing parse-voice HTTP handler is the initial executable behavior
boundary. Test-only Deno import mappings replace SDKs with controlled doubles
and capture that unchanged handler; no production fixture mode or real provider
is needed. After its accepted behavioral quota/replay/input Red and T006 schema
contract Red, introduce only the minimum local callable SQL/contract interfaces.
Then execute direct contract and actual independent-session PostgreSQL tests
before implementing the remaining behavior. Missing modules/functions are
runner/setup blockers, never behavioral or concurrency evidence. Full local
PostgreSQL HTTP Red still precedes final production wiring. The detailed staged
DAG is in tasks.md; all 59 IDs, endpoint contracts and owner decisions remain.

### Server-only migration and sync boundary

The next numbered SQL migration adds:

- `voice_ai_usage_windows`;
- `voice_ai_work_requests`;
- service-role-only availability/reserve/start/release/complete/cleanup RPCs;
- constraints/indexes and cleanup scheduling.

Required repository updates:

- generated Supabase types;
- `scripts/transform-schema.js` server-only exclusions;
- `scripts/sql-to-watermelon-migration.js` exclusions;
- `apps/mobile/services/sync/config.ts` exclusions;
- migration/RPC/server-only regression tests.

No Watermelon schema/model/migration is created for these tables.

### Privacy

Allowed operational fields:

- authenticated user ID;
- opaque request key;
- accepted timezone/local day/window;
- policy version;
- reservation/status/decision;
- reset/available/provider-start timestamps.

Forbidden:

- audio bytes or URI;
- transcript/original transcript;
- category/account context;
- amount/currency/counterparty/note;
- Gemini request/response body;
- credentials.

### Localization and reset copy

Authoritative reset is local midnight.

Visible copy:

- may say a simple next-day message such as “Your voice limit resets tomorrow”;
- must not say “tomorrow at the same time”;
- must not expose technical timezone jargon;
- requires approved English and Arabic/RTL binding/copy.

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
├── contracts/
│   ├── add-transaction-ui-contract.md
│   ├── parse-voice-quota.openapi.yaml
│   └── voice-ai-availability.openapi.yaml
└── mockups/
    ├── <exact-approved-reference>.png          # persist unchanged before UI implementation
    └── <exact-approved-reference>.binding.md  # explicit approval + verifier required
```

### Source Code (repository root)

Planned implementation surfaces:

```text
apps/mobile/
├── app/(private)/
│   ├── add-transaction.tsx                    # unified route/shell, mode intent
│   ├── voice-review.tsx                       # Retry targets unified Voice mode
│   └── (tabs)/_layout.tsx                     # navigation/consent ownership cleanup
├── components/
│   ├── add-transaction/
│   │   ├── ManualTransactionEntry.tsx         # extracted existing form, behavior preserved
│   │   ├── AddTransactionModeTabs.tsx         # approved Manual/Voice control
│   │   └── VoiceTransactionEntry.tsx          # approved Voice mockup surface
│   ├── fab/QuickActionFab.tsx                 # explicit Manual route intent
│   └── tab-bar/CustomBottomTabBar.tsx         # mic navigates to Voice route intent
├── hooks/
│   ├── useVoiceTransactionFlow.ts             # reuse flow, quota-aware start/refresh
│   └── useVoiceAiAvailability.ts
├── services/
│   ├── ai-voice-parser-service.ts             # requestKey/timezone + typed refusals
│   ├── voice-ai-availability-service.ts
│   └── voice-entry-service.ts                 # navigation handler now opens unified Voice mode
├── utils/
│   └── device-time-zone.ts                    # expo-localization IANA source
├── locales/en/
│   └── common.json
├── locales/ar/
│   └── common.json
└── __tests__/
    ├── app/
    ├── components/
    ├── hooks/
    └── services/

supabase/
├── migrations/
│   └── <next>_voice_ai_usage_limits.sql
└── functions/
    ├── _shared/
    │   ├── voice-ai-entitlement.ts
    │   ├── voice-ai-safeguard-contract.ts
    │   ├── voice-ai-safeguard-service.ts
    │   ├── voice-ai-availability-handler.ts
    │   └── focused *.test.ts
    ├── voice-ai-availability/
    │   ├── index.ts
    │   └── deno.json
    └── parse-voice/
        └── index.ts                            # quota gate around existing Gemini path

packages/db/src/
└── supabase-types.ts                           # generated server types only

scripts/
├── transform-schema.js
├── sql-to-watermelon-migration.js
└── __tests__/                                  # server-only table exclusions / RPC contracts

docs/business/
└── business-decisions.md
```

**Structure Decision**: Keep the existing mobile service/hook/route architecture
and existing Gemini parser. Add one cohesive voice entitlement/safeguard
capability server-side, one availability endpoint, and a unified Add Transaction
page shell. Do not generalize SMS ledgers or create an all-AI quota framework.
Do not introduce client-synced quota tables.

## Verification Gates

Implementation is not complete until all are true:

### Mockup/UI

- exact approved image is persisted unchanged;
- binding sidecar is explicitly approved and verifier passes;
- rendered visual evidence matches the approved design at declared binding
  context;
- English/LTR and Arabic/RTL pass;
- light/dark, small/ordinary screen, enlarged-text/accessibility evidence pass;
- FAB opens Manual;
- center mic/onboarding/review retry open Voice;
- Manual state survives safe Manual -> Voice -> Manual switch;
- active Voice disables mode switch;
- exhausted/burst/unavailable Voice still allows Manual.

### Server/accounting

- exact 5/day and 2/min boundaries pass;
- concurrent final-unit race permits exactly one provider start;
- multi-device behavior shares one allowance;
- same-key replay never double-consumes or recalls Gemini during the 35-day
  horizon or while identity remains retained; eligible deletion and subsequent
  new admission honor all current gates without altering active accounting;
- pre-provider auth/consent/input/timezone/policy/refusal consumes zero;
- provider-start success/failure/timeout/invalid output consumes exactly one;
- internal Gemini retries consume one total;
- 23/25-hour DST boundaries resolve correctly;
- mid-window timezone change cannot create a new window;
- expired window may adopt current valid timezone;
- missing/invalid timezone and unavailable accounting fail closed;
- quota tables/RPCs contain/log no raw voice/financial content;
- server-only tables never enter Watermelon/sync.

### Client/provider regression

- successful Gemini response shape and voice review behavior remain unchanged;
- existing voice parsing/recording/review tests remain Green;
- availability state refreshes on page focus/app active/attempt/refusal/reset
  boundary;
- user-switch state isolation passes;
- typecheck/lint/format/i18n checks pass.

## Implementation Sequencing Guidance

This is sequencing guidance for the later `speckit.tasks` workflow; no
implementation occurs in this command.

1. Complete exact mockup binding approval/verifier and planning reconciliation/
   analyze; these approvals already exist and must be preserved.
2. Author exclusion, contract, SQL/race and existing parse-voice HTTP tests.
   Execute T006 and actual existing-handler quota/replay/input Red through
   test-only SDK doubles. Missing imports/functions never count as Red.
3. Introduce only minimum local callable SQL/contract interfaces under accepted
   existing-boundary Red; preserve ownership, service-only access and
   fail-closed behavior. No intermediate production commit or hosted mutation.
4. Run direct contract and single-session real PostgreSQL tests; accept their
   behavioral Red before additional contract/accounting/cleanup implementation.
   Bring single-request controls Green before executing real concurrent races.
5. Accept any race-specific failure before the corresponding locking/race fix;
   retain already-Green race regression evidence without manufacturing failure.
   Generate local Supabase types and server-only exclusions; final SQL/race
   Green and independent DB/security review remain mandatory.
6. Execute policy/safeguard/availability handler and full local PostgreSQL HTTP
   Red before completing services/endpoints and final parse-voice wiring.
   Preserve requestKey/timezone/reserve/start/complete accounting and the
   existing provider success response; SDK doubles do not replace actual SQL
   integration.
7. Author and execute mobile request identity/timezone/refusal/availability and
   unified route/navigation/Manual tests using existing importable entry points.
   Disjoint authoring may overlap server work; corresponding production waits
   for accepted Red and honest native/E2E feasibility.
8. Extract the mature Manual form without behavior changes; implement unified
   route/mode ownership and reroute FAB/mic/onboarding/Review Retry.
9. Implement approved Voice UI and quota-aware service/hook/refresh/error state;
   integrated client quota Green depends on actual server Green. Preserve all
   approved EN/AR copy, responsive/accessibility and binding facts.
10. Run complete regression/type/lint/i18n/migration and independent review
    batches before commits, then rendered visual/accessibility and honest manual
    multi-device/timezone/voice QA. Record manual-only blockers explicitly.
11. Hosted policy/deployment requires separate authorization.

## Complexity Tracking

No constitutional violations require justification.
