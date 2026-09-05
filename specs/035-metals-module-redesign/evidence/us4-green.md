# US4 Edit Green Evidence

Status: deterministic code gate Green on 2026-09-01; device/Maestro gate pending.

## Commands and results

```text
npm run typecheck -w @monyvi/mobile
PASS

node node_modules/jest/bin/jest.js --config apps/mobile/jest.config.js --runInBand --testPathPattern='metals-add.test.tsx|metals-edit.test.tsx|edit-metal-holding-preview-service.test.ts|edit-metal-holding-command-service.integration.test.ts|metals-content-contract.test.ts' --no-coverage --watchman=false --silent
Test Suites: 5 passed, 5 total
Tests:       27 passed, 27 total

node node_modules/eslint/bin/eslint.js <US4 changed TypeScript files> --rulesdir scripts/eslint-rules --quiet
PASS

git diff --check
PASS
```

The focused SQLite suite uses the real WatermelonDB schema and proves one local atomic correction group updates the current projection, increments the canonical holding revision, deactivates the predecessor event, and appends immutable evidence/History. Metadata-only edits bypass the financial-action stream. Same-action replay is idempotent and a changed payload with the same action ID fails closed.

## Pending

The checked-in Maestro journey was authored during Red. It was not executed in this lane because the physical-device QA lock prohibits Metro/native/device work. T092 remains unchecked until Maestro plus required manual responsive/accessibility checks have real evidence.
