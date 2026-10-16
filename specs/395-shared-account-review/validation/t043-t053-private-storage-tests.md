# #395 T043/T053 — Private Recovery Storage Tests-First

**Date:** 2026-10-16  
**Source parent:** `76cd946b070e3ebbfa5af539b0dc21ed291e41f2`  
**Scope:** NEW generator/schema Jest-independent Node test; NEW private-schema
Jest test; one bounded Metals-test version correction; this validation report.
**No production, generated, local migration, SQL or public type edits.**

## Frozen authoritative dependency

The reconciled `contracts/local-recovery.md` at the pinned parent specifies a
strict nine-key **device-only**, unshipped `account-review-local-save/v1`
snapshot for review Save's already-approved FR-018/FR-019/FR-021 obligations.
The separately reviewed Constitution VII 1.8.0 device-only exception applies.
No new customer-facing decision, Supabase column, public financial payload,
recovery UI, Voice session persistence or remote deployment is authorized.

Source-backed baseline at this parent:

- `packages/db/src/schema.ts` is version **30**, and highest
  `packages/db/src/migrations.ts` step is **30**.
- Generated `BaseFinancialActionGroup` and custom
  `FinancialActionGroup` do not have
  `localRecoverySnapshotJson`.
- `scripts/transform-schema.js` exports actual
  `parseSupabaseTypes`, `generateSchema`, `generateBaseModel`,
  `formatContent` and `writeIfChanged` functions. It currently derives
  the financial root columns from public Supabase types, with no durable
  local-column override for an existing **syncable** root table.
- `scripts/sql-to-watermelon-migration.js` derives Watermelon changes
  from Supabase SQL. Private migration31 requires a separate owned local
  generation route; **never** add a dummy SQL field or manually patch
  generated schema/base/public Supabase types.
- `packages/logic/src/financial-actions/review-local-recovery.ts`
  does **not yet exist**. This is expected first-phase **creation Red**,
  not observed failure of the behavioral schema cases.

## Frozen proposed private API — implementation remains separately owned

```ts
// packages/logic/src/financial-actions/review-local-recovery.ts
export const accountReviewLocalSaveSnapshotSchema: /* strict Zod object */;
export type AccountReviewLocalSaveSnapshot =
  z.infer<typeof accountReviewLocalSaveSnapshotSchema>;

export function parseAccountReviewLocalSaveSnapshot(input: {
  readonly json: string;
  readonly expectedRoot: {
    readonly actionId: string;
    readonly ownerId: string;
    readonly sessionId: string;
    readonly source: "VOICE" | "SMS";
  };
}): AccountReviewLocalSaveSnapshot;
```

The pure caller must derive `expectedRoot` from authenticated, validated
financial root/closed public action data. The `FinancialActionGroup` table
does **not** persist `sessionId` as a separate column. The parser checks
snapshot action/owner/session binding and source-specific Voice/SMS invariants
but does not replace physical-effect/account/queue verification. Implement
ONE authoritative strict tagged union and derive the exported type with Zod.
Do not copy this union into tests, regenerate provider DTOs, or invent
public recovery authorization/proof fields.

### Exact nine-key schema shape

Top level: `version,actionId,ownerId,sessionId,smsDrafts,
createdEntityRefs,defaultPreimages,defaultDependencyActionIds,
queuePreimage` — **all required, no tenth key**.

- Voice: `queuePreimage:null`, `smsDrafts:[]`; no transcript, audio,
  original Voice session, raw provider request or hidden additional field.
- SMS queue: actual owned header
  `id,userId,createdAt,updatedAt,expectedPostimageHash,disposition`
  with `present | pruned_empty | expired | superseded`.
- Available SMS entries: `retentionState:"available"` plus actual
  id/queueId/fingerprint/createdAt/updatedAt/parsedAt/`payloadVersion`/
  `position`/selectionOverride/payloadJson/expectedPostimageHash/
  `operation`. Expired/superseded: exact **metadata only**,
  `retentionState,id,queueId,smsFingerprint,parsedAt,operation,
  expectedPostimageHash`. No raw payload or previously captured selection
  after redaction.
- `payloadVersion` and `position` are canonical unsigned decimal
  **strings**, not numbers/leading-zero/exponential or signed notation.
- `createdEntityRefs[].entity` is derived from
  `reviewMutationSchema`'s canonical five entity kinds: account,
  account_sms_sender, bank_details, transaction, transfer. Not an invented
  account_financial_effect type. Duplicate created IDs or malformed
  `expectedPostimageHash` fail.
- `defaultDependencyActionIds` contains distinct ASCII-sorted canonical
  predecessor IDs; reject self, duplicate and reverse order. Empty is
  structurally valid when independent, with **physical dependency truth**
  validated by T050, not fabricated by the pure schema.
- `frozenIntentDigest` and `payloadHash` remain distinct **public**
  immutable commitments; private JSON is not added to the closed public
  `review.batch-save/v1` schema.

