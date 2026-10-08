# Server initial exclusion Red — issue #347

Bounded local test integration, 7 October 2026. Start: 15:13 UTC; checkpoint:
15:33 UTC; hard report boundary: 15:43 UTC. This is initial T006 exclusion/
structure evidence, not completed SQL accounting, permissions or concurrency
validation.

## Identity, ownership and intake

Before application, the root sanctioned broker verified the exact sibling
checkout `E:/Work/My Projects/Monyvi-issue347-voice-usage-limits`, branch
`codex/issue347-delivery`, HEAD `ac1ef5583656190d04f3d068a742d98f742085cf`.
Status contained only earlier mobile tests and coordination artifacts; this
assignment's four server test files were clean. Installed tsx metadata:
**4.22.3**, `./dist/cli.mjs` exists. The main checkout source remained
untouched; administrative relay/results live under
`E:/Work/My Projects/Monyvi/.git/worktrees/Monyvi-issue347-voice-usage-limits/`.

The externally authored full `server-tests-proposal.patch` was read before
application. SHA-256:
`a51870c06fcd0a8606c358a35771e68454e7099097043da384ac66c44d755e65`. Exact patch
check and application exited 0. Temporary application ownership:

- `scripts/__tests__/transform-schema.test.ts`;
- `scripts/sql-to-watermelon-migration.test.js`;
- `apps/mobile/__tests__/migrations/voice-ai-usage-limits-migration.test.ts` —
  new;
- `scripts/__tests__/voice-ai-safeguard-rpc.test.ts` — new.

Full governance and current staged bootstrap were already read. Root
`ctx_compose` completed for code understanding; full actual generator modules,
sync configuration, source-command-tdd and Caveman skills were read through
`qa-broker-server-source.txt`. `server-broker-verification.json` confirms
identity, status, tsx metadata and patch hash. The synthetic inline Row syntax
and table delimiters match the real parser, and the sync declaration matches the
test's source lookup. Both generator modules guard their mutating `main()` with
`require.main === module`; tests import their pure parser/generator APIs.

No production/test correction, provider/network/device action, SQL execution,
db:migrate, install, branch/commit/push or external application action occurred
in this integration slice. Mobile files and other workers' files remained
untouched. Root broker executed the runners; this worker independently read
their complete retained outputs. Native Node filesystem use was limited to
administrative relay consumption.

## Exact executed batch

Working directory for all three independent runners: the verified sibling. They
ran in parallel, each bounded to 180 seconds. All completed normally with exit
1, signal null, no timeout. No broader baseline or per-file lint/type/ format
check was run.

```powershell
node node_modules/tsx/dist/cli.mjs --test scripts/__tests__/transform-schema.test.ts scripts/__tests__/voice-ai-safeguard-rpc.test.ts
node --test scripts/sql-to-watermelon-migration.test.js
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --runTestsByPath apps/mobile/__tests__/migrations/voice-ai-usage-limits-migration.test.ts --json --outputFile E:/Work/My Projects/Monyvi/.git/worktrees/Monyvi-issue347-voice-usage-limits/server-exclusions-red-results.json
```

| Runner                        | UTC start / end             | Broker duration | Tests: passed / failed / skipped |
| ----------------------------- | --------------------------- | --------------- | -------------------------------- |
| tsx transform + RPC structure | 15:20:29.393 / 15:20:38.827 | 9,434 ms        | 6 / 2 / 4 of 12                  |
| Node SQL conversion           | 15:20:29.413 / 15:20:30.974 | 1,561 ms        | 9 / 1 / 0 of 10                  |
| Jest mobile exclusions        | 15:20:29.461 / 15:20:38.645 | 9,184 ms        | 1 / 2 / 0 of 3                   |

Aggregate: **25 tests, 16 passed, 5 failed, 4 skipped**. Jest has one failed
suite, zero runtime-error suites, zero pending tests and no open handles.
Classification follows actual operations, not aggregate labels.

## Failure and control classification

