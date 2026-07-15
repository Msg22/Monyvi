# Contract: QA SMS Intake Services

## Purpose

Define the mobile-only boundary for authorization, bounded inbox access,
sanitization orchestration, evidence identity, and local artifact export.

## Runtime Guard

Every public function checks:

1. Android platform.
2. `__DEV__` is true.
3. `EXPO_PUBLIC_ENABLE_QA_SMS_PATTERN_INTAKE` is exactly `true`.
4. A live authorization session exists for inbox/sanitize/export operations.
5. SMS permission is currently active before any inbox read.

Failure returns a typed unavailable result. It never falls back to production
SMS scan behavior.

## Intake Service

```ts
interface QaSmsPatternIntakeService {
  authorize(input: QaAuthorizationInput): QaIntakeAuthorization;
  listQnbMessages(
    authorization: QaIntakeAuthorization,
    options: QaInboxQueryOptions
  ): Promise<readonly QaInboxMessage[]>;
  sanitizeSelected(
    authorization: QaIntakeAuthorization,
    messages: readonly QaInboxMessage[]
  ): Promise<readonly QaSanitizedCandidateDraft[]>;
  applyPlaceholderCorrection(
    draft: QaSanitizedCandidateDraft,
    correction: QaPlaceholderCorrection
  ): QaSanitizedCandidateDraft;
  validateDraft(draft: QaSanitizedCandidateDraft): QaDraftValidationResult;
  approveDraft(draft: QaSanitizedCandidateDraft): QaSanitizedCandidateDraft;
  close(): void;
}
```

Rules:

- Inbox queries are provider/address-scoped and capped by a named constant.
- Inbox results are capped at 3,000 and selected inputs are capped at 50.
- Listing does not sanitize or export unselected messages.
- Raw message fields never enter logs, errors, analytics, AsyncStorage,
  WatermelonDB, Supabase, snapshots, or exported objects.
- Correction accepts only segment boundary and placeholder type operations.
- Every correction returns a new draft in `draft` state and clears prior
  validation/approval.
- Closing clears all authorization, raw messages, drafts, and callbacks.
- Denied, blocked, or revoked SMS permission clears raw state and delegates to
  the existing custom Monyvi permission/recovery UI.
- Evidence-secret loss or corruption returns `evidence_secret_unavailable` and
  blocks export until an explicit new-domain acknowledgment is completed.

## Export Service

```ts
interface QaSmsPatternExportService {
  exportApprovedCandidates(
    authorization: QaIntakeAuthorization,
    drafts: readonly QaSanitizedCandidateDraft[]
  ): Promise<QaExportResult>;
}

type QaExportResult =
  | { readonly status: "exported"; readonly candidateCount: number }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly errorCode: QaExportErrorCode };
```

Rules:

- Revalidate every draft and the final bundle immediately before writing.
- Ask the operator to choose a local directory.
- Create a JSON file with a safe generated name and MIME type.
- Do not return or log the file URI because it may reveal local path metadata.
- Cancellation is not an error and does not mark drafts exported.
- Partial writes are deleted when possible; diagnostics include only error code
  and candidate count.

## Hook Contract

`useQaSmsPatternIntake` owns authorization, loading, cancellation, selected IDs,
drafts, validation findings, current step, and route cleanup. It invokes the two
services and exposes shaped callbacks. It does not implement sanitization,
privacy validation, inbox queries, or file writes.

## UI Contract

The dev-only route has five states:

1. Authorization with development-only label, privacy/scope summary, explicit
   unchecked acknowledgment, disabled-until-checked authorize action, and cancel
   action.
2. Bounded QNB message selection with literal currency and selection-status
   filters, selectable virtualized rows, selected count, and sticky sanitize
   action. No family/type is inferred before operator classification.
3. Sanitized candidate review/correction with family/currency, verified alias,
   structured placeholder segments, privacy status, correction/approval actions,
   and candidate position.
4. Grouped family/currency coverage review with expandable underlying scopes,
   collected/unavailable/pending statuses, pending warning, and visibly disabled
   export progression while pending.
5. Local export with approved/reviewed counts, local JSON destination,
   no-clipboard/no-sharing/no-upload reassurance, folder action, and return
   action.

The focused mockup must be approved before implementation. Raw message text may
appear only in the authorized local selection and correction states so the
operator can verify placeholder boundaries; it must not appear in export summary
or any persisted state. The screen clears state when it loses its authorized
session or unmounts.

The three approved mockup files in `../mockups/` are normative for hierarchy and
interaction order. Existing Monyvi components, theme colors, light/dark modes,
and Android safe-area behavior remain authoritative for implementation details.

The third approved mockup defines the filter sheet and placeholder correction.
Coverage status editing uses a full-screen route-level modal with `PageHeader`
and bottom safe-area handling so every scope remains readable and editable. The
route is opened through a guarded documented deep link command; no normal-user
navigation item is added.
