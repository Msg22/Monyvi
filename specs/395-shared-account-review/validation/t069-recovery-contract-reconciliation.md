# T069 — Add recovery contract reconciliation

Date: 2026-10-16. Replacement Normal ChatGPT contract author, GitHub connector
only. Documentation-only, changed-only UNREFERENCED GitData package. No source
lease, implementation, test execution, commands, formatter, database operation,
ref/push/PR edit, provider/native worker or delegation. Stop after handoff.

## Authority and exact inspected context

| Context                                     | Immutable commit                           |
| ------------------------------------------- | ------------------------------------------ |
| Sole documentation parent                   | `3f0d4279d543ed58dd7bc2d83abbeeea8011953c` |
| Parent Git tree                             | `186b40bede4c09735163e69955b07005c71f960a` |
| Current mobile source                       | `58acc73646426dcd5535f4b1885dd826d7747f2e` |
| T069 report and actual SQLite test artifact | `c7f05dcb94a440b2437494a7927d2fb21dbfe902` |
| Current SQL candidate                       | `f4ba7ccc22244cf3672c1a14a09132ed0d23e318` |

The old contract author's revoked lease is not reused. Root selected completion
of safe Add rejection recovery within the already approved local SQL/sync scope.
This packet implements that technical documentation decision, not the old
report's optional fresh-pull design. Governing spec/B1 and all completion
checkboxes remain unchanged; Root merges against its newer acceptance ledger.

## Changed paths and why

All paths are under `specs/395-shared-account-review/`:

| Path                                                  | Exact scope                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contracts/account-default-intent.md`                 | Add-only `canonicalDefaultSnapshot` outcome amendment, zero-effect protected transport, sufficient authority and immutable replay/cleanup boundary.                                                                      |
| `contracts/local-recovery.md`                         | Separate closed twelve-key Add private schema in existing carrier, actual capture/binding, dedicated atomic correction and exact dirty-state/suppression/pull/dependency cleanup. Review's nine-key schema is unchanged. |
| `data-model.md`                                       | Add-only projection/receipt/state summary; current-source note distinguishes existing carrier from historical missing-storage prose.                                                                                     |
| `plan.md`                                             | Current pins, existing-task dependency/coverage annotations and disjoint implementation gates.                                                                                                                           |
| `validation/t069-recovery-contract-reconciliation.md` | This source-backed reconciliation, handoff and proof limits. NEW.                                                                                                                                                        |

Actual six-contract filenames were verified. There is no `financial-command.md`
or `sync.md` in this parent. `account-default-intent.md` is the existing Add
contract, and `local-recovery.md` already owns capture/pull/recovery semantics.
No additional contract file is essential: the Add contract explicitly narrows
the common new-tuple outcome rule in `wire-shapes.md` by one Add-only key.
`financial-save.md`, `wire-shapes.md`, `parser-evidence.md` and
`review-commands.md` stay byte-identical. `tasks.md` is also byte-identical:
existing T043/T049/T050/T053/T064/T069 annotations live in the plan so this
parent's old ledger cannot overwrite Root's newer checkboxes. No IDs added or
tasks regenerated. No spec, image, binding, UI/copy or workflow-status change.

## Static findings from the actual sources

1. `apps/mobile/services/account-default-intent-plan.ts` at the mobile pin
   prepares the real account, optional bank/sender children, exact optional
   opening effect and actual prior-default clear, with cached/prepared owner
   guards. Its returned linked plan has no `buildLocalRecoverySnapshot`.
   `financial-action-foundation-contracts.ts` types that builder as Review-only;
   `financial-action-local-recovery-capture.ts` explicitly rejects non-Review
   builder tuples. This is the concrete Add durable-evidence gap, not absence of
   a generic carrier that would justify another migration.
2. `apps/mobile/services/sync/account-protected-fields.ts`, collector around
   lines 321–366, rejects `envelope.accountGuards.length === 0`. The valid
   zero-opening Add contract requires exactly zero financial guards/effects.
   Fixing this must remain an exact tuple-aware exception after complete
   account/default/child validation, never blanket empty-group acceptance.
3. `apps/mobile/services/financial-action-reconciliation-production.ts`, final
   dispatcher around lines 487–514, explicitly refuses `create_with_default`.
   Preserve fail-closed behavior until a complete Add adapter exists; routing it
   into Review or the old generic inverse would not supply missing proof.
4. `apps/mobile/services/sync/financial-action-root-pull.ts` admits private
   bytes only for Review and clears private content on incoming accepted roots.
   Add needs its own binding/preservation and dependency-aware cleanup, and a
   pulled server `reconciled` rejection must not pretend local compensation ran.
5. SQL `supabase/migrations/091_account_create_default.sql` at the SQL pin,
   failure handler around lines 1959–2142, rolls back tentative work, retains
   outer owner/root locks, rechecks owned immutable roots, captures canonical
   financial/absent-account evidence and persists failure. Its present outcome
   has no canonical full default graph. This is the bounded capture location for
   Add-only authority. The separate worker's two UUID-regex fixes and
   cross-owner action-veto removal are not performed, reviewed as fixed or
   overlapped here; SQL source ownership must first be released.
6. `packages/logic/src/financial-actions/action-contracts.ts` requires
   duplicate-key-free canonical outcome JSON and valid immutable state evidence.
   T069's `markRejected` helper currently uses ordinary `JSON.stringify` and its
   stale fixture lacks `canonicalDefaultSnapshot`. Setup rejection is not
   successful entry into the recovery SUT. Do not count it as behavioral Red or
   weaken state validation to reach an assertion.

The physical hash primitive was inspected in
`account-review-local-snapshot-postimages.ts`: typed raw scalar fields,
ASCII-sorted keys, table/ID/version binding, excluding domain `_status` and
`_changed` but retaining domain timestamps. Reuse it; capture actual immutable
prepared images instead of inventing preimages from the public Add payload.

## Exact selected contract

The private version is `account-create-default-local-save/v1`, with exactly
`version, actionId, ownerId, rootBinding, payloadHash, expectedDefaultSnapshot, preparedDefaultSnapshot, dependencyRoots, createdAccount, createdChildren, openingEffect, priorDefault`.
Nested fields, literals, hashes, sorted membership, null/zero behavior and
transport attribution are exhaustively specified in the local contract. Root
binding is owned logical tuple/reference plus canonical full-envelope hash; no
new physical root ID or publicly serialized dependency is needed.

The server addition is only `canonicalDefaultSnapshot` on bound Add business
`stale | rejected` outcomes, using the existing closed two-key DefaultSnapshot.
It is captured after business rollback under existing owner serialization and
stored/replayed immutably. Null is invalid; `activeAccountIds: []` with null
default is a legitimate empty target; nonempty IDs with null is legitimate
no-default state. Missing legacy/unbound authority refuses automatic recovery.
Accepted/idempotent, Review and deployed outcomes remain unchanged.

Local recovery requires canonical graph equal to captured expected graph and
current graph equal to actual prepared graph, positive physical created-account
absence, exact immutable owned root/dependencies, financial revisions and all
account/default/child/effect postimages. Then one owned writer tombstones only
losing created members, deactivates only the original nonzero opening effect,
restores only the actually cleared proven prior default and records local
completion. A mismatch, later edit, unresolved dependent or unknown in-flight
write means no mutation. There is no generic inverse, default selection,
automatic successor cancellation, fresh-pull requirement or latest-cloud claim.

Correction never becomes generic LWW intent. Preserve unrelated current dirty
metadata/timestamps, remove only canonicalized flag dirtiness, exclude clean
protected fields from residual generic metadata patches and durably suppress
losing members even when the root is no longer dirty. Guard both send and ACK
against stale captures. Acceptance alone does not clear Add evidence: canonical
receipt persistence, exact protected ACK, residual dirty preservation, in-flight
safety and dependency retention govern cleanup. A→B dependency roots and hashes
survive cold restart; B never resamples or sends before A accepts.

## Proposed disjoint source ownership — NOT A GRANT

All mobile paths below are under `apps/mobile/services/`. NEW means a proposed
cohesive file, not a claim that an Add adapter already exists. Root must grant
against its fresh integrated source after analysis/Red and existing releases.

| Lane                                      | Exact proposed source paths                                                                                                                                                                                                                                                                                                                       | Dependency / exclusion                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure Add schema and capture integration   | NEW `packages/logic/src/financial-actions/account-create-default-local-recovery.ts`; NEW `packages/logic/src/financial-actions/account-create-default-outcome.ts`; mobile `account-default-intent-plan.ts`, `financial-action-foundation-contracts.ts`, `financial-action-local-recovery-capture.ts`, `financial-action-foundation-repository.ts` | One owner for shared foundation and canonical export integration. Read original Add command/service; expand to them only if actual capture inputs require it and Root grants exact files. Preserve Review format and physical hash helper.                                         |
| Dedicated Add recovery                    | NEW mobile `account-default-intent-recovery-evidence.ts`, NEW `account-default-intent-recovery-commit.ts`; `financial-action-reconciliation-production.ts`                                                                                                                                                                                        | Consume accepted schema/capture contract; own the dispatcher alone. Do not edit existing Review recovery implementation or generic inverse semantics.                                                                                                                              |
| Protected sync, predecessor and root pull | Mobile `sync/account-protected-fields.ts`, `account-review-default-predecessors.ts`, `financial-action-sync-service.ts`, `sync/financial-action-root-pull.ts`, `sync/financial-action-root-pull-identity.ts`, `sync/transforms.ts`                                                                                                                | One owner for tuple response validation/accepted cleanup integration, durable suppression, per-field residual projection and actual pull application. Generic transport/ACK caller changes require exact-path intake and a serialized extension, not a second simultaneous writer. |
| Add-only SQL outcome                      | `supabase/migrations/091_account_create_default.sql`                                                                                                                                                                                                                                                                                              | Wait for current regex/owner-veto worker release. Same existing outer owner scope, after rollback; no new Review/legacy outcome field, new migration prefix or hosted application.                                                                                                 |
| Existing tests and final integration      | Existing T043/T064/T066/T069/T053 test owners and Root                                                                                                                                                                                                                                                                                            | Root allocates exact test files after fixture admission/meaningful Red. This contract author owns no tests. Shared barrels, generated artifacts and generic send/ACK callers remain Root-serialized, never concurrent ownership.                                                   |

The schemas/capture and SQL lanes can proceed independently only after the
contract/Red gates; recovery and sync consume the frozen schema but cannot claim
integration before real persistence/suppression/SQL evidence. This table does
not reopen existing worker leases. The current Add result's Root-provided SQL
fixes must be composed first, not overwritten by an older f4 source copy.

## Required proof and current limits

T069's actual new file is
`apps/mobile/__tests__/services/account-default-intent-sync-recovery.sqlite.integration.test.ts`
at the stated c7 pin. Its 15 definitions produce 16 cases. The report is
`validation/t069-add-sync-recovery-gap.md`. This author read the report and test
paths but ran none. No passing counts or Green are inferred from their presence.

Retain all existing semantic cases: zero-effect protected A01/A02/A04, nonzero
physical membership A03, immutable transport/replay A05–A07, recovery A08, newer
choice/child A09/A10, owner A11/A15, conservative dispatcher A12 and cold A→B
ordering A13/A14. Correct genuine canonical serializer/state fixtures first; A08
needs a positively authoritative default receipt. Keep absent, null, malformed,
foreign and canonical-graph-different receipts as refusal coverage rather than
making the old insufficient fixture a success.

Additional meaningful coverage must prove all twelve/nested private keys and
bindings; zero/nonzero/null/empty membership; actual prepared/cached rollback;
SQL post-savepoint atomic graph capture/replay and owner races; unchanged
Review/old outcomes; cold pull remote-ID remapping with local unresolved state;
accepted-before-ACK/dependent-root retention; duplicate callbacks and committed
failure replay; older captured generic send/ACK; subsequent sync of losing
account/child tombstones and effect rows; preserved unrelated dirty name/
provider/timestamp fields; no clean corrected default in a whole-row payload;
new genuine default intent not suppressed forever; missing historical evidence
remaining unresolved; private bytes absent from all cloud/logging paths.

NOT RUN: speckit.analyze, Jest/SQLite, SQL/pgTAP, type checks, lint, formatting,
generation, native/emulator/device checks, provider requests and hosted checks.
Static source reading does not establish atomicity, complete generic send/ACK
coverage, fixture correctness or SQL/client parity. Root must merge the bounded
docs preserving its newer ledger, run fresh analysis and meaningful Red, then
grant disjoint source with independent review. **No Green, source readiness,
activation or deployment claim. CONTRACT HANDOFF ONLY — STOP.**
