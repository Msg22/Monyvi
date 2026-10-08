# US6 Dispose coverage

## Historical evidence (pre-PR336)

Status at implementation head
`f02945993e8a67d6920cb7cd4ea2ab19547b0401`: isolated deterministic Green.
Hosted Code Quality & Tests, Financial Action pgTAP, and Android Build
Verification passed; Android E2E was skipped. The shared production route,
terminal-rate loader injection, translations, runner-controlled offline
fixture, Maestro, and device fidelity were open on that head.

## Current state (PR336, tests-first authoring only)

Status at implementation head
`947dfb3631ddb91830584c72d639c608e09376e0`: the production route, scoped
terminal-rate loader, `dispose.*` translations, Maestro journey, and detail
No Longer composition are authored tests-first with Red/Green execution
explicitly deferred to the final pre-push batch by lead direction. The
Maestro journey is authored but BLOCKED (no supplied disposable holding
fixture, no registered dispose deep link, no runner-controlled offline
profile). No new local verification is claimed by this documentation update.
Device fidelity and the offline/two-device profiles remain open.

| Manual | FR / SC | Deterministic automation | Maestro / manual | Current evidence |
| --- | --- | --- | --- | --- |
| D01–D02 | FR-025, FR-033, FR-036, FR-068, SC-020 | `metals-dispose.test.tsx`: exact catalog, direct form, required reason, focus | Manual until the shared route and fixture exist | Green: component/hook |
| D03–D08 | FR-033–FR-036, SC-020 | service mapping/consequence cases plus form conditional-summary cases | Manual user-visible summary fidelity | Green: exact category IDs, six canonical reasons, and summaries |
| D09 | FR-033, FR-067 | SQLite null/Unicode evidence test | Manual Unicode keyboard fidelity | Green: deterministic persistence |
| D10 | FR-036, FR-039, FR-063–FR-065, FR-091–FR-098, SC-002, SC-007, SC-027–SC-030 | SQLite exact group/state/revision/history/no-account test, including predecessor-less revision zero, full lifecycle/action-root reduction, verified legacy-disposal baseline reduction, and a compensated reconciled Delete root treated as rejected CAS evidence on a restored Active holding | Manual offline journey until a controllable offline fixture exists | Green through the production registry and command service |
| D11–D12 | FR-039, FR-073–FR-080, SC-015–SC-016 | hook duplicate-submit lock and retained-command retry; displayed/acknowledged terminal pair, command object, IDs, values, and freshness remain pinned across ambiguous operational retry; repository batch rollback/retry | Manual operational retry with visible/committed evidence comparison | Green: deterministic hook/repository; device open |
| D13 | FR-040–FR-043, FR-047, FR-075, FR-094, SC-003, SC-010, SC-011, SC-023 | SQLite replay/payload mismatch/service recreation; unsuccessful recovery-root rejection; terminal rate references rolled back with the failed group and replayed without duplication | Manual process restart after route integration | Green: deterministic replay; process-level proof blocked |
| D14 | FR-061–FR-062, FR-073–FR-075, FR-092–FR-093 | active-only/stale-revision/foreign-user/non-effective-projection/UUID-boundary tests plus terminal rate evidence: registry snapshot-pair acceptance/rejection cases, exact `metal_rate_references` persistence, reference-id stability, instrument-context rejection, disposal-date-keyed reloads, injected-clock current-freshness acknowledgment gating, shaped per-reference freshness/provenance display, and a distinct terminal-rate-store failure that blocks submission until a successful reload | Manual multi-account transition and device acknowledgment fidelity | Green: deterministic fail-closed paths and FR-073–FR-075 capture |
| D15 | FR-066–FR-072, FR-077–FR-079, SC-013, SC-022, SC-024 | screen safe-area/RTL/theme/shared-breakpoint/text-scale/accessibility tests, individually accessible radio choices, focus on validation and operational submit failures, and localized command-failure/date/acquisition-boundary messages | Manual device fidelity gate | Green: component contract; device open |
| D16 | FR-080, FR-086 | pending dismissal contract; dirty-exit callback contract | Manual shared-shell guard integration | Partial: component/hook only; route open |
| D17 | FR-034–FR-036, FR-040–FR-047, FR-091 | exact consequence object and immutable state/event/evidence assertions, including a verified revision-zero legacy disposal that remains readable in detail and History | Manual integrated portfolio/detail/history/reporting | Green: story evidence; downstream integration open |
| D18 | FR-054–FR-055, FR-075 | hook partial-date/loading, changed-evidence acknowledgment, and clock-boundary timer tests; screen pending-button contract | Manual date keyboard focus and open-form trust fidelity | Green: deterministic hook/screen; device open |
| D19 | FR-033, FR-067, FR-092 | hook UTF-8 byte validation plus notes field and summary feedback test | Manual Arabic/emoji entry and TalkBack/VoiceOver | Green: deterministic hook/screen; device open |
| D20 | FR-073–FR-080 | hook revision-conflict test discards the old command, reloads holding plus rates, resets acknowledgment for changed evidence, and submits a new action with the refreshed revision and exactly the newly displayed pair | Manual two-device conflict/reload with displayed/committed evidence comparison | Green: deterministic hook; device open |
| PR336 route/loader/i18n (authored, runs deferred) | FR-025, FR-033, FR-036, FR-053–FR-055, FR-058, FR-061–FR-065, FR-068, FR-072–FR-080, FR-086, SC-020 | `dispose-action.test.tsx`: stable descriptor, trimmed id, empty-id rejection; `dispose-metal-holding-read-model.integration.test.ts`: scoped SQLite holding load, terminal/foreign/non-effective fail-closed, today-pair with actual dates, backdated provider-date filtering, unknown-date omission for history, missing-leg `[]`, USD exact identity, `rate_store_unavailable`, ambiguous-batch skip, capture-incoherence skip, provider-over-fixture precedence with fixture fallback, loader-to-command commit; `metals-dispose-route.test.tsx`: missing/blank-id error with no facade invocation, toast-to-Details coordinated after guard disable with no post-save prompt, duplicate/in-flight/submit locks, explicit-Cancel and native-back Keep/Discard paths, pending-submission block, stable facade dependencies across re-renders, account-switch fail-closed with no submit surface; `metals-detail-dispose.test.tsx`: active Dispose+Delete with Edit preserved, terminal/locked fail-closed; `dispose-rate-presentation.test.tsx`: grouped exact values, no provider/quality identifiers, unknown observation label; `dispose-holding.yaml`: authored category/Other/duplicate-tap/restart contract, BLOCKED on fixture/deep-link/offline profile | Manual device/offline/two-device gates until the pre-push batch runs these suites | Authored only; no pass claimed |

