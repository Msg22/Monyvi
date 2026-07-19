# Data Model: Trusted QA SMS Pattern Intake

No entity in this document is stored in WatermelonDB or Supabase. Raw inbox
records, authorization sessions, and drafts are memory-only. Only validated,
sanitized artifacts may be written to a local file and later added to source
control after human review.

Bank-account suffixes encountered during intake are represented only by an
`ACCOUNT` placeholder with semantic role `source_account_suffix`. The raw value
remains memory-only. Phase 2A does not persist it or use it for runtime
matching; that separate model is tracked by GitHub issue #759.

## QaIntakeUiState

Memory-only state machine that drives the approved mockup sequence.

| State                 | Required UI data                                                                                           | Allowed transition                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `authorization`       | Scope rows and checked acknowledgment                                                                      | `selection` after explicit authorization                                         |
| `permission_recovery` | Existing custom permission explanation or settings recovery                                                | Back to `selection` only after permission is active                              |
| `selection`           | Filtered QNB rows, selected IDs, loading state                                                             | `sanitized_review` after selected messages sanitize safely                       |
| `sanitized_review`    | Current candidate, position, segments, privacy findings, explicit family/currency classification, approval | Back to `selection` or forward to `coverage_review` after all candidates resolve |
| `coverage_review`     | Required family/currency statuses and pending count                                                        | Back to review or forward to `local_export` when none are pending                |
| `local_export`        | Approved count, reviewed-family count, export state                                                        | Back to coverage/review or terminal exported state                               |

Raw preview data is permitted only in `selection` and an active correction view
inside `sanitized_review`. Moving to coverage/export or closing the session must
remove raw preview data from UI state.

## QaIntakeAuthorization

Represents explicit authorization for one bounded local QA session.

| Field                | Type                   | Rules                               |
| -------------------- | ---------------------- | ----------------------------------- |
| `version`            | literal                | Current authorization copy/version. |
| `authorizationClass` | `qa_operator_explicit` | No user or device identity.         |
| `authorizedAt`       | ISO timestamp          | Session start only.                 |
| `providerScope`      | `qnb-egypt`            | Phase 2A fixed scope.               |
| `currencyScope`      | EGP, USD, or both      | Selected scope.                     |
| `messageFamilyScope` | family identifiers     | Bounded to spec families.           |

Lifecycle: `not_authorized -> authorized -> closed`. Backgrounding, reset,
logout, or route unmount closes the session and clears raw state.

## QaInboxMessage

Ephemeral adapter shape returned only after authorization.

| Field              | Type                        | Rules                                       |
| ------------------ | --------------------------- | ------------------------------------------- |
| `localSelectionId` | random session-local string | Never exported.                             |
| `nativeMessageId`  | string                      | Memory-only; never logged or exported.      |
| `sender`           | string                      | Memory-only until verified/normalized.      |
| `body`             | string                      | Memory-only; never persisted or logged.     |
| `receivedAtMs`     | positive integer            | Memory-only; never exported directly.       |
| `smsFingerprint`   | string                      | Memory-only input to evidence digest.       |
| `isSelected`       | boolean                     | Selection permits sanitization, not export. |

## SanitizedSegment

Ordered unit used to derive a safe template shape.

| Field                  | Type                     | Rules                                                         |
| ---------------------- | ------------------------ | ------------------------------------------------------------- |
| `kind`                 | `fixed` or `placeholder` | Discriminated union.                                          |
| `text`                 | string                   | Fixed segments only; normalized and privacy-validated.        |
| `token`                | canonical placeholder    | Placeholder segments only.                                    |
| `semanticRole`         | role identifier          | Distinguishes amount from balance, person from merchant, etc. |
| `wasOperatorCorrected` | boolean                  | Correction forces full revalidation.                          |

Canonical placeholder tokens: `CURRENCY`, `AMOUNT`, `BALANCE`, `LAST4`,
`ACCOUNT`, `REFERENCE`, `MERCHANT`, `ATM_TERMINAL`, `PERSON`, `PHONE`, `DATE`,
and `TIME`. The `semanticRole` preserves narrower meaning: ATM names and
terminal identifiers use `ATM_TERMINAL:atm_terminal` and never merchant
semantics; they remain optional, review-only metadata. Contextually labeled
OTP/code/PIN values use `REFERENCE:otp_code`, while contextually labeled short
provider contact numbers use `PHONE:provider_hotline`. Unlabeled short numeric
values remain blocking.

## QaSanitizedCandidateDraft

In-memory result for one selected message.

