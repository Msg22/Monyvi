# First server verification — bounded local QA

Execution/evidence responsibility released by the lead at the 20:40 UTC
checkpoint during the owner-approved continuation. Hard runtime report remains
21:10 UTC. QA owns this checklist and captured administrative runner outputs
only; externally authored production/test source remains read-only here.

Target: `E:/Work/My Projects/Monyvi-issue347-server`, branch
`codex/issue347-server`. Lead has prepared a no-commit merge of current main
while preserving authored changes; exact identity/status and producer/test
provenance must be included with captured runner evidence. Main/shared
device/hosted services are not test targets.

One independent four-runner batch is requested: installed tsx transform/schema
plus RPC structural tests; Node SQL-to-Watermelon generator tests; focused Jest
sync/migration exclusion tests; actual parse-voice handler Deno tests using the
existing test import map, synthetic environment and denied network. No broad
baseline, per-file formatting/lint, actual SQL migration application or provider
calls.

## Captured results

All four administrative runner sources, full stdout/exit records and Jest
assertions were read. `server-first-green-started.json` records exact server cwd
and launch at 20:45:08.559 UTC. All jobs finished with null signal and no
timeout. Aggregate: **36 tests — 31 pass, 1 structural bootstrap failure, 4
skipped**. This is partial Green only.

| Runner                                   | Exit / elapsed | Result                                                       |
| ---------------------------------------- | -------------- | ------------------------------------------------------------ |
| tsx transform/schema + RPC structure     | 1 / 5.526s     | 12 total: 7 pass, 1 missing-migration guard fails, 4 skipped |
| Node SQL-to-Watermelon generator         | 0 / 1.069s     | 10/10 pass                                                   |
| Jest server-only sync/migration boundary | 0 / 107.230s   | 3/3 pass; JSON success true, no failed assertions            |
| Deno actual parse-voice handler          | 0 / 20.550s    | 11/11 pass; type-check succeeds                              |

The four previously failing exclusion assertions are now Green: Voice
operational tables excluded by schema transformation and SQL-to-Watermelon
generation, and both excluded from mobile sync. Ordinary public-schema/account
and financial-action controls remain Green. The five previously failing metadata
assertions now pass: missing requestKey, missing callerTimeZone, overlong
requestKey, overlong callerTimeZone and unknown IANA timezone reject before
provider invocation. Prior handler success/date, unauthenticated, real
consent-helper rejection and four-attempt retry controls remain Green. No
fixture/loader failure was observed in this batch.

Remaining failure:
`T006 voice safeguard migration exists as an explicit production artifact`
asserts that `supabase/migrations/082_voice_ai_usage_limits.sql` exists; actual
false, expected true. This is a structural absence guard, not actual
quota/concurrency Red. Four dependent checks are skipped: privacy-safe table
definitions, server-only ordinary-access denial, service_role RPC restriction
and SMS safeguard preservation. Skips provide no passing evidence.

## Exact captured commands

Each uses `E:/Work/My Projects/Monyvi-issue347-server` as cwd and a 180-second
capture bound; installed Node invokes local tools directly, without install/npx
downloads.

```text
node node_modules/tsx/dist/cli.mjs --test scripts/__tests__/transform-schema.test.ts scripts/__tests__/voice-ai-safeguard-rpc.test.ts
node --test scripts/sql-to-watermelon-migration.test.js
node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --runTestsByPath apps/mobile/__tests__/migrations/voice-ai-usage-limits-migration.test.ts --json --outputFile <admin>/server-exclusions-first-green-results.json
C:/Users/Mohamed/.deno/bin/deno.exe test --no-config --no-lock --no-npm --no-remote --cached-only --no-prompt --deny-net --deny-import --allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,GEMINI_API_KEY --import-map supabase/functions/parse-voice/deno.test.import-map.json supabase/functions/parse-voice/index.test.ts
```

`<admin>` is
`E:/Work/My Projects/Monyvi/.git/worktrees/Monyvi-issue347-voice-usage-limits`.
Complete runner/exit/stdout artifacts use prefixes
`server-transform-first-green`, `server-generator-first-green`,
`server-exclusions-first-green`, `server-http-first-green`; Jest assertion JSON
is retained. No rerun or assertion weakening occurred.

## Coverage boundary

Direct-handler tests use SDK/provider doubles with denied network/import and the
real consent helper. They do not prove HTTP network transport, quota accounting,
replay persistence, cleanup, account isolation or genuine database concurrency.
The runtime pgTAP/dblink controls are separate readiness evidence. No actual
Voice SQL, hosted/provider call, native journey, commit/push or broad
verification was performed by this batch. Full server/feature Green is not
claimed.
