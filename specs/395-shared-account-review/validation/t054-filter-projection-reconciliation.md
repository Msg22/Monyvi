# #395 T054 — Canonical filter and shaped facade projection reconciliation

**Date:** 2026-10-16  
**Immutable source parent:** `9093c3d9b6895416dca8989c4fa79238a04a2550`  
**Parent tree:** `0f569bd841be697c1a76cd7d15d57d61a91f9a02`  
**Scope:** technical contracts/planning amendments and **four new tests-only** files. **SOURCE NOT GRANTED. TESTS NOT RUN.**

## Root-approved existing behavior, no new product scope

The approved three filters are `all | needs_review | selected`, with the bulk Select ready/Clear selection target strictly matching the current canonical session filter, global checked counts including offscreen rows, no implicit pending-group confirmation, and a single business-choice authority. No B1/spec/copy/provider/financial semantics are changed.

The one canonical `set_filter` command carries owner/session/current review revision/current operation generation and the next filter. A real change increments **only** review revision once (no business operation generation, source revision, row/group revision, selected bit, group/confirmation or financial state change). An identical filter is accepted with identity state, `effect:none`, no affected IDs and no physical update. Frozen Save, foreign owner, stale revision/generation, cancelled/competing command fail closed. All→Needs→All increments revision twice: the previous All bulk command cannot execute even when the final filter is All. The existing `isAccountReviewRowVisible` and reducer `select_ready` remain sole filter/readiness authorities.

A valid Remove Undo token and its pre-removal business snapshot survive **filter-only** navigation. Undo checks owner/session/source, exact removal business generation, complete original row/group/tombstone proof and absence of later business edits or ABA; it accepts a higher review revision **only** when remaining differences are navigation-only. Undo commits the guarded business restoration while retaining the **CURRENT** filter, not a pre-removal filter. A later row edit/selection/confirmation/new source still invalidates old Undo. No persistent SMS Undo.

SMS V2 stays in the existing `payload_version=2`, `payload_json` and existing physical columns. Historical strict nine-field review headers are read as filter All without reserializing the underlying historical JSON; all new V2 writes have exactly ten fields including local-only `filter`. Current linked drafts must agree on their decoded effective filter and revision headers before mutation. Changed filter rewrites **all owned live V2 headers** in one real scoped SQLite batch; untouched old V1 is migrated only under established genuine actor/header/fingerprint proof, and malformed V1 fails unchanged. Any private historical rejection snapshot must restore **original exact payload bytes** (even original nine-key V2 strings), not normalized new-ten bytes. No new Supabase column, Edge/provider schema, public financial tuple or durable Voice transcript.

The outward `AccountReviewFacadeView.readModel: AccountReviewReadModel | null` derives solely from the existing pure `projectAccountReviewSession` and current authenticated `loadAccountReviewAccountSnapshots`; no duplication of counts, group/readiness, filter state or second account data authority in UI. SMS loads session+owned accounts together; after command/reload the snapshot is revalidated/refreshed. Voice loads owner-scoped snapshots **before a ready projection**, refreshes after commands and reload. Aborted/missing/stale-owner/projection-failed context publishes null without old actor data. Only `summary`, `groupSummaries`, `visibleRowIds`, `readyVisibleRowIds` reach presentation; raw provider context/financial balances do not.

## Actual frozen-source gaps verified

| Actual path/lines at parent | Behavior that source must later reconcile |
| --- | --- |
| `packages/logic/src/account-review/review-schemas.ts:569–649` | Discriminated `accountReviewCommandSchema` lacks `set_filter`; strict parsing currently rejects the new command. |
| `packages/logic/src/account-review/reducer.ts:43–71,74–129` | Routed reducer has no navigation-only branch, but already has owner/review/generation CAS and frozen Save guard. |
| `packages/logic/src/account-review/reducer-primitives.ts:104–125` | All successful transitions increment both `revision` and `operationGeneration`; a filter-only specialized success path is necessary. |
| `packages/logic/src/account-review/reducer-undo.ts:155–198` | Exact pre-removal review revision +1 blocks filter navigation; retain full business identity/generation proof but allow only validated filter-only revision increments and preserve current filter on Undo. |
| `packages/logic/src/sms-review-drafts/sms-review-draft-codec.ts:285–296,358–380,444–511` | Strict V2 review header has nine fields, no filter. Preserve old decoder and introduce tenth local-only field on new encodes with deterministic closure. |
| `apps/mobile/services/account-review-command-snapshots.ts:75–91,143–180` | Rehydration forces `filter:all`, header equality excludes filter, per-row encoder omits it. |
| `apps/mobile/services/account-review-command-service.ts:103–167,169–245` | Real atomic writer reencodes V2 and V1 touched rows, but needs header-wide filter persistence and untouched-V1 compatibility; SMS Undo lifetime must not clear on filter. |
| `apps/mobile/hooks/account-review-facade-state.ts:51–63,115–130,196–203,243–319,376–425` | Facade privately holds SMS owned snapshots but publishes no readModel; Voice has no initial owned read; every success currently clears Undo except removal. |
| `apps/mobile/hooks/useAccountReview.ts:19–25,70–87` | Public result exports only the existing four view fields and dispatch/reload/undo; shaped projection is absent. |
| `packages/logic/src/account-review/read-model.ts:116–162` | Already projects exact current filter and previews readiness through the real guarded reducer; **reuse unchanged**. |
| `apps/mobile/services/account-review-command-publication.ts:338–368` | Existing late-source merging must retain the previous durable effective filter and never reset it because newly arriving V1 lacks a filter. |