| Field                 | Type                         | Rules                                                                                                                 |
| --------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `draftId`             | random session-local string  | Never exported as evidence identity.                                                                                  |
| `verifiedSenderAlias` | string or null               | Only normalized operator-verified QNB alias is allowed.                                                               |
| `providerId`          | `qnb-egypt`                  | Fixed in Phase 2A.                                                                                                    |
| `messageFamily`       | supported family             | Explicitly chosen/confirmed by the operator; never inferred from raw wording.                                         |
| `currency`            | `EGP`, `USD`, or null        | Explicitly chosen by the operator. Null is permitted only for OTP, informational, and promotional rejection messages. |
| `expectedOutcome`     | transaction or rejection     | Explicit; transaction includes confidence ceiling and closed review reasons.                                          |
| `segments`            | ordered `SanitizedSegment[]` | Source of rendered template shape.                                                                                    |
| `evidenceDigest`      | string                       | Secret-keyed, domain-separated digest; no raw app fingerprint.                                                        |
| `validationFindings`  | finding array                | No raw values in messages.                                                                                            |
| `status`              | draft lifecycle state        | See below.                                                                                                            |

Lifecycle:

```text
draft -> blocked
draft -> validated
blocked -> draft             # after local correction
validated -> draft           # any edit invalidates approval
validated -> approved
approved -> exported
```

## PrivacyValidationFinding

| Field          | Type                | Rules                                                                |
| -------------- | ------------------- | -------------------------------------------------------------------- |
| `code`         | stable code         | Examples: `raw_numeric_value`, `unverified_sender`, `unknown_token`. |
| `severity`     | `blocking`          | Phase 2A has no warning-only privacy leak.                           |
| `segmentIndex` | integer or null     | Position only; no leaked text.                                       |
| `messageKey`   | stable internal key | User copy is translated at render time.                              |

## QaCandidateArtifact

Export-safe representation of one approved candidate.

| Field                 | Type                       | Rules                                                                                                |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `candidateId`         | random UUID                | Artifact identity only.                                                                              |
| `evidenceDigest`      | string                     | Unique within all known artifacts.                                                                   |
| `providerId`          | `qnb-egypt`                | Phase 2A.                                                                                            |
| `verifiedSenderAlias` | string                     | Normalized provider alias only.                                                                      |
| `messageFamily`       | supported family           | Explicit.                                                                                            |
| `currency`            | `EGP`, `USD`, or null      | Per-family semantics.                                                                                |
| `expectedOutcome`     | structured outcome         | Transaction direction/fields, `0..1` confidence ceiling, closed review reasons, or rejection reason. |
| `segments`            | sanitized segments         | No raw message/body values.                                                                          |
| `sanitizedShape`      | derived string             | Generated, never independently edited.                                                               |
| `sourceType`          | `qa-real-sms`              | Fixed Phase 2A source class.                                                                         |
| `runtimeScope`        | `candidate`                | Never executable.                                                                                    |
| `autoSelectPolicy`    | `never`                    | Fixed.                                                                                               |
| `authorization`       | safe authorization summary | Class/version/time/scope only.                                                                       |
| `createdAt`           | ISO timestamp              | Artifact creation.                                                                                   |
| `schemaVersion`       | positive integer           | Contract evolution.                                                                                  |

Forbidden keys include `body`, `rawBody`, `sender`, `nativeMessageId`,
`messageId`, `smsFingerprint`, account names, phone numbers, timestamps copied
from the source message, and parser response bodies.

## QaCandidateBundle

One manually transferred local JSON file.

| Field                  | Type                                                 | Rules                                                        |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `schemaVersion`        | positive integer                                     | Bundle contract version.                                     |
| `exportId`             | random UUID                                          | One export operation.                                        |
| `exportedAt`           | ISO timestamp                                        | Export time.                                                 |
| `evidenceDomainStatus` | `stable` or `reset_requires_manual_duplicate_review` | Non-sensitive import guard after local evidence-key reset.   |
| `candidates`           | non-empty candidate array                            | Every item independently validated and approved.             |
| `coverageDeclarations` | declaration array                                    | Availability observations only; no message content.          |
| `integrity`            | deterministic summary                                | Counts, candidate IDs, and SHA-256 canonical-content digest. |

Serialization uses stable key ordering so re-exporting unchanged approved drafts
produces a reviewable diff apart from export identity/time.

`integrity.contentDigest` is the lowercase SHA-256 digest of the complete
canonical sanitized bundle content, excluding the `integrity` object itself.
Export, staging privacy checks, and import all recompute it. This detects stale
or accidental post-export edits; it is not a signature and does not establish
authenticity against an actor who can modify the file and recompute the digest.

## QaCoverageDeclaration

Non-sensitive statement about whether an in-scope family/currency combination
was observed in the authorized QA dataset.

| Field           | Type                                                             | Rules                                                |
| --------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| `providerId`    | `qnb-egypt`                                                      | Fixed Phase 2A scope.                                |
| `messageFamily` | supported family                                                 | One of the ten Phase 2A families.                    |
| `currency`      | `EGP`, `USD`, or null                                            | Null when currency is not meaningful.                |
| `status`        | `candidate_collected`, `unavailable_in_qa_dataset`, or `pending` | Explicit coverage state.                             |
| `candidateIds`  | string array                                                     | Required for `candidate_collected`; empty otherwise. |
| `recordedAt`    | ISO timestamp                                                    | QA observation time, not source-message time.        |

