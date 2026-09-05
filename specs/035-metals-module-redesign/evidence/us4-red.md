# US4 Red Evidence

Status: Red confirmed 2026-09-01.

T084 defines US4-M01–M08 and coverage mapping. T086–T088 assert approved one-form Edit behavior: metadata LWW; whole-fact material correction CAS; immutable exact before/after evidence and History; terminal immutability; locked Metal; persisted/current cues; conditional reason; physical-form-only consequences; direct Save/no review; dirty exit, focus, pending lock, safe area, EN/AR RTL, theme, compact reflow, and offline local-first flow.

## Executed

```text
npx jest --config apps/mobile/jest.config.js --runInBand apps/mobile/__tests__/app/metals-edit.test.tsx apps/mobile/__tests__/services/edit-metal-holding-command-service.integration.test.ts --no-coverage
```

Result: 2 suites failed, 9 tests failed, 0 harness parse/config failures in the targeted suites.

- UI: all five tests fail because approved shared `@/components/metals/MetalHoldingForm` production module is absent at base `73b9014`.
- SQLite integration: all four tests initialize the real Watermelon SQLite test database, then fail only because `services/edit-metal-holding-command-service` is absent.
- First attempted root-Jest command used unsupported plural `--testPathPatterns`; it ran unrelated repository suites and timed out. It is excluded from US4 result. The explicit mobile Jest config command above is authoritative.

Expected Red cause only: T090/T091 Edit production boundary does not exist on base `73b9014` (`edit-metal-holding-command-service`, Edit route/facade, and Edit mode in `MetalHoldingForm`). Existing Jest/RNTL and SQLite harness load before intended missing-production failures.