## Authored tests, tests first / no runs

| New file | Cases and acceptance evidence |
| --- | --- |
| `packages/logic/src/account-review/__tests__/filter-transitions.test.ts` | F01–F10: closed set_filter schema; only filter/review revision change; samefilter no-op; All→Needs→All ABA stale bulk; foreign/session/revision/generation/frozen guard; exact active-filter reducer projection/SelectReady/Clear; Remove→Filter→Undo current-filter preservation; later business command invalidates Undo. Uses actual canonical normalized fixtures and reducer; no SUT mock. |
| `packages/logic/src/sms-review-drafts/__tests__/account-review-filter-codec.test.ts` | C01–C07: new exact ten-field V2; old genuine nine-field decode default All without changing original bytes; new/old equivalent business semantics; changed V2 writing explicit tenth; strict unknown filter/Undo rejection; physical selection/transaction unchanged; existing V1 byte behavior preserved. Real V1/V2 codec only. |
| `apps/mobile/__tests__/services/account-review-filter.sqlite.integration.test.ts` | S01–S09: real two-draft Watermelon/SQLite batch and queue; historical-nine → new-ten; independent adapter cold clone; filter ABA bulk; samefilter no adapter write; injected adapter failure rollback/retry; mixed-header conflict; foreign actor; Remove→Filter→Undo and no saved token; genuine late SMS publication retains accepted filter. Only auth/native constructor controlled. No command/codec/reducer/writer SUT mocking. |
| `apps/mobile/__tests__/hooks/useAccountReview.read-model.test.tsx` | H01–H11: actual pure projection exposed and no provider context; owner account load barrier for SMS and Voice; logout/stale actor; invalid owner context; Voice filter/command/reload recomputation; SMS canonical result projection; failed/reloaded SMS; Voice Remove→Filter→Undo token/current-filter preservation. Hook and pure projection under test; only existing read/bootstrap/command service boundaries mocked. |

Total **37 new authored test cases** (10 pure + 7 codec + 9 SQLite + 11 hook). No existing T024/T025/T030/T043/T044/T048/T057/T058 assertions were changed. Test declarations are **NOT RUN**; this is neither reported Red nor Green.

## Important gates / minimal next source leases

1. **Root first runs meaningful Red and full read-only `speckit.analyze`**, then issues disjoint source leases. No test file or production source is implicitly accepted by this docs/tests artifact.
2. **Pure owner:** `review-schemas.ts`, `reducer.ts`, `reducer-primitives.ts`, `reducer-undo.ts`; preserve the existing business-generation and full Undo anti-ABA proofs.
3. **Codec/SMS owner:** `sms-review-draft-codec.ts`, `account-review-command-snapshots.ts`, `account-review-command-service.ts`, narrowly `account-review-undo-lifetime-service.ts` if the existing lifetime clear needs a filter exception; revalidate late `account-review-command-publication.ts` without out-of-lane edits. Current `account-review-v2-codec.test.ts:86–96` expects nine keys **for a newly encoded V2**; Root must explicitly reconcile that previously correct legacy assertion in a separate authorized source/test repair. It was not altered here.
4. **Facade owner:** `account-review-facade-state.ts` and `useAccountReview.ts` if needed; publish solely the authenticated pure readModel or null, with SMS/Voice generation fences and retained transient Undo after set_filter.
5. **UI T054/T061 owner later:** dispatch only canonical filter/bulk commands using current CAS session/readModel; no shadow UI filter, second account fetch, copied count/reducer or new copy.
6. **No changes** to the frozen T048 foundation repair, Pro-owned live pull/default snapshot, CoreAdd, Panel SQL, provider/Edge, DB schema, generated types, B1 images, spec approval hash or locales. **Separate open T049 boundary**: all-dedup action-free cleanup in `apps/mobile/services/account-review-save-service.ts` may delete an original queue outside unresolved private-root lifecycle coordination. Explicitly held, not addressed or passed by filter tests.

## Artifact/validation status

The historical task inventory remains exactly **T001–T080, 80 IDs, 32 accepted checkmarks**; only T027/T029/T030/T054/T059/T061 wording/dependencies/coverage annotations were reconciled. All other IDs/checkmarks remain unchanged. No tasks were completed by authoring tests/docs.

**NOT RUN / NOT AUTHORIZED:** local files, commands, Jest, TypeScript, ESLint, formatters, SQL/pgTAP, provider, hosted, emulator/native, visual checks, full Speckit cycle, Git hooks, delegation, ref/branch/push/PR changes. GitHub GitData blob/tree/unreferenced-commit authoring only. Root owns further Red, read-only analysis, type/harness fixes on evidence, independent validation and release. **SOURCE OWNERSHIP NOT GRANTED; STOP.**
