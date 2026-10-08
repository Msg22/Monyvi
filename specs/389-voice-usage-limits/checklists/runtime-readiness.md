# Local runtime readiness — issue #347

Read-only QA audit, 7 October 2026. Start: **14:25 UTC**; main findings
assembled by 14:41 UTC, with isolated-target metadata refreshed at 14:44 UTC,
before the 14:55 checkpoint and 15:10 hard stop. This artifact is readiness
evidence for T001/T004/T005, not completed feature validation.

Verified execution checkout:
`E:/Work/My Projects/Monyvi-issue347-voice-usage-limits`, branch
`codex/issue347-delivery`, HEAD `ac1ef5583656190d04f3d068a742d98f742085cf`. Main
checkout source was not edited. Only this evidence file is owned by this worker.
Normal ChatGPT retains server and mobile test/implementation ownership; the lead
retains canonical planning.

The full AGENTS, team delivery and sprint workflows, constitution, feature
tasks/quickstart/final-analysis/implementation ledger, Maestro README, React
Native testing skill, Maestro skill and RNTL v13 reference were read. The
trusted workflow revision is `2095ec061d531854603e8415122231f1cbf4c1a0`, as
verified by the lead. The later owner authorization recorded in the ledger
supersedes the historical planning-only statements; it does not make unfinished
runtime gates pass. No tests, provider requests, app actions, seed/reset,
installs, migrations, Git mutations, hosted operations or external messages were
executed by this QA worker. Earlier eight-suite/76-test Jest results are
retained, not rerun or treated as feature Red.

## Current runtime evidence

Commands below are the exact read-only probes executed by the lead's sanctioned
broker from the sibling checkout unless stated otherwise. Version probes used
UTF-8 `spawnSync`, 10-second timeout; the Maestro probe used the Windows shell.

| Probe                                                                                                    | Observed result                                                                                                 | What remains unproved                                                                                                             |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `deno --version`                                                                                         | PATH lookup ENOENT                                                                                              | Use the verified absolute executable.                                                                                             |
| `C:/Users/Mohamed/.deno/bin/deno.exe --version`                                                          | Exit 0; Deno 2.9.7, V8 15.0.245.2-rusty, TypeScript 6.0.3                                                       | Proposed Voice test adapter has not run.                                                                                          |
| `maestro --version`                                                                                      | Printed 2.11.0; exit null; `spawnSync cmd.exe ETIMEDOUT`                                                        | CLI runner completion/device execution is not verified.                                                                           |
| `C:/Users/Mohamed/AppData/Local/Android/Sdk/platform-tools/adb.exe devices -l`                           | Exit 0; RZCWA1KBNVL online, SM_A546E                                                                            | One physical device, no verified dedicated emulator.                                                                              |
| `C:/Users/Mohamed/AppData/Local/Android/Sdk/emulator/emulator.exe -list-avds` — 14:44 UTC broker refresh | Exit 0; `Medium_Phone_API_36.0`, `Pixel_7`; installed system-image directories `android-34`, `android-36`       | A dedicated emulator is plausible; none started. Images/AVDs alone do not prove boot, build, auth, runner or Voice audio control. |
| Droidrun `device_info` — worker's independent probe                                                      | SM-A546E, Android 16, RZCWA1KBNVL                                                                               | No app interactions were performed.                                                                                               |
| `adb -s RZCWA1KBNVL shell pm path com.monyvi.app` via the verified SDK executable                        | Exit 0; installed `base.apk` path                                                                               | Installed build revision, active account and source ownership unknown.                                                            |
| `docker version --format '{{.Server.Version}}'`                                                          | Exit 0; 29.5.3                                                                                                  | Does not prove Voice schema or test dependencies.                                                                                 |
| `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'`                                               | Exit 0; local DB healthy on 54322, Kong healthy on 54321, Edge runtime up; auth/rest/storage/realtime/studio up | Voice RPCs/provider-double wiring/HTTP behavior unverified. Vector restarts; no causal Voice failure demonstrated.                |
| Read-only HTTP `fetch('http://127.0.0.1:8081/status')`                                                   | 200; `packager-status:running`                                                                                  | A listener is not proof that Metro serves this checkout. Another chat has active local work.                                      |
| Scoped source inventory and migration listing                                                            | No existing Voice Maestro harness; latest migration `081_email_verification_resend_limits.sql`                  | Candidate `082_voice_ai_usage_limits.sql` is free now; recheck immediately before assignment/write.                               |

The connected phone and Metro may belong to another chat's runtime. Do not
reuse, stop, reset or seed them without proving an exclusive test target and its
serving checkout/build. No credentials, environment files, personal fixtures or
process arguments were inspected.

