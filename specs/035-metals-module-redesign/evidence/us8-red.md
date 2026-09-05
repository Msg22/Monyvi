# US8 Undo Red evidence

Date: 2026-09-05

Base: `a190d8fcd5ae5aad45179b9500f24b49388afb58`

Branch: `codex/035-metals-undo`

## Deterministic Jest Red

Command:

```text
npm test -w @monyvi/mobile -- --runInBand apps/mobile/__tests__/services/undo-metal-holding-command-service.integration.test.ts apps/mobile/__tests__/app/metals-restore.test.tsx
```

Result: expected failure, `2` suites failed. All `13` SQLite service cases
reached the absent owned service boundary:

```text
Cannot find module '../../services/undo-metal-holding-command-service'
```

The `11` component/hook cases stopped at the absent owned presentation boundary:

```text
Cannot find module '../../components/metals/RestoreMetalHoldingSheet'
```

The tests cover current uncredited Sale and Dispose reversal, exact terminal
links, permanent original History, restored same-holding Active projection, zero
account/income effect, Active/Delete/missing/non-current/mismatched and
foreign-scope rejection, replay/hash mismatch, one reversal, rollback/retry,
restart/offline behavior, and later re-record. UI contracts cover action
priority, consequence variants, reviewed gating, duplicate submission, stable-ID
retry, pending dismissal lock, focus semantics, safe area, RTL, theme, shared
responsive reflow, and inaccessible terminal state.

## Maestro Red / environment evidence

Command:

```text
npm run e2e:flow:local -w @monyvi/mobile -- e2e/maestro/metals/restore-holding.yaml
```

Result: runner preflight failed before app launch because
`device 'emulator-5554' not found`. This is an environment block, not a
product-code Red signal, so no device behavior is claimed. The flow remains an
authored contract for uncredited Sale and Dispose restoration, immutable
reversed History, absence of account effects, and offline restart.

## Shared integration boundary

- Tests inject the approved action-envelope canonicalizer. Production remains
  fail-closed with `metal_action_schema_not_approved` until shared T043 is
  integrated; this lane neither bypasses nor modifies the shared adapter.
- Shared translations and the runner fixture profile remain owned by their
  integration owners. No raw runtime copy or fixture-registry edit is included.
- T126 route/action activation and device fidelity remain open until those
  shared dependencies are present. Credited Undo T128–T130 remains blocked by
  the complete issue #242 T033 gate.
