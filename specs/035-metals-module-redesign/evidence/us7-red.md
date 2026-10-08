# US7 Delete Red Evidence

Date: 2026-09-05

Branch/base: `codex/035-metals-delete` / stable Slice 7 checkpoint `a190d8f`

## Source boundary

- `spec.md`, `docs/business/business-decisions.md`, `data-model.md`, the
  command/read-model contracts, content contract, and approved Screen 14 agree:
  Delete applies only to an effective Active mistaken record.
- Approved payload registration already defines event-only
  `delete/metals.delete/v1` with `holdingId`, `expectedHoldingRevision`,
  `predecessorEventId`, and `reversesEventId: null`.
- The shared action adapter remains deliberately fail-closed pending T043. The
  Red tests therefore inject the approved envelope boundary and make no shared
  adapter, registry, locale, fixture, barrel, or route change.

## Deterministic Red run

Command:

`npm test -w @monyvi/mobile -- --runInBand __tests__/services/delete-metal-holding-command-service.integration.test.ts __tests__/app/metals-delete.test.tsx`

Result: intended Red — 2 suites failed, 23 tests failed. Every failure is caused
by one of the three intentionally absent US7 production modules:

- `services/delete-metal-holding-command-service`
- `hooks/useDeleteMetalHolding`
- `components/metals/DeleteMetalHoldingSheet` or its isolated
  `holding-actions/delete-action` descriptor

The SQLite adapter initialized successfully. No assertion failed against an
existing implementation and no unrelated suite failure was mixed into this
evidence.

## Covered Red behavior

- Active/effective/visible eligibility; Sold, Disposed, hidden, incomplete, and
  foreign-owned rejection.
- One atomic local grouped Delete action; replay, hash mismatch, rollback,
  retry, and restart.
- Hidden, non-effective, non-deleted creation/correction/Delete audit and sync
  rows with the holding projection absent from normal surfaces.
- No account, transaction, transfer, rate, sale, disposal, proceeds, realized
  P/L, write-off, or other financial/reporting payload.
- Approved focused confirmation copy and facts, initial/recovery focus, modal
  isolation, pending/double-submit/dismissal lock, safe area, RTL, theme,
  compact/ordinary/tablet/200% reflow, and isolated destructive descriptor.

## Maestro status

`apps/mobile/e2e/maestro/metals/delete-holding.yaml` contains only the partial
Active/restart Red sequence. Offline establishment and terminal-state assertions
are missing and blocked until integration owners provide the live route, shared
approved copy, offline harness control, Active/terminal fixture profiles, and
T043 adapter activation. No device or E2E completion is claimed.
