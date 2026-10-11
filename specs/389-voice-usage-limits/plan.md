# Implementation Plan: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Branch**: `389-voice-usage-limits` | **Date**: 2026-10-07 | **Spec**:
[spec.md](./spec.md)\
**Input**: Feature specification from `/specs/389-voice-usage-limits/spec.md`

**Note**: This plan is produced through the repository's `speckit.plan`
workflow. It stops before task generation or production implementation.

## UI repair continuation — 10 October 2026

The initial plan and server work below remain historical feature context. The
current bounded repair uses branch `codex/issue347-ui-fidelity`, source
`ab15bcce6a23179a2d3735dc8b835f1933b99799`, containing trusted main
`3264eba2b67bcc66cddc95e3fbdb36e8705ee642`. Existing T001–T059 are finalized in
place. The five exact approved references supersede the older two-reference
layout for these surfaces; `reconciliation.md` records approval and history. No
server/schema/sync, parsing, retention or financial contract changes belong to
this repair. #384 remains separately deferred. Earlier direct-source
verification deferral applies only to its dated pass; it does not waive fresh
repair testing or evidence reporting. Current owner explicitly defers emulator/
device/E2E execution and rendered/accessibility captures: author unit/E2E tests,
run focused unit/type/lint, and hand manual testing to owner.
Visual/accessibility/ device evidence remains NOT RUN without completion claims.
Fresh read-only analysis remains the production-assignment gate.

## Approved Voice motion/interaction continuation — 10 October 2026

This is a **planning overlay** to the finished 10 October UI repair; old
plan/server history, 59 existing tasks, five frozen repair sidecars and image
hashes remain unchanged. Owner approved the exact new five-image proposal
`mockups/drafts/2026-10-10-voice-motion-r1/` on 2026-10-10; original manifest
`sha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799`,
proposal
`sha256:06e5e987543d85a2c90c57aaad695569ca904cc122571da47bae7195d2b9f4b0`. Exact
approval is in its immutable `approval.json`; the derived scope map is
`mockups/voice-motion-binding-context.md`. This is **not** a sixth approved
sidecar or a new arbitrary approval/verifier gate. Earlier five-image package
`sha256:4b06ef2ad901a13cceb06790e49149fb9b314e99c213080e941cce22859b34b8`
continues to govern baseline Manual, idle and daily-limit composition outside
the new proposal's explicit deltas. Reconciliation and canonical requirements
are updated; execute existing verifiers and fresh **read-only**
`speckit.analyze` locally before implementation ownership is dispatched.

**Scope decisions:**

- Preserve standalone `PageHeader`, existing equal underline mode tabs,
  responsive/safe-area, Manual B, all financial/offline/save rules, quota and
  local-midnight semantics, Gemini provider/review, consent/privacy and deferred
  #384. No extra hosted table, sync/migration or subscription plan.
- Dark idle allowance/examples badge uses slate-700 and green icons; English
  example restaurant/car/cafe glyphs gain registered orange/blue/gold props,
  Arabic remains quotes without English glyphs. `ExamplesCard` has an accessible
  dismiss target ≥48 dp and an authenticated **per-account, per-device** durable
  hidden preference.
- The account-scoped preference is a new local-only service/facade, **not**
  `intro-flag-service` (its `intro-seen` keys are intentionally device-global).
  Namespace by current authenticated user ID, default absent/error reads to
  visible, clear in-memory old-user state on switch, guard late responses and
  report write failure without fabricating durable success. Never sync/share.
- Mic tap sets a synchronously observable `Starting` state before awaiting fresh
  AI consent, authoritative availability or native preparation. Keep an
  operation-generation lock against rapid taps/cancellation, invalidating all
  late success/failure after Back, Manual, unmount or account change. Do not
  count an allowance or tick elapsed time before actual native capture. A
  granted mic skips permission explanation; an **unknown** async grant state
  must be resolved or refreshed before considering permission missing.
- `useVoiceRecorder.start` currently catches native preparation failures without
  rethrowing. The implementation owner must restore an observable error
  result/throw contract to `useVoiceTransactionFlow` before it can transition to
  true Listening; tests prove no false recording on failure. Do not alter
  authoritative provider-start accounting or error reason.