| Test / assertion                                               | Exact observed difference                                                                                                                                            | Meaning                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type generator excludes Voice operational tables               | `transform-schema.test.ts:251`: expected `["accounts"]`; actual `["accounts", "voice_ai_usage_windows", "voice_ai_work_requests"]`.                                  | Intended executed exclusion Red through actual `parseSupabaseTypes`. Account control is retained and SMS is absent from observed keys; fixture parsed correctly. |
| SQL converter excludes Voice CREATE changes                    | `sql-to-watermelon-migration.test.js:274`: expected `["local_control_table"]`; actual `["voice_ai_usage_windows", "voice_ai_work_requests", "local_control_table"]`. | Intended executed exclusion Red through actual `parseSql`. Ordinary control table is present; SMS is absent from observed keys.                                  |
| Usage windows excluded from mobile sync                        | Migration test line 29: expected `"voice_ai_usage_windows"` in real EXCLUDED_TABLES; missing.                                                                        | Intended sync configuration boundary Red; no full sync session is exercised.                                                                                     |
| Work requests excluded from mobile sync                        | Same line: expected `"voice_ai_work_requests"`; missing.                                                                                                             | Intended sync configuration boundary Red; no full sync session is exercised.                                                                                     |
| Explicit Voice migration exists                                | RPC structure test line 52: expected true, actual false; missing `supabase/migrations/082_voice_ai_usage_limits.sql`.                                                | Structural absence guard failure only. It is not actual quota, RPC, permissions or race behavioral Red.                                                          |
| Current Watermelon schema/migrations stay free of Voice tables | Separate Jest test passes all four table/artifact absence assertions.                                                                                                | Passed current local-boundary control; future migration/generation still needs regression proof.                                                                 |
| Existing type generator controls                               | All six existing tests pass: public schema selection, formatting guard, null fields, financial outcome determinism, uniqueness and exact revisions/effects.          | Passed scoped generator regressions.                                                                                                                             |
| Existing SQL conversion controls                               | All nine existing tests pass: IF NOT EXISTS filtering, ordinary CREATE preservation, exact account comment parsing and private quarantine exclusion.                 | Passed scoped conversion regressions.                                                                                                                            |

No setup/import/fixture failure occurred; no author correction is required for
these observed initial failures. There are **four intended exclusion failures**
and **one structural absence guard**, with their distinct evidence scopes.

## Assertions not executed

Earlier key-set failures stop the new composite tests. The type test's
`generateSchema`/`doesNotMatch` assertion is not reached. The SQL conversion
test's `addColumns` exclusion assertion and ordinary control name-field
assertion are not reached. Their authored presence is not executed Red or a
pass; preserve them and independently exercise needed branches before relying on
their outcomes.

Missing 082 deliberately skips these four RPC structure tests:

- creates exactly two privacy-safe Voice operational tables;
- denies ordinary table access and enables RLS;
- restricts Voice RPCs and cleanup to service_role;
- does not modify SMS safeguard objects.

TAP prints `ok ... # SKIP`; all four remain **unexecuted**, not passing security
or SMS evidence. Even later SQL text/regex passes cannot replace real DB grants,
ownership, callable RPC, accounting, controlled-clock, cleanup or independent-
session concurrency tests.

## Remaining gates and handoff

This slice supplies initial T006 exclusion/structure evidence. Accepted real
existing-handler HTTP Red is still required before the bounded callable
bootstrap in tasks.md. T007/direct SQL T009, sequential admission controls, real
T010 races and full PostgreSQL HTTP T014 remain separately unfinished. Undefined
functions/relations and serialized SDK doubles cannot close them. No production
bootstrap or feature completion is authorized by this report.

Return exact four-file application ownership to the lead/server author after
this evidence handoff. Retain all three runner logs and metadata; no repeat is
needed before a source/test correction or a separately released Green slice. The
six-file HTTP adapter proposal belongs to a separate intake/execution task.

The lead's refreshed primary-pool audit at 15:22:37 UTC corrects its earlier
Antigravity absence claim: the desktop executable exists under Local/Programs;
`agy` is absent from PATH, no app CLI bin exists, and the desktop version probe
does not establish callable model/tool capability. OpenCode 1.18.29 runs its
version probe but its stopped safe-source/session failure remains unresolved;
Normal ChatGPT remains remote authoring only. This worker read the saved audit,
`primary-pool-test-corrections-audit.json`, and performed no additional probe.

Evidence cutoff: **15:23:57 UTC**, **10 minutes 57 seconds** from assignment
start. All requested runners and classification are complete before the 15:33
checkpoint. Exact four-file application ownership is released to the lead; no
next verification or server implementation task starts without a distinct
bounded assignment.
