# Quickstart: Trusted QA SMS Pattern Intake

This document describes the target developer and QA workflow after Phase 2A is
implemented. It intentionally contains no real SMS body, sender history, amount,
account data, or exported artifact.

## Prerequisites

- Android development build connected to the local workspace.
- Local Supabase and the manual QA account available for the private route.
- SMS permission may begin requestable, denied, blocked, or revoked; the tool
  must reuse Monyvi's existing explanatory/recovery flow.
- `EXPO_PUBLIC_ENABLE_QA_SMS_PATTERN_INTAKE=true` set only for this session.
- Approved mockups available under `mockups/` and treated as the structural UX
  reference.

## Start The QA Tool Build

The implementation provides a descriptive wrapper command that starts the
existing local-Supabase wireless-device flow with the QA intake flag enabled:

```powershell
npm run mobile:dev:qa-sms-pattern-intake:wireless-device
```

This command must not enable E2E fixture mode, local-parser runtime mode, or a
production build.

After Metro is ready, open the guarded route with:

```powershell
npm run mobile:dev:qa-sms-pattern-intake:open
```

## Manual Intake Flow

1. Sign in to the local development app.
2. Open the dev-only QA SMS Pattern Intake route.
3. Read and accept the bounded authorization statement.
4. Load the bounded QNB inbox view.
5. Select only messages intentionally authorized for template research.
6. Review each sanitized candidate.
7. Open Classify message and explicitly confirm one of the nine message families
   plus EGP, USD, or Not applicable. Do not infer this classification from raw
   SMS wording.
8. Correct only placeholder boundaries or placeholder types when required.
9. Resolve every blocking privacy finding and revalidate.
10. Approve safe candidates.
11. Review family/currency coverage and explicitly mark unavailable
    combinations.
12. Export the approved bundle to a local directory through Android's document
    picker.
13. Inspect the JSON file before manually moving it into
    `.local/qa-sms-intake/`.
14. Run candidate import dry-run, privacy, and governance validation from that
    ignored staging directory before adding validated output to source control.

After the approved host-ingestion amendment is implemented, steps 13-14 become
one explicit repository command after transferring the file to the PC:

```powershell
npm run qa-sms:ingest -- "<path-to-exported-json>"
```

The command validates before staging, then performs dry-run validation, atomic
catalog/manifest import, and repository privacy/governance checks. The Android
app still cannot write the PC repository or transfer the artifact automatically.

Never paste raw SMS into a terminal, issue, PR, chat, fixture, test snapshot, or
source file.

## Visual QA Reference

- [Authorization and selection](mockups/qa-sms-intake-authorization-selection-v2.png)
- [Provider-neutral authorization and empty selection](mockups/qa-sms-intake-empty-state-v3.png)
- [Review, coverage, and export](mockups/qa-sms-intake-review-coverage-export-v2.png)
- [Filters, correction, and coverage editing](mockups/qa-sms-intake-edit-filter-coverage.png)
- [Message classification sheet](mockups/qa-sms-intake-classification-sheet.png)
- [Selection loading and bulk-selection amendment](mockups/qa-sms-intake-selection-loading-amendment.png)
- [ATM terminal placeholder amendment](mockups/qa-sms-intake-atm-terminal-placeholder.png)
- [Bulk pending-coverage action](mockups/qa-sms-intake-bulk-unavailable.png)

Verify the five states and classification sheet in light and dark mode. Match
structure, hierarchy, density, placeholder tokens, status rows, and sticky
actions while retaining Monyvi theme colors, `PageHeader`, safe areas, and
existing component behavior. Illustrative mockup counts and dates are not fixed
requirements.

The amendment requires the loaded/selected counter, newest-50 action, stable
row-shaped skeletons, fully visible provider name, and footer to retain the same
position in loaded and loading states.

## Verification Commands

```powershell
npm test -w @monyvi/logic -- qa-sms
npm test -w @monyvi/mobile -- qa-sms
npm run lint
npm run typecheck -w @monyvi/logic
npx tsc -p apps/mobile/tsconfig.json --noEmit
npm run i18n:check -w @monyvi/mobile
npm run verify
npm run test:qa-sms-import-command
```

## Implementation Verification Log

### Foundational red phase - 2026-07-13

- Artifact-schema and privacy tests failed because their modules did not yet
  exist.
- Runtime availability tests failed because the guarded mobile config did not
  yet exist.
- Runtime isolation initially exposed an over-broad assertion about
  `autoSelectPolicy: never`; that assertion was corrected to protect the actual
  candidate import, identifier, and runtime-scope invariants.
- The existing active parser already passed the candidate-import isolation check
  before implementation.

### Foundational green phase - 2026-07-13

- `npm test -w @monyvi/logic -- --runInBand qa-sms-artifact-schema.test.ts qa-sms-privacy-validator.test.ts qa-sms-candidate-runtime-isolation.test.ts`
  passed 28 assertions.
