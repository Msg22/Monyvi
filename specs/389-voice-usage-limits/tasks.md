# Tasks: Add Transaction Voice Redesign, Usage Limits and Subscription-Ready Entitlements

**Feature**: `389-voice-usage-limits` / issue #347

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`,
`quickstart.md`, all `contracts/` files and the unchanged approved references in
`mockups/`

**Source revision**: `4a13b67d02037bc2fb4e4c68c217480d02ea626c`

**Local execution base**: `d97146960593117e61797e65bca852cec6bc7fbf`, merging
governing main `2095ec061d531854603e8415122231f1cbf4c1a0` into the published
handoff `dcf1671daa4b2ab14bc2b8846911d411e6c08a0d`.

**Status**: Existing 59-task checklist reviewed and refined in place. Binding/
copy and 35-day replay retention decisions are owner-approved. Final artifact
analysis is complete: T001–T004 source/planning/feasibility assessments passed.
T004 identifies explicit runtime blockers; it does not claim their execution.
T005 native baseline and task-specific behavioral Red remain separate gates.
Initial server exclusions and mobile route/parser behavioral Red are recorded in
checklists/server-initial-red.md and checklists/mobile-initial-red.md. Direct
production source for the server accounting/API/generated-type boundary and
unified Manual/Voice route/client is written in the isolated delivery worktree.
Complete quota/runtime Green and visual/accessibility completion are not
claimed. Current execution authority and live ownership are recorded in
`implementation-ledger.md`; remote test proposals may be authored while local
runner intake completes. For the current owner-authorized direct-implementation
pass, test-first execution, tests, independent reviews, native builds and
device/visual checks are deferred as recorded in `implementation-ledger.md`.
Written implementation is not verified delivery; existing evidence and
unfinished verification tasks stay intact. Changes remain uncommitted/unpushed
until verification.

**Current integration target main**: `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`;
main now owns `supabase/migrations/086_metals_dispose_rate_snapshots.sql`, so
the byte-identical Voice migration is aligned to
`supabase/migrations/087_voice_ai_usage_limits.sql`. This is a path-only
numbering correction; Voice schema, accounting, retention and #384 behavior are
unchanged. Local merge and validation remain lead-owned.

**Direct source status — 8 October 2026**: Source for T015–T020, T029–T032 and
T043–T047 is integrated locally, including the final bound layout details. Task
checkboxes remain unchanged because their normal behavioral prerequisites and
linked verification are deferred, not passed. T016 has real authoritative local
SQL/type generation evidence; it is not SQL behavior/race/cleanup proof. See the
current ledger for exact worktrees, ownership and generation records.

The following is the normal verification workflow; the later explicit owner
instruction defers its test-first gate for the current direct-implementation
pass only. Strict TDD is mandatory under `AGENTS.md` and
`.agent/workflows/sprint-issue.md`: write unit/integration and honest
user-journey E2E tests first, run them and record the expected behavior failure
before production changes. An import/setup failure is not behavioral Red. A
missing runner/harness is a blocker; do not replace executed evidence with
source inspection or fabricate an E2E result. Routine tests use provider
doubles, never real Gemini usage.

Implementation team lead remains coordination-only under
`.agent/workflows/team-led-delivery.md`; workers own edits in exclusive sibling
worktrees. This checklist defines suggested lanes, not actual assignments or
Git/external mutation authority. No installs in secondary worktrees. This
checklist does not grant Git/external mutation authority. Later owner approval
authorizes full local delivery, finalized planning publication and separate
server/mobile worker branches, as recorded in `implementation-ledger.md`. No
main merge, PR, issue mutation, hosted migration, policy change, deployment or
paid provider request is authorized. Checks remain batched before commits; push
once per accepted batch.

`[P]` means an ownership-safe task can run beside another ready task with
disjoint files after its stated prerequisites. Story numbers preserve the
specification: **US0, US1, US2, US3**. US2 precedes US0/US1 in execution because
server authority is a prerequisite for integrated client quota behavior; all
three are P1.

## Current UI repair authority — 10 October 2026

This continuation finalizes the existing checklist in place; T001–T059 and the
36 FR/15 SC identifiers remain intact. Repair branch
`codex/issue347-ui-fidelity` starts at
`ab15bcce6a23179a2d3735dc8b835f1933b99799`, containing trusted main
`3264eba2b67bcc66cddc95e3fbdb36e8705ee642`. Five exact approved references in
`mockups/repair-binding-manifest.json` supersede the old two-reference layout
for repaired surfaces; `reconciliation.md` preserves history and receipt.
`contracts/add-transaction-ui-contract.md` maps states/components/verified
icons.

Scope is compact Manual/focus keypad/Done/header Save, shared underline modes,
Voice unboxed mic and locale-specific idle/daily/recovery presentation.
Financial, transfer, recurring, offline, parsing, retention,
SQL/snapshot/sync/quota contracts remain intact; #384 stays deferred. No schema
or hosted deployment work is part of repair. Older full-feature server tasks
stay as inherited unfinished work, not new repair assignments.

Owner's latest scope: “please don't test on emulator, just write unit tests and
e2e and i'll do manual testing after you finish”. Author unit and E2E coverage;
execute focused unit/type/lint checks in batches before any separately
authorized commit. No emulator/device/adb/Droidrun work, E2E execution or
screenshot/ accessibility captures. E2E authoring is not execution evidence;
required unit behavioral Red still precedes repair production code.

T034/T035/T049/T050 and visual/accessibility T058 remain unchecked and NOT RUN
pending owner manual testing. Hand owner complete manual matrix.
Functional/source and unit-validation status can advance independently;
visual/accessibility/device/ live-provider readiness stays unverified. Existing
completion evidence requirements remain in force for future acceptance; do not
claim visual completion or merge/ device readiness from source or unit results.

Earlier direct-source verification deferral and dated approval/analysis below
apply to their earlier pass, not fresh repair. Current T002 package integrity
and T003 read-only analysis were reopened and completed for this scope. Planning
docs are assigned to the exclusive worker; lead alone dispatches production
after zero current critical/high analysis blockers. No hooks, commits, pushes or
GitHub mutations are authorized by this checklist.

## Phase 1: Setup and blocking design gates

- [x] T001 Verify the selected feature and immutable source, inspect existing
      route/voice/SMS behavior and record baseline/gate status in
      `specs/389-voice-usage-limits/tasks.md`; use
      `SPECIFY_FEATURE_DIRECTORY=specs/389-voice-usage-limits SPECIFY_FEATURE=389-voice-usage-limits`
      with `C:/Program Files/Git/bin/bash.exe` for
      `.specify/scripts/bash/check-prerequisites.sh`, inspect
      `.specify/extensions.yml`, and do not run optional Git hooks. UI repair:
      refresh repair source/feature selection; earlier source check stays
      historical.
- [x] T002 Verify all five active approved bindings listed in
      `specs/389-voice-usage-limits/mockups/repair-binding-manifest.json`: read
      exact images/sidecars, validate image/Binding Facts/combined revisions and
      approval receipt, then require each binding verifier exit0. Preserve old
      mockup-1/mockup-2 bytes and approvals as superseded history; no Manual
      Voice allowance strip or regenerated reference.
- [x] T003 Finalize inherited artifact reconciliation in
      `specs/389-voice-usage-limits/reconciliation.md`, then run read-only
      `.agent/workflows/speckit.analyze.md` against
      `specs/389-voice-usage-limits/spec.md`, `plan.md`, `tasks.md`,
      `data-model.md` and every `contracts/` file. Current repair authorizes
      exclusive planning-worker doc reconciliation; lead retains dispatch.
      Re-run analysis for the approved replacement package before production.
      Existing contract choices remain unchanged. Canonical choices: POST
      availability JSON, timezone 1–128 plus IANA validation, auth/consent,
      required policyVersion, optional/empty callerLocalDate with unchanged
      UTC-date fallback, snapshot daily/burst reason distinct from replay
      refusal, and route-owned refresh. Endpoint contracts own shapes;
      `voice-ai.openapi.yaml` is a reference-only compatibility index. Current
      free launch is numeric metered; future null-triplet representation is
      controlled test-only compatibility, never a missing-config bypass or
      shipping paid/unmetered policy. Apply the owner-approved 35-day replay
      horizon and safe terminal identity deletion across all artifacts. Resolve
      every blocking analysis finding before implementation or worker
      assignments.
- [x] T004 Establish the complete manual-to-automation matrix and local runner
      feasibility in `specs/389-voice-usage-limits/tasks.md` using
      `quickstart.md` sections 3/8/10 and `apps/mobile/e2e/maestro/README.md`;
      identify emulator/audio/provider-double/clock capabilities,
      permission/restart/resume cases and manual-only blockers, and reserve the
      exact next migration filename
      `supabase/migrations/087_voice_ai_usage_limits.sql` after rechecking
      migration numbering at assignment time. UI repair: map current scenarios
      below to unit/E2E authoring and owner manual-only validation; no
      emulator/device/E2E execution or captures.
- [ ] T005 Run existing focused baseline commands for
      `apps/mobile/__tests__/services/ai-voice-parser-service.test.ts`,
      `apps/mobile/__tests__/hooks/useVoiceTransactionFlow.test.ts`,
      `apps/mobile/__tests__/hooks/useVoiceRecorder.test.ts`, existing Add
      Transaction/FAB/tab-bar tests and
      `apps/mobile/e2e/maestro/transactions/create-transaction.yaml`; record
      commands, observed failures and runner availability in
      `specs/389-voice-usage-limits/tasks.md` without treating unrelated
      baseline failures as passing.

**Gate**: This local continuation requires T002 binding approval/verifier and
T003 finalized reconciliation/analyze before implementation or any worker
assignment. Read-only local planning/runner inspection may continue through the
final analysis gate. T004 must identify an honest E2E path before the
corresponding user-visible implementation; missing controls stay blocked rather
than asserted covered.

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
- [ ] T008 Record staged T006/existing-HTTP Red, agreed bootstrap interfaces and
      later direct T007 behavioral Red separately in
      `specs/389-voice-usage-limits/tasks.md`; preserve Watermelon financial
      schema, local Manual writes, consent semantics and Gemini successful
      response, with no service imports in new presentational components and no
      DB writes/business policy in hooks.

**Checkpoint**: Freeze agreed external shapes and exclusive ownership before
bootstrap dispatch. Initial T006/existing-HTTP Red releases only the bounded
bootstrap; direct T007 evidence is a later gate, not an initial assignment
prerequisite. Foundation completion and Green remain separate unfinished gates.

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
      safety that retains active/reserved/provider work and current accounting;
      test just before/exactly at/after 35 elapsed days from immutable
      created_at, terminal identity deletion, no extension on replay/update,
      post-deletion same-key new admission/refusal and no active quota refund;
      prove behavior against actual PostgreSQL rather than SQL regexes alone.
- [ ] T010 [P] [US2] Write real multi-connection concurrency tests in
      `scripts/__tests__/voice-ai-safeguard-concurrency.test.ts` for two devices
      racing the last daily/burst slot, same-key concurrent reservation/start,
      different-user independence, admission-versus-provider-start and bounded
      cleanup-versus-admission/start races; bind only a verified isolated local
      test database. Author first, then run against callable RPCs through the
      bootstrap sequence below; missing functions are not race Red.
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
      replay during retention never recalls Gemini, post-deletion same-key
      requests use current admission gates, and completion failure never refunds
      starts.
- [ ] T014 [US2] Define and execute failing complete local HTTP
      admission/accounting scenarios in
      `scripts/__tests__/voice-ai-safeguard-http.integration.test.ts` before
      production wiring, using local Edge/PostgreSQL and a verified provider
      double; exercise HTTP refusal and subsequent authoritative availability,
      retain a runner blocker if test injection cannot safely avoid real Gemini.

### Implementation after accepted Red

- [ ] T015 [US2] Implement `supabase/migrations/087_voice_ai_usage_limits.sql`
      through the bounded bootstrap sequence below, with voice-only
      tables/indexes/checks, authenticated-user lock and accepted timezone
      window, atomic availability/reserve/start/release/complete RPCs, unique
      user/request key, server timestamps, pinned DST-aware local midnight,
      active reservation capacity and service-role-only grants/RLS; implement
      tested bounded cleanup of whole eligible terminal identities at/after 35
      elapsed days from server created_at under the same user lock, excluding
      active work/leases and current accounting; no lifetime tombstone or
      refund, and a deleted key follows current gates as new. Never store
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
      `supabase/functions/_shared/voice-ai-entitlement.ts` through the bootstrap
      sequence below, with accepted existing-boundary Red first and direct
      T007/T011 Red before remaining contract/policy behavior; free launch is
      operational 5/day, 2/min with 60-second burst and 120-second lease,
      missing/invalid config fails closed, and Gemini owns no policy/commercial
      details.
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
      `supabase/migrations/087_voice_ai_usage_limits.sql`, server
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
      back/cancel cleanup without changing transaction contracts. UI repair:
      assert no Voice notice in Manual for every availability state, Save action
      ownership, focus/safe-switch cleanup and hidden keypad subtree.
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
      mockup fields. UI repair: cover ordinary grouped input, focus-only
      calculator/no native soft keyboard, transfer focus target, dismiss-only
      Done and header Save; preserve invalid input and existing financial
      behavior.
- [ ] T027 [P] [US0] Add
      `apps/mobile/__tests__/components/add-transaction/AddTransactionModeTabs.test.tsx`
      and
      `apps/mobile/__tests__/components/add-transaction/VoiceTransactionEntry.layout.test.tsx`
      for selected/disabled semantics, central compact/ordinary responsive
      breakpoints, safe-area bottom inset and cleanup of animations, using
      approved binding values only after T002. UI repair: cover approved
      underline modes, unboxed mic and per-locale progress/examples/icons;
      normal row versus shared compact/text-scale reflow, minimum48 dp keypad
      keys and bottom inset.
- [ ] T028 [US0] Author complete user journeys in
      `apps/mobile/e2e/maestro/voice/add-transaction-modes.yaml` and update
      `apps/mobile/e2e/maestro/transactions/create-transaction.yaml` before
      UI/navigation code; current owner defers E2E execution; cover FAB Manual
      save, partial form switch/return, Voice entry/review Retry and active-mode
      lock only where an honest recording/test harness exists, with blocked
      cases recorded in `specs/389-voice-usage-limits/tasks.md`. UI repair:
      author idle/focus/Done-no-save/header-Save/blocked-Voice-Manual journeys
      and update affected selectors; execution stays NOT RUN for owner.

### Implementation after accepted Red and binding approval

- [ ] T029 [US0] Extract the existing form from
      `apps/mobile/app/(private)/add-transaction.tsx` into
      `apps/mobile/components/add-transaction/ManualTransactionEntry.tsx` after
      T026 Red, preserving its current form/submission contract and scoped local
      services; keep it mounted across safe switches and exclude hidden form
      content from accessibility without rewriting mature behavior or copying
      architectural debt. UI repair: adopt compact B with existing
      TypeTabs/GroupedMoneyInput/Dropdown/OptionalSection/CalculatorKeypad,
      preserving all financial behavior and focus/no-soft-keyboard/Done
      contract.
- [ ] T030 [US0] Implement approved shell/mode controls in
      `apps/mobile/components/add-transaction/AddTransactionModeTabs.tsx`,
      `apps/mobile/components/add-transaction/VoiceTransactionEntry.tsx` and
      `apps/mobile/app/(private)/add-transaction.tsx` after T024/T027/T028 Red
      and T002 verifier approval; resolve the bound route/bottom-bar scope
      before adding/removing navigation chrome, use
      NativeWind/theme/font/responsive tokens and preserve binding composition.
      UI repair: consume active five-reference state/component/icon map; reuse
      shared header and verified Ionicons names; preserve deliberate EN/AR
      differences.
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
      `specs/389-voice-usage-limits/tasks.md`. UI repair: current repair
      executes focused unit checks and authors E2E; device/E2E execution remains
      owner-deferred, no false Green.
- [ ] T034 [US0] Capture rendered baseline side-by-side/overlay comparison for
      `apps/mobile/app/(private)/add-transaction.tsx`,
      `ManualTransactionEntry.tsx`, `AddTransactionModeTabs.tsx` and
      `VoiceTransactionEntry.tsx` against all five active approved references in
      `mockups/repair-binding-manifest.json` at declared contexts, then
      English/Arabic, light/dark, compact/ordinary phone, tablet, landscape and
      enlarged-text variants; record evidence paths and
      functional/visual-fidelity status separately in
      `specs/389-voice-usage-limits/tasks.md`, leaving missing renders
      incomplete. UI repair: owner defers device/render/accessibility execution;
      retain unchecked/NOT RUN and hand complete comparison/semantics plan to
      owner.
- [ ] T035 [US0] Collect separate accessibility-tree and screen-reader/automated
      evidence for `apps/mobile/app/(private)/add-transaction.tsx`,
      `AddTransactionModeTabs.tsx`, `ManualTransactionEntry.tsx` and
      `VoiceTransactionEntry.tsx`: localized tab names/roles/selected/disabled
      states, hidden-tree exclusion, focus order and active-work transitions;
      record exact references and accessibility status in
      `specs/389-voice-usage-limits/tasks.md`; screenshots never substitute for
      semantics. UI repair: owner defers device/render/accessibility execution;
      retain unchecked/NOT RUN and hand complete comparison/semantics plan to
      owner.

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
      read from props rather than client policy literals. UI repair: assert
      short availability-check failure heading plus existing body only in Voice,
      distinct daily/exhausted and locale-specific compositions, no invented
      zero count.
- [ ] T042 [US1] Author visible quota journeys in
      `apps/mobile/e2e/maestro/voice/voice-usage-limits.yaml` and
      `apps/mobile/e2e/maestro/voice/voice-recovery.yaml` before quota-client
      implementation; current owner defers E2E execution: allowed
      attempt/review, stale/exhausted/burst/unknown states, Manual save during
      blocking, consent/permission recovery, discard/retry/resume and
      account-switch isolation where supported. Use a verified local
      HTTP/provider double, never a production bypass; explicitly block
      uncontrolled recording/timezone/provider cases in
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
      paywall/provider changes. UI repair: implement approved per-locale state
      composition and exact glyph map, isolate every Voice notice from Manual;
      no SQL/snapshot/#384 change.
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
      incomplete. UI repair: owner defers device/render/accessibility execution;
      retain unchecked/NOT RUN and hand complete comparison/semantics plan to
      owner.
- [ ] T050 [US1] Collect independent accessibility-tree/screen-reader or
      automated evidence for
      `apps/mobile/components/add-transaction/VoiceTransactionEntry.tsx` and the
      unified route: count/status announcements, localized action
      names/roles/states, recovery focus and Manual availability while Voice is
      blocked; record exact evidence and accessibility status in
      `specs/389-voice-usage-limits/tasks.md` separately from visual proof. UI
      repair: owner defers device/render/accessibility execution; retain
      unchecked/NOT RUN and hand complete comparison/semantics plan to owner.

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
      nullable technical availability through controlled future-entitlement
      doubles only, including null-triplet consistency and malformed/mixed
      rejection under the canonical wire contract; no unlimited launch UI.
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
      mockup metadata approved on the owner's behalf. UI repair: record
      active-package supersession, compact/focus/Done/Voice-only decisions and
      current owner manual scope without rewriting historical evidence.
- [ ] T056 Run final focused mobile/Edge/SQL/concurrency/exclusion/E2E
      regression, mobile TypeScript, actual ESLint, Prettier and i18n checks for
      changed files, plus binding verifier for every active entry in
      `specs/389-voice-usage-limits/mockups/repair-binding-manifest.json`;
      record exact commands/results and unrelated baseline limitations in
      `specs/389-voice-usage-limits/tasks.md` without
      environment-failure-as-pass claims. UI repair: current repair runs focused
      unit/type/lint and doc/reference integrity checks; inherited server/full
      E2E/device checks remain outside repair and unrun.
- [ ] T057 Prepare only missing scoped local QA data for the owner-designated
      test user, verify local ledger/financial fixtures and successful QA-device
      sync where accessible, execute
      `specs/389-voice-usage-limits/quickstart.md` sections 8/10 including
      multi-device final unit, timezone travel/DST/reset, provider-start
      failure, pre-start refusal, reinstall and user switch; record what is
      automated/manual-only/blocked in `specs/389-voice-usage-limits/tasks.md`,
      preserving unrelated data and never resetting or reseeding without
      authorization. UI repair: current repair hands owner manual plan; no
      device sync, seed, hosted data or emulator action by workers under latest
      instruction.
- [ ] T058 Obtain independent frontend/architecture/QA/visual/accessibility
      review of `apps/mobile/app/(private)/add-transaction.tsx`, voice
      services/hooks/components, server/accounting changes and every evidence
      reference; record closure/status in
      `specs/389-voice-usage-limits/tasks.md`, with functional, visual and
      accessibility readiness reported separately and no completion claim while
      required proof is missing. UI repair: independent source/coverage review
      may proceed; device/render/accessibility review remains unchecked/NOT RUN
      pending owner, so no fidelity/merge-ready claim.
- [ ] T059 Produce a reviewable local handoff from
      `specs/389-voice-usage-limits/tasks.md` with exact files/source revision,
      completed/unrun tasks, coverage matrix, server-only exclusions, design
      approvals and manual blockers; prepare deployment/rollback steps from
      `quickstart.md` as separately authorized follow-up, without applying
      hosted policy, migrations or Edge deployments. UI repair: handoff includes
      authored versus executed coverage and owner manual plan; no
      emulator/E2E/device readiness claim.

## Dependencies and implementation waves

| Wave               | Ready tasks                                | Prerequisites / handoff                                                                                                                                                               |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake             | T001–T005                                  | Immutable source, correct feature override, artifact analysis and runner/binding gates                                                                                                |
| Shared Red         | T006 plus initial T007/T008 boundary cases | Approved planning; disjoint test proposals; runner-ready execution before bounded bootstrap; direct T007/T008 completion follows callable interfaces                                  |
| Server Red         | T009–T014                                  | Resolved contracts; local test database/provider doubles; accepted behavioral failure evidence                                                                                        |
| Server Green       | T015–T023                                  | Staged bootstrap below; accepted existing-boundary Red before minimal interfaces, then real SQL/contract/race Red before further behavior; one schema owner and independent DB review |
| Unified UI Red     | T024–T028                                  | Resolved nonvisual contracts; metadata needed by binding-dependent layout tests; honest E2E controls                                                                                  |
| Unified UI Green   | T029–T035                                  | T002 approved binding + accepted route/Manual/nav/E2E Red; backend required when integrated quota is exercised                                                                        |
| Client quota Red   | T036–T042                                  | US2 contracts frozen; client tests may use doubles before US2 Green; E2E runner and recording control verified                                                                        |
| Client quota Green | T043–T050                                  | US2 Green + US0 shell ready + accepted client Red + T002 UI binding approval                                                                                                          |
| Entitlements       | T051–T054                                  | Shared/current free policy ready; do not concurrently edit US2 service or US1 state-test files                                                                                        |
| Final              | T055–T059                                  | All included stories, required evidence and independent reviews                                                                                                                       |

US2 is independently testable against local server infrastructure after this
continuation's pre-implementation T002/T003 gates pass. US0 may then be
developed/tested using controlled existing voice behavior without quota UI. US1
requires US2 contract/service behavior and the US0 shell. US3 tests begin after
the current resolver is ready; it extends the same interfaces and must not
overlap their writers. No partially integrated client-only quota ships as the
release slice: release MVP is **US2 + US0 + US1**; the agreed subscription-ready
boundary in US3 stays included, with commercial subscriptions deferred.

Within each slice, acceptance tests and E2E precede production, runtime schema
precedes service, service precedes handler/hook integration, and
rendered/accessibility evidence follows complete governed UI. All blocking task
results are inspected by the lead before the next assignment.

### Greenfield test bootstrap (execution refinement, 7 October 2026)

The current parse-voice HTTP handler exists, but Voice RPCs and the new contract
module do not. Preserve all 59 task IDs and final requirements; stage their
execution to avoid a missing import/function masquerading as behavioral Red:

1. Author T006 and the T007/T011/T013 boundary cases plus T009/T010 tests first.
   A test-only Deno import map substitutes local SDK/auth/provider doubles while
   capturing the actual existing parse-voice handler. No production fixture
   flag, paid Gemini request, remote network or future-module import is needed.
   Execute unchanged-success controls and quota/replay/input/config assertions
   at that existing boundary. The required refusal/provider-call mismatch is
   behavioral Red; loader, runner and missing RPC errors are blockers.
2. After accepted T006 and existing-boundary Red, release only the minimum local
   T015/T017 callable SQL/contract interfaces needed by those tests. Preserve
   service-role-only access, ownership and fail-closed behavior during
   bootstrap. No insecure hosted stub, interim deployment or intermediate
   production commit is permitted. This is implementation driven by already
   failing public behavior, not permission to complete the whole server slice.
3. With those interfaces callable, execute direct T007/T011 contract tests and
   real single-session T009 SQL assertions; accept their behavioral Red before
   corresponding validation/accounting/cleanup implementation. Bring basic
   single-request admission and state controls Green, then execute authored T010
   independent-session races. A fail-closed all-deny result cannot prove
   last-slot contention. Accept race-specific failed assertions before any
   additional locking/race fix; if already Green, retain regression evidence
   without inventing a failure or unnecessary production change. SQL undefined
   function/relation errors never satisfy either gate; existing HTTP Red is not
   evidence of database concurrency.
4. Finish T015/T017/T018 and wiring through the remaining T012/T013/T014 Red
   gates. T014's full local PostgreSQL HTTP scenarios run once the real RPCs
   exist and before final production HTTP wiring; SDK-only handler tests do not
   replace that integration layer. Run the complete Green/security/privacy batch
   in T022 before committing the production batch.

T008 records both initial boundary evidence and the later direct-contract gate;
T009/T010/T015 stay unfinished until their real SQL/race evidence is accepted.
Local DB tests use isolated synthetic accounts/state with targeted cleanup;
shared main/device fixtures and hosted services remain outside that test target.
Cleanup technical parameters are frozen: hourly at minute 17 (cron
`17 * * * *`), maximum 500 eligible work-request rows per invocation, under the
same per-user admission/start lock. T009/T010 must verify bounded backlog
processing and safety before completion; these parameters cannot alter the
approved 35 elapsed-day eligibility or actual-deletion replay semantics.

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

| Requirement | Tasks                                                |
| ----------- | ---------------------------------------------------- |
| FR-001      | T005, T008, T013, T020, T026, T033, T037, T043, T056 |
| FR-002      | T009–T011, T015, T017, T020, T022                    |
| FR-003      | T011, T017, T051, T053–T054                          |
| FR-004      | T009–T011, T015, T017, T020, T022                    |
| FR-005      | T007, T012, T015, T018–T020, T036, T038–T046         |
| FR-006      | T024, T037–T041, T043–T047, T052                     |
| FR-007      | T009, T013–T015, T020, T022                          |
| FR-008      | T009–T010, T013–T015, T020, T022                     |
| FR-009      | T009–T010, T015, T039–T040, T057                     |
| FR-010      | T009–T011, T013–T015, T018, T020, T037, T043         |
| FR-011      | T005, T012–T014, T020, T024–T026, T031, T040, T046   |
| FR-012      | T009, T011–T015, T018, T020, T022                    |
| FR-013      | T009–T011, T013–T015, T018, T020, T022, T040         |
| FR-014      | T041–T042, T046–T050                                 |
| FR-015      | T037, T039–T040, T043, T045–T048                     |
| FR-016      | T002, T041, T047, T049, T052                         |
| FR-017      | T002, T009, T015, T039–T042, T045–T050               |
| FR-018      | T002, T027, T035, T041, T047, T049–T050, T056        |
| FR-019      | T039–T040, T042, T045–T046, T048, T057               |
| FR-020      | T003, T007, T011, T017, T051–T054                    |
| FR-021      | T013, T017–T020, T051, T053–T054                     |
| FR-022      | T003, T051–T054                                      |
| FR-023      | T003, T017, T041, T047, T051–T055                    |
| FR-024      | T005, T013, T020, T037, T043, T056                   |
| FR-025      | T011, T017, T051–T054                                |
| FR-026      | T007, T011–T014, T017–T020, T038–T040, T044–T046     |
| FR-027      | T006, T009, T012–T016, T021–T023, T037–T038, T056    |
| FR-028      | T001–T002, T027, T030, T034–T035, T047, T049–T050    |
| FR-029      | T024–T025, T028–T033                                 |
| FR-030      | T026–T029, T033, T057                                |
| FR-031      | T005, T013, T020, T030–T031, T037, T040–T050         |
| FR-032      | T024–T025, T028, T030, T032–T033                     |
| FR-033      | T024–T025, T028–T033                                 |
| FR-034      | T024, T028, T030–T033, T040–T042, T046–T050          |
| FR-035      | T002, T027, T030, T034–T035, T041, T047, T049–T050   |
| FR-036      | T024, T026–T033, T040, T046, T055                    |

| Success criterion | Tasks / required evidence                                          |
| ----------------- | ------------------------------------------------------------------ |
| SC-001            | T009, T013–T015, T020, T022                                        |
| SC-002            | T009–T010, T013–T015, T020, T022                                   |
| SC-003            | T009, T011–T014, T018, T020, T022                                  |
| SC-004            | T009–T011, T013–T015, T018, T020, T022, T037, T043                 |
| SC-005            | T010, T015, T022–T023, T057                                        |
| SC-006            | T037–T040, T043–T048, T057                                         |
| SC-007            | T041, T047–T050, T056                                              |
| SC-008            | T005, T013, T020, T026, T033, T037, T043, T048, T056–T057          |
| SC-009            | T051–T054                                                          |
| SC-010            | T011, T017, T051–T054                                              |
| SC-011            | T006, T009, T012–T015, T021–T023, T037–T038, T056                  |
| SC-012            | T024–T025, T028, T030, T032–T033                                   |
| SC-013            | T024–T026, T028–T033, T040, T046, T048                             |
| SC-014            | T002, T004, T026–T028, T030, T034–T035, T047, T049–T050, T058–T059 |
| SC-015            | T024, T028, T030–T033, T040–T042, T046–T050, T057                  |

## Manual, E2E and evidence matrix

This is a coverage plan, not an executed report. Each row must later gain exact
evidence/command/user/runtime details; manual-only or missing-harness reasons
remain explicit.

| Scenario source / journey                                                                                                  | Unit/integration coverage                  | E2E / manual evidence gate                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Quickstart §3/§8: daily five/six and burst two/three                                                                       | T009/T011/T013/T014/T022                   | T042/T048 visible quota path; T057 owner QA                                                                                  |
| Concurrent last unit, multi-device/reinstall/tamper                                                                        | T010/T014/T022                             | Real two-device and reinstall validation T057; not a single-device YAML claim                                                |
| Same-key replay/ambiguous response/new recording/35-day identity deletion                                                  | T009–T011/T013/T037/T040                   | T042 recovery where runner controls transport; uncontrolled recording/network ambiguity manual T057                          |
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

## UI repair coverage and owner manual handoff — 10 October 2026

| Scenario                                                                           | Unit / authored E2E task coverage | Owner manual validation                                            |
| ---------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| Manual idle: ordinary amount, required selectors, no keypad/Voice notice           | T024/T026/T027; T028              | Normal phone baseline, both languages/themes                       |
| Amount focus: custom keypad only, no native soft keyboard; source/target amounts   | T026/T027; T028                   | Focus/blur, transfer target, Android keyboard visibility           |
| Done applies existing equals and dismisses without save; header Save persists      | T026/T028/T029/T033               | No new record after Done, one local save after header Save         |
| Account/category normal row and compact/text-scale reflow                          | T026/T027; T028                   | Compact/ordinary/tablet/landscape and font scales1.35/2            |
| Shared optional fields, recurring/date/note/counterparty/validation/budget/balance | T026/T033; T028                   | Existing supported Manual paths, malformed input and feedback      |
| Draft survives Manual/Voice switch; keypad dismissed; active Voice locks modes     | T024/T026/T040; T028/T042         | Real recording/pause/finalize, back/cancel/restart/resume          |
| Voice idle EN continuous/examples icons, AR segments/quotes, unboxed mic           | T027/T041/T047; T042              | Side-by-side/overlay baseline per respective approved reference    |
| Daily EN horizontal alert/two actions; AR centered alert/reset/single Manual       | T041/T047; T042                   | Respective daily-reference comparison and next-local-midnight copy |
| Loading/burst/availability failure/replay/permissions/active states                | T040/T041/T048; T042              | Native permission/recovery/audio/provider/network cases            |
| All Voice blocked states leave Manual free of Voice notices and usable offline     | T024/T040/T041/T048; T028/T042    | Local save under blocked/unavailable/offline Voice                 |
| Required semantics, selected/disabled roles, hidden subtree, focus/recovery/keypad | T024/T026/T027/T041; T028/T042    | Separate tree/screen-reader proof T035/T050                        |
| Light/dark, EN/AR, responsive contexts/enlarged text and bottom safe inset         | T027/T041; authored T028/T042     | Rendered T034/T049, separate accessibility T035/T050               |

All E2E paths are authored coverage only until owner executes them. No emulator,
device, E2E execution or captures in current scope. Existing unit/integration
coverage for financial/provider/user-scope invariants is retained. Missing
honest recording/provider/clock harness remains an explicit manual-only/blocked
reason; do not infer it from existing SMS fixtures or mock state tests.

| Repair gate                                       | Status at planning handoff                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Five exact binding approvals                      | APPROVED; all five binding verifiers exit0 on 10 October 2026                                            |
| Fresh artifact analysis                           | PASSED: 51/51 requirements, all 59 task IDs mapped, 0 critical/high findings; current read-only response |
| Unit/E2E authoring and focused unit/type/lint     | NOT RUN by planning worker; assigned production/QA work                                                  |
| E2E execution / emulator / device / live provider | NOT RUN; owner manual scope                                                                              |
| Rendered visual fidelity T034/T049                | NOT RUN; owner manual validation                                                                         |
| Accessibility T035/T050                           | NOT RUN; owner manual validation                                                                         |
| Independent source/coverage review T058           | Pending source review; device/visual/accessibility portion remains deferred                              |
| #384 / hosted deployment                          | DEFERRED separately / NOT AUTHORIZED                                                                     |

## Historical evidence and gate ledger — preserved

| Gate                                 | Current state        | Evidence / next action                                                                                                                                                                                         |
| ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact approved reference bytes saved | VERIFIED UNCHANGED   | `mockups/README.md` provenance/hashes; both copies byte-for-byte SHA-256 match the original supplied files                                                                                                     |
| Binding approval/verifier            | APPROVED; VERIFIED   | Owner approved both exact combined revisions and EN/AR copy on 2026-10-07. Both verifiers exit 0; images and Binding Facts unchanged. See reconciliation.md.                                                   |
| Artifact consistency/analyze         | PASSED PLANNING GATE | API/date/policy/refresh drift reconciled. Owner choices promoted and read-only analyze complete: 51/51 covered, 0 critical/high findings. See checklists/final-analysis.md; T004/T005 runtime gates stay open. |
| Runtime TDD                          | PARTIAL RED/GREEN    | Actual existing-boundary tests executed; SQL/races and full runtime gates remain open. See checklists/continuation-checkpoint.md and implementation-ledger.md.                                                 |
| Functional completion                | IN PROGRESS          | Bounded exclusions/metadata/canonical-contract slices applied; full stories, integration and T056–T058 remain open. See checklists/continuation-checkpoint.md.                                                 |
| Visual fidelity                      | NOT RUN              | Binding approved; required rendered T034/T049                                                                                                                                                                  |
| Accessibility evidence               | NOT RUN              | Separate T035/T050; screenshots insufficient                                                                                                                                                                   |
| Hosted policy/deployment             | NOT AUTHORIZED       | Separate later authorization; T059 only prepares handoff                                                                                                                                                       |

## Local continuation evidence — 2026-10-07

- Main synchronization: remote feature head
  d97146960593117e61797e65bca852cec6bc7fbf includes governing main
  2095ec061d531854603e8415122231f1cbf4c1a0. Only generated feature-context
  conflict required resolution; both Voice and SMS entries retained.
- T001 partial: correct sibling worktree/source/dependency junction and explicit
  feature prerequisite selection verified. Git Bash selects 389; generic Windows
  bash/WSL incorrectly selected 302 and is not valid evidence. Optional analysis
  Git hooks not run.
- T002 complete: owner approved both exact combined revisions and EN/AR copy on
  2026-10-07 in chat 01a11606-3a5e-7420-a9d7-0ea491bde802,
  call_3SOfr0FPm3RmUNgWIRuA5lS8 item 0. Both binding verifiers exit 0. Original
  image and Binding Facts bytes remain unchanged. See sidecars for immutable
  approval revisions and reconciliation.md for the approved copy. No UI
  implementation, rendered fidelity evidence or worker assignment.
- T003 complete: technical drift reconciled; structural checks confirm
  sequential 59 tasks, 36 FR + 15 SC rows exactly once with valid task IDs, and
  all three YAML contracts parse with resolving references. Owner approved
  deleting identities after 35 days on 2026-10-07: "let's delete the id after 35
  days, that's fine." The bounded guarantee is promoted into spec/plan/data
  model/research/API/business decisions and cleanup tests. Final read-only
  analyze completed after promotion: 51 requirements covered by the preserved 59
  tasks; 0 critical/high findings and one separate medium execution-evidence gap
  E1. See checklists/final-analysis.md for the report and analyzed input
  fingerprints. Both optional Git hooks were inspected and not executed. No
  production change; T004/T005 remain open.
- T004 partial: Docker lists local Monyvi Supabase database and Edge runtime.
  Deno is available at C:/Users/Mohamed/.deno/bin/deno.exe (2.9.7); Android SDK
  adb exists at
  C:/Users/Mohamed/AppData/Local/Android/Sdk/platform-tools/adb.exe. PATH
  aliases were unavailable; use verified paths. Both SDK adb and Droidrun report
  no connected device. No existing Voice Maestro files found. Native
  audio/provider-double/server-clock controls are not verified; missing-harness
  cases stay blocked. No database reset, seed, migration, provider call or
  device launch performed.
- T005 partial: first focused Jest command timed out at 60 seconds with no
  retained result; no pass inferred. Captured repeat exited 0: eight existing
  suites, 76 tests passed in 19.38 seconds. Native-module error console output
  belongs to the passing recorder failure-path test. Exact results:
  checklists/baseline-jest-results.json. Full command below. Transaction-create
  Maestro not run: no connected Android target and no verified active fixture
  Metro/harness. T005 remains unchecked.

```powershell
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --runTestsByPath apps/mobile/__tests__/services/ai-voice-parser-service.test.ts apps/mobile/__tests__/hooks/useVoiceTransactionFlow.test.ts apps/mobile/__tests__/hooks/useVoiceRecorder.test.ts apps/mobile/__tests__/components/fab/QuickActionFab.test.tsx apps/mobile/__tests__/components/tab-bar/CustomBottomTabBar.test.tsx apps/mobile/__tests__/app/add-transaction-account-selection.test.tsx apps/mobile/__tests__/app/add-transaction-recurring-name.test.tsx apps/mobile/__tests__/app/add-transaction-recurring-date-error.test.ts --json --outputFile specs/389-voice-usage-limits/checklists/baseline-jest-results.json
```

The evidence above records the completed planning phase. Planning publication is
now ac1ef5583656190d04f3d068a742d98f742085cf, synced with governing main. Later
owner-approved delivery/test-authoring and bounded native QA are tracked in
`implementation-ledger.md`. T001 identity and T004 feasibility assessments are
complete; the detailed manual-to-automation matrix and runtime blockers are in
`checklists/runtime-readiness.md`. Initial scoped Red evidence is in
`checklists/mobile-initial-red.md` and `checklists/server-initial-red.md`. T005
native baseline, remaining behavioral Red, complete quota/SQL Green and
visual/accessibility evidence remain unfinished.

## Owner-approved Voice motion R1 continuation — append-only (10 October 2026)

Owner approved `mockups/drafts/2026-10-10-voice-motion-r1/` five-image
concept/interaction proposal (“mockups approved”; “Approve the proposal”), as
recorded in `approval.json`; original manifest
`sha256:7d91150571a3150e235a1b8ec63327cff4c19de6c292927cde76c40024c1c799`,
proposal
`sha256:06e5e987543d85a2c90c57aaad695569ca904cc122571da47bae7195d2b9f4b0`. The
**derived** `mockups/voice-motion-binding-context.md` and
`checklists/voice-motion-coverage.md` map this _scoped_ approval. No second
binding approval/verifier is introduced. All five previously approved source
images, Binding Facts, combined revisions and prior T001–T059/history remain
unchanged. New requirements are FR-037–FR-042 and SC-016–SC-018. At original
planning time these seven additional tasks were **unchecked, not executed** and
did not imply assignment (historical planning state; current per-task status is
carried by each checkbox and the motion-slice evidence section below). Speckit
prerequisites, the five existing binding verifiers and read-only
`speckit.analyze` remain root-owned pre-implementation gates.

### Tests and runner-controllable E2E authorship before production

- [x] T060 [P] [US0] [US1] **Voice lifecycle Red**: Extend actual
      `apps/mobile/__tests__/app/add-transaction-modes.test.tsx`,
      `apps/mobile/__tests__/hooks/useVoiceTransactionFlow.test.ts` and
      `apps/mobile/__tests__/hooks/useVoiceRecorder.test.ts` (or focused
      companions) for immediate Starting/Cancel before every consent,
      authoritative-availability and native-preparation await; rapid duplicate
      taps, generation guards, Back/manual/cancel/unmount/account switch, actual
      recorder-start readiness/error propagation and timer start/pause,
      granted/unknown/missing/denied/revoked native permission, separate AI
      consent, direct recording-error retry, eligible unavailable auto-start,
      daily/burst/refusal fail closed and retained-audio same-key resubmission.
      Assert meaningful existing entry-point behavior Red, not invented modules,
      import failures, unavailable host/audio mocks or paid provider requests.
- [x] T061 [P] [US0] **Account-scoped dismissal Red**: Add focused
      `apps/mobile/__tests__/services/voice-examples-preference-service.test.ts`
      and route/ExamplesCard facade tests for whole-card immediate dismiss,
      localized accessible ≥48 dp control, per-authenticated-user/device
      persistence across remount/restart/theme/locale/sign-out/sign-in,
      cross-account isolation with delayed reads, repeat idempotence, corrupted/
      absent key default-visible and read/write failure. Prefer the existing
      local async-storage pattern without reusing global intro-seen keys or
      introducing Watermelon/Supabase sync. A missing proposed module is a setup
      blocker; tests target an approved existing boundary first.
- [x] T062 [P] [US0] [US1] **Motion/presentation Red + honest E2E authoring**:
      Extend current `VoiceTransactionEntry.states/layout.test.tsx`,
      `AddTransactionModeTabs.test.tsx`, EN/AR i18n and focused ExamplesCard
      tests for approved dark slate-700 allowance/examples badges, EN
      orange/blue/gold glyphs and Arabic quote-only rows, scoped daily-reset
      copy, Starting versus true loading, permission inline explanation, two
      staggered ~1.4-second decorative ripples with 700 ms offset, ~1.2-second
      activity bars and true timer, paused/resume/reduced-motion cleanup,
      ~1.6-second parsing waveform → receipt with exact copy, no parsing
      Skeleton/percent/fictional details, and responsive/RTL/dark/
      large-font/accessibility semantics. Author updates to existing
      `apps/mobile/e2e/maestro/voice/{add-transaction-modes,voice-recovery,voice-usage-limits}.yaml`
      only for honestly controllable user journeys; mark real OS permission,
      native recording, live provider/clock and account switching manual-only
      where no deterministic runner exists. **No device/E2E execution**.

### Implementation only after root accepts genuine Red

- [x] T063 [US0] **Voice transition/permission/retry implementation** after T060
      accepted Red: one exclusive Voice-interaction writer owns coherent route
      `app/(private)/add-transaction.tsx`, `useVoiceTransactionFlow`,
      `useVoiceRecorder`, native-permission readiness/explanation/recovery,
      actual-capture timer and generation/cancellation cleanup. Visible Starting
      precedes awaits; native preparation failures cannot leave false Listening.
      Preserve current first-use AI Processing Consent Sheet, request
      identities, one provider start, existing server quota gates, same-key
      retained submission retry, Manual and navigation locks.
- [x] T064 [US0] **Presentation and local preference implementation** after
      T061/T062 accepted Red: the same exclusive Voice writer updates the scoped
      Voice UI/EN-AR translations, user-scoped device-only preference
      service/facade and cancelable Reanimated motion (or static reduced-motion
      variants). Reuse existing 104/140/172 dp geometry, 48 dp interaction
      minimum, `AllowanceCard`, `ExamplesCard`, current Ionicons and registered
      tokens; avoid altering Manual B/TypeTabs/financial fields, fake volume or
      fabricated parsed details.
- [x] T065 [US0] [US1] **Integration and review** after T063/T064: root/local
      successor runs focused and combined actual Jest/integration Green,
      TypeScript/lint/i18n and governed Git checks at bounded checkpoints,
      retains financial/provider/quota/35-day replay positive controls, and
      obtains independent TypeScript → logic → style → coverage/security (if
      touched) review. A flaky/unavailable native runner is not a passing test.
- [ ] T066 [US0] **Owner evidence and final handoff** after accepted source:
      run/record existing five binding verifiers, approved motion source
      fingerprint verification and exact rendered side-by-side/overlay at
      baseline 390×844 dp plus compact320×640, tablet768×1024, landscape844×390,
      EN/AR, light/dark, font scale1.35/2; capture actual native
      permission/Starting/motion/retry/time/device-account/cold-restart journeys
      and separate screen-reader/accessibility-tree proof. Existing
      T034/T035/T049/T050 and visual/accessibility T058 **remain unchecked / NOT
      RUN** until owner provides evidence. If a source/visual mismatch
      materially exceeds approved facts, return to owner approval rather than
      generate or edit original mockups. No hosted deployment/PR/merge authority
      transfers with this task.

### Motion-slice status and execution evidence (append-only, 11 Oct 2026)

- **Red chronology preserved:** T060/T062 were genuine lifecycle/motion Reds
  authored against existing entry-point boundaries. T061's initial
  missing-module probe was a structural setup failure, not a behavioral Red; the
  behavioral dismissal Red came from the existing-route companion, which root
  accepted at 6 failed / 1 passed / 0 runtime errors **before** preference
  restoration and route wiring; that acceptance is Red only.
- **T060-T064 complete** for authored tests and implementation. Coverage
  exceptions remain explicit in `checklists/voice-motion-manual-plan.md`: all 37
  scenarios keep their unit/E2E/manual mapping; device, visual,
  accessibility-tree, live-provider and native-recording journeys stay
  manual-only.
- **Executed unit evidence (root publication batch, 11 Oct 2026):** 25 suites /
  368 tests all PASS with zero runtime errors; full mobile `tsc` exit 0;
  changed-file ESLint exit 0 with 6 warnings (not zero warnings); all 10 binding
  verifiers PASS; approved R1 original manifest, proposal and 5 PNG hashes
  unchanged.
- **Commit hooks DONE:** source commit
  `b4934f9f3a204cb436c8644805af960b7c22f9fb` carries actual ESLint/prettier/i18n
  hooks PASS with 34 file hashes unchanged; worker branch push/privacy PASS.
  Compiled native-prop unit checks were executed by root.
- **T065 source/unit/type/lint/review portion COMPLETE (checked above).**
  Corrected 2 suites / 66 tests ALL PASS, 0 runtime errors at 06:54:10Z;
  combined 25 suites / 371 cases final pass = original 23 suites / 305 tests +
  corrected 2 / 66. The original batch was 369 pass / 2 new harness failures;
  the fixes were translation-key and uncapped-ancestor-traversal corrections
  only - no weakened assertions. Full type/lint final rerun: lint PASS at
  06:55:35Z with 6 warnings; full type check PASS at 06:56:20Z. The independent
  native reviewer's conditional acceptance is now satisfied (corrected
  source/tests ACCEPTED, no additional findings). Review routing history
  retained: Normal review + bounded recovery ended in systemError with no
  artifact; OpenCode request failed 403 FreeTier; Gemini known 401; justified
  native independent review produced the two findings (accessibility + YAML
  comment) that were corrected. **Still pending under this task's publication
  portion:** root final commit/push and PR with exact CI. Remaining tracked
  separately, not part of this source/unit slice: owner device/manual evidence
  (T066), live server quota/clock QA and any server/SQL work. No deployed
  changes.
- **T066 remains unchecked / NOT RUN:** device renders, side-by-side/overlay
  proof, native permission/Starting/recording/retry journeys and separate
  screen-reader/accessibility-tree capture are owner-only. Maestro E2E remains
  AUTHORED / NOT RUN (no emulator execution in this slice).
- **Delivery identity (no false claims):** source worker identity Normal ->
  OpenCode -> Gemini (401) -> authorized native source fallback; OpenCode ran
  bounded test/E2E authoring parts only. No physical-device, rendered or
  live-provider verification and no remote CI result is claimed by this entry
  (compiled native-prop unit checks above were executed by root). T001-T059 and
  all historical evidence are preserved unchanged.

### Append-only requirement and evidence coverage

| Requirement / success criterion                              | Motion tasks (original tasks retained)             |
| ------------------------------------------------------------ | -------------------------------------------------- |
| FR-037 scoped idle badge/colors/copy                         | T062, T064, T066                                   |
| FR-038 per-account device-local dismissal                    | T061, T064–T066                                    |
| FR-039 Starting/native readiness/cancel/duplicate prevention | T060, T063, T065                                   |
| FR-040 recording/parsing/reduced-motion                      | T060, T062, T064–T066                              |
| FR-041 native-permission inline + retained AI consent        | T060, T062–T063, T065                              |
| FR-042 direct/identity-safe/eligible retries                 | T060, T063, T065                                   |
| SC-016 Start/retry gates                                     | T060, T063, T065                                   |
| SC-017 durable scoped dismissal                              | T061, T064–T066                                    |
| SC-018 scoped motion visual/a11y evidence                    | T062, T064–T066, existing T034/T035/T049/T050/T058 |

The 37 manual → unit/integration → honestly controllable Maestro → owner-only
evidence scenarios are maintained in `checklists/voice-motion-coverage.md`. That
matrix does not add an extra approval gate or claim any executed tests, device
checks, audio, live provider, hosted quota or rendered evidence. #384 stays
separately deferred. No new commercial entitlement/SQL/migration/sync/finance
work is authorized.

## Owner-approved Voice controls R2 continuation — stable task IDs (11 October 2026)

The owner approved `mockups/voice-controls-r2-green-gray-proposal.png` (“latest
mockups approved”). Published image-only base
`b00b7ae07a7f75008f21ff2c9f8680f735153901`, Git blob
`caceb8d1cade9e4e9c574e95fc0e603a39e766de`, SHA-256
`3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281`, 1832×858
image pixels, 1470108 bytes verified locally. R2 exact 15-key sidecar and
computed revision tuple were accepted on 2026-10-11 under delegated root
authority (prior metadata
`sha256:78105dbc1254cb508429f417cf5e26c71324364c7e4e74447f7249735f282a0e`,
combined
`sha256:d06cfdf4f6bbc8c3bd7f12b5129115206a31c7f3c1dfb4a266977456252caa14`, both
superseded by the faithful Color/theme facts refinement); current approved
metadata
`sha256:72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b` and
combined
`sha256:71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77` from
the official verifier; do not claim a separate owner SHA approval. T068 was
completed on 2026-10-11 (see actual gate receipt below): final canonical binding
verification authoritative, correct-feature prerequisites exit 0, read-only
Speckit analysis recorded.

These T067–T074 update in place: existing T001–T066, R1 and original
source/approval/evidence history are preserved unchanged. In particular,
**preimplementation read-only Speckit analysis MUST precede T069 Red and
T070/T071 production**; independent T073 review is afterward.

- [x] **T067 [P] [US0] R2 planning correction:** reconcile FR-043–FR-047 and
      SC-019–SC-022, owner-approved third completed panel, stable physical
      controls/Arabic labels, local 30 s cap, R1 precedence, verified image
      source identity, honest server #391 boundary, one-permission and
      first-Manual-mount latency plan, binding context, manual-to-unit/E2E
      matrix and owner-only evidence. No source/test/E2E work authorized by
      T067.
- [x] **T068 [US0] R2 exact binding verification AND PREIMPLEMENTATION Speckit
      gate (blocking):** root verifies SHA-256 of exact R2 PNG and new official
      15-key Binding Facts, computes/checks official metadata and combined
      revisions, documents delegated lead approval of exact revision (not
      fabricated owner review), and requires the binding verifier PASS. **AFTER
      binding acceptance and BEFORE any T069–T071 work**, root runs
      correct-feature
      `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks`
      and the canonical `.claude/commands/speckit.analyze.md` **READ-ONLY** on
      final spec/plan/tasks, resolving critical/high findings. Do not wait until
      T073 to analyze. **Actual receipt (2026-10-11):** root ran public
      `inspect-r2-binding-admin.js` (authoritative true, errors []),
      correct-feature prerequisites `--json --require-tasks --include-tasks`
      with SPECIFY_FEATURE=389-voice-usage-limits (exit 0, FEATURE_DIR
      `/e/Work/My Projects/Monyvi-issue347-ui-fidelity/specs/389-voice-usage-limits`),
      and canonical read-only `speckit.analyze`: 47 FR + 22 SC = 69 entries, 74
      unique tasks, 100% PLANNED traceability, 0 critical, 0 high, 0 ambiguity,
      0 duplication, 0 unmapped; V1 MEDIUM owner-only native/ rendered/a11y
      evidence NOT RUN (not a before-code blocker); S1 LOW superseded draft
      status. Approved tuple image
      sha256:3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281,
      metadata
      sha256:72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b,
      combined
      sha256:71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77.
      Source/tests/E2E remain NOT STARTED.
- [x] **T069 [P] [US0] R2 deterministic behavioral Red + honest E2E authoring:**
      add actual recorder/flow/presentation/route/i18n tests for three panels
      (Recording, Paused, **Recording complete / التسجيل مكتمل**), fixed
      physical LEFT Submit green / CENTER Pause-or-Resume gray / RIGHT Discard
      red, **cap-disabled gray Pause and no Resume**, slash `elapsed / 00:30`
      and `00:30 / 00:30`, no helper sentence, removed ordinary filled halos
      with R1 recording waves retained, reduced motion, 30 s **active-time**
      auto-stop/URI retention/no provider work and
      cap/action/cancel/unmount/account races. Also prove the **one fresh
      just-in-time native permission** check with typed actor-safe
      missing/blocked/unknown/granted response and approved inline recovery,
      valid consent and quota checks, plus **Voice-first deferred first Manual
      mount** with Manual-form draft persisting after first selection. Maintain
      positive denied/revoked, second user, request identity, Manual
      Save/transfer/recurring and original daily/unavailable cases. E2E
      _authorship_ only for controllable fixtures; native audio/provider/OS
      permission/rendering stays manual-only. Missing module/test setup is
      structural, not Red.
- [x] **T070 [US0] Recorder/flow/route 30 s + single-permission repair only
      after accepted Red:** update named active-capture cap to 30 s;
      auto-stop/finalize once and keep file/URI for explicit Submit or Discard;
      no provider, review or quota consumption at cap. Preserve native **300 ms
      post-record stabilization**, early stop/pause coordination,
      generation/user-scope/consent/quota gates, request identities, same-key
      retry, and native record-before-Listening rule. Consolidate route/flow's
      redundant native permission reads into **one just-in-time** typed,
      generation/actor-safe result; render approved inline permission prompt
      only for genuinely missing grant, request OS permission only from explicit
      action. Do not alter availability transport or in-flight refresh
      coordination.
- [x] **T071 [US0] R2 UI + narrow Voice-first Manual mount only after accepted
      Red:** render fixed physical three-control order and approved
      green/gray/red treatments (Arabic Submit **إرسال**); explicit third panel
      **Recording complete / التسجيل مكتمل** at `00:30 / 00:30` with enabled
      Submit/Discard, **disabled gray center Pause**, no Resume/waves/helper;
      active and paused clocks `elapsed / 00:30` and no helper. Remove only
      ordinary filled halos while keeping R1 ripples and existing
      daily-limit/unavailable disabled graphics. Defer initial hidden
      `ManualTransactionEntry` mount on direct Voice-first route, then latch
      mounted once Manual selected across safe mode switches to retain draft,
      calculator focus, Save/transfer/ recurring semantics; initial Manual route
      unchanged. Preserve ≥48 dp actions, Arabic physical positioning, dark/RTL
      and responsive/reduced-motion contracts. No other Manual edits.
- [x] **T072 [P] [US0] Batched integration/Green:** root runs actual
      focused/combined Jest, TS, lint/i18n, hook checks and retained
      R1/Manual/consent/quota/retry/cancellation positive controls. Source-only
      review is not device performance or native proof.
- [x] **T073 [US0] Independent POSTIMPLEMENTATION review:** after accepted
      T070/T071 source and T072 checks, reviewers assess TypeScript, logical
      race/idempotence and actor/cancellation, accessibility and NativeWind
      binding, regression/QA and security if touched. Resolve findings. This
      cannot replace the mandatory earlier T068 read-only Speckit gate.
- [ ] **T074 [US0] Owner device/render/accessibility evidence:** verify true 30
      s active-native capture, cap/Submit/Discard races,
      consent/permission/availability, screen-reader and full
      390×844/320×640/768×1024/844×390, EN/AR, light/dark, font1.35/2,
      reduced-motion states and third completed panel with separate
      native/display/a11y evidence. Measure navigation and start-stage elapsed
      time separately; make no unmeasured 1–2 s promise. #391 server and
      empty/speechless research is independent. Device/Metro/E2E/provider NOT
      RUN by this planning worker.

## 2026-10-11 R2 final implementation and root execution receipt

**Current status superseding the historical pre-code "NOT STARTED" text above:**
T069–T073 are complete at the tested source level; T074 remains **UNCHECKED /
OWNER MANUAL NOT RUN**. The original T001–T068, earlier Red, R1, Speckit and
approval histories remain intact. This documentation writer did not run checks
or approve device/UI rendering.

| Task                                                   | Root-accepted outcome and provenance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T069 [x] — meaningful Red, safe Maestro authorship** | Actual RED: UI **5 suites, 50 failed / 92 passed / 142 total**; initial recorder **12 failed / 68 passed / 80 total**; actor/stop generation **2 failed / 16 skipped / 18 total**; typed permission/cap failure **18 failed / 133 passed / 151 total**; automatic failed-cap cleanup **2 failed / 19 passed / 21 total**. The distinct failures were subsequently repaired. Three safe Maestro scripts authored but **NOT EXECUTED**.                                                                                                                                                                                                                                                         |
| **T070 [x] — recorder/permission/flow**                | Published recorder final `2552577f499abc9019fc6a3c1f16416d8304b2ea`, recorder production `bb64e19f5a811bafb0ec8920e5d1bd92130679ff` and UI/flow source pin below. 30,000ms **active** cap, fraction-preserving pauses, one native finalization, URI held for explicit Submit/Discard, no auto-provider; native record-onStarted/300ms stabilization, one fresh consent/quota-gated microphone check, typed same-native-OS-request result with boolean compatibility, actor and same-key replay guards. Failed cap Stop/null URI uses existing error feedback; partial URI captured before native release, release before async filesystem delete, no stale replacement release or extra Stop. |
| **T071 [x] — three panels/Manual mount**               | UI final published `34a698fdfb3496dcb559a4dab4adeff9151c110b`. LEFT filled green Submit, CENTER outlined gray Pause/Resume (disabled Pause at completed), RIGHT outlined red Discard; physical order holds in EN/AR. Scoped native 14px text (not inherited rem), 22px line-height, semibold labels, 20dp glyphs, ≥48dp targets. Ordinary filled halos removed, 104dp circle clipping/R1 waves retained, daily/unavailable graphics unchanged. Voice-first hidden Manual deferred until selected, then mounted to preserve draft; default Manual and Save remain.                                                                                                                             |
| **T072 [x] — root actual combined Green**              | Final staged **25 suites / 390 tests ALL PASS (30.777s)**; mobile `tsc --noEmit` **PASS**; `git diff --check` **PASS**; root `npx lint-staged` (19 TypeScript / 2 JSON across 24 staged files) **PASS**; configured `.husky/_` precommit ESLint `--fix`/Prettier **PASS**; i18n key parity, Arabic sanity and hardcoded-string checks **PASS**. An earlier direct `.husky` attempt failed on Windows (missing shebang); correct configured shim later succeeded **without hook bypass** or assertion-changing formatting. Tested tree and posthook tree exactly `7f0dca9a886d452ca937464764fdcee4e1450dfd`.                                                                                   |
| **T073 [x] — independent read-only review**            | Root, independently of both implementing writers, reviewed **TypeScript/async → logic → style/architecture → security/performance → coverage → source binding**. Resolved native font 12.25dp vs approved 14, same-response OS denied/blocked/unknown, cap Stop failure and eager native release/known partial-URI cleanup, new-start cleanup barrier, actor/stop-generation safety, recorder-specific timer test (not Jest/React aggregate queue), stale-Start release-first test oracle. No remaining actionable **source** blocker after final checks. This is **not** owner visual/device acceptance.                                                                                     |
| **T074 [ ] — owner manual evidence**                   | **NOT RUN:** native capture/OS sheets, real provider/paid requests, actual 30s audio boundary, rendered responsive/EN/AR/dark/text1.35/2, accessibility screen reader, reduced-motion native, keyboard, true cold/warm stage timings or Maestro execution. See `checklists/voice-controls-r2-manual-plan.md`.                                                                                                                                                                                                                                                                                                                                                                                 |

**Root's exact executed unit command:**

`npm run test -w @monyvi/mobile -- --runInBand --testPathPattern='(add-transaction|AddTransaction|CalculatorKeypad|ManualTransactionEntry|TransferFields|TypeTabs|VoiceTransactionEntry|useVoice|voice-review-navigation|voice-usage-limits|ai-voice-parser-service|AiProcessingConsentSheet|tab-layout-ai-consent)'`

**Publication boundary:** Root's integrated commit
`df00c9e3d4c9ca624d55935b9bf3f5d3364be7ce` is **LOCAL ONLY, NOT YET ON GITHUB**.
It has tree `7f0dca9a886d452ca937464764fdcee4e1450dfd` and parents
`0396159f448a9298f9b241afae027543e0ec6b52`, UI
`34a698fdfb3496dcb559a4dab4adeff9151c110b`, recorder
`2552577f499abc9019fc6a3c1f16416d8304b2ea`. Do not infer published remote CI.
Root executed `npm run qa-sms:privacy-check`: **PASS** for the
source-integration range BASE `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e` → HEAD
`df00c9e3d4c9ca624d55935b9bf3f5d3364be7ce`. The final post-documentation
publication guard remains **PENDING**, as do the feature push and new
feature-head CI. No feature push or remote CI is claimed.

**Exact existing binding tuple, unchanged:** root official verifier
`isAuthoritative: true`, `errors: []`; image SHA-256
`3c1d098090cfac539c834634f2dfb1db29dc75b8afc9f479d61d17af09680281`, Binding
Facts `72459993f2d82fe128fd9d64ce83c9646e60edef5e1f2d187f42354a48158c2b`,
combined `71906e40d73448a0767df14954bf7f1a239126dc894a64dbbe227e191f549a77`. The
**preimplementation** T068 READ-ONLY analysis (47 FR + 22 SC = 69 requirements,
74 tasks, 100% **PLANNED** mapping, 0 critical/high) is historical and not rerun
here.

**Maestro boundary:**
`apps/mobile/e2e/maestro/voice/add-transaction-modes.yaml`,
`voice-recovery.yaml` and `voice-usage-limits.yaml` each passed root's Prettier
`--check` but are **AUTHORED / NOT EXECUTED**, never evidence of actual audio,
native OS permission, paid provider or E2E timing. See the 35-row source-backed
execution map in `checklists/voice-controls-r2-coverage.md`.

**Not included:** R229 server-side 30s/empty/speechless rejection is **NOT
IMPLEMENTED** (#391 separate research/harness, no native measurements). #384
reservation/recovery UX remains deferred; 35-day replay semantics unchanged.
R235 cold/warm latency is **UNMEASURED**; no 1–2s promise.

## Voice startup optimization continuation — stable task IDs (12 October 2026)

This append-only sequence preserves T001–T074 and every R1/R2 approval/evidence
record. Source baseline is
`f625183373e29d372b658c10b3848a217477400a`. Duplicate availability-hook
instantiation was investigated and disproven: route owns the one hook and the
flow consumes it. The source-proven performance targets are same-context
in-flight refresh restart churn and the serial availability/permission reads
after fresh consent.

- [x] **T075 [P] [US0] Startup S1 planning/reconciliation:** audit route, flow,
      availability, recorder-read-only and authenticated-edge boundaries;
      reconcile FR-048–FR-052 / SC-023–SC-027; define same-context in-flight
      coalescing, post-consent safe concurrency, privacy-safe monotonic timing,
      deterministic test matrix and owner manual plan. No source/tests/device/
      provider/deploy work in T075.
- [x] **T076 [US0] Blocking root prerequisite + read-only Speckit acceptance:**
      root runs the correct-feature prerequisite command and canonical
      `speckit.analyze` on the final spec/plan/tasks, confirms no
      critical/high constitution/security/coverage conflict and explicitly
      accepts the startup plan before T077. GitHub planning worker's semantic
      analysis is advisory because it cannot execute repo shell prerequisites.
      T076 root receipt: correct-feature prerequisite PASS; canonical read-only
      Speckit analysis completed with complete new-requirement mapping and
      critical/high findings = 0. Native Git branch/tree/ancestry was
      independently verified after the WSL branch check was skipped; optional
      analyze Git hooks were not invoked.
- [ ] **T077 [P] [US0] Deterministic startup Red:** author one focused
      `useVoiceAiAvailability.startup.test.tsx` plus bounded additions to
      `useVoiceTransactionFlow.startup.test.ts` and
      `app/add-transaction-modes.test.tsx`. Prove same-context concurrent
      refresh/focus/foreground joins one service call; different actor/timezone/
      context cancels; failed/aborted work clears; consent completes before
      concurrency; availability + non-prompting permission are simultaneously
      in flight; blocked availability never opens OS permission; eligible
      explicit permission recovery remains; duplicate/cancel/account/native-start
      and same-key retry positives stay intact. Test setup/import failures do not
      count as Red.
- [ ] **T078 [US0] Availability coalescing implementation after accepted Red:**
      update only `hooks/useVoiceAiAvailability.ts` to join one unresolved
      same-user/same-timezone/current-context request. Preserve fresh server
      response per attempt, owned-state generation guards, lifecycle/auth
      cancellation, authoritative reconciliation and error mapping. No TTL/cache,
      service/auth/server change.
- [ ] **T079 [US0] Post-consent startup concurrency + optional safe timing after
      accepted Red:** update only `hooks/useVoiceTransactionFlow.ts` and, if
      needed for stage orchestration, `app/(private)/add-transaction.tsx`.
      Keep fresh consent first; then overlap authoritative availability with the
      non-prompting native permission read. Prompt the OS only from the existing
      explicit action after eligible availability. Preserve actor/generation,
      request identity, retry semantics, recorder `onStarted` truth, 30 s cap
      and 300 ms post-record stabilization. Timing logs, if added, contain only
      stage/duration and optional ephemeral attempt correlation.
- [ ] **T080 [P] [US0] Batched Green/regression gate:** root runs the focused
      startup tests plus retained Voice/R2/Manual/consent/quota/retry/cancellation
      suites, full mobile TSC, changed lint/format/i18n/privacy checks. Existing
      `authenticated-edge-function-service.test.ts` remains a positive control
      for stable-session and 401 behavior. No device/performance claim from unit
      Green.
- [ ] **T081 [US0] Independent postimplementation review:** independently review
      TypeScript/async ordering, same-context promise lifecycle, abort/actor
      safety, explicit permission semantics, auth/security preservation,
      no-Listening-before-record, request identity and test assertion strength.
      Resolve actionable findings before integration.
- [ ] **T082 [US0] Owner manual/native startup evidence:** on owner device,
      capture separate cold/warm stage durations and validate granted/missing/
      denied/blocked/revoked permission, slow/offline availability, rapid taps,
      Back/Manual, foreground/background, account switch and unavailable retry.
      Confirm actual capture starts only at native `record()`, the 300 ms
      post-start stabilization does not delay Listening, and no provider call is
      made before Submit. Device/Metro/Maestro/provider execution is NOT RUN by
      this planning worker.
- [ ] **T083 [P] [US0] Consent-transition freshness Red:** add the bounded
      route/startup assertion that a successful first-use consent grant passes
      an explicit supersede marker into the flow so a pre-consent pending
      availability request cannot be joined. Preserve the already-consented
      control (normal pending coalescing), completed-snapshot non-reuse and
      consent revocation/fail-closed semantics. T083 is a blocking Red alongside
      T077 before T078/T079; it does not renumber or change T075–T082.

### S2-FIX root RED classification and repaired test-contract handoff (12 October 2026)

Root tested exactly startup branch `aea6e6526058359ac739a4571634669a837c14b8`
with separate focused verbose runs: availability **2F/8P/10 (3.122s)**;
flow **5F/3P/8 (1.865s)**; route modes **2F/33P/35 (5.549s)**.
The initial combined command timed out at 60s. Coalescing, simultaneous
permission/availability and first-use consent supersede failures are genuine
RED. The unavailable-retry `ReferenceError` only reflects an omitted test
import of `mockVoiceAvailabilityRefresh`, already exported in route fixtures
at line 666, and is **NOT accepted RED**.

T077/T083 remain **UNCHECKED pending root's repaired meaningful RED**;
T075/T076 and all T001–T074 historical completion flags/approvals remain
unchanged. The bounded follow-up grants **only test writing** in:
- `apps/mobile/__tests__/app/add-transaction-modes.test.tsx` — import
  the existing exported refresh mock and put new deferred fixture resolutions
  in RNTL `act` without weakening the one-refresh/fresh-snapshot test;
- `apps/mobile/__tests__/hooks/useVoiceAiAvailability.startup.test.tsx` —
  verify public `refresh({ supersedePending: true })` explicitly replaces a
  matching pre-consent in-flight request, and two joined callers return `null`
  after blur/background/unmount, with no late stale result;
- `apps/mobile/__tests__/hooks/useVoiceTransactionFlow.startup.test.ts` —
  require separate `availability`/`permission` plus combined
  `availability_permission` and `native_start` numeric monotonic telemetry
  stages; `voice.startupTiming` payload is exclusively `{ stage, durationMs }`;
  an optional logger failure cannot prevent eligible native capture.

The existing `useVoiceTransactionFlow.test.ts` and its retained same-key
assertions are **read-only**. No production/startup source edits yet;
#391 recorder/filesystem source/tests/docs are frozen separately. Root must
accept focused repaired RED before T078/T079 and owns eventual T080 final
batch, independent review and owner native/manual checks.
