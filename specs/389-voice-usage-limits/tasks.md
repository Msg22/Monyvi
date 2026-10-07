# Tasks: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Feature**: `389-voice-usage-limits` / issue #347

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`quickstart.md`, all `contracts/` files and the unchanged approved references in
`mockups/`

**Source revision**: `4a13b67d02037bc2fb4e4c68c217480d02ea626c`

**Status**: Generated checklist; implementation, runtime Red/Green and
visual/accessibility completion are not claimed.

Strict TDD is mandatory under `AGENTS.md` and
`.agent/workflows/sprint-issue.md`: write unit/integration and honest
user-journey E2E tests first, run them and record the expected behavior failure
before production changes. An import/setup failure is not behavioral Red. A
missing runner/harness is a blocker; do not replace executed evidence with
source inspection or fabricate an E2E result. Routine tests use provider
doubles, never real Gemini usage.

The team lead remains coordination-only under
`.agent/workflows/team-led-delivery.md`; workers own edits in exclusive sibling
worktrees. This checklist defines suggested lanes, not actual assignments or
Git/external mutation authority. No installs in secondary worktrees. No
deployment, hosted policy configuration, shared remote migrations, commit hooks,
commits, pushes, PRs or issue edits are authorized by this checklist.

`[P]` means an ownership-safe task can run beside another ready task with
disjoint files after its stated prerequisites. Story numbers preserve the
specification: **US0, US1, US2, US3**. US2 precedes US0/US1 in execution because
server authority is a prerequisite for integrated client quota behavior; all
three are P1.

## Phase 1: Setup and blocking design gates

- [ ] T001 Verify the selected feature and immutable source, inspect existing
      route/voice/SMS behavior and record baseline/gate status in
      `specs/389-voice-usage-limits/tasks.md`; use
      `SPECIFY_FEATURE_DIRECTORY=specs/389-voice-usage-limits SPECIFY_FEATURE=389-voice-usage-limits`
      for `.specify/scripts/bash/check-prerequisites.sh`, inspect
      `.specify/extensions.yml`, and do not run optional Git hooks.
- [ ] T002 Complete legacy metadata migration for
      `specs/389-voice-usage-limits/mockups/mockup-1.binding.md` and
      `specs/389-voice-usage-limits/mockups/mockup-2.binding.md`: verify
      unchanged originals/provenance, resolve fidelity-affecting UNKNOWNs,
      obtain explicit approval of each immutable combined revision, and require
      `node scripts/verify-mockup-binding.js <sidecar>` exit 0 before governed
      UI production tasks. Preserve image bytes and the already-authorized
      local-midnight copy delta; never generate a replacement image.
- [ ] T003 Run read-only `.agent/workflows/speckit.analyze.md` against
      `specs/389-voice-usage-limits/spec.md`, `plan.md`, `tasks.md`,
      `data-model.md` and every `contracts/` file; reconcile through a
      separately authorized documentation worker the inherited GET/POST,
      timezone-length, optional/required callerLocalDate, nullable/unmetered
      availability and policyVersion drift, stale layout-owned refresh wording
      in research R-009, and 35-day cleanup versus durable same-key replay
      semantics before affected production assignments. Preserve optional
      existing callerLocalDate/UTC fallback and existing parsing semantics and
      distinguish future entitlement extensibility from shipping paid/unmetered
      policy.
- [ ] T004 Establish the complete manual-to-automation matrix and local runner
      feasibility in `specs/389-voice-usage-limits/tasks.md` using
      `quickstart.md` sections 3/8/10 and `apps/mobile/e2e/maestro/README.md`;
      identify emulator/audio/provider-double/clock capabilities,
      permission/restart/resume cases and manual-only blockers, and reserve the
      exact next migration filename
      `supabase/migrations/077_voice_ai_usage_limits.sql` after rechecking
      migration numbering at assignment time.
- [ ] T005 Run existing focused baseline commands for
      `apps/mobile/__tests__/services/ai-voice-parser-service.test.ts`,
      `apps/mobile/__tests__/hooks/useVoiceTransactionFlow.test.ts`,
      `apps/mobile/__tests__/hooks/useVoiceRecorder.test.ts`, existing Add
      Transaction/FAB/tab-bar tests and
      `apps/mobile/e2e/maestro/transactions/create-transaction.yaml`; record
      commands, observed failures and runner availability in
      `specs/389-voice-usage-limits/tasks.md` without treating unrelated
      baseline failures as passing.

**Gate**: T003 must resolve material contract conflicts before production. T002
blocks only mockup-governed UI production and visual completion; server/test
work may proceed when its own contracts and TDD gates are ready. T004 must
identify an honest E2E path before the corresponding user-visible
implementation; missing controls stay blocked rather than asserted covered.

## Phase 2: Foundational contracts and server-only boundary tests

- [ ] T006 [P] Write failing server-only exclusion/SQL structure tests in
      `scripts/__tests__/voice-ai-safeguard-rpc.test.ts`,
      `scripts/__tests__/transform-schema.test.ts`,
      `scripts/sql-to-watermelon-migration.test.js` and
      `apps/mobile/__tests__/migrations/voice-ai-usage-limits-migration.test.ts`;
      prove both voice tables are absent from Watermelon generation, migrations
      and sync, ordinary CRUD/RPC grants are denied, no financial payload
      columns exist and SMS boundaries remain unchanged.