## Manual-to-automation feasibility

“Feasible” describes a safe next authoring/execution path, not an executed pass.
Planned task IDs identify the intended coverage owner; no new assignment or
permission is created by this matrix.

| Manual scenario / task mapping                                                                                                                                                     | Feasible now                                                                                                                                                                                         | Missing harness, source or manual evidence                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual expense/income/transfer, account/currency/category, calculator, recurring/optional fields, validation/budget feedback, offline save — T026/T028/T033                        | Existing Jest runner and Manual regression sources; existing `transactions/create-transaction.yaml`                                                                                                  | Maestro completion, exclusive build/Metro/auth and safe fixture data not proved. Existing YAML ends at visible “Transactions”; strengthen it to assert the new transaction's amount/account/category, then reopen the item to prove persistence. It can create an account through setup.                                                                                                |
| FAB defaults to Manual; mic/onboarding/Review Retry enter unified Voice; invalid intent defaults to Manual — T024/T025/T028                                                        | Existing entry points support test-first route assertions                                                                                                                                            | Current FAB uses `/add-transaction`; mic/onboarding open tab-owned overlay. Unified shell/route and Voice YAML do not exist yet. Jest can obtain behavior Red before UI implementation; E2E needs verified runner.                                                                                                                                                                      |
| Preserve partial Manual fields through Voice/Manual switches, hidden accessibility subtree, back/cancel and one-shot retry — T024/T026/T028/T035                                   | RNTL v13.3.3 with React 19-compatible async APIs is declared; existing Manual state can be tested through route                                                                                      | No unified mode controls currently exist. New route assertions must fail on behavior, not missing imports. Native accessibility/focus requires separate tree/screen-reader evidence.                                                                                                                                                                                                    |
| Real recording, pause/resume/discard, short recording, 60-second auto-stop, finalize/active-mode locks — T024/T027/T028/T040                                                       | Existing overlay has localized accessible Pause/Resume/Discard/Done buttons; actual expo-audio recorder exists. Record/pause/resume/discard can avoid provider submission; auto-stop does not submit | No deterministic speech/audio fixture. Existing controls can be driven only after dedicated device/build/runner proof; no native result is claimed. New mode locks require the unified shell. Verify encoded audio separately from visible timer/waveform.                                                                                                                              |
| Denied/blocked/revoked microphone permission; Settings recovery; background/resume/restart/cancellation — T040/T042/T057                                                           | Existing hook doubles can cover deterministic branches; Android device supports later manual checks                                                                                                  | No verified Voice permission/restart/background automation. Recorder permission is read on mount; no AppState permission refresh is present in the inspected hook. A mocked permission/start result is not proof of Android revocation behavior. Keep these native cases manual-only/blocked until a controlled target and truthful assertions exist.                                   |
| Auth/consent/malformed or empty/oversized audio/date/provider-config rejection before start — T013/T014                                                                            | Actual `parse-voice/index.ts` HTTP handler and actual `ai-consent.ts` can be exercised with test-only SDK doubles                                                                                    | Test import map, handler capture/loopback adapter and execution still missing. Existing handler validates audio/date/auth/consent; new timezone/key/policy gates absent. No provider call is needed.                                                                                                                                                                                    |
| Provider success, failure, malformed/empty output, internal retries, post-start timeout, unchanged review/date/account/category result — T013/T014/T037/T040                       | GoogleGenAI alias can be replaced in tests; client invoke/AbortController can be mocked in Jest                                                                                                      | Current backend has no explicit deadline; a never-settling double would hang. Controlled timeout rejection and the client's 30-second abort are distinct from a verified backend deadline or consumed ledger entry. Four provider attempts with 2/4/8-second retry delays are existing behavior. Real recognition accuracy remains manual-only and outside paid-provider authorization. |
| Daily five/six, burst two/three, quota failure stays consumed, pre-start refusal consumes zero; Manual usable during exhausted/burst/unavailable states — T009/T011–T014/T039–T042 | Current real handler can yield behavior Red for burst/replay using provider call counts; daily Red can use honest burst-safe spacing                                                                 | Voice quota schema/RPCs/availability endpoint and UI do not exist. Complete local Edge/PostgreSQL/provider-double wiring is unverified. A sixth request test must avoid accidentally testing the third-in-minute burst boundary instead.                                                                                                                                                |
| Same-key replay, ambiguous transport/retry, new recording key; 35-day immutable identity retention/deletion and no refund — T009–T011/T013/T037/T040                               | Existing real handler ignores requestKey: same-key repeated HTTP requests can demonstrate missing replay protection with a double                                                                    | Stable-key client behavior, ledger and cleanup are absent. HTTP Red is not database replay/cleanup proof. Just-before/exactly-at/after cutoff and cleanup races require actual SQL plus controlled time/fixtures.                                                                                                                                                                       |
| Exact burst/lease/midnight boundaries, timezone travel/pinning/new-window adoption, 23/25-hour DST — T009/T010/T039/T057                                                           | Jest fake timers can test future client scheduling; callerLocalDate behavior already exists                                                                                                          | No verified server clock control. Changing device time or mocking JS Date does not control PostgreSQL `clock_timestamp()`. Server owner must establish fixed-time SQL/approved test isolation without exposing a production client clock bypass.                                                                                                                                        |
| Logout/account switch, stale responses, reinstall/tamper, cross-device final slot — T010/T039/T040/T042/T057                                                                       | Synthetic auth/user maps and Jest lifecycle doubles can test user isolation; separate DB actors are possible later                                                                                   | One physical device only; no isolated two-account native setup or second device. True reinstall/two-device UX remains manual-only/blocked. Do not clear the shared phone.                                                                                                                                                                                                               |
| Genuine final daily/burst slot race, same-key start, different-user independence, cleanup/start/admission races — T009/T010/T022                                                   | Repository has real independent-session `dblink` precedent in `market_snapshot_publication_concurrency_test.sql`                                                                                     | Callable Voice SQL absent; dblink/pgTAP availability and local connection execution unverified. Regex SQL tests or serialized SDK doubles are not concurrency evidence. Independent connections need committed synthetic state and narrowly scoped cleanup; per-call rollback would erase contention.                                                                                   |
| Changed metered policy/null-triplet technical compatibility, no subscription/paywall/provider coupling — T051–T054                                                                 | Future server/client contract tests can use doubles under the same Jest/Deno paths                                                                                                                   | Entitlement/availability implementations absent. Operational local HTTP test awaits server wiring; no hosted policy change authorized.                                                                                                                                                                                                                                                  |
| EN/AR, LTR/RTL, light/dark, compact/ordinary/tablet/landscape/enlarged text; usage announcements/tab states — T027/T034/T035/T041/T049/T050                                        | Approved bindings and test plan exist                                                                                                                                                                | Required rendered variants, accessibility tree and screen-reader evidence have not run. Phone screenshot alone cannot prove all variants or semantics.                                                                                                                                                                                                                                  |

