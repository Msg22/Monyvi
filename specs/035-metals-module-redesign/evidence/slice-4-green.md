# Slice 4 Metals Persistence — Verified Partial Green

Date: 2026-09-01

Base: `bf2e3a071c2814772e9a9669479afeeb85d48767` (`origin/main`, PR #251 merged)

Status: the schema/model infrastructure, deterministic fixtures, approved
content, and render assets are Green. Slice 4 is not complete. Exact action
payload registration, accepted RPC mutation, local action commits, and durable
reconciliation remain blocked by the unresolved six-schema decision matrix.

## Prerequisites and stack compatibility

- T017 and T024 are the only Slice 4 prerequisites; both are checked complete.
- The stack was rebased onto the merged financial-action foundation at
  `bf2e3a0`.
- PR #251 owner-marker, authenticated-user pull lifecycle, dedicated-table
  rejection, action-foundation contracts, and generic-root exclusions remain
  intact.
- Migration 068 contains no account credit/effect behavior from issue #242 or
  migration 069.

## Honest completion boundary

Completed and verified:

- T035, T038–T041: initial Red contracts and evidence;
- T046: approved EN/AR content and translation schema;
- T047: deterministic fixture profiles plus executable seed/reset/inspect
  support;
- T048: approved supplied Gold/Silver object assets, typed manifest, hashes,
  provenance, and neutral fallback;
- the independent parts of T042 and T045: migration/tables/RLS/index/model
  infrastructure, table ownership, pull-only observations, protected fragment
  stripping, and generic dedicated-table exclusion.

Still open:

- T036: real SQLite Add/Correct/Sell v2/Dispose/Delete/Undo evidence/CAS tests;
- T037: executable durable rejection/reconciliation/exact-once tests;
- T042: accepted authenticated holding-only RPC contract and action-specific
  SQL validation;
- T043: scoped local one-writer repository/command path;
- T044: durable reconciliation and compensation path;
- T045: real dedicated action push/RPC coordination;
- T049: complete Slice 4 compatibility and verification freeze.

`tasks.md` therefore marks only T046–T048 newly complete. It deliberately
reopens T036 and T037 because the earlier speculative tests did not prove the
task text.

## Fail-closed action boundary

No approved repository ledger defines the exact payload fields for all six
immutable schemas. The production Metals registry is intentionally empty.
Add, Correct, Sell v2, Dispose, Delete, and Undo all reject with
`metal_action_schema_not_approved`; hand-built envelopes also fail generic hash
validation as unknown definitions.

Migration 068 exposes no authenticated mutation RPC. Its private helper checks
only approved schema-independent invariants: supported kind/version tuples,
holding/domain-reference equality, empty account guards, canonical revision
grammar/range, and the expected holding revision inside the hashed payload. It
is service-role-only and cannot accept a client action.

The exact field decisions and missing approvals are maintained in
`slice-4-action-schema-decision-matrix.md`.

## Verification results

All Supabase commands used `--local`; no remote Supabase project was mutated.

| Check | Result |
| --- | --- |
| `npx supabase db reset --local` | Pass. Replayed migrations 001–068 and seed from a clean disposable database. |
| Foundation + Metals pgTAP | Pass: 2/2 files, 87/87 assertions. |
| Current Slice 4 Jest set | Pass: 6/6 suites, 31/31 tests. |
| PR #251 overlap/foundation/sync Jest set | Pass: 11/11 suites, 130/130 tests. |
| Full mobile Jest suite | Pass: 304/304 suites, 2614/2614 tests after the PR #254 non-schema review batch. |
| Full logic Jest suite | Pass: 69/69 suites, 1238/1238 tests. |
| `npm run typecheck -w @monyvi/mobile` | Pass. |
| `npm run typecheck -w @monyvi/logic` | Pass. |
| `npm run typecheck -w @monyvi/db` | Pass. |
| `npm run lint -w @monyvi/mobile` | Pass after adding the required explicit fixture-client return type. |
| `npm run lint` | Pass with the repository's existing warnings and zero errors after replacing five manifest `require()` calls with typed static image imports. |
| Fixture `seed -> inspect -> reset -> inspect` | Pass. Seed inspection returned the exact asset, asset-metal, holding-state, and observation rows; reset inspection returned zero rows for all four groups. |
| PR #254 non-schema review set | Pass: 3/3 suites, 14/14 tests. Legacy Live Rates labels, clock-relative rate fixtures, material account eligibility, and the reduced sync/rate boundary are covered. |
| Ineligible account fixture on local Supabase | Pass. The missing-rate/ineligible profile seeded exactly four USD accounts and zero EGP accounts for its EGP Metals holding; reset returned the account table to zero rows. |
| `npx supabase db lint --local --level error` | Pass for `extensions`, `private`, and `public`. |
| `git diff --check` | Pass. |

## Persistence and security evidence

- Gold/Silver only; exact persisted shadow fields remain numeric/text/bigint,
  without a new floating-point source of truth.
- Every user-owned Metals table includes owner and sync columns; the shared
  server-generated observation table uses the documented pull-only exception.
- User-owned tables have RLS, current-user SELECT policies, owner/foreign-key
  indexes, and SELECT-only authenticated grants.
- Lifecycle/action links use composite ownership constraints and cannot cross
  owners or holdings.
- Private security-definer helpers fix `search_path`, revoke PUBLIC/anon/
  authenticated execution, and grant only `service_role`.
- Generic sync rejects dedicated Metals tables, strips action-owned projection
  fragments, routes observations as pull-only, preserves authenticated-user
  lifecycle checks, and propagates pull/push failures.

## Coverage and manual plan

| Scenario | Automated coverage | Manual / blocked status |
| --- | --- | --- |
| Exact guarded backfill, null unknown provenance, models/RLS/indexes | migration Jest + local replay + pgTAP | Inspect representative legacy rows after merge. |
| Unapproved Add/Correct/Sell v2/Dispose/Delete/Undo | adapter approval-gate Jest | Confirm every action remains unavailable until schemas are approved. |
| Rate-reference rules and sync ownership/protection/failure | Metals sync/rate Jest + PR #251 overlap set | Metadata LWW and real dedicated action delivery remain blocked. |
| EN/AR parity and approved copy | content-contract Jest | Story slices own rendered locale/RTL verification. |
| Deterministic clock-relative fresh/stale profiles and material account eligibility | fixture Jest + real local fixture cycle | Seed, inspect exact IDs, reset, inspect empty. |
| Gold/Silver bar/coin/jewelry selection and fallback | render-manifest Jest with hashes | Visual assets are inherited from the approved handoff; no image was generated. |
| Accepted mutation, replay, stale winner, restart, rollback, exact-once recovery | none claimed | Blocked until the exact schemas and executable RPC/coordinator exist. |

## Publication statement

This evidence supports a partial infrastructure PR only. It must not be used to
claim T042–T045 or T049 complete, nor to claim an executable Metals action or
reconciliation path. The PR description must repeat these blockers and coverage
limits.