- `npm test -w @monyvi/mobile -- --runInBand qa-sms-pattern-intake-config.test.ts`
  passed 5 assertions.
- `npm run typecheck -w @monyvi/logic` passed.
- Guarded command, package JSON, ignored staging, and `git diff --check` smoke
  verification passed.

The complete internal operator journey is manual-only. Deterministic logic,
service, hook, route, and component branches remain automated; the real QNB
inbox and Android directory picker must be listed explicitly in the PR QA
matrix.

### User-story red phases - 2026-07-13

- Sanitizer, evidence-domain, intake/export service, hook, route, and component
  suites initially failed against missing modules or missing lifecycle behavior.
- Family builder, staging importer, CLI, evaluator, coverage, and governance
  suites initially failed against missing contracts and transitions.
- Production implementation was added only after each focused red suite
  described the intended boundary.

### Complete automated verification - 2026-07-13

- `npm test -w @monyvi/logic -- --runInBand` passed 37 suites and 550 tests.
- The focused mobile QA intake command passed 8 suites and 48 tests.
- Adjacent SMS sync, parser orchestrator, foreground/background/headless live
  SMS, fingerprint deduplication, and batch-create regression command passed 7
  suites and 82 tests.
- `npm run typecheck -w @monyvi/logic` and
  `npx tsc --noEmit -p apps/mobile/tsconfig.json` passed.
- `npm run i18n:check -w @monyvi/mobile` passed English/Arabic parity, language
  sanity, and hardcoded-copy checks.
- `npm run verify` passed 10 privacy-scanner tests and the repository privacy
  scan, including stale bundle-digest rejection.
- `npm run lint` passed with 0 errors. It reported 221 existing repository
  warnings, with no new Phase 2A lint errors.
- `npm ls --depth=0 --json` passed, confirming the repaired workspace dependency
  tree is healthy.

### Native and visual verification status - 2026-07-13

- Component tests cover the approved authorization, selection, review,
  classification, grouped coverage, export, loading, safe-area, and light/dark
  structures. A final rendered-device comparison against all four mockups is
  still manual-only until ADB/device access is restored.
- Real QNB inbox intake, SMS permission recovery on a physical device, evidence
  secret-loss recovery, Android folder-picker cancellation/success, exported
  JSON inspection, and real candidate import remain manual-only by design.

### Physical-device intake remediation - 2026-07-13

- Physical QA confirmed the real sender alias is `QNB EGYPT`. The previous
  implementation queried only `QNB`, so Android filtered out the real messages
  before the service's alias validator could inspect them.
- The intake now queries only the verified aliases `QNB`, `QNB EGYPT`, and
  `QNB ALAHLI`, validates every returned sender against the same allowlist,
  merges duplicates by native message ID, sorts newest first, and applies one
  global 3,000-message cap. It does not scan arbitrary inbox senders.
- Authorization copy is provider-neutral, while the selection state identifies
  the current verified provider. A zero-result state now explains the outcome
  and retries the same bounded query without requiring a new authorization.
- The shared review-header variant now applies the Android top inset exactly
  once. The provider-neutral and empty-state amendment mockup was approved on
  2026-07-13.
- Focused service, hook, route, selection, shared-header, and export suites
  passed 39 tests. SMS reader, parser-orchestrator, and SMS-sync regressions
  passed 48 tests. All 566 logic tests, five import-command tests, 11
  privacy-scanner tests, the repository privacy scan, mobile and logic
  TypeScript, changed-file ESLint, i18n parity, and `git diff --check` passed.
- All ten unresolved PR review findings were validated as applicable and fixed:
  verified aliases, scoped and complete coverage declarations, safe selected
  token styling, meridiem-time sanitization, pre-read staging enforcement,
  post-approval raw-state cleanup, evidence-preserving manifest merges,
  evidence-backed currency evaluation, and rollback-capable atomic import
  publication. Each behavior has focused regression coverage.
- The isolated E2E device-loader test now documents and narrowly suppresses its
  intentional post-mock CommonJS load, removing the branch-level mobile lint
  blocker without changing the E2E runner.
- Physical-device retesting of the `QNB EGYPT` result list, empty state, retry,
  and status-bar spacing remains required before closing T069 and T070.

### Approved selection amendment verification - 2026-07-14

- The approved selection/loading amendment is implemented with five row-shaped
  skeletons, stable footer geometry, the full `QNB EGYPT` provider label,
  loaded/selected counts, and filtered `Select newest 50` behavior.
- Filter and classification sheets dismiss on backdrop press and Android back,
  and all Phase 2A bottom sheets/fixed action regions use shared scoped
  safe-area primitives. The app-wide migration is tracked in GitHub issue #755.
- Blocked candidates show privacy-safe validation findings and can be corrected
  or discarded from the in-memory workflow without modifying device SMS data.
  The unified header navigates to the prior internal step before leaving the
  route, and disabled pagination controls use disabled styling.
