# Live SMS Provider Evaluation

EVAL-001 is a report-only evaluator for the deployed `parse-sms` path. It uses
synthetic SMS only and never reads a device inbox or saves returned synthetic
transactions.

The canonical provider list comes from
`packages/logic/src/parsers/egyptian-bank-registry.ts`. The evaluator derives
all currently selectable banks and wallets at run time; it does not hardcode a
provider count.

## What the evaluator measures

Each selectable provider receives at least one clearly completed transaction and
one clear non-transaction. Additional independent synthetic templates cover
sender aliases, Arabic and English, Arabic numerals/separators, foreign
currency, refunds, ATM withdrawals, card-versus-account suffixes, generic
payment-gateway ambiguity, pending/failed transactions, OTP/promotions, semantic
duplicates and holdout wording.

Every case records:

- visible run/case ID;
- provider and synthetic sender/body;
- synthetic provenance and holdout/template tags;
- received date and canonical SMS fingerprint;
- expected transaction presence;
- only objectively supportable field labels; and
- accepted alternatives or `unknown` where category/counterparty purpose is not
  provable from the SMS.

Synthetic templates are not represented as authentic bank/wallet wording.

The final deployed-path response is scored by `messageId`. Final end-to-end
accuracy may include cases that the Edge Function handled locally before
provider execution. Raw model accuracy never does: only cases proven present in
the actual provider-input diagnostic event can enter raw-model denominators.

Duplicate or unknown output identities are reported as excess output and reduce
precision without creating additional true positives or field denominators.
Transport failures, admission failures, malformed responses, unresolved
candidates, terminal/suppressed candidates and unattempted cases remain separate
classifications rather than semantic passes or misses.

A confidence range attached to the generic-gateway ambiguity case is explicitly
a product-policy heuristic, not a calibrated probability and not an objective
accuracy field.

## Dry run — default

Dry-run makes zero HTTP requests and requires no credentials.

```powershell
npm run sms:provider:evaluate
```

For a repeatable named run:

```powershell
npm run sms:provider:evaluate -- --run-id eval-2026-10-01-a --anchor-ms 1790874000000
```

The JSON report exposes every selected case plus aggregate, provider, scenario,
classification, batch, provenance, latency and raw-observation coverage. It also
includes a `rawAttributionManifest` containing each original request batch ID,
requested case list and request-input digest.

A dry run can be bounded explicitly:

```powershell
npm run sms:provider:evaluate -- --run-id eval-dry --max-cases 20 --max-requests 4
```

`maxRequests` does not cause dry-run network calls; it is retained so the same
run shape can be prepared before live execution.

## Live staging run

Live mode is deliberately pinned to development project `yulbcndyssdjicbpmlrk`
and exactly:

```text
https://yulbcndyssdjicbpmlrk.supabase.co/functions/v1/parse-sms
```

The guard rejects HTTP, alternate hosts/projects, credentials embedded in the
URL, query strings, fragments, alternate paths and redirects.

Use only the dedicated staging test account. Supply its authenticated user token
through process memory/environment, never a command-line argument or committed
file:

```powershell
$env:SMS_PROVIDER_EVAL_ACCESS_TOKEN="<dedicated staging user JWT>"
```

If the Supabase gateway requires the public project key, supply it separately:

```powershell
$env:SMS_PROVIDER_EVAL_PUBLIC_API_KEY="<public staging anon key>"
```

Both live bounds are mandatory:

```powershell
npm run sms:provider:evaluate -- --live --run-id eval-live-001 --max-cases 20 --max-requests 4 --output eval-live-001.json
```

The evaluator sends at most five synthetic messages per request and performs
requests sequentially. It does not retry failed live calls. Expected labels,
holdout tags and provenance are never sent to the model.

The normal server contract remains authoritative. Active AI consent, scan
window, quota, burst, reservation, cooldown, fingerprint and replay rules all
apply. The evaluator does not reset or bypass them. Auth/consent/capacity
refusals stop later live batches. Other failures and cancellation preserve the
partial report and leave remaining selected cases unattempted.

The executable CLI registers `SIGINT` and `SIGTERM`, forwards an `AbortSignal`
to the pending request, and writes the partial report before returning.

