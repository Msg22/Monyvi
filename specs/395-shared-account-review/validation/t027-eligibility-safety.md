# #395 T027 — reducer eligibility and safety Red handoff

**Assignment:** tests-only safety addition; **no production mutation**.
**Expected source/branch head:** d87ed45818c649cd3680886d54f4e8e6822ecd22 on
codex/395-reducer-safety (existing branch; no branch creation/reset).
**Trusted governance:** de09f76bdadb570c99a1015bbf1c680279b0d5ad.
**Evidence:** spec.md FR-003, FR-008, FR-009, FR-021; review-commands.md
resolution order and command outcomes; wire-shapes.md canonical row/session
contracts; business-decisions.md lines 265–273 and 300–325.
**Authored test:** packages/logic/src/account-review/__tests__/reducer-eligibility-safety.test.ts.

## Case inventory and predicted behavior (NOT EXECUTED)

The corrected suite contains **16 test declarations expanded to 19 Jest cases** by
three two-entry tables. It has no SUT mocks, fake reducer outcomes, unsafe
casts, any types, provider calls, or future T036 reducer commands.

| Area | Expected meaningful Red | Positive/schema control |
| --- | --- | --- |
| Ordinary SMS source | A canonical two-SMS BANK group edited to a unique CASH type must reject atomically; the current edit path lacks the exclusion | Grounded normalized Voice CASH group remains editable/reconfirmable |
| Default freshness | Direct select_row and bulk select_ready must each reject stale default-origin Bank A when the sole fresh owned default is Bank B, even though A is still active and same-currency | Both operations accept current Bank A default, plus explicit user-origin A even after B becomes default |
| ATM destination | Direct and bulk selection reject foreign/unowned and owned non-Cash Wallet IDs; direct selection rejects stale EGP-labelled destination whose owned Cash currency is USD; pending Bank-group click cannot confirm/select through invalid destination | Both selection commands accept owned distinct EGP Cash; a disclosed pending Bank click with eligible Cash confirms Bank and selects the clicked row |
| Reversible removal | Missing nextUndoToken must reject without tombstone; current code accepts null. Invalid non-UUID token remains rejected | Valid token plus exact-generation transient Undo restores group and financial amounts |
| Scoped nicknames | Same nickname in EGP/USD must not collide; same nickname/currency across different known institutionId values must not collide | Same normalized nickname in the same unknown-provider currency scope must still reject |
| Schema boundary | An ATM toAssignment whose declared currency differs from known row currency fails session schema; this is NOT claimed as missing reducer behavior | Reducer must also revalidate an otherwise schema-shaped destination ID against the current owned context |

Source-backed mechanisms awaiting actual Red verification:
1. reducer-groups.ts editGroup does not enforce the ordinary SMS BANK/WALLET source restriction.
2. reducer-selection.ts hasAccountChoice accepts default-origin account IDs without testing the current sole default.
3. reducer-selection.ts ATM readiness only checks missing/unresolved toAssignment, not owned same-currency eligible Cash, source distinctness and pending-group click safety.
4. reducer-groups.ts accepts null nextUndoToken despite FR-009 and the UUID-only Undo command.
5. reducer-groups.ts editedNameConflicts compares normalized nickname globally, not user/currency/known institution identity.

Every expected rejection checks **effect = none**, the canonical accepted-false
indicator (there is no reducer-result accepted property), nonempty reason codes,
zero affected IDs, null Undo, unchanged input state/reference and financial row
fields, selection, row/group revisions, session revision, operation generation
and tombstones. Controls check accepted effect, progression and schema validity.
No new unapproved exact failure reason code is assumed.

## Fixture validity rationale

- Original two-SMS BANK and split-currency QNB/EGP+QNB/USD groups come through
  the actual makeTwoSmsInput/makeTwoCurrenciesInput producers and
  normalizeAccountReviewParserResult. Grounded Voice Cash uses
  makeCashVoiceInput and the same normalizer. The default-origin fixture uses
  the existing ready Voice row with genuinely absent account evidence.
  ownedContext rebuilds fresh, coherent active account and provider snapshots
  when the sole default is switched.
