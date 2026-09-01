# US9 — Rate Trust Coverage

## Requirement Mapping

| Contract | Automated coverage | Manual coverage | Status |
| --- | --- | --- | --- |
| Provider observation time is sole freshness source; stale only after 24h | `packages/logic/src/metals/__tests__/rate-reference-contract.test.ts` | US9-01–US9-04 | Green: 34 tests |
| Gold, Silver, and FX trust is independent, including empty local cache | `apps/mobile/__tests__/services/live-rates-trust-read-model-service.test.ts` | US9-02–US9-04 | Green: 6 tests |
| Gold/Silver/currency scope; no Platinum/BTC; retained layout | `apps/mobile/__tests__/components/live-rates/LiveRatesScreen.metals-v1.test.tsx` | US9-01, US9-09 | Green: screen assertions |
| Skeleton, empty, cached-offline, refresh, error-with-cache, retry | `apps/mobile/__tests__/components/live-rates/LiveRatesScreen.metals-v1.test.tsx` and hook tests | US9-05–US9-08 | Partial: Skeleton/offline cache green; read-only refresh API, cached-refresh error UI, and retry pending Slice 4 API/localization handoff |
| RTL/theme/reflow/focus/a11y | `apps/mobile/__tests__/components/live-rates/LiveRatesScreen.metals-v1.test.tsx` | US9-09–US9-10 | Partial: focus and theme-token assertions green; rendered devices/assistive tech manual-only |
| Fresh/stale/offline/failure/missing full journey | `apps/mobile/e2e/maestro/metals/live-rates-trust.yaml` | US9-01–US9-08 | Blocked by Slice 4 fixtures |

## Current Limits

- No remote database mutation.
- Fixture registry and translations are outside this slice ownership.
- Device rendering, physical offline, assistive technology, and exact translated copy remain manual-only until an Android/iOS harness and approved localization integration are available.
