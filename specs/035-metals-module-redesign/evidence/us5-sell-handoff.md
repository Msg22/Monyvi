# Sell implementation handoff

## Runtime

The ACTIVE Details action registry already publishes Sell. Details now composes
`createSellHoldingActionDescriptor` and pushes the real
`/(private)/metals/[holdingId]/sell` route. Successful direct recording uses
`router.dismissTo` the same `/metals/[id]` Details page. The existing stack's
back action returns to My Metals. Sold/Disposed/financially locked holdings do
not expose Sell. English/Arabic `metals.sell` resources supply all Sell copy.

The route mounts a scoped loader only after resolved auth, remounts per owner
and holding, and delegates reads, preview and writes to services. Shared fields,
PageHeader, native sibling date pattern, Skeleton, responsive breakpoints and
bottom-safe-area actions are reused. Dirty exit and pending commit use
navigation guards. Submission retains the exact command until the outcome is
known; reload after a revision conflict changes the intent key while retaining
entered facts.

The command submits `metals.sell/v2` through the existing financial-action
foundation. The scoped projection and lifecycle/CAS checks run inside the queued
writer after idempotent replay lookup. A single batch writes the action root,
immutable evidence/event/references and Sold state. Evidence/event IDs equal the
canonical action ID, matching server 068. Existing lifecycle predecessors stay
effective and visible for append-only reconstruction. No account/ordinary ledger
write or capability is created.

## Rate and amount semantics

Canonical amounts use exact supported minor units; invalid input is preserved
for inline validation. Sale currency must equal the trusted purchase currency.
Canonical P/L is identity-currency net proceeds minus exact purchase cost. No
FX, purity factor, live quoted rate, or acknowledgment influences quoted sale
facts. Missing purchase cost produces unavailable reporting, never invented zero
cost.

The existing local terminal-pair loader supplies valid historical raw snapshots.
Sell adds a separately identified proceeds-currency role for a complete pair;
otherwise the existing v2 empty-snapshot contract is retained. Store read
failure is surfaced, not treated as missing data. Redundant historical snapshots
remain immutable evidence, while same-currency preview consumes none of them.
Current quoted 24K factor 1 and stored historical Gold factor 0.999 stay
untouched.

### Purchase currency differs from preferred currency

For purchase/sale currency EGP and preferred USD, both terminal currency roles
contain the observed EGP quote (e.g. raw `50 currency_units_per_usd`,
`base_per_quote`, normalized USD-per-EGP `0.02`), with distinct reference IDs.
The metal role contains the observed USD-per-pure-gram quote. USD identity `1`
is used only for an actual USD instrument, never to stand in for EGP.

FR050 terminal reference in USD is `q × m_s`; its canonical EGP reference is
`V = q × m_s / x_EGP,s`. Existing `shapeMetalRealizedSaleEvidence` reads stored
acquisition and terminal references for all five additive historical components.
Their sum is `G − F − K` because purchase and proceeds currencies match. Missing
historical inputs make the dependent breakdown unavailable, while valid combined
P/L remains available. No new persisted terminal-USD column is invented.

FR051 preferred USD display is a separate current display-time operation:
`Y_EGP × x_EGP,d / 1`. Existing terminal display service converts the combined
result and every available component with that same display basis, retaining
consumed FX trust. Recorded proceeds stay EGP. Missing display FX makes only the
converted result unavailable. `sell-metal-holding-reporting.integration.test.ts`
authors this full path, including raw inverse EGP snapshots, stored factor
0.999, FR050 component sum, preferred USD conversion and missing-display-FX
handling.

## Server lineage

`088_metals_sell_same_currency.sql` replaces only
`private.financial_action_validate_metals_sell_payload_v2(jsonb)`, retaining its
last hardened definition from 075 plus one currency-equality condition. The
guard runs before the empty-reference early return. Shape, amount/date/link,
snapshot roles/context/coherence, strict/security-definer/search-path, and
revoked caller privileges are preserved. No generic RPC, core function, wrapper
or row is changed.

068 supplies domain ownership and CAS; later v2/attribution hardening remains.
075 is the last CREATE/REPLACE of this validator. Later acquisition-link 078,
ordinary-ledger/security/reconciliation changes through 086, and metadata 087
wrappers are not replaced. Lead independently confirmed 087 does not redefine
the validator. Existing trusted-asset purchase-currency binding rejects a forged
purchaseCurrency even when forged saleCurrency equals it; 088 adds the equality
policy without bypassing that binding. SQL test covers the narrow payload guard
and preserved amount/capability bounds. Full trusted-asset RPC fixture execution
remains explicitly unrun.

