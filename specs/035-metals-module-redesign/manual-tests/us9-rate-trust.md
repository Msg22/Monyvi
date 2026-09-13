# US9 — Live Rates Trust Manual Test Plan

## Scope

Keep `/live-rates` visual composition and its Home entry point. V1 shows Gold,
Silver, and supported fiat currencies only. It does not show Platinum,
Palladium, BTC, holdings, portfolio value, or historical rate substitutions.

## Data Preconditions

Use a signed-in QA user with local `market_rates` cache plus deterministic
`market_rate_observations` for each displayed instrument. Set device clock
through a controllable fixture/harness; never alter remote data.

## Manual Scenarios

| ID     | Setup                                                                                       | Action                                | Expected result                                                                                                  | Coverage                         |
| ------ | ------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| US9-01 | Gold/Silver/each displayed currency provider observation is at most 24 hours old            | Open Live Rates                       | Existing screen composition remains; Gold, Silver, and Currencies each report Current                            | Component + manual theme/RTL     |
| US9-02 | Gold observation is older than 24 hours; Silver and currencies are fresh                    | Open Live Rates                       | Gold reports Stale while Silver/currency status remains Current                                                  | Read-model + manual              |
| US9-03 | Silver provider observation is missing, invalid, unparseable, future, or later than capture | Open Live Rates                       | Silver reports Freshness unknown; stored/fetched timestamp never makes it Current                                | Logic + read-model               |
| US9-04 | A visible rate value is absent, non-positive, or provider quality is not valid              | Open Live Rates                       | Relevant status reports Rate unavailable; unrelated rate statuses remain independent                             | Logic + read-model               |
| US9-05 | Cached rates exist; device has no network                                                   | Open Live Rates, then pull to refresh | Cached values remain visible; Offline mode is honest; refresh does not clear cache                               | Component + device/manual        |
| US9-06 | Cached rates exist; refresh fails                                                           | Pull to refresh, retry                | Cached values remain visible; failure says cached rates remain shown; retry invokes a real sync attempt          | Hook + component + device/manual |
| US9-07 | No local cache                                                                              | Open Live Rates while offline         | Skeleton ends in existing unavailable empty state; pull-to-refresh remains available                             | Component + device/manual        |
| US9-08 | Fresh cache with new observations delivered through local sync                              | Pull to refresh                       | Refresh control stays active until real local sync resolves; then provider-derived statuses update               | Hook + device/manual             |
| US9-09 | English/Arabic, light/dark, compact phone, tablet, landscape, 200% text                     | Open and search currencies            | Existing layout hierarchy and search focus remain usable; no overflow; 44px actionable controls remain reachable | Component + manual device        |
| US9-10 | TalkBack/VoiceOver                                                                          | Navigate status and refresh controls  | Rate status is announced without relying only on color; search focus remains predictable                         | Component + manual device        |

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
