# Accounts pilot — current foundation-first ownership and deferred adoption

## Current separate Accounts migration — supersedes historical Foundation-only status below

**2026-10-11:** Mohamed **authorized** the separate Accounts Add/Edit migration
stacked on Foundation PR #390, with unit/integration/E2E tests deferred for
later human manual verification. Root issued SOURCE GO at migration plan
`488731442edfcaca96e680cbaf61d993805ce18c`. S1 Normal ChatGPT exclusively
authored the four scoped UI files and the one approved uniqueness-document
paragraph at source commit `0b780d05bda5e4d34c8e53e213502eda94316b47` on
`codex/accounts-form-migration`; the Foundation base remains
`b4a656e66263554a5dc001cee83a1431a3a9110b`. **Source owner released after
handoff; root static hooks/typechecks and M1 independent source review remain
pending.** No concurrent Foundation/Account source writer, review-branch
overwrite, PR or merge action. `InstitutionProviderSection`,
`SmsMatchingSection`, `BalanceChangedSheet`, tests, locales, hooks/services and
mockups are unchanged. **All 35 Accounts manual QA cases NOT RUN.**

The subsequent Foundation-first worker table, T001–T013 gate text and older
"production frozen" statements are retained as **dated historical evidence for
the earlier Foundation wave**, **not current authorization status for this
human-approved separate Accounts migration**. These do not expand future write
ownership.

**Status, 2026-10-11:** Mohamed has **authorized foundation-first T001–T013 and
its eventual PR**, with approved **4–6 hours** from **08:06:26 UTC**.
**Production source remains frozen**: meaningful **unit/component Red** has been
locally verified, but T003 controlled authenticated runtime and T008 public E2E
Red are **NOT PASS**. No source implementation owner is presently authorized.
Add/Edit Account adoption is a **separate later PR**, outside this foundation
wave.

**Trusted governance:** `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`.  
**Pending dependency:** PR #383 OPEN at
`0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`, branch `389-voice-usage-limits`.  
**Foundation source/test checkpoint:**
`6e51a4889da545f64d6de0a19f848ca764b3161f`, branch `codex/ui-field-foundation`,
stacked on `389-voice-usage-limits`. The intended foundation PR base is the 389
branch; coordinator later retargets to `main` **only after** dependency merge.
These statements **do not authorize creating, retargeting or merging any PR
now**.  
**Approved visual package:**
`sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`, 8/8
immutable bindings PASS; native fidelity remains NOT RUN.

## Active lanes — exclusive boundaries

| Lane / owner                                                  | Currently authorized work                                                                                                                                                                                                                                                                                                                                          | Explicit exclusions / state                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1 Normal ChatGPT** — API/test/docs writer                  | Completed T005 API contract (`8fe1e021...`); completed tests T006/T007 and accepted Q1–Q5 additions at `6e51a488...`. **This assignment alone** permits factual tracked docs edits in `specs/390-accounts-ui-pilot/validation/readiness.md`, **new** `validation/foundation-red.md`, and `implementation-ownership.md`. Releases these docs on completion.         | **No source, tests, other docs, mockups, locales, schema, services, routes, PR/issue/merge or other tracked writes.** A future foundation-source lane requires a new explicit root assignment after all gates.      |
| **M1 Normal ChatGPT** — independent QA and bounded E2E author | Separate review branch `codex/ui-field-foundation-test-review` published immutable audit `ce534f1f8d5096edf34314bbf38087829f0b7ec1` (`validation/foundation-test-review.md`); root accepted Q1–Q5. Separate **E2E** branch `codex/ui-field-foundation-e2e` has three new YAML at reported `5c64a96` (short SHA), two stale detail selectors undergoing correction. | **No writing on the foundation branch** in this wave. Review document and three YAML have **not been merged**, and E2E has not run. The audit is independent evidence, not a new business rule or source authority. |
| **Native `accounts_mockup_finish`**                           | Independent local test/selector audit.                                                                                                                                                                                                                                                                                                                             | No tracked writes or competing foundation ownership.                                                                                                                                                                |
| **Native `accounts_docs_integration`**                        | Private outside-repository runtime setup/recovery; later **reserved integration** candidate only by separate new assignment.                                                                                                                                                                                                                                       | No foundation tracked writes, shared locale/barrel/style work or source changes under this assignment. Private emulator, disposable local schema stack and fixture work are not tracked docs material.              |
| **Root coordinator**                                          | Ledger, factual verification, read-only Git orchestration, ownership assignment and approval gates. Owns independent NativeQA runtime proof/acceptance coordination.                                                                                                                                                                                               | No parallel source or documentation writer and no automatic merge/PR operations.                                                                                                                                    |
| **Former native specification/mockup workers**                | Stopped; prior authored artifacts preserved.                                                                                                                                                                                                                                                                                                                       | No active ownership.                                                                                                                                                                                                |

OpenCode had an actual free-tier 403 and a bounded no-response alternative;
those attempts were stopped. A usable Antigravity callable CLI route was
unavailable and has no active task. These operational facts are not interpreted
from opaque assistant result bodies and confer no fallback implementation
authority.

## Completed evidence versus blocked permissions

1. **T001/T002**: Foundation-first duration/route authorized; approved package
   unchanged and independently **8/8 binding PASS**.
2. **T005**: One contract file published at
   `8fe1e021cc8ae393bd4c001d5e7901a880b1ae78`; existing PR #383 focus/blur,
   nullable/error/adornment and keyboard/ref behavior remains the baseline.
