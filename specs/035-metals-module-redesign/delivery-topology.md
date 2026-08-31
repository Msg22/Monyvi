# Metals V1 Delivery Topology

## Authority

Authority remains constitution, `AGENTS.md`, business decisions, then approved
feature artifacts.

### User Directive — 2026-08-31

The team lead may create local commits, push authorized branches, open separate
slice pull requests, address review and CI findings, and merge only when required
review gates pass, CI is green, and no unresolved review comments remain. This
authorization preserves the separate-slice PR strategy: do not bundle unrelated
slices, do not merge prematurely, and do not use a later slice's work to bypass an
upstream gate. It does not authorize remote database/Supabase mutations; migrations
remain repository changes subject to their normal review and CI gates.

## Nine-Slice Ownership

| Slice | Exclusive owner scope | Dependency base | Excluded shared scope |
| --- | --- | --- | --- |
| 1 | Delivery, manual-test, coverage, and evidence planning documents | Approved sources | Production code/tests/migrations |
| 2 | `packages/logic/src/metals/`, Decimal.js and lockfile | T005 | Root barrel, persistence/UI |
| 3A | Generic action identity/state/storage; migration `067` through T024 | T005 | Account integrity and Metals domain |
| 3B | #242 account revisions/effects/writers; migration `069`; shared DB regeneration only at T033 | T024; T042 for T033 | Metals migration `068` and story work |
| 4 | Migration `068`, Metals DB/model/sync/i18n/fixture/render/adapters | T017 + T024 | Generic/#242 implementation |
| 5 | US1 portfolio and US9 rate-trust story surfaces | T049 | Migrations, shared i18n/sync/fixtures, detail route |
| 6 | US3 holding/detail/history contracts | Slice 5 contract base | Shared detail route and generated files |
| 7 | US2 Add, then US4 Edit/shared form | Slice 6; US4 Green after US2 | Lifecycle shared files |
| 8 | US5/US6/US7, then US8 and US10 isolated lifecycle/recovery contracts | Slice 7; US8 after US5 non-credit + US6 | Migrations, shared routes/barrels |
| 9 | Detail-route composition, barrels, coverage matrix, release evidence | Selected non-blocked Green gates | Upstream owner files |

## Rebase And Dependency Order

1. Completed T001–T005 plus a verified runnable worktree dependency junction
   permit Slice 2 and Slice 3A in disjoint worktrees. After Slice 2 reviews, the
   approved stable local foundation commit may become their shared local base.
2. T024 freezes generic identity/state/serialization/storage. Only after its
   required gates pass and its separate slice PR is merged may unrelated Metals
   stacks base on that commit.
3. T017 + T024 allow T034–T049. Slice 4 never waits for #242 T033.
4. Fixed migration order: T022 `067_financial_action_foundation.sql`, T042
   `068_metals_domain.sql`, T029 `069_account_financial_effects.sql`. Slice 4
   owns `068` rebase/renumber if prefixes drift; #242 rebases `069` after T042
   and performs the sole shared generated-DB refresh at T033.
5. Slice 5 follows T049; Slice 6 follows its shaped contracts; Slice 7 follows
   Slice 6; Slice 8 follows Slice 7; Slice 9 composes accepted contracts only.

## Overlap Controls

- `[P]` means prerequisite Green and disjoint listed files. Red and its Green
  implementation never run in parallel.
- Slice 2/3A may run only after completed T001–T005 and verified runnable
  worktree dependency junction; Slice 3B/4 after T024; US1/US9 after Slice 4;
  non-credit US5/US6/US7 after Slice 7.
- Never parallelize Add/Edit changes to `MetalHoldingForm.tsx`, story work with
  shared translations/schema/sync/generated files/fixture registry, or any
  story edit to `app/(private)/metals/[holdingId]/index.tsx`.
- Do not resolve another owner's shared-file conflict locally. Stop, report
  path/base, hand to named owner, and re-run affected evidence after rebase.

## Narrow #242 Gate

Only credited Sale, credited Undo, and account compensation/replacement credit
wait for full #242 T033. Sale without credit, uncredited Undo, Slice 4, and
unrelated Metals work depend on T024 only where listed.

## Authorization Boundary

The 2026-08-31 user directive authorizes normal Git delivery actions described
above, including local commits, branch pushes, separate slice PRs, review/CI fixes,
and gated merges. A merge remains prohibited until all required review gates pass,
CI is green, and no review comment remains unresolved. No remote database mutation is
authorized by this delivery topology. The `before_implement` Speckit hook is optional
and MUST NOT run unless separately requested.