- [ ] T007 [P] Write failing runtime external-contract tests in
      `supabase/functions/_shared/voice-ai-safeguard-contract.test.ts` for
      resolved entitlement/availability/reservation/start/refusal shapes,
      unknown/malformed RPC outputs and authoritative fail-closed decisions; use
      the T003-reconciled contract, explicit return types and Zod-derived
      external types.
- [ ] T008 Record actual behavioral Red evidence for T006/T007 and agreed
      architectural interfaces in `specs/389-voice-usage-limits/tasks.md`;
      preserve Watermelon financial schema, local Manual writes, consent
      semantics and Gemini successful response, with no service imports in new
      presentational components and no DB writes/business policy in hooks.

**Checkpoint**: Shared external shapes, server-only exclusions and ownership
interfaces are tested and frozen for assignment. These tests become Green with
US2 implementation; no premature claim that foundation tests already pass.

## Phase 3: US2 — Enforce Voice Cost Controls on the Server (P1)

**Goal**: Server-only 5/day + 2/min accounting, local-midnight pinned windows,
concurrency and replay protection around the existing Gemini path.

**Independent test**: Against local PostgreSQL and a Gemini double, start five
logical requests in one accepted local day while spacing them beyond burst
boundaries; sixth is refused before Gemini. In a fresh window, two starts within
60 seconds are allowed, third refused. Race the last unit and replay a key: one
provider start/unit. Pre-start refusals consume zero; post-start
success/error/timeout/invalid output and internal retries consume one.

### Tests before production

- [ ] T009 [P] [US2] Write executable local SQL/RPC tests in
      `supabase/tests/voice_ai_usage_limits.test.sql` for five/six daily
      boundary, two/three burst boundary, exact window/burst equality,
      authenticated ownership and service-role grants, 23/25-hour DST days,
      invalid IANA timezone, active-window pinning/travel, next-window adoption,
      reservation lease/release/replay, expired/start-boundary reservations,
      reserve-to-start crossing local midnight, active-window cutover,
      late-start denial after lease expiry, start-time burst-capacity recheck,
      one newly transitioned starter under concurrent same-key calls and cleanup
      safety that retains active/reserved/provider work and honors the
      reconciled replay horizon; prove behavior against actual PostgreSQL rather
      than SQL regexes alone.
- [ ] T010 [P] [US2] Write real multi-connection concurrency tests in
      `scripts/__tests__/voice-ai-safeguard-concurrency.test.ts` for two devices
      racing the last daily/burst slot, same-key concurrent reservation/start,
      different-user independence and admission-versus-provider-start races;
      bind only a verified local database and record failed expected assertions
      before migration.
- [ ] T011 [P] [US2] Write policy/default/config-failure tests in
      `supabase/functions/_shared/voice-ai-entitlement.test.ts` and RPC
      state-machine tests in
      `supabase/functions/_shared/voice-ai-safeguard-service.test.ts`; cover
      missing/invalid 5/2/60/120/version configuration, authoritative dependency
      failures, one-start lifecycle, no release after start, proved-no-start
      release, reservation expiration and service-role failure propagation.
- [ ] T012 [P] [US2] Write
      `supabase/functions/_shared/voice-ai-availability-handler.test.ts` for the
      reconciled availability HTTP contract, CORS/method/auth/consent policy,
      timezone validation/pinning, quota/burst blocker metadata,
      dependency-unavailable fail-closed and no AI calls/content leakage.
- [ ] T013 [P] [US2] Write `supabase/functions/parse-voice/index.test.ts` with
      controlled auth/consent/RPC/Gemini doubles: preserve existing
      audio/MIME/size/categories/accounts/callerLocalDate/success response and
      retry behavior; test auth/consent/malformed
      identity/timezone/audio/date/provider config/policy/refusal failures
      consume zero, start recorded once immediately before first Gemini attempt,
      all post-start failure/timeout/invalid output remain consumed, post-start
      replay never recalls Gemini, and completion failure never refunds starts.
- [ ] T014 [US2] Define and execute failing complete local HTTP
      admission/accounting scenarios in
      `scripts/__tests__/voice-ai-safeguard-http.integration.test.ts` before
      production wiring, using local Edge/PostgreSQL and a verified provider
      double; exercise HTTP refusal and subsequent authoritative availability,
      retain a runner blocker if test injection cannot safely avoid real Gemini.

### Implementation after accepted Red

- [ ] T015 [US2] Implement `supabase/migrations/077_voice_ai_usage_limits.sql`
      after T009/T010 Red, with voice-only tables/indexes/checks,
      authenticated-user lock and accepted timezone window, atomic
      availability/reserve/start/release/complete RPCs, unique user/request key,
      server timestamps, pinned DST-aware local midnight, active reservation
      capacity and service-role-only grants/RLS; implement bounded cleanup only
      after T003 resolves retention/replay invariants without deleting active
      work or silently weakening same-key deduplication; never store
      audio/transcript/financial/provider content. Revalidate the reserved
      number immediately before writing.
- [ ] T016 [US2] After local migration and T006 Red, regenerate
      `packages/db/src/supabase-types.ts` through the local-only type workflow
      and add both server-only tables to `scripts/transform-schema.js`,
      `scripts/sql-to-watermelon-migration.js` and
      `apps/mobile/services/sync/config.ts`; confirm `packages/db/src/schema.ts`
      and Watermelon models/migrations remain unchanged and the RPC
      signature/types match actual SQL.
