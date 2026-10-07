# Issue #361: owner-aware pending sync

Tracking: https://github.com/Msg22/Monyvi/issues/361. Related design: #253.

## Root cause and implementation

WatermelonDB collects pending changes across all collections in the local
database. Preserved user A rows therefore enter the push callback while user B
is signed in. The generic ownership assertion previously aborted the entire
push. ID-only deletions had an additional acknowledgement problem: a scoped
remote delete could affect no rows, yet WatermelonDB would destroy the foreign
local tombstone after the callback resolved.

The push ownership service builds a new current-user change set before either
financial-action strategy or generic writes run. Skipped IDs are merged into the
existing `experimentalRejectedIds` result after financial acknowledgements, so
action handling cannot remove ownership rejections. WatermelonDB keeps those
creates, updates, and tombstones pending for their owner. Original change sets
are not modified.

Child creates and updates use the configured owned parent. Deletion ownership
uses one parameterized SQLite query per affected table, with a parent join for
children. This reads retained tombstones, which ordinary Watermelon queries
exclude. Only whitelisted sync-table identifiers enter SQL; user identifiers are
bound parameters. Missing ownership evidence leaves deletions pending.
Tombstoned parent IDs also scope remote child deletions.

Missing generic owner fields and malformed child links still fail closed.
Dedicated rows without ownership stay rejected. Shared system categories,
pull-only tables, financial-action reconciliation, and remote error handling
keep their existing behavior. Auth is checked after awaited local ownership
resolution and after remote processing. No schema migration, server contract,
financial calculation, user flow, or visual change is required.

## Manual device plan and coverage matrix

Use two dedicated development users A and B on one device. Keep existing local
data between sign-ins. Compare cloud data through scoped, read-only queries or
another device; local UI alone does not prove upload or acknowledgement.

| Scenario                                                                    | Automated coverage                                                                                                        | Device/E2E status                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A has pending asset, B creates asset and syncs; only B uploads              | `sync-multi-user.sqlite.integration.test.ts`: syncs B, preserves A                                                        | Manual device validation pending                                             |
| Retry B sync several times; A still pending; switch back to A and sync      | Same integration test checks local `_status`, retries, and A upload                                                       | Manual device validation pending                                             |
| A edits or soft-deletes asset before switching to B                         | Integration test: foreign updated and soft-deleted rows                                                                   | Manual device validation pending                                             |
| A and B both have deletion tombstones; sync B then A                        | Integration test: owned deletes and foreign tombstones, including database re-instantiation                               | Tombstone path is manual/harness-only; UI generally uses domain soft deletes |
| Child records belong to different users through parent assets/accounts      | Integration child tests; `sync.test.ts` sender ordering and owned-parent scope                                            | Manual device validation pending                                             |
| Delete child and parent together                                            | Integration test: child tombstones through tombstoned parents                                                             | Manual/harness-only                                                          |
| B's upload or delete fails; retry after connection recovers                 | Integration tests: remote upload/deletion failures preserve pending records                                               | Manual device validation pending                                             |
| A has account/metal actions while B syncs; only B's actions run             | `sync-push-service.test.ts`: foreign RPC suppression, malformed foreign payload isolation, mixed accepted account actions | Real provider RPC/device validation pending                                  |
| Sign out or change user during ownership resolution or upload               | Push-service auth tests and existing sync auth/watermark lifecycle suites                                                 | Manual device validation pending                                             |
| A local row lacks an owner or has invalid parent link                       | Push-service missing-owner test; ownership-guard tests                                                                    | Manual/harness-only; do not manufacture corrupt rows in production           |
| Shared categories and pull-only observations coexist with private data      | Push-service shared-category and pull-only tests; sync config/transform suites                                            | Manual device validation pending                                             |
| Return to A after app restart; A sees only A and pending edits still upload | SQLite test re-instantiates database before deletion sync; existing owner-watermark lifecycle tests                       | Full cold restart and auth UI journey pending                                |

For the normal device journey:

1. Sign in as A, sync baseline data, then disconnect network.
2. Create an asset, edit another asset, and delete another asset for A. Record
   names and expected values. Use test data only.
3. Use the existing logout option that skips unsuccessful sync; sign in as B
   after reconnecting. Do not clear app storage.
4. Confirm A's records are absent from B's screens. Create/edit/delete B's test
   data and allow sync to finish. Verify B's cloud changes and no uploads for A.
5. Reopen the app as B and repeat sync. Expected foreign-row error chain must
   not recur. Repeat with account, sender, and Metals test data.
6. Return to A, including once after a cold app restart. Verify A's pending
   changes upload and B's data stays absent from A's screens.
7. Repeat with a temporary network failure during B's sync. Failed changes must
   remain pending and upload once connection recovers.

## Honest E2E limits

The connected Android target during implementation was a physical device. No
isolated emulator with two provisioned test users and a way to assert per-user
cloud uploads/pending tombstones was available. Existing Maestro auth flows
cover one seeded user and cannot honestly prove this issue's acknowledgement
contract. No complete device journey or live cloud RPC result is claimed. SQLite
integration uses the real installed WatermelonDB synchronize and acknowledgement
implementations with mocked remote writes.

Before release, run the manual plan with dedicated development users or add a
two-user Maestro harness that can retain pending data, switch users, and verify
cloud outcomes. Do not reset the tester's app data or mutate shared cloud data
to manufacture this scenario.

## Validation evidence

- The initial SQLite suite failed with the reported foreign-asset error and
  demonstrated foreign tombstones being destroyed by successful acknowledgement.
- Final focused run: 13 suites, 124 tests passed, including existing Metals
  reconciliation, sync auth, owner-watermark, transforms, and financial-action
  protection suites.
- New ownership service: 100% statements, branches, functions, and lines
  covered.
- ESLint passed for all changed TypeScript files.
- Full mobile typecheck reports two existing TS2345 errors at `app/auth.tsx`
  lines 115 and 116 for `/privacy-policy` and `/terms`. A compiler run using the
  original main sources, with this fix excluded, reproduced exactly those two
  diagnostics. No sync-related TypeScript diagnostics remain.
- Device E2E and real cloud RPC validation remain pending as described above.
