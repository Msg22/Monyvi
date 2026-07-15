# Implementation Plan: Trusted QA SMS Pattern Intake

**Branch**: `codex/phase-2a-trusted-qa-sms-patterns-750` | **Date**: 2026-07-13
| **Spec**: [spec.md](./spec.md) **Input**: Feature specification from
`/specs/029-trusted-qa-sms-patterns/spec.md`

## Summary

Build a development-only Android QA tool that reads a bounded QNB inbox view
only after explicit session authorization, lets the QA operator select messages,
sanitizes selected messages into structured placeholder segments in memory,
supports constrained local corrections, and exports only a validated JSON
artifact through Android's local document storage picker. Add a separate
review-only candidate/family catalog in `packages/logic` with provenance,
evidence, versioning, per-currency validation, and promotion-state rules. The
candidate catalog is not imported by the active local parser catalog, so Phase
2A cannot change production, fallback, auto-selection, live SMS, batch SMS,
deduplication, or AI behavior. Candidate matching is confined to a non-exported
QA evaluator that returns validation results only. The approved five-state UX is
implemented from the feature mockups with existing Monyvi theme and safe-area
primitives.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode; React 19.2; React Native
0.83; Expo SDK 55 **Primary Dependencies**: Existing
`react-native-get-sms-android`, `expo-file-system/legacy`, `expo-crypto`,
`expo-secure-store`, AsyncStorage, Expo Router, React Native Testing Library;
add `zod` as an explicit `@monyvi/logic` dependency for artifact boundary
validation **Storage**: Raw messages and drafts in memory only; approved
artifacts written to an operator-selected Android directory; reviewed sanitized
candidate records stored in source control; no WatermelonDB or Supabase storage
**Testing**: Jest, `@testing-library/react-native`, existing mobile service test
patterns, catalog contract tests, deterministic route/component integration
coverage, and manual-only physical-device checks for the internal development
flow, real SMS inbox, and Android document picker **Target Platform**: Android
development builds only; hidden and unreachable in release builds; no iOS
behavior **Project Type**: Monorepo mobile app plus shared pure parser package
**Performance Goals**: A bounded 3,000-message QNB inbox query remains
responsive; sanitization and validation of up to 50 selected messages complete
within one second on the QA device; long lists remain virtualized
**Constraints**: Offline-only intake and export; no raw SMS persistence, logs,
clipboard, share sheet, network call, issue text, test snapshot, or source
control; fail-closed validation; explicit `__DEV__` plus feature-flag guard;
candidate patterns never enter an active runtime catalog **Scale/Scope**: One
authorized QA operator, QNB sender aliases, EGP and USD, five
transaction-producing families and four rejection families in Phase 2A; data
contracts must admit later consented-user evidence without redesign

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Design Gates

| Gate                      | Result                          | Evidence                                                                                                                                                                                          |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline-first             | PASS                            | The workflow is local-only and adds no cloud dependency or user-facing DB state.                                                                                                                  |
| Documented business logic | PASS                            | Finalized Phase 2A rules are recorded in `docs/business/business-decisions.md`.                                                                                                                   |
| Type safety               | PASS                            | Strict interfaces plus Zod validation at imported/exported artifact boundaries; no `any` or non-null assertions.                                                                                  |
| Service separation        | PASS                            | Pure sanitization/governance in `packages/logic`; platform inbox/export commands in mobile services; hook owns UI lifecycle; screen renders shaped state.                                         |
| Package boundaries        | PASS                            | Mobile depends on logic; logic has no mobile runtime imports.                                                                                                                                     |
| UI approval               | PASS                            | The primary flow boards, post-analysis secondary-state board, corrected v2 states, and operator-classification sheet stored under the feature's `mockups/` directory were approved on 2026-07-13. |
| Local migrations          | PASS                            | No schema or migration work is required.                                                                                                                                                          |
| Auth and sync scope       | PASS                            | No WatermelonDB or sync access is added; the route stays inside the existing private runtime.                                                                                                     |
| Privacy and logging       | PASS                            | Raw content is memory-only and prohibited from diagnostics and artifacts; validation fails closed.                                                                                                |
| TDD                       | PASS WITH EXECUTION REQUIREMENT | Each implementation slice starts with failing unit/component/integration coverage before production code; the internal operator journey is verified manually.                                     |

### Post-Design Recheck

The design preserves every gate. The business-decision and visual-approval gates
are complete. Implementation must continue to treat the approved spec,
contracts, mockups, and business decision as one source of truth.

## Project Structure

### Documentation (this feature)