- [ ] T017 [US2] Implement validated server contract/policy boundary in
      `supabase/functions/_shared/voice-ai-safeguard-contract.ts` and
      `supabase/functions/_shared/voice-ai-entitlement.ts` after T007/T011 Red;
      free launch is operational 5/day, 2/min with 60-second burst and
      120-second lease, missing/invalid config fails closed, and Gemini owns no
      policy/commercial details.
- [ ] T018 [US2] Implement
      `supabase/functions/_shared/voice-ai-safeguard-service.ts` after T011 Red,
      using canonical generated Supabase RPC types and runtime validation, one
      logical reserve/start/complete lifecycle and safe release only before
      proven provider start; propagate dependency errors and privacy-safe
      decision metadata.
- [ ] T019 [US2] Implement
      `supabase/functions/_shared/voice-ai-availability-handler.ts`,
      `supabase/functions/voice-ai-availability/index.ts` and
      `supabase/functions/voice-ai-availability/deno.json` after T012 Red; reuse
      entitlement/window/accounting services and resolved auth/consent contract,
      call no provider and return no financial payload.
- [ ] T020 [US2] Wire admission/start/completion into
      `supabase/functions/parse-voice/index.ts` after T013/T014 Red; validate
      requestKey/timezone and all existing pre-provider gates before accounting,
      reserve before work, mark start once before `processWithRetry`, keep
      successful payload/prompt/model/retry semantics unchanged, and return
      typed daily/burst/replay/dependency refusals without provider execution.
- [ ] T021 [US2] Verify/reduce touched quota logging in
      `supabase/functions/parse-voice/index.ts`,
      `supabase/functions/_shared/voice-ai-safeguard-service.ts` and
      `supabase/functions/_shared/voice-ai-availability-handler.ts` with privacy
      assertions in their focused tests; use permitted structured telemetry and
      never log request/response bodies, audio, transcripts, account/category
      context or credentials.
- [ ] T022 [US2] Run actual local SQL/RPC/concurrency/HTTP tests, T006/T007
      tests, entitlement/safeguard/handler suites and `deno check` for both
      `supabase/functions/voice-ai-availability/index.ts` and
      `supabase/functions/parse-voice/index.ts`; record command/output and
      measured unchanged-success contract evidence in
      `specs/389-voice-usage-limits/tasks.md`.
- [ ] T023 [US2] Obtain independent DB/security review of
      `supabase/migrations/077_voice_ai_usage_limits.sql`, server
      contract/services/endpoints and exclusion/type updates; record findings
      and corrected evidence in `specs/389-voice-usage-limits/tasks.md`,
      including grants, per-user locks, timezone boundary races, lease/cleanup
      integrity and no shared SMS-policy changes.

**Checkpoint**: US2 independently operates against local infrastructure. Remote
deployment/configuration remains outside this task execution authority.

## Phase 4: US0 — Use One Unified Add Transaction Experience (P1)

**Goal**: One route, Manual default from FAB, Voice from
microphone/onboarding/review Retry, preserved Manual state and safe voice mode
transitions.

**Independent test**: Open via FAB, enter partial Manual data, switch to Voice
and back; input remains and existing Manual save works offline. Center
mic/onboarding/review Retry open the same route in Voice mode. Active
recording/paused/finalizing/analyzing disables switching; idle/error/blocked
Voice permits Manual. Compare governed rendered UI against approved bindings.

### Tests before production

- [ ] T024 [P] [US0] Add
      `apps/mobile/__tests__/app/add-transaction-modes.test.tsx` for
      missing/invalid/manual/voice route intent, one shell, mounted Manual
      state, hidden inactive accessibility subtree, mode locks for
      recording/paused/completed-finalizing/analyzing and safe
      error/idle/blocked switching; include duplicate route entry and
      back/cancel cleanup without changing transaction contracts.
- [ ] T025 [P] [US0] Extend
      `apps/mobile/__tests__/components/fab/QuickActionFab.test.tsx`,
      `apps/mobile/__tests__/components/tab-bar/CustomBottomTabBar.test.tsx` and
      add `apps/mobile/__tests__/services/voice-entry-service.test.ts`,
      `apps/mobile/__tests__/app/voice-review-navigation.test.tsx` for explicit
      Manual FAB/default and unified Voice mic/onboarding/Retry intent with
      preserved origin return and one-shot retry/auto-start.
- [ ] T026 [P] [US0] Preserve/extend
      `apps/mobile/__tests__/app/add-transaction-account-selection.test.tsx`,
      `apps/mobile/__tests__/app/add-transaction-recurring-name.test.tsx`,
      `apps/mobile/__tests__/app/add-transaction-recurring-date-error.test.ts`
      and add
      `apps/mobile/__tests__/components/add-transaction/ManualTransactionEntry.test.tsx`
      for expense/income/transfer, calculator, account/currency/category/null
      IDs, optional/recurring fields, validation scrolling, budget alert and
      local-first save semantics through extraction; do not create a merchant
      schema or remove existing transfer/currency behavior based on illustrative
      mockup fields.
- [ ] T027 [P] [US0] Add
      `apps/mobile/__tests__/components/add-transaction/AddTransactionModeTabs.test.tsx`
      and
      `apps/mobile/__tests__/components/add-transaction/VoiceTransactionEntry.layout.test.tsx`
      for selected/disabled semantics, central compact/ordinary responsive
      breakpoints, safe-area bottom inset and cleanup of animations, using
      approved binding values only after T002.
