# US9 — Live Rates Trust Manual Test Plan

## Scope

Keep `/live-rates` visual composition and its Home entry point. V1 shows Gold,
Silver, and supported fiat currencies only. It does not show Platinum,
Palladium, BTC, holdings, portfolio value, or historical rate substitutions.
Provider source, quality, and per-instrument diagnostic states remain internal;
the production page communicates trust through its Live/neutral header, the
last-updated footer, and actionable offline or refresh-failure messages.

## Data Preconditions

Use a signed-in QA user with local `market_rates` cache plus deterministic
`market_rate_observations` for each displayed instrument. Set device clock
through a controllable fixture/harness; never alter remote data.

## Manual Scenarios

| ID     | Setup                                                                                       | Action                                                   | Expected result                                                                                                                                        | Coverage                         |
| ------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| US9-01 | Gold/Silver/each displayed currency provider observation is at most 24 hours old            | Open Live Rates                                          | Header says Live Rates with a Live badge; Gold, full-width Silver, and currencies render without provider/quality diagnostics                          | Component + manual theme/RTL     |
| US9-02 | Gold observation is older than 24 hours; Silver and currencies are fresh                    | Open Live Rates                                          | Header falls back to Rates without a Live badge; last-updated footer remains visible; no internal stale/source/quality rows render                     | Read-model + component + manual  |
| US9-03 | Silver provider observation is missing, invalid, unparseable, future, or later than capture | Open Live Rates                                          | Header remains neutral; stored/fetched timestamp never makes the page Live; no internal freshness diagnostics render                                   | Logic + read-model + component   |
| US9-04 | A visible rate value is absent, non-positive, or provider quality is not valid              | Open Live Rates                                          | Affected value is unavailable and the page is not marked Live; unrelated valid values remain usable                                                    | Logic + read-model               |
| US9-05 | Cached rates exist; device has no network                                                   | Open Live Rates, then pull to refresh                    | Cached values remain visible; Offline mode is honest; refresh does not clear cache                                                                     | Component + device/manual        |
| US9-06 | Cached rates exist; refresh fails                                                           | Pull to refresh, retry                                   | Cached values remain visible; failure says cached rates remain shown; retry invokes a real sync attempt                                                | Hook + component + device/manual |
| US9-07 | No local cache                                                                              | Open Live Rates while offline                            | Skeleton ends in existing unavailable empty state; pull-to-refresh remains available                                                                   | Component + device/manual        |
| US9-08 | Fresh cache with new observations delivered through local sync                              | Pull to refresh                                          | Refresh control stays active until real local sync resolves; then provider-derived statuses update                                                     | Hook + device/manual             |
| US9-09 | English/Arabic, light/dark, compact phone, tablet, landscape, 200% text                     | Open and search currencies                               | Existing layout hierarchy and search focus remain usable; no overflow; 44px actionable controls remain reachable                                       | Component + manual device        |
| US9-10 | TalkBack/VoiceOver                                                                          | Navigate header, last-updated copy, and refresh controls | Live/neutral state and actionable offline/refresh messages are announced without exposing internal provider metadata; search focus remains predictable | Component + manual device        |

## Manual-only Gaps

- Real provider/network failure timing, platform pull gesture, physical-offline
  behavior, TalkBack/VoiceOver, and rendered compact/tablet/200%-text proof
  require a device or emulator run.
- Deterministic E2E fixtures for per-instrument fresh/stale/unknown/error states
  are owned by Slice 4 fixture registry; this slice must not modify them.
- Translation keys for explicit offline-cache, refreshing, and
  cached-refresh-failure copy are not present at this branch head. Their
  approved wording and localization must land before manual copy verification
  can pass.
