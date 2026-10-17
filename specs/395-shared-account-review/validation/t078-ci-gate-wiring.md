# T078 — bounded CI gate wiring (unreferenced GitData candidate)

**Pinned CI/package sole parent:** 14003a08ddd34deb4bb36b2eeff1c4547f466b01
(sole parent 7b39b4c1de97853be67149b79ebd3fb9333da08d). **Reviewed SQL
reference:** 385d0b715ad799c24fd8fdb1a3a53f25bf2a57c3. **Scope:** package.json,
.github/workflows/ci.yml and this validation report only.

## Quality job

One additive package script, `test:watermelon-sync-hooks`, invokes exactly:
`node --test scripts/__tests__/patch-watermelon-sync-hooks.test.cjs`. The
existing quality job calls that script after its unchanged
`Test Repository Scripts` step. Two separate quality steps call the already
present `npm run account-review:edge:check` and
`npm run test:account-review:edge` scripts, using the existing installed Node
toolchain. No repository script was removed or redefined; neither dependency
manifests nor package-lock.json changed.

The SDK patcher Node file exists at the pinned parent, but that pinned tree
contains the original eight test declarations. The separately authored SDK
90e2db01503843f1dea61ab9d66fca9da6fbe56e tests-only successor adds two real
generated-helper parity tests (total ten), and its SDK source child
809ddb516b5267fdb9fdcda8031df4670015fe3c must be integrated independently before
claiming the complete ten-test SDK gate. This wiring executes whatever verified
patcher suite is in the final integrated tree; it does not import, install or
edit that sibling's source.

## Financial-action pgTAP job

The existing local-Supabase job retains its existing install/start steps,
timeout, trigger, permissions and all ten original per-file pgTAP commands.
Eleven explicit new `npx supabase test db --local supabase/tests/<name>`
commands were appended to its existing `Run financial action pgTAP` step:

| Newly wired SQL suite                            | In reviewed 385d0b7 | In pinned 14003a0 |
| ------------------------------------------------ | ------------------- | ----------------- |
| account_create_default_recovery_outcome.test.sql | Yes                 | No                |
| review_account_guard_ownership.test.sql          | **No**              | No                |
| account_default_integrity.test.sql               | **No**              | No                |
| review_effect_tuple_guard.test.sql               | **No**              | No                |
| review_batch_save_mapping.test.sql               | **No**              | No                |
| review_batch_save.test.sql                       | **No**              | No                |
| account_create_default.test.sql                  | **No**              | No                |
| account_owner_serialization_race.test.sql        | Yes                 | Yes               |
| account_owner_lock_order.test.sql                | Yes                 | Yes               |
| review_outcome_replay.test.sql                   | **No**              | No                |
| review_contract_boundaries.test.sql              | Yes                 | Yes               |

Both revisions were inspected through their actual GitHub trees; the reviewed
SQL tree was complete (not truncated). The seven missing paths above do not
exist anywhere under another filename in that reviewed tree. They were still
added as **fail-closed unconditional commands** at the user's requested paths,
rather than silently skipped. Therefore this CI candidate is expected to fail on
an unintegrated tree until all missing SQL test files are published/integrated.
At the pinned parent eight paths are missing, including the valid separately
reviewed Add recovery SQL file.

The three existing canonical/action/effects pgTAP paths
(financial_action_canonicalization_test.sql,
account_financial_action_rpc_test.sql, account_financial_effects_test.sql)
remain present exactly once. No hosted Supabase grants, changes to migration
execution, tests, SQL files or external concurrency harnesses were made.

## Non-overlap and Root integration requirements

All existing quality/pgTAP job settings, workflow `on` and permissions, Android
E2E scope/matrix/triggers, emulator verification, APK build, snapshots and local
fixtures remain unchanged. The mobile run-ci-e2e owner 46 has an independent
source lease; no such file was edited here.

Root must integrate the seven absent pgTAP suites (and the independently
reviewed Add recovery SQL file where necessary) before treating this gate as
passing. Root must also integrate SDK patcher ten-test files, then run the
actual Node quality scripts and local Supabase pgTAP job. CI execution,
SQLite/SQL, tests, lints, formatting, installs, native/emulator work, hosted
changes, database operations and runtime checks: **NOT RUN by author**. No
branch, ref, push or PR mutations and no feature Green or activation claim.