- [ ] T028 [US0] Write and run failing complete user journeys in
      `apps/mobile/e2e/maestro/voice/add-transaction-modes.yaml` and update
      `apps/mobile/e2e/maestro/transactions/create-transaction.yaml` before
      UI/navigation code; cover FAB Manual save, partial form switch/return,
      Voice entry/review Retry and active-mode lock only where an honest
      recording/test harness exists, with blocked cases recorded in
      `specs/389-voice-usage-limits/tasks.md`.

### Implementation after accepted Red and binding approval

- [ ] T029 [US0] Extract the existing form from
      `apps/mobile/app/(private)/add-transaction.tsx` into
      `apps/mobile/components/add-transaction/ManualTransactionEntry.tsx` after
      T026 Red, preserving its current form/submission contract and scoped local
      services; keep it mounted across safe switches and exclude hidden form
      content from accessibility without rewriting mature behavior or copying
      architectural debt.
- [ ] T030 [US0] Implement approved shell/mode controls in
      `apps/mobile/components/add-transaction/AddTransactionModeTabs.tsx`,
      `apps/mobile/components/add-transaction/VoiceTransactionEntry.tsx` and
      `apps/mobile/app/(private)/add-transaction.tsx` after T024/T027/T028 Red
      and T002 verifier approval; resolve the bound route/bottom-bar scope
      before adding/removing navigation chrome, use
      NativeWind/theme/font/responsive tokens and preserve binding composition.
- [ ] T031 [US0] Move voice orchestration/AI-consent recovery from
      `apps/mobile/app/(private)/(tabs)/_layout.tsx` into
      `apps/mobile/app/(private)/add-transaction.tsx` using existing
      `useVoiceTransactionFlow`/recorder behavior; preserve permission recovery,
      discard/pause/resume/retry/review origin and cleanup, safely disable mode
      changes during active work and retain private authenticated startup gates.
- [ ] T032 [US0] Reroute `apps/mobile/components/fab/QuickActionFab.tsx`,
      `apps/mobile/components/tab-bar/CustomBottomTabBar.tsx`,
      `apps/mobile/services/voice-entry-service.ts`,
      `apps/mobile/app/(private)/(tabs)/_layout.tsx` and
      `apps/mobile/app/(private)/voice-review.tsx` after T025/T028 Red; FAB
      selects Manual, mic/onboarding/Retry selects Voice with one-shot retry
      intent, and tab layout no longer owns the global recording overlay.
- [ ] T033 [US0] Run focused route/Manual/navigation/layout/recorder/flow
      regressions and actual
      `apps/mobile/e2e/maestro/voice/add-transaction-modes.yaml` plus
      transaction-create flow; record exact Red-to-Green evidence and remaining
      native recording/permission/restart blockers in
      `specs/389-voice-usage-limits/tasks.md`.
- [ ] T034 [US0] Capture rendered baseline side-by-side/overlay comparison for
      `apps/mobile/app/(private)/add-transaction.tsx`,
      `ManualTransactionEntry.tsx`, `AddTransactionModeTabs.tsx` and
      `VoiceTransactionEntry.tsx` against both approved
      `mockups/mockup-1.png`/`mockup-2.png` at declared contexts, then
      English/Arabic, light/dark, compact/ordinary phone, tablet, landscape and
      enlarged-text variants; record evidence paths and
      functional/visual-fidelity status separately in
      `specs/389-voice-usage-limits/tasks.md`, leaving missing renders
      incomplete.
- [ ] T035 [US0] Collect separate accessibility-tree and screen-reader/automated
      evidence for `apps/mobile/app/(private)/add-transaction.tsx`,
      `AddTransactionModeTabs.tsx`, `ManualTransactionEntry.tsx` and
      `VoiceTransactionEntry.tsx`: localized tab names/roles/selected/disabled
      states, hidden-tree exclusion, focus order and active-work transitions;
      record exact references and accessibility status in
      `specs/389-voice-usage-limits/tasks.md`; screenshots never substitute for
      semantics.

## Phase 5: US1 — Understand and Use the Daily Voice Allowance (P1)

**Goal**: Server-authoritative remaining count, exhausted/burst/unavailable
recovery, accurate local-midnight copy and stale/user-switch reconciliation
without blocking Manual.

**Independent test**: Supply controlled authoritative availability to the
client, use allowed Voice then confirm refreshed remaining after
success/failure, reject stale optimism server-side and reconcile, pass
reset/burst boundaries and switch users. All blocked Voice states allow Manual;
English/Arabic states and user-visible recovery match the approved binding.

### Tests before production

- [ ] T036 [P] [US1] Add `apps/mobile/__tests__/utils/device-time-zone.test.ts`
      for existing expo-localization IANA source, unavailable/empty/invalid
      device zone and no silent UTC/Egypt fallback; timezone data is context,
      never quota authority.
- [ ] T037 [P] [US1] Extend
      `apps/mobile/__tests__/services/ai-voice-parser-service.test.ts` for one
      stable requestKey per logical submission, same-key transport
      replay/new-key re-recording, callerTimeZone plus existing callerLocalDate,
      strict unchanged success response and validated
      daily/burst/replay/dependency refusals with safe error metadata and no
      response-body logging.
- [ ] T038 [P] [US1] Add
      `apps/mobile/__tests__/services/voice-ai-availability-service.test.ts` for
      authenticated availability request, strict reconciled Zod response,
      malformed/non-success/offline/dependency errors, no local durable counters
      and no false available state on failure.
