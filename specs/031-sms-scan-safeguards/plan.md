# Implementation Plan: Launch SMS Scan Safeguards

**Branch**: `codex/limit-launch-sms-scans-769` | **Date**: 2026-07-20 |
**Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/031-sms-scan-safeguards/spec.md`

## Summary

Bound launch SMS imports to an inclusive rolling 30-day window, make ordinary
scans incremental through a conservative installation-local checkpoint, and
enforce authenticated full-parser and category-enrichment limits independently
on the server. Existing fingerprint deduplication remains authoritative.

The mobile pipeline evaluates one shared, versioned policy; runs local
exclusions and exact trusted templates before paid work; orders unresolved work
newest-first; preserves successful partial results; and records only
privacy-safe durable outcomes. A new server-authored, pull-only user-owned
AI-negative outcome table carries the approved three-strike lifecycle across
devices. Server-only usage, request, and scan-anchor records atomically enforce
rolling candidate, burst, payload, token-estimate, cooldown, idempotency, and
immutable scan-window boundaries before Gemini starts. A bounded reservation
lease prevents a crash before provider start from consuming capacity forever.

Development QA receives named, versioned safeguard scenarios that exercise the
same policy evaluator and response reconciliation with a fixture inbox and
simulated provider. Focused UI work covers the 30-day scope, incremental versus
history-rescan actions, cooldown availability, partial-limit guidance, and a
development-only collapsed QA diagnostics panel that explains the selected
profile's active boundaries and aggregate outcome. The panel reuses shaped
runtime policy/result data, exposes no private SMS data, and is excluded from
normal development and release builds; no review-page redesign or subscription
UX is introduced.

## Technical Context

**Language/Version**: TypeScript 5.9 strict mode; PostgreSQL SQL migrations;
Deno-based Supabase Edge Functions.  
**Primary Dependencies**: Expo 55, React Native 0.83, WatermelonDB 0.28,
Supabase JS 2.106, Zod 4, `@monyvi/logic`, AsyncStorage, NativeWind, Gemini via
`@google/genai`.  
**Storage**: WatermelonDB plus synchronized Supabase PostgreSQL for privacy-safe
AI-negative outcomes; installation-local AsyncStorage for checkpoint and
oversized-candidate metadata; server-only PostgreSQL records for provider usage,
idempotency, history-rescan cooldown, and immutable scan anchors. No raw SMS or
candidate fingerprint is added to an allowance or scan-anchor record. No raw SMS
is added to persistent storage by this feature. **Testing**: Jest, React Native
Testing Library, SQL/migration checks, Edge Function handler tests,
deterministic safeguard scenario tests, existing SMS Maestro journeys, and
physical-device manual QA.  
**Target Platform**: Expo React Native Android app and Supabase Edge/PostgreSQL;
pure policy/reconciliation logic remains platform independent.  
**Project Type**: Mobile app plus shared logic package, local database package,
Supabase functions, and PostgreSQL migrations.  
**Performance Goals**: Exclude out-of-window and known fingerprints before
provider work; evaluate policy and local durable outcomes in linear time over a
maximum 200-candidate scan; return quota decisions before Gemini starts; avoid
new frame drops or list rerenders in scan/review UI.  
**Constraints**: Offline-first user-facing behavior, user and installation
scope, exact existing fingerprint identity, no raw SMS or financial values in
synced outcomes/usage/logs, 50 candidates/request, 200 candidates/scan and
rolling 24 hours, 128 KiB/request, 32,000 estimated input tokens, 30 provider
starts/capability/rolling minute, 20 merchants/enrichment request, 100 merchant
attempts/rolling 24 hours, 24-hour history cooldown, and no voice behavior
changes.  
**Scale/Scope**: Batch inbox scan, foreground/background/killed-app live SMS,
two SMS Edge Functions, one syncable outcome entity, three server-only tables,
installation-local scan metadata, focused settings/scan/review states, and a
development-only scenario harness.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

- **I. Offline-First Data Architecture**: PASS. Mobile decisions use local
  policy, local checkpoint state, local fingerprints, and Watermelon outcomes.
  Remote enforcement may refuse paid AI but cannot erase local results.
- **II. Documented Business Logic**: PASS WITH REQUIRED TASK. Record the
  approved lookback, checkpoint, allowance, cooldown, negative-strike, and
  partial-result rules in `docs/business/business-decisions.md` before runtime
  behavior changes.
- **III. Type Safety**: PASS. Policy, admission, processing outcome, provider
  completion, and QA scenario boundaries use Zod plus readonly discriminated
  unions.
- **IV. Service-Layer Separation**: PASS. Pure policy and reconciliation live in
  `packages/logic`; Watermelon/AsyncStorage workflows live in mobile services;
  Edge handlers own server enforcement; hooks own lifecycle; UI components
  render shaped state.
- **V. Premium UI with Consistent Theming**: PASS WITH APPROVAL GATE. Focused
  light/dark mockups must be approved before UI implementation. Existing Monyvi
  tokens, safe areas, accessibility, and non-overlapping inline notices remain
  mandatory.
- **VI. Monorepo Package Boundaries**: PASS. Apps import logic and DB; logic
  imports neither app nor DB runtime. Edge shared modules stay under
  `supabase/functions/_shared`.
- **VII. Local-First Migrations**: PASS WITH REQUIRED MIGRATION. Add the next
  numbered SQL migration, run `npm run db:migrate`, and commit generated
  Watermelon schema/migration/model/type changes. Server-only tables are omitted
  from Watermelon; synchronized AI-negative outcomes are included.
- **VIII. Authenticated User Scope & Sync Correctness**: PASS. AI-negative
  outcomes are user-scoped, RLS-protected, server-authored, and pull-only on
  mobile. Server ledgers are inaccessible to ordinary table APIs and are mutated
  only by service-role RPCs after Edge JWT verification. Pull errors remain
  fatal to sync.
- **Testing and TDD gates**: PASS WITH REQUIRED TASKS. Every deterministic
  branch gets a failing test first. Batch/live sharing, concurrency,
  idempotency, malformed responses, user switches, partial results, checkpoint
  safety, and QA isolation require explicit coverage.
- **Privacy and consent**: PASS. Existing AI consent remains required and is
  exercised by the deterministic QA boundary. Synchronized negative outcomes may
  contain canonical fingerprints, timestamps, counts, codes, and identities.
  Allowance, request, usage, and scan-anchor records MUST NOT persist candidate
  fingerprints. No new server record contains sender, body, amount, merchant,
  category, or extracted financial fields.

**Post-Design Re-check**: PASS. Contracts keep financial data local, make the
server the final paid-work boundary, preserve current hybrid routing, isolate
issue #770 draft persistence, and prevent test policy/provider doubles from
entering production builds.

## Project Structure

### Documentation (this feature)

```text
specs/031-sms-scan-safeguards/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- checklists/
|   `-- requirements.md
|-- contracts/
|   |-- ai-usage-enforcement-contract.md
|   |-- processing-outcome-contract.md
|   |-- safeguard-qa-contract.md
|   |-- scan-policy-contract.md
|   |-- scan-session-contract.md
|   `-- safeguard-ux-contract.md
|-- mockups/
|   `-- sms-scan-safeguards-light-dark.png
`-- tasks.md
```

### Source Code (repository root)

```text
packages/logic/src/sms-safeguards/
|-- sms-scan-policy.ts
|-- sms-scan-boundary.ts
|-- sms-ai-work-selector.ts
|-- sms-provider-response-reconciler.ts
|-- sms-processing-outcome.ts
|-- sms-input-estimator.ts
|-- safeguard-qa-scenarios.ts
`-- __tests__/

packages/db/src/
|-- schema.ts
|-- migrations.ts
|-- supabase-types.ts
|-- database.ts
`-- models/
    |-- SmsAiNegativeOutcome.ts
    `-- base/base-sms-ai-negative-outcome.ts

apps/mobile/services/
|-- sms-sync-service.ts
|-- sms-live-processor.ts
|-- sms-parser-orchestrator.ts
|-- sms-parser-result-contract.ts
|-- ai-sms-parser-service.ts
|-- ai-sms-parser-response.ts
|-- ai-sms-category-enrichment-service.ts
|-- sms-scan-policy-service.ts
|-- sms-scan-checkpoint-service.ts
|-- sms-scan-checkpoint-coordinator.ts
|-- sms-processing-outcome-service.ts
|-- sms-oversized-outcome-service.ts
|-- sms-ai-availability-service.ts
`-- testing/
    `-- sms-safeguard-qa-runner.ts

apps/mobile/hooks/
|-- useSmsScan.ts
`-- useSmsAiAvailability.ts

