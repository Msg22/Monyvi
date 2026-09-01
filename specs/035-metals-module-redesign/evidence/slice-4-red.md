# Slice 4 Red Evidence

Date: 2026-08-31

Base: `8cc090346004b590ed5d2e53d2ec3e6c829a517f` (`origin/main`)

## Command

```text
npm test -w @monyvi/mobile -- --runInBand --forceExit --no-watchman __tests__/migrations/metals-domain-backfill-model.test.ts __tests__/services/metal-financial-action-foundation.integration.test.ts __tests__/services/metals-reconciliation-sync-rate.integration.test.ts __tests__/i18n/metals-content-contract.test.ts __tests__/scripts/metals-e2e-fixture-registry.test.ts __tests__/components/metals/metal-render-manifest.test.ts
```

Result: **RED as intended** — 6 failed suites, 11 failed tests, 0 passed.

| Task | Suite                                                   | Intended Red evidence                                                                                                                                                                           |
| ---- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T035 | `metals-domain-backfill-model.test.ts`                  | `068_metals_domain.sql` absent; local schema remains v26; exact shadow fields, Metals tables, models, registrations, RLS, constraints, and indexes are absent.                                  |
| T036 | `metal-financial-action-foundation.integration.test.ts` | Metals adapter/repository/command-service modules are absent, so no owner-scoped one-writer or domain evidence path exists.                                                                     |
| T037 | `metals-reconciliation-sync-rate.integration.test.ts`   | Reconciliation/rate/metadata modules are absent and sync has no Metals-owned strategy/fragment contract.                                                                                        |
| T038 | `metals-content-contract.test.ts`                       | Required EN/AR lifecycle, freshness, recovery, and render keys are absent; current copy still contains unsupported/retired terms; the runtime translation schema has no Metals scalar contract. |
| T039 | `metals-e2e-fixture-registry.test.ts`                   | `metals-e2e-fixtures.js` is absent and no Metals fixture profiles are registered.                                                                                                               |
| T040 | `metal-render-manifest.test.ts`                         | Production Metals manifest and approved object assets are absent.                                                                                                                               |

The earlier attempt without `--no-watchman` failed in the local Watchman pipe
before executing test assertions. It is tooling evidence only and is not counted
as Red. A later retry occurred only after the shared dependency tree was
restored and the worktree junction was verified.

## Workflow incident

During the requested base move, one PowerShell command chained rebase,
stash-pop, and verification with semicolons. The rebase failed while replaying
old stacked commits, but the shell continued to the stash-pop attempt. Git
refused the pop because the index needed merge and retained the stash, so no Red
file was lost. Recovery used `git rebase --abort`, verified the backup ref and
exact six-file stash, performed the approved empty-range rebase onto
`origin/main`, verified the new head, then popped the named stash and verified
exactly six untracked Red files with no tracked diff.

Rule frozen for the remainder of Slice 4: state-changing Git commands run one at
a time; no command chaining after an operation that may fail.

## Stacked-preparation Red additions

Focused executable checks exposed three previously documented-but-unproven gaps:

1. `metals-e2e-fixture-registry.test.ts` failed because the shared seed engine
   never upserted `metal_holding_states` or `market_rate_observations`.
2. After that path existed, the real local seed failed because the Metals
   fixture sent a JavaScript millisecond value to PostgreSQL's date column. A
   focused assertion then reproduced the mismatch (`1785542400000` versus
   `2026-08-01`).
3. `supabase/tests/metals_domain_test.sql` reached 13 passing schema/revision
   checks, then stopped because the private holding-CAS binding helper did not
   exist. The new test deliberately requires the expected revision inside the
   hashed payload, empty account guards, Sell v2, domain/holding linkage,
   canonical revision grammar, and no authenticated access to the private
   helper.

These additions do not authorize exact action-specific schemas. The missing
field decisions remain blocked in `slice-4-action-schema-decision-matrix.md`.

## Post-PR #251 fail-closed Red gate

After rebasing onto `bf2e3a071c2814772e9a9669479afeeb85d48767`, a
table-driven test attempted Add, Correct, Sell v2, Dispose, Delete, and Undo
through the Slice 4 adapter. All six cases failed Red because the adapter still
accepted recursively shaped payloads without an approved exact schema.

