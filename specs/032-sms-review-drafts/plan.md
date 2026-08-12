# Implementation Plan: Resumable SMS Review Drafts

**Branch**: `384-sms-review-drafts` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/032-sms-review-drafts/spec.md`

## Summary

Persist every accepted SMS parsing result before scan completion exposes it to
navigation, then render one user-scoped device-local review queue that survives
navigation and restart without another AI request. Implement versioned payload
serialization in `@monyvi/logic`, installation-local WatermelonDB queue/item and
dismissed-fingerprint models, focused mobile repositories and command services,
reactive hooks, atomic save/discard transitions, 30-day cleanup, pre-AI
fingerprint exclusion, and the fully approved review/edit/discard/privacy UX.

## Technical Context

**Language/Version**: TypeScript 5.x in strict mode; React Native 0.83.6  
**Primary Dependencies**: Expo 55, Expo Router, React 19, WatermelonDB 0.28,
NativeWind 4, Zod 4, React Native Reanimated 4.2.1, react-native-safe-area-context  
**Storage**: Three installation-local WatermelonDB tables excluded from sync:
`sms_review_queues`, `sms_review_draft_items`, and
`dismissed_sms_fingerprints`; no Supabase table or raw-SMS cloud storage  
**Testing**: Jest, React Native Testing Library `renderHook`, existing service
integration harnesses, migration/schema tests, and focused Maestro/manual Android
coverage where deterministic device control is honest  
**Target Platform**: Android through Expo development/release builds; shared
review components remain source-agnostic for existing voice review  
**Project Type**: npm-workspace monorepo with React Native mobile app and shared
logic/database packages  
**Performance Goals**: Fingerprint exclusion and queue summary reads use indexed
metadata without decoding sensitive payload JSON; list updates remain one
`FlatList` layout transition; codec and merge work are linear in affected items  
**Constraints**: Offline-first; one active queue per user; no cross-user reads;
no raw SMS in sync/logs/telemetry/final records; 30-day retention; stale
references fail closed; save remains atomic; reduced-motion support; no new AI
request during resume/revalidation  
**Scale/Scope**: One active queue per authenticated user and up to the existing
SMS scan-session candidate ceiling, with incremental unique merges and bounded
metadata cleanup

## Constitution Check

_GATE: Passed before Phase 0 research; rechecked after Phase 1 design._

| Principle | Status | Plan evidence |
| --- | --- | --- |
| I. Offline-First Data Architecture | PASS | Queue, payload, dismissed state, edits, cleanup, and save orchestration are WatermelonDB-first and work offline. |
| II. Documented Business Logic | PASS | `docs/business/business-decisions.md` now records every approved issue #770 lifecycle and UX rule. |
| III. Type Safety | PASS | Versioned payloads use explicit readonly interfaces and Zod validation; no `any` or non-null assertions. |
| IV. Service-Layer Separation | PASS | Pure codec lives in `packages/logic`; Watermelon repositories/commands live in mobile services; hooks own subscription state; components receive props/callbacks. |
| V. Premium UI / Theming | PASS | Approved light/dark layouts use NativeWind, safe areas, Reanimated micro-interactions, reduced-motion behavior, and existing theme tokens. |
| VI. Monorepo Package Boundaries | PASS | Dependency direction remains `apps/mobile -> packages/logic -> packages/db`; no package imports from `apps`. |
| VII. Local-First Migrations | PASS | The new tables are intentionally installation-local and have no Supabase DDL. They are added through a sequential Watermelon migration and generator-preservation tests; creating cloud tables would violate the approved no-sync boundary. |
| VIII. Authenticated User Scope / Sync Correctness | PASS | Every repository operation requires the current user scope; local-only tables are excluded from pull/push and account switches cannot observe or mutate foreign queues. |
| TDD / Regression Safety | PASS | Each behavior is represented by failing codec, repository, service, hook, component, migration, and integration tests before production edits. |

### Post-Design Recheck

The data model keeps queryable lifecycle metadata outside sensitive payload JSON,
all transitions are scoped, and the contracts expose no raw database access to
hooks or UI. No constitution exception or complexity waiver is required.

## Project Structure

### Documentation (this feature)

```text
specs/032-sms-review-drafts/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── sms-review-codec-contract.md
│   ├── sms-review-repository-contract.md
│   └── sms-review-ui-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/logic/src/sms-review-drafts/
├── sms-review-draft-codec.ts
├── sms-review-draft-schema.ts
├── sms-review-draft-types.ts
└── __tests__/

