# Task-generation validation

Validated locally on 2026-10-07 against source
`4a13b67d02037bc2fb4e4c68c217480d02ea626c`. This reports artifact validation
only, not implementation/tests passing.

- `tasks.md`: **59** unchecked tasks, sequential T001–T059, concrete paths and
  valid checklist syntax.
- Story counts: **US0 12**, **US1 15**, **US2 15**, **US3 4**;
  setup/foundation/final **13**.
- Traceability: all **36 FR** and **15 SC** rows occur exactly once, with mapped
  existing task IDs.
- Prerequisite command with both explicit feature overrides and
  `--json --require-tasks --include-tasks`: exits 0, selects
  `specs/389-voice-usage-limits`, includes
  research/data-model/contracts/quickstart/tasks.
- Both approved image copies match original byte counts and SHA-256 hashes in
  `mockups/README.md`. No rendering/editing/regeneration was performed.
- Both sidecar image/metadata/combined fingerprints independently recomputed
  successfully; sidecars use UTF-8/LF and remain **PENDING**.
- Binding verifier exits **1** for both sidecars with only the expected
  pending-approval/revision/evidence errors. No hash mismatch was reported.
  Governed UI production remains blocked.
- Actual Prettier `--write` then `--check` for all five Markdown deliverables
  exits 0. Sidecar header lists use a scoped `prettier-ignore` marker to
  preserve the verifier-required single-line revision fields; Binding
  Facts/combined hashes were recomputed after formatting.
- `git diff --check` exits 0. No Git state mutations, commits, remote edits,
  hosted changes or production files were written.

Required next gates:

1. Read-only independent artifact review is complete; T003 smallest approved
   artifact reconciliation remains open before affected production assignments:
   inherited/current HTTP and availability schema drift, optional existing
   relative-date fallback, stale layout-owned refresh guidance, and cleanup
   versus replay horizon.
2. Binding context/metadata approval at immutable combined revisions and
   verifier exit 0 before governed UI production.
3. Accepted executed behavioral Red/E2E evidence before corresponding
   implementation; unprovided database/emulator/audio/provider-double
   capabilities remain honestly blocked.

The checklist includes separate rendered visual evidence tasks T034/T049 and
accessibility evidence tasks T035/T050. These are not satisfied by static source
inspection. Hosted deployment/policy work is a separate later authorization.