A new run anchor produces new synthetic received timestamps and therefore new
canonical fingerprints. This is a fresh synthetic run, not a request-key bypass
of same-message replay.

## Report-only boundary

The script never invokes a transaction-save/mobile persistence path, so returned
synthetic transactions are not written as user financial records.

The real `parse-sms` Edge Function may still write its normal safeguard,
reservation, provider-start, negative-outcome or other operational accounting
metadata. Report-only does **not** mean zero backend bookkeeping.

## Raw DeepSeek output versus final output

The normal HTTP response is the grounded/validated final layer. It must never be
presented as raw model accuracy.

Raw model scoring requires two independently attributable pieces of existing
development diagnostic evidence:

1. `smsAi.providerRequestInput`, which contains only the actual submitted
   `sender`, `body` and `date` values after Edge prefiltering; and
2. `smsAi.providerResponseOutput`, containing the returned assistant content.

The evaluator does not scrape Supabase logs and does not require a second
provider run.

Provider-input messages are correlated back to source cases by recomputing the
canonical fingerprint from `sender`, `body` and `date`. The original
request-input digest remains separate from the filtered provider-input identity.
Unknown or duplicate actual provider inputs are rejected.

A raw response batch does **not** imply that all cases from the original request
reached DeepSeek. Cases filtered by the Edge Function remain `not_observed` in
raw-model scoring. A raw `transactions: []` response is semantically empty only
for cases proven present in that actual provider-input batch.

After a live run:

1. Save the final report with `--output`.
2. Use the report's `rawAttributionManifest` to identify the original request.
3. Build one local provider-input evidence file from the existing
   `smsAi.providerRequestInput` log event.
4. Build one local raw-output evidence file from the matching
   `smsAi.providerResponseOutput` event.
5. Omit any batch that cannot be attributed confidently. Never guess.
6. Attach both evidence files to the saved report offline:

```powershell
npm run sms:provider:evaluate -- --final-report eval-live-001.json --provider-input-observations eval-live-001-provider-input.json --raw-observations eval-live-001-raw.json --output eval-live-001-with-raw.json
```

Provider-input evidence shape:

```json
{
  "runId": "eval-live-001",
  "batches": [
    {
      "runId": "eval-live-001",
      "batchId": "batch-001",
      "requestInputIdentity": "<copy from rawAttributionManifest>",
      "smsMessages": [
        {
          "sender": "qnb",
          "body": "synthetic message body",
          "date": "2026-10-01T16:00:00.000Z"
        }
      ]
    }
  ]
}
```

Raw-output evidence shape:

```json
{
  "runId": "eval-live-001",
  "batches": [
    {
      "runId": "eval-live-001",
      "batchId": "batch-001",
      "caseIds": ["<original requested case IDs for this batch>"],
      "inputIdentity": "<copy from rawAttributionManifest>",
      "responseContent": "{\"transactions\":[]}"
    }
  ]
}
```

Raw wire transactions remain model evidence even when a field would later be
rejected or grounded by Monyvi. Raw and final aggregates are therefore reported
separately. Missing provider-input evidence or missing raw output remains
`not_observed`.

A replayed final response does not by itself prove that a fresh provider request
occurred. Provider-call provenance remains `unknown` unless correlated evidence
establishes a provider call.

## Deterministic verification and CI

All automated evaluator tests use synthetic data and injected/mock HTTP
transport. They consume zero live provider allowance.

Focused command:

```powershell
npm run test:sms-provider-live-evaluator
```

The repository CI already executes `npm run test:scripts`; `test:scripts` now
chains `npm run test:sms-provider-live-evaluator`, so the evaluator's mocked
suite runs in CI without changing the workflow file.

A development-only mobile results surface was later explicitly approved on
2026-10-02. Its automated/E2E/device/visual verification is deliberately
deferred to T047 for the current DeepSeek trial; no execution claim is made by
the source-only UI implementation.

## Coverage matrix