## Authored coverage

### NEW scripts/__tests__/account-review-local-recovery-schema.test.ts

Eleven **independently executable `node:test` cases**, importing the actual
CommonJS generator exports:

1. Current generated `financial_action_groups` has exactly one
   nullable string `local_recovery_snapshot_json` column (direct
   behavioral Red while absent).
2. The entire tracked and generated schema has exactly one occurrence
   of this private field, attached only to the financial root table.
3. Exactly one `packages/db/src/local-schema/*.ts` module declares the
   private field, and the real `transform-schema.js` consumes that
   module; never substitute a nonexistent scripts/local-schema path.
4. `parseSupabaseTypes(real generated public types)` plus
   `generateSchema(real parsed tables)` retains the private field
   with no dummy Supabase column (direct generator Red while absent).
5. Generated and checked-in financial roots preserve all pre-existing
   server-owned columns alongside exactly one private extension.
6. Non-generated `FinancialActionGroup` owns the decorator;
   generated Base remains cloud-only with existing hash/action fields.
7. Public Supabase types and `generateBaseModel` remain free of the
   private field and retain public root metadata.
8. Watermelon `toVersion:31` adds only the nullable private root column
   after preserved migration30, with no unrelated Metals coupling.
9. Tracked schema version agrees with the highest local migration;
   31 is present and subsequent 32+ versions cannot be skipped.
10. Two actual generator runs produce identical formatted root bytes
    matching checked-in schema output.
11. Actual `writeIfChanged` produces stable bytes on first/second
    invocation in a disposable OS temporary directory only; no
    generated outputs are written back to the repository.

The generator suite does not import the missing private Zod SUT and
therefore can execute and expose source-backed **behavioral Red** separately.

### NEW packages/logic/src/financial-actions/__tests__/review-local-recovery.test.ts

19 Jest test declarations, including parameterized cases, define the
strict schema and owned-root parser behavior:

- Nine and only nine keys; valid SMS/V1/V2-independent local evidence and
  Voice-null/empty allowed; strict version and nested closure.
- Root action/owner/session/source mismatch, forged queue owner, draft
  queue mismatch and duplicate fingerprint reject before reconciliation.
- All four queue disposition literals and available/expired/superseded
  per-entry variants; metadata-only redacted entries cannot carry SMS
  payload/selection or old timestamps. Per-entry 30-day equality and
  actual proof of expiry require **T049** writer/retention tests, not
  simply a parser flag.
- Exact canonical unsigned string grammar for
  `payloadVersion`/`position`, rejection of bogus operation, extra keys
  or invalid selection type.
- Canonical `ReviewMutation` vocabulary, duplicate created identities,
  invalid expected hashes, duplicate/default predecessor ordering and
  malformed serialized JSON.
- Public `reviewBatchSaveWireSchema` rejects private field and
  retains the existing opaque `frozenIntentDigest`.

Immediate module-creation **Red has ZERO executed schema assertions**.
Only after production module creation and imports resolve may Root classify
individual rejection and acceptance results as behavioral Red/Green.
The schemas do not pretend to prove actual SQLite roots, prepared
postimages, true predecessor existence, queue pruning or pull remapping.

### BOUNDED existing scripts/__tests__/metal-historical-rate-local-schema.test.ts

Preserved all **four** #355 cache invariants/tests, including the
historical owner/date uniqueness and nullable rate proof, correct
Watermelon local schema overlay, and absence from public Supabase types.
Changed only the speculative implication that any version31 must create
`metal_metadata_edit_outcomes`. The test now checks current schema
version, migration30 and every consecutive 31..latest migration;
version31 may belong to the *independently owned* #395 private carrier.
No skip of future version32 or extra Metals DDL is authorized.

## Test execution / CI integration instructions for Root

**Proposed commands — NOT EXECUTED by this worker:**

```bash
npx tsx --test scripts/__tests__/account-review-local-recovery-schema.test.ts
npm test -w @monyvi/logic -- --runInBand review-local-recovery
# Run existing four-case Metals Jest suite with the resolved scripts test project
```

The present root `test:scripts` command runs the existing transform-schema
Node/tsx suite but does **not** automatically discover this new file.
After Root validates the new tests and implements the needed generator
seam, a separately owned `package.json` or CI target adjustment is required
to execute this test explicitly. Do NOT use a script that invokes
`db:migrate`, because it calls remote `db:push` first. T053's actual
owned SQLite upgrade/pull preservation and T043 atomic cache/rollback
remain downstream separately authorized tests.

**NOT RUN:** Jest, node:test/tsx, TypeScript, lint, formatter, SQL, local
generator, migration, SQLite, hosted Supabase, emulator, native,
provider, package/CI mutation, Git refs or deployment.

**STOP:** These are test/document artifacts only, not production source
acceptance or a claim of passing private storage/recovery.
