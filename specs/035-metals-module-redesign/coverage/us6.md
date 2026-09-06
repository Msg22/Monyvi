# US6 Dispose coverage

Status: isolated deterministic Green; shared route/translations,
runner-controlled offline fixture, and device fidelity remain open.

| Manual | FR / SC | Deterministic automation | Maestro / manual | Current evidence |
| --- | --- | --- | --- | --- |
| D01–D02 | FR-025, FR-033, FR-036, FR-068, SC-020 | `metals-dispose.test.tsx`: exact catalog, direct form, required reason, focus | Manual until the shared route and fixture exist | Green: component/hook |
| D03–D08 | FR-033–FR-036, SC-020 | service mapping/consequence cases plus form conditional-summary cases | Manual user-visible summary fidelity | Green: exact category IDs, six canonical reasons, and summaries |
| D09 | FR-033, FR-067 | SQLite null/Unicode evidence test | Manual Unicode keyboard fidelity | Green: deterministic persistence |
| D10 | FR-036, FR-039, FR-063–FR-065, FR-091–FR-098, SC-002, SC-007, SC-027–SC-030 | SQLite exact group/state/revision/history/no-account test, including predecessor-less revision zero and full lifecycle/action-root reduction | Manual offline journey until a controllable offline fixture exists | Green through the production registry and command service |
| D11–D12 | FR-039, FR-076–FR-080, SC-015–SC-016 | hook duplicate-submit lock/full-command retry identity/construction cleanup; repository batch rollback/retry | Manual pending focus containment and injected local failure | Green: deterministic hook/repository |
| D13 | FR-040–FR-043, FR-047, FR-075, FR-094, SC-003, SC-010, SC-011, SC-023 | SQLite replay/payload mismatch/service recreation; unsuccessful recovery-root rejection | Manual process restart after route integration | Green: deterministic replay; process-level proof blocked |
| D14 | FR-061–FR-062, FR-073–FR-075, FR-092–FR-093 | active-only/stale-revision/foreign-user/non-effective-projection/UUID-boundary tests | Manual multi-account transition | Green: deterministic fail-closed paths |
| D15 | FR-066–FR-072, FR-077–FR-079, SC-013, SC-022, SC-024 | screen safe-area/RTL/theme/shared-breakpoint/text-scale/accessibility tests | Manual device fidelity gate | Green: component contract; device open |
| D16 | FR-080, FR-086 | pending dismissal contract; dirty-exit callback contract | Manual shared-shell guard integration | Partial: component/hook only; route open |
| D17 | FR-034–FR-036, FR-040–FR-047, FR-091 | exact consequence object and immutable state/event/evidence assertions | Manual integrated portfolio/detail/history/reporting | Green: story evidence; downstream integration open |

## Verification evidence

- Focused Jest: mobile `2` suites / `50` tests and logic `1` suite / `14` tests
  passed.
- Focused coverage: `97.48%` statements, `89.91%` branches, `96.77%`
  functions, `98.85%` lines across the Dispose service, hook, and component.
  The command service is `99.24%` statements, `97.19%` branches, `100%`
  functions, and `99.23%` lines.
- Focused ESLint: passed with zero findings.
- Prettier check/write: all owned files formatted.
- Mobile typecheck: no Dispose errors; the command remains blocked overall by
  pre-existing Slice 7 rate-trust `source` omissions and shared Add/Edit adapter
  signature errors.
- Maestro: no runnable Dispose flow is claimed. The shared holding-detail route,
  current-user fixture, and runner-controlled offline state do not exist in this
  branch, so the earlier speculative YAML was removed instead of fabricating a
  passing signal.

## Honest boundary

- The production `metals.dispose/v1` registry accepts a null predecessor only
  for revision `0`; later revisions still require a valid predecessor UUID.
- Translation keys are inventoried and injected in tests; shared translation
  resources remain single-owner integration work.
- A Maestro flow can be authored only after the shared route exposes the screen
  and a fixture can guarantee current-user ownership plus offline mode before
  launch. This lane does not invent or mutate those shared integrations.
- Device visual fidelity, shared dirty-exit shell behavior, and downstream
  portfolio/reporting surfaces are manual/integration gates, not claimed by
  isolated unit tests.