- Replace the generic pre-native record-introduction **modal** with the approved
  Voice-**inline** explanation only when permission genuinely missing; keep the
  Monyvi custom explanation before the OS dialog and preserve the separate
  `AiProcessingConsentSheet` and denied/revoked Settings/Manual path.
- Recording uses cancelable Reanimated decorative ripple pair (~1.4 s, stagger
  700 ms) from existing 104 dp mic out to 172 dp region, activity bars (~1.2 s),
  real recorder timer; paused freezes both activity/time; resume restarts.
  Parsing `analyzing` renders a restrained ~1.6 s waveform/dots → receipt loop
  with approved EN/AR copy, never a content Skeleton, percentage or staged
  output claim. Native **finalizing** remains distinct from actual parsing;
  genuine availability-fetch loading keeps the existing Skeleton. Reduced motion
  uses static indicators.
- Recording error Try again enters Starting without a visible idle state;
  retained-audio submission retries use the **same** request identity and no
  second recorder. Voice-unavailable Try again refreshes authoritative allowance
  and continues automatically into Starting only when eligible. Existing
  burst/daily/refusal/consent checks never become optimistic starts.

### Cohesive future implementation ownership (not assigned in this wave)

Single Voice interaction writer should own the coupled route
`app/(private)/add-transaction.tsx`, `useVoiceTransactionFlow`,
`useVoiceRecorder`, scoped Voice presentation (`VoiceTransactionEntry`,
`voice-ui/*`), EN/AR copies, account-scoped local preference service/facade, and
their in-scope unit/integration/E2E tests. **Do not** overlap Mobile's existing
Manual/shared numeric/Transfer keyboard owner. Candidate structure reuses
`AllowanceCard`, `ExamplesCard`, `VoiceStateActions`, `VoicePresentation`,
`Skeleton`, the current `mic`/`bulb-outline`/
`restaurant-outline`/`car-outline`/`cafe-outline` glyphs and registered
NativeWind colors. Permission route currently imports
`components/permissions/PermissionRecoveryModal.tsx` and availability
`hooks/useVoiceAiAvailability.ts`; the similarly named user-supplied
`components/ui/PermissionRecoveryModal.tsx` and `hooks/useVoiceAvailability.ts`
do not exist. Inspect the actual two dependencies after explicit read-boundary
expansion, **before** implementation; no broader source read was made by this
author.

### Test-first and owner evidence gates

1. **T060/T061/T062**, including the 37-row complete plan at
   `checklists/voice-motion-coverage.md`, author focused failing route/hook/
   recorder/unit/integration tests and only honest runner-controllable Maestro
   flows. Missing native module/fixture = setup blocker, not behavior Red.
2. After root accepts real Red, T063/T064 implement the approved lifecycle,
   preference and presentation atomically under one exclusive source owner.
   Batch Green/type/lint/i18n and independent reviews under T065. Do not change
   app code/tests in this planning wave.
3. T066 hands the owner complete native timing, permissions, animations, account
   restart, quota/replay and rendered EN/AR/dark/responsive/ enlarged-text/a11y
   matrix. T034/T035/T049/T050 and visual/a11y T058 remain **NOT RUN** until
   owner evidence; optional Speckit hooks require separate conscious opt-in when
   locally invoked (`.specify/extensions.yml` currently enables auto-executable
   Git commit hooks).
4. The five **new** source PNGs are approved concept evidence (853×1844 pixels);
   no new logical viewport or exact unmeasured geometry is inferred. Root/owner
   must inspect the original image bytes and render comparisons locally; this
   remote connector returned no inspectable base64 for the large images. That is
   an evidence boundary, not permission to invent pixels.

## Summary

Expand the current voice-limit work into the approved Add Transaction redesign
while preserving all existing transaction/business behavior.

The user-facing result is one `/add-transaction` page with **Manual** and
**Voice** modes:

- Manual preserves existing transaction form behavior in the approved compact
  layout and remains the default when opened from the Add Transaction FAB.
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

