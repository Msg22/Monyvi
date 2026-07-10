# Contract: Parser Orchestration

## Purpose

Define the app-service boundary that chooses between AI, local, and fixture SMS
parsing. This belongs in `apps/mobile/services` because it depends on runtime
mode, Edge Function calls, consent/settings, abort signals, and progress.

Phase 1 local parsing is development/test-only. Production fallback is deferred
to phase 2.

## Modes

- `ai-primary`: default production behavior. Calls the AI Edge Function.
- `local-primary`: development/test mode for deterministic local parsing.
- `fixture`: existing guarded E2E fixture mode.

The previous `ai-with-local-fallback` concept is deferred to phase 2 and must
not be enabled in phase 1.

## Phase-1 Runtime Rules

- Production/default mode remains `ai-primary`.
- Local-parser mode must bypass the AI provider only when the environment is
  explicitly configured for development/testing local parsing.
- Fixture mode remains separate and continues to serve exact fixture harness
  needs.
- Dev/test-only local patterns must not be reachable as production fallback.

## Consent And Settings Rules

- Phase 1 follows the existing AI transaction suggestions setting.
- If AI transaction suggestions are disabled, SMS/voice suggestion features
  remain inaccessible, including local parsing.
- The orchestrator must not weaken existing server-side consent checks for AI
  calls.

## Progress Rules

- Batch scan progress must continue to report filtering, parsing, and complete
  phases.
- Local-primary parsing can report a single completed chunk.
- Switching between AI, fixture, and local-parser modes must not change review
  page routing, deduplication, or save semantics.

## Diagnostics Rules

Diagnostics may include:

- parser mode
- attempted parser counts
- candidate count
- result count
- pattern IDs matched
- runtime scope counts

Diagnostics must not include:

- SMS body
- sender
- amount
- transcript
- AI/local response body
- user account names

## Caller Compatibility

Callers should receive the same high-level result shape they use today:

```ts
interface SmsParseResult {
  readonly transactions: readonly ParsedSmsTransaction[];
  readonly hasError?: boolean;
  readonly isRetryable?: boolean;
}
```

This keeps `sms-sync-service`, `sms-live-processor`, review pages, account
matching, notification handling, and save flows on their existing contracts.

## Deferred Phase-2 Fallback Rules

When phase 2 starts, it must re-specify and re-approve:

- Which AI failure classes can trigger local fallback.
- Whether local fallback can run when AI returns partial usable results.
- What trusted provenance is required for production-supported patterns.
- Whether local parser suggestions can ever be auto-selected in production.
- How user consented real SMS examples are collected, sanitized, reviewed, and
  promoted.
