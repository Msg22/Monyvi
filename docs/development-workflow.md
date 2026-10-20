# Delivery workflow

## Shared selection and keyboard standards (2026-10-20)

- **Current worker source:** Before remote authoring, provide the exact relevant
  current file revisions or minimal safe patches when local work differs from
  the published branch. The worker must identify its source preimages. At
  integration, match them or perform a preserving merge; never replace newer
  local UI or instructions with a full file based on an older remote snapshot.
  Source freshness is separate from the trusted governing revision and adds no
  design-approval gate.

## Global form interaction standards (owner-approved 2026-10-20)

All new or modified dropdown/picker selected options MUST show the current
choice immediately on open with a filled approved Nile-green selected
background, WHITE readable text in both light and dark modes, and a contrasting
white selected check/icon (never green on green). Use shared `Dropdown`,
`CurrencyPicker` and their state/accessibility contracts rather than local
duplicates. Add a focused source/render-contract regression of the real opened
selected option after implementation; verify visual contrast/RTL separately when
native evidence is authorized.

All form text inputs (pages, modal/sheets, last fields) MUST remain visible,
focusable and scrollable above the keyboard on Android and iOS, compact screens,
landscape and enlarged fonts, despite modal headers, safe areas and fixed
footers. Use measured available keyboard-adjusted viewport/layout space and
shared keyboard-aware/scrollable form patterns, not fixed screen-height or
keyboard-padding guesses. Focus/scroll the field and label/error into view;
ensure submit/cancel can be reached. Cover deterministic contracts in affected
tests, and record **native/manual keyboard, font-scale and RTL** checks as **NOT
RUN** until actually performed. Do not infer device PASS from source/tests.

This is a **global standard**, not proof that existing bespoke pickers/forms
have been migrated. Shared component enforcement is a separate owned effort;
audit/adopt older bespoke usages incrementally in their scoped changes. It adds
no new mockup approval, binding artifact, TDD sequence or broad refactor gate.

**Owner-approved policy: 2026-10-18.** Applies to new work and unfinished work,
including #395. Replaces mandatory TDD sequencing in older project guidance.
Product approval, approved mockups, Speckit analysis, architecture, financial
invariants, privacy, sync protection and worker authorization still apply.

**Prospective UI design policy (approved 2026-10-20):** Before implementing
meaningful visible changes, present a runnable, revisioned interactive design
under the feature's `mockups/`, with a short README for version, run steps,
scenarios and native-only differences. Approve the **reviewed runnable design
once**; it is the layout/visual authority and requires no new binding sidecar,
metadata/hash tuple or duplicate approval. See
[interactive design workflow](design/interactive-design-workflow.md) and the
sprint-issue micro-UI exception. Browser behavior is simulated; actual native
render/device acceptance remains separate. Historical approved images, sidecars
and evidence are untouched.

## Delivery sequence

1. **Direct implementation.** Implement the approved behavior with existing app
   patterns and the smallest cohesive change. Confirm a bug's root cause using
   code, logs, reported reproduction or other concrete evidence; a newly written
   failing test is not a prerequisite. Plan manual scenarios before handoff.
2. **Batched checks and manual-ready handoff.** At the integration/pre-commit
   boundary, run TypeScript, lint and relevant existing automated tests
   together, plus applicable repository hooks and required safety checks. Do not
   run checks after every file edit. Report exact results, known gaps and manual
   steps. Responsive UI follows `AGENTS.md`'s available-container rule; use
   existing checks and owner manual review of representative small, ordinary,
   wide and enlarged-text states, not mandatory cosmetic layout-test matrices.
   For new/changed app feedback, also follow `AGENTS.md`'s prospective sticky
   inline notice and dark informational-contrast policy; gradual legacy
   migration does not introduce an extra delivery ceremony. After authoring,
   **before replacing a live/running checkout with released worker source
   artifacts**, Root uses the existing intake guard to check staged TS/JS/JSX
   syntax validity (including braces, quotes and JSX). Reject malformed
   artifacts before applying them; this is post-implementation intake, **not**
   tests-first/TDD or a new framework, test matrix or native-device gate. Source
   `className` assertions verify authored props only, not Babel/ NativeWind
   transformation or the rendered UI; report those evidence types separately,
   leaving visual acceptance to owner manual review.
