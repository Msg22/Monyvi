# US4 Red Evidence

Base: `38098dd` Date: 2026-09-01 Scope: T084 and T085 only. T086–T089 remain
open.

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

## Remaining gate status

- T086 SQLite/CAS/history, T087 form/route, and T088 Maestro remain outside this
  lane and unchecked.
- T089 remains unchecked because it requires T085–T088 Red artifacts and their
  combined evidence.
