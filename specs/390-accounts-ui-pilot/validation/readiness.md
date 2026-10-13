# Foundation readiness and execution boundary

**Status (2026-10-11):** Foundation-first PR **authorized by Mohamed**, but
**production source remains frozen**. Tests-only T006/T007 and local
deterministic Red are complete; **T003 authenticated public-path harness / T008
E2E Red / overall T009 gate are NOT PASS**. The Accounts Add/Edit route
migration is a **different future PR**, not part of T001–T013. This document
records facts and remaining gates, not an instruction to resume source edits.

## Current authority, dependency, duration and branch

- Repository: `Msg22/Monyvi`; governing main
  `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`. AGENTS.md, constitution, business
  decisions, team-led-delivery and sprint-issue apply, with **strict meaningful
  Red before production changes**.
- Pending dependency: PR #383 remains **OPEN** at
  `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`, branch `389-voice-usage-limits`.
  Earlier `d45745a5...` observations are historic, **not** the current
  dependency.
- Foundation worktree: `E:/Work/My Projects/Monyvi-ui-field-foundation`, branch
  `codex/ui-field-foundation`, stacked on `389-voice-usage-limits`. **Intended
  foundation PR base:** that 389 branch; coordinator should retarget to `main`
  only after PR #383 merges. **No PR creation, retarget or merge is authorized
  by these docs.**
- Immutable source/test checkpoint for this documentation assignment:
  `6e51a4889da545f64d6de0a19f848ca764b3161f`. Current shared-field production
  files remain identical to the pending dependency `0e7ee55...`; the foundation
  commits to this checkpoint contain approved planning/mockup artifacts, T005
  contract and tests, **not source implementation**.
- Mohamed approved **4–6 hours total** for foundation-first work, starting
  **2026-10-11 08:06:26 UTC**; the root's **90-minute checkpoint forecast
  remained 4–6 hours**. This is the recorded forecast, not a new time promise or
  proof that blockers have cleared.
- Only **T001–T013** are in the foundation wave. No Account routes,
  provider/business decisions, service/DB/schema/migrations, general #359/#360
  rollout, or other product work is authorized.

## Immutable visual authority

The eight-image binding package is
`sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`. Root
QA independently reverified all **8/8 canonical binding pairs PASS**, unchanged.
Retain the entire manifest, PNG/binding sidecars, design contract and referenced
CSS on this branch. Approval authorizes the scoped visual contract, **not** a
claim that native rendering, RTL keyboard/caret, TalkBack or tablet/landscape
fidelity passed. **All 35 Accounts QA scenarios remain NOT RUN**;
foundation-only work cannot complete them.

## Task-by-task evidence and gate

| Task          | Factual disposition at this checkpoint                                                                                                                                                                                                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T001**      | **Scope/forecast/route recorded.** Foundation-first T001–T013 and intended stacked PR approved. Duration 4–6 h, start 08:06:26 UTC; individual future source file ownership still requires explicit root assignment.                                                                                                                                                  |
| **T002**      | **8/8 binding integrity PASS** at unchanged approved package. Native visual parity **NOT RUN**.                                                                                                                                                                                                                                                                       |
| **T003**      | **BLOCKED / NOT PASS.** Private Pixel7 emulator/adb/Metro/proxy and public auth UI/driver are usable, but authenticated startup cannot recover the synthetic local profile because the existing local Supabase schema misses `seal_sync_pull_v1(p_upper_watermark)` and migrations 082–085. Root authorized an isolated disposable local stack; success not reported. |
| **T004**      | Separate independent five-suite test review published on M1 review branch at `ce534f1f8d5096edf34314bbf38087829f0b7ec1`; its Q1–Q5 strengthening accepted. This review does not establish the full separate 35-case runtime audit or T009 acceptance.                                                                                                                 |
| **T005**      | **COMPLETE.** Frozen source-pinned API contract at `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78` in `validation/foundation-contract.md`; current PR383 behavior reconciled.                                                                                                                                                                                              |
| **T006/T007** | **Tests-only authored.** Five existing suites at `f937a1ee...`, strengthened Q1–Q5 at immutable `6e51a488...`; S1 preserved old cases. No production changes.                                                                                                                                                                                                         |
| **T008**      | **NOT EXECUTED / NOT INTEGRATED.** M1 has three new YAML files on **separate** branch `codex/ui-field-foundation-e2e` (reported author commit `5c64a96`). Independent audit found two stale detail selectors; author corrections pending. There is no authenticated feature-E2E Red.                                                                                  |
| **T009**      | **UNIT/COMPONENT RED VERIFIED LOCALLY ONLY.** Initial f937 52 FAIL / 79 PASS / 131; strengthened 6e51 66 FAIL / 91 PASS / 157 (mobile 42/45/87, logic 24/46/70). **Overall T009 not accepted**: T003 and T008 public-path prerequisites outstanding; see `validation/foundation-red.md`.                                                                              |
| **T010–T012** | **BLOCKED; NO SOURCE AUTHORIZATION.** Must receive root's accepted harness/E2E/meaningful T009 record, exact compatible implementation ownership and a fresh immutable head.                                                                                                                                                                                          |
| **T013**      | **PENDING Green.** After authorized implementation, rerun changed five suites and existing seven consumer suites (baseline 108 PASS), then verify typecheck/lint/i18n and record native visual/accessibility separately.                                                                                                                                              |

