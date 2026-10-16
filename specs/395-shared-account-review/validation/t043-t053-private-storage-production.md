# #395 T043/T053 — private device-local carrier production source

**State:** SOURCE RELEASED as an unreferenced GitData child of
`042456bbd89d96bef2a6fafe989884cf8cccde1d`. No refs, CI, database,
generator, formatter, TypeScript or Jest executions were performed by this
worker. Tests are frozen; their published Reds remain the only observed results.

## Implemented, exclusively owned

| Path | Before blob | Production blob |
| --- | --- | --- |
| `packages/logic/src/financial-actions/review-local-recovery.ts` | NEW | `66805109944eee6cac777b8ea47d6f13dff18921` |
| `packages/db/src/local-schema/account-review-local-recovery-schema.ts` | NEW | `20e7ea4d26d9634dd4c79b5824631153f56d0eb2` |
| `packages/db/src/models/FinancialActionGroup.ts` | `f02c984affa5b5763126995e20327b36ce4fde1d` | `c3c429c8e9bf90645510a166dbdb45e9ed374726` |
| `packages/db/src/migrations.ts` | `359b3873a232e2582ed62b84d5eebaf13808578b` | `0ea00299c855ece1538f6be2c07cebe2904cb44e` |
| `scripts/transform-schema.js` | `81867606dd91cfe6f7cc90f557b0f42c70655ef9` | `53ab33499d4f8ca4fc938388f110a70954c9dc33` |
| `package.json` | `d52d622d2054a9c9db140e7a034321504d6a07ff` | `b6d41386225b50de1597173462d00771742e0334` |
| This validation report | NEW | GitData commit tree |

- **Strict private API:** `accountReviewLocalSaveSnapshotSchema`;
  `AccountReviewLocalSaveSnapshot = z.infer<typeof ...>`; and
  `parseAccountReviewLocalSaveSnapshot({json, expectedRoot})`.
  Exactly nine top-level keys; all nested objects are closed. The
  `smsDrafts` discriminator has full available preimage versus
  metadata-only expired/superseded variants. The parser checks owned
  action/owner/session equality and Voice/SMS queue boundary, plus queue
  owner, draft queue, distinct draft IDs/fingerprints, distinct created
  domain IDs and default account IDs, and ordered distinct non-self
  predecessor actions.
- **Canonical source reuse:** public `uuidSchema`, `timestampSchema`,
  `revisionSchema`, bookkeeping operation schema and the
  `ReviewMutation` discriminants determine the private schema's field
  vocabulary. Public review tuple, payload hash and frozen intent
  digest are untouched. Snapshot schema cannot establish physical
  postimages, created children, queue lifecycle, immutable effect
  membership, or safe compensation.
- **Watermelon-only carrier:** nullable
  `financial_action_groups.local_recovery_snapshot_json` from local
  migration31 and non-generated `FinancialActionGroup.localRecoverySnapshotJson`.
  Existing roots default to NULL. No new Supabase column, function,
  migration, public type, base-model decorator, network field or
  local SQL deployment is included.
- **Reproducible generator source:** the CommonJS generator registers
  the installed `tsx/cjs` loader to consume the TypeScript
  `packages/db/src/local-schema/account-review-local-recovery-schema.ts`
  override under Node22. It appends the sole optional private column
  only when emitting the financial root Watermelon table, explicitly
  refusing collisions with parsed public columns; `generateBaseModel`
  still consumes solely the original Supabase table columns.
- **CI inclusion:** existing `test:scripts` now includes the new
  `account-review-local-recovery-schema.test.ts` Node/tsx suite,
  alongside the existing transform-schema suite. No hosted/remote
  command was added or invoked.

## Required Root-owned work and acceptance

1. Root regenerates `packages/db/src/schema.ts` using the actual
   approved local generator **after** accepting this source; at the
   frozen parent schema is still version30 and lacks the private
   field. No generated schema, `models/base/*`, `types.ts` or
   `supabase-types.ts` was hand-edited by this worker.
2. Run the focused scripts Node suite, private logic Jest tests, four
   Metals regression tests, strict logic/mobile TypeScript, formatter/
   lint checks and repeat generation parity under the Root's checks
   lease. This worker claims **no Green**; all these remain NOT RUN.
3. Physical fresh-install/upgrade/restart and owned SQLite
   pull/upsert preservation, privacy filtering from every remote
   request/outbox/log and active financial-root batch capture remain
   separately scoped T048/T050/T051/T053 source and checks. A strict
   parser is not sufficient to authorize financial reconciliation.
4. The existing `packages/db/src/migrations.ts` parent was already
   909 lines. Adding required local migration31 makes it 924 lines
   before formatting. Reducing unrelated, historical migrations to
   meet the sub-900-file guideline would violate the exclusive,
   non-destructive path scope; no legacy or Metals migration was
   compacted or removed.

**NOT RUN:** Jest, Node test, TypeScript, eslint, formatter, generator,
local SQLite/migrations, SQL, sync, CI, cloud/hosted deployment,
provider, emulator, native worker, Git ref/push or PR mutation.
