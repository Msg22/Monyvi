# T048 — Frozen original intent / historical replay SQLite test lease

**Status 2026-10-16: TESTS FIRST; NOT RUN; no application integration grant.**

## Immutable input and accepted baseline

- Parent: `5e79a2ef9f43e9378c2d689e7a48add47564b81b`
  (parent `6834541e5e8f5023a28a027c4a0e0b327044ffc4`).
- This contains the 15-file provisional Save source/tests/helpers overlay plus
  the accepted pure `computeAccountReviewFrozenIntentDigest` strict review
  wire. **Do not replace it with an earlier a34/df92 source tree.**
- Root's prior pre-digest Save batch: 95 cases passing at that earlier contract.
  The pinned `account-review-save-plan.ts` still constructs its payload
  without the now-required `frozenIntentDigest`. Any fresh-commit failure
  at that missing required field is **expected T048 integration Red**; it does
  not prove the individual replay invariant passed or failed.
- Existing 55 Save service + 40 protected Save assertions and their fixtures,
  helpers and service are unchanged in this lease.

## Actual protected APIs and seam inventory

The new `account-review-save-intent.sqlite.integration.test.ts` uses the
same real `@nozbe/watermelondb/adapters/sqlite` dispatcher, the actual
`packages/db/src/schema`, the real
`account-review-save-ledger-models.ts:LEDGER_MODEL_CLASSES`, and the
scoped `@monyvi/db` singleton test mount as the established T043 SQLite suite.
The mount is a genuine `Database` with `SQLiteAdapter`, not a fake writer.
Only the existing `supabase.getCurrentUserId` authentication leaf is
controlled, consistent with the T043 test harness.

The test calls `createAccountReviewSaveService` with the real
`hashProvider.digestUtf8`, selected owner, and a typed, controllable
`loadCurrentSession` that fails when explicitly cleared. Stored receipts
are **real** `FinancialActionGroup` records queried from the SQLite DB,
parsed with `parseFinancialActionEnvelopeJson(root.payloadJson,
createAccountReviewFinancialRegistry())` and validated with
`validateReviewBatchSavePayload`. The independent reference digest is
`computeAccountReviewFrozenIntentDigest` over the complete canonical
original session/intent plus the **stored** creation snapshot. No raw
receipt string, synthetic root, fake success handler or loose cast is used.

Physical mutation assertions use
`physicalSaveLedgerSnapshot(await reopenSqliteLedger(ledger))`, existing
`ledgerState`, and all eleven real table model cached raw/prepared preimages.
Fresh SQLite clones are persisted DB/cache rehydration, **not proof of an OS
process termination** or full app splash/session lifecycle.

## New original-intent integration cases

- **I01:** a successful SMS Bank Save writes one lowercase-64-hex immutable
  digest, validates against the original complete request and root hash, and
  omits raw SMS/transcripts/reducer/source-evidence fields.
- **I01b:** distinct raw Voice transcript is not saved; legitimate selected
  Voice note is still permitted in financial mutation fields.
- **I02:** true external saved-fingerprint A with selected A+B posts **B**
  only, but root digest binds both original A+B and has no captured creation
  snapshot because no new account is actually created.
- **I03:** changed *omitted* A amount, compatible Expense category, local
  calendar date, or eligible owned account, with identical action/selected
  rowId/revision, must reject and preserve all raw SQLite and cached preimages.
  An independent genuine owned same-type category is seeded for the category
  negative case; no category mismatch is used to force a false green.
- **I04:** changed original QNB evidenceKey with same original groupId,
  revision, account physical IDs and action ID is rejected.
- **I05:** one selected Wallet group wholly deduplicated after original
  confirmation while another selected QNB Bank group posts. The original
  intent includes both confirmed groups/all three selected rows/all account
  and child localRefs/UUIDs, but the posted payload contains only the Bank
  group. The complete original digest must bind the dedup-only Wallet, which
  remains absent from actual creates, correctly preserving post-dedup default
  snapshot semantics. Identical original-intent replay through a fresh SQLite
  clone must succeed with no new physical table writes.
- **I06:** changed original omitted Wallet group evidenceKey, unused Wallet
  sender ID or unused Wallet account UUID (same aliases and source) must
  reject with unchanged physical SQLite/cache. These negatives deliberately
  leave the actually posted QNB records intact.
- **I07:** remove only original externally deduped selected A while keeping
  B's real planned record ID unchanged; identical action/root/posting subset
  must nevertheless reject. It does **not** conflate request binding with an
  intentionally mismatched posted record ID.
- **I08:** after first commit of A-dedup/B-posted, legitimately edit then
  soft-delete A's independently saved transaction, clear the session-loader
  dependency, create a fresh SQLite/cache clone, and replay identical original
  frozen input. Requires exactly one replay, zero new ledger writes/effects
  and **zero live session-loader calls**.
- **I09:** after Bank creation with A independently deduped, change the
  current previously-default Bank's balance, financial revision and default;
  make the new Bank default. Replaying the same frozen input from a fresh
  instance must use the stored **original** snapshot and make no changes.
- **I10:** foreign-owned and owned-but-deleted fingerprint B are NOT independent
  active owned proof for dedup. First write must create the selected financial
  B action rather than silently omit it.
- **I11:** a schema-valid input collision which changes selected B to the
  same fingerprint as A must reject against the real physically seeded v2
  drafts with no action, balance, queue or cached mutation.

## Why one adjacent fixture helper is necessary

`account-review-save-intent-test-fixtures.ts` combines the existing genuine
`sms-new-bank` and `sms-new-wallet` canonical fixtures, repairing the
third row's rowId/sourceRef/fingerprint, reciprocal linked group and original
real planned identity derivation through `freezeSaveIntent`. The established
T043 fixture catalog has no case where a **whole separately selected and
confirmed group** is later deduped while another confirmed group still posts.
No new fake entity IDs, model registry, writer or publication snapshot are
introduced.

## Integration requirements (Root-owned; NOT implemented here)

1. T048 initial Save must use the accepted pure authoritative digest helper
   over the complete original selected frozen request and **actual captured
   creationDefaultSnapshot** (iff actual created accounts after dedup); include
   the digest in the closed review payload before the immutable root commit.
   Complete original group/plan IDs cannot be reduced to actual creates.
2. Replay must recompute and compare the original digest against the already
   persisted immutable root, using its original captured snapshot, without
   rereading the session or mutable old saved fingerprint/amount/active flag.
   Keep actual posted financial/account/child/owner integrity checks.
3. First write still requires a real independently owned active previously
   saved fingerprint, with account/category/identity/selection/plan guards.
   All-dedup-only local cleanup remains action-free.
4. Root independently runs this new suite **alongside the existing 55+40
   protected cases** and T046 pure/typed/lint/format/SQL/Edge parity gates
   after a separate production source grant. No claims about outcomes now.

**Validation ledger:** Jest **NOT RUN**, TypeScript **NOT RUN**, lint/
formatter **NOT RUN**, SQLite **NOT RUN**, native/device **NOT RUN**.
No production/source/schema/Edge/SQL/sync/UI/locale changes; no branch/ref
movement, push, PR/issue action, native bridge, external provider, delegation
or Codex handoff.
