# Quickstart and implementation boundary

## Latest local implementation evidence — 2026-10-20

This supplement supersedes older pending counts below; historical records remain
preserved.

- Approved compact review corrections are implemented locally: title-column
  linked actions, aligned information rows, one-row horizontally scrollable
  overflow tabs, centered inline actions with red Remove, and account/category
  icon-label-pencil alignment with a separate optional status line. Touch hosts
  use literal 48px NativeWind dimensions with smaller 32px visual regions; Jest
  does not establish native geometry.
- Shared Dropdown and CurrencyPicker selected options, plus both review
  account-type pickers, use the same solid-green background and white selected
  foreground. This covers shared consumers, not every bespoke selector in the
  application.
- The new-account shared modal frame measures keyboard-adjusted available
  height, reveals the focused native input and moves its footer into scrolling
  content when needed. Existing suggested-account focus/layout safeguards
  remain. Samsung/iOS keyboard, native alignment, RTL, increased fonts,
  safe-area and touch geometry still require owner-device confirmation: NOT RUN
  by Root.
- The affected nine-suite UI cohort reached 163 passing tests after the single
  six-case editor rerun. After the final picker/style changes, the two affected
  suites passed 67 tests and mobile TypeScript passed. These are
  post-implementation regression checks, not TDD or a native visual pass. Normal
  repository commit hooks remain enabled.
- Sync rejection was reproduced on real SQLite when a default-clear update
  targets an account still classified as created. Commit 97e613e4 admits exactly
  one owned live default-clear account across created/updated buckets; other
  mutation requirements remain strict. Five affected sync/SDK lifecycle suites
  passed 73 tests. Missing, duplicate, foreign, deleted and still-default
  members remain rejected. Device sync success is pending; no new Save is needed
  for that check.
- PR #406 remains a separate logo-only stack above #396. Its refreshed parent
  integration and validation are tracked independently; do not infer logo device
  acceptance from the compact-review tests.

## Current tab correction — owner approval, 2026-10-21

The visible, horizontally scrollable tabs are **All / Needs review / Selected**
in that order (RTL mirrored). Missing-account/currency issues, including
discontiguous source rows and SMS ATM Cash destinations, stay in Needs review.
Keep direct Choose an account, truthful selected counts, inline linked rows and
selected-only Save. The 2026-10-20 fourth-tab interactive HTML is superseded
only for its tab navigation; immutable design files stay unchanged.

## Voice fixture entry and owner compact UI — 2026-10-20 (updated 2026-10-21)

This dated update supersedes conflicting earlier ACTIVE text below; original
quickstart, historical planning and evidence are otherwise unchanged.

Open **Settings → Development tools → Voice transcript fixtures**
(`/review-transcript-fixtures`) in a supported nonproduction build. The catalog
opens the normal `/voice-review` with a synthetic review session and transcript;
it does **not** use the old `reviewFixtureSceneId` harness, a microphone or
Gemini. **TEST Save is still a real guarded local Save**: check
Transactions/accounts before retrying an uncertain result.

In the current compact review, **All / Needs review / Selected** are the only
visible tabs. Missing-account/currency blockers, including discontiguous source
rows and genuine SMS ATM Cash destinations, remain under **Needs review** with
direct row-level account recovery. No `account_needed` canonical tab or new
session filter is introduced. An already-active legacy temporary account scope
can exit through `Show all`; it does not alter source order, globally selected
Save rows or counts. Pending groups still require explicit Confirm. The expanded
account card has **no duplicate account/currency action row**; amount/category
actions remain inline.

Both **Create account / New account** and suggested-group Edit use the existing
searchable **CurrencyPicker**, not currency chips. Opening that picker hides the
parent sheet, leaving one visible native modal; selection, Back/cancel and
return preserve local name/type/currency form state until final Confirm or
Cancel. No second currency-confirm overlay, FX conversion, premature physical
account or Voice-transfer expansion. Internal deferred account commands are
unchanged despite removal of visible “Draft” wording.

**Evidence status:** Root's original Game/CIB TEST Save and 7 Save suites / 97
tests PASS remain narrow; newer automated USD Save 5-case PASS is **not** device
visual acceptance. Root's follow-up 2 logic + 2 hook focused suites and logic
types PASS after an initial 27-suite 515 PASS / 1 precision-policy FAIL. Last
full mobile intake was 295 PASS / 45 FAIL **before** final UI-test repairs;
final affected rerun **PENDING**. Root's fresh SQLite Game/CIB collector has **1
guard / 1 effect and PASS**; zero-guard hypothesis was refuted, not exempted. B2
diagnostic-only changes and three sync/recovery suites / 39 tests PASS do
**not** establish a fix for the original device sync fault; its cause awaits a
new sanitized DEV `sync.financialActionRejected` log. Root owns UI
checks/commit/push; #405 logo draft PR #406 rebase and native
visual/accessibility approval remain **PENDING**. See the
[dated validation status](validation/compact-review-2026-10-20.md). No new
manual PASS is implied.

