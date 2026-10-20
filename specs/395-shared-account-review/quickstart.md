# Quickstart and implementation boundary

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
   collapsed account review/two-line transcript, discontiguous Account
   needed/Show all, linked rows, explicit Confirm, compact inline ellipsis, one
   chooser/overlay, ready auto-selection with manual opt-out, Undo/Discard
   lease, footer/insets and responsive conditions. A TEST Save can persist local
   account/financial records—**not a dry run**. **Before retrying an uncertain
   Save, check Transactions and the account list**; a successful Save must not
   be mistaken for a failure and repeated.
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
- Account needed/linked-row views are **temporary** source-ordered filters with
  `Show all`; selected/Save scope stays canonical. Ready rows auto-select
  initially/when newly ready, explicit manual uncheck stays honored, and
  `Select ready` reselects eligible rows **in the active filter**.
- One account chooser shows current choice/type/currency and affected rows.
  `Use account — EGP/USD` applies authoritative account+currency together,
  **without FX conversion or a second Confirm Currency modal**. Separate
  currency-only picker may still be used independently. Draft name/type/
  currency stay in one form and persist only on final selected Save.
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
