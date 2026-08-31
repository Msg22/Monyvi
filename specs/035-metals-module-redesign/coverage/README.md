# Metals V1 Traceability Inventory

Status: planning inventory and Slice 2 foundation evidence only. This is not a
claim that later persistence, mobile, synchronization, or Maestro work is
implemented. The approved requirement wording remains in
[`../spec.md`](../spec.md); task ownership remains in
[`../tasks.md`](../tasks.md).

## Traceability rules

- A row is traceable when it identifies its authoritative requirement range,
  owning delivery slice, and the proof artifact that must be updated when that
  range changes.
- A checked task is evidence of its stated deliverable only. It never marks a
  user story, requirement, or success criterion implemented by implication.
- Story owners add `coverage/usN.md` fragments before Green work. Slice 9 alone
  composes those fragments into the release coverage matrix.
- Manual-only proof uses the template in
  [`../manual-tests/README.md`](../manual-tests/README.md) and must state why a
  runner cannot honestly control the scenario.

## Functional-requirement inventory

| Requirement IDs | Delivery owner/slice | Required proof location | Current foundation state |
| --- | --- | --- | --- |
| FR-001–FR-007 | Slice 5, US1 and US9 | `coverage/us1.md`, `coverage/us9.md`, UI tests, Maestro | Planned |
| FR-008–FR-017 | Slice 7, US2; Slice 6 detail handoff | `coverage/us2.md`, `coverage/us3.md`, form/UI tests, Maestro | Pure numeric/catalog support only; UI planned |
| FR-018–FR-024 | Slice 7, US4 | `coverage/us4.md`, correction tests, Maestro | Planned |
| FR-025–FR-032 | Slice 8, US5 | `coverage/us5.md`, lifecycle/action tests, Maestro | Pure sale attribution only; persistence/action UI planned |
| FR-033–FR-036 | Slice 8, US6 | `coverage/us6.md`, lifecycle/action tests, Maestro | Planned |
| FR-037–FR-038 | Slice 8, US7 | `coverage/us7.md`, reconciliation tests, Maestro | Pure lifecycle rejection support only; persistence/UI planned |
| FR-039–FR-044 | Slice 8, US8 and US10 | `coverage/us8.md`, `coverage/us10.md`, recovery tests, Maestro | Pure reducer support only; recovery UI planned |
| FR-045–FR-051 | Slice 2 plus downstream presentation slices | `evidence/slice-2-green.md`, parity tests, later story fragments | Slice 2 exact arithmetic/attribution evidence recorded |
| FR-052–FR-061 | Slice 4 and Slice 8 | persistence/action tests, `coverage/us5.md`–`coverage/us8.md` | Planned |
| FR-062–FR-069 | Slice 4, Slice 5, US9 | rate/sync tests, `coverage/us9.md`, Maestro | Slice 2 trust classification evidence recorded; surfaces planned |
| FR-070–FR-078 | Slice 4 and story slices | schema/sync tests and affected story fragments | Planned |
| FR-079–FR-086 | Slice 4, Slice 8, US10 | reconciliation/action tests, `coverage/us10.md` | Pure reducer evidence recorded; persistence/recovery planned |
| FR-087–FR-094 | Slice 5–Slice 8 | per-story UI/layout/accessibility tests and Maestro | Planned |
| FR-095–FR-104 | Slice 9 integration/quality | final `coverage-matrix.md`, manual plans, Maestro | Planned |

## Success-criterion inventory

| Criterion IDs | Proof owner | Evidence contract | Current state |
| --- | --- | --- | --- |
| SC-001 | Product research owner | Approved research protocol and decision record | Reserved; not an implementation criterion |
| SC-002 | QA owner | Measured timing evidence and device/build record | Planned |
| SC-003 | Slice 5 | US1/UI/Maestro proof | Planned |
| SC-004–SC-006 | Slice 2 | [`../evidence/slice-2-green.md`](../evidence/slice-2-green.md) | Foundation evidence recorded |
| SC-007–SC-008 | Slice 4 and story owners | schema/sync plus story proof | Planned |
| SC-009 | Future owner | Explicitly reserved; no V1 implementation claim | Reserved |
| SC-010–SC-016 | Story owners | `coverage/usN.md`, UI tests, Maestro, manual-only rationale | Planned |
| SC-017–SC-018 | Slice 2 | [`../evidence/slice-2-green.md`](../evidence/slice-2-green.md) | Foundation evidence recorded |
| SC-019–SC-020 | Slice 4 and Slice 8 | persistence/reconciliation and story proof | Planned |
| SC-021 | Slice 2 | [`../evidence/slice-2-green.md`](../evidence/slice-2-green.md) | Foundation evidence recorded |
| SC-022–SC-025 | Story owners | affected story fragments and manual/device proof | Planned |
| SC-026 | Slice 2 | [`../evidence/slice-2-green.md`](../evidence/slice-2-green.md) | Foundation evidence recorded |
| SC-027–SC-030 | Slice 9 | final coverage matrix and release evidence | Planned |

## Metals pure-logic inventory

The stable Slice 2 boundary is the local barrel
`packages/logic/src/metals/index.ts`. The root `@monyvi/logic` barrel remains
unchanged until the named package-integration owner performs T034. Consumers
must not deep-import a Metals implementation module or assume a package subpath
that is not yet exported.

The public API is recorded in
[`../evidence/metals-logic-api.md`](../evidence/metals-logic-api.md): opaque
Decimal values and boundaries, Gold/Silver purity catalog, valuation,
attribution, lifecycle reduction, rate trust, and typed rate-reference
validation. It is a local foundation contract, not a mobile/persistence API.

Latest validated Slice 2 command record (2026-08-31):

```powershell
Set-Location E:\Work\My Projects\Monyvi-metals-redesign\packages\logic
npx jest --testPathPattern='src/metals/__tests__/' --coverage --runInBand --watchman=false --cacheDirectory 'E:/Work/My Projects/Monyvi/node_modules/.cache/jest-metals'
npm run typecheck -w @monyvi/logic
```

The recorded complete Metals suite passed 8/8 suites and 229/229 tests; coverage
was 94.67% statements, 87.56% branches, 100% functions, and 94.62% lines.
Those are dated verification results, not release coverage guarantees. See
[`../evidence/slice-2-green.md`](../evidence/slice-2-green.md) for commands,
coverage scope, and later supersession records.
