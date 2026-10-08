# Acceptance Coverage: Issue #255 Sync Pagination and Checkpoint

**Status**: Local validation completed on 2026-10-07; exclusions below.
**Feature**: specs/389-sync-pagination/spec.md

- [x] ACC001 Real initial pull: all 2,501 remote rows present locally; full
      ID/value manifests pass.
- [x] ACC002 Real unchanged second sync: identical complete data; valid
      checkpoint advancement allowed.
- [x] ACC003 Real 1,001-parent/child journey passes. Separate public-caller
      contract tests prove owner joins include soft-deleted parents and deleted
      children without parent-ID lists.
- [x] ACC004 Shared pager covers empty, short, capped, exact-multiple and
      remainder pages with an artificial cap of three; EOF depends on exact
      remaining count.
- [x] ACC005 Invalid count, empty-positive page, malformed/non-advancing cursor
      and later-page query errors reject. Real SDK/SQLite tests prove failed
      pulls retain their prior checkpoint.
- [x] ACC006 Raw microseconds and UUID ties survive page boundaries.
- [x] ACC007 SQL concurrency probe observes the seal waiting on the writer
      transaction lock, then proceeding after commit; subsequent publication is
      strictly after the seal. Static current-body comparison and independent
      review verify four early-hook placements.
- [x] ACC008 SQL probes prove actual snapshot DELETE publication and rollback,
      owner scope, tied journal pagination and exact counts. Client retention
      remains 90 days. Fenced snapshot creation binding is source-reviewed; no
      separate device claim.
- [x] ACC009 Real SDK/SQLite tests prove failed ordinary/journal pulls retain
      prior state; successful pull followed by failed push retains the new
      checkpoint and retryable deletion.
- [x] ACC010 Existing financial SQL regression coverage passes 101 assertions
      across three suites. No CAS precision repair or historical backfill was
      introduced.
- [x] ACC011 Approved sync rules were recorded in business-decisions before
      production edits.
- [ ] ACC012 Device/emulator/manual E2E validation was not executed; no emulator
      was available.

## Exact validation evidence

- Jest: **23/23 suites and 176/176 tests**, aggregated from 20 unchanged passing
  suites in the initial batch plus three affected passing reruns (14 tests).
  This was not one clean uninterrupted run. Fixture/type corrections followed
  initial failures.
- Original real-path control, 2,501-row initial/unchanged sync and
  1,001-parent/child journeys passed.
- SQL: **101 financial regression assertions + 3 fence/journal probes passed**.
  Only the affected snapshot probe reran after its obsolete fixture column was
  corrected.
- Owned backend replay applied the 001–085 chain (84 files; existing 021 gap).
  Public Supabase types were generated from that backend, copied and formatted;
  Watermelon schema/models were unchanged.
- Mobile TypeScript passed. Scoped TypeScript ESLint and formatting passed. The
  Node SQL probe is excluded by the repository ESLint pattern and is not claimed
  linted.
- Independent Gemini review of SQL/client changes passed; an absent-trigger
  concern was withdrawn after existing migration anchors and clean local replay
  disproved it.

## Explicit exclusions

Database-package TypeScript still reports TS2416 at
packages/db/src/models/base/base-market-rate-observation.ts:35: its batch
relation conflicts with inherited Model.batch. The identical error was
reproduced on the untouched pinned base; no repair is included here.

No device/emulator, killed-app/HeadlessJS, remote deployment, merge, commit,
push or PR readiness is claimed. Historical repair and coordinated #367/#377
dependencies remain outside this change. The genuine Red source remains
run-1791353499634; newly authored contract/SQL tests have no separately claimed
genuine Red run.
