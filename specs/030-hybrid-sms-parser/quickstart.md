# Quickstart: Trusted Hybrid SMS Parser

## Prerequisites

- Work on `codex/hybrid-local-first-sms-parser-752`.
- Use the existing root dependency tree; do not install packages in a secondary
  worktree.
- Keep Phase 2A candidate artifacts separate from production runtime imports.

## TDD sequence

1. Add the smallest failing tests for the current task.
2. Run the targeted suite and confirm the expected failure.
3. Implement the minimum behavior.
4. Run the targeted suite until green, then refactor.
5. Run adjacent parser, scan, live SMS, review, privacy, type, lint, and i18n
   checks before moving to the next boundary.

## Targeted verification areas

- Trusted catalog promotion and runtime isolation.
- Exact positive, near-match, negative, multiple-match, disabled, malformed, and
  rejection outcomes.
- Mixed local/AI routing with AI receiving only unresolved fingerprints.
- AI partial chunk failure and unresolved-only retry.
- Cancellation before/during local and AI work.
- Batch, foreground live, background native, killed-app/headless behavior.
- Fingerprint deduplication and review-only local suggestions.
- Approved partial-results notice in light and dark themes.
- Privacy-safe source and log scanning.

## Commands

```powershell
npm run qa-sms:validate-trusted
npm run test:qa-sms-promotion
npm run test:qa-sms-privacy-check
npm run qa-sms:privacy-check
npm run qa-sms:benchmark-trusted
npm test -w @monyvi/mobile -- --runInBand sms-parser-orchestrator sms-parser-hybrid-fixture.integration ai-sms-parser-service sms-sync-service sms-live-processor sms-review-retry-service sms-review-save-service transaction-review-selection batch-create-transactions sms-live-detection-handler sms-headless-task SmsScanContext useSmsReviewRetry useTransactionReviewState PartialSmsResultsNotice e2e-test-config sms-reader-service ai-sms-fixture-parser start-e2e-fixture run-sms-sync-journeys apps/mobile/__tests__/app/sms-review.test.tsx
npm run typecheck -w @monyvi/logic
npx tsc -p apps/mobile/tsconfig.json --noEmit
npm run i18n:check -w @monyvi/mobile
```

### Deterministic hybrid Maestro journey

Start Metro in a dedicated terminal with the E2E-only hybrid harness:

```powershell
npm run mobile:e2e-hybrid-fixture
```

Then run the hybrid SMS journey from another terminal:

```powershell
npm run e2e:sms-sync:hybrid-fixture
```

This mode uses the real trusted-catalog partition and merge logic, a synthetic
fixture inbox, and fixture AI only for unresolved candidates. The journey proves
one exact trusted local match, one AI fallback result, one retryable AI failure,
preserved partial results, and unresolved-only retry. It deliberately uses one
Maestro attempt so an app-flow failure is surfaced rather than hidden by a
retry. `hybrid-fixture` is accepted only in explicit non-production E2E mode and
is not a production or normal-development parser option.

The benchmark prints only catalog version, aggregate counts, elapsed time, the
one-second budget, and pass/fail. It never prints message or extracted values.

## Operations and rollback

- Promote only an explicitly approved Phase 2A candidate, then run promotion,
  catalog validation, privacy, and benchmark commands before committing.
- Disable one template by adding its stable pattern ID to
  `TRUSTED_SMS_DISABLED_PATTERN_IDS` in the promotion manifest, then regenerate
  and validate the catalog. The candidate must then route to AI; unrelated
  active templates must continue locally.
- Set `EXPO_PUBLIC_HYBRID_SMS_PARSER_ENABLED=false` in a staged build to route
  all candidates through the existing AI parser without changing fixture or
  development-local modes.
- Roll back a faulty OTA/app update to the prior valid Expo update. If a current
  bundled catalog fails runtime validation, activation fails closed and all
  affected candidates route to AI under the existing consent gate.
- A future signed remote activation manifest should implement the existing
  catalog-provider boundary and cache the last valid manifest for offline use.
  It must not change pattern identities, matching rules, provenance, or result
  contracts.

See `docs/development/sms-parser.md` for the complete operator runbook.

## Manual QA outline

1. Scan a mixed trusted/unknown fixture set with AI available; verify both
   result types appear once and only unknown messages reach AI diagnostics.
2. Disable network; verify trusted matches remain reviewable.
3. Force AI failure in a mixed batch; verify local results remain and the inline
   notice matches the approved second mockup image in both themes.
4. Retry; verify only unresolved messages run, existing edits remain, count
   updates, and the notice disappears at zero.
5. Disable a trusted pattern; verify its messages use AI instead of
   disappearing.
6. Revoke AI feature consent; verify the existing consent gate still blocks the
   feature.
7. Repeat one SMS through batch/live delivery; verify one saved financial
   record.

Background native delivery, killed-app HeadlessJS, notification confirmation,
and physical permission revocation are physical-device manual-only. Maestro CI
cannot reliably drive those OS states, so they must not be reported as automated
coverage. Deterministic foreground fixture journeys remain suitable for scan,
review, retry, and duplicate-delivery checks.

The hybrid fixture journey covers mixed routing and partial retry. Cancellation
and the global kill switch are deterministic service tests because fixture work
completes too quickly for an honest UI cancellation race and changing the
build-time kill switch requires a Metro restart. Consent revocation is retained
as a settings/manual journey. Existing SMS sync and live-SMS journeys retain
duplicate-delivery coverage; background and killed-app delivery remain physical
device only.

## Coverage matrix

| Scenario                                             | Automated evidence                            | Manual evidence             |
| ---------------------------------------------------- | --------------------------------------------- | --------------------------- |
| Exact trusted local match and trusted rejection      | Matcher/parser Jest suites                    | Offline scan                |
| Mixed local and AI routing                           | Orchestrator/scan Jest; Maestro not run (ANR) | Mixed physical-device scan  |
| Partial AI result and unresolved-only retry          | AI/retry Jest; Maestro not run (ANR)          | Inline notice and retry     |
| Consent and global disablement                       | Orchestrator Jest suite                       | Settings consent revocation |
| Review-only validation and fingerprint deduplication | Review/save/live/headless service Jest suites | Repeated batch/live SMS     |
| Light/dark notice structure                          | Component Jest suite                          | Screenshot comparison open  |
| Background and killed-app delivery                   | Existing service/headless unit coverage       | Physical device only        |

## Required PR evidence

- Catalog/version and promoted pattern IDs, without payload values.
- Targeted test output and privacy checks.
- 1,000-candidate local-routing benchmark.
- Coverage matrix mapping manual scenarios to unit/integration/E2E/manual-only.
- Light and dark screenshots compared with the approved structural mockup.

## Latest validation evidence

- Catalog promotion, activation, privacy, and all 22 promoted-pattern staged
  checks passed on 2026-07-16.
- The 1,000-candidate trusted matcher benchmark completed in 470.87 ms against
  the 1,000 ms budget on the development machine.
- The focused mobile regression run passed 21 suites and 199 tests, including
  scan, live/background/headless processing, review, retry, save validation, and
  fingerprint deduplication.
- Logic/mobile TypeScript, i18n, changed-file ESLint, formatting, and diff
  checks passed.
- The deterministic Maestro run was attempted against a dedicated hybrid Metro
  harness on port 8082, but the emulator entered Android system and app ANR
  states before Maestro could begin. T048, T066, and T067 therefore remain
  unchecked and must be completed on a healthy emulator or physical device; this
  run is not claimed as passed E2E or visual evidence.
