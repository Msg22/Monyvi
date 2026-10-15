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

The new suite contains **15 test declarations expanded to 18 Jest cases** by
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
