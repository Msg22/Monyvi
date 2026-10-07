# Issue #255 sync reproduction and final local validation

## Historical genuine Red result (fresh run `run-1791353499634`, real path, cap 1000)

- Control (37 REAL_ESTATE): PASS, diff all zero, checkpoint persisted.
- Initial 2,501: applied **1000** / missing **1501** / extra 0 / valueMismatch
  0; checkpoint persisted.
- Unchanged second sync: first and second both 1000/2501 with IDENTICAL missing
  sets; checkpoint `1791353520552` → `1791353521286` (advances while 1,501 rows
  omitted; second sync repairs nothing). Independent recompute of an earlier run
  showed the same shape (`1791352975402` → `1791352975890`).
- cap+1: parents 1000/1001, children 1000/1001; valueMismatch 0 everywhere.
- Full expected/first/second/applied manifests + numeric checkpoints captured
  BEFORE final assertions in `evidence/*.json`, archived per run under
  `evidence/runs/<runId>/{before,after}/` with `source-lineage.json` (sha256 +
  lines for test, helper, both runners, both probes) and logs.
- Checks: ESLint (repo rulesdir) clean, Prettier clean, semantic TS 0 owned / 0
  dependency. Canonical generated DB types used throughout.
- This is the genuine #255 Red: partial apply + persisted advanced checkpoint +
  unchanged second sync on the real production path.

## Historical baseline backend lifecycle

- Dedicated `monyvi-issue255-repro` stopped via
  `node node_modules/supabase/dist/supabase.js stop --workdir scripts/testing/issue255-sync-reproduction`
  (no `--all`, volumes kept, shared `*_Monyvi` stack verified running on
  54321/54322). Evidence (`evidence/`, snapshots) and cached
  `runtime.local.json` preserved, still gitignored.
- Reproducible bootstrap:
  1. `node scripts/testing/issue255-sync-reproduction/prepare-backend.js`
  2. `node node_modules/supabase/dist/supabase.js start --workdir scripts/testing/issue255-sync-reproduction -x analytics,edge-runtime,functions,imgproxy,inbucket,realtime,storage,studio,vector`
  3. `node scripts/testing/issue255-sync-reproduction/resolve-runtime.js`
  4. `node scripts/testing/issue255-sync-reproduction/ensure-fixture-user.js`
  5. `node scripts/testing/issue255-sync-reproduction/run-raised-transport.js jest`
     (accepted Red command; `run-cap-test.js` default mode only demonstrates the
     URI failure).
- Do not read root `.env`. Never paste keys/passwords.

## Owned files

- `apps/mobile/__tests__/services/sync-pull-cap.local.integration.test.ts`: four
  journeys, real Supabase/pull/synchronize/marketV2RPC, full ID/value manifests,
  evidence before assertions. Review corrections: reset inside `database.write`;
  UUID `[89ab]`; `Pick` of canonical `Row` for selects; workspace-relative Jest
  path; no checkpoint clearing between syncs.
- `apps/mobile/__tests__/services/issue255-sync-reproduction/manifests.ts`:
  test-only fixture/manifest/diff/evidence helpers.
- `scripts/testing/issue255-sync-reproduction/`: `prepare-backend.js`,
  `resolve-runtime.js`, `ensure-fixture-user.js`, `run-cap-test.js`,
  `run-raised-transport.js` (identity-exact, throw-safe raise/test/restore with
  byte verification), `probe-transport.js`, `probe-adapter.js`,
  `snapshot-evidence.js`, `format-owned.js`, `tscheck-owned.js`.
- Pinned revision `2095ec061d531854603e8415122231f1cbf4c1a0`. Production,
  existing tests, configs, migrations, CI, specs untouched. No commits/push/PR.
  `source-command-tdd` absent; AGENTS/sprint TDD used.

## Archived waves

- Default gateway: control PASS 37/37; three above-cap journeys fail loudly
  (`URI too long`, fail-safe, no silent advance). Evidence in
  `evidence/default-gateway/`.
- Gateway fixture (`large_client_header_buffers 4 128k` dedicated-only, restored
  byte-equal): 414 cleared; ≤~37k-char lookups succeed with Jest flag
  `--max-http-header-size=131072`; 92k-char raw probe still socket-closes (does
  not alone attribute cause; the Jest proof proves pagination). PostgREST cap
  1000 / SQL / RLS / routes unchanged throughout.

## Historical Red-stage coverage matrix