---

## ACTIVE manual QA entry — compact interactive #395, 2026-10-20

This active handoff supersedes the **historical planning commands and TDD/
image-binding prerequisites retained below**. Current delivery is direct
implementation, batched existing checks, owner manual feedback, meaningful
post-feedback regressions, and final affected checks. Financial/owner/sync
protection tests remain mandatory before merge where relevant. This document
does **not** authorize code writes, device access, account seeding, hosted
operations or new agents.

**Primary compact reference:**
[runnable interactive v1](mockups/interactive/compact-review-2026-10-20/index.html)
with [short README](mockups/interactive/compact-review-2026-10-20/README.md).
Open `index.html`, not `source.fragment.html` by itself. Browser controls cover
320–430 **CSS px**, font 1.00–1.25 and long-account names; they are design
exploration, **not** proven native dp/RTL/safe-area geometry. No new interactive
binding sidecar, separate metadata approval or second owner design approval.
Historical B1/R1–R3 images/sidecars/receipts remain unchanged and governed only
in their earlier scope. See
[compact contract](contracts/compact-review-ui-contract.md),
[active manual-plan scenarios](manual-test-plan.md) and
[compact validation/evidence register](validation/compact-review-2026-10-20.md).

### Three non-interchangeable QA paths

1. **Controlled Voice transcript fixture, real review page.** Use the existing
   nonproduction **Settings → Development tools → Voice transcript fixtures**
   (`/review-transcript-fixtures`) catalog. Launch the transcript fixture; it
   passes `reviewSession`, `transcript` and `detectedLanguage` to the normal
   `/voice-review` route. The `reviewFixtureSceneId` query is a separate old
   Maestro scene harness and is **not** the manual catalog. For selected CIB /
   `[TEST] Game` and unselected QNB, synthetic text drives the _real current_
   account-review controls and **real clearly marked TEST Save**. It does
   **not** call the microphone, Gemini, transcription or SMS provider. Open
   collapsed account review/two-line transcript, missing-account rows under
   Needs review with inline account choice, linked rows, explicit Confirm,
   compact inline ellipsis, one chooser/overlay, ready auto-selection with
   manual opt-out, Undo/Discard lease, footer/insets and responsive conditions.
   A TEST Save can persist local account/financial records—**not a dry run**.
   **Before retrying an uncertain Save, check Transactions and the account
   list**; a successful Save must not be mistaken for a failure and repeated.
2. **Actual Voice capture is different evidence.** Only real owner-authorized
   recording can cover permission rationale/grant/denial,
   recording/interruption, temporary file cleanup, transcription/Gemini, spoken
   currency extraction, provider/usage failures and recorder lifecycle. Voice
   transfers remain **out of scope**.
3. **Targeted SMS shared-path regression.** Recheck account/default choice,
   ordinary SMS Cash-source exclusion, genuine ATM Cash destination,
   session/recovery/Undo/Discard semantics, selected-only Save/replay, SMS
   fingerprint and safe sync/pull/ACK. Reuse controlled scenarios and existing
   deterministic SQLite coverage. Do **not** turn this into a full
   provider/parser retest for untouched SMS behavior or invent an SMS Maestro
   journey.

The catalog scenario `voice-shared-drafts-qnb-cib` is a transcript fixture ID,
not a Maestro scene identifier; do not interchange them.

### Current compact acceptance orientation

- Review details starts collapsed and shows groups **inline** when expanded;
  `Accounts reviewed` is conditional. Transactions appear early; the transcript
  starts at **two lines** and expands. No `View all` and no implicit
  confirmation by clicking a pending-group transaction.
- Missing-account rows stay in **Needs review**, while linked rows expand
  inline. Any legacy in-flight account temporary scope can exit via `Show all`
  without changing selected/Save scope. Ready rows auto-select initially/when
  newly ready, explicit manual uncheck stays honored, and `Select ready`
  reselects eligible rows **in the active filter**.
- One account chooser shows current choice/type/currency and affected rows.
  `Use account — EGP/USD` applies authoritative account+currency together,
  **without FX conversion, a standalone currency-only action, or a second
  confirmation modal**. New account name/type/currency stay in one form, reusing
  the shared CurrencyPicker there, and persist only on final selected Save.
- Remove shows a ghost with Undo and final Discard; Discard must revoke the
  **actual current-review Undo lease**, not just hide a control. No deletion of
  transactions or accounts. Only one overlay is active.