- [ ] T039 [P] [US1] Add
      `apps/mobile/__tests__/hooks/useVoiceAiAvailability.test.ts` for
      focus/foreground, each potentially provider-started attempt, stale
      refusal, reset/burst timer refresh, server-time anchoring,
      loading/recovery, cancellation/unmount and late response after logout/user
      switch; never expose a previous user's snapshot.
- [ ] T040 [P] [US1] Extend
      `apps/mobile/__tests__/hooks/useVoiceTransactionFlow.test.ts` for known
      exhausted/burst/unknown blocking before recording/provider work, stale
      server refusal reconciliation, refresh after successful/failed provider
      attempts, consent-first recovery and revoked consent during upload,
      discard/retry/cancellation/permission-denied and app resume without
      overlapping request starts.
- [ ] T041 [P] [US1] Add
      `apps/mobile/__tests__/components/add-transaction/VoiceTransactionEntry.states.test.tsx`
      and `apps/mobile/__tests__/i18n/voice-usage-limits.test.ts` for
      available/count, recording/paused/finalizing/analyzing/error,
      exhausted/burst/unavailable states, Manual fallback, EN/AR local-midnight
      copy without timezone jargon or same-time-tomorrow wording, and limits
      read from props rather than client policy literals.
- [ ] T042 [US1] Write and run failing visible quota journeys in
      `apps/mobile/e2e/maestro/voice/voice-usage-limits.yaml` and
      `apps/mobile/e2e/maestro/voice/voice-recovery.yaml` before quota-client
      implementation: allowed attempt/review, stale/exhausted/burst/unknown
      states, Manual save during blocking, consent/permission recovery,
      discard/retry/resume and account-switch isolation where supported. Use a
      verified local HTTP/provider double, never a production bypass; explicitly
      block uncontrolled recording/timezone/provider cases in
      `specs/389-voice-usage-limits/tasks.md`.

### Implementation after accepted Red

- [ ] T043 [US1] Implement `apps/mobile/utils/device-time-zone.ts` and extend
      `apps/mobile/services/ai-voice-parser-service.ts` after T036/T037 Red; use
      expo-localization/expo-crypto, carry stable logical identity and device
      zone, preserve existing financial/date mapping and success Zod validation,
      and safely map authoritative refusal kinds.
- [ ] T044 [US1] Implement
      `apps/mobile/services/voice-ai-availability-service.ts` after T038 Red
      with strict external validation, user-scoped authenticated calls, typed
      fail-closed availability results and no local persistence/quota decrement
      or provider invocation.
- [ ] T045 [US1] Implement `apps/mobile/hooks/useVoiceAiAvailability.ts` after
      T039 Red, owning only refresh/loading/cancellation/timers and service
      invocation; discard stale user-scoped responses and clear state on auth
      change, with authoritative boundary refresh and no policy calculations/DB
      writes.
- [ ] T046 [US1] Integrate quota gating/after-attempt refresh into
      `apps/mobile/hooks/useVoiceTransactionFlow.ts` and
      `apps/mobile/app/(private)/add-transaction.tsx` after T040/T042 Red;
      enforce fresh availability/consent before starts, honor authoritative
      refusals, retain safe cleanup/retry identity and preserve Manual
      availability.
- [ ] T047 [US1] Implement bound quota/Voice state presentation in
      `apps/mobile/components/add-transaction/VoiceTransactionEntry.tsx` and
      approved EN/AR copy in `apps/mobile/locales/en/common.json`,
      `apps/mobile/locales/ar/common.json` after T041/T042 Red and T002
      approval; use shaped props, count/remaining from server, accurate next-day
      reset wording and existing recording/review actions without
      paywall/provider changes.
- [ ] T048 [US1] Run service/hook/component/i18n regressions and actual
      `apps/mobile/e2e/maestro/voice/voice-usage-limits.yaml`/`voice-recovery.yaml`;
      record executed commands, Red-to-Green assertions, stale/multi-user
      behavior and manual-only blockers in
      `specs/389-voice-usage-limits/tasks.md`.
- [ ] T049 [US1] Capture rendered baseline/state/variant comparisons for
      `apps/mobile/components/add-transaction/VoiceTransactionEntry.tsx` and
      `apps/mobile/app/(private)/add-transaction.tsx` against approved bindings:
      available/count, exhausted/burst/unavailable and bound active states,
      English/LTR, Arabic/RTL, light/dark,
      compact/ordinary/tablet/landscape/enlarged text; record evidence
      references and separate functional/visual-fidelity status in
      `specs/389-voice-usage-limits/tasks.md`; unrendered states stay
      incomplete.
- [ ] T050 [US1] Collect independent accessibility-tree/screen-reader or
      automated evidence for
      `apps/mobile/components/add-transaction/VoiceTransactionEntry.tsx` and the
      unified route: count/status announcements, localized action
      names/roles/states, recovery focus and Manual availability while Voice is
      blocked; record exact evidence and accessibility status in
      `specs/389-voice-usage-limits/tasks.md` separately from visual proof.

## Phase 6: US3 — Prepare Voice Entitlements for Future Subscription Plans (P2)

**Goal**: Replaceable policy source, configurable limits and technical
entitlement extensibility without implementing subscriptions or provider
branching.

