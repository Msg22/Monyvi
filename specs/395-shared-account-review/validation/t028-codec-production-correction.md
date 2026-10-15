# #395 T028 — reciprocal active-group / legacy-evidence production correction

**Status: AUTHORING ONLY — NOT EXECUTED, NOT ACCEPTED.** Root owns the next
coherent test/type/lint batch and independent non-author source review. No
T028/T025 tests, T029 writer, schema, index, database, UI, provider,
business/financial policy, Git refs or PRs were changed.

## Immutable checkpoint

- Production GitData parent: `87338816b9040ca126dd6bd61ae3385c5d051c64`.
- Exact owned source baseline:
  `packages/logic/src/sms-review-drafts/sms-review-draft-codec.ts` at blob
  `d8f0a992b67201f6dc325688c65e046a2fe5427f`. The prior V1 encoder/decoder
  bodies are byte-identical in this correction.
- Frozen regression tests: `7d7b42f578a5d7d2d3be5e935e073809e3fc43b6` test blob
  `4fcb61e5cf3a0fc83f341d6d92a88e646866642a`, unchanged.
- Root's actual pre-fix regression batch: **35 codec cases, 30 PASS / 5 FAIL**.
  Four active-group consistency negatives fail because
  `smsReviewDraftPayloadV2Schema.safeParse` accepts their invalid local
  membership; one V1 migration case fails because account evidence is `absent`
  instead of `uncertain`. The new removed-tombstone positive passes. These
  results PRECEDE this correction; no post-correction Green is claimed.

## Narrow correction 1 — local reciprocal active-group membership

The codec retains one row and its referenced group/tombstone snapshots, with
complete linkedRowIds; it must not pretend to restore all rows belonging to that
group. A new small private, canonical-type helper checks the only stored row
against each nonremoved group.

- Every **active** group stored beside the row must list its rowId AND the row's
  assignment must be **suggested**, naming precisely that groupId and the same
  revision and confirmation/status.
- The row must have **known** review currency equal to the active group's
  currency.
- More than one active group in a single row's snapshot fails closed. The
  original duplicate-groupId check remains.
- Removed groups remain inert, with the existing evidence-key tombstone
  consistency check. A detached final row does not invalidate a removed
  tombstone.
- The already existing suggested-assignment-to-group validation is retained
  verbatim for the opposite direction.

Cross-stored-row consistency, complete linked-row rehydration,
owner/current-queue validation, revision CAS and atomic group updates belong to
T029's scoped writer, not to one row's pure codec. This correction adds no extra
persisted keys, public API, inferred provider choice or group confirmation.

## Narrow correction 2 — V1 account provenance

The legacy-local migration constructs accountEvidence with `state: "uncertain"`
rather than `"absent"`. V1 never carried authenticated proof that an account was
absent. All identity fields remain null, candidate IDs and spans remain empty,
and the existing deterministic `legacy-local:<rowId>` sourceRef survives. The
original V1 transaction, accountId, pendingAccount, fingerprint, category, Date,
selection override and currency provenance are otherwise unchanged. Review
currency remains `legacy_unknown`; review assignment stays unresolved pending a
real owned T029 validation.

## Verification and exclusions

The only modified production source is the existing codec. The V1 functions,
canonical review schemas, public interfaces, versioned V2 root/review keys and
all tests are untouched. A new private helper is below 50 lines; the entire
codec stays under 900 lines.

**NOT RUN:** Jest, TypeScript, ESLint, formatter, SQLite, native, emulator,
provider, hosted service or runtime checks by this author. Root must verify
exact file blobs and the 35 codec cases (plus protected V1 cases), then
commission non-author review before acceptance.

**STOP — this T028 production correction lease is released after the
unreferenced GitData artifact.**
