# Mobile initial behavioral Red — issue #347

Bounded local integration assignment, 7 October 2026. Start: 14:50 UTC;
checkpoint: 15:10 UTC; hard report boundary: 15:20 UTC. This initial test slice
does not establish complete T024/T025/T037, E2E, native or feature readiness.

## Identity and scope

The root sanctioned broker verified checkout
`E:/Work/My Projects/Monyvi-issue347-voice-usage-limits`, branch
`codex/issue347-delivery`, HEAD `ac1ef5583656190d04f3d068a742d98f742085cf`
before applying the patch. Pre-apply status contained only lead planning changes
and readiness/analysis evidence; no production or test changes. The main
checkout source remained untouched.

The externally authored proposal `mobile-tests-proposal.patch` was read fully
through its administrative relay. SHA-256:
`1c5692f4ae8337c6e70b8f45dfcf27c6f96a011ee1a6d006ef85f7b73daf1919`. Exact patch
application exited 0. Its temporary application ownership covers:

- `apps/mobile/__tests__/app/add-transaction-modes.test.tsx` — new;
- `apps/mobile/__tests__/components/fab/QuickActionFab.test.tsx`;
- `apps/mobile/__tests__/components/tab-bar/CustomBottomTabBar.test.tsx`;
- `apps/mobile/__tests__/services/ai-voice-parser-service.test.ts`.

Production files stayed read-only. No provider, SQL, device/app, install,
branch/commit/push or external application action was performed. Test commands
were executed by the root broker; this worker interpreted their saved outputs.
No native repository exploration or blocked-tool retry occurred.

## Exact focused command and attempts

Working directory is the verified sibling checkout. The runner uses the
workspace Node executable and the shared dependency junction.

```powershell
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --runTestsByPath apps/mobile/__tests__/app/add-transaction-modes.test.tsx apps/mobile/__tests__/components/fab/QuickActionFab.test.tsx apps/mobile/__tests__/components/tab-bar/CustomBottomTabBar.test.tsx apps/mobile/__tests__/services/ai-voice-parser-service.test.ts --json --outputFile E:/Work/My Projects/Monyvi/.git/worktrees/Monyvi-issue347-voice-usage-limits/mobile-initial-red-results.json
```

Attempt 1 ended after **90,128 ms**, exit null, signal SIGTERM,
`timedOut: true`. The route suite completed in 55.773 seconds and reported two
intended assertion failures. No aggregate JSON file was produced, so no
four-suite totals or other suite results are inferred. Administrative evidence:
`mobile-initial-red-exit.json` and `mobile-initial-red-output.txt` in the Git
worktree administrative folder above.

The lead released one unchanged four-suite repeat with a 300-second bound to
complete the missing results. Attempt 1 was preserved. Attempt 2 used the same
command and paths with only `--outputFile` changed to
`E:/Work/My Projects/Monyvi/.git/worktrees/Monyvi-issue347-voice-usage-limits/mobile-initial-red-attempt2-results.json`.
It completed with **exit 1, signal null, no timeout, 71,839 ms broker
duration**; Jest reports 69.739 seconds. JSON timestamps span
14:58:29.183–14:59:38.905 UTC. Full output, JSON and exit record were
independently read, not just the summary. Administrative evidence:
`mobile-initial-red-attempt2-output.txt`,
`mobile-initial-red-attempt2-results.json`,
`mobile-initial-red-attempt2-exit.json`, in the same administrative folder.

**37 tests: 33 passed, 4 failed; 4 suites: 1 passed, 3 failed.** Three failures
are genuine behavior Red; the fourth is a test mock setup blocker. No per-file
retry or broader baseline/lint/type/format batch was executed.

| Suite                   | Passed tests | Failed tests | Result meaning                                                                              |
| ----------------------- | ------------ | ------------ | ------------------------------------------------------------------------------------------- |
| Add Transaction modes   | 0            | 2            | Both fail on missing Voice tab, after one passing control assertion each.                   |
| Custom bottom tab bar   | 3            | 0            | Existing mic callback, measured height and EN/AR semantics controls pass.                   |
| AI voice parser service | 28           | 1            | Existing response/date/error/privacy controls pass; new key wire assertion fails.           |
| Quick Action FAB        | 2            | 1            | Existing suppression/safe-area controls pass; new route test is blocked by its router mock. |