| Area                  | Deterministic mocked coverage                                                                                    | Live/manual evidence                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Registry corpus       | Dynamic selectable-provider positive/negative floor, aliases, independent edge/holdout templates                 | None required                                                     |
| Fingerprints/dates    | Canonical Edge fingerprint helper; stable within-run anchor; fresh-anchor identity change                        | Staging safeguard acceptance                                      |
| HTTP boundary         | Exact staging HTTPS target; no URL credentials/query/fragment/other host/path; redirect refusal                  | Dedicated staging test account                                    |
| Credentials           | Environment-only user JWT; optional public key; report/error redaction                                           | Operator supplies staging values                                  |
| Batching              | Five messages, sequential, explicit max cases/requests, no automatic retry                                       | Normal hosted limits                                              |
| Admission/replay      | Mocked auth/consent/capacity stop; unresolved/terminal/unattempted classification                                | Actual staging consent/quota/cooldown/replay                      |
| Final accuracy        | Message-ID detection and field metrics; excess-output precision penalty; category alternatives/unknowns          | Deployed grounded/validated response                              |
| Provider-input proof  | Canonical fingerprint correlation; unknown/duplicate rejection; prefiltered cases excluded from raw denominators | Existing development provider-input log                           |
| Raw accuracy          | Independent raw aggregate; partial coverage; attributed raw empty output                                         | Existing development response-output log                          |
| Saved report import   | Strict external schema plus case/batch/manifest identity checks and JSON roundtrip                               | Offline attachment without rerun                                  |
| Invalid output        | Non-JSON/malformed 200 and invalid transaction fields are response-invalid                                       | Only naturally occurring hosted failures                          |
| Cancellation/failures | Signal abort forwarded to pending fetch; partial report persisted                                                | Manual cancellation if needed                                     |
| Cache/usage           | Report fields only when evidence is actually available                                                           | Existing hosted telemetry/log inspection; no invented cache claim |
| Persistence           | No financial transaction save path in evaluator                                                                  | Normal Edge accounting metadata may still be written              |

## Development-only mobile evaluation surface (approved 2026-10-02)

The approved mobile entry is a convenience surface over the same canonical
synthetic corpus and final scorer used by this CLI. It is not a second corpus,
not a raw-model benchmark and not a production feature.

### Runtime boundary

- Settings shows the row only in `__DEV__`, for an authenticated user, when
  `EXPO_PUBLIC_SUPABASE_URL` exactly equals
  `https://yulbcndyssdjicbpmlrk.supabase.co`.
- The private route and mobile service independently enforce that boundary.
- Opening/focusing the page makes zero network requests. The user must tap
  **Start test**.
- Each Start creates a fresh run anchor/ID. Messages are the canonical synthetic
  corpus only, **15 per request on mobile**, up to 10 concurrent batches (T053).
  The CLI evaluator remains at five per request, sequential.
- The mobile service uses the canonical mobile sender/body/timestamp SHA-256
  fingerprint helper and the current in-memory authenticated Supabase session.
  No service-role token, dedicated-account credential or auth injection exists.
- The initiating user is pinned across the run. User ownership and cancellation
  are rechecked immediately before each request and any authentication refresh
  retry. Cancel, Back, navigation blur/gesture, unmount, logout or account
  change stop pending work and prohibit later batches.
- Normal consent, allowance, cooldown, reservation, terminal-negative and replay
  safeguards remain authoritative. No allowance reset, retry bypass, inbox read
  or transaction/transfer save is performed.
- Edge hard exclusions and synchronized prior outcomes may prevent a case from
  reaching the provider. The page therefore reports **final parser behavior**,
  not fresh DeepSeek accuracy. Edge-request counts are not provider-call proof.

### Mobile trial batching and timing

For the current approved development trial, the mobile synthetic runner uses
`MOBILE_SMS_PROVIDER_EVALUATION_BATCH_SIZE = 15`. This is deliberately
mobile-only: `DEFAULT_EVALUATION_BATCH_SIZE` and the CLI evaluator remain at
five. The mobile route derives the idle planned-request count from the dynamic
corpus size and the mobile constant; the runner uses the same constant for
actual splitting for concurrent execution, including a final partial batch when
necessary.

Timing shown on the page is operational elapsed time, not DeepSeek/provider
compute latency:

- completed/failed batch durations come from the existing
  `FinalBatchObservation.latencyMs` captured around mobile request execution;
  that interval includes authenticated transport work, network time, hosted
  server wait, authentication refresh/retry when it occurs, and response
  handling;
