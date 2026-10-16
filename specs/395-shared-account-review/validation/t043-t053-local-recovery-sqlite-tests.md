# #395 T043/T053 — physical private recovery tests-first handoff

**Mode:** TESTS ONLY. No production, generated schema, SQL, sync, foundation, Save, or remote mutation.  
**Exact immutable parent:** `cc5062ca2681b4a8426fa006ec56cf263ecff8e0`, Git tree `91eabb9ef10e6a5c0367036984587d7e11fdf34e`.  
**Trusted policy:** Constitution 1.8.0 at `503f5a1336ba23f6d270615ce1ba47b02116e4f0`; offline-financial-systems persona and skill from governing `c02a7736`.  
**Observed source foundation:** real generated Watermelon schema v31, existing Save/foundation with Root-reported 106 PASS, but private builder/capture/dedicated pull/cold-restart compensation are not present. Root-reported T044's 24 existing negative cases are not edited. No Green is claimed for this wave.

## Changed paths and immutable before blobs

| Exclusive file | Before at parent | Test artifact blob |
| --- | --- | --- |
| `packages/logic/src/financial-actions/__tests__/review-local-recovery.test.ts` | `7f3e11b79a15fa44068333ef671566b937d46e73` | `50935426b3ddf8e9498b63fc841d19b092276736` |
| `apps/mobile/__tests__/services/account-review-local-recovery-test-harness.ts` | NEW | `0bd89c57a096612dfdbfc654d1d51c29aec6379d` |
| `apps/mobile/__tests__/services/account-review-local-recovery.sqlite.integration.test.ts` | NEW | `63e2c0214f8dd3a58d8b8be3096a2e329f947fb9` |
| `apps/mobile/__tests__/services/account-review-local-pull.sqlite.integration.test.ts` | NEW | `392a5a916d3c59f9f2c12d3e278d4676a9d78512` |
| This report | NEW | Commit tree |

The existing private-schema `UUID_QUEUE` positive fixture now equals the real `REVIEW_SESSION_ID`. The explicit mismatched-queue negative test instead constructs an internally consistent **different** queue and drafts, then checks structural acceptance followed by authenticated-root rejection. All 40 Root-observed private-schema cases and every previous assertion are preserved; one additional structural-negative-path assertion is authored. No reader/parser code changed.

## Real SQLite infrastructure and bounded case inventory

The new harness is model-/adapter-compatible with the existing `account-review-save-sqlite-test-helpers.ts`, `account-review-save-ledger-models.ts`, and canonical Save fixtures. Its `@monyvi/db` Jest dependency injection creates a **real SQLiteAdapter, WatermelonDB Database and actual custom FinancialActionGroup model** exactly as the existing passing Save suites do. It does not mock Save, foundation, reconciliation, parser, or pull SUTs. It uses the existing `testClone()`, physical `database.write/batch`, ledger snapshots, v2 draft encoder, and actual SQLite conflict injector. A bounded test-only physical queue replacement aligns the old Save SMS draft fixture's queue UUID with its canonical SMS review session; it does not modify old helpers or production.

### `account-review-local-recovery.sqlite.integration.test.ts`

**Nine test declarations, eleven parameter-expanded scenarios**:

- **L01 (1):** Build version30 from the actual tracked local schema while omitting only the new private column; create a real v30 SQLite root and three legacy accounts; open the same SQLite database with the tracked v31 schema and **real exported Watermelon migrations**; verify root contents, default `null`, accounts, then `testClone()` restart preservation. No SQL/regex substitution for the migration.
- **L02 (2):** Canonical SMS new Bank and Wallet Save, actual same `database.batch` operation witness for action root, account/effect/draft changes, nine-key stored snapshot, owner/action/queue binding, every intended created domain/child ref backed by an actual SQLite row, authentic provider output via production reader, and persisted draft cleanup. The builder must derive its **postimage hashes** from actual prepared records; tests do **not** invent them.
- **L03 (1):** Capture real SMS draft numeric `payloadVersion`/`position` before Save; require exact canonical-string equality in retained private available-entry preimages. Unsafe large-number restoration is intentionally not implemented.
- **L04 (2):** Real Voice existing-account and Cash scenarios; private root and created refs, no Voice transcript, no SMS entries/queue, and no private bytes in the cloud payload.
- **L05 (1):** Full physical SQLite clone and owned-root-bound reader after SMS Save preserves byte-identical private JSON.
- **L06 (1):** Real within-batch SQLite UNIQUE failure: root, private bytes, accounts, children, effects, drafts and cached account raw state unchanged. Uses existing genuine adapter conflict injector, not a fabricated committed status.
- **L07 (1):** Tests-first **optional linked-plan builder** on the real `FinancialActionLinkedOperationPlan` with the actual `cachedPreimages` and `preparedPostimages`. The callback records that ownership/prepared validation completed, sees immutable prepared raw records, then throws intentionally; whole ledger and root must remain untouched. Production currently ignores this missing callback, so this is expected behavioral Red.
- **L08 (1):** Real all-dedup SMS cleanup produces no fabricated financial root/private carrier.
- **L09 (1):** Real physical Save root routed through the unmocked `createFinancialActionSyncService` with an injected failing **transport only**; assert the exact outgoing RPC fields are `payloadHash,payloadJson`, with zero private JSON, plus true dedicated/generic-push table classification and no raw private outcome.