- The ATM producer is a tagged synthetic SMS row with aligned original body,
  submitted message ID/fingerprint, amount, source, known currency, and exact
  evidence spans, normalized by production logic. Its deliberately constructed
  **post-review** states are all validated by accountReviewSessionSchema.
  Independent cash_transfer_review is cleared solely to isolate the reducer
  safety boundary after hypothetical review. This does **not** demonstrate
  that today's UI can produce an exploitable row.
- Pending-source ATM keeps the authentic reciprocal BANK group. The ready ATM
  source is an owned EGP BANK user assignment with the now-unreferenced pending
  group removed. Deliberately stale destination IDs are externally asserted
  against fresh owned account snapshots, without claiming that direct
  currency-mismatched row shapes are schema-valid.
- Known-provider nickname examples use synthetic stable institution strings,
  derive SHA-256 evidenceKey/groupId via the real identity/hash factory, remap
  linked row group IDs reciprocally and parse the canonical session.
  This does not invent a provider uniqueness policy or forge hash values.

**Pending destination-group limitation:** Canonical active group reciprocity
requires each linked row's primary assignment to be the suggested group.
There is no reciprocal Cash destination group membership via toAssignment.
An already assigned BANK source plus a genuine **pending Cash destination
suggestion group** therefore cannot be represented honestly with existing
active-group reciprocity. This negative case is **reported rather than
faked**, and requires schema/contract consideration in a separately approved
wave. Pending **source Bank** click with invalid existing destination is
covered.

## Execution and next gate

- **Jest, TypeScript, lint, focused Red:** NOT RUN by remote worker under Root-only execution authorization. No Red/Green or pass count asserted.
- **Previously reported Root baseline:** 537/537 logic PASS, 20/20 disclosure PASS, lint 0, before this suite; it is not updated here.
- **Production/schema/identity/T024 tests/other docs/Core/UI/SQL/PR/issues:** unchanged.
- **Next:** Root fetches the published commit and runs focused checks, inspects
  canonical setup and meaningful Red, and decides whether to grant a separate
  bounded source correction. T036 remains held.


## Subsequent production correction lease — source prepared, execution held

**Root's actual pre-correction Red**: 34 PASS / 10 FAIL, comprising existing
26 T024 PASS plus the new suite 8 PASS / 10 FAIL. Root reported all ten failures
as meaningful reducer invariants and no fixture construction failures.
**After this correction:** Jest, strict logic TypeScript, lint, and independent
review are **NOT RUN** by this remote worker; do not interpret the source
changes or this note as verified Green.

Production source authored against parent
3512166dbee9c4a37fc4244b9abff79cec5ffdef:

- reducer-groups.ts: SMS source groups cannot be confirmed/edited into CASH,
  while Voice CASH and removed-group cleanup retain their own paths. The
  edit collision guard now scopes normalized nicknames by the current
  user/session, locked currency and stable institutionId (including null);
  provider display name and account type do not create new namespaces.
  Removing a group requires a valid transient UUID Undo token; null and
  malformed tokens reject before any tombstone/row mutation.
- reducer-selection.ts: selection eligibility invokes the existing
  resolveAccountReviewSession pure owned-snapshot revalidation instead of
  replicating its default, account evidence, Cash destination, currency,
  provider and source rules. Direct rows and disclosed pending group clicks
  gate on the refreshed row before accepting any selection/confirmation.
  ATM destination must revalidate to **existing**; unresolved/absent/pending
  destinations are not ready. Confirmed SMS source group cannot be CASH.
  Bulk select_ready refreshes once, selects only eligible visible rows and
  skips invalid ones; an empty eligible set returns the existing canonical
  rejection without any state change. clear_selection is unchanged.