The Green correction removed every speculative registry entry and deleted the
incomplete repository, command, and reconciliation paths that could imply a
durable accepted action. The production registry is now empty and all six
attempts fail closed with `metal_action_schema_not_approved`. This Red gate does
not complete T036 or T037: their real SQLite/CAS/reconciliation assertions must
be authored only after the six immutable payload contracts are approved.

The first post-rebase broad mobile run also exposed two compatibility Reds:

1. generalized fixture lookup changed the established unknown-budget-profile
   error contract;
2. the Watermelon v27 backfill generated holding-state IDs with `randomblob`,
   violating the deterministic migration guard.

Production code was corrected without weakening either test: budget-only
selection retains the existing error contract, and each seeded holding-state ID
is deterministically the unique holding/asset ID. The focused four-suite rerun
passed 34/34 tests, followed by the full 304-suite mobile Green gate.

## PR #254 CI Red

The first `Code Quality & Tests` job failed at repository-wide lint because the
new render manifest used five CommonJS `require()` image calls. The focused
mobile lint command had not included `assets/`, so it did not exercise this
boundary. The CI finding was valid and in scope.

All five image dependencies now use the repository's typed static-import
pattern. The exact root `npm run lint` command passes with zero errors, mobile
typecheck passes, and the focused render-manifest suite passes 3/3 tests.

## PR #254 non-schema review Red

The two focused review suites failed with three intended assertions before the
production fixes:

1. the current Live Rates screen still requested the legacy `platinum` key,
   but the EN/AR Metals catalogs no longer defined it;
2. the fresh-rate fixture returned the fixed authoring timestamp instead of the
   seed engine's injected current timestamp;
3. the account-ineligible fixture still upserted four EGP accounts, so its
   metadata label did not create the eligibility state it claimed.

The metadata helper was also verified to have no production consumer. Its
whole-projection timestamp could not prove the approved per-field
`(writtenAt, writerId)` contract, so the incomplete helper, isolated test, and
coverage claim were removed instead of being extended without the blocked
action/coordinator contracts.

## PR #254 fixture-runtime and profile-isolation Red

Two focused fixture suites failed with three intended assertions before the
production fixes:

1. the `metals-stale-restart-ar-dark` fixture retained the seed engine's
   hard-coded English/system profile instead of materializing Arabic and dark
   mode;
2. switching from a fixture with a market-rate observation to the missing-rate
   fixture did not delete the prior profile's deterministic observation ID;
3. the Android preflight had no executable path for the selected fixture's
   theme or text scale, so those registry fields were metadata-only claims.

The Green correction persists locale/theme in the scoped profile, writes the
theme to the app's AsyncStorage database, applies text scale through Android's
system setting before launch, and deletes all deterministic Metals observation
IDs during profile switches and resets.

## PR #254 manual-QA Metals fixture Red

The focused manual-QA seed suite failed after its contract was narrowed to the
approved Gold/Silver-only scope. The production fixture still emitted a
`PLATINUM` asset-metal row and named asset, which migration 068 rejects for a
new insert even though its compatibility constraint is `NOT VALID` for legacy
rows.

The Green correction replaces that unsupported fixture with a deterministic
Gold bar and asserts that no Platinum row is emitted. This changes only
disposable manual-QA data; it does not rewrite existing user holdings.

## PR #254 deterministic transport and restart-harness Red

Two focused fixture suites failed with four intended assertions before the
production fixes:

1. a clock-injected fixture still wrote the module's fixed authoring time to
   the observation transport `created_at` field instead of the injected seed
   time;
2. the resolved runtime settings omitted the selected profile's
   `persistenceState`, so the preflight could not distinguish a restart
   journey;
3. the Android preflight exposed no local Metals observation-cache cleanup
   before the first profile launch;
4. the restart profile exposed no ordered first-sync, force-stop, same-DB
   relaunch path.

The Green correction keeps `provider_observed_at` independent for rate
freshness, clears the local pull-only observation cache while the app is
stopped, and waits for the first projection before relaunching restart
profiles without another cleanup. No Android device was attached for this
verification run, so executable ordering and SQL are automated while the real
device lifecycle remains an explicit manual check.
