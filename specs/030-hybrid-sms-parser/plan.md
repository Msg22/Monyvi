# Implementation Plan: Trusted Hybrid SMS Parser

**Branch**: `codex/hybrid-local-first-sms-parser-752` | **Date**: 2026-07-15 |
**Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/030-hybrid-sms-parser/spec.md`

## Summary

Promote explicitly approved Phase 2A QNB templates into an isolated, versioned
production catalog and route every eligible SMS candidate through that catalog
before AI. Exact, unambiguous trusted matches are resolved locally; all other
candidates retain their identity and are sent to the existing full AI parser.
Eligible trusted card purchases may additionally send a deduplicated
merchant-only payload to a dedicated AI category endpoint. The orchestrator
combines result sets by SMS fingerprint, preserves safe local results when
either AI path fails, and exposes only privacy-safe routing metadata.

For mixed-result batch scans, carry unresolved candidates in an in-memory SMS
review session and show the approved compact inline notice on the review page.
Retry operates only on that unresolved subset and merges successful retry
results without replacing edits or duplicating existing suggestions. Live,
background, and killed-app processing use the same hybrid orchestrator but keep
their existing single-message retry and notification behavior.

## Technical Context

**Language/Version**: TypeScript strict mode in the existing npm monorepo.  
**Primary Dependencies**: React Native/Expo, `@monyvi/logic`, existing AI SMS
parser service, Zod, React context/hooks, NativeWind, Jest, React Native Testing
Library, Maestro.  
**Storage**: No new database tables. The trusted catalog is a versioned bundled
source artifact. Unresolved retry candidates and parser context are held only in
the in-memory SMS review session and cleared on save, discard, or provider
unmount.  
**Testing**: TDD with pure matcher/catalog tests, orchestrator and scan-service
integration tests, context/hook/component tests, privacy/static checks, and
affected SMS scan/live Maestro journeys.  
**Target Platform**: Expo React Native Android app; shared pure parsing remains
platform independent.  
**Project Type**: Mobile app plus shared logic package and source-controlled
catalog tooling.  
**Performance Goals**: Exact local routing for a 1,000-candidate batch completes
within one second on the supported QA device profile; only unresolved candidates
consume AI chunks.  
**Constraints**: Offline exact matching, no production access to candidate or
dev/test patterns, auto-selection only for the approved enriched-card exception,
no raw SMS data in logs or persisted retry state, stable fingerprint
deduplication, cancellable work, and no change to the existing AI
transaction-consent gate. **Scale/Scope**: Initial trusted production scope is
explicitly promoted QNB Egypt templates. The activation interface must support a
future cached remote manifest without changing matcher or orchestrator
contracts.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

- **I. Offline-First Data Architecture**: PASS. Trusted matching is local and
  pure; financial writes remain in existing WatermelonDB services after review.
- **II. Documented Business Logic**: PASS WITH REQUIRED TASK. Add the approved
  promotion threshold, local-first routing, partial-result retry, and bundled
  activation policy to `docs/business/business-decisions.md`.
- **III. Type Safety**: PASS. Catalog, routing outcomes, retry state, and reason
  codes use explicit readonly interfaces and discriminated unions.
- **IV. Service-Layer Separation**: PASS. Pure matching/catalog validation stays
  in `packages/logic`; mobile services orchestrate AI, consent, cancellation,
  diagnostics, and retry; hooks/context own UI lifecycle; components render
  shaped props only.
- **V. Premium UI with Consistent Theming**: PASS. The approved second mockup
  image defines both light and dark layouts. NativeWind and existing Monyvi
  tokens are required; the notice is inline and never overlays list content.
- **VI. Monorepo Package Boundaries**: PASS. Mobile imports logic; logic does
  not import mobile or DB runtime modules. Candidate evidence is never imported
  by production runtime modules.
- **VII. Local-First Migrations**: PASS. No schema migration is needed.
- **VIII. Authenticated User Scope & Sync Correctness**: PASS. Parsing does not
  query user rows. Existing scoped account/category matching and save services
  remain authoritative.
- **Testing and TDD gates**: PASS WITH REQUIRED TASKS. Tests must be written and
  observed failing before each production behavior is implemented. Batch, live,
  cancellation, deduplication, privacy, and partial-retry paths require
  coverage.

**Post-Design Re-check**: PASS. Contracts preserve package boundaries, keep raw
retry data in memory only, retain the AI consent gate, prevent the enrichment
contract from expressing protected financial fields, and fail closed when the
trusted catalog is invalid or a candidate is ambiguous.

## Project Structure

### Documentation (this feature)

```text
specs/030-hybrid-sms-parser/
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- checklists/
|   `-- requirements.md
|-- contracts/
|   |-- hybrid-parser-contract.md
|   |-- placeholder-role-contract.md
|   |-- promotion-record-contract.md
|   |-- trusted-catalog-contract.md
|   `-- partial-results-contract.md
|-- mockups/
|   `-- partial-results-notice-light-dark.png
`-- tasks.md
```

### Source Code (repository root)

```text
packages/logic/src/parsers/
|-- trusted-sms-pattern-types.ts
|-- trusted-sms-pattern-catalog.ts
|-- trusted-sms-catalog-activation.ts
|-- trusted-sms-integrity.ts
|-- trusted-sms-parser.ts
|-- trusted-sms-template-matcher.ts
|-- trusted-sms-patterns/
`-- __tests__/
    |-- fixtures/trusted-sms/
    |-- trusted-sms-catalog-activation.test.ts
    |-- trusted-sms-parser.test.ts
    |-- trusted-sms-pattern-catalog.test.ts
    |-- trusted-sms-staged-validation.test.ts
    |-- trusted-sms-template-performance.test.ts
    |-- trusted-sms-template-matcher.test.ts
    `-- qa-sms-candidate-runtime-isolation.test.ts

