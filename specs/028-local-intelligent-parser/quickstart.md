# Quickstart: Local Intelligent Parser

## Preconditions

- Use branch `383-local-intelligent-parser`.
- Read `spec.md`, `plan.md`, `research.md`, `data-model.md`, and all files in
  `contracts/`.
- Update `docs/business/business-decisions.md` with the finalized phase-1 local
  parser rules before continuing implementation.
- Treat production fallback, trusted real SMS collection, and production
  promotion as phase-2 work.

## Intended Implementation Order

1. Add failing catalog governance tests for runtime scope, source type, source
   confidence, promotion eligibility, and dev/test-only restrictions.
2. Add failing parser tests for deterministic fixture parsing, unsupported
   messages, negative classification, and privacy-safe outcomes.
3. Add parser contracts/types and a small dev/test pattern catalog.
4. Implement pure local parsing with declared pattern matching and safe
   needs-review behavior.
5. Add parser acceptance metric tests for the agreed supported/unsupported
   fixture corpus.
6. Add mobile service tests for local-parser mode selection, fixture-mode
   separation, AI-primary production default behavior, phase-1 fallback being
   disabled, consent/settings gates, and privacy-safe diagnostics.
7. Add or update the mobile parser orchestrator and route batch/live SMS parsing
   through it without changing user-visible flows.
8. Update existing SMS service tests to prove consent/settings, abort behavior,
   deduplication, and privacy-safe logging are preserved.
9. Add explicit local-parser E2E commands so `fixture` mode and `local` parser
   mode can be verified separately.
10. Run targeted unit/integration tests, then the affected SMS E2E suite when an
    emulator/device is available.

## Suggested Local Checks

```powershell
npm test -w @monyvi/logic -- --runTestsByPath src/parsers/__tests__/local-sms-parser.test.ts
npm test -w @monyvi/logic -- --runTestsByPath src/parsers/__tests__/local-sms-pattern-catalog.test.ts
npm test -w @monyvi/logic -- --runTestsByPath src/parsers/__tests__/local-sms-fixture-corpus.test.ts
npm test -- --runTestsByPath apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts
npm test -- --runTestsByPath apps/mobile/__tests__/services/sms-sync-service.test.ts apps/mobile/__tests__/services/sms-live-processor.test.ts
npm run lint
npm run typecheck -w @monyvi/logic
npx tsc -p apps/mobile/tsconfig.json --noEmit
```

Run affected Maestro SMS journeys after unit/integration coverage is green:

```powershell
cd apps/mobile
npm run e2e:sms-sync:local-parser
npm run e2e:live-sms:local-parser
```

Existing fixture-mode journeys should remain available separately.

## Implementation Notes

- Removed the draft `ai-with-local-fallback` path from the mobile SMS parser
  orchestrator. Phase 1 now supports only AI-primary default behavior,
  fixture-mode diagnostics for existing E2E fixture parsing, and explicit
  local-primary dev/test mode.
- AI errors, retryable empty AI responses, and provider failures no longer
  invoke the local parser automatically. Production fallback remains phase-2
  work tracked separately in GitHub issue #744.
- Local-primary mode is still gated by the existing AI transaction suggestions
  setting so phase 1 does not change user-facing consent or feature-access
  semantics.

## Manual QA Focus

- Batch SMS import with local-primary dev/test mode produces deterministic
  suggestions and does not contact the AI provider.
- Local-parser E2E/dev inbox mode uses a saveable subset of the synthetic
  dev/test corpus, limited to providers represented by the E2E seed accounts.
  The full 100+ corpus remains covered by parser/unit tests.
- Existing fixture mode still works and is distinguishable from local-parser
  mode.
- The dev/test corpus includes at least 100 concrete SMS-shaped fixtures and
  covers every selectable bank and wallet provider in the registry.
- Production/default mode still uses AI-primary behavior; local fallback is not
  enabled in phase 1.
- Local-parser mode cannot run when AI transaction suggestions are disabled.
- Unsupported, OTP, marketing, failed transaction, and informational messages
  produce no confident suggestion.
- ATM withdrawal suggestions require review.
- Dev/test-only patterns are clearly marked as dev/test-only in catalog
  metadata.
- No dev/test-only pattern is marked production-trusted or production
  auto-selectable.
- Disabling AI transaction suggestions blocks local parsing for phase 1.
- Logs and test diagnostics do not reveal SMS body, sender, amount, transcript,
  AI/local response body, or user account names.
- Regular user UI does not show implementation labels such as local parser, AI
  parser, or fixture parser.

## Coverage Matrix

| Scenario                                                                                    | Automated coverage                                                                                                                                                                       | Manual/E2E status                                                                 |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dev/test SMS pattern parses deterministically                                               | `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`                                                                                                                          | Covered by unit tests                                                             |
| Agreed fixture corpus meets supported/unsupported/no-AI metrics                             | `packages/logic/src/parsers/__tests__/local-sms-parser.test.ts`                                                                                                                          | Covered by metric-style unit tests                                                |
| 100+ provider fixture corpus covers every selectable bank/wallet provider                   | `packages/logic/src/parsers/__tests__/local-sms-fixture-corpus.test.ts`                                                                                                                  | Covered by corpus unit tests                                                      |
| Pattern catalog rejects unsafe scope/provenance combinations                                | `packages/logic/src/parsers/__tests__/local-sms-pattern-catalog.test.ts`                                                                                                                 | Covered by unit tests                                                             |
| Development/test local-primary mode bypasses AI                                             | `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`, `apps/mobile/__tests__/config/e2e-test-config.test.ts`                                                                 | Covered by service/config tests                                                   |
| Production/default behavior remains AI-primary                                              | `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`                                                                                                                         | Covered by service tests                                                          |
| Phase-1 production local fallback is disabled                                               | `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`                                                                                                                         | Covered by service tests                                                          |
| AI transaction suggestions setting gates local parser access                                | `apps/mobile/__tests__/services/sms-parser-orchestrator.test.ts`, `apps/mobile/__tests__/services/sms-sync-service.test.ts`, `apps/mobile/__tests__/services/sms-live-processor.test.ts` | Covered by service tests                                                          |
| Fixture mode and local-parser mode are separate                                             | `apps/mobile/__tests__/config/e2e-test-config.test.ts`, local-parser E2E commands                                                                                                        | Pending E2E command run                                                           |
| Batch and live SMS callers route through the orchestrator without changing dedup boundaries | `apps/mobile/__tests__/services/sms-sync-service.test.ts`, `apps/mobile/__tests__/services/sms-live-processor.test.ts`                                                                   | Covered by service tests                                                          |
| Raw SMS body is not persisted after save                                                    | `apps/mobile/__tests__/services/batch-create-transactions.test.ts`                                                                                                                       | Covered by persistence-boundary test                                              |
| Regular review UI hides parser-source implementation labels                                 | `apps/mobile/__tests__/components/transaction-review/TransactionReview.test.tsx`                                                                                                         | Covered by component test                                                         |
| Affected SMS Maestro journeys                                                               | Not covered until emulator/device run                                                                                                                                                    | Pending: `npm run e2e:sms-sync:local-parser`, `npm run e2e:live-sms:local-parser` |
