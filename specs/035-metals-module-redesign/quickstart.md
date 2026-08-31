# Quickstart: Metals Module Redesign

## Preconditions

1. Work on the dedicated feature branch/worktree.
2. In a secondary worktree, reuse the main checkout dependencies:
   `powershell -ExecutionPolicy Bypass -File scripts/link-worktree-node-modules.ps1 -RootWorkspace "E:\Work\My Projects\Monyvi"`.
   Never install a second dependency tree.
3. Deliver issue #242 in its own immediate prerequisite lane before enabling sale
   account credit, Undo of a credited sale, or account compensation/replacement credit.
   Sale without credit, uncredited Undo, and unrelated Metals work continue. Until the
   dependency passes its writer, CAS, sync, cutover, and regression gates, keep only
   those account-effect capabilities explicitly disabled.
4. Treat `spec.md`, this plan, `data-model.md`, contracts, approved mockups, the
   constitution, and business decisions as the implementation source of truth.

## Test-First Slice

For every slice:

1. Write the smallest logic, schema/RPC, real-SQLite, RNTL, and Maestro tests that
   express its contract.
2. Run them and record the expected failure.
3. Implement the minimum production code.
4. Run targeted tests, then package typechecks/lint.
5. Refactor only while green.
6. Update the manual coverage matrix before handoff.

Suggested targeted commands:

```powershell
npm test -w @monyvi/logic -- --runInBand metals
npm test -w @monyvi/db -- --runInBand metals
npm test -w @monyvi/mobile -- --runInBand metals
npm run typecheck -w @monyvi/logic
npm run typecheck -w @monyvi/db
npm run typecheck -w @monyvi/mobile
npm run lint
```

## Implementation Order

### 1. Exact domain foundation

- Add the Decimal.js primitive, canonical parser/serializer, purity catalog, valuation,
  attribution, final rounding, and lifecycle reducer in `@monyvi/logic`.
- Prove canonical strings, invalid boundaries, no exponent output, no intermediate
  rounding, Gold/Silver catalog versioning, and PostgreSQL parity fixtures.

### 2. Schema and RPC

- Write the next sequential SQL migration and matching WatermelonDB migration/schema/
  models; never change Supabase through the dashboard.
- Add exact shadow fields, state/action/evidence/effect tables, indexes, RLS, triggers,
  and exact rate observations.
- Reuse the generic owner-scoped financial-action root/outbox and generic immutable
  account effects delivered by #242. Metals adds linked holding lifecycle/rate evidence,
  not a competing account outbox.
- Add the CAS RPC and deterministic harness tests for ownership, replay, hash mismatch,
  signed-bigint-bounded canonical revisions, ordered per-account guards/evidence,
  stale holding/account revisions, source/destination transfer guards, rollback, and
  one winner.
- Run `npm run db:migrate`; commit both migration and generated schema only during the
  later authorized implementation/commit phase.

### 3. Local commands and reconciliation

- Implement services under `apps/mobile/services`; no DB writes in hooks/components.
- One Watermelon writer commits each complete optimistic group.
- Route grouped actions through the dedicated RPC synchronizer, not generic per-table
  activation.
- Prove restart, retry, duplicate press, compensation once, missing canonical evidence,
  and no watermark advance on failure.

### 4. Read models and UI

- Build scoped portfolio, detail, History, and Home net-worth read models.
- Implement approved screens with presentational components and subscription hooks.
- Preserve Live Rates composition; only Gold/Silver and truthful rate status change.
- Validate missing/stale/unknown rates, light/dark, English/Arabic, RTL, compact phone,
  ordinary phone, tablet/orientation, 200% text, safe areas, and reduced motion.

### 5. End-to-end evidence

Use deterministic fixtures for Add, metadata Edit, material correction, Sell with and
without account credit, Dispose, Delete, Undo, offline restart, sync retry, and
reconciliation. Keep real two-device scheduling, physical offline, TalkBack/VoiceOver,
and tablet/landscape as explicit manual evidence where automation cannot control them.

## Required Verification Matrix

| Risk | Automated proof | Manual proof |
| --- | --- | --- |
| Exact arithmetic and purity | Logic + PostgreSQL parity | Display rounding |
| Local group atomicity | Real SQLite rollback/restart | Offline device flow |
| CAS/replay/ownership | Deterministic RPC harness | Two-device conflict |
| Account credit and inverse | SQLite + RPC + #242 suite | Account activity |
| Rate truth/missing data | Logic/read-model/RNTL | Prolonged offline |
| Reporting exclusions | Read-model integration | Budget/income review |
| Responsive/a11y/theme/RTL | RNTL + Maestro | Device/accessibility matrix |

## Stop Conditions

Stop and return to the team lead if an account-credit, Undo-credit, or related account
compensation task is attempted before #242 is merged and verified. Sale without account
credit and unrelated Metals tasks may proceed. Also stop if a migration changes
ownership or financial meaning beyond these contracts, exact backfill cannot be
deterministic, RPC cannot commit the whole group atomically, or approved mockup
behavior conflicts with the specification. Do not silently weaken CAS, exactness,
ownership, or offline-first guarantees.

## Planning Handoff Topology

Use this merge/review order: planning; exact Metals domain; #242 prerequisite; Metals
persistence/reconciliation; portfolio surfaces; holding experience; Add/Edit; terminal
lifecycle; integration/quality. This is planning topology only, not authorization to
create branches or pull requests.