3. **Owner manual testing.** Mohamed tests the implemented behavior. Capture his
   feedback, fix confirmed defects, and repeat affected manual scenarios until
   he accepts the behavior. Agents must not invent a manual pass. No emulator or
   device execution unless Mohamed explicitly requests it.
4. **Automated regression coverage.** After behavior settles, write or update
   meaningful unit/integration tests and controllable E2E flows covering manual
   feedback, approved core paths and relevant edge cases. Tests must assert the
   expected contract, not merely mirror the implementation. A successful manual
   run does not make regression coverage unnecessary.
5. **Final validation and merge readiness.** Run a consolidated affected check
   batch after the final code/test changes. Keep hooks and CI enabled. Report
   manual acceptance, automated results and unexecuted coverage separately
   before claiming merge/release readiness. Publishing a manual-ready PR does
   not mean manual acceptance or final readiness has been achieved.

If manual feedback is still pending, mark that stage **awaiting owner manual
testing**. Continue independent authorized work; do not silently omit the stage,
fabricate feedback, or mark feedback-dependent test tasks complete.

## First-release scope and rare cases

Cover the approved core design and functionality. For a rare or very rare edge
case, ask: **Would releasing without handling this case cause a major problem?**

- **Yes:** include the smallest necessary protection, regardless of rarity.
- **Uncertain:** explain the concrete scenario and possible impact to Mohamed;
  pause only that dependent decision until he decides.
- **No:** do not implement it for the first release. Record a concise deferral
  in existing task/review notes when useful; do not mark it implemented.

Major problems include incorrect balances or duplicate financial effects, lost
or corrupted user data, owner/privacy/security leaks, unsafe sync
acknowledgment, or a broken core journey. Use actual app paths and evidence; do
not manufacture a remote chain of hypothetical failures to classify everything
as major. Considering an edge case is not authorization to implement it. A safe
error with preserved pending data can be sufficient; an elaborate automatic
recovery system is not automatically required. No new scoring system, approval
ceremony, framework or exhaustive test matrix is needed. Preserve existing
safeguards and approved core behavior. Ask Mohamed when a changed requirement or
its impact is unclear rather than silently widening scope.

## Basic protection before merge

Changes affecting balances, financial writes, retries/idempotency, sync ACK or
rejection, user ownership, recovery or data loss require focused deterministic
regression tests and appropriate independent review **before merge**, even when
manual testing finds no defect. These tests may be written after implementation;
they do not restore a tests-before-code gate. Author these safety tests without
waiting for manual feedback when needed to verify the affected invariant.

Preserve existing tests, CI thresholds, SQL/SQLite proofs and valid assertions.
Fix real regressions; change expectations only when the approved behavior or an
incorrect test warrants it. Do not add speculative frameworks, exhaustively test
every cosmetic detail, raise repository coverage targets, or expand release
scope solely to satisfy a testing ritual. Re-run affected checks for new
changes, failures or unresolved risks; avoid repeating an unchanged passing
batch.

## Planning, workers and evidence

- Keep approved spec, contracts, historical image bindings, reviewed interactive
  design versions and existing task IDs. Reconcile unfinished task dependencies
  with this sequence rather than regenerating plans or discarding completed
  work.
- Plan explicit implementation, batched verification, owner manual feedback,
  regression coverage and final validation stages. Coverage tasks remain
  required where the spec or safety boundary requires them; they need not
  precede source.
- Worker briefs state the current stage, owned files, manual scenarios, safety
  obligations and exact evidence expected. Do not dispatch a tests-first/Red
  gate by default. Preserve already completed Red/Green evidence as historical
  proof.
- Worker order remains Normal ChatGPT, verified free OpenCode, then Antigravity
  Gemini/Claude. Native workers still need Mohamed's prior per-task approval.
  Use the recovery and browser rules in
  [team-led delivery](../.agent/workflows/team-led-delivery.md).
- TDD remains optional only when Mohamed explicitly requests it for a scoped
  task, including an explicit `/tdd` invocation. A generic installed skill,
  legacy plan or worker persona cannot reinstate mandatory TDD.
- Historical specs, completed checklists, evidence logs and immutable mockup
  approvals retain their original contents. Their old execution-order language
  is historical, not a rule for new or unfinished work. Follow this policy and
  record the changed sequencing without rewriting approval receipts.

This policy changes delivery order, not product behavior, database architecture,
deployment permission, worker order or the approval of a merge.