apps/mobile/services/
|-- sms-parser-orchestrator.ts
|-- sms-sync-service.ts
|-- sms-live-processor.ts
`-- sms-review-retry-service.ts

apps/mobile/context/
`-- SmsScanContext.tsx

apps/mobile/hooks/
`-- useSmsReviewRetry.ts

apps/mobile/components/transaction-review/
|-- TransactionReview.tsx
`-- PartialSmsResultsNotice.tsx

apps/mobile/app/(private)/
`-- sms-review.tsx

scripts/
|-- promote-qa-sms-patterns.ts
`-- check-qa-sms-pattern-privacy.ts

docs/business/
`-- business-decisions.md
```

**Structure Decision**: Keep candidate evidence and production runtime catalogs
physically and semantically separate. A narrowly scoped promotion command reads
reviewed candidate artifacts and emits an independently validated trusted
catalog; runtime code imports only that output. The pure matcher returns one
explicit outcome per candidate. Mobile orchestration partitions, calls AI, and
combines outcomes. The review session stores only the transient data needed to
retry unresolved messages, while the notice remains a presentational component.

## Delivery Phases

### Phase 0 - Research and boundary proof

1. Confirm current Phase 1 parser, Phase 2A governance, AI chunking, scan/live
   callers, and review-session ownership.
2. Resolve catalog promotion, exact-match, ambiguity, activation, partial AI
   result, cancellation, and privacy decisions in `research.md`.
3. Record the implementation invariants in business decisions before production
   behavior changes.

### Phase 1 - Contracts and test scaffolding

1. Define discriminated catalog, local routing, hybrid summary, and retry-state
   contracts.
2. Add failing tests for promotion isolation, exact matches, near misses,
   multiple matches, disabled patterns, rejection templates, malformed
   extraction, consent, partial AI failure, cancellation, and fingerprint merge.
3. Add failing UI tests for both themes, count/copy, retry loading/disabled
   behavior, and notice dismissal.

### Phase 2 - Trusted catalog and pure matching

1. Implement explicit promotion from reviewer-approved Phase 2A artifacts and a
   source-controlled immutable promotion manifest.
2. Validate catalog version, source provenance, fixed fragments, placeholder
   roles, expected outcome, enabled state, and conservative review policy.
3. Implement exact structural matching that evaluates all eligible trusted
   patterns and returns `matched`, `rejected`, `unresolved`, or `ambiguous` per
   fingerprint. Never accept the first match without ambiguity detection.
4. Keep existing fixture/dev local modes separate from production hybrid mode.
5. Apply the explicit initial family matrix and keep bank-to-wallet candidates
   unresolved until a separate internal-transfer contract is approved.

### Phase 3 - Hybrid mobile orchestration

1. Enforce consent before starting the hybrid feature.
2. Resolve trusted matches locally, send only unresolved candidates to AI, and
   merge by fingerprint with deterministic source precedence.
3. Preserve successful local and AI chunk results when other AI chunks fail;
   return unresolved candidate identities and privacy-safe reason codes.