## Verification evidence

### Historical (pre-PR336 runs; kept, not re-claimed)

- Focused Jest (mobile Dispose suites, exact names):
  `npm test -w @monyvi/mobile -- --runInBand __tests__/app/metals-dispose.test.tsx __tests__/hooks/useDisposeMetalHolding.test.ts __tests__/hooks/useDisposeMetalHolding.rates-and-retry.test.ts __tests__/services/dispose-metal-holding-command-service.test.ts __tests__/services/dispose-metal-holding-command-service.rates.test.ts __tests__/services/metal-legacy-disposal-baseline-read-model.test.ts __tests__/services/metal-detail-history-read-model.test.ts`
  → `7` suites / `98` tests passed.
- Focused hook verification after the retry-evidence split:
  `useDisposeMetalHolding.test.ts` plus
  `useDisposeMetalHolding.rates-and-retry.test.ts` → `2` suites / `20`
  tests passed.
- Focused Jest (adjacent main-contract suites, exact names):
  `npm test -w @monyvi/mobile -- --runInBand __tests__/services/metal-terminal-read-model-service.test.ts __tests__/services/metal-disposed-evidence-service.test.ts`
  → `2` suites / `39` tests passed.
- Focused Jest (logic suites, exact names):
  `npm test -w @monyvi/logic -- --runInBand src/metals/__tests__/lifecycle-reducer-contract.test.ts src/financial-actions/__tests__/metals-action-payloads.test.ts src/metals/__tests__/rate-reference-contract.test.ts`
  → `3` suites / `109` tests passed.
- Focused coverage (isolated feature run, base `a190d8f`, recorded in
  `evidence/us6-green.md`): `96.82%` statements, `91.2%` branches, `97.56%`
  functions, `98.57%` lines across the Dispose service, hook, and component. The
  command service is `98.83%` statements, `95.34%` branches, `100%` functions,
  and `99.4%` lines.
- Focused ESLint on the touched TypeScript sources/tests: `0` errors and `11`
  pre-existing warnings.
