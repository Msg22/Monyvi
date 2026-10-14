# Issue #355 — Manual QA plan

Execution status: **NOT RUN**. Use a disposable authenticated test account and
record exact commit/build/device/network/locale for each result.

| Scenario                | Steps                                                                                                    | Expected                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Same-day Add evidence   | With a purchase date matching both real Add-time provider observations in Africa/Cairo, add Gold/Silver. | Resolver may use qualifying observation pair; no daily/current relabeling.                                                                                         |
| Midnight boundary       | Exercise timestamps immediately before/after Cairo calendar midnight, including DST-era dates.           | Qualification follows IANA Africa/Cairo, never device timezone or fixed offset.                                                                                    |
| Backdated Gold          | Enter a historical date with an exact provider row.                                                      | Daily exact-date pair is cached and available; no nearest-day fallback.                                                                                            |
| Backdated Silver        | Repeat for Silver.                                                                                       | Same exact-date behavior and Silver rate.                                                                                                                          |
| Historical Gold 24K/999 | Use a known historical pure-metal fixture.                                                               | Historical display/Add estimate uses the quoted 24K gram rate directly; persisted `gold-999 / 0.999` evidence and existing FR-050/P&L accounting remain unchanged. |
| EGP available           | Provider fixture/live validation contains exact-date EGP.                                                | Historical EGP per-gram value and Add estimate use that same dated metal+FX record.                                                                                |
| EGP absent              | Exact-date record has metals but no EGP.                                                                 | EGP history is unavailable; manual Purchase Price stays usable; no current FX substitution.                                                                        |
| USD                     | Exact-date USD purchase.                                                                                 | USD factor is identity 1.                                                                                                                                          |
| Other currency          | Repeat with one supported ISO currency.                                                                  | Metal and FX come from the same dated response.                                                                                                                    |
| Add auto estimate       | Leave Purchase Price untouched; enter date/metal/weight/karat/currency with verified history.            | Total Purchase Price is estimated once using full-precision history then field precision.                                                                          |
| Estimate recompute      | Before touching Purchase Price, change weight/karat/date/currency.                                       | Owned estimate recomputes; stale estimate is not retained.                                                                                                         |
| Manual override         | Edit estimated Purchase Price. Then change other estimate inputs.                                        | User value is never overwritten.                                                                                                                                   |
| Manual clear            | Clear estimated Purchase Price manually, then change weight/date/karat.                                  | Empty field remains manual; estimate never returns automatically.                                                                                                  |
| Missing history         | Use unavailable date/offline cache miss/provider failure.                                                | Manual entry remains available; no fabricated estimate.                                                                                                            |
| Edit                    | Edit weight/karat on existing holding.                                                                   | Recorded paid amount stays unchanged unless user explicitly edits Purchase Price.                                                                                  |
| Cache restart           | Fetch a valid exact date, terminate/restart offline, reopen same historical need.                        | Cached owner-scoped record remains usable.                                                                                                                         |
| Account switch          | Populate cache under user A, sign into B.                                                                | B never sees or uses A's cache.                                                                                                                                    |
| Retry                   | Fail network fetch, then restore network and retry.                                                      | Failure is explicit; valid cache is retained; retry can fill missing exact date.                                                                                   |
| Details                 | After approved UI integration, view historical reference next to Paid.                                   | Historical market reference remains visually distinct from paid cost; no provider/source/trust UI.                                                                 |
| Accessibility/visual    | EN/AR, RTL, light/dark, compact, tablet/landscape, 200% text, TalkBack/VoiceOver.                        | Must match the later approved binding delta and remain readable/reachable.                                                                                         |

The final visual/accessibility rows are owner-deferred until the lead supplies
the approved #355 binding delta; source/tests are not rendered proof.

## E2E scenario descriptions — NOT RUN

### HIST-ADD-001 — verified 24K estimate and permanent manual override

1. Sign in with a disposable test account and open Add Holding.
2. Select Gold 24K / `gold-999`, a purchase date with verified exact-date
   history, a supported purchase currency, and enter weight `10`.
3. Confirm the automatic Purchase Price uses the quoted 24K rate directly rather
   than multiplying by stored `0.999`.
4. Confirm the helper includes the selected-karat historical rate in the
   purchase currency, formatted to two decimals, for example: **Estimated from
   the purchase-date market rate of EGP 7,066.57/g. You can change it to what
   you paid.** The calculation retains full precision; the displayed rate is
   rounded.
5. Manually replace the estimate, then change weight/karat/date and confirm the
   manual value is never overwritten.
6. Repeat by manually clearing Purchase Price; confirm it stays empty after
   later estimate-input changes.
7. Save and reopen; the stored purity remains `gold-999 / 0.999` and the paid
   amount equals the user's final value.

### HIST-ADD-002 — unavailable exact date

1. Use a fixture/date/currency with no exact historical pair, including the live
   EGP gap if still present.
2. Confirm no current/nearest-day estimate appears.
3. Confirm manual Purchase Price remains editable and the estimate helper is not
   displayed.

### HIST-DETAIL-001 — current acquisition action history

1. Open a holding whose current acquisition projection points to an accepted
   action with matching acquisition metal/FX references.
2. Confirm **Market rate on purchase date** appears beside Date/Paid with the
   selected-purity amount per gram.
3. Correct acquisition material facts in an approved fixture so the current
   acquisition action changes.
4. Reopen Details and confirm the row follows only the new current acquisition
   action; old action references are not reused.
5. Confirm no provider/source/trust/freshness metadata appears.

### HIST-DETAIL-002 — cache/restart/offline

1. Resolve an exact purchase-date rate online and confirm it is cached locally.
2. Terminate and relaunch offline.
3. Reopen Details and confirm the same historical fact remains available from
   the owner-scoped cache.
4. Switch accounts and confirm another user cannot see or consume the cached
   rate row.

### HIST-DETAIL-003 — unavailable history

1. Open a holding with valid purchase facts but no qualifying action pair and no
   exact daily rate.
2. Confirm the Market-rate row remains present with the existing unavailable
   copy.
3. Confirm Paid, Date, holding facts and existing FR-050/P&L behavior remain
   unchanged.

Device/visual/accessibility execution remains deferred to the local final QA
batch; these scenario descriptions are not execution evidence.

## Focused regression check — 2026-10-14

- On a fresh Add form with no historical cache row, select 10 October 2026, Gold
  24K, 10 g, EGP, leaving Purchase Price untouched. Confirm the first cache
  write succeeds, the amount fills automatically, and the helper shows the rate
  used.
- Repeat with 21K: the helper and estimate must both use the adjusted 21K rate.
- Edit or clear Purchase Price: manual ownership must remain permanent for that
  form session, and the automatic-estimate helper must disappear.
- Stop/reopen offline after a successful fetch: confirm the saved rate can be
  reused without assigning the cache creation timestamp again.
- A missing endpoint or malformed HTTP 404 is a fetch failure; only an explicit
  `date_unavailable` response represents absent historical prices.

Mohamed confirmed automatic filling on his physical device after the read-only
`createdAt` assignment was removed. Helper-copy changes and the remaining
regression scenarios require their own validation; this is not full-plan
signoff.