The approved compact Manual presentation uses ordinary GroupedMoneyInput,
required account/category Dropdowns on one row when shared width/text-scale
constraints fit, and OptionalSection below core fields. Use existing TypeTabs
and financial defaults. An amount field opens the existing custom calculator
only while focused and suppresses the native soft keyboard; ordinary text fields
retain their native keyboard. Done applies existing equals behavior when needed,
then dismisses without saving. Header Save retains validation/local submission.
Switching to Voice blurs/dismisses the calculator but preserves draft values.
Transfer source/target amounts keep their own focus target and existing
currency/conversion contract. No Voice quota/failure surface is rendered in
Manual.

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

The active reference inventory is `mockups/repair-binding-manifest.json`;
`contracts/add-transaction-ui-contract.md` maps states, existing shared
components and verified icon identities. Read all five exact active images and
sidecars and verify their approved revisions before governed implementation or
review. Do not consume superseded mockup-1/mockup-2 as current repair targets.
Missing or ambiguous fidelity facts block implementation. No recreated
screenshot or regenerated image is a substitute.

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

Full feature/device/visual acceptance requires the evidence below. Current UI
repair source delivery is owner-scoped to unit/E2E authoring and focused
unit/type/ lint execution; device/E2E/render/accessibility execution is deferred
to owner and reported NOT RUN. Those acceptance statuses remain open until
evidence exists:

### Mockup/UI

- all five active approved images are persisted unchanged and mapped to their
  respective states/locales;
- binding sidecar is explicitly approved and verifier passes;
- rendered visual evidence matches the approved design at declared binding
  context;
- English/LTR and Arabic/RTL pass;
- light/dark, small/ordinary screen, enlarged-text/accessibility evidence pass;
- FAB opens Manual;
- center mic/onboarding/review retry open Voice;
- Manual state survives safe Manual -> Voice -> Manual switch;
- active Voice disables mode switch;
- exhausted/burst/unavailable Voice still allows Manual with no Voice notice;
- Manual idle has no keypad, amount focus has only the custom keypad, Done
  dismisses without a save, and header Save preserves local submission;
- 48 dp minimum calculator keys satisfy both approved sizing minimums;
- every locale-specific composition and verified icon matches its mapped
  reference; availability-check failure is distinct from daily exhaustion.

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
   analyze; the new five-reference approval and earlier historical approvals
   must be preserved, with supersession explicit.
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

## Voice controls R2 — accepted binding, preimplementation analysis and execution plan

**Source audited:** `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`. **Owner image
approved:** latest green/gray/red R2 PNG, Git blob
`caceb8d1cade9e4e9c574e95fc0e603a39e766de`; local executor verified
`sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281`,
1832×858 raster pixels, 1470108 bytes. The sidecar contains all 15 required
official Binding Facts keys; on 2026-10-11 root verified the public verifier
results and recorded delegated exact-revision acceptance (superseded by the
faithful-refinement tuple below). Current approved metadata revision
sha256:72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b and
combined approval revision
sha256:71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77 come
from the official verifier after root's delegated acceptance of the faithful
Color/theme facts refinement (filled NileGreen Submit with white label and
paper-plane Ionicons send; transparent gray Pause/Resume outlined with
pause/play glyph; transparent red Discard outlined with close glyph; gray
disabled completed Pause with pause glyph; 20 dp icons; 14/22 semibold labels);
sidecar metadata is APPROVED. Do not invent owner approval of the computed SHA.
Final canonical verifier PASS, correct-feature prerequisites and read-only
Speckit analysis remain root-owned (T068 stays unchecked until that batch
completes).

### Scoped source conflicts and approved three-panel states

- `useVoiceRecorder.ts` currently caps native active recording at 60 s; R2
  requires **30 s active capture**, excluding pause; retain audio on auto-stop
  but do not automatically submit to Gemini/parse-voice. Keep the existing
  native **300 ms post-record early-command stabilization**.
- `VoiceTransactionEntry.tsx` uses Stop and a different paused control order;
  replace with fixed **Submit LEFT green / Pause or Resume CENTER gray / Discard
  RIGHT red** while active or paused. Arabic Submit is **إرسال** and physical
  positions do not RTL-mirror.