The source-controlled coverage manifest merges these declarations. Phase 2A is
complete only when every required family/currency combination is either backed
by at least one candidate or explicitly marked unavailable; `pending` is allowed
during intake but not at final acceptance.

## QaTemplateFamily

Source-controlled, review-only grouping derived from candidate artifacts.

| Field                       | Type                                 | Rules                                            |
| --------------------------- | ------------------------------------ | ------------------------------------------------ |
| `familyId`                  | stable slug                          | Provider + semantic family + structural version. |
| `version`                   | positive integer                     | Incremented for fixed-text/token-role changes.   |
| `providerId`                | `qnb-egypt`                          | Phase 2A.                                        |
| `verifiedSenderAliases`     | non-empty string array               | Every alias individually reviewed.               |
| `messageFamily`             | supported family                     | Explicit semantic family.                        |
| `structuralSignature`       | digest                               | Derived from fixed segments and token roles.     |
| `supportedCurrencies`       | subset of EGP/USD                    | Each has evidence and tests.                     |
| `evidenceDigestsByCurrency` | map                                  | Non-duplicate evidence references.               |
| `expectedOutcome`           | structured outcome                   | Must agree across family evidence.               |
| `reviewState`               | `candidate` or `review_ready`        | No production state.                             |
| `humanReview`               | review record or null                | Required for `review_ready`.                     |
| `validationCoverage`        | positive/near-match/negative results | All pass for `review_ready`.                     |
| `runtimeScope`              | `candidate`                          | Fixed and non-executable.                        |
| `autoSelectPolicy`          | `never`                              | Fixed.                                           |
| `versionHistory`            | immutable prior-version array        | Preserves the complete invalidated family state. |

### Family Grouping Rules

Two candidates share a family only when normalized fixed segments, placeholder
sequence/roles, verified sender family, direction or rejection outcome, and
semantic family are identical. Currency may differ only as an explicit token;
each currency retains independent evidence and validation coverage.

Known aliases such as QNB, QNB ALAHLI, and QNB EGYPT normalize to the same
reviewed sender family. Unrecognized aliases remain distinct so normalization
cannot silently merge unrelated senders.

When a structural revision creates a new version, the prior entry preserves
provider, aliases, family, currencies, evidence, expected outcome, review state,
human review, validation coverage, runtime policy, evidence count, invalidation
time, incompatibility reason, and superseding version.

### Review-Ready Invariants

- At least three non-duplicate candidate evidence records in total.
- At least one evidence record and validation set per supported currency.
- Human approval recorded.
- Positive, near-match, and negative cases pass.
- No conflicting direction, rejection outcome, or placeholder role.
- Runtime scope remains `candidate`; auto-select remains `never`.

## QaFamilyReviewRecord

| Field                   | Type                     | Rules                             |
| ----------------------- | ------------------------ | --------------------------------- |
| `decision`              | `approved` or `rejected` | Explicit.                         |
| `reasonCode`            | stable code              | No source text.                   |
| `reviewerRole`          | `qa_owner`               | No personal identity required.    |
| `reviewedAt`            | ISO timestamp            | Audit time.                       |
| `testedArtifactVersion` | positive integer         | Binds decision to family version. |

Independent corroboration and `trusted_production` are intentionally absent;
Phase 2B or Phase 2C must add those states through a new approved contract.

## DeviceLocalEvidenceSecret

Random high-entropy value held in secure device storage and never exported,
logged, displayed, or committed. It makes evidence digests stable across intake
sessions on the QA installation without exposing an app SMS fingerprint. Losing
the app installation loses this secret; previously imported catalog digests
remain valid but new evidence requires explicit duplicate review against the
existing catalog.

A non-sensitive initialization marker is stored separately from the secret. A
missing/corrupt secret with an existing marker enters
`evidence_secret_unavailable`, clears drafts, and blocks export. Explicit reset
creates a new evidence domain only after acknowledgment; the next importer run
must require manual duplicate review. The marker contains no device, user,
message, or artifact identifier.

## QaCandidateReviewReason

Closed, versioned reason vocabulary used by transaction candidate outcomes:

- `candidate_pattern`
- `account_context_required`
- `transfer_accounts_required`
- `ambiguous_amount`
- `ambiguous_counterparty`
- `partial_template`
- `currency_evidence_required`

Unknown strings fail artifact-schema validation. Adding a reason requires a
schema-version decision and contract tests.

## QaEvaluationResult

Test-only result returned by the isolated QA template evaluator.

| Field                 | Type                                    | Rules                      |
| --------------------- | --------------------------------------- | -------------------------- |
| `status`              | `matched`, `rejected`, or `unsupported` | Never an app transaction.  |
| `familyId`            | string or null                          | Candidate family only.     |
| `expectedOutcomeKind` | transaction/rejection/null              | Metadata comparison.       |
| `validationCodes`     | stable code array                       | No input or template text. |

This shape is not exported from application parser barrels and cannot be mapped
to `ParsedSmsTransaction` in Phase 2A.
