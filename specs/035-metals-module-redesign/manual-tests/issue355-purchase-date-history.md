# Issue #355 — Manual QA plan

Execution status: **NOT RUN**. Use a disposable authenticated test account and record exact commit/build/device/network/locale for each result.

| Scenario | Steps | Expected |
| --- | --- | --- |
| Same-day Add evidence | With a purchase date matching both real Add-time provider observations in Africa/Cairo, add Gold/Silver. | Resolver may use qualifying observation pair; no daily/current relabeling. |
| Midnight boundary | Exercise timestamps immediately before/after Cairo calendar midnight, including DST-era dates. | Qualification follows IANA Africa/Cairo, never device timezone or fixed offset. |
| Backdated Gold | Enter a historical date with an exact provider row. | Daily exact-date pair is cached and available; no nearest-day fallback. |
| Backdated Silver | Repeat for Silver. | Same exact-date behavior and Silver rate. |
| Historical Gold 24K/999 | Use a known historical pure-metal fixture. | Historical selected-purity rate uses stored `0.999`; current displayed 24K/current value remains unchanged. |
| EGP available | Provider fixture/live validation contains exact-date EGP. | Historical EGP per-gram value and Add estimate use that same dated metal+FX record. |
| EGP absent | Exact-date record has metals but no EGP. | EGP history is unavailable; manual Purchase Price stays usable; no current FX substitution. |
| USD | Exact-date USD purchase. | USD factor is identity 1. |
| Other currency | Repeat with one supported ISO currency. | Metal and FX come from the same dated response. |
| Add auto estimate | Leave Purchase Price untouched; enter date/metal/weight/karat/currency with verified history. | Total Purchase Price is estimated once using full-precision history then field precision. |
| Estimate recompute | Before touching Purchase Price, change weight/karat/date/currency. | Owned estimate recomputes; stale estimate is not retained. |
| Manual override | Edit estimated Purchase Price. Then change other estimate inputs. | User value is never overwritten. |
| Manual clear | Clear estimated Purchase Price manually, then change weight/date/karat. | Empty field remains manual; estimate never returns automatically. |
| Missing history | Use unavailable date/offline cache miss/provider failure. | Manual entry remains available; no fabricated estimate. |
| Edit | Edit weight/karat on existing holding. | Recorded paid amount stays unchanged unless user explicitly edits Purchase Price. |
| Cache restart | Fetch a valid exact date, terminate/restart offline, reopen same historical need. | Cached owner-scoped record remains usable. |
| Account switch | Populate cache under user A, sign into B. | B never sees or uses A's cache. |
| Retry | Fail network fetch, then restore network and retry. | Failure is explicit; valid cache is retained; retry can fill missing exact date. |
| Details | After approved UI integration, view historical reference next to Paid. | Historical market reference remains visually distinct from paid cost; no provider/source/trust UI. |
| Accessibility/visual | EN/AR, RTL, light/dark, compact, tablet/landscape, 200% text, TalkBack/VoiceOver. | Must match the later approved binding delta and remain readable/reachable. |

The final visual/accessibility rows are owner-deferred until the lead supplies the approved #355 binding delta; source/tests are not rendered proof.