- a currently running batch uses a client-side elapsed clock until a final
  observation replaces it with the recorded batch duration;
- explicit cancellation immediately freezes the active batch's elapsed clock as
  **Cancelled** without creating a successful/scored observation;
- pending/unattempted batches display **Not run** and have no fabricated
  duration;
- earlier completed/failed batch timings remain visible if a later batch fails
  or is cancelled;
- total run elapsed starts before corpus preparation, updates while the run is
  active, includes preparation/request/retry/processing/between-batch overhead
  and time spent in a subsequently cancelled active batch, then freezes on
  finished/cancelled/fatal state;
- a new run or authenticated-user change resets timing state;
- the one-second display timer mutates only hook presentation timing state. It
  does not rescore/rebuild the 135-case report, start requests, retry work, or
  influence safeguards.

Neither batch duration nor total duration is labelled or interpreted as raw
provider/model compute time.

### Scoring/display contract

- **Matched** = an observed final result with no canonical scorer mismatch,
  including a correct no-transaction result.
- **Mismatched** = an observed final result that conflicts with an objective
  expected classification/field.
- **Not evaluated** = response-invalid, transport/admission failure, unresolved,
  terminal/suppressed without trustworthy fresh-provider evidence, cancelled
  pending work, or not-run work.
- Exact and `one_of` field expectations retain their existing semantics. Unknown
  expectations render **Not asserted** and do not enter field accuracy.
  Policy-heuristic confidence ranges render diagnostic context only.
- HTTP 200 alone never means every case passed. An unavailable result is never
  displayed as a verified empty/no-transaction result.
- Full synthetic body, sender/provider/case ID, expected result, final parsed
  fields/absence/unavailable state and mismatch reasons are expandable inline.
  No raw provider response is displayed.

### Manual QA plan — deferred, not executed in this source slice

T047 must eventually record all of the following against the exact integrated
head and approved PNG:

| Scenario                                                  | Required observation                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production/release build                                  | Settings row absent; direct route refused                                                                                                                                                                   |
| Dev on non-approved Supabase URL                          | Row absent; route/service refuse                                                                                                                                                                            |
| Dev staging signed out                                    | Row absent/private auth gate retained                                                                                                                                                                       |
| Dev staging signed in, consent off                        | Page may be entered only through allowed dev route but Start remains unavailable/stopped; no request                                                                                                        |
| Idle entry/focus/remount/theme/language                   | Zero HTTP until explicit Start                                                                                                                                                                              |
| Start                                                     | Fresh run identity, runtime corpus/provider counts, mobile planned batch count derived from 15 messages/request (135 cases = 9 batches today), up to 10 concurrent batches (CLI requests remain sequential) |
| Running                                                   | Progress/partial final-result cards appear; duplicate Start unavailable; total elapsed and active-batch elapsed advance without causing scorer/network work                                                 |
| Batch timing                                              | Ordered rows show batch number, actual message count, Completed/Failed/Running/Cancelled/Not run state, and seconds only when elapsed is known                                                              |
| Failure after earlier batches                             | Earlier completed/failed timings remain; failed batch keeps its recorded elapsed; later batches remain Not run with no duration                                                                             |
| Cancel                                                    | Active request aborted where supported, no later batches, partial observations retained while mounted; active batch immediately freezes as Cancelled with elapsed time and total run time freezes           |
| Finished/fatal                                            | Total elapsed freezes and remains stable; batch timings remain visible                                                                                                                                      |
| New run / account change                                  | Run and batch clocks reset; prior-user timing/report is not exposed to the new user                                                                                                                         |
| Back / Android back / gesture / navigation blur / unmount | Pending work stopped; no delayed update                                                                                                                                                                     |
| Logout/account switch during run                          | Old-user work/results cleared and never shown to new user                                                                                                                                                   |
| Completed transaction case                                | Objective fields compare through canonical scorer                                                                                                                                                           |
| Correct no-transaction case                               | Counted separately as correct non-transaction and Matched only with trustworthy observed evidence                                                                                                           |
| Prior negative/terminal/hard exclusion                    | Honest final classification; no claim that DeepSeek freshly processed it                                                                                                                                    |
| Batch transport/admission/invalid/unresolved              | Case is Not evaluated; Expected vs Parsed unavailable plus safe batch/status/reason                                                                                                                         |
| All / Issues                                              | All preserves corpus order; Issues contains mismatched + not evaluated                                                                                                                                      |
| EN/AR + RTL                                               | Labels translate/mirror; synthetic bodies/IDs preserve natural direction                                                                                                                                    |
| Dark mode                                                 | Existing dark tokens only                                                                                                                                                                                   |
| 320/360/390/tablet/orientation/enlarged text              | No horizontal page scroll; summary/comparison stacks when needed; CTA remains above safe area                                                                                                               |
| Accessibility                                             | 44-point targets, header/action labels, state announcements, expandable-card state                                                                                                                          |
| Visual comparison                                         | Side-by-side/overlay against authoritative approved PNG after T046 import                                                                                                                                   |

