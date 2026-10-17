# T069 — Add compensation completion: bound technical contract (documentation only)

**Authority:** Root-approved bounded technical direction under the existing #395
implementation/business decisions; NOT a new product decision. **Source
context:** immutable Main `bd2457d7d3d24aed8f595c0c355cd7658bca8ff8` (parent
`44c9654c1c3424e8ac3d492e7ae6da480544bfd8`). **Status:** DOC AUTHOR ONLY; NOT
RUN; no implementation/source grant. **Primary contracts:**
[local-recovery.md](../contracts/local-recovery.md),
[account-default-intent.md](../contracts/account-default-intent.md). The current
Main owned root pull already recognizes Add and keeps its local private bytes.
Do not revert that work or the separate current Review receipt/identity repairs.

## Reproducible defect and constrained resolution

Actual candidate `apps/mobile/services/sync/account-action-protection.ts`
`proveLocallyCompensatedAdd` validates a `reconciled` rejected Add B by
requiring original prior A's **current** `isDefault===true`. Actual
`account-default-intent-local-recovery-commit.ts` `stagePriorDefaultRestore`
does restore A true in the dedicated writer, but `stageTerminalRoot` currently
retains the same unmarked 12-key JSON. After genuine compensation, an ordinary
`updateAccountWithinWriter` metadata-only Edit choosing an existing owned D
legitimately clears A. It uses multiple awaited `Model.update` calls inside
`database.write`; it does NOT produce a single atomic prepared batch or
later-Edit receipt. A's later false default is not proof that historical
restoration never completed, yet the sync catalog refuses EVERY subsequent pass.
Retained F3 deliberately corrupt terminal Add (B tombstones, A NEVER restored)
must continue to fail. `_changed`, `_status`, timestamps, remote status, an SDK
ACK, or an after-the-fact A state are not completion authority.

**Solution:** persist a new strictly versioned **terminal carrier**, using ONLY
existing `FinancialActionGroup.localRecoverySnapshotJson`, in the SAME
adapter-atomic B compensation batch as its owned tombstones, any opening-effect
deactivation, A's true restoration, and root `reconciled` transition. Its
authenticated completed mode can outlive A's legitimate independent default
Edit; unmarked legacy terminal roots cannot be upgraded.

## Exact private wire-in-storage, versions and byte bounds

Until true completed compensation, the value is the original canonical
`account-create-default-local-save/v1` snapshot with exactly the existing 12
top-level keys; do not extend or amend this strict schema, capture format,
parser signature, dependencyRoots, hashes, original envelope, guards or full
creator provenance.

After the successful compensation writer ONLY, it is the canonical
`account-create-default-compensated-carrier/v1` object with EXACTLY **three**
top-level keys (shown here with placeholders, not proposed production code):

```json
{
  "version": "account-create-default-compensated-carrier/v1",
  "originalSnapshotJson": "<EXACT ORIGINAL 12-KEY CANONICAL JSON TEXT>",
  "completion": {
    "version": "account-create-default-compensation/v1",
    "ownerId": "<UUID>",
    "physicalRootId": "<UUID>",
    "actionId": "<UUID>",
    "domainReferenceId": "<UUID>",
    "payloadHash": "<lowercase 64-hex SHA256>",
    "originalSnapshotSha256": "<lowercase 64-hex SHA256>",
    "rejectionReceiptSha256": "<lowercase 64-hex SHA256>",
    "priorDefaultAccountId": "<UUID or null>",
    "restoredPriorDefaultPostimageHash": "<lowercase 64-hex SHA256 or null>",
    "completionSha256": "<lowercase 64-hex SHA256>"
  }
}
```

The **completion** object contains EXACTLY 11 keys. `originalSnapshotJson`
stores the exact original JSON text _as a JSON string_, not as an object: JSON
escaping in the outer carrier MUST reverse exactly on decode and yield the
original stored UTF-8 byte sequence; do not parse then regenerate those bytes.
Its decoded content must still pass the unchanged
`parseAccountCreateDefaultLocalRecoverySnapshotJson` binding and original
canonical-byte comparison. The `dependencyRoots` array remains the complete
ASCII-sorted unique (actionId,payloadHash) set of _all_ relevant original
registered owned account CREATE roots, accepted/idempotent or unresolved at
preparation. `dependencyActionIds` is a distinct unresolved-only transport
ordering set. Never infer missing creator memberships from new acceptances.