```text
specs/029-trusted-qa-sms-patterns/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- candidate-artifact-contract.md
|   |-- intake-service-contract.md
|   `-- pattern-governance-contract.md
|-- mockups/
|   |-- qa-sms-intake-authorization-selection-v2.png
|   |-- qa-sms-intake-empty-state-v3.png
|   |-- qa-sms-intake-review-coverage-export-v2.png
|   |-- qa-sms-intake-edit-filter-coverage.png
|   |-- qa-sms-intake-classification-sheet.png
|   |-- qa-sms-intake-batch-placeholder-editor.png
|   |-- qa-sms-intake-placeholder-role-selector.png
|   |-- qa-sms-intake-selection-loading-amendment.png
|   |-- qa-sms-intake-message-search.png
|   `-- qa-sms-intake-tap-range-selection.png
|-- checklists/requirements.md
`-- tasks.md                        # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
packages/logic/src/parsers/qa-sms-pattern-intake/
|-- qa-sms-artifact-schema.ts
|-- qa-sms-candidate-sanitizer.ts
|-- qa-sms-candidate-importer.ts
|-- qa-sms-family-builder.ts
|-- qa-sms-governance.ts
|-- qa-sms-pattern-types.ts
|-- qa-sms-privacy-validator.ts
|-- qa-sms-validation-case-runner.ts
|-- testing/
|   `-- qa-sms-template-evaluator.ts       # Not exported by runtime barrels
`-- __tests__/
    |-- qa-sms-artifact-schema.test.ts
    |-- qa-sms-candidate-sanitizer.test.ts
    |-- qa-sms-family-builder.test.ts
    |-- qa-sms-governance.test.ts
    `-- qa-sms-privacy-validator.test.ts

packages/logic/src/parsers/qa-sms-pattern-candidates/
|-- index.ts
|-- coverage-manifest.json
`-- qnb/
    `-- *.json                         # Sanitized, reviewed artifacts only

apps/mobile/config/
`-- qa-sms-pattern-intake-config.ts

apps/mobile/services/dev/
|-- qa-sms-intake-fixtures.ts
|-- qa-sms-evidence-service.ts
|-- qa-sms-pattern-intake-service.ts
`-- qa-sms-pattern-export-service.ts

apps/mobile/hooks/
`-- useQaSmsPatternIntake.ts

apps/mobile/components/qa-sms-pattern-intake/
|-- QaSmsAuthorization.tsx
|-- QaSmsMessageList.tsx
|-- QaSmsSanitizedReview.tsx
|-- QaSmsTapRangeSelector.tsx
|-- QaSmsCoverageReview.tsx
`-- QaSmsExportSummary.tsx

apps/mobile/app/(private)/
`-- qa-sms-pattern-intake.tsx

apps/mobile/__tests__/
|-- services/
|   |-- qa-sms-pattern-intake-service.test.ts
|   `-- qa-sms-pattern-export-service.test.ts
|-- hooks/useQaSmsPatternIntake.test.ts
|-- components/qa-sms-pattern-intake/
`-- app/qa-sms-pattern-intake.test.tsx

apps/mobile/locales/{en,ar}/
`-- qa-sms-pattern-intake.json

scripts/
|-- ingest-qa-sms-candidate-bundle.ts
|-- import-qa-sms-candidate-bundle.ts
`-- check-qa-sms-pattern-privacy.ts