No row above is marked passed in this document. During the current trial, tests,
lint, typecheck, formatting, CI, device/provider QA and visual comparison were
explicitly postponed by Mohamed. SMS-EVAL-TIMING-001 is source-implemented only;
its batch-size/timing behavior remains unverified until the deferred QA owner
runs those gates.

## SMS-CANCEL-060 source contract — 2026-10-02

The backend full-parser now has a source-level cancellation path intended to
honor a request abort when the hosted runtime supplies one. This does not change
the CLI evaluator's existing five-message batches. Later integration must keep
the separately approved mobile synthetic batch size of 15 from
`76fbd782a2a5951261653184621db4c89ea0c962`.

For the current DeepInfra trial:

- provider attempt deadline is 60 seconds;
- automatic DeepInfra retries are 0, so a logical provider start performs at
  most one outbound DeepInfra fetch and no retry sleep;
- the optional incoming `Request.signal` is forwarded through handler ->
  executor -> provider request -> fetch without entering serialized SMS data;
- caller cancellation and timeout are different paths;
- cancellation before committed provider start uses existing reservation
  release; cancellation after committed provider start keeps usage consumed and
  uses existing provider-error completion;
- cancellation after raw response is honored before outcome reconciliation, so
  it cannot manufacture successful-empty, omission-negative or terminal
  evidence;
- after outcome reconciliation/completion has begun, normal accounting is
  allowed to finish and no late abort listener mutates database state.

Deno documents `Request.signal` disconnect behavior as runtime-dependent and
also documents a legacy abort-on-successful-handler-return behavior. Therefore
the implementation does not treat a late signal after authoritative commit start
as proof the client cancelled the in-flight work. Supabase gateway disconnect
propagation remains unverified. Likewise, aborting the outgoing fetch does not
prove that DeepInfra stopped work/billing already accepted upstream.

### T050 manual/source-review matrix — deferred

| Scenario                                     | Expected evidence                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 60s timeout                                  | One outbound provider attempt, no retry/sleep; timeout reported through normal provider-failure accounting |
| Abort before provider start                  | Reservation release only; zero provider fetch                                                              |
| Abort during provider-start RPC, start=false | Release reserved work; no provider fetch/outcomes                                                          |
| Abort during provider-start RPC, start=true  | No refund/release; started work finalized through existing error completion                                |
| Abort during fetch                           | Fetch signal aborts if runtime propagation reaches Edge; no retry; no negative/terminal outcomes           |
| Abort during response body                   | Cancellation remains distinct from invalid/empty response                                                  |
| Abort after raw response                     | Cancellation check wins before negative-outcome reconciliation                                             |
| Abort after reconciliation begins            | Finish normal reconciliation/completion; no asynchronous abort DB mutation                                 |
| Concurrent requests                          | Per-request signal isolation; one cancellation cannot affect the other                                     |
| Timeout vs caller abort                      | 60s deadline is provider failure; caller abort uses cancellation path                                      |
| Hosted propagation                           | Observe actual Supabase gateway -> Edge `Request.signal` behavior; do not assume it                        |
| Upstream stop/billing                        | Do not infer DeepInfra compute/billing cancellation from local fetch abort                                 |

