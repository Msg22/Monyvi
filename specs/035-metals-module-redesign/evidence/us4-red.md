# US4 Red Evidence

Status: Red partially confirmed.

This is partial Red evidence: T086/T087 were run, while T085's named suite
was not authored and the T088 Maestro journey has not run. T089 remains
unchecked. Later automated Green results are recorded in `coverage/us4.md`.

T084 defines US4-M01–M08 and their intended coverage. The executed T086/T087 Red suites below establish that the Edit form and command modules were absent at base, after the UI and SQLite harnesses loaded. They do not prove any Edit behavior. T088 Maestro, whole-fact CAS, rollback/restart, and offline flow are not evidenced here; see `coverage/us4.md` for later results and gaps.

## Executed

```text
npx jest --config apps/mobile/jest.config.js --runInBand apps/mobile/__tests__/app/metals-edit.test.tsx apps/mobile/__tests__/services/edit-metal-holding-command-service.integration.test.ts --no-coverage
```

Result: 2 suites failed, 9 tests failed, 0 harness parse/config failures in the targeted suites.

- UI: all five tests fail because approved shared `@/components/metals/MetalHoldingForm` production module is absent at base.
- SQLite integration: all four tests initialize the real Watermelon SQLite test database, then fail only because `services/edit-metal-holding-command-service` is absent.
- Explicit mobile Jest config command above is authoritative.

Expected Red cause only: T090/T091 Edit production boundary does not exist (`edit-metal-holding-command-service`, Edit route/facade, and Edit mode in `MetalHoldingForm`). Existing Jest/RNTL and SQLite harness load before intended missing-production failures.
