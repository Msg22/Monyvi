# Sprint Issue Agent Workflow

## Shared selection and keyboard standards (2026-10-20)

### Existing global form interaction rules

For new/touched pickers, forms and UI review, enforce the already owner-approved
2026-10-20 design-system standards in `docs/design/design-system.md`: selected
option **filled Nile-green** background, WHITE light/dark text and contrasting
WHITE check/icon on open, with correct accessible/RTL state; all Android/iOS
text fields reachable above keyboards at compact size and enlarged text via
measured available keyboard-adjusted viewport, not hardcoded offsets. Reuse
shared picker/form components, write focused source/render regressions after
implementation, and collect actual native/manual keyboard/contrast/RTL/font
evidence before claiming those gates. Existing bespoke usages migrate
incrementally in scope. This is an established global contract, **not** a new
binding approval, mandatory redesign, whole-app migration or tests-first phase.

Apply the
[first-release scope filter](../../docs/development-workflow.md#first-release-scope-and-rare-cases)
before turning a rare edge case or review suggestion into implementation work.
Major impact requires minimal protection; uncertain impact returns to Mohamed;
no major impact means defer. Preserve approved core behavior and existing
safeguards.

This workflow applies when working GitHub sprint issues for Monyvi. GitHub
issues may be AI-generated and not yet reviewed by Mohamed, so issue text is an
input to verify, not an automatic product decision.

## Prospective interactive design and historical image gate

For future meaningful UI, follow `docs/design/interactive-design-workflow.md`:
one explicit owner approval of the **exact runnable design revision**. Its
actual visuals/responsive behavior are authoritative; a short README supplies
entry, version, scenarios and native-only notes. Do **not** create or verify a
sidecar, Binding Facts, hash/combined revision or separate metadata approval for
interactive HTML.

For an original historically approved **image** surface only, retain the
existing `<mockup-basename>.binding.md` requirements and run the unchanged
`scripts/verify-mockup-binding.js`; invalid historical sidecars remain
non-authoritative on their original surfaces. Preserve historical evidence.

## 1. Pick And Verify The Issue

1. Pick the next issue by priority and sprint order unless Mohamed gives a
   specific issue number. Critical issues come first, then high-priority bugs,
   then existing feature/module completion, then new feature/module work.
2. Read the full GitHub issue, labels, project/sprint fields, linked PRs, and
   relevant code before deciding whether implementation should start.
3. Verify the issue is still valid against the current app behavior. Use code,
   tests, logs, device behavior, or existing documentation as evidence.
4. If the issue is stale, duplicated, already fixed, or no longer applicable,
   explain why and recommend closing or updating it instead of coding.

## 2. Approval Gates

Stop before implementation and ask Mohamed for confirmation when an issue or
feature would:

- introduce new business logic,
- change existing business logic,
- change how the app works,
- change a user flow beyond fixing existing behavior,
- require a product decision that is not already documented in
  `docs/business/business-decisions.md`,
- require schema, sync-contract, migration, or data-backfill decisions.

When asking, keep it brief:

- summarize what the issue proposes,
- explain the product/business impact,
- recommend whether to proceed, defer, split, or close.

Bug fixes that restore already intended behavior can proceed after the root
cause is verified.

## 3. UI And Design Mockups

Before coding, create a scoped **runnable interactive design** under the
feature's `mockups/` and obtain Mohamed's **one approval of the exact reviewed
design** following `docs/design/interactive-design-workflow.md` when the issue
or feature meaningfully changes the UI by doing any of the following:

- adds a new page or screen,
- adds a new visible UI item to an existing page, except for the micro-UI
  exception below,
- changes the layout, visual design, hierarchy, or interaction design of an
  existing UI item,
- changes a user-facing flow where the screen structure or component behavior
  will visibly change.

Design only the affected UI area, not the whole page unless the whole page is
changing. Use a portable browser entry and documented relevant scenarios so the
owner can try interactions, container widths, font scaling, long content,
light/dark and EN/AR RTL before implementation. One design direction can be
enough; four static images and Stitch are not mandatory. A mockup is not
required for backend-only, logic-only, copy-only, configuration-only, or
non-visual bug fixes.

### Micro-UI Exception

A mockup is not required for a tiny, localized, and unambiguous UI change when
all of these conditions are true:

- it stays inside an existing component or established UI region,
- it uses an existing design-system pattern and existing theme tokens,
- it does not introduce a new interaction, modal, screen, navigation path, or
  user-flow step,
- it does not change business behavior or the meaning of a user action,
- it does not materially change layout, information hierarchy, component size,
  or surrounding content placement, and
- its placement and expected behavior are clear from the current UI and request.

Examples include adding a compact currency/status chip beside an existing
heading, adding a short supporting label, replacing an icon with the correct
existing icon, or making a small spacing, contrast, or alignment correction.

Before using this exception, briefly state the intended UI change and why it is
micro-UI. Then proceed without waiting for mockup approval. If the change grows
beyond these boundaries, has multiple credible designs, or creates uncertainty
about hierarchy or interaction, stop and use the mockup approval gate. A direct
request from Mohamed for a mockup always overrides this exception.

For prospective interactive designs, present the **working entry** and short
README with traceable version, run steps, scenarios and necessary native-only
differences. The artifact itself determines spacing, style and responsive
behavior. Approval of that reviewed design occurs **once**; no second
binding/metadata/README approval is required. A changed design needs one new
approval of the changed revision.

For historical approved image references only, require the original approved
sidecar and unchanged verifier/legacy migration procedure. Neither those legacy
fields nor their hash ceremony apply to new HTML.

Implement the approved direction through `.agent/workflows/applying-mockups.md`.
If coding requires a materially different design, seek one owner approval of the
**revised interactive artifact** before implementing that redesign. Respect its
reviewed UI context, excluding non-product preview chrome/frames, preserve the
intent across actual container sizes, RTL, themes and enlarged text, and report
functional readiness separately from visual fidelity. Visual completion requires
**native rendered** screenshot comparisons with the approved rendered design at
the reviewed context plus evidence for relevant in-scope variants; browser
previews alone are not native visual proof.

When the governed mockup or story requires accessibility labels or semantics,
completion also requires separate accessibility-tree, screen-reader, or
appropriate automated accessibility proof. Screenshot evidence does not verify
accessibility labels, roles, names, states, relationships, or screen-reader
behavior. Report **accessibility evidence status** separately from functional
status and visual fidelity, and keep handoff blocked while required
accessibility proof is missing.

## 4. Branch Base Selection

Before creating a branch, compare the expected files and behavior against the
current branch and any stacked base branch.

- If the new issue is likely to conflict with current in-flight changes, create
  the branch on top of the current/stacked branch.
- If the issue is independent, switch to an up-to-date `main` and branch from
  there.
- Keep unrelated workflow/documentation updates out of product-code PRs unless
  Mohamed explicitly wants them bundled.

Use the `codex/` branch prefix by default.

When creating a secondary or isolated worktree:

- MUST create it on the exact same disk and within the same parent folder as the
  main checkout (`E:\Work\My Projects\Monyvi-<issue-or-feature-name>`).
- NEVER create worktrees on `C:`, user profile folders (`~/.codex/worktrees/`,
  `~/.claude/worktrees/`), or other disks.
- Do not run `npm install`. Link dependencies immediately:
  `powershell -ExecutionPolicy Bypass -File scripts/link-worktree-node-modules.ps1 -RootWorkspace "E:\Work\My Projects\Monyvi"`.

## 5. Implementation Rules

1. Follow [the delivery workflow](../../docs/development-workflow.md): implement
   directly, batch existing checks, hand manual testing to Mohamed, then add
   regression coverage after feedback. Required safety tests precede merge.
2. Keep fixes simple, SOLID, DRY, and scoped to the issue.
3. Do not patch from a hypothesis. Confirm the root cause before editing
   production code.
4. Preserve Monyvi architecture boundaries:
   - WatermelonDB remains the offline-first source of truth.
   - Services/repositories own persistence and scoped queries.
   - Hooks own subscriptions and UI lifecycle state.
   - Presentational components render shaped props only.
5. Avoid unrelated refactors. Mention unrelated cleanup opportunities instead of
   bundling them.
6. When a PR branch adds or changes files under `supabase/migrations/`, make
   local Supabase match that branch before testing synced app behavior. Prefer
   resetting/reapplying the local database (for example `npm run db:reset`) when
   disposable local data is acceptable; use the repo migration flow only when
   preserving local data is explicitly needed. Do not apply unmerged PR
   migrations to a shared remote Supabase project unless that remote is a
   dedicated preview/dev database for the PR.
7. When a local tooling or shell issue blocks the normal workflow, fix the
   recurring environment problem or document the durable workaround instead of
   only bypassing it for the current command. For GitHub helper scripts on
   Windows, prefer the bundled Codex Python runtime with UTF-8 mode when the
   system `py` launcher points at a broken install or decodes GitHub responses
   with the wrong codepage.
8. Treat automated tests, especially Maestro/E2E flows, as part of the product
   contract. Before changing a user flow, permission flow, navigation target,
   seed data, testID, or user-visible copy used by E2E, inspect the relevant E2E
   coverage and update it alongside the implementation. Do not leave a PR with
   known unit, integration, or E2E failures unless the failure is proven
   unrelated to the PR and explicitly documented.

## 6. PR Expectations

Every PR for a sprint issue should include:

- PR should be ready not a draft
- the issue link,
- a short root-cause or implementation summary,
- any product/design decisions made,
- validation commands and results,
- a manual QA plan suitable for device testing,
- a coverage matrix mapping manual scenarios to automated tests or manual-only
  validation.

If a verified part of the issue is intentionally deferred, call it out in the
PR. Create a follow-up GitHub issue when the deferred work is actionable and
needs tracking.

## 7. Manual QA Data Readiness

When a sprint-issue PR includes a manual QA plan with scenarios that depend on
database state, prepare the local Supabase data needed to execute that plan
before final handoff.

1. Use the QA user Mohamed specifies for the issue. Operate on local Supabase
   only unless Mohamed explicitly authorizes a remote or shared environment.
2. Translate every database-backed manual QA scenario into its required
   accounts, categories, transactions, budgets, dates, statuses, relationships,
   and edge-case state.
3. Inspect that user's existing local data before writing anything. Compare the
   observed rows with the complete scenario requirements and identify only the
   missing or unsuitable data.
4. If the existing data already supports every scenario, leave it unchanged. Do
   not reseed merely because a seed command exists.
5. If data is missing, add or update only the minimum user-scoped rows needed to
   remove the QA blocker. Preserve unrelated users and existing usable data. Do
   not reset or fully reseed the local database unless Mohamed explicitly
   requests it or a branch migration makes a reset unavoidable.
6. Prefer deterministic, idempotent fixture identifiers and values so a repeated
   preparation run updates the intended QA rows without creating duplicates.
   Respect ownership, foreign-key, hierarchy, sync, and local-first invariants.
7. Query local Supabase after preparation and verify that every database-backed
   scenario is now executable, including expected totals, ordering, exclusion
   cases, empty states, and expired or inactive records where relevant.
8. Complete a successful sync on the QA device, then verify the prepared
   scenarios through the app or the current user's scoped WatermelonDB state.
   Supabase verification alone does not prove device readiness because local
   sync metadata, pending edits, or stale rows can make the device state differ.
   If device sync or local verification is unavailable, report the scenario as
   blocked instead of declaring the manual QA data ready.
9. In the final handoff, state:
   - which QA user was prepared,
   - what data was added or confirmed,
   - the expected values or record names needed during testing,
   - how to pull or refresh the data on the device, and
   - any scenario that remains manual-only or blocked by something other than
     database state.
