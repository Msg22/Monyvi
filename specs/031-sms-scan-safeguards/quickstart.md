# Quickstart: Launch SMS Scan Safeguards

## Prerequisites

- Local Supabase is running and all local migrations are applied.
- Android emulator or physical device is available.
- The feature branch is checked out from current `origin/main`.
- Production Gemini calls are not used for routine safeguard QA.

## Local Setup

```powershell
npm run supabase:start:local
npm run db:migrate
npm run db:watermelon-migrate -- --latest
npm run local:reset-and-seed
```

Run every deterministic safeguard profile without a real inbox or Gemini call:

```powershell
npm run test:sms-safeguards
```

Run one named profile:

```powershell
npm run test:sms-safeguards -- --scenario partial-quota-v1
```

Start the dedicated physical-device development mode:

```powershell
npm run mobile:dev:sms-safeguards:wireless-device -- --scenario partial-quota-v1
```

The launcher requires a named/versioned profile, validates it before Metro
starts, and gives that launch an isolated QA namespace. The app then uses the
profile's fixture inbox, fixed clock, reduced policy, and simulated provider. It
fails closed instead of reading the device inbox or calling Gemini. Do not lower
production limits or use a real inbox to manufacture quota states.

## TDD Verification Order

1. Run pure policy, ordering, token-estimate, and reconciliation tests.
2. Run database migration/model/sync tests.
3. Run server admission, concurrency, idempotency, and response-completion
   tests.
4. Run mobile checkpoint/outcome/orchestrator tests.
5. Run component and route tests for approved UI states.
6. Run the deterministic safeguard scenario suite.
7. Run existing SMS scan and live SMS regression suites.

## Required Manual QA Scenarios

1. Initial scan reads only the inclusive rolling last 30 days.
2. Sync new SMS uses checkpoint overlap and creates no duplicates.
3. Rescan recent messages rereads 30 days and starts cooldown only when full AI
   actually starts.
4. During cooldown, rescan remains visible/disabled with localized absolute
   availability while incremental sync remains available.
5. Mixed local, simulated-AI, and quota-limited results preserve successful
   suggestions and keep Save enabled.
6. Full-parser allowance is shared between batch and live SMS; voice is not
   affected.
7. Category-enrichment refusal preserves local suggestions and fallback
   categories.
8. Newest candidates receive limited capacity first with stable equal-time
   ordering.
9. First/second AI-negative strikes suppress ordinary retry; deliberate history
   rescans can reach terminal strike three.
10. A fresh simulated installation enforces synchronized terminal suppression; a
    later exact trusted local template can still parse without AI.
11. Oversized individual candidates are not truncated or sent and show only
    aggregate friendly guidance.
12. Cancellation, invalid responses, and account switches create no unsafe
    checkpoint, usage, outcome, or visible-result mutation.
13. Light/dark and English/Arabic layouts match the approved focused mockup and
    respect Android safe areas.
14. Diagnostics prove zero production provider calls and zero production quota
    consumption in every safeguard QA profile.
15. Ask the tester to explain, without technical prompting, the difference
    between Sync new SMS and Rescan recent messages, why rescan may be
    temporarily unavailable, and whether accepted suggestions can still be saved
    after a partial result.

## Coverage Matrix