3. **T006/T007**: Five existing test files extended, then Q1–Q5 strengthened at
   immutable `6e51a4889da545f64d6de0a19f848ca764b3161f`. No production changes.
4. **Unit Red**: NativeQA clean detached run at strengthened 6e51 reported
   mobile **42 fail / 45 pass / 87 total** (43.324 s) and logic **24 fail / 46
   pass / 70 total** (3.814 s), exit 1 both, **zero setup/type/timeout
   failures**. Previous f937 initial Red: **52 fail / 79 pass / 131 total**.
   Unchanged 4b64 baseline: **12 suites / 178 PASS** (logic 39, four UI 31,
   seven consumers 108). See
   [`validation/foundation-red.md`](./validation/foundation-red.md) for failure
   categories, immutable pins and evidence limitations.
5. **T003 remains BLOCKED**: Isolated Pixel7 emulator `5554`, private adb
   `5038`, Metro `8082`, outside-repo ordinary-JS proxy `8083`; actual WELCOME
   TO MONYVI UI and Maestro driver/openLink succeeded. Synthetic **local** auth
   progressed to authenticated startup, but profile recovery is blocked by
   existing local schema missing `seal_sync_pull_v1(p_upper_watermark)` and
   migrations `082`–`085` despite `086` present. Root approved a disposable
   isolated baseline-migration stack; no completed authenticated product path
   has been reported. Existing DB must remain untouched.
6. **T008 public E2E**: Three authored but unintegrated/unexecuted YAML on M1's
   separate branch; audit corrections still outstanding. **T009 overall not
   accepted**, despite genuine unit/component Red. No actual native caret,
   clipboard, IME, TalkBack, app screenshot comparisons, or Account journeys
   have passed.
7. **T010–T012 source BLOCKED**, T013 post-Green compatibility pending. All **35
   Accounts manual QA scenarios remain NOT RUN**; this does not count as
   foundation completion or Accounts migration delivery.

### Stop/transfer contract

- The current **DOCS-ONLY allowlist is exactly three paths**:
  `specs/390-accounts-ui-pilot/validation/readiness.md`,
  `specs/390-accounts-ui-pilot/validation/foundation-red.md` and
  `specs/390-accounts-ui-pilot/implementation-ownership.md`. No other tracked
  file owner overlaps S1 during this bounded documentation task. After
  publication the lane releases tracked ownership and awaits new instructions.
- Root must explicitly validate T003/authenticated driver/isolated data and a
  meaningful T008 real public-path signal, then accept overall T009 before
  commissioning source. **No automatic source write after deterministic Red.**
  Stop on branch drift or newly shared file ownership.
- Future source work must be one exclusive, explicitly named allowlist with TDD
  Red/Green evidence, current PR383 merge/topology review and no unapproved
  design, finance, service, or schema changes. Native test-only routes and
  bypasses are not permitted.
- Preserve separate independent QA review and test authorship. M1's review/E2E
  branches must be integrated only by later root instruction, with exact
  verified SHA and diff. Root owns decision on any stale selectors/driver
  capabilities.
- When source reaches Green, rerun both changed five-suite set and **seven
  existing consumer suites**; the earlier **108-pass consumer baseline at 4b64**
  is not post-Green proof. Verify typecheck/lint/i18n; report CI, native/device
  E2E, rendered fidelity and accessibility separately.
- **No Account Add/Edit migration** and no app-wide #359/#360 closure from
  foundation-only work. No private tokens, passwords, raw fixture/profile data,
  environment contents or unreviewed DB changes in repository docs.

## Candidate **future** implementation file lanes (NOT authorized now)

These are planning candidates retained for a separately assigned implementation
wave, not a current grant:

| Future exclusive lane                 | Candidate source                                                                                                                           | Required tests / dependency                                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure shared amount input              | `packages/logic/src/utils/amount-helpers.ts`                                                                                               | T006 focused opt-in signed/raw helpers with unchanged unsigned two-argument resolution, Metals 3-decimal weight and no new precision/rounding. Root first accepts T009 and gives an exclusive source allowlist.                                                                         |
| Shared UI fields                      | `apps/mobile/components/ui/{TextField,Dropdown,GroupedDecimalInput,GroupedMoneyInput}.tsx`                                                 | T007 existing suites, current PR383 focus/blur/ref/soft keyboard/null/error/adornment, real EN/AR required naming and default outlined/unsigned compatibility. `FieldLabel`/`FieldMessage` only if concrete repeated responsibility; no generic picker or unrequested currency adapter. |
| Shared integration                    | Exact approved EN/AR locale, export/barrel, styling paths **only if technically necessary**                                                | Reserved separate owner, explicit request and exclusive file assignment; existing common required-name keys and amount-helper wildcard barrel should be reused first.                                                                                                                   |
| Accounts adoption (later separate PR) | `apps/mobile/app/(private)/add-account.tsx`, `edit-account.tsx` and specifically approved Account Type/provider/SMS/locked/sheet consumers | Later tests-first real Add/Edit public paths, 35-case QA and scoped mockup fidelity; **none** part of foundation work.                                                                                                                                                                  |
| Independent audit/QA                  | Reports, separate approved runner evidence only                                                                                            | Source-pinned review of real Green, seven consumer regressions, actual native screenshots/accessibility; no implementer's source mutation.                                                                                                                                              |

Sibling worktrees and existing checkout data must remain isolated. Do not
install dependencies into the shared worktree or alter unrelated pending work.
**This ownership document has no implementation or merge authority.**
