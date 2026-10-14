# Delivery continuation checkpoint — issue #347

Evidence cutoff: 2026-10-07 21:29 UTC / 2026-10-08 00:29 Cairo.

Execution remains local in three sibling worktrees under E:/Work/My Projects.
Lead: Monyvi-issue347-voice-usage-limits / codex/issue347-delivery. Server:
Monyvi-issue347-server / codex/issue347-server. Mobile: Monyvi-issue347-mobile /
codex/issue347-mobile. All HEADs remain
ac1ef5583656190d04f3d068a742d98f742085cf. Current origin/main is
758e0583c069d0af30681f7cff7e702bfabd845a. All three have that clean no-commit
merge prepared; the merge is uncommitted. Remote 389-voice-usage-limits remains
ac1ef558. Worker branches remain unpublished. Original issue321 checkout is
preserved. No main-destination merge, hosted migration/configuration,
deployment, paid provider call, issue/PR edit, production commit or new push
occurred in this continuation.

## Completed and verified partial implementation

- Exact server-author replacements applied only in the server sibling:
  schema/migration generators and mobile sync exclusions, parse-voice request
  metadata guards, and canonical strict Zod-derived contract module.
- Server first batch: 36 tests, 31 pass, one structural missing-082 guard, four
  SQL-dependent skips. The guard/skips are open work, not expected behavior
  passes. Actual metadata handler controls passed 11/11.
- Canonical contract first callable run: 16/16 pass, 8.038 seconds. Missing
  imports were never accepted as behavioral Red. This does not prove SQL
  accounting or complete the migration task.
- Exact mobile T037 metadata wire change applied only in the mobile sibling.
  Focused parser batch: 30/30 pass, 110.321 seconds, including same-key
  submission, independent timezone, success/privacy/consent/date/timeout
  controls. Existing hook callsites still need the new required fields; no full
  TypeScript or integrated mobile Green is claimed.
- Existing planning, approved bindings/copy and 35 elapsed-day terminal identity
  deletion choice remain unchanged. No task IDs were regenerated.

## Accepted failures directing the next implementation

- Actual parse-voice handler with test-only SDK doubles: 15 tests, 11 controls
  pass, four behavioral failures, 16.640 seconds. Daily/burst/replay cases
  return 200 instead of 429, and accounting failure returns 200 instead of 503.
  Logs show the provider path executes. Later reason/snapshot/RPC-count/
  zero-provider assertions are authored but unreached after the status failures.
  These SDK tests do not replace real PostgreSQL HTTP integration.
- Corrected existing mobile hook suite: 19 tests, 10 pass, nine behavioral
  failures, 9.120 seconds. Missing availability refresh/reconciliation, logical
  keys and mode-lock results are actual behavior failures. Original
  consent/permission controls now pass after the exact author mockReset fix.
  Initial 19-test run (8 pass/11 fail) is preserved; its final two failures were
  deferred-mock contamination, not feature Reds.
- T040 production proposal is saved administratively and withdrawn from
  integration. T046 dependencies remain open; no speculative timezone fallback
  or copied production contract was integrated.
- Five earlier route/navigation failures remain open. Manual/Voice extraction,
  approved layout and complete Manual regressions remain implementation work.

## Dedicated runtime

Dedicated emulator-5560 and PostgreSQL monyvi_voice_qa347 on loopback54332 are
isolated. SQL extensions, two backend PID smoke controls, pg_cron configuration
and synthetic auth/role controls passed. They do not prove Voice
SQL/races/cleanup or an authenticated Supabase HTTP fixture.

Native Android generation succeeded without dependency installs or tracked
package/config changes. Direct offline Gradle really executed. The first failure
identified a root build-directory/autolinking mismatch; source-derived routing
preserves owned Android root/app paths and isolates dependency outputs. The next
run failed with a missing Expo Updates plugin implementation class. The owned
640-byte jar contains only metadata and zero compiled classes. Root cause and
correct compiler destination remain unproven; no cache deletion or blind retry.
No APK/install/app launch, Maestro journey, rendered visual, accessibility, live
provider or complete device evidence exists. See checklists/isolated-runtime.md
for full independently reviewed history.

## Remaining work and forecast

1. Server: entitlement tests, callable SQL interfaces, real single-request SQL
   assertions and distinct-session race/cleanup tests; full accounting, locks,
   840-hour retention/500-row/hourly cleanup; availability/Edge wiring,
   generated types and local HTTP integration.
2. Mobile: timezone/service/lifecycle dependencies, unified route and preserved
   Manual form, navigation, keys/refusals/availability, approved UI/copy and
   responsive/accessibility tests.
3. Runtime/review: missing native plugin class and isolated auth/Voice fixtures;
   honest device/visual/E2E scenarios; independent TypeScript, logic, style,
   DB/security and QA reviews.
4. Integration: final checks/hooks, commit the prepared main synchronization,
   integrate verified branches and publish the accepted completed batch once.

Approximately 82 active minutes were used in the approved 90-minute
continuation, following roughly 4h25 earlier active delivery: about 5h47 total.
Remaining estimate is 4–6 hours, with native/HTTP controls the main uncertainty;
total forecast is about 10–12 hours versus the original 6–10 hour estimate.
Transport/reconciliation corrections, test fixture contamination and native
build-output/plugin-class failures caused the delay. The upper forecast now
exceeds the original upper estimate by more than30minutes. Under authoritative
team-led-delivery Section4, dispatch and affected work stop pending owner
direction; this is not a completed delivery.

Both Normal ChatGPT authors confirmed frozen/stopped; native QA completed and
released ownership. All launched test/build processes have terminal result
records. No hidden continuation is authorized. Proposals/evidence are preserved.
