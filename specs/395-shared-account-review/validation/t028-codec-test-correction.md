# #395 T028 — codec proof and legacy migration tests-only correction

**Status:** Authored regression tests, NOT EXECUTED / NOT ACCEPTED. Root
separately owns coherent Red and any later production grant. No codec,
repository, schema, reducer, T029, public exports, SQL or financial writer
edits.

## Immutable evidence

- GitData parent: `ce9283f76802d48fe04371b8da8f11100be0b81a`.
- Authorized corrected codec test baseline:
  `2f575984f5bf6ad2318a3c6fcd09fb50400d2b51`.
- Candidate T028 codec reviewed read-only:
  `d8f0a992b67201f6dc325688c65e046a2fe5427f` from
  `87338816b9040ca126dd6bd61ae3385c5d051c64`.
- Canonical reference: `accountReviewSessionSchema` and `validateActiveGroupRow`
  / `validateActiveGroupMembership` in
  `packages/logic/src/account-review/review-schemas.ts` at approved Main; #395
  `contracts/wire-shapes.md` row/group clauses 185–196 and
  `contracts/parser-evidence.md`.
- Independent Financial peer and Root identified two valid source issues. Root's
  targeted Node reproduction observed that the current candidate codec ACCEPTS
  an active group listing a row whose assignment is unresolved, whereas the
  canonical full-session schema rejects it. These are PRE-TEST findings, not new
  Green.

## Appended cases; all 19 existing V2 and 10 separate V1 cases preserved

1. Three parameterized negatives: an active group listing the current row must
   reject when the row assignment is unresolved, when it is an existing account
   assignment, or when it is unresolved with unconfirmed currency. Each checks
   both the strict V2 schema and the actual dual decoder. The group remains
   otherwise legitimate, including owner/queue, groupId, linked row ID,
   revisions and canonical financial data.
2. Reject a second active group claiming that same row, despite the original
   active group retaining a correct reciprocal suggested assignment. New group
   identity and evidence key are distinct; no fabricated DTO.
3. A _positive_ removed/tombstone control: a removed group may retain its
   evidence tombstone even after it detaches the final live row. Re-encoding and
   decode must preserve removed status and tombstone. The fix must not require
   removed groups to behave as active groups.
4. V1 migration regression: original accountId, pendingAccount, category,
   categoryConfirmed, Date, fingerprint and authoritative selectionOverride must
   survive. A deterministic `legacy-local:<rowId>` sourceRef, `legacy_unknown`
   currency and unresolved assignment remain; original evidence is
   **uncertain**, never `absent` (V1 supplied no authenticated absence proof),
   and has no invented source spans or candidate account IDs.

**Expected inventory:** 25 codec Jest cases (19 previous + six appended); the
separately protected 10 V1 codec cases and 18 T025 SQLite command tests are not
edited. All prior test bodies/assertions remain byte-identical.

The per-row V2 codec must enforce only **its own** live-group reciprocity and
nonduplicated active membership. A row's stored `groups` includes the groups
referenced by that row plus relevant removal tombstones, with complete
linkedRowIds. The codec must NOT demand that every row contain identical group
arrays, rehydrate the full session, or validate sibling persisted rows; T029's
serialized owned writer must reconcile global headers, all linked-row group
snapshots and tombstone consistency. No caller-provided field may be elevated
into owned DB authority here.

**NOT RUN:** Jest, Node reproduction, TypeScript, lint, formatter, SQLite,
provider, native or emulator. This is source-authored test evidence only; no
behavioral failure or Green is claimed by this worker.

**STOP — tests-only ownership released; T028 production remains HELD.**