All T050 runtime/manual evidence is intentionally **UNVERIFIED** in this source
slice. The product owner explicitly deferred tests, lint, typecheck, formatting,
CI, device, provider and visual checks.

Deployment status (T050 integration note): staging `yulbcndyssdjicbpmlrk`
`parse-sms` version 41 ACTIVE, verifyJWT true, 30-day lookback policy, bundle
verified by lead. Earlier version notes (e.g. version 36) are history. Runtime
UNVERIFIED; no tests written/run in this task per source-only trial waiver.

## T053 - production bounded concurrency promotion - 2026-10-02

The verified synthetic bounded concurrency (T052) is promoted into real mobile
SMS AI parsing through a single shared scheduler
(`apps/mobile/services/concurrent-batch-queue-service.ts`) with one exported
`CONCURRENT_BATCHES = 10` (`apps/mobile/constants/sms-ai.ts`). The synthetic max
constant aliases it:
`MOBILE_SMS_PROVIDER_EVALUATION_MAX_CONCURRENT_BATCHES = CONCURRENT_BATCHES`.
Mobile batch size stays 15; the backend keeps its 60 s provider deadline with
zero automatic provider retries.

### Behavior preserved by source

- Real transport runs up to 10 chunks concurrently with an immediate refill
  (next batch launches as soon as a worker frees - not waves, not unbounded
  `Promise.all`).
- Per-batch unique `requestKey`, one scan `scanSessionId`/`scanStartedAt`
  anchor; candidate/smsFingerprint mapping and output-identity validation are
  unchanged; unsent/aborted messages are never marked negative.
- 413 and multi-message rolling-limit refusals split and enqueue fresh child
  chunks (left/newest before right); the prior refused parent is not counted as
  a completed leaf; `totalChunks` tracks the leaf count.
- Terminal non-splittable capacity stops queued launches while already-active
  accepted requests drain and keep their successful results/negative outcomes;
  the deduped unresolved union covers only actually refused/deferred candidates.
- Cancellation, owner-change, consent and async-progress failures abort all
  active requests, stop queued launches, drain every worker, remove listeners,
  and propagate the exact control-flow error.
- Progress is serialized (awaited) with immutable partial aggregations; every
  successful batch appears exactly once in `completedTransactions` and counters
  are monotonic. `AiParseProgress.concurrentBatchCount` is optional and defaults
  to 1 (local/fixture/QA), so the scan ETA division in
  `apps/mobile/services/sms-sync-service.ts` only applies to true parallel runs.
- Safeguard QA transport remains sequential with its own request size and
  inter-chunk delay; the fixture parser is unchanged.

### Manual coverage matrix - gaps that source/tests cannot prove

| Scenario                                 | Required manual observation                                                                                                                  | Automation note                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Scheduler cap / refill                   | With a large inbox, observe <=10 SMS AI Edge requests in flight at once and the next chunk starting as soon as one finishes                  | Covered by deterministic mocked unit tests; runtime concurrency needs device/network evidence |
| Real-network parallelism                 | Verify the 10-concurrent refill under real HTTP latency (not just mocked transport)                                                          | Existing fixture Maestro flows cannot prove real-network concurrency; manual-only             |
| Provider behavior                        | Confirm one 60 s DeepInfra attempt, zero automatic retries, timeout classified as provider failure                                           | Backend source-reviewed; live provider runtime manual-only                                    |
| Hosted cancellation propagation          | Observe whether Supabase gateway forwards client disconnect to Edge `Request.signal`; do not claim guaranteed                                | Manual-only (T050 matrix)                                                                     |
| Upstream compute/billing                 | Aborting the local fetch is NOT proof DeepInfra stopped accepted compute/billing                                                             | Manual-only (T050 matrix)                                                                     |
| Live/headless                            | Single live SMS message performs exactly one HTTP request and keeps live native path working                                                 | Manual-only on device; native plugin owned separately                                         |
| Large-scan parallel limits               | ETA uses concurrentBatchCount division; confirm estimatedRemainingMs shrinks with parallelism                                                | Manual-only under a real multi-chunk scan                                                     |
| Cancel mid-parallel-run                  | Cancel aborts all active requests, queued chunks never launch, partial completed results retained                                            | Mocked unit coverage; manual device cancellation for real abort behavior                      |
| Rolling-capacity + active successes      | Active successes retained while a terminal refusal marks only refused-branch candidates unresolved                                           | Deterministic unit coverage; manual QA for live rolling refusals                              |
| Synchronous capacity refusal stop        | Confirm that 429 capacity refusal halts launches immediately on device without waiting for slow progress writes, preventing an 11th request  | Unit covered; device network timing manual-only                                               |
| Simultaneous chunk progress monotonicity | Verify UI receives sequential strictly increasing chunk counts ([1, 2, 3]) even when batches finish at the same millisecond                  | Unit covered; UI re-render cadence manual-only                                                |
| Progress abort & user switch suppression | When scan is cancelled or user switches accounts during an active database draft persistence, later queued progress callbacks are suppressed | Unit covered; multi-account auth switch manual-only                                           |
| Error wrapper primitive fidelity         | Non-Error exceptions from progress listeners or platform bridge are propagated without swallowing or mutating Error.name                     | Unit covered; React Native error boundary manual-only                                         |
| 401 refresh abort without user ID        | Aborting during token refresh without a pinned user ID prevents second network call on device                                                | Unit covered; native token refresh race manual-only                                           |