Bounded admission in UTF-8 **bytes**, before allocating/hashing parsed
authority:

| Component                                                     |       Maximum | Admission                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original canonical plain 12-key JSON (`originalSnapshotJson`) |  65,536 bytes | Existing strict action/evidence parser plus original binding                                                                                                                                                                                      |
| Public canonical root `payloadJson`                           |  65,536 bytes | Existing registered canonical action parser                                                                                                                                                                                                       |
| Canonical root `outcomeJson`                                  |  65,536 bytes | Existing canonical evidence parser and complete SQL091 business outcome                                                                                                                                                                           |
| Completed outer private carrier JSON                          | 196,608 bytes | **Narrow private-only decoder**: pre-parse raw UTF-8 byte ceiling, existing duplicate-key scanner reused through a scoped adapter **OR** strict canonical raw-text round-trip comparison, with schema/field/hash checks; no public limit increase |

These ceilings are fixed; no generic parser/default size increase. A raw
65,536-byte original containing many quotes/backslashes expands when
JSON-string-escaped, hence the outer 192 KiB cap while each inner original
remains at the existing 64 KiB cap. Check duplicate JSON keys at every nesting
depth and both levels, exact closed keys/nullable semantics, canonical
ordering/text, typed UUIDs, lowercase 64-hex SHA-256 and versions. Use existing
canonical serializer and SHA-256 provider; do not add a dependency, network
call, schema field or generic evidence parser bypass. The existing 64 KiB
`parseFinancialActionEvidenceJson` MUST NOT be called on the potentially larger
outer wrapper without a narrow **private-only** adapter. Source may reuse the
existing duplicate-key scanner through a bounded adapter **or** reject any raw
outer input whose exact canonical serialization differs from the original after
bounded parsing (duplicates collapse on parse and cannot survive such an exact
round-trip). The outer schema must also be closed/strict, with UTF-8 size
checked BEFORE parsing; there is no custom bespoke JSON scanner, new runtime
dependency, or increase to any global/public canonical JSON byte ceiling.

## Digest formulas (normative)

All digests are SHA-256 of UTF-8 input. `Canonical(X)` below is the existing
`serializeCanonicalJsonValue(X)` with strict supported primitives and
ASCII-key-sorted object members. `sha256Utf8(s)` is the already-injected SHA-256
provider. These are three DIFFERENT binding domains.

**Exact source bytes:**
`originalSnapshotSha256 = sha256Utf8(originalSnapshotJson)`. Verify this from
the extracted original string; it is not a hash over reserialized parsed
snapshot or current A.

**Full bound rejection tuple:** `rejectionReceiptSha256` equals
`sha256Utf8(Canonical(["account-create-default/rejection-tuple/v1", R]))`, where
`R` is the exact closed object:

```text
{
  physicalRootId, ownerId, actionId, domain, kind, domainReferenceId,
  payloadVersion, payloadHash, payloadJson, accountGuardsJson,
  serverOutcome, rejectionCode, outcomeJson
}
```

Every value is derived from the same **persisted authenticated owned root** plus
its registered/validated canonical envelope and full original SQL091 business
rejection evidence. `domain` is `accounts`, `kind` is `create_with_default`,
`payloadVersion` is `account.create-default/v1`; `payloadJson` and
`accountGuardsJson` are original exact immutable text bound through existing
registered envelope/guard verification. `serverOutcome`, `rejectionCode` and
`outcomeJson` are the complete stored canonical business-rejection tuple, not
just `status`/`code`; reject missing, fabricated, incomplete or unsupported
outcomes using unchanged `assertCompleteBusinessRejection`. Do not include
mutable local root `state`, `_status`, timestamps or ACK state in this digest.
SQL/receipt vocabulary is **not** extended by this technical contract. In
current `assertCompleteBusinessRejection` the supported `DOMAIN_UNIQUE_CONFLICT`
receipt is narrow; a currently refused `stale` branch is not silently enabled.

**Entire completion fact:** let `C` be the EXACT 10 completion members excluding
`completionSha256`, including `version`, `restoredPriorDefaultPostimageHash` and
all other fields. Define
`completionSha256 = sha256Utf8(Canonical(["account-create-default/compensation-completion/v1", C]))`.
Recompute and constant-compare each authenticated read. Thus changing
`restoredPriorDefaultPostimageHash` alone is detected even if A's current
postimage has legitimately changed. This is an integrity/binding check against
accidental/incoherent corruption, **not** a signature, HMAC or unforgeable
defense against coherent local database tampering.