packages/db/src/
├── local-schema/
│   └── sms-review-draft-schema.ts
├── models/
│   ├── SmsReviewQueue.ts
│   ├── SmsReviewDraftItem.ts
│   └── DismissedSmsFingerprint.ts
├── schema.ts
├── migrations.ts
├── database.ts
└── index.ts

apps/mobile/services/
├── sms-review-draft-repository.ts
├── sms-review-draft-command-service.ts
├── sms-review-draft-cleanup-service.ts
├── sms-review-draft-reference-service.ts
├── sms-review-save-service.ts
├── sms-sync-service.ts
└── sync/config.ts

apps/mobile/hooks/
└── useSmsReviewDraftQueue.ts

apps/mobile/components/transaction-review/
├── SmsReviewQueueEntry.tsx
├── SmsReviewUndoBanner.tsx
├── TransactionReview.tsx
├── TransactionItem.tsx
├── ReviewActionBar.tsx
└── edit-modal/TransactionEditModal.tsx

apps/mobile/app/(private)/
├── sms-scan.tsx
├── sms-review.tsx
└── privacy-details.tsx

apps/mobile/locales/{en,ar}/transactions.json
apps/mobile/__tests__/
packages/db/src/__tests__/
```

**Structure Decision**: Preserve the existing shared transaction-review
components, but add SMS-specific props and container behavior rather than making
voice review persist SMS-only state. Keep sensitive persistence behind focused
mobile services and a pure shared codec. Add local-only schema definitions as a
separate source module and update schema generation tests so future Supabase
schema regeneration cannot silently remove the installation-local tables.

## Design Phases

### Phase 0 - Research

1. Confirm current scan, checkpoint, review, save, retry, account-switch, and
   privacy boundaries.
2. Select the local-only WatermelonDB container/item/dismissed model and prove it
   cannot enter sync.
3. Define codec/versioning, atomic transition, cleanup, and interruption rules.
4. Map approved edit/discard/Undo motion onto existing shared UI without
   changing voice behavior.

### Phase 1 - Data And Contracts

1. Define queue, item, dismissed fingerprint, volatile Undo, and reference
   validation entities in [data-model.md](data-model.md).
2. Define strict codec, repository/command, and UI contracts under
   [contracts](contracts/).
3. Define deterministic tests and physical-device checks in
   [quickstart.md](quickstart.md).
4. Update the active Speckit plan marker in `AGENTS.md`.

### Phase 2 - Implementation Strategy

1. Add tests and local-only schema/model/sync exclusions.
2. Add versioned codec and user-scoped repositories.
3. Persist accepted scan results before checkpoint finalization and merge unique
   fingerprints without overwriting edits.
4. Subscribe to the durable queue, revalidate references, and preserve explicit
   selection overrides.
5. Compose financial writes and selected draft cleanup atomically; add discard,
   Undo, bulk discard, expiry, and interruption recovery.
6. Apply approved entry, review, edit, motion, privacy, localization, and
   accessibility states.
7. Run targeted and SMS regression suites, then complete the manual coverage
   matrix.

## Complexity Tracking

No constitution violations require justification. The three-table local model is
intentional: queue ownership/lifecycle, sensitive item payloads, and lightweight
long-lived dismissed fingerprints have different retention and query patterns;
combining them would force raw payload decoding during deduplication or retain
sensitive data after discard.
