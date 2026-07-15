# Contract: QA SMS Pattern Governance

## Purpose

Define how sanitized QNB candidates become review-ready template families
without becoming executable parser patterns.

## Catalog Boundary

- Candidate artifacts live under
  `packages/logic/src/parsers/qa-sms-pattern-candidates/`.
- A coverage manifest in that directory records every required QNB
  family/currency combination as candidate-backed, unavailable, or pending.
- `local-sms-pattern-catalog.ts` must not import candidate modules or data.
- `parseSmsWithLocalParser` must have no API that accepts candidate artifacts.
- A static test fails if candidate family IDs appear in `LOCAL_SMS_PATTERNS`.
- The isolated QA evaluator lives under a testing-only module, is absent from
  runtime barrels, returns `QaEvaluationResult` only, and is the sole Phase 2A
  code allowed to structurally match candidate families.
- Every candidate and family uses `runtimeScope: candidate` and
  `autoSelectPolicy: never`.

## Family Signature

The signature is derived from:

1. Provider ID and normalized verified sender alias family.
2. Ordered normalized fixed segments.
3. Ordered placeholder tokens and semantic roles.
4. Message family.
5. Transaction direction or rejection outcome.

Currency is excluded from the signature only when it is represented by the same
placeholder position and all other semantics are identical. Evidence and tests
remain partitioned by currency.

## Evidence Rules

- One evidence digest can count once globally.
- One sample creates or extends a `candidate` family.
- `review_ready` requires at least three non-duplicate matching evidence records
  in total.
- Each supported currency requires at least one evidence record and its own
  positive, near-match, and negative validation cases.
- Same-device repetition is not independent production corroboration.
- No Phase 2A state or property implies production trust.
- Phase 2A completion rejects a coverage manifest with any required combination
  missing or still pending.

The approved coverage screen renders this manifest as compact family rows with
collected, unavailable, or pending status. Eight visual groups may summarize the
nine semantic families, with OTP and informational combined visually, only when
every underlying family/currency scope remains expandable and directly editable.
A visible pending warning and disabled forward action must derive from the
manifest result rather than duplicated UI logic.

## Review Rules

A family may become `review_ready` only when:

- Artifact schemas and privacy validators pass.
- Structural signatures match exactly.
- Expected outcome and semantic roles do not conflict.
- Human review is approved for the current family version.
- Positive, near-match, and negative cases all pass.
- Runtime scope and auto-select policy retain their fixed safe values.

Any structure, semantic role, sender family, direction, or outcome change
creates a new version and invalidates prior review/test status for that version.
The immutable history entry must retain the complete prior reviewable state,
including evidence partitions, expected outcome, review decision, validation
coverage, runtime policy, invalidation timestamp, incompatibility reason, and
superseding version.

## Rejection Families

Failed transaction, OTP, informational, and promotional families are stored as
explicit rejection outcomes. Their presence in the candidate catalog does not
add runtime filters in Phase 2A. They serve as reviewed evidence and test inputs
for a later approved promotion phase.

## Diagnostics

Governance diagnostics may include candidate/family IDs, counts, state,
currency, schema version, validation code, and duration. They must not include
sanitized shape, fixed text, sender alias, evidence digest, amounts, merchant or
person values, account data, or source timestamps.

## Quality-Gate Contract

The source/artifact privacy scan must run from the root verification command,
the pre-push hook, and CI. It checks forbidden keys/values, candidate-to-runtime
imports, staged bundle paths, closed review reasons, confidence bounds, and
candidate runtime metadata.