- reducer-eligibility-safety.test.ts: preserved all 18 existing cases and
  assertions, added one mixed bulk-selected safety case, annotated the
  financial-row snapshot projection with the authoritative AccountReviewRow
  type, used the appropriate ReadonlyArray union annotation, and narrowed
  the SMS discriminant before reading isAtmWithdrawal.

The correction reuses an existing pure, exported resolver without moving or
editing resolution.ts, identity.ts, review-schemas.ts, repository indexes,
persisted payloads or contracts. It returns the reducer's original immutable
session transitions only; revalidated rows are used as eligibility evidence,
not silently committed financial data. A later resolver or snapshot refresh
must not be mistaken for an accepted reducer mutation.

**Root next gate:** fetch the child commit, confirm only the two reducer source
modules, this new test and this note changed, then run batched strict TS/lint,
focused 26+19 suite and unaffected logic checks. Independently review
selection refresh cost and atomic rejected outcomes. No source Green or full
runtime Save/SQL/UI validation is claimed. Branch ownership is released after
publication.


## Follow-up: selected ATM must persist a complete destination (tests-only)

**Bounded authorization:** tests/report only, parent expected
bfb124ac46e6a06ccac5024593c09389329e141f. Source edit grant is **absent**.
Root executed the preceding bfb integration gate: **319 PASS / 0 FAIL**
across 15 account-review logic suites, including all 19 existing safety cases
and 26 T024 cases; lint 0 and no reducer TS errors. Independent source
acceptance is still held for review. This follow-up has **NOT** been run.

**New source:** reducer-eligibility-safety.test.ts adds five test declarations
expanding to **eight Jest cases** (21 declarations / 27 Jest cases total),
preserving all previous 19 safety and 26 original T024 cases:

| New regression | Scenarios | Safe outcome |
| --- | --- | --- |
| Direct existing Bank source | Null and unresolved ATM destination (2) | Reject unchanged, OR return selected row with owned distinct EGP Cash destination and no review blockers |
| Direct confirmed Bank group | Null destination after an actual pure group confirmation (1) | Same |
| Disclosed pending Bank group | Null and unresolved destination (2) | Same; rejection must leave original group pending and all selection/revisions untouched |
| Bulk select_ready | Null and unresolved destination (2) | Skip/reject, OR selected row must retain validated Cash assignment and no hard review reasons |
| Existing hard-review reason | A null destination retaining cash_transfer_review (1); asserts both direct and bulk commands | Reject unchanged, OR only select with fully valid Cash and cleared blocker |

Original explicit user-selected, owned same-currency Cash positive control remains
untouched. The new tests check both the **real**
resolveAccountReviewSession(source state, same fresh owned snapshots) result and
the **real reducer** result: fresh resolver must find exactly the existing
eligible default Cash account, while reducer may either fail closed unchanged
or return a selected ATM row with eligible current-owned same-currency Cash,
distinct from its source, no cash_transfer_review/other remaining review
reasons, unchanged original financial transaction and amount. Rejected
outcomes reuse the prior atomic-rejection helper, which checks identity,
financial fields, selections, groups, revisions, affected IDs and tombstones.
No mocked resolver, fabricated output, cast, any, T036 command, or wholesale
refreshed-session expected state is introduced.

**Expected meaningful Red (not executed):** The current reducer-selection.ts
checks readiness against resolved temporary rows but builds accepted transitions
from the original rows in direct selection, post-confirmation click and bulk
select_ready. Thus the first seven scenarios are expected to expose an accepted
selected ATM with a **missing/unresolved original destination**, despite a
ready fresh copy. The hard cash_transfer_review control may pass fail-closed,
depending on the current resolver's reason preservation. Exact Red counts and
schema validation require Root execution; if another guard prevents selection
and returns an unchanged rejection, that is correct and the test must pass.