**Independent test**: Inject two controlled metered policies into the same
server flow and client snapshot model; apply changed daily/burst configuration
without a mobile change, preserving parse success contract. Exercise internal
unmetered representation only to the extent explicitly reconciled in T003; no
paid names/prices/purchase/paywall UI ships.

- [ ] T051 [P] [US3] Extend
      `supabase/functions/_shared/voice-ai-entitlement.test.ts` and
      `supabase/functions/_shared/voice-ai-safeguard-service.test.ts` before
      production changes for alternate metered entitlements, operational
      daily/burst changes, source injection without Gemini coupling and internal
      unmetered shape/fail-closed constraints defined by T003; no invented
      commercial policy.
- [ ] T052 [P] [US3] Extend
      `apps/mobile/__tests__/services/voice-ai-availability-service.test.ts` and
      `apps/mobile/__tests__/components/add-transaction/VoiceTransactionEntry.states.test.tsx`
      for changed numeric limits/counts using the same contract and UI; prove no
      client 5/2 literal authority or subscription names/paywalls, and cover
      nullable technical availability only if explicitly supported by the
      reconciled current wire contract.
- [ ] T053 [US3] After T051/T052 Red, complete the replaceable entitlement
      resolver/injection interface in
      `supabase/functions/_shared/voice-ai-entitlement.ts`,
      `voice-ai-safeguard-service.ts` and availability/parse endpoint
      composition without changing provider-specific parsing or financial
      payloads; current source remains validated free-launch configuration.
- [ ] T054 [US3] Run controlled alternate-policy local HTTP/UI E2E checks
      through `scripts/__tests__/voice-ai-safeguard-http.integration.test.ts`
      and `apps/mobile/e2e/maestro/voice/voice-usage-limits.yaml`, then record
      operational-no-mobile-release and unchanged-success-contract evidence in
      `specs/389-voice-usage-limits/tasks.md`; hosted entitlement changes are
      not authorized.

## Phase 7: Cross-cutting validation and release evidence

- [ ] T055 [P] Review/update implementation-aligned rules and QA instructions in
      `docs/business/business-decisions.md`,
      `specs/389-voice-usage-limits/quickstart.md` and affected contract
      artifacts through one assigned documentation worker; preserve approved
      5/day + 2/min/local-midnight/pre-start-zero/post-start-one rules, route
      semantics and future-subscription exclusions, and never mark pending
      mockup metadata approved on the owner's behalf.
- [ ] T056 Run final focused mobile/Edge/SQL/concurrency/exclusion/E2E
      regression, mobile TypeScript, actual ESLint, Prettier and i18n checks for
      changed files, plus binding verifier for both
      `specs/389-voice-usage-limits/mockups/*.binding.md`; record exact
      commands/results and unrelated baseline limitations in
      `specs/389-voice-usage-limits/tasks.md` without
      environment-failure-as-pass claims.
- [ ] T057 Prepare only missing scoped local QA data for the owner-designated
      test user, verify local ledger/financial fixtures and successful QA-device
      sync where accessible, execute
      `specs/389-voice-usage-limits/quickstart.md` sections 8/10 including
      multi-device final unit, timezone travel/DST/reset, provider-start
      failure, pre-start refusal, reinstall and user switch; record what is
      automated/manual-only/blocked in `specs/389-voice-usage-limits/tasks.md`,
      preserving unrelated data and never resetting or reseeding without
      authorization.
- [ ] T058 Obtain independent frontend/architecture/QA/visual/accessibility
      review of `apps/mobile/app/(private)/add-transaction.tsx`, voice
      services/hooks/components, server/accounting changes and every evidence
      reference; record closure/status in
      `specs/389-voice-usage-limits/tasks.md`, with functional, visual and
      accessibility readiness reported separately and no completion claim while
      required proof is missing.
- [ ] T059 Produce a reviewable local handoff from
      `specs/389-voice-usage-limits/tasks.md` with exact files/source revision,
      completed/unrun tasks, coverage matrix, server-only exclusions, design
      approvals and manual blockers; prepare deployment/rollback steps from
      `quickstart.md` as separately authorized follow-up, without applying
      hosted policy, migrations or Edge deployments.

## Dependencies and implementation waves

| Wave               | Ready tasks | Prerequisites / handoff                                                                                        |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------------------- |
| Intake             | T001–T005   | Immutable source, correct feature override, artifact analysis and runner/binding gates                         |
| Shared Red         | T006–T008   | T001/T003/T004/T005; disjoint exclusion/contract test ownership                                                |
| Server Red         | T009–T014   | Resolved contracts; local test database/provider doubles; accepted behavioral failure evidence                 |
| Server Green       | T015–T023   | Shared and server Red; migration/exclusion/types are one integration lane; independent DB review               |
| Unified UI Red     | T024–T028   | Resolved nonvisual contracts; metadata needed by binding-dependent layout tests; honest E2E controls           |
| Unified UI Green   | T029–T035   | T002 approved binding + accepted route/Manual/nav/E2E Red; backend required when integrated quota is exercised |
| Client quota Red   | T036–T042   | US2 contracts frozen; client tests may use doubles before US2 Green; E2E runner and recording control verified |
| Client quota Green | T043–T050   | US2 Green + US0 shell ready + accepted client Red + T002 UI binding approval                                   |
| Entitlements       | T051–T054   | Shared/current free policy ready; do not concurrently edit US2 service or US1 state-test files                 |
| Final              | T055–T059   | All included stories, required evidence and independent reviews                                                |

