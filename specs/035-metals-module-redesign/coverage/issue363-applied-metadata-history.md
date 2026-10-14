# METALS-363 — Applied Name/Notes evidence coverage

Authority: approved GitHub issue #363 contract and Mohamed's explicit per-edit/SQL/local-migration approval.
Governing main: `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`.
Dependent #355 head: `12c466e3568891467fd18e28b9fd082d6209d4ff`.
No legacy backfill or reconstructed Name/Notes; no material evidence/P&L changes.

## Ownership and cutover

- Schema v31 extends #355's schema v30. SQL `087_metals_metadata_applied_history.sql` follows 086. All edits use stable per-edit ID/hash and server-authoritative locked-row outcomes.
- The old authenticated `apply_metal_metadata_patch_v1` permission is revoked so there is no History-evidence bypass. Unsynced pre-v31 metadata with no durable identity is not acknowledged and requires an explicit separate recovery decision; never guess old changes.
- The new `metal_metadata_edit_outcomes` is a dedicated table: locally created durable request/outcome, server-only adjudicated immutable applied evidence. It is scoped by user and holding in writes, pull, read, and RLS.
- Details now consumes persisted metadata outcomes through its local read-model and observes both outcome changes and financial root state changes. Name/Notes use the existing Details updated row and existing null-value copy in English/Arabic; no new flow, badge, pending or device-status copy. Accepted mixed edits join one correction row; canonical metadata that wins while material CAS loses appears as a metadata row, without financial acceptance.

## Test matrix — authored, NOT RUN (per local final pre-push override)

| Requirement | Automated coverage | Status |
|---|---|---|
| Name/Notes before→after from applied values only | `metal-metadata-evidence-protocol.test.ts`, pgTAP `metals_metadata_applied_history_test.sql` | NOT RUN |
| Distinct offline edits, restart replay, hash stability | `metal-metadata-evidence-repository.test.ts`, `metal-metadata-dedicated-sync-service.test.ts` | NOT RUN |
| Ignored and newer-clock same-value excluded; Notes clear null | Pure projection tests, pgTAP helper checks | NOT RUN |
| Mixed correction combines material and only winning metadata fields; stale financial CAS can independently apply metadata | `metal-metadata-history-read-model-service.test.ts`, `metal-metadata-stale-canonical-commit.test.ts`, `sync-push-metals-ownership.test.ts`, public-RPC pgTAP `metals_metadata_mixed_cas_test.sql` | NOT RUN |
| Metadata-only produces durable row, no financial event or revision bump | `edit-metal-holding-command-service.integration.test.ts`, `metals_domain_test.sql` | NOT RUN |
| Canonical outcome validates per-field clock, discards submitted intent | `metal-metadata-evidence-reconciliation.test.ts` | NOT RUN |
| Dedicated RPC before/after, replay, immutable owner/hash | `metals_metadata_applied_history_test.sql` and local final SQL fixture extension | NOT RUN |
| Sync failures, auth changes or tampered hashes never acknowledge a failed request; an incomplete financial reconciliation cannot acknowledge action rows | `metal-metadata-dedicated-sync-service.test.ts`, `sync-push-metals-ownership.test.ts`, existing sync negative tests | NOT RUN |
| Legacy METAL Name/Notes writes without a durable per-edit identity fail closed instead of being silently acknowledged | `sync-push-metals-ownership.test.ts`, `push-service.ts` | NOT RUN |
| New table pull reads JSONB as exact text, scopes owner | `sync-pull-dispatcher.test.ts`, integration smoke on v31 | NOT RUN |
| Owner scope, RLS, forbidden direct legacy writes | pgTAP table/policy/access assertions and manual cross-user | NOT RUN |
| Existing financial P/L/sale/undo/regressions unchanged | Existing Metals material/financial regression suites (no touched financial math) | NOT RUN |
| Details exact Name/Notes/null clear and accessible row text | `MetalHoldingTimelineItem.metadata.test.tsx`, `metals-content-contract.test.ts` | NOT RUN |
| Sorted/deduplicated combined History; material Undo/Sell tie order preserved; values/P&L unchanged | `metal-metadata-history-read-model-service.test.ts`, `metal-detail-history-read-model.test.ts` | NOT RUN |
| Reactive outcomes/root updates, observer failure recovery, cleanup and auth boundaries | `useMetalHoldingDetail.test.ts`, `metal-metadata-stale-canonical-commit.test.ts` | NOT RUN |
| Complete offline Name edit → History → Notes clear → History → restart/reopen | `apps/mobile/e2e/maestro/metals/name-notes-history.yaml`; authenticated English lifecycle seed, runner supplies actual offline mode | AUTHORED, NOT RUN |
| English/Arabic/RTL/large text/TalkBack and visual baseline | Manual QA plan below; unit locale/label coverage is not visual proof | NOT RUN |

## Non-automated / owner-device handoff

All manual device and rendered screenshot checks are **NOT RUN**:
- Android/iOS, normal + compact phone/tablet/landscape.
- Light/dark, Arabic RTL including punctuation around mixed-script names; 200% text.
- Accessibility tree, TalkBack/VoiceOver labels and spoken exact before/after.
- Offline save, restart, later sync and two-device mixed winners; invalid/rejected no bogus applied metadata.
- Full visual side-by-side/overlay proof against approved ordinary-phone Details/History references and appropriate binding verification.
- Confirm global All/Sold/Disposed list unaffected and existing per-holding timeline semantics preserved.

## Excluded

No test/lint/type/build/format commands run. No remote database mutation/deploy/reset, customer data, environment/secrets, npm installation, branch/ref/PR mutation or legacy reconstruction. Existing History terminology is extended only for the approved Name/Notes row.

**Gate:** run tests and pgTAP plus isolated explicitly local migration verification and rollback in the authorized final pre-push batch; record exact Red/Green evidence, DB/security review and owner device proof before claiming completion.

## Integration boundary

The generic push coordinator invokes the dedicated metadata service before its generic table loop. `METALS_DEDICATED_SYNC_TABLES` excludes request/outcome rows from generic upsert. Pending mixed requests require canonical server proof even when financial CAS is stale; invalid requests discard optimistic evidence. Canonical per-field outcomes remain durable across restart and repeated sync. No material event, revision, acquisition evidence, account effect or FR-050 calculation is manufactured by metadata History.

The canonical holding-state primary key equals holding_id (068 insertion/backfill); no arbitrary identifier guard was weakened. SQL 087 retains owner/hash/holding serialization, immutable outcomes and owner RLS. Only a validated holding revision conflict can independently apply metadata; malformed/hash/foreign/unknown predecessor requests cannot. New PostgreSQL cases are authored but unexecuted.

Two-device races, ambiguous provider/network timing, actual connectivity loss, RTL/font-size/device accessibility and screenshots remain manual-only because the existing Maestro harness cannot control these server/device states. The new flow is a complete user journey with existing UI selectors, not a source-string assertion.
