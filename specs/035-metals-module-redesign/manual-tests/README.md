# Metals Manual-Test Templates

Each story owner creates its plan before Green work. Manual-only means runner
control cannot honestly prove a case; it never replaces deterministic unit,
integration, UI, or Maestro coverage. Record device/build/base, current user,
network, locale/direction, theme, viewport/text scale, rate fixtures, result,
evidence, and owner.

| Story | Future manual plan | Coverage fragment |
| --- | --- | --- |
| US1 connected portfolio | `us1-connected-portfolio.md` | `coverage/us1.md` |
| US2 add holding | `us2-add-holding.md` | `coverage/us2.md` |
| US3 holding/history | `us3-holding-history.md` | `coverage/us3.md` |
| US4 edit/correction | `us4-edit-correction.md` | `coverage/us4.md` |
| US5 sell | `us5-sell.md` | `coverage/us5.md` |
| US6 dispose | `us6-dispose.md` | `coverage/us6.md` |
| US7 delete | `us7-delete.md` | `coverage/us7.md` |
| US8 undo | `us8-undo.md` | `coverage/us8.md` |
| US9 rate trust | `us9-rate-trust.md` | `coverage/us9.md` |
| US10 recovery/conflict | `us10-recovery.md` | `coverage/us10.md` |

## Story Scenario Template

```markdown
# US[N]: [story]

Owner: [name]  Date/build/base: [values]
Requirements: [FR IDs]  Success criteria: [SC IDs]
Automated counterpart: [unit/integration/UI/Maestro path or command]

| ID | Preconditions and fixture | User journey | Expected observable result | Automated? | Evidence |
| --- | --- | --- | --- | --- | --- |
| US[N]-M01 | [identity/data/rate/network] | [steps] | [financial/UI result] | Yes/No | [link/run] |

State coverage: loading, empty, populated, offline, restart, stale/unknown/missing
rates, error/retry, pending, local-complete, sync failure, incomplete, conflict,
locale/direction, theme, safe-area, compact/ordinary/tablet, orientation, 200% text,
and keyboard/switch/screen-reader where applicable.
```

## Manual-Only Rationale Template

```markdown
### Manual-only: [ID]
Scenario: [exact visible journey]
Why automation cannot honestly control it: [concrete runner limitation]
Deterministic coverage retained: [test paths/commands]
Human owner and environment: [name/device/build]
Pass/fail evidence: [video/screenshot/timestamp/observation]
Runner follow-up: [test to add when controllable]
```

SC-001 is moderated product-research acceptance only after separate approval of
sampling method, sample-size rationale, confidence/decision rule, recruitment
constraints, and analysis plan; do not invent participant count. SC-002 timing is
QA-owned. Assistive technology, physical offline/restart, two-device conflict, and
visual reflow may be manual only with the rationale above.