- At auto-cap render the explicit **third panel**: **Recording complete /
  التسجيل مكتمل**, `00:30 / 00:30`, enabled **Submit GREEN LEFT**, **disabled
  Pause GRAY CENTER**, enabled **Discard RED RIGHT**. No Resume, active
  recording waves, helper sentence or automatic provider request. The finalized
  audio remains until explicit Submit/Discard; one effective stop/submit/cleanup
  across cap races.
- R2 ordinary idle/Starting/recording/paused static **filled** mic halos are
  removed; R1 recording waves, 104 dp circular mic, reduced-motion, existing
  daily-limit/unavailable disabled artwork and all unaffected original visual
  bindings remain.
- `voice-ui/VoicePresentation.ts` formats elapsed-only time; R2 uses readable
  `mm:ss / 00:30`, capped at `00:30 / 00:30`.
- Client cap does not prove server enforcement. #391 independently owns
  authoritative server-duration and empty/speechless audio investigation.

### Accepted read-only latency diagnosis — smallest safe concrete repair

The earlier audit closed the parent mic navigation callback: it calls
`router.push` synchronously with `mode=voice` and origin tab, with **no awaited
mic-handler work**. Startup delay is not attributed to that handler. There is no
measured 1–2 s savings target.

1. **Remove one redundant permission check, not the permission gate.** The route
   currently awaits `flowRefreshPermission()`, and the Voice flow separately
   awaits `recorder.refreshPermission()` shortly before native prepare. Design a
   **typed** permission/readiness result from the flow (granted, needs inline
   rationale, blocked/revoked, unknown, stale actor/cancelled); route renders
   approved inline recovery from that result. Perform **one fresh just-in-time
   native verification for the current authenticated actor** before preparation.
   Only an explicit `Allow microphone` action may ask the OS. Preserve fresh
   LOCAL `getAiProcessingConsentStatus()` lookup, generation/actor invalidation,
   authoritative preattempt availability, unknown/granted/revoked distinctions
   and no Listening until native `record()` succeeds. T069 authors both positive
   and negative tests; T070 implements narrowly across route/flow/permission
   facade.
2. **Defer the first hidden Manual component mount on Voice-first navigation.**
   `add-transaction.tsx` currently mounts its `ManualTransactionEntry` even with
   Voice selected, initializing account/category/market/currency/budget/form
   hooks and modals. On direct Voice entry skip the FIRST mount; on Manual
   selection mount immediately, then **latch mounted=true for this route
   instance** across subsequent safe switches, preserving partially entered
   Manual drafts, Save, transfer, recurring, calculator blur and
   accessibility-hidden mode semantics. Initial Manual route remains unchanged.
   This improves the amount of startup work in principle but no milliseconds are
   measured. T069 authors route/draft positive controls; T071 implements the
   narrow route mount condition, NOT a Manual internal, financial or
   dynamic-import refactor.
3. **No speculative network policy edit.** `useVoiceAiAvailability` refreshes on
   focus/app active and a start can supersede an in-flight refresh;
   `voice-ai-availability-service` forwards AbortSignal to its authenticated
   wrapper. Retain the current authoritative preattempt quota gate, actor
   scoping and existing cancellation semantics. In-flight HTTP
   deduplication/transport refactoring needs measurements and separate approval,
   not this R2 work.

### Mandatory ordered delivery gates — do not move analysis after code