## Observed behavior and assertion reach

| Assertion / control                                                | Observed evidence                                                                                                                                                 | Classification                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| One Add Transaction header with `mode=voice`                       | Header-count assertion passed before the next failure.                                                                                                            | Passed control within a failing test.                                            |
| Voice mode tab exists                                              | `Unable to find an element with role: tab, name: Voice`, route test line 245. The route rendered its existing Manual form.                                        | Genuine behavioral Red.                                                          |
| Manual keypad changes visible amount to `1`                        | Pre-switch assertion passed; the failure tree contains `manual-amount` text `1`.                                                                                  | Passed control within a failing test.                                            |
| Safe Manual → Voice → Manual state retention                       | Missing Voice tab at line 264 prevents the first switch.                                                                                                          | Genuine missing-control Red; post-switch retention remains unexecuted.           |
| Manual tab existence and selected mode semantics                   | The earlier Voice lookup failed.                                                                                                                                  | Not reached.                                                                     |
| FAB explicit `/add-transaction?mode=manual` route intent           | `TypeError: _expoRouter.router.push is not a function` at production callback line 99 when the test advances 100 ms; zero passing assertions in that test.        | Mock setup blocker, not behavioral Red. Expected route assertion is not reached. |
| Existing center microphone callback, tab height and EN/AR metadata | All three tab-bar tests pass; mic callback fires exactly once.                                                                                                    | Passed controls; callback alone does not prove unified navigation.               |
| Existing FAB suppression and safe-area bottom inset                | Both pre-existing FAB tests pass.                                                                                                                                 | Passed controls.                                                                 |
| Stable requestKey sent for two same-key calls                      | Parser test line 319 expected `["voice-logical-request-347", "voice-logical-request-347"]`; received `[]`. Both calls completed with mocked successful responses. | Genuine behavioral Red for absent multipart request identity.                    |
| Existing callerLocalDate sent twice                                | The preceding line 318 assertion passed; JSON records one passing assertion in this failed test.                                                                  | Passed date-context control.                                                     |
| CallerTimeZone sent for the two calls                              | The requestKey assertion fails first.                                                                                                                             | Not reached; timezone is authored coverage, not executed assertion Red.          |
| Existing parser success/date/validation/error/privacy behavior     | All 28 existing parser tests pass, including success mapping, date fallbacks, categories/accounts, audio URIs, consent, malformed responses and AbortError.       | Passed mocked service regressions; no native/provider/SQL proof.                 |

A runner timeout is not behavioral Red. No route setup/import error appeared.
Although Jest's aggregate `numRuntimeErrorTestSuites` is zero, the FAB failure
occurs inside a test before its expected route assertion and is still a mock
setup failure. Classification follows the actual failing operation.

The proposal's eager `router: { push: mockRouterPush }` factory captures a mock
declared after the static component import. The observed non-callable `push` is
consistent with that initialization-order risk. The correction request is
test-only: create `jest.fn()` inside the router mock factory and retrieve it
through typed `jest.requireMock`, or defer access safely; preserve the exact
Manual-intent assertion and existing controls. The lead attempted this request
to the test author; conversation loading timed out, so delivery/acceptance and
correction remain unconfirmed. No production fix, test correction, weakened
assertion or third runner attempt was made by this worker.

## Remaining gates and coordination

The four-suite evidence is complete for this initial slice; FAB behavioral Red
still requires the author's mock correction and a separately released focused
repeat. Preserve both earlier attempts. Split or independently exercise the
timezone expectation before relying on it as executed Red. Invalid/missing route
intent, hidden inactive accessibility content, active mode locks, complete
Manual regressions, new-recording identity and refusal variants remain their
planned coverage; these initial assertions do not close their tasks. Honest
native/E2E execution, isolated target proof, rendered fidelity and accessibility
evidence remain separate open gates.