## Proposed governing-doc wording for the documentation owner

“Sell records the complete ACTIVE holding using its purchase currency. The sale
currency is fixed and cannot be changed. Required sale date is on/after purchase
and on/before today; gross proceeds are positive and an optional fee is between
zero and gross in that same currency. Realized P/L is exact net proceeds minus
recorded purchase cost in purchase currency. Missing cost means unavailable P/L.
No FX conversion/acknowledgment is needed for canonical Sell P/L. Sale creates
no account credit, cash asset, ordinary income, budget or cash-flow entry.
Immutable sale evidence remains in History after removal from active metals.”

Update business decisions and relevant Sell acceptance
criteria/currency/P&L/rate paragraphs to this explicit user decision. Command,
facade and server enforce the new currency-equality write policy. The existing
shared registry remains usable for immutable historical reads; blindly
restricting that parser would risk old cross-currency evidence. Any future
shared registry write-policy guard must keep historical parsing separate. Do not
rewrite historical rows. No Sell-owned registry/DB/schema changes were made. The
released Undo dependency below includes a shared lifecycle reducer correction.

## P1 correction handoff

Sell facade and queued date validation reuse `formatMetalLocalCalendarDate`,
preserving local-midnight purchase dates and legacy UTC-midnight records. The
SQLite regression exercises the real persisted timestamps with portable local
calendar-component spies and asserts before/on-purchase boundaries.

The command now reads owned, non-deleted `metal_action_evidence` inside its
queued projection and passes the original Dispose immutable group/event proof
plus owned revision evidence to the released `resolveLegacyDisposalBaseline`.
The baseline is independent of the current ACTIVE Undo head; the shared reducer
validates each successor. No acquisition event, accepted label, terminal facts,
or predecessor mutation is fabricated. Canonical SQLite fixtures cover one to
three Dispose/Undo pairs followed by sale and preserve every prior payload/link.

Released prerequisite source was promoted by the lead from the Undo owner:
`metal-legacy-disposal-baseline-service.ts`,
`metal-disposed-evidence-service.ts`, `metal-detail-read-model-shaping.ts`, and
`packages/logic/src/metals/lifecycle-reducer.ts`. Those files remain Undo-owned;
Sell owns only its API integration. Include their existing shared proof/reducer
suites in the lead's final combined batch.

Root selection requires exactly one matching group. Non-successful/unknown roots
become incomplete evidence before reduction; rejected roots retain rejected CAS.
Root state/outcome evidence is validated against the authoritative contract, and
full registered envelopes must match event owner/holding/kind/time/payload.
SQLite cases cover pending_local, reconciliation_incomplete, unknown/missing
roots, malformed envelopes, event payload mismatch, invalid
accepted/sync_failed/local outcomes, explicit rejected states and all four valid
successful states. These corrections add no SQL or public UI change.

## Final correction intake from snapshot 9ba3d2a2

The queued Sell command now passes its already-validated
`latestAllowedCalendarDate` into every historical lifecycle-root envelope parse
and serialization check and into restored-legacy original Dispose proof. The
financial-action registry requires an explicit date bound for Add, Sell,
Dispose, and certain correction payloads; omitting the bound incorrectly
classified authentic earlier roots as incomplete. The bound is never replaced
with a permissive parser or skipped validator. Root state/outcome, registered
payload, action/owner/holding identity, event timestamp, predecessor and
reversal links, and the unique owned original Dispose group remain mandatory. An
unsupported persisted metal type is also excluded before sale eligibility; only
Gold and Silver are supported in this feature.

Focused fixture coverage covers the normal Add predecessor, one through three
restored Dispose/Undo pairs, valid four-state roots,
incomplete/missing/malformed roots, and original Dispose validation on/before
the explicitly supplied calendar-day bound. The form test checks actual
accessibility and disabled touch-control state during an in-flight write; the
facade test uses a genuine WatermelonDB database object with a mocked
production-command boundary. The SQLite command integration remains the source
of persistence truth. No change adds account credit, FX acknowledgment,
synthetic lineage, extra terminal snapshots, or a new financial action contract.

## Verification status

Tests authored first for the feature, then implementation. Per explicit user
override no tests/lint/types/format/build/gate/SQL/Maestro execution occurred.
No install, Metro, database execution, Git mutation, push or secret access. See
`manual-tests/us5-sell.md` and `coverage/us5.md` for complete coverage and
manual-only/fixture limitations. Lead owns final pre-push checks and shared
integration with other isolated worktrees.