US2 is independently testable against local server infrastructure. US0 can be
developed/tested using controlled existing voice behavior without quota UI, but
its governed production UI remains blocked by T002. US1 requires US2
contract/service behavior and the US0 shell. US3 tests begin after the current
resolver is ready; it extends the same interfaces and must not overlap their
writers. No partially integrated client-only quota ships as the release slice:
release MVP is **US2 + US0 + US1**; the agreed subscription-ready boundary in
US3 stays included, with commercial subscriptions deferred.

Within each slice, acceptance tests and E2E precede production, runtime schema
precedes service, service precedes handler/hook integration, and
rendered/accessibility evidence follows complete governed UI. All blocking task
results are inspected by the lead before the next assignment.

### Ownership-safe parallel examples

| Story | Ready parallel work                                                                                                | Exclusive file sets / join                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US2   | T009 SQL behavior and T010 multi-connection concurrency; T012 availability handler and T013 parse index test       | Different test files; share frozen RPC shapes, never concurrently own migration/generated types/exclusions; join before T015–T020                           |
| US0   | T024 route tests, T025 navigation tests, T026 Manual regressions                                                   | Route, navigation and Manual test files are disjoint; production extraction and route orchestration share `add-transaction.tsx` and therefore remain serial |
| US1   | T036 timezone test, T037 parser test, T038 availability-service test, T039 hook test, T041 presentation/i18n tests | Disjoint files; join before production integrations; T040 flow tests get separate exclusive file owner                                                      |
| US3   | T051 server policy tests and T052 mobile count/contract tests                                                      | Server/mobile files disjoint only after previous story writers release them; production policy integration has one owner                                    |

Suggested specialist lanes: DB/security worker owns migration/RPC tests +
generated types + all exclusions; server service worker owns
entitlement/safeguard/availability files after schema signatures freeze; voice
parser worker owns parse index and its test after shared services release;
mobile service/hook worker owns timezone/parser/availability/flow files;
frontend worker owns unified route/Manual/tabs/Voice/layout/navigation; QA
worker owns Maestro and manual evidence; product/copy worker owns
locales/docs/bindings when their writer wave is free. A separate reviewer
assesses high-risk DB/accounting and final user-visible behavior. The lead alone
chooses actual assignments, bases and non-overlapping worktrees. No simultaneous
production writer shares route, translations, contracts, migration, generated
types or task/evidence ledger.

## Requirement traceability

| Requirement | Tasks                                              |
| ----------- | -------------------------------------------------- |
| FR-001      | T005, T013, T020, T026, T033, T037, T043, T056     |
| FR-002      | T009–T011, T015, T017, T020, T022                  |
| FR-003      | T011, T017, T051, T053–T054                        |
| FR-004      | T009–T011, T015, T017, T020, T022                  |
| FR-005      | T007, T012, T015, T018–T020, T038–T046             |
| FR-006      | T024, T037–T041, T043–T047, T052                   |
| FR-007      | T009, T013–T015, T020, T022                        |
| FR-008      | T009–T010, T013–T015, T020, T022                   |
| FR-009      | T009–T010, T015, T039–T040, T057                   |
| FR-010      | T009–T011, T013–T015, T018, T020, T037, T043       |
| FR-011      | T005, T012–T014, T020, T024–T026, T031, T040, T046 |
| FR-012      | T009, T011–T015, T018, T020, T022                  |
| FR-013      | T009–T011, T013–T015, T018, T020, T022, T040       |
| FR-014      | T041–T042, T046–T050                               |
| FR-015      | T037, T039–T040, T043, T045–T048                   |
| FR-016      | T002, T041, T047, T049, T052                       |
| FR-017      | T002, T009, T015, T039–T042, T045–T050             |
| FR-018      | T002, T027, T035, T041, T047, T049–T050, T056      |
| FR-019      | T039–T040, T042, T045–T046, T048, T057             |
| FR-020      | T003, T007, T011, T017, T051–T054                  |
| FR-021      | T013, T017–T020, T051, T053–T054                   |
| FR-022      | T003, T051–T054                                    |
| FR-023      | T003, T017, T041, T047, T051–T055                  |
| FR-024      | T005, T013, T020, T037, T043, T056                 |
| FR-025      | T011, T017, T051–T054                              |
| FR-026      | T007, T011–T014, T017–T020, T038–T040, T044–T046   |
| FR-027      | T006, T009, T012–T015, T021–T023, T037–T038, T056  |
| FR-028      | T002, T027, T030, T034–T035, T047, T049–T050       |
| FR-029      | T024–T025, T028–T033                               |
| FR-030      | T026, T028–T029, T033, T057                        |
| FR-031      | T005, T013, T020, T030–T031, T037, T040–T050       |
| FR-032      | T024–T025, T028, T030, T032–T033                   |
| FR-033      | T024–T025, T028–T033                               |
| FR-034      | T024, T028, T030–T033, T040–T042, T046–T050        |
| FR-035      | T002, T027, T030, T034–T035, T041, T047, T049–T050 |
| FR-036      | T024, T026–T033, T040, T046, T055                  |

