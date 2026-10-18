---
alwaysApply: true
---

# Testing and delivery requirements

Follow
[the owner-approved delivery workflow](../../docs/development-workflow.md).

1. Implement approved behavior directly; no mandatory tests-before-code gate.
2. Batch TypeScript, lint and relevant existing checks at
   integration/pre-commit.
3. Mohamed performs manual testing; fix feedback before stabilizing behavior.
4. Add unit/integration and controllable E2E regression coverage for feedback,
   core paths and relevant edge cases; run final affected checks in a batch.

Financial writes, balances, sync, retries, ownership and data-loss changes
require focused deterministic tests and independent review before merge, even
without manual defects. These tests may follow implementation. Preserve existing
CI thresholds, tests and hooks. No emulator/device execution unless explicitly
requested. Report pending manual acceptance and unexecuted checks honestly.

Use `tdd-guide` for assigned regression-test authorship after implementation or
for TDD only when Mohamed explicitly requests that scoped approach. Diagnose
failed assertions, fixture isolation and mocks before changing correct tests.