**Critical integration prerequisite / source discrepancy:** At immutable bfb,
review-schemas.ts blob d549e3a3a14b44e73072eb346c95342d9e6ea6b7 defines
toAssignment but **omits toAccountEvidence**, although
normalization.ts already constructs toAccountEvidence and resolution.ts
dereferences it for null/absent ATM fallback. That standalone revision cannot
be used to claim a valid resolved fallback. Root's **newer nullable
toAccountEvidence** schema integration (previously disclosed, exclusively
owned outside this lane) is required before the new proof is meaningful.
The new tests use exactly the already accepted normalized ATM fixture,
no hand-written evidence or out-of-scope schema fix. If Root's combined
current-schema execution cannot produce canonical normalized ATM source and
real Cash fallback, treat that as a **fixture/schema integration blocker**,
not a valid reducer Red. No changes to schema, normalization, resolver,
shared identity, T024 fixtures, or published financial contracts were made.

**Next gate:** Root imports only this test and report from the child commit
into its existing combined verification sibling; independently verifies current
schema compatibility, real resolver positive control and meaningful reducer
Red before any production edit authorization. Full Green, TS and lint remain
Root-owned. This tests-only lease ends with publication and writer freeze.


## Final T027 tests-only checkpoint: Voice default and compatible edit

**Approved parent:** ac4e1e83a074e89fea801beda86bae7ac589d9cd on existing
codex/395-reducer-safety. **No production correction permitted in this wave.**
Root's actual coherent pre-follow-up Red on ac4: **46 PASS / 7 FAIL**,
including all prior 19 safety plus 26 T024 cases passing. All seven failures
specifically concern selected ATM output retaining null or unresolved Cash
destination. The hard cash_transfer_review control safely rejected. Root's
new-schema integration, rather than the older standalone schema, supplies the
canonical nullable toAccountEvidence boundary.

**Test inventory after this checkpoint: 30 safety cases** (previous 27
preserved, plus 3), with all existing 26 T024 cases unchanged. The original
27 cases have been relocated without semantic edits, assertions removed or
duplicate execution into two cohesive files. This respects the 900-line
per-file bound:

- reducer-eligibility-safety.test.ts: SMS/Voice source, default freshness,
  mixed select_ready, scope/nickname/Undo and the new Voice/edit invariants.
- reducer-selection-snapshot-safety.test.ts (new): moves the existing ATM
  producer-backed tests, the associated canonical normalized-ATM fixtures and
  assertions into a separate test file. The tests and expected behavior are
  unchanged. Two TypeScript closure-narrowing errors are fixed by assigning
  validated destination account ID and suggested source group ID to immutable
  consts before their respective array callbacks. The simple readonly
  AbsentAtmDestination array uses readonly T[] style. No casts, any, SUT mocks,
  fake response or new public type is introduced.

**New item N1 (two cases):** A Voice row with genuinely absent account evidence
and unresolved account_needed assignment is built directly from the existing
canonical reviewWithReadyRow fixture, with the other QNB group untouched.
A freshly coherent owned snapshot makes CIB the sole default Bank and retains
Cash as nondefault; the real resolveAccountReviewSession must convert this
same unresolved row to an existing CIB/EGP default without any account blocker.
Both direct select_row and select_ready are exercised. Each may reject
atomically without changing state, selection, revision, finance or sibling
groups. If accepted, the **actual selected output row** (not temporary resolver
data) must contain the eligible CIB default assignment, zero review reasons,
and its original amount/transaction/row identity. Current source is expected
to fail the accepted-output invariant because readiness is checked against
the fresh resolved copy but the source transition persists the old unresolved
row. This is a source-backed expected Red, **not an executed result**.

**New item N2 (one case):** Starting with the actual QNB3/CIB1 canonical
Voice fixture, a disclosed group click confirms QNB and checks exactly one
QNB row. A subsequent **nickname-only edit** uses the actual
edit_group command with reconfirm:true while preserving currency,
type, known-provider fields, card and sender identity. The group revision
and confirmedIdentityRevision must progress, the clicked row must remain
selected, previously unchecked siblings and the independent CIB group must
remain unchanged, and all financial amount fields must be retained. This
enforces specs/395-shared-account-review/data-model.md (Edit identity:
"Compatible links retained, invalid selection clears") and the owner-approved
binding 94–95. A material identity/type/provider/currency edit is not given
this preservation guarantee. Current confirmGroupRows unconditionally resets
selection, so the nickname-only case is expected Red pending Root execution.