| Success criterion | Tasks / required evidence                                 |
| ----------------- | --------------------------------------------------------- |
| SC-001            | T009, T013–T015, T020, T022                               |
| SC-002            | T009–T010, T013–T015, T020, T022                          |
| SC-003            | T009, T011–T014, T018, T020, T022                         |
| SC-004            | T009–T011, T013–T015, T018, T020, T022, T037, T043        |
| SC-005            | T010, T015, T022–T023, T057                               |
| SC-006            | T037–T040, T043–T048, T057                                |
| SC-007            | T041, T047–T050, T056                                     |
| SC-008            | T005, T013, T020, T026, T033, T037, T043, T048, T056–T057 |
| SC-009            | T051–T054                                                 |
| SC-010            | T011, T017, T051–T054                                     |
| SC-011            | T006, T009, T012–T015, T021–T023, T037–T038, T056         |
| SC-012            | T024–T025, T028, T030, T032–T033                          |
| SC-013            | T024–T026, T028–T033, T040, T046, T048                    |
| SC-014            | T002, T030, T034–T035, T047, T049–T050, T058              |
| SC-015            | T024, T028, T030–T033, T040–T042, T046–T050, T057         |

## Manual, E2E and evidence matrix

This is a coverage plan, not an executed report. Each row must later gain exact
evidence/command/user/runtime details; manual-only or missing-harness reasons
remain explicit.

| Scenario source / journey                                                                                                  | Unit/integration coverage                  | E2E / manual evidence gate                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Quickstart §3/§8: daily five/six and burst two/three                                                                       | T009/T011/T013/T014/T022                   | T042/T048 visible quota path; T057 owner QA                                                                                  |
| Concurrent last unit, multi-device/reinstall/tamper                                                                        | T010/T014/T022                             | Real two-device and reinstall validation T057; not a single-device YAML claim                                                |
| Same-key replay/ambiguous response/new recording                                                                           | T009–T011/T013/T037/T040                   | T042 recovery where runner controls transport; uncontrolled recording/network ambiguity manual T057                          |
| Pre-start auth/consent/input/timezone/policy refusal; post-start failure/timeout/invalid output/internal retries           | T011–T014/T022/T037/T040                   | T014 local HTTP double, T042/T048 visible recovery; real provider QA only under explicit authorization                       |
| Pinned timezone, DST 23/25h, exact local midnight/burst expiry                                                             | Actual PostgreSQL T009/T010; timer T039    | Timezone/reset journey T057; no pretending device clock changes server time                                                  |
| Quickstart §10 FAB Manual; mic/onboarding/Retry Voice                                                                      | T024/T025/T033                             | T028/T033 unified-route Maestro and existing transaction-create regression                                                   |
| Manual partial data switch/return; expense/income/transfer/recurring/calculator/account/currency/budget/error/offline save | T024/T026/T033                             | T028 existing Manual-create plus relevant transaction regressions; offline/account/transfer cases T057 if runner unavailable |
| Voice active-mode lock/discard/pause/resume/denied/revoked permission/recovery                                             | T024/T027/T040 and existing recorder tests | T028/T042 only with verified native recording control; remaining permission/background/restart cases T057                    |
| Exhausted/burst/unavailable Voice still permits Manual                                                                     | T024/T040/T041/T048                        | T042/T048 visible Manual save under each blocked state                                                                       |
| Stale client, app focus/foreground/reset and logout/new user                                                               | T039/T040/T048                             | T042/T048 visible recovery/account switch; true two-device consumption T057                                                  |
| Same Gemini success/review/date/accounts/categories/selection                                                              | T005/T013/T026/T037/T033/T048              | T028/T042 review flow with double; representative authorized real audio/device validation T057                               |
| EN/AR, LTR/RTL, light/dark, compact/ordinary/tablet/landscape/enlarged text                                                | T027/T041                                  | Rendered baseline/variants T034/T049; separate accessibility T035/T050                                                       |
| Alternate entitlement, configured daily/burst change, no paid UX                                                           | T051/T052                                  | T054 controlled local HTTP/UI checks; no hosted policy changes                                                               |
| Server-only tables/grants/privacy/cleanup                                                                                  | T006/T009/T016/T021/T022                   | Independent security review T023/T058; no sync payload/accounting-content leakage                                            |

## Evidence and gate ledger

| Gate                                 | Current state                                       | Evidence / next action                                                                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact approved reference bytes saved | VERIFIED UNCHANGED                                  | `mockups/README.md` provenance/hashes; both copies byte-for-byte SHA-256 match the original supplied files                                                                                                                                                            |
| Binding approval/verifier            | PENDING                                             | Both sidecars are evidence-based drafts; no authority to approve metadata on owner's behalf                                                                                                                                                                           |
| Artifact consistency/analyze         | READ-ONLY REVIEW COMPLETE; T003 reconciliation OPEN | Four inherited conflict classes remain: optional callerLocalDate/UTC fallback; API/wire shape drift (GET/POST, timezone length, consent, nullability/policyVersion); stale layout refresh owner; cleanup versus replay retention. Resolve before affected production. |
| Runtime TDD                          | NOT RUN                                             | T006–T014/T024–T028/T036–T042/T051–T052 must record behavioral Red first                                                                                                                                                                                              |
| Functional completion                | NOT STARTED                                         | Story gates + T056–T058                                                                                                                                                                                                                                               |
| Visual fidelity                      | BLOCKED                                             | Binding approval then required rendered T034/T049                                                                                                                                                                                                                     |
| Accessibility evidence               | NOT RUN                                             | Separate T035/T050; screenshots insufficient                                                                                                                                                                                                                          |
| Hosted policy/deployment             | NOT AUTHORIZED                                      | Separate later authorization; T059 only prepares handoff                                                                                                                                                                                                              |