The readiness artifact was amended only to mark the three independently reviewed
sequence contradictions resolved and record the cleanup parameter freeze. Actual
SQL/race/job/batch/runtime evidence remains unfinished. Canonical planning,
ledger and task status remain lead-owned.

Evidence cutoff: **15:08:43 UTC**, **18 minutes 43 seconds** from assignment
start. Initial integration/report work is complete before the 15:10 checkpoint.
Temporary four-file test application ownership is released to the lead for
author correction and successor assignment; this worker awaits a new bounded
task and will not start the server/native successor independently.

## Released correction and navigation successor — 15:26:35 UTC

This separately authorized bounded assignment supersedes the earlier unresolved
FAB mock and timezone-assertion statuses; both earlier attempts remain preserved
above. Root reverified the same sibling checkout, branch and HEAD at 15:27.
External authors were frozen for these exact proposals. No production changes or
device actions occurred.

Read and integrated the complete author correction for the existing FAB/parser
tests, SHA-256
`c67120169a11eda27c19c6e37ca17b76f5fd813f1c391db340f798070ec33a1f`. The router
mock now defers access to its typed mock function. The existing request identity
expectation is retained, and timezone has an independently executed test. Read
and applied exact full-file navigation proposal SHA-256
`2dc69829a72ab94c7c6ffc9da7944f1b5cb58388a5aad3e83959f632d1e1a1c3`: new
`services/voice-entry-service.test.ts`, new
`app/voice-review-navigation.test.tsx`, new Maestro
`voice/add-transaction-modes.yaml`, and updated
`transactions/create-transaction.yaml`.

One corrected six-suite batch ran with a 300-second bound, using the same shared
dependency junction:

```text
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --runTestsByPath apps/mobile/__tests__/app/add-transaction-modes.test.tsx apps/mobile/__tests__/components/fab/QuickActionFab.test.tsx apps/mobile/__tests__/components/tab-bar/CustomBottomTabBar.test.tsx apps/mobile/__tests__/services/ai-voice-parser-service.test.ts apps/mobile/__tests__/services/voice-entry-service.test.ts apps/mobile/__tests__/app/voice-review-navigation.test.tsx --json --outputFile E:/Work/My Projects/Monyvi/.git/worktrees/Monyvi-issue347-voice-usage-limits/mobile-corrected-navigation-red-results.json
```

Captured 15:30:54.369–15:31:33.787 UTC: **39.418 seconds, exit 1, signal null,
no timeout**. Jest reports 33.932 seconds. Full stdout, exit metadata and
aggregate JSON were read: **6 suites, 41 tests, 34 passed, 7 failed; zero
pending tests, runtime-error suites or reported open handles**. All seven
failures now reach intended behavior assertions; the prior FAB setup failure is
resolved. Administrative evidence:
`mobile-corrected-navigation-red-{output.txt,exit.json,results.json}`.

| Suite                   | Passed | Failed | Executed behavior                                                                                                                                                                                             |
| ----------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add Transaction modes   | 0      | 2      | Existing header/amount controls pass; both tests fail finding the missing Voice tab. Post-switch retention and selected Manual semantics remain unreached.                                                    |
| FAB                     | 2      | 1      | Actual push is `/add-transaction`; expected `/add-transaction?mode=manual`, line 84. Existing suppression/inset controls remain Green.                                                                        |
| AI voice parser         | 28     | 2      | Same-key replay wire assertion gets `[]`, expected two identical keys, line 320; independent timezone gets `[]`, expected `["Africa/Cairo"]`, line 336. Caller local date and existing controls remain Green. |
| Voice review navigation | 1      | 1      | Discard returns to the origin Metals route. Retry actually returns to origin Metals with only `retry: "true"`; expected unified `/add-transaction` with `mode: "voice"` and retry, line 171.                  |
| Voice entry service     | 0      | 1      | Actual registered-entry behavior invokes no route callback; expected one push, line 31. Subsequent route-argument assertion is not reached.                                                                   |
| Custom bottom tab bar   | 3      | 0      | Existing mic callback, measured height and EN/AR controls remain Green.                                                                                                                                       |

Voice entry and review tests import actual service/route source with mocked
platform/presentation boundaries. They establish JS navigation behavior only. No
physical recording, native permission, background or rendered-device claim
follows from these results.