When `priorDefault` is null in original snapshot, both prior fields are literal
`null`. Otherwise ID exactly equals `originalSnapshot.priorDefault.accountId`,
and its hash is generated by
`hashAccountReviewLocalPostimage({table:"accounts",id:A,raw:preparedRestoredA._raw, hashProvider})`
after the writer has genuinely prepared A's `isDefault=true` operation and
before adapter commit. The hash retains full actual physical fields except
existing transport metadata exclusions. It must never be reproduced from a
guessed historical A or validated by requiring A's later CURRENT `isDefault` /
physical hash to stay unchanged. The original frozen A prior/postimage hashes
remain unchanged in the original 12-key JSON and continue to guard **first
compensation**.

## Cohesive source helper/API proposal (not a grant)

| Proposed path/API                                                                                                                                                                               | Exact role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/logic/src/financial-actions/account-create-default-compensation-carrier.ts` — `parseAddCompensationCarrierJson`, `serializeAddCompensationCarrierJson`, `readOriginalAddSnapshotJson` | Preferred **new cohesive pure carrier module**, keeping original `account-create-default-local-recovery.ts` under its 900-line post-Prettier budget and preserving that original strict 12-key parser unchanged. Strict plain-vs-terminal discriminant, 192 KiB bounded outer private-only raw admission; reuse existing duplicate scanner via narrow adapter **or** canonical raw round-trip duplicate rejection; return original exact 12-key bytes and parsed completion, NEVER independent writer/owner authority. No bespoke JSON scanner or global 64 KiB parser expansion. |
| `apps/mobile/services/account-default-intent-compensation-carrier.ts` — `buildCommittedAddCompensationCarrier`, `verifyBoundAddCompensationCarrier`                                             | Existing hash provider, validated exact owned physical root, rejection tuple/digests and restored prepared prior A; `verify` accepts mandatory `ExpectedAddRecoveryIdentity` including physicalRootId and public/root identity and only returns `completed` on full checks. Never accept caller-crafted status/ACK as proof.                                                                                                                                                                                                                                                      |
| `apps/mobile/services/account-default-intent-local-recovery-commit.ts` — `reconcileRejectedAccountDefaultInSqlite`, `stageTerminalRoot`, `assertLocallyCompensatedReplay`                       | Construct completion in dedicated authenticated writer only after current proofs; include root carrier update in **same** `commitPreparedBatch` as account/child/effect/restoration; replay via same verified terminal fact, no second restore.                                                                                                                                                                                                                                                                                                                                   |
| `apps/mobile/services/account-default-intent-local-recovery-evidence.ts` — `verifyImmutableAddRecoveryAuthority`, `verifyNoSuccessors`                                                          | Resolve original JSON from validated carrier, preserve complete original root/creator/receipt proofs; inspect validated private dependency refs instead of escaped string matching; fail on unknown/corrupt private.                                                                                                                                                                                                                                                                                                                                                              |
| `apps/mobile/services/sync/account-action-protection.ts` — `loadAccountActionProtection`, `proveLocallyCompensatedAdd`                                                                          | Require historical completion/physical B loser, exact original children/effect/receipt/owner; allow A's later genuine false flag ONLY for carrier-mode completed roots; legacy plain mode retains strict A true check.                                                                                                                                                                                                                                                                                                                                                            |
| `apps/mobile/services/sync/financial-action-root-pull.ts` — `ownedLocalPrivate` / `rootWriteRecord`                                                                                             | Existing **already repaired** Add-aware local preservation/remapping and Review acceptance checks stay intact. Extend Add-only private decode to carrier, prohibit cloud fabricating completion or clearing private by state alone.                                                                                                                                                                                                                                                                                                                                               |
| existing private capture/retention and final SDK writer/ACK readers                                                                                                                             | Capture always emits original 12-key plain JSON; retention/cleanup rechecks carrier/root/dirty/dep obligations, does not assume `reconciled` or first ACK permits GC. SDK final ACK revalidates catalog and losing row exclusions. No generic push of local bytes.                                                                                                                                                                                                                                                                                                                |

All reader paths that previously invoked the original strict parser on a
`localRecoverySnapshotJson` value MUST call the discriminating helper first and
pass ONLY its validated original JSON string to the unchanged parser. A
structural decode does NOT authorize completion. Each authority-bearing reader
must require and recheck original owned root five parts
`(ownerId,physicalRootId,actionId,payloadHash,payloadJson)`, registered tuple,
canonical guards, full rejection and completion hashes, and current
authentication before/after awaits inside the correct writer/ACK boundary.
Unrecognized private version, malformed existing Review private, legacy Metals
private, cross-owner root or absent marker fails closed. Never create, upgrade
or lazily backfill a completion carrier outside the single dedicated
compensation adapter commit.

## Recovery, root-pull, ACK, Edit and succession rules

1. **Initial recovery:** `verifyImmutableAddRecoveryAuthority` and
   `verifyAddRecoveryPhysicalState` still require complete SQL091 outcome and
   original default graph, owned immutable frozen creator ancestry, prepared
   B/account/child/effect physical hashes, no successors, current A=false
   original prepared postimage and safe writer/SDK scope. Prepare B+children
   tombstones, optional opening effect compensation, A=true restoration,
   terminal root + new validated carrier in one `commitPreparedBatch`; failed
   transaction preserves all old images and no marker. No new financial
   action/effect.
2. **Completed later admission:** full carrier/receipt/original root proof, B
   physically deleted and correctly owned, child identities/cardinality fully
   matched and deleted, opening effect exact and ineffective/compensated, A
   still owned/not deleted where originally present; A's current default may be
   false after a real subsequent Edit. Do not require current A physical hash to
   match the old prepared restoration, and do not use only A's dirty bits or an
   ACK as evidence. Retain B tombstone suppression and rejected root/provenance
   across restarts and ACK.
3. **Replay:** `reconcileRejectedAccountDefaultInSqlite` returns `"replay"`
   after verification without preparing A, D, B or effects again. No restoration
   from a server-only `reconciled` label.
4. **Independent ordinary Edit:** existing `updateAccountWithinWriter` metadata
   path clears A then selects existing D via multiple awaited `Model.update`
   calls. No Edit receipt or atomic batch claim. Once independently dirty,
   A=false/D=true flow through existing `planAccountMetadataPatch` →
   `pushTableAccountMetadataPatches` clear-before-set owner-filtered UPDATE and
   exact positive ACK. Remote sequential UPDATEs are not a cloud transaction;
   partial failure retains dirty evidence. Never synthesize a generic LWW
   default change from B's historical compensation.
5. **Pull and retention:** Main at `bd245` already recognizes Add and preserves
   Add private JSON, including across physical root remapping, and verifies
   Review acceptance separately. Extend ONLY the validated terminal Add decoder;
   never trust cloud `local_recovery_snapshot_json`, let a remote root
   `reconciled` replace an unresolved local B, delete a still-needed root, or
   clear Add completion/private without post-ACK, successor and
   tombstone/metadata exclusion proof. Keep original creator roots for all
   pending consumers; no timer or automatic GC.
6. **Successors:** `verifyNoSuccessors` currently uses a raw substring search of
   `other.localRecoverySnapshotJson` for quoted losing action ID. The original
   snapshot is now escaped inside a wrapper, so this is NOT a valid successor
   absence proof. Decode **every** encountered recognized private original Add
   or Review version with its own owner/action/physical root and relevant
   receipt binding; inspect original private dependencies (including Add
   `dependencyRoots` and Review default dependencies) semantically. Keep public
   payload reference checks. Unknown private versions, invalid owner, malformed
   canonical JSON, absent required private evidence or mismatched provenance
   conservatively refuse destructive compensation, not skip that root.

**Legacy behavior:** A `reconciled` Add with only valid plain original 12-key
evidence has **no** positive post-commit witness. Retain
`assertLocallyCompensatedReplay` / `proveLocallyCompensatedAdd` current A=true
check and other original physical/receipt guards. If legitimate D was selected
before the new witness existed, that legacy root may remain stuck: do NOT infer
it was restored from `_status`, server ACK, timestamp, late Edit or remote
receipt; do NOT manufacture the marker retrospectively. Fail-closed older roots
are an explicit compatibility cost, not a business change. Unresolved old 12-key
snapshots missing complete previously accepted creators also remain fail-closed.

## Required independently owned real-SQLite Red / failure matrix

All cases use genuine Add service/immutable prepared command, SQL091-shaped full
bound rejection outcome, dedicated production compensation writer, actual
ordinary `updateAccountWithinWriter` / public Edit service and
`synchronizeWithProtectedAccountActions` via installed real WatermelonDB SQLite
SDK hooks. No manual default flag substitutions, fabricated writer completion,
timeout inflation, new financial effects or duplicated test ownership. The
independently authored test artifact `4f40fe26045be578f9ea02fa8b318688837b9fb7`
contains exactly **two parameterized genuine ordinary-Edit scenarios** (before
first B terminal ACK, and after prior guarded B terminal ACK) in
`apps/mobile/__tests__/services/sync/account-create-default-sync-later-edit.sqlite.integration.test.ts`.
The retained independent corrupt terminal F3 negative is at
`e45aec7c567959b61716cde604daa5fa166f103c`, within
`account-create-default-sync-metadata-terminal.sqlite.integration.test.ts`. The
other cases below describe the separately required coverage matrix; do NOT
represent it as an existing counted cohort. Root's grouped real-SQLite cohort
was RUNNING at this documentation pin: source43 syntax repair is not meaningful
Red, no test outcome is invented, and Root must inspect actual Red before any
production grant.

| Proof case                                                                                                                                                      | Positive requirement / refusal                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Before-first-ACK: A initial default, Add B rejected and _actually_ compensated, then ordinary Edit makes existing D default                                     | A false/D true transport & ACK succeed; B remains tombstoned/suppressed; no financial effects                                            |
| After prior guarded B terminal ACK, then ordinary Edit D                                                                                                        | Same successful owner-filtered metadata transport/ACK; private fact survives first root ACK and restart                                  |
| Repeated rejected callback and cold restart after D edit                                                                                                        | Authenticated `replay`, exact original carrier bytes unchanged, A not restored anew, D untouched                                         |
| F3 intentionally corrupt terminal: root reconciled/B loser tombstoned, original A never restored, no real compensation carrier                                  | Fail closed; no terminal ACK, no fabricated marker, no generic tombstone or default export                                               |
| Corrupted individual completion or historical restored-postimage hash (completionSha256 NOT updated)                                                            | Reject after D edit, even when current A hash differs from committed historical hash                                                     |
| Wrong owner/physical root/action/domain reference/original payload/hash, wrong canonical guards                                                                 | Fail before ACK/pull checkpoint; original five-part identity never substituted                                                           |
| Missing/duplicate/extra JSON keys, malformed nested values, wrong version, invalid/null fields, uppercase hash, exceeding 64 KiB inner or 192 KiB outer         | Fail before authority; original strict 12-key parser unchanged; old/Review/Metals versions not misclassified                             |
| Incomplete 3-key rejection, unsupported stale/business conflict, same actionId with different receipt bytes, changed code/status/outcome/creator graph          | Reject; complete original SQL091 business outcome and digests required                                                                   |
| SQLite adapter compensation fails after staging root and A/B/effect changes; cache notification exception after successful durable adapter commit               | Failure leaves no carrier and no partial compensation; successful adapter commit remains terminal/replay, not retried as false fail      |
| Wrong/missing/rebound/foreign child, extra effect, active B or new successor, original creator already accepted before Add prepare, unresolved/bad creator hash | Exact card/effect/provenance checks; positive full creator set survives; refusal when binding/requirement fails; never replay a creation |
| Valid zero-opening B, no prior default, no children                                                                                                             | Null prior/hash and null opening effect are exact; no phantom effect or guessed restoration                                              |
| Generic push, root pull/remap, before/after SDK ACK, residual name edit, auth A→B switch, partial remote A-clear/D-set                                          | No private bytes or losing tombstones/financial exports; no wrong-owner ACK/checkpoint; retain genuinely dirty unacknowledged metadata   |

Preserve existing F3 and all original acceptance/negative tests. Other worker
owns test additions. Root must reconcile this DOC packet against current locked
contracts, run fresh `speckit.analyze`, obtain actual Red, then grant mutually
exclusive writer/logic/sync source work. No source, SQL, tests, commands,
emulator, runtime, dependencies, refs, PR or native workers are authorized by
this report.