### Baseline and meaningful Red, without overclaiming

The unchanged production baseline at `4b64cf97296583975cc9b6fef12475ddb853ccb9`
passed **12 suites / 178 tests**: logic 39, four shared UI suites 31, and seven
current-consumer suites 108. This baseline **does not** count as post-Green
compatibility proof.

NativeQA executed strengthened Red in a clean detached local
`Monyvi-ui-field-red` at **exact `6e51a488...`**. Mobile: **42 failed, 45
passed, 87 total, 43.324 s, exit 1**; logic: **24 failed, 46 passed, 70 total,
3.814 s, exit 1**. Reported **zero setup/type/timeout failures** and no
production helper/component delta relative to `0e7ee55...`. Real failures
include missing opt-in helper APIs, malformed `abc12345 → abc12,345`, signed
paste canonical mismatch, forced outlined field, missing accessible
labels/Dropdown value, warning/error behavior. Some later assertions inside
Q4/Q5 tests are blocked behind earlier expected failure; rerun after Green.
Remote documentation writer did not execute these tests. Exact
evidence/remaining limitations are in
[`foundation-red.md`](./foundation-red.md).

## Native T003 facts and safe execution boundary

- Isolated **Pixel 7 emulator `5554`**, private SDK adb server **`5038`**
  (global adb unchanged), owned Metro **`8082`**, private outside-repo
  ordinary-JavaScript proxy **`8083`** used to avoid an Android multipart
  `ProtocolException` before JavaScript. This is a bounded runtime workaround,
  not a product-source patch.
- Actual public **WELCOME TO MONYVI** auth UI and Maestro driver/openLink
  succeeded. Guarded synthetic **local** auth reached authenticated startup, but
  profile recovery still failed due to absent
  `seal_sync_pull_v1(p_upper_watermark)`; migration baseline **082–085 missing
  while 086 present**. A synthetic server profile existing is not equivalent to
  an authenticated usable app session.
- Root authorized a **new disposable, isolated local** migration stack;
  **existing DB untouched**. Setup/authenticated usable public-path proof is
  pending; do not log secrets, passwords, raw fixture/profile data, or
  environment contents in tracked documentation.
- No feature E2E Red, native clipboard/caret/IME, screen reader, merged YAML, or
  Account journey has passed. Do not create a test-only product page, bypass
  auth, or label a JavaScript/proxy workaround T003 PASS.

## Active exclusive workers and stop rules

See [`implementation-ownership.md`](../implementation-ownership.md) for complete
map. **S1 Normal ChatGPT** is sole tracked writer on `codex/ui-field-foundation`
**for three authorized documentation paths only** at this wave; source/tests are
frozen. **M1 Normal ChatGPT** owns independent QA and exactly three new YAML on
a separate E2E branch; do not merge the review or E2E branch here. Native
`accounts_mockup_finish` performs isolated test/selector review without tracked
writes; native `accounts_docs_integration` handles only private runtime, with
future shared integration reserved under new assignment. Root coordinates in a
read-only Git/ledger role. Former native author workers are stopped; no
concurrent foundation source writer is active.

Stop for branch drift/overlapping owner. No tracked code/test/source, PR, merge,
issue, locale, database or provider mutation is authorized by this readiness
update.

## Verification commands — examples only, NOT RUN by docs writer

Future local test runner may use existing package scripts, recording the **exact
actual invocation** and result, rather than treating the following as a
previously executed command:

- `npm test -w @monyvi/mobile -- --runInBand --runTestsByPath __tests__/components/ui/TextField.test.tsx __tests__/components/ui/GroupedDecimalInput.test.tsx __tests__/components/ui/Dropdown.test.tsx __tests__/components/ui/GroupedMoneyInput.keyboard.test.tsx`
- `npm test -w @monyvi/logic -- --runInBand --runTestsByPath src/utils/__tests__/amount-helpers.test.ts`
- `npm run typecheck -w @monyvi/mobile`; `npm run typecheck -w @monyvi/logic`;
  `npm run lint -w @monyvi/mobile`; `npm run i18n:check -w @monyvi/mobile`

Only the root/NativeQA runtime owner may handle authenticated test harness,
private configuration, disposable migrations and Maestro. Setup failures do not
satisfy Red. **Document status is evidence-only, not implementation approval or
a release claim.**
