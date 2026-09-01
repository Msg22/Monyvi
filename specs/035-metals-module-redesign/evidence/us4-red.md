# US4 Red Evidence

Base: `5e418cc83802d830ffc3176d06d0b7a7affc9e4d` Date: 2026-09-01 Scope: T084,
T085, and T087. T086, T088, and T089 remain open.

## T084 traceability and manual plan

- Created manual scenarios for ordinary metadata, material corrections, reverted
  deltas, physical-form-only consequences, locked Metal, terminals, legacy
  acquisition facts, unavailable rates, offline/restart, and device variants.
- Created requirement mapping for FR-018–FR-024, supporting acquisition rules,
  and applicable SCs. It makes no command, UI, persistence, or Maestro claim.

## T085 intended Red command

```text
cd apps/mobile
node ../../node_modules/jest/bin/jest.js --config jest.config.js --runInBand --testPathPattern='edit-metal-holding-preview-command.test.ts' --no-coverage --watchman=false
```

Result: 1 failed suite, 7 failed tests, in 7.723 seconds.

```text
Cannot find module '../../services/edit-metal-holding-preview-service'
Cannot find module '../../services/edit-metal-holding-command-service'
```

The missing T090 preview/command boundaries are the only failure categories:

- exact persisted/current material comparison versus name/notes metadata;
- reason requirement only while a material delta exists, with direct Save and no
  review route after revert;
- physical-form-only unchanged-value/P&L/render/History consequence;
- locked Metal; terminal financial immutability/Undo; metadata LWW only;
- honest missing legacy acquisition facts and complete exact replacement set;
- unavailable value/P&L explicit without zero, compatibility fallback, or
  invented rate attribution.

## T087 intended Red command

```text
cd apps/mobile
node ../../node_modules/jest/bin/jest.js --config jest.config.js --runInBand --testPathPattern='metals-edit.test.tsx' --no-coverage --watchman=false
```

Result: 1 failed suite, 7 failed tests, in 20.925 seconds.

```text
Cannot find module '../../components/metals/MetalHoldingForm'
Cannot find module '../../app/(private)/metals/[holdingId]/edit'
```

Six same-form UI cases reach the absent shared form and the route case reaches
the absent isolated Edit route. This is intended Red, not a router/native/DB or
dependency-junction failure.

Declared UI categories blocked by those boundaries:

- Add-equivalent field order, locked Metal, direct Save/no mandatory review,
  material previous/current cues, reason toggle, and live summary in place;
- ordinary versus compact paired fields, EN/Arabic RTL, light/dark, 200% text,
  labels, and terminal metadata-only limits;
- Skeleton loading, safe-area Save action, validation focus, dirty exit, and a
  pending double-submit lock.

## T088 authored but unexecuted

`e2e/maestro/metals/edit-holding.yaml` defines profile-driven metadata,
material/reverted-delta, offline/restart, and Arabic/stale journeys. It remains
unchecked: this base lacks the Edit route/shared selectors and an edit-clean
fixture identity, so Maestro cannot reach a meaningful Red or success state.

## Remaining gate status

- T086 SQLite/CAS/history remains outside this lane. T088 stays unexecuted and
  unchecked until the route/selectors and fixture identity exist.
- T089 remains unchecked because it requires T085–T088 Red artifacts and their
  combined evidence.
