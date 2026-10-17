# #395 T046 review-only frozen-intent digest — contract/tests-first handoff

**Status (2026-10-16): CONTRACT AND TESTS ONLY — NOT IMPLEMENTED / NOT RUN.**

- Pinned parent: `a34aaa4ae7880d4adab3831123886991c690cc9c`.
- Scope: two frozen contracts, this validation report, and exactly two NEW pure
  financial-action test suites. No source, package, schema, SQL, Edge,
  deployment, application runtime, spec/tasks/B1/UI or provider changes.
- Authority: owner's delegation accepted exactly one required **review-only**
  `frozenIntentDigest` root field on the **unshipped** `review.batch-save/v1`
  payload; no change to legacy or Add tuples.

## Frozen API and semantic projection

See `contracts/wire-shapes.md`:
`computeAccountReviewFrozenIntentDigest({session, intent, creationDefaultSnapshot, hashProvider}): Promise<string>`
in the future pure `financial-actions/review-intent-digest.ts`.

- Reuse canonical review session/intent and complete planned IDs, the existing
  SHA provider/canonical financial serializer/currency precision, and shared
  sender normalization **semantics**, without importing mobile code into logic.
- Domain separation:
  `["monyvi.account-review.frozen-intent", "v1", projection]`. Only hash of
  validated canonical financial-relevant original selected rows, confirmed group
  provenance and original full member plan plus historical captured default
  snapshot; no raw Voice/SMS/Undo/cache state persisted. Sender display labels
  keep the existing normalized first-survivor behavior; reordering is equivalent
  only when it does not change persisted label winners.
- Digest is `/^[0-9a-f]{64}$/`, required for every real review action, and
  included inside the existing financial envelope/payload hash. The envelope
  `payloadHash` remains distinct from digest-of-original-input.
- Include **all original selections** even when some SMS fingerprints were
  independently saved before commit. Their missing posted financial rows are NOT
  an excuse to omit them from the input hash. Complete original frozen-plan
  validation is separate from selected-only actual writes.
- Numeric financial equality compares canonical minor-unit results. The current
  review schema already rejects noncanonical raw decimal spellings such as
  `33.00`; do not admit them silently merely to claim equality.
- Same source/intent and captured creation-default snapshot on replay; do not
  sample current balances/defaults. Replaying an identical committed
  mixed-SMS-dedup root remains valid if the previously saved duplicate's mutable
  amount/row was subsequently edited or deleted; dedup proof is checked on the
  original first write and bound historically.

## Authored Red cases

### `review-intent-digest-wire.test.ts` — imports EXISTING SUT only

- Current old valid review payload **without** digest must be rejected.
- Required correct 64-hex digest must parse through raw schema, full strict
  payload and explicit opt-in registry/envelope.
- Empty/short/long/uppercase/nonhex/null/number/whitespace/array digests
  rejected; arbitrary extra original-intent/snapshot fields remain forbidden.
- Preexisting `account.balance-effects/v1` edit-balance tuple remains unchanged,
  including its validator identity. No review digest allowed on the legacy
  payload.

The wire suite has **no missing helper dependency**. It is expected to be
_behavioral creation Red_ at current T046 review schema: missing digest
presently passes; supplied digest presently fails closed as an unknown field.
The already accepted old baseline fixtures intentionally remain unchanged during
this tests-only lease. Future source grant must update their review-only valid
instances coherently rather than weakening the new test.

### `review-intent-digest.test.ts` — future helper MODULE-CREATION RED

Uses genuine pure account-review fixtures and canonical Zod parsing, no mobile
database/test harness. Cases cover: 64-hex deterministic digest;
property/selected-row/planned-member ordering; omitted SMS financial changes;
changed selection; original group evidence key; planned sender child ID and
extra unplanned child rejection; normalized sender alias ordering; captured
default-snapshot changes; KWD three-decimal/BTC eight-decimal minor units;
ignored unselected raw row/SMS body/Voice transcript; and stable rehydration
without querying mutable previously saved transactions.

**Current expected load failure:** nonexistent
`packages/logic/src/financial-actions/review-intent-digest.ts`. This is not a
behavior failure. A separate production lease must create exactly the agreed
pure helper and connect its schema usage.

## Next independently owned mobile/SQL Red (NOT part of this artifact)

1. Real `sms-mixed`: seed independently saved active fingerprint A, post
   selected B, capture immutable digest; restart with new SQLite adapter and
   cleared in-memory review session; replay identical original A+B without new
   action, balance/effect, account/child/default mutation or source parse.
2. After successful partial dedup, change independent saved A's mutable
   transaction amount, then soft-delete it. Same historical original input MUST
   continue to replay. No comparison to current A.amount/active flag during
   committed replay; first-write independent owner/active/outside-action dedup
   gate remains.
3. Reuse action ID but change original omitted A's amount, fingerprint,
   source/ATM role or selected membership (in a fully canonical frozen input):
   replay MUST reject, with physical-table and cached-model preservation.
4. Change original confirmed group's evidenceKey, name/type/sender alias or a
   planned physical child ID/localRef while retaining the old action ID: reject;
   preserve valid original group, owner, extra-child and dedup coverage. Do not
   invent account IDs or relax first-write membership.
5. First-write all-SMS-dedup remains action-free local cleanup; its two
   independently proven cache rollback and extra-child-plan Reds remain
   exclusively owned by Financial and are **not** corrected here.

## Required coordinated source gate

- T046: one strict review-only digest schema key, opt-in registry/public types
  and existing review-only canonical fixture refresh; keep unrelated legacy
  definitions exact. Generate/verify Edge parity, including omitted/
  malformed/additional fields, and action hash inclusion.
- T048: compute from original frozen session and actual captured default
  snapshot **before commit**; compare to stored digest during replay without
  loading/resampling current review/default/old dedup financial rows.
- Reserved **090**: closed PostgreSQL validator, canonical envelope hash,
  account/child/owner/financial membership and server replay parity; keep
  protected sync transport and canonical outcome/compensation compatible. Unused
  original planned members after dedup are explicitly expected.
- No `091` Add change, no generic outbox extension, no local schema/table/
  column, no raw Voice persistence, no hosted deployment.
- Root must reconcile Speckit task gates, run `speckit.analyze`, independently
  review the new digest/source/SQL parity and rerun all existing Save/pure/edge
  SQL regression gates **after** a production grant.

## Validation ledger

| Gate                                                   | State                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| New wire test import eligibility                       | Existing schema/registry modules only                        |
| New digest helper test admission                       | Expected missing helper module; zero assertions until source |
| Actual TypeScript/Jest/formatter/lint                  | **NOT RUN**                                                  |
| Generated Edge/SQL parity / device / hosted deployment | **NOT RUN / NOT AUTHORIZED**                                 |
| Earlier T043/T048 Save regressions                     | Frozen, untouched                                            |
| Git commit integration/push/branch/ref/PR mutation     | Not authorized                                               |

No production correctness, runtime validation or code activation is claimed.