.local/qa-sms-intake/                      # Git-ignored import staging
```

**Structure Decision**: Extend the existing pure parser package with a separate
QA intake domain and separate candidate-data directory. Do not add candidate
records to `LOCAL_SMS_PATTERNS`. Mobile services adapt the real inbox and
Android Storage Access Framework; a hook owns session state and cancellation; a
guarded private route composes presentational components. This follows the
existing `sms-reader-service` adapter and `sms-simulator` dev-route patterns
without placing raw messages in shared storage or production orchestration.

### Approved UX Implementation Contract

- Preserve the five-state sequence: authorization, selection, sanitized review,
  coverage review, and local export.
- Reuse `PageHeader`, `Skeleton`, existing checkbox/button/icon primitives,
  NativeWind theme tokens, and bottom safe-area handling.
- Match the mockup hierarchy, density, sticky actions, placeholder-token layout,
  status treatment, and navigation relationships; do not copy generated device
  chrome, illustrative counts, synthetic dates, or colors that conflict with
  Monyvi tokens.
- Apply the approved selection amendment: expose loaded and selected counts,
  fill remaining capacity from the newest filtered rows up to 50, mirror real
  row geometry in loading skeletons, and keep the footer fixed during loading.
- Apply the approved search amendment inside the existing selection header:
  filter only the already-loaded verified-provider rows by sender/provider and
  body, compose search with the literal filter sheet, preserve the global
  selected set while rows are hidden, and keep the sticky footer stable.
- Implement both light and dark themes and verify compact Android screens do not
  clip rows, tokens, warnings, or footer actions.
- Add the approved compact Settings entry under a development-tools section,
  using the route's existing fail-closed availability guard as the sole
  visibility decision so no entry is exposed in release or unsupported builds.
- Keep raw previews inside authorized selection/correction state only. All other
  states use sanitized or aggregate data.
- Implement the approved filter sheet with literal currency and
  selected/unselected controls only; family/type remains unknown until explicit
  classification. Implement the placeholder-correction state from the third
  mockup board.
- Implement the approved batch-placeholder amendment: keep the full-screen
  editor open while corrections are staged, update the sanitized preview and
  pending list locally, allow pending removal, and commit the complete valid
  batch through one safe-area-aware footer action.
- Replace native raw-text selection with the approved tap-range selector. Split
  display parts without losing source offsets, preserve contiguous whitespace
  and punctuation inside the chosen range, allow clear/restart behavior, and
  keep native selection and clipboard action mode unavailable.
- Implement the approved conditional placeholder-meaning amendment for
  multi-role `ACCOUNT`, `REFERENCE`, and `PHONE` corrections. Reset the role to
  the selected token's canonical default when the token changes, persist an
  explicit alternate role when chosen, and leave single-role tokens unchanged.
- Emit one privacy-safe validation finding per missing semantic role so the UI
  can name the required placeholder without carrying raw message values.
- Extend the provider-scoped sanitizer for reviewed IPN structure only: partial
  transaction dates, meridiem times, punctuated references, and distinct bank
  account suffix placeholders. Runtime account-suffix persistence and matching
  remain deferred to GitHub issue #759.
- Support the QA-operator-confirmed QNB debit-card structure that uses an
  at-sign merchant delimiter and compact available-balance wording, with only
  structurally equivalent synthetic values committed to tests.
- Load only the verified QNB alias allowlist (`QNB`, `QNB EGYPT`, and
  `QNB ALAHLI`), merge and deduplicate native results, sort newest first, and
  enforce the 3,000-message global cap. Render the approved retryable empty
  state without falling back to a broad inbox scan.
- Deduplicate merged native results by device message ID only. Preserve distinct
  messages for operator selection and let evidence digests prevent duplicate
  structures from inflating independent evidence.
- Share safe-area-aware sticky-footer and bottom-sheet primitives across the
  Phase 2A surfaces. Bottom-sheet backdrops and Android hardware back dismiss
  without applying draft changes.
- Surface safe validation findings and provide correction or candidate discard.
  Wizard header back moves to the previous workflow step; candidate arrows never
  exit the current review step.
- Apply Android's top safe-area inset once inside the shared `PageHeader` review
  variant so every review-style full-screen caller inherits the same protection.
- Render coverage as nine compact expandable groups while retaining each
  underlying family/currency declaration. Edit one underlying scope at a time in
  a full-screen `PageHeader` modal with bottom safe-area handling.
- Implement the approved classification sheet as an explicit operator decision:
  one of ten Phase 2A families plus EGP, USD, or Not applicable. Do not add
  keyword inference or an AI call to classify real messages.
- Extend the approved placeholder editor with one `ATM TERMINAL` type. It uses
  `atm_terminal` semantics for ATM names and terminal identifiers, never
  merchant semantics, and does not infer the message family.
- Keep Android export explicit, then provide one host-side `qa-sms:ingest`
  command that validates the chosen file, stages it under ignored `.local/`,
  invokes the existing atomic importer, updates coverage, and runs repository
  verification. Do not add an app-to-host bridge or automatic upload.
- Initial authorization is unchecked with a disabled primary action. Pending
  required coverage renders a disabled export action.
- Model EGP bank-account-to-wallet messages as a distinct review-only transfer
  family, and represent changing public promotion values with explicit public
  semantic roles. Add the approved pending-only bulk coverage action and a
  success toast after the document picker confirms the write.
- Permission denial/revocation uses the existing Monyvi custom SMS permission
  prompt/recovery surface rather than a new native-first state.
- Canonicalize the complete sanitized bundle and attach a SHA-256 content
  digest. Recompute it at export, privacy scanning, and import; document that it
  is tamper evidence for accidental/stale edits, not an authenticity signature.

## Complexity Tracking

No constitution violations are required.
