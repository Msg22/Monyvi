# US7 Delete Isolated Green Evidence

Date: 2026-09-05

Branch/base: `codex/035-metals-delete` / stable Slice 7 checkpoint `a190d8f`

## Implemented boundary

- Active/effective/visible-only command service using the injected approved
  `delete/metals.delete/v1` envelope boundary.
- One atomic local grouped action that hides the holding state and retains every
  creation/correction/Delete row as non-deleted, hidden, non-effective audit and
  sync evidence.
- Hook-owned pending/error/retry state with a synchronous duplicate guard and
  stable action/evidence/event identity across retry.
- Presentational focused Screen 14 sheet with injected approved copy and facts,
  native initial/recovery focus, modal isolation, pending dismissal lock, safe
  area, RTL/theme, and responsive reflow.
- Frozen holding-scoped destructive descriptor. No shared registry or live route
  activation.

## Focused verification

- Jest: 2 suites passed, 23 tests passed.
- Scoped ESLint: passed for the two tests and four production modules.
- Prettier: passed for every US7-owned source, test, Maestro, manual, coverage,
  and evidence file.
- `git diff --check`: passed.
- Mobile TypeScript: no US7-owned diagnostic. The workspace command remains
  blocked by pre-existing Slice 7 diagnostics: missing `source` fields in live
  rate trust fixtures/fallbacks and the existing Add/Edit facade
  `validationInput` mismatch against the fail-closed adapter input type.

## Financial and persistence evidence

The real SQLite suite proves exact replay and hash mismatch behavior, batch
rollback and retry, foreign-owner rejection, terminal/non-effective rejection,
offline database re-instantiation, unchanged account balance, zero transactions,
zero transfers, zero rate references, and an event-only payload with no sale,
disposal, proceeds, P/L, write-off, transfer, or account key.

## Open integration and device gates

- The Expo route is intentionally absent; adding it now would create a dead
  route or bypass the fail-closed T043 boundary.
- Maestro is authored but not run because the live route and deterministic
  Active/terminal fixture profiles are integration-owned.
- Shared approved locale registration, shared action registry composition,
  detail navigation, sync runtime, device visual fidelity, and actual assistive
  technology remain open. No completion is claimed for those gates.
