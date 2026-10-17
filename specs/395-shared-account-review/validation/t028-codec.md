# #395 T028 — SMS review V2 codec production checkpoint

**Status: PRODUCTION AUTHORED, NOT EXECUTED / NOT ACCEPTED.** Root owns
verification, non-author peer review and eventual integration. Exactly one
existing logic codec is updated; this validation note is NEW. No original V1
tests, T025 tests/fixtures, mobile writer, schema, reducer, public index, SQL,
sync, provider, financial action, branch or ref was edited.

## Immutable scope and owned baselines

- Governed main: de09f76bdadb570c99a1015bbf1c680279b0d5ad.
- Source parent: b5b5c893e680cde04909ed202392910c24d46ef7, current Root-approved
  84-overlay Main baseline. Older 005d574d850a30d0c47beed8d4d2bbab074b41a7 was
  consulted for canonical contracts/types only, NEVER used as a merge parent.
- Original V1 codec blob: 15eae8917aca611dcf0710264e9643fd9355ece9
  (packages/logic/src/sms-review-drafts/sms-review-draft-codec.ts). Its exported
  V1 writer, reader, version and schema remain intact.
- Frozen V1 tests: 605d4bdaab63599101117b140260fcf5ad304cfd.
- Frozen T025 V2 codec test suite: 62a5790209aeae897b247a7eea2f5110246aa9a2 (19
  intended cases).
- Frozen T025 canonical fixture: b42fc0e765b7af3c13e20d3efa94ae83589043eb.
- Approved wire/commands/data model: contracts/wire-shapes.md,
  contracts/review-commands.md, data-model.md at unchanged #395 authority.
- Root's creation Red before source: FOUR missing T028 codec exports, not 19
  behavioral assertion failures.

## Four additive canonical APIs

The existing V1 codec file now exports the four requested new runtime surfaces:
smsReviewDraftPayloadV2Schema, encodeSmsReviewDraftV2,
decodeSmsReviewDraftPayload, and migrateSmsReviewDraftV1ToV2. The barrel already
wildcard-exports the file. V2 uses the existing strict V1 SMS transaction schema
alongside imported canonical review row/group, owner/session,
currency/revision/hash and UTC date validators. No copied currency,
transaction-type, account-type, reason or identity enum was added.

- Strict JSON root has exactly version, transaction, review. The nested review
  has exactly nine required keys: ownerId, sessionId, sourceRevision,
  preferredCurrency, reviewRevision, operationGeneration, row, groups,
  removedEvidenceKeys. Outer/inner versions must agree.
- Wire Date fields are checked/restored to real Date for both the stored
  original and the canonical row transaction; the V1 date reader's compatibility
  remains unchanged. Root's version-2 financial values, source, fingerprint,
  amountDecimal and nested original must agree. The ordinary canonical review
  schemas enforce proof/currency/ATM constraints; the codec does not infer an
  account or promote evidence.
- The persisted groups are canonical snapshots of only this row's live
  membership or removal tombstones. No unrelated active group may enter one
  row's JSON; linked group revision/status/currency must match its canonical
  suggested assignment. Removed groups need a durable evidence tombstone, and
  persisted Undo/diagnostic fields fail strict parsing. Group-linked rows in
  other stored records are validated later by T029's serialized multi-row
  writer, not guessed here.
- The V2 reader rejects mismatched embedded owner/session/fingerprint, malformed
  versions and contradictory source/row finance. It uses the persisted outer
  selection_override when set; otherwise it retains the canonical review
  snapshot's selected value. V1 read delegates to the identical original
  decodeSmsReviewDraft and returns review:null. V1 contains no embedded
  owner/session; authenticating its outer DB row is necessarily T029's
  responsibility. Codec output is evidence of validated bytes, NEVER an
  assertion of current account ownership.

## Approved legacy migration decision

The pure V1 migration has no authentic historical SMS message ID, source
evidence, external account snapshot, account revision or confirmation lease. The
owner approved deriving the deterministic private sourceRef
legacy-local:<rowId>, based only on the authenticated writer-provided persisted
row UUID. This is explicitly legacy-local provenance, never a fabricated message
ID, model span, card match or original evidence.

Original SMS financial transaction, fingerprint, existing legacy accountId,
pending account metadata, category confirmation and Date are retained through
the unchanged V1 decoder. The provided selectionOverride is reflected in the
canonical row selected state. The review row uses legacy_unknown unconfirmed
currency, unresolved assignment with a hard currency reason, no candidate
account IDs, no invented original evidence, and no auto-confirmed group, even
when pendingAccount exists. Its user-choice financial metadata remains in the
original transaction pending T029's actual owned-account/currency eligibility
check. Volatile Undo never persists.

The V1 stored transaction schema historically permitted noncanonical nonempty
account/category identifiers that the newer canonical review row forbids. For
such incompatible bytes, pure migration must fail closed without rewriting or
deleting the V1 payload; the authorized T029 scoped recovery flow must handle
them explicitly. This codec does not coerce identifiers, assume a currently
owned account, or discard unreadable original JSON. Migrating touched groups and
persisting their consistent review snapshots remains a T029-only single-writer
operation.

## Root-owned verification and boundary

Root should verify the old V1 function bodies and 10 protected test cases,
execute the coherent 19 V2 codec cases, strict logic/mobile TS, lint, and
relevant error/recovery checks. The 18 T025 SQLite command cases still require
the separate unimplemented T029 writer and MUST NOT be described as covered by
this codec.

No Jest, TS compiler, lint, formatter, SQLite, network, provider, native,
emulator, or other execution check was run in this authoring chat; source
inspection/blob readback is not runtime Green. Independent NONauthor peer
acceptance remains pending.

**STOP — T028 production ownership released after immutable GitData
checkpoint.**
