---
description:
  Optional test-first command, only when Mohamed explicitly requests TDD for a
  scoped task. Default delivery uses direct implementation and owner manual QA.
---

# Optional TDD command

Explicit `/tdd` invocation selects TDD for the named task only. Do not invoke it
automatically for features, bug fixes, refactors or financial work.

The default remains [the delivery workflow](../../docs/development-workflow.md):
direct implementation, batched existing checks, Mohamed's manual testing, then
regression coverage after behavior stabilizes. Required financial/sync/data
safety tests precede merge and may follow implementation.

For an explicitly requested TDD task:

1. Define the approved observable behavior and write a focused regression test.
2. Verify it fails for the intended behavior, not broken setup.
3. Implement the smallest correct change and verify the test passes.
4. Refactor without weakening correct assertions; run the affected final batch.

Respect Mohamed's batch-check and emulator/device restrictions. Keep coverage
within the approved task; preserve existing CI thresholds and tests. Report
actual results, owner manual status and any unexecuted cases separately.