Some initial source cases will be behavioral Red because Save does not yet build or persist the private snapshot. This is intentional; Root must still execute the suite to classify actual results. Builder callback throwing is never offered as evidence of physical compensation or restored rows.

### `account-review-local-pull.sqlite.integration.test.ts`

**Seven test declarations, seven scenarios (P01–P07), creation Red.** A genuine dedicated financial-root pull writer does not currently exist in the pinned production sources: `DEDICATED_SYNC_TABLES` excludes `financial_action_groups` from generic pulls and the existing `remapFinancialActionRootIds` helper is not wired into the atomic pull. The suite deliberately imports the as-yet-unimplemented `../../services/sync/financial-action-root-pull`, exporting `applyOwnedFinancialActionRootPull`. **This intentionally causes module-creation Red with zero executed physical pull assertions until source is granted.** The suite never pretends a JSON sanitizer or mock upsert is an owned-root pull.

Proposed smallest API, typed entirely using actual existing Watermelon/sync types:

```ts
export function applyOwnedFinancialActionRootPull(input: {
  readonly database: Database;
  readonly expectedOwnerId: string;
  readonly changes: SyncTableChangeSet;
}): Promise<void>;
```

Test cases feed remote rows derived from the actual persisted `FinancialActionGroup._raw`, not copied action DTOs. P01 requires exact owner/action/payload identity to preserve pending private bytes through actual SQLite pull/upsert and preserve other tables; P02 rejects remote-injected private data; P03 terminal accepted outcome atomically clears; P04 foreign owner fails closed without disclosure; P05 immutable hash/payload action reuse fails closed; P06 a separately hashed canonical new cloud action gets **null** private content rather than inheriting another root's preimage; P07 failed invalid action data applies nothing. Direct-root illegal collisions may be rejected rather than overwriting protected original records; that must not be misclassified as a successful remote row.

## Narrow source seam, no fabricated recovery implementation

Proposed **only** on the existing `FinancialActionLinkedOperationPlan`, not a new financial DTO or public/cloud field:

```ts
readonly buildLocalRecoverySnapshot?: (
  input: FinancialActionLinkedOperationPreparedOwnershipInput
) => Promise<AccountReviewLocalSaveSnapshot>;
```

The callback must execute after `assertPreparedOwnership`, verified prepared-operation identity and the owner/current-root rechecks, before `prepareLocalRoot` and the **same real adapter batch** containing all linked operations. The inputs are exactly the foundation's frozen cached preimages and immutable prepared postimages. No test-generated placeholder expected-postimage hash is ever used to assert a valid production recovery. The source must use an approved canonical domain-only hash (excluding Watermelon transport `_changed/_status`) and bind the action root, queue header, each draft, created domain/child, actual default preimages and outstanding predecessor action IDs.

## Scope and evidence limitations

The pure parser only rejects malformed/foreign/stale scope; it is not physical evidence of postimage membership, financial-effect identity, rollback restoration, accepted server outcome or idempotent compensation. Explicitly deferred to separately authorized T048/T049/T050/T051 and T074 waves:

- Real rejected action once-only compensation across cold restart, with created child/effect/default physical postimage verification.
- Tombstone-versus-absent/rebound/replaced SMS row proofs and original queue re-creation safeguards.
- Per-draft 30-day expiry equality, partial redaction, discard/reset/new-namespace supersession.
- Safe lossless numeric conversion/refusal from canonical private strings into Watermelon `number` fields.
- Default predecessor accepted/rejected/unsupported serialization and retry; session replacement/actor change.
- Real dedicated pull implementation and holistic push/outbox/log exclusion beyond the direct RPC and config assertions.

**NOT RUN:** Node/Jest/SQLite, migration execution, formatter, ESLint, TypeScript, generator, SQL/pgTAP, provider, emulator/device/native, hosted writes or CI. Existing Save 106 PASS and T044 24-case data are only Root-reported prior evidence. No refs, push, PR/comments, delegation or Codex handoff. New pull suite is expected to fail at missing-module import until Root authorizes source implementation.

**STOP: TESTS-FIRST ARTIFACT, NO PRODUCTION GRANT.**