Deterministic validation executed 2026-10-02 (PR349-wrap worktree, HEAD
`10b582e1`): `ai-sms-parser-concurrency-control`, `ai-sms-parser-concurrency`,
`ai-sms-provider-retry-contract`, `concurrent-batch-queue-service`,
`ai-sms-parser-safeguards`, `sms-parser-orchestrator-safeguards`,
`sms-sync-service`, `sms-sync-checkpoint/safeguards` integration,
`withSmsBroadcastReceiver`, `sms-live-processor`,
`sms-live-retry-request-store`, and `sms-live-request-identity` suites Green;
mobile + logic `tsc --noEmit` clean; Prettier clean on all 30 owned files; full
30-file ESLint sweep result: 23 errors found across the owned set and all 23
fixed in this wave (narrow documented exceptions only for by-design primitive
fidelity and the QA lazy `require`; no Error casts, no wrapping, no loader
redesign) — 0 errors remain, warnings only. No baseline exists to label any
finding pre-existing. Real-network concurrency, device/network timing, and
hosted cancellation remain manual-only per the matrix above. Existing
fixture-backed Maestro flows validate the fixture parser path only and MUST NOT
be treated as proof of real-network concurrency.

## T054 - durable live retry-key store - 2026-10-02

The live SMS processor persists bounded retry identity (user ID, SMS
fingerprint, request key, 24 h TTL expiry/update timestamps; at most 64 entries
per user, per-user isolation, owner checks before/after persistence, serialized
mutations, malformed/expired cleanup) in
`apps/mobile/services/sms-live-retry-request-store.ts`. The full behavior,
manual scenario matrix, and remaining manual-only gaps live in
`specs/388-sms-ai-provider/live-sms-compatibility.md` ("Durable mobile retry
metadata", "Manual scenario matrix", "Coverage and remaining manual-only gaps")
and are not duplicated here.

### T054 task coverage

| Area                        | Deterministic coverage (this validation wave)                                                                                                         | Manual-only remainder                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Bounded TTL/limit/isolation | `sms-live-retry-request-store` suite Green (persist/scoped shape, malformed cleanup, expiry, user isolation, 64-entry bound, prune-write fail-closed) | Actual device AsyncStorage behavior; process-restart persistence |
| Retry identity wiring       | `sms-live-request-identity` + `sms-live-processor` suites Green (terminal pinning, `live:` fallback key, stale-user/clear paths)                      | End-to-end confirmed-failure fresh-key rotation on device        |
| Cross-delivery reuse        | Source-accepted; unit pinning via `expectedUserId`                                                                                                    | Foreground/background/killed-app transitions; HeadlessJS restart |

No T054 item above claims device, restart, notification, or hosted verification.
T053/T054 single-attempt, consent, 30-day lookback, production rolling-200/24 h,
synthetic-allowance exemption, partial-row acceptance, and cancellation
semantics are preserved, not redesigned, by this wave.