## Provider-double bootstrap and TDD boundary

Source-backed candidate: a **test-only** Deno configuration maps `edge-runtime`
to a local empty module, `@google/genai` to a controlled local SDK double and
`@supabase/supabase-js` to an auth/profile/RPC double. Both the real handler and
the real consent helper use that same Supabase alias; preserve the actual
consent check with synthetic profile data matching `2026-07-ai-processing-v1`, a
nonempty consentedAt and revokedAt null.

Capture the actual top-level `Deno.serve` registration before importing the
unchanged `parse-voice/index.ts`, then serve that captured handler only on
loopback for HTTP assertions. Supply synthetic environment values before import,
assert expected module exports/provider call counts, deny external network, and
close the test server in cleanup. This is a proposed adapter, **not runtime
verified**. Direct handler calls alone are not full HTTP/Edge/PostgreSQL
evidence. Never change the production import map or add a production fixture
bypass.

First prove controls: successful synthetic multipart upload, preserved response
shape and auth/consent rejection with zero provider calls. Then assert a third
burst request and repeated requestKey do not produce another provider start.
Current actual handler ignores callerTimeZone/requestKey and performs no quota
RPC, so these assertions have an existing behavioral boundary to fail against.
Daily five/six requires separate burst-safe timing (for example two starts, wait
beyond 60 seconds, two starts, wait beyond 60 seconds, then fifth/sixth), or a
verified server clock strategy. Do not substitute an import failure, timeout of
the runner or missing SDK export for accepted behavioral Red.

Greenfield SQL sequencing remains a separate lead gate: Voice
relations/functions are absent from the audited source, and their presence in
the running shared DB was not queried. Missing relation/function errors are
setup evidence. The lead's revised bootstrap introduces minimum callable local
fail-closed SQL/contract interfaces only after accepted real HTTP and T006 Red,
then requires actual SQL/contract/race assertions before further behavior and
full local PostgreSQL HTTP Red before final wiring. Do not equate HTTP SDK
doubles with PostgreSQL concurrency or close T009/T010 from them. SQL tests
require a verified isolated local test database, not the current main
Supabase/device fixtures.

