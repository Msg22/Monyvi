# US5 — Record a whole-holding sale

Status: authored; **NOT RUN**. User deferred tests, SQL execution, lint, types,
formatting, builds, Maestro, and other gates until the lead's final pre-push
batch.

## Approved decisions

- Screen 10 and its approved binding are the visual authority. Latest explicit
  decision fixes sale currency to the holding's purchase currency. No selector.
- Only an effective, visible ACTIVE whole holding can be sold. No partial sale.
- Sale date is required, on/after purchase and on/before today. Gross is
  positive. Optional fee is zero through gross inclusive, in that same currency.
  Optional notes are preserved. No implicit rounding of malformed or
  overprecision input.
- Net proceeds = gross − fee. Canonical realized P/L = net − recorded purchase
  cost, in purchase currency. Missing purchase cost means unavailable P/L; never
  invent zero cost, FX, rates, or cash. Same-currency P/L consumes no FX
  reference.
- #242 remains closed: no account credit, account effect, transaction, ordinary
  income, budget, or cash-flow entry. Recording sale does not create tracked
  cash.
- The complete local action, immutable facts/rate evidence, History event, and
  Sold state commit together. Existing lifecycle evidence remains append-only.

## Setup

Use a settled signed-in account with an owned effective ACTIVE Gold holding and
an owned effective ACTIVE Silver holding. For the authored English Maestro
journey, prepare a unique holding named `E2E Sell Coin`, purchase currency EGP,
exact purchase cost 100, purchase date <= today. Record account balance,
ordinary income/budget/cash-flow totals, active metals count/value, and History
counts. Use a second account with a foreign local holding to check owner
isolation. Do not use remote database commands or reset shared data.

## Scenarios

| ID  | User journey / expected result                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | My Metals → active Details → Sell. Whole-holding notice, date, fixed purchase currency, gross, optional fee/notes, live summary, consequences and direct Record sale are visible. No account toggle/picker, rate acknowledgment, partial quantity, second review, or device-save/provider copy.                                                                                                                                                                   |
| S02 | Enter gross 120, fee 5 against EGP purchase cost 100. Net EGP 115.00 and profit EGP 15.00. Record directly → same Sold Details. Back → My Metals; holding is absent from active list/value/count. History Sold contains it once, with recorded date/net/P&L.                                                                                                                                                                                                      |
| S03 | Omit fee/notes: exact fee zero, notes null, no required markers. Fee equal gross: zero net and full-cost loss. Exercise profit/loss/break-even cases.                                                                                                                                                                                                                                                                                                             |
| S04 | Required date empty/invalid, impossible dates, tomorrow, before purchase reject. Purchase date and today inclusive accept. Dismiss native picker: no change.                                                                                                                                                                                                                                                                                                      |
| S05 | Gross zero/negative/exponent/malformed/pasted spaces/overprecision reject inline. Fee negative/overprecision/above gross reject. Raw invalid input remains editable. Supported zero-, two-, and three-decimal currencies honor their minor units.                                                                                                                                                                                                                 |
| S06 | Currency is read-only and accessible. Forged USD proceeds on EGP holding reject in preview, command, and server. Forged purchaseCurrency equal to saleCurrency still fails the existing trusted asset binding.                                                                                                                                                                                                                                                    |
| S07 | Same-currency missing/stale/unknown rates: correct quoted gross/fee/net and canonical P/L remain rate-independent; no acknowledgment UI or implicit acknowledgment. Complete available terminal snapshots preserve raw units/orientation/provenance. Missing snapshots use the permitted empty set; rate-store read failure retains form and offers retry.                                                                                                        |
| S08 | Migrated holding with missing exact cost: show unavailable P/L; valid sale facts can still record. Never use legacy float or zero as purchase cost. Missing/invalid purity or acquisition provenance does not fabricate a breakdown.                                                                                                                                                                                                                              |
| S09 | Rapid double tap / pending submit: one action; editing/cancel/retry/navigation blocked while committing. After success the completed hook cannot submit again.                                                                                                                                                                                                                                                                                                    |
| S10 | Inject local batch failure: root, state, event, references all roll back. Form values survive. Retry uses the identical action ID/hash/payload/time/reference IDs. Retry after ambiguous commit/service recreation replays once; changed payload under the same ID fails.                                                                                                                                                                                         |
| S11 | Two distinct Sell intents for one revision: one wins; the other cannot overwrite it. Reject terminal Sold/Disposed, hidden/incomplete/conflicting lifecycle state, wrong revision or predecessor, and wrong trusted metal/currency. Conflict retry reloads current holding, preserves entered facts, and invalidates obsolete intent.                                                                                                                             |
| S12 | Dirty Cancel/back: custom discard guard; Keep editing preserves input, Discard leaves without writing. Clean Cancel leaves directly. Device hardware back behaves the same.                                                                                                                                                                                                                                                                                       |
| S13 | Auth resolving/signed out: no owned loader/form. Account switch during loading/command preparation or queued writer: foreign rows stay hidden, no foreign writes; detached form neither navigates nor announces success.                                                                                                                                                                                                                                          |
| S14 | Sell with airplane mode established before launch; app process restart: Sold Details, History and immutable P/L remain local, account unchanged. Background sync acceptance/replay/failure/recovery must not duplicate effects or erase evidence.                                                                                                                                                                                                                 |
| S15 | Gold and Silver, portrait/landscape, 320px compact/390px ordinary/tablet, light/dark, English/Arabic RTL, 100%/200% font, keyboard, gesture/3-button bottom bar. Related amount/currency controls stay in a row where the shared breakpoint allows. Footer and discard guard include bottom inset. Screen-reader required/optional/locked currency/pending/error semantics are understandable.                                                                    |
| S16 | Account balance/revision and ordinary transaction/income/budget/cash-flow totals unchanged. Active metals wealth is removed once. No replacement tracked cash appears. Sale date and P/L remain stable when live rates/preferred currency change.                                                                                                                                                                                                                 |
| S17 | Cairo local-midnight purchase (UTC timestamp on the preceding day) keeps its local calendar date in the Sell form and queued writer. The preceding calendar date rejects; purchase day accepts. Legacy UTC-midnight stored dates keep their original UTC calendar day even if local components differ.                                                                                                                                                            |
| S18 | Migrated holding with a proved original owned Dispose revision 0→1: Restore → Sell succeeds; repeat Dispose → Restore twice/three times before Sell. History preserves every prior event and immutable links; new sale increments the current revision once. Missing/malformed original Dispose group proof must block sale, never synthesize an acquisition event.                                                                                               |
| S19 | Apparently ACTIVE SQLite projection with pending_local, reconciliation_incomplete, unknown, missing, malformed, or mismatched predecessor root rejects without appending sale/evidence or changing state. Accepted root without outcome, sync_failed without stable code, and local_complete with outcome reject. Explicit rejected_compensating/reconciled roots remain rejected; complete local_complete/sync_pending/sync_failed/accepted roots remain usable. |

## Execution boundary

Run deterministic suites and the focused SQL test only in the lead's authorized
final batch. SQL requires an explicit local disposable database or rollback
test; `npm run db:migrate` can push remotely and must not be used for this
verification. The new Maestro flow uses real UI and a named holding
prerequisite, with no invented UUID/private fixture endpoint or missing setup
helper. Runner-controlled airplane mode, physical process kill/recovery,
two-device races, live-provider sync, screen-reader, and visual approval
comparisons remain separate device/manual evidence. None has been executed or
claimed passing here.
