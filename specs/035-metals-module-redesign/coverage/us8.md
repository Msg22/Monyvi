# US8 Undo coverage

Status: isolated deterministic Green; live descriptor/route, runtime
coordinator, shared translations/fixture, and device fidelity remain open.

| Manual  | FR / SC                                                                                                       | Deterministic automation                                                                                                | Maestro / manual                                                  | Current evidence                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| U01–U05 | FR-042, FR-076, FR-087, FR-092, SC-002, SC-015, SC-024, SC-028                                                | `metals-restore.test.tsx`: action priority, exact consequence variants, reviewed gate, cancel/pending/focus contracts   | `restore-holding.yaml`: eligible confirmation and reviewed submit | Green: component/hook; live route focus restoration open                   |
| U06–U08 | FR-039–FR-045, FR-047, FR-091, FR-094, FR-097, FR-098, SC-003, SC-007, SC-023, SC-027, SC-030                 | SQLite exact root/evidence/event/state/linkage, immutable terminal History, consequence and no-account-table assertions | Maestro Sale/Dispose restore and History assertions               | Green through injected coordinator; runtime integration open               |
| U09–U12 | FR-061, FR-062, FR-076–FR-080, SC-003, SC-015, SC-024, SC-027                                                 | hook double-submit/stable-ID retry; repository rollback/replay/restart tests                                            | Maestro pending lock and offline process restart                  | Green: deterministic hook/repository; device open                          |
| U13     | FR-023, FR-024, FR-042, FR-044, FR-045, FR-063, FR-064, FR-077, FR-087                                        | Active/Delete/missing/non-current/mismatched/stale-revision/credited/foreign-scope rejection tests                      | Manual multi-account and prohibited-state activation              | Green: deterministic fail-closed paths                                     |
| U14     | FR-024, FR-040, FR-043, FR-082, SC-007, SC-024                                                                | SQLite later terminal event and second explicit reversal on the same holding                                            | Manual integrated re-record journey                               | Green: service; downstream route open                                      |
| U15–U16 | FR-064–FR-071, FR-076, FR-092, SC-010, SC-011, SC-013, SC-028, SC-029                                         | screen safe-area/RTL/theme/shared-reflow/accessibility plus current-user service rejection                              | Manual device/input/focus/auth fidelity gate                      | Partial: deterministic contracts Green; device/auth-shell integration open |
| U17–U19 | FR-030, FR-039, FR-044, FR-045, FR-077–FR-080, FR-091, FR-094, SC-003, SC-008, SC-015, SC-016, SC-023, SC-027 | T128 credited-Undo deterministic harness                                                                                | T129 `restore-credited-sale.yaml`                                 | Blocked by full #242 T033; intentionally not claimed                       |

## Verification evidence

- Focused Jest: `2` suites, `28` tests passed.
- Focused coverage: `93.58%` statements, `84.89%` branches, `100%` functions,
  and `94.79%` lines across the Undo service, hook, and sheet.
- Focused ESLint: passed with zero findings.
- Prettier: all owned TypeScript, TSX, Markdown, and YAML files formatted.
- Mobile typecheck: no Undo errors; the command remains blocked overall by
  pre-existing Slice 7 rate-trust `source` omissions and shared Add/Edit adapter
  `validationInput` signature errors.
- Maestro: not run past preflight; `emulator-5554` was unavailable.

## Honest boundary

- Deterministic tests may inject the approved action-envelope canonicalizer.
  Production must continue to fail closed until shared T043 is integrated; this
  lane does not bypass or modify the shared adapter.
- Shared translation keys and fixture registry remain single-owner integration
  work. The sheet consumes injected copy and the Maestro file declares fixture
  requirements without inventing runtime copy or fixture data.
- T126 cannot be complete until an honest live descriptor/route can consume the
  shared coordinator and translations. No dead Expo route is acceptable.
- Credited Undo is deliberately excluded from this Green slice and remains
  blocked under T128–T130 by full issue #242 T033.