| #   | Journey                                                | Status                                                   |
| --- | ------------------------------------------------------ | -------------------------------------------------------- |
| 1   | Under-cap control (37, ID/value, checkpoint)           | PASS (both modes)                                        |
| 2   | Above-cap initial (2501 → 1000/1501)                   | GENUINE RED                                              |
| 3   | Unchanged second sync (identical, checkpoint advances) | GENUINE RED                                              |
| 4   | Parent/child capped lookup (1000/1001)                 | GENUINE RED on counts; transport fails first at defaults |
| 5   | cap-1 / cap / cap+1 / exact multiples                  | Unrun (required before Green)                            |
| 6   | Incremental creates / updates / deletes                | Unrun                                                    |
| 7   | Precision / equal timestamps                           | Unrun                                                    |
| 8   | Later-page / apply failure + restart                   | Unrun (needs failure-injection harness)                  |
| 9   | Concurrent / late commits                              | Manual-only                                              |
| 10  | Clock skew                                             | Manual-only                                              |
| 11  | User switch                                            | Unrun                                                    |
| 12  | Historical repair with dirty actions                   | Blocked (no production repair here)                      |
| —   | Device/emulator, killed-app/HeadlessJS, RTL/compact UI | Manual-only (no UI touched)                              |

## Historical repair brief (superseded by approved specs/389-sync-pagination)

- Seal rejects non-finite / non-millisecond / client-future `M` above the
  current valid server market watermark. Explicit `FOR UPDATE` seal with
  `FOR SHARE` all-writer transaction lifetime and fixed lock order; writer
  timestamps strictly greater than sealed `M` and non-regressing;
  clock-fail-closed.
- Raw timestamp + UUID keyset; exact-count EOF with null / count < len /
  empty-positive / bounds / cursor-invalid all fail-closed.
- Parent-owner join includes soft-deleted parents.
- Snapshot-only journal cursor (`publication_timestamp`, UNIQUE ENTRY UUID), not
  deleted row IDs across tables; existing 90-day filter unchanged; no TTL
  pruning or history rewrite.
- All required pages before pull return; dirty changes preserved; valid pull
  need not roll back on later push failure.
- Dependencies #377/#367 only. No repair code written here.

## Approved core integration — final local results (2026-10-07)

The preceding sections preserve historical Red evidence. The approved
specification and current coverage matrix are in specs/389-sync-pagination.

- Additive 082 creates the ordinary writer fence; 083–084 retain current
  financial/Metals/SMS RPC bodies with one early fence call each; 085 adds the
  seal, explicit timestamp bindings and retained snapshot deletion journal.
- Client pages by exact remaining count and raw timestamp/UUID cursor, joins
  owned parents including soft-deleted parents, and buffers all pages/deletions
  before one Watermelon apply.
- Owned 001–085 chain replay passed (84 migration files; existing 021 gap).
  Public Supabase types were generated from that backend and formatted;
  Watermelon models/schema were unchanged.
- **23/23 Jest suites, 176/176 tests passed as a latest-result aggregate**: 20
  unchanged initial passing suites plus three affected passing reruns (14
  tests). The initial batch contained fixture/type failures; it was not one
  clean uninterrupted run.
- Original real-path control, 2,501-row initial pull, unchanged second sync and
  1,001-parent/child journeys passed.
- **101 financial SQL regression assertions and three fence/journal probes
  passed.** Only the affected snapshot probe reran after total_assets_egp was
  corrected to current total_assets_usd.
- Mobile TypeScript, scoped TypeScript ESLint and formatting passed. Repository
  ESLint ignores the SQL Node probe; its lint status is not claimed.
- Independent Gemini review of SQL and client changes passed. Clean replay and
  source comparison disproved the withdrawn absent-trigger finding; no fallback
  trigger changes were made.

Database-package TypeScript still reports pre-existing TS2416 at
packages/db/src/models/base/base-market-rate-observation.ts:35 (batch relation
versus inherited Model.batch). The identical failure was reproduced on the
untouched pinned base; it was not repaired here.

Device/emulator E2E and manual device recovery were not executed; no emulator
was available. No commits, commit hooks, pushes, PRs, remote writes, deployment
or merge readiness are claimed. Historical data repair, CAS precision repair and
coordinated #367/#377 dependencies remain outside this change.

Evidence retained by the lead includes final-sync-jest-results.json,
affected-suite/mobile-typecheck results, final-sql-fence-probe.log with its
affected rerun, financial SQL logs, the generated public-types capture and
final-autofix.latest.state.json (exit 0). The historical run-1791353499634
archive remains the genuine Red source.

The owned backend was stopped after validation (exit 0), with its backup
preserved.
