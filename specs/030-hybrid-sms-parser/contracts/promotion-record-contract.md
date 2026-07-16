# Contract: Trusted Pattern Promotion Record

A promotion manifest is a source-controlled, privacy-safe human decision input.
The promotion command never infers approval merely because a candidate was
exported.

## Required fields

- record schema version;
- unique promotion ID;
- Phase 2A candidate ID and existing evidence digest;
- target pattern ID and positive pattern version;
- target catalog version;
- designated reviewer stable ID;
- explicit ISO approval timestamp;
- decision: `promote` or `reject`;
- closed validation results for schema, privacy, exact positive, near-match,
  intentional negative, ambiguity, and integrity.

## Invariants

- Every promoted entry has exactly one accepted record for its identity/version.
- Rejected or incomplete records produce no runtime entry.
- Changing structure, semantic role, sender family, expected outcome, or pattern
  version requires a new record.
- Records contain no raw/sanitized template text or concrete placeholder values.
- `bank_to_wallet_transfer` records are rejected for this release even if the
  source candidate is otherwise valid.