apps/mobile/context/
`-- SmsScanContext.tsx

apps/mobile/components/
|-- settings/SettingsSections.tsx
|-- sms-sync/SmsScanScopeNotice.tsx
|-- transaction-review/PartialSmsResultsNotice.tsx
`-- sms-sync/SafeguardQaDiagnosticsPanel.tsx

apps/mobile/app/(private)/
|-- settings.tsx
|-- sms-scan.tsx
`-- sms-review.tsx

supabase/functions/_shared/
|-- sms-ai-safeguard-contract.ts
|-- sms-ai-safeguard-service.ts
|-- sms-provider-completion.ts
|-- sms-safeguard-policy.ts
|-- sms-safeguard-qa-policy.ts
|-- sms-safeguard-qa-provider.ts
`-- sms-safeguard-qa-runtime.ts

supabase/functions/
|-- parse-sms/index.ts
|-- enrich-sms-categories/index.ts
|-- sms-ai-availability/index.ts
`-- sms-safeguard-qa/index.ts

supabase/migrations/
|-- 061_sms_ai_safeguards.sql
`-- 062_fix_sms_ai_outcome_reconciliation.sql

scripts/
`-- evaluate-sms-parser-prompt.ts

docs/business/
`-- business-decisions.md
```

**Structure Decision**: Introduce a small pure safeguard domain in
`packages/logic` for client-side boundaries and deterministic QA. Keep local
checkpoint/outcome persistence behind mobile services. Add one syncable
user-owned outcome model because terminal suppression must survive reinstall and
cross devices. Keep usage/idempotency/cooldown records server-only and mutate
them atomically before provider invocation. Edge handlers use shared safeguard
adapters so parse and enrichment cannot drift.

## Delivery Phases

### Phase 0 - Research and invariant proof

1. Map batch, live, category-enrichment, retry, consent, fingerprint, and sync
   call paths.
2. Resolve policy ownership, checkpoint durability, negative-outcome scope,
   atomic server admission, provider-completion semantics, input estimation,
   retry-time calculation, and QA isolation in `research.md`.
3. Confirm issue #770 owns raw-message drafts and dismissed-state persistence.

### Phase 1 - Contracts, data model, and approved UX

1. Define the versioned policy and deterministic refusal precedence.
2. Define scan-session/checkpoint state transitions and durable known-state
   evaluation.
3. Define pull-only synchronized negative and local oversized outcome contracts
   without raw content.
4. Define server admission/reserve/consume/release/idempotent replay contracts,
   including stale-reservation lease expiry and lost-response behavior.
5. Define named QA scenario profiles and reset/isolation rules.
6. Generate and approve focused light/dark mockups before UI tasks begin.

### Phase 2 - Foundational policy and persistence

1. Update business decisions.
2. Write failing tests for policy, boundaries, ordering, input estimation,
   response reconciliation, and outcome lifecycle.
3. Add the numbered SQL migration, RLS, service-role-only atomic RPCs, generated
   Supabase types, Watermelon schema/migration/model, pull-only sync strategy,
   and scoped outcome service. Exclude the three server-only tables from
   Watermelon migration generation.
4. Add installation-local checkpoint and oversized-outcome service with strict
   validation, user scoping, monotonic writes, and bounded cleanup.

### Phase 3 - Server enforcement

1. Extract testable parse and enrichment handlers with injected auth, consent,
   admission, provider, and clock dependencies.
2. Validate candidate count, payload bytes, input estimate, request identity,
   capability, and policy before reservation.
3. Atomically enforce per-scan and rolling candidate/merchant allowances plus
   capability burst limits; expire stale pre-provider reservations and mark
   provider start immediately before Gemini.
4. Preserve idempotent decisions/refusals and report privacy-safe availability.
   A replay after provider start never invokes Gemini again; when no response
   payload was retained, it returns an explicit already-processed unresolved
   decision rather than fabricating or caching financial output.
5. Reconcile complete provider responses into valid positive and negative
   identities; never classify malformed, incomplete, duplicate, or unknown
   identities.

### Phase 4 - Mobile scan and live integration

1. Replace the 90-day default with one versioned 30-day policy and explicit
   `incremental`/`history` scan kinds.
2. Apply local cutoff/checkpoint/fingerprint/outcome filtering before parser
   work, then select newest unresolved candidates deterministically.
3. Persist only valid AI-negative outcomes; enforce terminal suppression before
   provider work while allowing future exact trusted local recovery.
4. Advance checkpoints only through contiguous durable known states; cancel and
   discard stale-user work.
5. Apply the same server allowance to batch and live paths while keeping voice
   unchanged and local parsing available.

### Phase 5 - Focused UX

1. Implement approved 30-day scope copy and separate incremental/history scan
   actions.
2. Keep history rescan visible but disabled during cooldown and show one
   localized absolute availability time.
3. Extend the existing inline partial-results notice for
   quota/cooldown/oversized aggregate guidance while preserving the enabled Save
   action.
4. Verify light/dark themes, Arabic/English copy, accessibility, bottom safe
   areas, compact layout, and no review-list overlap.

### Phase 6 - Deterministic safeguard QA

1. Add named/versioned fixture profiles for cutoff, checkpoint, partial quota,
   burst, cooldown, oversized input, response validity, consent denial, three
   strikes, cross-install terminal state, trusted-local recovery, and user
   switch.
2. Route QA through the production policy/reconciliation code with isolated
   simulated stores/provider and a fixed clock.
3. Add reset and diagnostics proving zero production provider calls and zero
   production allowance charges.
4. Add prompt/token measurement split by fixed prompt, categories, schema, and
   candidate payload. Use the conservative local estimator by default and a
   separately named opt-in selected-model count-tokens workflow for calibrated
   measurement; do not optimize prompt text without corpus parity.
5. After mockup approval, project the active QA profile, effective policy, and
   aggregate scan/review outcome into a development-only diagnostic view model;
   render it collapsed by default on scan completion and review without exposing
   raw SMS data or duplicating policy limits.

### Phase 7 - Verification and rollout readiness

1. Run targeted tests, typecheck, lint, formatting, migration/schema checks, and
   relevant Maestro journeys.
2. Perform physical-device manual QA against the approved coverage matrix.
3. Verify production builds cannot activate QA profiles or provider doubles.
4. Document Gemini spending caps/billing alerts and Edge deployment/local
   migration steps before marking production-ready.

## Complexity Tracking

No constitution violations require justification.
