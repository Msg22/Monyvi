# Implementation Plan: Local Intelligent Parser

**Branch**: `383-local-intelligent-parser` | **Date**: 2026-07-09 | **Spec**:
[spec.md](spec.md) **Input**: Feature specification from
`specs/028-local-intelligent-parser/spec.md`

## Summary

Build phase 1 of the local SMS parser as a deterministic development/testing
parser that can replace real AI calls in local development, CI-friendly service
tests, and local-parser E2E flows. Phase 1 is not a production fallback and must
not change production AI parsing behavior, user-facing consent flows, or feature
access rules.

The parser may use fixture, synthetic, internet, or unknown-source SMS examples
for phase-1 dev/test coverage, but the pattern catalog must explicitly encode
that provenance and runtime scope. Dev/test-only patterns must be impossible to
mistake for trusted production behavior. The design must remain scalable for a
later phase where real SMS templates are collected with consent, sanitized,
reviewed, and promoted into trusted production-supported patterns.

The implementation should keep pure pattern matching, negative classification,
confidence/review classification, and catalog validation in `packages/logic`.
`apps/mobile/services` owns runtime provider selection, consent/settings gates,
AI calls, test-mode selection, privacy-safe diagnostics, and integration with
batch/live SMS workflows.

## Technical Context

**Language/Version**: TypeScript strict mode in the existing npm workspace.  
**Primary Dependencies**: React Native/Expo mobile app, existing SMS AI parser
service, Zod where already used, Jest, Maestro, existing `@monyvi/logic` parser
utilities.  
**Storage**: No new persisted tables planned. Parser pattern catalog is source
controlled and sanitized; user-facing records remain WatermelonDB local-first.  
**Testing**: Jest unit/integration tests for pure parser, catalog governance,
mobile mode selection, privacy-safe diagnostics, and affected SMS service
integration. Add explicit local-parser E2E commands so local-parser mode is not
confused with existing fixture mode.  
**Target Platform**: Expo React Native mobile app, Android SMS import/live
detection paths first.  
**Project Type**: Monorepo mobile app plus shared logic package.  
**Performance Goals**: Local parser returns deterministic results for normal
fixture batches without noticeable scan delay; unsupported messages fail closed
quickly.  
**Constraints**: Offline-capable local parsing for dev/test, no raw SMS or
amount/sender data in logs, no whole-inbox parsing, no user-facing parser-source
labels, no phase-1 production fallback, and no change to the current AI
transaction suggestions gate.  
**Scale/Scope**: SMS-first phase-1 dev/test parser with catalog metadata that
can later support trusted production promotion.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Offline-First Data Architecture**: PASS. The parser is local and pure.
  User-facing writes remain in the existing WatermelonDB save pipeline.
- **II. Documented Business Logic**: PASS WITH REQUIRED IMPLEMENTATION TASK.
  Phase-1 dev/test scope, dev/test-only pattern governance, future trusted
  promotion rules, diagnostics, and consent-setting boundaries must be added to
  `docs/business/business-decisions.md`.
- **III. Type Safety**: PASS. Parser contracts use explicit TypeScript
  interfaces, readonly fields, and existing normalization helpers.
- **IV. Service-Layer Separation**: PASS. Pure parsing belongs in
  `packages/logic`; mobile provider selection and workflow orchestration remain
  in `apps/mobile/services`; UI receives existing review-shaped data.
- **V. Premium UI with Consistent Theming**: PASS. No regular UI redesign is
  required. Existing review cues are reused; parser source is diagnostics-only.
- **VI. Monorepo Package Boundaries**: PASS. `packages/logic` must not import
  mobile services or DB runtime modules. Mobile may import the logic parser.
- **VII. Local-First Migrations**: PASS. No schema migration is planned.
- **VIII. Authenticated User Scope & Sync Correctness**: PASS. The parser does
  not query user data. Mobile services still load scoped categories/accounts and
  save through existing scoped services.

**Post-Design Re-check**: PASS. The generated contracts keep pure parsing
separate from mobile orchestration, preserve privacy boundaries, and explicitly
defer production fallback/trusted real SMS promotion to phase 2.

## Project Structure

### Documentation (this feature)

```text
specs/028-local-intelligent-parser/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- local-parser-contract.md
|   |-- pattern-catalog-contract.md
|   `-- parser-orchestration-contract.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
packages/logic/src/parsers/
|-- local-sms-parser.ts              # Pure parser entry point
|-- local-sms-pattern-catalog.ts     # Sanitized catalog with scope/provenance
|-- local-sms-parser-types.ts        # Pure parser inputs/outcomes/metadata
`-- __tests__/
    |-- local-sms-parser.test.ts
    `-- local-sms-pattern-catalog.test.ts

apps/mobile/services/
|-- ai-sms-parser-service.ts         # Existing AI parser client
|-- sms-parser-orchestrator.ts       # Runtime provider selection for dev/test
|-- sms-sync-service.ts              # Batch scan caller remains orchestrator-only
`-- sms-live-processor.ts            # Live detection caller remains orchestrator-only

apps/mobile/config/
`-- e2e-test-config.ts               # Runtime parser mode guard updates

docs/business/
`-- business-decisions.md            # Add phase-1 and phase-2 boundary rules
```

**Structure Decision**: Use `packages/logic` for deterministic parsing because
it is pure business logic over plain inputs. Use mobile services for
environment, consent, AI calls, logging, progress, and parser-mode selection
because those are app workflows and platform concerns. Do not move parsing into
UI, hooks, WatermelonDB models, or the Edge Function.

## Complexity Tracking

No constitution violations require justification.
