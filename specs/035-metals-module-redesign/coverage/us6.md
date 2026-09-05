# US6 Dispose coverage

Status: isolated deterministic Green; production route, runtime coordinator,
shared translations/fixture, and device fidelity remain open.

| Manual | FR / SC | Deterministic automation | Maestro / manual | Current evidence |
| --- | --- | --- | --- | --- |
| D01–D02 | FR-025, FR-033, FR-036, FR-068, SC-020 | `metals-dispose.test.tsx`: exact catalog, direct form, required reason, focus | `dispose-holding.yaml`: route/catalog/required error | Green: component/hook |
| D03–D08 | FR-033–FR-036, SC-020 | service mapping/consequence cases plus form conditional-summary cases | Maestro covers Other/write-off/external-transfer summaries; second terminal meaning is deterministic integration coverage | Green: six canonical reasons and exact summaries |
| D09 | FR-033, FR-067 | SQLite null/Unicode evidence test | Manual Unicode keyboard fidelity | Green: deterministic persistence |
| D10 | FR-036, FR-039, FR-063–FR-065, FR-091–FR-098, SC-002, SC-007, SC-027–SC-030 | SQLite exact group/state/revision/history/no-account test | Maestro offline profile | Green through injected coordinator; runtime open |
| D11–D12 | FR-039, FR-076–FR-080, SC-015–SC-016 | hook coalescing/preserved-facts/stable-ID retry; repository batch rollback/retry | Manual pending focus containment and injected local failure | Green: deterministic hook/repository |
| D13 | FR-040–FR-043, FR-047, FR-075, FR-094, SC-003, SC-010, SC-011, SC-023 | SQLite replay/payload mismatch/service recreation and persisted projection | Maestro process restart without clearing state | Green: deterministic restart simulation; device open |
| D14 | FR-061–FR-062, FR-073–FR-075, FR-092–FR-093 | active-only/stale-revision/foreign-user tests | Manual multi-account transition | Green: deterministic fail-closed paths |
| D15 | FR-066–FR-072, FR-077–FR-079, SC-013, SC-022, SC-024 | screen safe-area/RTL/theme/shared-breakpoint/text-scale/accessibility tests | Manual device fidelity gate | Green: component contract; device open |
| D16 | FR-080, FR-086 | pending dismissal contract; dirty-exit callback contract | Manual shared-shell guard integration | Partial: component/hook only; route open |
| D17 | FR-034–FR-036, FR-040–FR-047, FR-091 | exact consequence object and immutable state/event/evidence assertions | Manual integrated portfolio/detail/history/reporting | Green: story evidence; downstream integration open |

## Verification evidence

- Focused Jest: `2` suites, `31` tests passed.
- Focused coverage: `95.69%` statements, `89.26%` branches, `95.91%` functions,
  `97.44%` lines across the Dispose service, hook, and component.
- Focused ESLint: passed with zero findings.
- Prettier check/write: all owned files formatted.
- Mobile typecheck: no Dispose errors; the command remains blocked overall by
  pre-existing Slice 7 rate-trust `source` omissions and shared Add/Edit adapter
  signature errors.
- Maestro: not run past preflight; `emulator-5554` was unavailable.

## Honest boundary

- The story injects the canonicalizer in deterministic tests. Production
  `metal-financial-action-adapter.ts` still fails closed with
  `metal_action_schema_not_approved` until shared T043 is integrated.
- Translation keys are inventoried and injected in tests; shared translation
  resources remain single-owner integration work.
- The Maestro flow is runner-controllable once its current-user Active holding
  and offline cached profile are supplied by the shared fixture owner. This lane
  does not mutate the fixture registry.
- Device visual fidelity, shared dirty-exit shell behavior, and downstream
  portfolio/reporting surfaces are manual/integration gates, not claimed by
  isolated unit tests.