**Validation:** new tests, TypeScript and lint were **NOT RUN** by this remote
worker. Root owns a final coherent focused Red / TS / lint batch before
consolidated independent-review triage, and must separately grant any source
changes. No schema, identity, resolver, runtime, financial/Core, UI, SQL,
PR/issue or external source was changed.


## T027 final source correction — complete child checkpoint, Root Green pending

**Authorization:** one bounded production correction on existing
codex/395-reducer-safety, parent
937e5da9e239159c0deb9783b84d992ef5862f19; only
reducer-selection.ts, reducer-groups.ts and this validation note. No tests,
schemas, resolver, identity, candidates, indexes, financial, Core/UI/SQL or
other files changed by the source owner.

**Root's observed pre-correction Red:** 20 PASS / 10 FAIL across the two
30-case reducer safety suites (seven selected ATM destinations incomplete,
two selected Voice unresolved default assignments, one compatible nickname
edit unchecking the selected row). Prior 26 T024 cases are unchanged.
The financial lane's separately reviewed 272 PASS is out of this correction's
scope. Strict logic TS has only the unrelated future candidates import in
account-choices.test.ts, with no reducer/financial TS errors; the reported
lint baseline is 0. These are Root's pre-correction observations, NOT this
worker's post-change test evidence.

**Correction A — reducer-selection.ts, fail closed with original proof:**

- Existing/confirmed source direct selection first requires the original
  row to be ready, with no review blockers, a valid original source/known
  currency, and an existing destination for ATM. It separately verifies
  the re-resolved row is ready under the current owned context.
- The original and resolved row's canonical account assignments, destination
  assignments and review reasons must agree before selecting the original;
  changes found by the resolver are **eligibility evidence only** and
  cannot silently be discarded while returning a selected stale row.
  Thus an original missing/unresolved ATM destination or Voice missing/default
  source is safely rejected without mutation. An explicit already selected
  Cash destination or current eligible Bank/default/user assignment remains
  eligible when its proof stays coherent.
- Disclosed pending-group clicks require both original and current currency,
  source proof, blocker and Cash destination eligibility before the group
  confirmation/row selection. The permitted account_group_unconfirmed
  reason is cleared only through the existing group-confirmation transition.
  Rejecting prior to that transition preserves the original pending group.
- Bulk select_ready evaluates original and fresh row proof with one real
  resolver call and an indexed refreshed row map, skipping invalid rows while
  still checking unrelated ready rows. Zero eligible rows yields the existing
  canonical unchanged rejection, including no group confirmation or revision
  increment. clear_selection and other commands are unchanged.
- The reducer continues to commit its original scoped immutable source row
  (with the expected selection/revision transition), **not** a wholesale
  resolved session or its unrelated row/group changes. No new default,
  provider, identity, currency, cash or financial persistence policy appears.

**Correction B — reducer-groups.ts, compatible reconfirmation:**

- An explicitly reconfirmed edit_group may preserve a previously checked
  linked row only when the prior group was confirmed and the edit changes
  no type, institutionId, providerDisplayName, cardLast4, sender aliases or
  locked group currency (nickname-only). The row must be canonically linked
  to the prior confirmed group/revision with known matching currency and
  zero review blockers. An ATM row also needs an existing Cash destination
  rather than an unresolved one.
- The group still gets its new revision and confirmedIdentityRevision, and
  linked rows are updated through the existing atomic transition. No
  previously unchecked sibling becomes selected. Confirm-group commands and
  material edits continue clearing selections; removal, Undo, schema and
  source type rules stay unchanged.