Independent review initially identified three sequence risks. Full corrected
tasks/plan and `checklists/bootstrap-analysis.md` were read through the
sanctioned broker relay at 14:55 UTC; all three findings are **resolved**:

1. Plan's final sequencing guidance now starts with executed existing-handler
   HTTP/T006 Red, then minimum callable local interfaces, then direct SQL/
   contract Red. Full PostgreSQL HTTP Red still precedes final wiring.
2. Shared Red and T008 now distinguish authored/frozen boundary proposals and
   initial evidence from the later executable direct T007 gate. Foundation
   completion remains unfinished; it is not an initial bootstrap prerequisite.
3. Passing single-request admission/state controls now precede independent-
   session T010 races. All-deny stubs and missing relations/functions do not
   prove contention. Race-specific failures gate corresponding race fixes;
   already-Green races remain regression evidence without invented defects.

No remaining critical/high sequencing contradiction was identified in that
refreshed relay. This resolves planning findings only; it does not authorize
production or close any unexecuted runtime gate.

Cleanup execution parameters were subsequently frozen in the broker's reviewed
planning record: hourly at minute 17 (`17 * * * *`), at most 500 eligible rows
per invocation, with terminal/current-accounting safety rechecked under the same
per-user admission/start lock. Repeated bounded runs drain eligible backlog;
retained identities preserve replay protection until actual deletion. The
approved 35 elapsed-day cutoff and no-refund rule remain unchanged. Job/batch/
backlog and lock behavior still require actual T009/T010 SQL evidence.

## Safe successor slice

Recommended first successor: **test-only actual-index Deno adapter + HTTP Red**,
owned by the server author or an explicitly transferred local test executor.
Reserve the exact test/import-map/double files before writing, retain current
production files read-only, use the isolated sibling checkout and synthetic
credentials, and run no shared-device workflow. This readiness task does not
authorize that next slice by itself.

Available AVDs provide a later isolated device option, but no emulator start,
new AVD, download, install or seed has occurred. The lead must release a
distinct bounded target-readiness assignment before native E2E execution.

Candidate command after the owner supplies the named test-only configuration and
test file; it has not been executed here:

```powershell
& 'C:/Users/Mohamed/.deno/bin/deno.exe' test --config supabase/tests/voice-parse-http/deno.json --cached-only --no-prompt --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,GEMINI_API_KEY --allow-net=127.0.0.1 supabase/functions/parse-voice/index.test.ts
```

The configuration/test path above is proposed new harness, not existing source.
Confirm the command's flags and module resolution with the installed runtime
before accepting results. No real SDK imports or outbound provider access are
allowed. Captured behavioral failure must name assertion, actual HTTP response,
provider-start count and audited HEAD.

A separate future Manual E2E slice may use the existing exact entry point:

```powershell
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/transactions/create-transaction.yaml
```

That command launches/recovers the app and its setup may create an account. Run
only after exclusive device/build/serving-checkout/auth/data proof and a working
Maestro runner; use explicit target selection and appropriate loopback ports for
a physical device. It is not a read-only readiness probe. No Voice submission is
safe merely because `EXPO_PUBLIC_AI_SMS_PARSER_MODE=fixture` is set:
`start-e2e-fixture.js` and `ai-sms-fixture-parser.ts` affect SMS only, whereas
`ai-voice-parser-service.ts` always invokes `parse-voice`.

Root `db:migrate` invokes `db:push` and therefore is not an approved local-only
test command. Never execute it blindly for this task. `db:types:local`
explicitly targets local generation, but still writes generated source and
belongs to the server integration owner's later authorized slice.

## Tool routing and remaining gate status

Worker's tool inventory had no ctx APIs. The documented lean-ctx CLI command was
rejected by the hook: “Use ctx_shell instead — lean-ctx replace mode is active.”
It was not retried. One lead-requested deferred direct call returned
`TypeError: tools.mcp__lean_ctx__ctx_read is not a function`. The lead then read
all repository source through sanctioned ctx tools and delivered source packs in
Git administrative relay files. Node was used solely to consume those relay
outputs, not to explore repository source or run shell commands.

T001 execution identity verified; T004 has this feasibility matrix and refreshed
runtime facts, with provider/audio/clock/DB and isolated-target blockers
explicit. T005 retains existing Jest baseline; transaction-create Maestro
remains unrun. No feature behavioral Red/Green, SQL race pass, native journey
pass, visual fidelity, accessibility or deployment readiness is claimed.
Canonical task and implementation ledgers remain lead-owned and were not edited
by this worker.
