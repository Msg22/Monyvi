# US9 Red Evidence

Recorded on 2026-09-01 against base `47d6fc3` before US9 production changes.

## Commands

```text
npm test -w @monyvi/mobile -- --runInBand --watchman=false __tests__/services/live-rates-trust-read-model-service.test.ts __tests__/components/live-rates/LiveRatesScreen.metals-v1.test.tsx
```

The first invocation without `--watchman=false` could not start because local
Watchman exited; the repeat disabled file watching only.

## Intended Failures

- `live-rates-trust-read-model-service` module did not exist.
- Existing Live Rates rendered Platinum even though Metals V1 permits Gold and
  Silver only.
- Existing screen had no independent Gold/Silver/currency provider-observation
  trust output.
- Existing cached offline screen omitted honest offline-cache state.

## Red Gate Notes

- T060 contract tests already had prior Slice 4 rate-reference coverage; the
  added historical/current separation assertion is a regression guard and was
  Green because `classifyRateTrust` already had the approved implementation.
- A later read-model regression test first failed as intended: an empty trust
  aggregate was incorrectly reported as `fresh` rather than `missing`. The
  minimal Green change records whether the iterable contained any result.
- T062 was authored but cannot run the required state transitions until Slice 4
  supplies its deterministic fixtures and read-only refresh control.