**Post-correction checks:** NOT RUN by remote owner, as authorized. Root must
perform one coherent Green/TypeScript/lint run including both 30-case safety
files and all 26 T024 cases, then seek independent source review before
acceptance. This report is a source checkpoint, not a Green or release claim.


## T027 follow-up: nickname-only selection under refreshed Cash ownership (tests-only)

**Review finding:** A separately authored, read-only Core reviewer identified that
reducer-groups.ts currently preserves a selected linked row on compatible
nickname-only edit by consulting the stored assignment, row reasons and the
presence of an existing toAssignment. It does not revalidate the selected ATM
Cash destination against fresh owned snapshots. Top-level
assertOwnedResolutionContext validates coherence and owner but is not a current
account eligibility check. The canonical resolver does recheck that destination.

**Source/parent for this bounded follow-up:**
a5e10871fc2a36230b6badeca40dc793c31dd445,
codex/395-reducer-safety. Only the existing
reducer-selection-snapshot-safety.test.ts and this validation report changed;
all six reducer production modules, source adapters, schema, other tests, and
index/contract files remain untouched.

**Added two tests, original 30 safety + 26 T024 assertions preserved:**

1. **Expected meaningful Red — selected shared SMS ATM, then deleted Cash:**
   Build the real two-message QNB parser fixture, replacing *only* the original
   first financial/source SMS body with a coherent ATM withdrawal and exact
   original-message QNB/EGP spans. The second independently correlated QNB
   purchase remains a live, originally unselected member of the same canonical
   two-row group. The normalizer creates the real pending Bank group. Its ATM
   destination is explicitly reviewed to the existing owned EGP Cash account,
   its independent cash_transfer_review reason is cleared, the real reducer
   confirms the group, and an ordinary select_row checks just the ATM.
   The fresh snapshot excludes that Cash account to model an actual deletion
   (rather than illegally changing an immutable account's type/currency).
   **The real** resolveAccountReviewSession must invalidate the destination,
   add account_unavailable and clear its selection while leaving the ordinary
   unselected purchase untouched. An edit_group reconfirm:true that changes
   only the nickname must then either:
   - reject atomically with unchanged canonical input and all financial,
     selection, group and session revisions; **or**
   - accept but clear the now-invalid ATM checkbox, selecting no other row.
   The existing source is expected to fail this check by preserving the stale
   selected ATM because it only tests toAssignment.state === existing.
2. **Positive control — same fixture/current owned Cash:** The identical
   confirmed+selected group with the unchanged complete owned snapshot
   independently resolves its ATM destination to the still-eligible Cash
   account. A nickname-only reconfirmation must preserve the one valid checked
   ATM, leave its independent purchase sibling unchecked, advance the group
   confirmation revision, and preserve all financial amounts and transactions.

**No voice ATM case:** Canonical Voice rows cannot have ATM transfer
destination semantics. The existing Voice selected-before-edit positive test
remains untouched, and this exclusively SMS Cash invalidation does not warrant
inventing an impossible Voice ATM row. No mock, fake reducer result, cast/any,
future T036 command, or synthetic account type/currency mutation is used.

**Fixture validity and ownership:** Both provider financial rows retain their
correlated input messageId/fingerprint, category, amount and original
response-local suggestion linkage. The ATM-specific span indices are
recomputed from the changed source body. The canonical normalizer and session
schema run before the real reducer commands, and the changed owned snapshot is
rebuilt with ownedContext to keep its provider projection coherent. The second
transaction's finance and unchecked status are positively asserted. Owner,
session, group and revision scopes stay canonical.

**Root baseline before these new cases:** 330 PASS / 0 FAIL over 16 pure
account-review suites, including all original 30 safety and 26 T024 cases;
lint 0; strict logic only the held unrelated ../candidates import.
This remote worker has **NOT RUN** tests, TypeScript, lint or a provider/native
operation; no post-change Red or Green is claimed. Root owns the first coherent
meaningful Red, independent review reconciliation, and any separate minimal
production-fix authorization. Freeze this writer immediately after the
CAS-guarded tests/report child publication.