## Maestro source review — execution remains pending

Both authored YAML files were read completely and applied, but neither was
executed. Root relayed fixture/seed engine, current Manual add/edit routes,
amount display, card/filter components, grouping hook and actual
transaction-list read-model source. These are source findings, not E2E results.

- E2E fixture defines `E2E Cash` at
  `apps/mobile/scripts/seed-fixtures/e2e-fixture.js:11`. Seed engine defaults
  profile language to English at line 941 and marks cash default at line 970;
  base transactions are 125 and 3000 at lines 1087/1104. System schema has Food
  & Drinks as first ordered top-level expense category at
  `supabase/migrations/002_complete_schema.sql:785`. Current add route
  initializes account through the shared resolver and category from the first
  relevant category. This supports a controlled E2E fixture, not arbitrary
  already-running app state.
- Shared `helpers/setup.yaml` only conditionally ensures an account, then
  navigates to Transactions. Its fallback `create-default-account.yaml` creates
  `Test Wallet`. It does not itself force English, authenticate the intended
  fixture user, prove E2E Cash, or remove records from earlier runs. Isolated
  runner/build/account/fixture proof remains a precondition.
- `TransactionFiltersBar.tsx:110` provides `search-input`; `BaseCard.tsx:97`
  provides `transaction-card-${id}`. TransactionCard passes persisted
  category/account/note and shaped amount to the card. Reopening Edit
  Transaction is a meaningful persistence assertion once the specific newly
  created record is identified.
- Actual `filterDisplayItems` matches transaction amount with
  `item.amount.toString().includes(lowerQuery)`, plus note/counterparty/category
  name. Numeric `150` search is therefore supported, but also matches `1150`,
  `1500` and old `150` records. The YAML comment calling fixed 150 unique is
  unsupported; first generic card can reopen an earlier row. Correction
  requested through the lead: preserve persisted list/edit assertions and
  identify this run through a per-run visible note/counterparty marker, or an
  explicitly enforced fresh isolated fixture contract. Do not weaken persistence
  assertions.
- Modes YAML describes only Manual/Voice navigation, idle copy and Manual amount
  retention. It does not submit audio or prove recording/provider/review/quota
  behavior. Current mic runtime can start recording, so execution requires a
  separately controlled target and intended pre-change stopping point; no native
  action was attempted here.

Signed amount consumer proof and final completion timestamp are recorded in the
follow-up evidence below. The remaining coverage gates from the initial snapshot
still apply except the now-resolved FAB setup and now-executed independent
timezone assertion. No broad baseline, per-file lint/type/format, commit, push
or provider run was added.

### Final source proof and bounded handoff

The exact `-150 EGP` expectation is supported for the intended English/EGP
expense fixture. Actual Transactions route
`apps/mobile/app/(private)/(tabs)/transactions.tsx:418` passes
`formatSignedTransactionAmount(item)` to the card.
`apps/mobile/utils/financial-display.ts` prefixes `-` for an English expense,
then uses the standard numeric localized-money adapter. That adapter delegates
to the shared `packages/logic/src/utils/currency.ts:198` formatter: whole 150
has zero minimum fraction digits and EGP uses a suffix separated by one space.
TransactionCard passes that string unchanged to BaseCard. Existing currency
source tests corroborate integer, suffix and negative policies; those tests were
read, not rerun. This is consumer source proof, not rendered-device evidence.

The actual card press passes the selected record ID into `/edit-transaction`;
retain the reopened-edit assertions after fixing identification. Author
correction request is limited to per-run record identity plus the enforced
intended fixture precondition. Exact signed amount assertions need no weakening.
YAML execution remains held for that correction and separately verified isolated
runner/build/account/fixture target.

Successor evidence cutoff: **15:49:19 UTC**, **22 minutes 44 seconds** from
actual 15:26:35 intake. All authorized proposal integration and captured-run
interpretation are complete before the 15:58 hard bound. Temporary application
responsibility for both correction files, all four navigation proposal files,
and six server test adapter files is released to the lead. This worker has no
production ownership and starts no further runner or native assignment
independently.