- Sequential non-overlapping placeholder corrections accumulate across repeated
  correction sessions. Re-editing one raw range replaces only that correction,
  while ambiguous partial overlaps are rejected. The correction header and
  candidate actions use the Phase 2A top/bottom safe-area primitives.
- The 15 focused and adjacent mobile suites passed 147 tests. Full mobile lint,
  mobile TypeScript, i18n parity, and the repository QA SMS privacy scan passed.
- A final physical-device comparison against the amendment mockup and Android
  navigation-bar verification remain manual-only and have not been claimed as
  passed.

### Internal-flow automation decision - 2026-07-14

- The dedicated Phase 2A Maestro flow and its package commands were removed by
  product decision. This guarded route is an internal development tool, and its
  device/bootstrap sensitivity imposed more maintenance cost than protection.
- Logic, service, hook, route, component, privacy, and adjacent SMS regression
  suites remain the automated safety net.
- The complete authorization-to-export operator journey is verified manually on
  a physical Android device, including the real inbox and document picker.

## Manual-To-Automated Coverage Matrix

| Scenario                                                                     | Automated coverage                                     | Remaining manual evidence                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Runtime guard hides tool outside flagged Android development                 | Config and route Jest tests                            | Confirm release/non-Android build when available |
| Explicit authorization before inbox read                                     | Service, hook, component, and route Jest tests         | Physical-device confirmation                     |
| Permission denied, blocked, revoked, and settings recovery                   | Service/hook Jest branches                             | Native Android permission dialogs                |
| Verified QNB aliases merge/dedupe/sort with one 3,000-message cap            | Service Jest tests                                     | Real `QNB EGYPT` inbox sample                    |
| Empty verified-provider result and same-scope retry                          | Hook, component, and route Jest tests                  | Physical-device empty/retry interaction          |
| Explicit selection bounded to 50                                             | Service and benchmark Jest tests                       | Real QNB inbox sample                            |
| Review-style header respects Android's top inset exactly once                | Shared `PageHeader` component test                     | Physical-device status-bar comparison            |
| Literal currency and selected/unselected filtering                           | Component Jest tests                                   | Light/dark device interaction                    |
| Sanitization, cumulative corrections, invalidation, revalidation, approval   | Logic, service, hook, route, and component Jest tests  | Inspect a real selected message locally          |
| Strict family/currency classification without AI inference                   | Classification and flow Jest tests                     | Operator classifies real samples                 |
| Grouped coverage with independent editable scopes                            | Coverage logic/component/hook Jest tests               | Compact-device scroll and editor check           |
| Export final validation, digest, cancellation, and partial cleanup           | Bundle and export-service Jest tests                   | Android Storage Access Framework picker          |
| Staging-only import, privacy revalidation, duplicate rejection, atomic write | Importer and CLI tests                                 | Inspect manually transferred sanitized JSON      |
| Family grouping, version invalidation, and immutable history                 | Logic governance/family tests                          | Human review record for real family              |
| Candidate isolation from active parser and auto-selection                    | Static isolation and adjacent parser regression suites | None beyond PR review                            |
| Complete internal operator journey                                           | Deterministic route/component integration coverage     | Physical-device end-to-end walkthrough           |

## Privacy Validation Checklist

- Export contains only approved artifact schema keys.
- No raw body, raw sender, device message ID, app SMS fingerprint, amount,
  balance, account/card value, reference, merchant, person, phone, date, or time
  survives outside placeholders.
- An unverified sender blocks export.
- Any correction clears prior approval.
- Multiple non-overlapping corrections remain applied after reopening the
  correction form; same-range edits replace only that range and partial overlaps
  are rejected.
- Duplicate source evidence does not increase family evidence count.
- Cancelling export writes no accepted artifact.
- Logs contain codes and counts only.
- Candidate modules are absent from the active parser catalog dependency graph.
- The isolated QA evaluator returns QA validation results only and is absent
  from runtime barrels.
- Final coverage manifest has no missing or pending required family/currency
  combination.
- Permission denial/revocation clears raw state and reads no inbox content.
- Evidence-secret loss blocks export until the new-domain recovery is explicitly
  acknowledged.
- Inbox and selection caps are 3,000 and 50; the 50-message synthetic benchmark
  completes in under one second.
- Native duplicate rows are removed by device message ID only. Similar distinct
  messages remain selectable, while duplicate evidence digests count once.
- A blocked candidate exposes safe findings and can be corrected or discarded;
  no validation failure can dead-end the session.
- Transferred bundles remain under ignored `.local/qa-sms-intake/` staging until
  importer validation succeeds.

## Family Review Checklist

- At least three non-duplicate matching samples for `review_ready`.
- Each supported currency has evidence and positive/near-match/negative tests.
- Fixed wording, placeholder sequence/roles, direction, and outcome agree.
- Human review references the current family version.
- Runtime scope is `candidate` and auto-select policy is `never`.
- No production trust or fallback behavior is introduced.