| Scenario                                                      | Automated coverage                                                                                                                  | Device coverage                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. Inclusive 30-day boundary                                  | `sms-scan-boundary.test.ts`, `sms-sync-service.test.ts`, profile `cutoff-boundary-v1`                                               | Maestro safeguard journey plus manual inbox-boundary confirmation                            |
| 2. Incremental overlap and deduplication                      | `sms-sync-checkpoint.integration.test.ts`, `sms-scan-checkpoint-coordinator.test.ts`, profile `checkpoint-overlap-v1`               | Maestro safeguard journey plus manual repeat scan                                            |
| 3. History rescan and cooldown start                          | `sms-history-cooldown.test.ts`, `sms-sync-safeguards.integration.test.ts`, profile `history-cooldown-v1`                            | Maestro safeguard journey plus manual settings action                                        |
| 4. Cooldown UI and incremental availability                   | `SettingsSections.test.ts`, `useSmsAiAvailability.test.ts`, `sms-ai-availability-handler.test.ts`                                   | Maestro safeguard journey; manual locale/timezone confirmation                               |
| 5. Partial quota preserves successes and Save                 | `sms-parser-orchestrator-safeguards.test.ts`, `sms-review.test.tsx`, `PartialSmsResultsNotice.test.tsx`, profile `partial-quota-v1` | Maestro safeguard journey plus manual Save verification                                      |
| 6. Shared batch/live allowance and voice isolation            | `sms-ai-safeguard-rpc.test.ts`, `sms-live-processor.test.ts`, `ai-voice-parser-service.test.ts`, profile `shared-batch-live-v1`     | Concurrency is service-level; manually confirm voice remains available                       |
| 7. Enrichment refusal preserves local suggestions             | `ai-sms-category-enrichment-service.test.ts`, `sms-parser-orchestrator-safeguards.test.ts`                                          | Manual review-card category fallback confirmation                                            |
| 8. Newest-first stable admission                              | `sms-ai-work-selector.test.ts`, profile `partial-quota-v1`                                                                          | Service-level automation; no additional device control required                              |
| 9. Three-strike negative lifecycle                            | `sms-negative-outcome-handler.test.ts`, `sms-processing-outcome-service.test.ts`, profile `negative-three-strikes-v1`               | Service-level automation because production outcomes cannot be safely manufactured on device |
| 10. Fresh install terminal suppression and local recovery     | `sms-sync-safeguards.integration.test.ts`, profiles `terminal-fresh-install-v1` and `trusted-local-recovery-v1`                     | Manual reinstall/reset confirmation on physical Android                                      |
| 11. Oversized candidate handling                              | `sms-input-estimator.test.ts`, `sms-oversized-outcome-service.test.ts`, profile `oversized-candidate-v1`                            | Manual aggregate notice confirmation                                                         |
| 12. Cancellation, invalid response, and account switch safety | `parse-sms-handler.test.ts`, `sms-sync-safeguards.integration.test.ts`, profiles `response-validity-v1` and `account-switch-v1`     | Account switching remains manual-only on device                                              |
| 13. Approved light/dark, English/Arabic, and safe-area layout | Component and route tests cover state/copy lookup                                                                                   | Manual-only visual comparison on emulator and physical Android                               |
| 14. Zero production calls and quota charges                   | `sms-safeguard-qa.integration.test.ts`, every deterministic QA profile                                                              | Confirm diagnostics on emulator and physical-device runs                                     |
| 15. Plain-language comprehension                              | Copy lookup/component tests prevent missing text                                                                                    | Manual-only tester comprehension check                                                       |

## Prompt Token Evaluation

Use the local evaluator with a candidate prompt file and optional baseline
snapshot for routine prompt-size and output-parity reports:

```powershell
npm run sms:prompt:evaluate -- --candidate <candidate-prompt-path> --corpus <corpus-path>
```

Run `npm run test:sms-parser-prompt-evaluator` to verify the evaluator. Gemini
`countTokens` calibration is a separately named explicit opt-in path and never
generates content; routine safeguard QA does not require credentials or paid AI.

## Production Readiness Gate

- Apply migration locally and regenerate WatermelonDB schema/migrations and
  Supabase types.
- Deploy `parse-sms`, `enrich-sms-categories`, and `sms-ai-availability` only
  after tests pass.
- Verify provider spending caps and billing alerts separately from app quotas.
- Configure Gemini project budget alerts below the maximum acceptable monthly
  exposure. The incident owner must disable full SMS parsing through the
  server-side capability switch if spend or error-rate alerts fire; trusted
  local parsing and voice remain separate decisions.
- Confirm safeguard QA flags and provider doubles are unavailable in a release
  build.
- Complete the PR coverage matrix mapping every manual scenario to automated or
  explicit manual-only validation.

## SMS AI Incident Runbook

**Owner**: the release on-call maintainer owns the alert response and records
the incident timeline. Provider billing alerts must notify that owner and a
backup maintainer before SMS AI is enabled for launch.

Before launch, record manual evidence in the release issue that the Gemini
project has both a monthly budget alert below the accepted exposure and a hard
operational response threshold. Application quotas are not a substitute for a
provider billing alert.

The two SMS AI capabilities can be disabled independently through Supabase Edge
Function environment values. Supabase makes updated function secrets available
without a function redeploy:

```powershell
# Stop full SMS parsing; trusted local parsing and voice remain available.
npx supabase secrets set SMS_FULL_PARSER_ENABLED=false --project-ref <project-ref>

# Stop category enrichment independently.
npx supabase secrets set SMS_CATEGORY_ENRICHMENT_ENABLED=false --project-ref <project-ref>
```

After either command, invoke the affected function with an authenticated QA
account and confirm it refuses before provider execution. Check privacy-safe
operational logs for the disabled decision and verify Gemini invocation count
does not increase. If verification fails, revoke the Gemini key used by that
capability and escalate to the backup maintainer.

Restore a capability only after the incident is understood and the accepted
spend/error threshold is healthy:

```powershell
npx supabase secrets set SMS_FULL_PARSER_ENABLED=true --project-ref <project-ref>
npx supabase secrets set SMS_CATEGORY_ENRICHMENT_ENABLED=true --project-ref <project-ref>
```

Never put project references, provider keys, or incident payloads containing SMS
or financial values in source control.
