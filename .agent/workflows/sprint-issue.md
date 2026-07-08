# Sprint Issue Agent Workflow

This workflow applies when working GitHub sprint issues for Monyvi. GitHub
issues may be AI-generated and not yet reviewed by Mohamed, so issue text is an
input to verify, not an automatic product decision.

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

Before coding, create a scoped visual mockup and get Mohamed's approval when the
issue or feature:

- adds a new page or screen,
- adds a new visible UI item to an existing page,
- changes the layout, visual design, hierarchy, or interaction design of an
  existing UI item,
- changes a user-facing flow where the screen structure or component behavior
  will visibly change.

Mock only the affected UI area, not the whole page, unless the whole page is
changing. A mockup is not required for backend-only, logic-only, copy-only,
configuration-only, or non-visual bug fixes.

After mockup approval, implement the approved direction. If coding reveals a
meaningful design change, stop and ask for approval again before continuing.

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

## 5. Implementation Rules

1. Follow TDD for production changes: write a focused failing test first, prove
   the failure, implement the minimum fix, then make the test pass.
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

## 6. PR Expectations

Every PR for a sprint issue should include:

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