- Native review needs small _painted_ account/category pencil-square controls
  with **44/48dp effective targets**, actual container-fit reflow for long
  names/category/font scale, inline status/count dot only when truly on one
  line, readable dark information and final divider correctness. Page notices
  remain sticky/dismissible below PageHeader/outside scroll, never new toasts;
  keyboard/safe-area/footer and EN/AR RTL require **native evidence**, not web
  screenshots.

### Evidence status; no inferred acceptance

**Owner-reported 2026-10-20:** one selected CIB / `[TEST] Game` fixture Save
succeeded after Root's trusted calendar-bound predecessor repair, with the
record observed in Transactions. **Root-reported Save cohort:** 7 affected
suites / 97 tests PASS, TypeScript PASS, lint PASS across 11 Save files. Neither
report establishes a broad compact UI pass or native visual/device/
accessibility acceptance; those checks remain **NOT RUN** in this handoff. The
original Voice/Add Maestro YAMLs are authored historical `NOT RUN` artifacts,
**not verified compatible** with the current compact controls. #405 institution
logos / PR #406 is a **separate draft stacked on #396**, not integrated into the
current #396 compact manual baseline.

For future evidence, log _which_ fixture, real Voice or SMS path was actually
performed; observed versus expected behavior and scoped native build/width/
font/theme/locale/inset/screen-reader status. No completion checkbox is inferred
from this quickstart.

---

## HISTORICAL planning quickstart, 2026-10-14–17 (preserved verbatim)

### Superseded for active compact review testing

All commands run from `E:/Work/My Projects/Monyvi` on
`codex/395-shared-account-review`. Use lean-ctx tools for shell/read/search.
Planning has no dependencies to install, provider calls, emulator or data
mutation.

## Approved inputs

- Exact [spec approval](approvals/spec-2026-10-14.json).
- [B1 approval receipt](approvals/b1-2026-10-14.json) freezes manifest
  `sha256:cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`.
- All23 canonical sidecars pass; original image and Binding Facts bytes
  unchanged. Original proposal headers remain historical; current receipt
  overrides statuses.
- [Plan](plan.md), [research](research.md), [data model](data-model.md) and four
  [parser](contracts/parser-evidence.md)/[review](contracts/review-commands.md)/
  [save](contracts/financial-save.md)/[default intent](contracts/account-default-intent.md)
  contracts.

## Next gates

1. Run speckit-tasks after checking extensions; derive test-first canonical IDs
   from M01–M20 and approved contracts, not an independent team plan.
2. Run speckit-analyze; resolve spec/plan/tasks/contract contradictions before
   ownership assignments or production edits.
3. Discuss full delivery estimate12–18h and approve concrete local SQL/sync
   scope in financial-save and account-default-intent contracts before
   implementation. No hosted DDL/deploy included.
4. Dispatch bounded non-overlapping slices in Normal ChatGPT → independently
   verified OpenCode FREE models (never paid) → Antigravity Gemini/Claude order.
   Verify actual model/pricing and callable runtime without quota prechecks;
   runtime setup/repair is root-owned. Native workers are prohibited until
   Mohamed explicitly approves the exact proposed task/files/duration and
   stop/reassignment terms **before** any spawn, resumption or follow-up,
   including review/local checks. Unavailable pools do not imply permission. Do
   not spawn planning workers now.
5. Author meaningful Red unit/integration/E2E fixtures before production. Checks
   run at authorized batched boundaries; no emulator execution.

## Planning validation

Verify receipt hashes, canonical sidecars and all pinned dependencies; check
Markdown formatting, whitespace, source links, complete requirement mapping and
no unresolved plan placeholders. Exact commands/results recorded in validation.
No app test pass follows merely from approved design/docs.

## Future consolidated implementation check batch

After changes are integrated, use repository focused test entry points for
logic, mobile review/services/routes, provider schema/parity tests and the new
pgTAP action. Run mobile typecheck, scoped lint/i18n/privacy and actual commit
hooks. Target paths/test filenames come from tasks, not from nonexistent test
commands. Author Maestro journeys under apps/mobile/e2e/maestro and parse/check
their syntax; do not execute emulator/device runs under current no-emulator
instruction.

Schema tooling warning: `npm run db:migrate` invokes hosted db:push in this
repo. Do not run it as a harmless local generator. Use the approved local
migration validation/type-generation path after explicit scope approval; inspect
exact scripts first and preserve complete local schema. Hosted migration
requires separate authorization. No install/seed/reset to make planning checks
pass.

## Owner manual/device plan

Use M01–M20 and the approved390×844 binding context. Record actual screen dp,
insets/theme/language/font scale, compare governed regions and responsive
variants. Confirm initial recording/parsing paths unaffected; real Voice/SMS
evidence, keyboard, TalkBack/VoiceOver and provider semantics are owner-run
boundaries. No new helper/currency modal art. Report functional and visual
status separately; unexecuted rendered/accessibility evidence prevents a
visual-complete claim.