1. **T068 BEFORE T069–T071:** root confirms image and exact corrected Binding
   Facts, verifies computed official metadata/combined revisions, records
   truthful delegated lead acceptance of those exact hashes (without claiming
   the owner saw them) and runs `scripts/verify-mockup-binding.js` against the
   approved R2 sidecar. **Then** run the correct-feature
   `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
   followed by canonical **READ-ONLY** `.claude/commands/speckit.analyze.md`
   over final `spec.md`/`plan.md`/`tasks.md`. Resolve blocking inconsistencies
   and record truthful results. This is NOT T073.
2. **T069:** write deterministic existing-boundary failing unit/integration
   tests, covering 3 panels, disabled cap center, timer/pause, cap/Submit/
   Discard/unmount/account races, saved URI, no automatic provider work,
   ordinary halos and daily/unavailable visual positives, and **one just-in-time
   permission call** plus **Voice-first deferred Manual initial mount with
   durable draft after first Manual use**. Native-only/E2E journeys stay manual
   unless a deterministic harness is proven. Setup/import failures are not
   meaningful Red.
3. **T070/T071 only after root accepts Red and pins an exact new source
   revision:** T070 owns recorder/flow/route typed permission and 30 s
   lifecycle; T071 owns action/timer/halo UI and narrow first Manual mount
   gating. Preserve source-ownership separation and external #391 lane.
4. **T072:** batched focused/combined Green, TS, lint, i18n, hooks, Manual/R1
   regression positive controls. **T073:** independent POSTIMPLEMENTATION
   TypeScript/actor/cancellation/behavior/style/binding/ QA/security-if-affected
   review; do not treat this as the first Speckit analysis. **T074:** owner
   native/device/rendered/RTL/dark/large-text and separate accessibility
   evidence NOT RUN.

### Safe observability for owner measurements only

Propose non-identifying monotonic stage durations:
`bottomMic.press → router.push → addTransaction.firstFrame`;
`voice.tap → consent.localFresh → authoritativeAvailability → permission.singleFresh → audioMode → prepareToRecord → record.invoked → recording.firstFrame`.
Record stage names/durations and a transient random trace correlation only;
never user IDs, audio, transcripts, transaction/financial data or credentials.
Source hypotheses cannot be presented as measured causes or guaranteed savings.

No new server/API/SQL/hosted, provider, financial, Manual schema, E2E/device
execution, unapproved responsive treatment or old image/sidecar change is
authorized by this document.

## Voice startup optimization S1 — source-backed implementation plan (12 October 2026)

**Pinned source:** `f625183373e29d372b658c10b3848a217477400a`.
This section supersedes only the earlier R2 plan statement that availability
in-flight coordination should remain untouched. The new owner instruction
authorizes the minimum source-backed optimization below; all security, consent,
quota, recorder, UI-binding and #391 boundaries remain.

### Current startup chain

```text
Voice tap
  -> route sets isVoiceStartPending / Starting immediately
  -> fresh local AI consent read
  -> flow enters starting
  -> authoritative availability refresh
       -> stable auth session
       -> authenticated voice-ai-availability Edge Function
       -> optional existing 401 refresh/retry
  -> fresh non-prompting microphone permission read
  -> create request identity
  -> recorder.start()
       -> audio mode
       -> prepareToRecordAsync()
       -> record()
       -> onStarted => Listening/timer
       -> existing 300 ms early Pause/Stop stabilization (post-start)