- Prettier check/write: all owned files formatted.
- Mobile and logic typechecks pass.
- Maestro: no runnable Dispose flow is claimed. The shared holding-detail route,
  current-user fixture, and runner-controlled offline state do not exist in this
  branch, so the earlier speculative YAML was removed instead of fabricating a
  passing signal.
- PR336 correction wave 2 (authored only, runs deferred): route split into a
  no-facade invalid-ID shell plus an auth-gated valid-ID form (Skeleton until
  the private-shell identity resolves; stale async submit completion never
  toasts or navigates after unmount/account switch); detail `[id].tsx`
  whitespace-param normalization with guarded action creation; loader batch
  capture coherence, ambiguous-batch skip, and provider-over-fixture
  precedence; `dispose-rate-presentation` via the shared canonical decimal
  primitive (metal two-decimal display, truthful direct/inverse FX units,
  explicit historical year, Western digits); approved-12 composition in
  `DisposeMetalHoldingScreen.tsx` (reason icons, selection radio, treatment
  descriptions, shared date-picker pattern, required markers, summary check
  icons, outlined Cancel); `dispose.whatHappened/affectsRecords/treatments`
  description EN/AR keys. No Jest/tsc/lint/Maestro run is claimed.
- PR336 correction wave 3, consolidated FINAL (authored only, runs deferred):
  mock-factory scope fixes via lazy requireActual boundaries; new Dispose
  production hook (lifecycle/delegation only) plus production service adapter
  (database binding and command-factory composition) so the route connects
  facade/render/navigation with no raw DB access; presentational extraction to
  `dispose-form-presentation.tsx` (screen back under the 900-line max,
  behavior/testIDs unchanged); removed the repeated selected-reason summary
  row and the duplicate outer Date label, keeping TextField's standard
  required label; narrowed test/production types with no arbitrary casts.
  No Jest/tsc/lint/Maestro run is claimed for these files; Prettier
  application stays with final pre-push integration.

## Current state (final-prepush wave: production-complete, verification pending)

- Production is complete for the Dispose slice: route + child form split,
  auth-gated Skeleton, stable facade dependencies, effect-coordinated
  post-save navigation, pinned user fail-closed, scoped loader with canonical
  validation/coherence/ambiguity-skip/fixture precedence, approved-12
  composition, complete `dispose.*` EN/AR resources, and the authored test
  set (T104/T109/T110 authored-complete).
- Final verification is pending the lead-run batch: full Jest Red/Green,
  typecheck, lint, Maestro, and device runs are unclaimed here.
- Honest gaps: Maestro `dispose-holding.yaml` stays BLOCKED (no supplied
  disposable holding fixture, no registered dispose deep link, no
  runner-controlled offline profile); offline D10/D12 and two-device D20
  proofs are manual-only until harness and devices exist; combined Maestro
  gates and whole T142 remain unchecked.

### Current boundary

- The authored route, loader, translations, and Maestro journey above are the
  current integration state; their verification runs are the open gate.
- A Maestro run can be claimed only after the harness supplies a disposable
  current-user holding fixture, registers the dispose deep link, and provides
  runner-controlled offline mode. This lane does not invent or mutate those
  shared integrations.

## Honest boundary

- Ambiguous operational retry retains the original command and its displayed,
  acknowledged terminal pair. A revision conflict discards that command,
  reloads the holding and rates, clears acknowledgment when evidence changes,
  and commits exactly the refreshed pair currently shown.
- The production `metals.dispose/v1` registry accepts a null predecessor only
  for revision `0`; later revisions still require a valid predecessor UUID.
- FR-073–FR-075 terminal rate capture is deterministic at the registry,
  command-service, hook, and component contract level. The authored production
  terminal-rate loader (historically eligible observations via the canonical
  per-reference validator, batch capture coherence, ambiguous-batch skip,
  provider-over-fixture precedence, exact immutable raw values and original
  timestamps) and the route that injects it are unverified until the pre-push
  batch runs.
- Translation keys are inventoried and injected in tests; the authored shared
  translation resources are unverified until the pre-push batch runs.
- A Maestro flow can be authored only after the shared route exposes the screen
  and a fixture can guarantee current-user ownership plus offline mode before
  launch. This lane does not invent or mutate those shared integrations.
- Device visual fidelity, shared dirty-exit shell behavior, and downstream
  portfolio/reporting surfaces are manual/integration gates, not claimed by
  isolated unit tests.
