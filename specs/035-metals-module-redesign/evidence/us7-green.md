# US7 Delete Isolated Green Evidence

Date: 2026-09-06

Branch/base: `codex/035-metals-delete` / stable Slice 7 checkpoint `a190d8f`

## Implemented boundary

- Active/effective/visible-only command service using the injected approved
  `delete/metals.delete/v1` envelope boundary.
- One atomic local grouped action that hides the holding state and retains every
  creation/correction/Delete row as non-deleted, hidden, non-effective audit and
  sync evidence.
- Hook-owned pending/error/retry state with a synchronous duplicate guard and
  the complete original command retained across execution retries.
- Presentational focused Screen 14 sheet with injected approved copy and facts,
  native initial/recovery focus, modal isolation, pending dismissal lock, safe
  area, a bounded scrollable content region with anchored actions, RTL/theme,
  and responsive reflow.
- Frozen holding-scoped destructive descriptor. No shared registry or live route
  activation.

## Focused verification

- Review follow-up Red: 2 suites ran; 10 tests failed and 22 passed. Failures
  reproduced lifecycle-kind, revision-zero, generated-ID, unsuccessful-replay,
  bounded-scroll, complete-command retry, and command-construction cleanup gaps.
- Last full isolated Jest run before the later review-only follow-ups: 2 suites
  passed, 32 tests passed at the verified `8d6bece` checkpoint, including
  lifecycle-kind, predecessor-less revision-zero, malformed/duplicate generated-ID,
  unsuccessful replay, command-construction cleanup, complete-command retry,
  bounded-scroll, and StrictMode cases.
- Current review follow-ups add source-contract coverage for reconciled action
  roots and for the dark destructive button token. In this remote session, a
  focused source probe reproduced the contrast failure with `dark:bg-red-500`
  and passed with `dark:bg-red-600` before the production edit. The repository
  Jest runner is not available in this chat environment, and GitHub exposes no
  Actions workflow/status for the current PR head, so the historical 32-test run
  is not extrapolated to the latest commits.
- The last full scoped ESLint, Prettier, and `git diff --check` run at the
  verified `8d6bece` checkpoint passed. No later full workspace-run claim is
  made from this remote session.
- Mobile TypeScript: no US7-owned diagnostic at the last full run. The workspace
  command remained blocked only by unrelated existing live-rates and Add/Edit
  facade diagnostics.

## Financial and persistence evidence

The real SQLite suite proves exact successful replay and hash mismatch behavior,
recovery-state replay rejection, batch rollback and retry, foreign-owner
rejection, terminal/non-effective rejection, predecessor-less revision-zero
Delete through the approved injected envelope boundary, offline database
re-instantiation, unchanged account balance, zero transactions, zero transfers,
zero rate references, and an event-only payload with no sale, disposal,
proceeds, P/L, write-off, transfer, or account key.

## Open integration and device gates

- The Expo route is intentionally absent; adding it now would create a dead
  route or bypass the fail-closed T043 boundary.
- Maestro remains partial and not run. The Active/restart sequence lacks a live
  route; offline establishment and terminal assertions are explicitly missing
  because their harness controls and fixtures are integration-owned.
- The shared action registry on this stacked base does not yet accept the
  approved predecessor-less revision-zero Delete envelope; the service path is
  covered through a test-only contract registry without changing shared files.
- Shared approved locale registration, shared action registry composition,
  detail navigation, sync runtime, device visual fidelity, and actual assistive
  technology remain open. No completion is claimed for those gates.