```

The flow consumes the route-provided availability hook. There is no second hook.
The proven restart opportunity is inside `refresh()`: focus/foreground/start
callers can abort and replace the same unresolved request.

### Minimum production changes after accepted Red

1. **`apps/mobile/hooks/useVoiceAiAvailability.ts` — same-context in-flight
   coalescing only.**
   - Track the unresolved request with an internal context key containing current
     user ID, valid timezone and hook context/generation plus its promise and
     AbortController.
   - After normal actor/enablement/timezone validation and automatic-timer
     clearing, return the existing unresolved promise when the key matches.
   - Do not reuse `ownedState.availability` or any settled promise as a startup
     cache; every start still obtains a response from an unresolved/new
     authoritative request.
   - Context/auth ownership change, invalid timezone, focus blur, background,
     unmount and `reconcileAuthoritativeSnapshot` keep existing cancellation.
     Different context cancels and replaces. Promise finalization clears only its
     own slot.
   - Keep existing owned-state/generation guards and error mapping; no new
     server/API/TTL policy.

2. **`apps/mobile/hooks/useVoiceTransactionFlow.ts` — overlap safe reads only
   after fresh consent.**
   - Keep `startPendingGenerationRef` duplicate-start prevention, operation
     AbortController, actor checks, fresh consent and timezone checks in their
     current order.
   - After consent/timezone pass, start the authoritative availability promise
     (or use an explicitly supplied fresh snapshot) and
     `recorder.refreshPermission()` together. Await both, then re-check the
     operation generation/actor before any state transition or recorder work.
   - If availability is blocked/null, stop there. A completed permission read is
     harmless local state and MUST NOT trigger the OS sheet.
   - Only when availability is eligible may the existing explicit
     `requestMicrophonePermission` option turn a fresh `denied` read into
     `requestPermissionStatus()`. Blocked/unknown retain their current
     recovery. No implicit permission prompt.
   - Create request identity and call `recorder.start()` only after all gates
     pass. Keep `onStarted` as the sole Listening transition and preserve
     same-key retained submission retry.

3. **`apps/mobile/app/(private)/add-transaction.tsx` — preserve route semantics;
   add only narrow stage orchestration/diagnostics if needed.**
   - Keep pending/Starting set before awaited consent.
   - Keep fresh local `getAiProcessingConsentStatus()`, consent sheet,
     generation/actor invalidation, unavailable refresh-and-auto-start and the
     existing fresh-snapshot handoff.
   - Do not add a second permission read or availability hook.
   - If diagnostics are implemented here, use only monotonic stage durations and
     privacy-safe stage labels; no IDs/audio/transcript/financial/auth data.

4. **Transport/security boundaries — regression only, no production edit in S1.**
   - `apps/mobile/services/voice-ai-availability-service.ts` continues to pass
     AbortSignal and validate the authoritative response.
   - `apps/mobile/services/authenticated-edge-function-service.ts` and its auth
     coordinator retain stable-session lookup, Authorization replacement,
     one-time 401 refresh/retry and local-session invalidation. Any future shared
     auth optimization requires separate ownership/security review.
   - `apps/mobile/hooks/useVoiceRecorder.ts` is read-only for this lane. Do not
     prewarm audio mode/recorder, move `onStarted`, alter the 300 ms
     stabilization, cap/finalization, URI cleanup or #391 behavior.

### Privacy-safe latency evidence

Use a monotonic clock such as `performance.now()` only if the runtime already
supports it in the owned source path. Suggested attempt-local stages:

```text
tap -> pending-visible
pending -> consent-fresh
consent-fresh -> availability+permission-begin
availability+permission-begin -> gates-resolved
gates-resolved -> recorder-start-begin
recorder-start-begin -> native-record-started/onStarted
```

Structured diagnostics contain stage + durationMs and, if correlation is
necessary, an ephemeral random attempt token that is never persisted or reused
as the Voice request key. No user/account IDs, timezone value, audio URI,
transcript, amount/category/account data, provider payload, token or credential.

### TDD and source ownership sequence

- T075 (this planning package) reconciles source facts and the test/manual
  matrix. No code/test execution is claimed.
- T076 is a root-run blocking read-only prerequisite/Speckit acceptance on these
  final artifacts.
- T077 authors deterministic Red against existing boundaries before production.
- T078 implements only availability coalescing.
- T079 implements only post-consent concurrency and approved diagnostics/route
  glue; recorder remains outside ownership.
- T080 runs focused + retained regression Green/type/lint/i18n/privacy checks.
- T081 performs independent TypeScript/async, actor/cancellation, logic,
  security/performance and coverage review.
- T082 is owner-only device/manual timing and native permission/audio evidence.

No per-file check churn: run the focused Red batch once after T077, then one
batched Green/integration gate after T078/T079.

### Planned deterministic test files

- **New focused companion:** `apps/mobile/__tests__/hooks/useVoiceAiAvailability.startup.test.tsx`
  for same-context coalescing, focus/foreground collision, failure reset and
  actor/timezone/background/unmount cancellation.
- **Existing:** `apps/mobile/__tests__/hooks/useVoiceTransactionFlow.test.ts`
  for post-consent concurrency, duplicate starts, stale actor/cancel, permission
  states, unavailable retry, native-start truth and same-key retained retry.
- **Existing:** `apps/mobile/__tests__/app/add-transaction-modes.test.tsx`
  for immediate Starting, consent-first ordering, unavailable
  refresh-and-auto-start, Back/Manual/account invalidation and Manual
  regressions.
- **Existing positive control:** `apps/mobile/__tests__/services/authenticated-edge-function-service.test.ts`
  for stable auth/401 recovery semantics. Modify only if the startup change
  actually changes its public contract (not planned).

Maestro changes, if any, are authorship only and limited to deterministic UI
journeys already supported by fixtures. No test may claim native permission
sheet timing, audio readiness, real provider timing or E2E execution.

### Explicit non-goals

No TTL availability cache; no stale settled snapshot reuse; no removal of fresh
consent/quota/permission gates; no auth/session bypass; no provider or hosted
change; no recorder prewarm; no #391 work; no UI/copy/mockup change; no Manual
financial change; no 1–2 second promise.


## S2 Red reconciliation — consent freshness and timing contract (12 October 2026)

Root independently completed the correct-feature prerequisite and canonical
read-only Speckit analysis for the frozen S1 package at
`b562426b5543a64c7df4d117007388c42029ae49`: the new S1 requirement mappings
were complete and critical/high findings were zero. Optional analyze Git hooks
were not invoked. This S2 append keeps T075–T082 meanings stable and adds only
the missing consent-transition freshness Red tracked as T083.

### Exact preproduction contract

- `useVoiceAiAvailability.refresh` may coalesce one unresolved request only
  for the same authenticated actor, device timezone, enablement/lifecycle
  generation and unchanged consent context. Settled results are never cached
  for the next pre-attempt gate.
- The availability facade should gain one narrow optional supersede input
  (planned name: `supersedePending`) that aborts/invalidates a matching
  pending request instead of joining it. It is a freshness signal, not a quota
  or caching policy.
- `StartFlowOptions` should gain the route-to-flow marker
  `supersedePendingAvailability?: boolean`. The first successful consent-sheet
  Continue passes `true`; ordinary already-consented starts omit it.
- After fresh consent, the authoritative availability request and the
  non-prompting microphone-permission read start concurrently. Native OS
  permission request remains serialized behind an eligible availability result
  and the existing explicit Allow microphone action.
- Availability-failure retry remains consent-first, then refreshes exactly once
  and hands that fresh snapshot into the flow so the flow does not perform a
  second availability request.
- Startup timing Red is against existing route/flow/logger behavior, not a
  missing helper import. Structured records use event
  `voice.startupTiming` and payload keys **only**
  `{ stage, durationMs }`. Planned stages are `consent`,
  `availability_permission` and `native_start`; durations are monotonic,
  numeric and add no artificial wait. `native_start` is captured at recorder
  `onStarted`, before the recorder-owned 300 ms stabilization.
- No user/account/timezone/request identifiers, tokens, audio URI/content,
  transcript, parsed/financial payload or provider data may appear in timing
  payloads.

### S2 deterministic Red ownership

- NEW `apps/mobile/__tests__/hooks/useVoiceAiAvailability.startup.test.tsx`:
  same-context service-call coalescing; focus/foreground collision; settled and
  failed slot clearing; timezone/actor split; blur/background/unmount abort;
  authoritative reconciliation invalidation.
- NEW `apps/mobile/__tests__/hooks/useVoiceTransactionFlow.startup.test.ts`:
  consent-first ordering; simultaneous availability + permission reads;
  explicit OS-prompt ordering; blocked availability; duplicate/stale actor
  safety; truthful `onStarted`; start failure; privacy-safe timing shape.
- BOUNDED `apps/mobile/__tests__/app/add-transaction-modes.test.tsx`:
  immediate route Starting while consent is unresolved, existing-consent
  control, first-use post-grant supersede marker, and consent-first unavailable
  refresh handing one authoritative snapshot into the flow.
- Existing retained-audio same-key tests in
  `useVoiceTransactionFlow.test.ts` remain the positive control and are not
  duplicated or weakened.

T077 plus T083 Red must be accepted by root before T078/T079 production work.
No test execution is claimed by this GitHub-only authoring commit.