4. Propagate abort signals through local, AI, combination, and retry paths.
5. Apply the same orchestration to batch, foreground live, background native,
   and killed-app callers without changing notification contracts.

### Phase 3A - Minimal category enrichment and guarded auto-selection

1. Extend trusted parser results with their trusted message family while keeping
   all financial extraction pure in `packages/logic`.
2. Define a mobile category-enrichment port whose request can express only the
   approved minimal fields and whose response can express only system category
   and confidence.
3. Add a dedicated consent-validating Edge Function with a strict request and
   response schema, compact system-category allowlist, and privacy-safe logs.
4. Select only trusted card purchases with non-empty merchants, normalize only
   for session deduplication, and correlate valid category outcomes back to
   every eligible trusted result without changing merchant display text.
5. Run category enrichment and unresolved full parsing concurrently for mixed
   batches. Merge through field-specific adapters so enrichment cannot overwrite
   locally owned financial facts.
6. Split category inputs into endpoint-safe chunks of at most 20 unique
   merchants, run at most two requests concurrently, and bound the operation by
   one 20-second deadline. Preserve successful prior chunks plus the original
   local merchant and direction-correct fallback category for every per-
   merchant or endpoint failure. Do not route failed trusted enrichment inputs
   through `parse-sms`.
7. Assign exact trusted card purchases local extraction confidence `0.98`, then
   make them auto-selectable only after category confidence reaches `0.90`, the
   account is resolved, and the existing review service finds no other reason.
   Exclude generic fallback categories from acceptance, reject every outcome for
   duplicated response identities, and require account evidence to satisfy the
   exact-card or unique-sender rule in FR-057.
8. Keep persistent merchant history behind the port as a deferred strategy; do
   not add storage or sync in this phase.
9. Keep the enrichment category taxonomy server-owned, exclude hidden/internal
   categories on mobile, bound every mobile and provider request with a real
   timeout, and preserve completed local work when remote consent becomes stale.
10. Apply the existing review-selection service to live foreground, background,
    and killed-app auto-confirm so weak account matches and low-confidence AI
    output cannot save silently.
11. Add the approved exact `QNB EGYPT` online-banking transfer-request structure
    to catalog version 2 as a low-confidence `EXPENSE` suggestion, and mirror
    that narrow sanitized exception in the full-AI prompt without generalizing
    other requested or pending transfer wording.
12. Treat an explicit card suffix as the strongest matching evidence. Resolve
    one exact sender-plus-card match; when none exists, permit only a unique
    sender-only match. Keep multiple exact matches, multiple sender matches, and
    registry/default fallbacks unresolved for card-bearing SMS.
13. Pin the initiating authenticated user through live parse, account
    resolution, notification handling, and the fingerprint-guarded write;
    discard stale work after any user switch.
14. Process category enrichment in chunks of at most 20 with no more than two
    requests in flight, sharing one 20-second total deadline and preserving
    local suggestions plus previously accepted outcomes when it expires.
15. Validate Edge enrichment outcomes independently per opaque merchant identity
    so one malformed or duplicated identity cannot discard unrelated valid
    outcomes.
16. Supervise the local Expo and Edge Function processes as one development
    stack and terminate both when either required child exits unexpectedly.

### Phase 4 - Partial-result review UX

1. Extend the in-memory scan context to carry a review session containing
   successful suggestions, unresolved candidates, parser context, and summary.
2. Add a retry hook/service that processes only unresolved candidates and
   atomically merges successes while retaining existing transaction edits.
3. Implement the approved second mockup image in both light and dark modes using
   Monyvi tokens. Keep the notice inline below review controls and above rows.
4. Clear retry-sensitive in-memory data after save, discard, session reset,
   review Back, abandonment route replacement, logout, or private-runtime
   unmount.

### Phase 5 - Verification and staged rollout readiness

1. Run targeted Jest suites, typecheck, lint, i18n, privacy checks, and affected
   SMS E2E journeys.
2. Benchmark a 1,000-candidate batch and record safe aggregate metrics only.
3. Verify feature disablement routes every eligible transaction candidate to
   existing AI behavior, keeps exact active trusted rejection templates out of
   AI, and ensures invalid catalog state fails closed.
4. Complete the manual QA/automation coverage matrix in the PR description.
5. Record category-enrichment payload/privacy checks, invariant-preservation
   results, duplicate-merchant batching, and safe-failure evidence.

## Complexity Tracking

No constitution violations require justification.
