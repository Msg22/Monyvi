# Data Model: Trusted Hybrid SMS Parser

No database schema is introduced. All models below are pure or in-memory.

## TrustedCatalog

- `schemaVersion`: catalog schema compatibility number.
- `catalogVersion`: immutable release identifier.
- `patterns`: ordered-independent collection of `TrustedPattern` records.
- `integrity`: deterministic digest of production-relevant catalog fields.

**Invariants**:

- Catalog version and pattern IDs are unique and stable.
- Validation completes before any pattern becomes active.
- Invalid catalogs yield no active local patterns.
- Candidate/dev-test runtime scopes are impossible in this collection.

## TrustedPattern

- `patternId`: stable pattern identity.
- `patternVersion`: positive version for this exact structure.
- `providerId`: stable provider code.
- `senderAliases`: reviewed sender aliases.
- `enabled`: bundled activation state.
- `sourceType`: trusted provenance code.
- `reviewedCandidateId`: non-sensitive link to the approval record.
- `segments`: ordered fixed fragments and placeholder-role declarations.
- `expectedOutcome`: income/expense extraction contract, ATM-withdrawal
  extraction contract, or explicit rejection. Internal transfer outcomes are
  unsupported in this release.
- `reviewPolicy`: always `needs_review` for transaction outcomes.
- `validationEvidence`: positive, near-match, negative, privacy, and ambiguity
  validation status codes.

**Invariants**:

- No raw evidence message or concrete placeholder value is stored.
- One pattern version represents one exact structure.
- `enabled=false` never drops a candidate; it makes the candidate unresolved.
- Transaction patterns cannot request production auto-selection.
- `bank_to_wallet_transfer` cannot enter this catalog until a separately
  approved result contract represents both owned account endpoints.

## PromotionRecord

- `recordSchemaVersion`: promotion-record compatibility version.
- `promotionId`: immutable unique promotion identity.
- `candidateId`: approved Phase 2A source candidate identity.
- `candidateDigest`: existing privacy-safe evidence digest.
- `patternId` and `patternVersion`: exact promoted runtime identity.
- `catalogVersion`: catalog release receiving the pattern.
- `reviewerId`: stable designated-reviewer identity, not display copy.
- `approvedAt`: ISO timestamp supplied explicitly by the promotion manifest.
- `validationStatus`: schema, privacy, positive, near-match, negative,
  ambiguity, and integrity pass codes.
- `decision`: promoted or rejected.

Promotion records never contain template text, sender aliases, placeholder
values, or evidence timestamps from the source SMS.

## TrustedMatchOutcome

Discriminated by `status`:

- `matched`: one valid transaction extraction, fingerprint, pattern ID/version.
- `rejected`: one exact trusted non-transaction match, fingerprint, reason code.
- `unresolved`: no exact active match or unsupported extracted value.
- `ambiguous`: more than one valid trusted match.
- `catalog_error`: trusted matching unavailable; candidate remains unresolved.

Every input candidate produces exactly one outcome and retains its source
identity and fingerprint.

## HybridCandidateOutcome

- `candidateId`
- `smsFingerprint`
- `localOutcome`
- `aiOutcome`: not attempted, matched, unresolved, failed, or cancelled.
- `finalStatus`: suggestion, rejected, unresolved, or cancelled.
- `parserSource`: local, AI, or none.
- `reasonCode`: stable non-translated code.

**Invariants**:

- At most one final suggestion exists per fingerprint.
- Local exact match prevents AI submission for that candidate.
- Rejected local match prevents AI submission and creates no financial row.
- Local ambiguity/no-match sends the original candidate to AI only when consent
  and availability permit.

## HybridParseSummary

- `catalogVersion`
- `candidateCount`
- `localMatchedCount`
- `localRejectedCount`
- `localUnresolvedCount`
- `localAmbiguousCount`
- `aiAttemptedCount`
- `aiMatchedCount`
- `unresolvedCount`
- `matchedPatternIds`
- `reasonCounts`
- `hasRetryableUnresolved`

No source text, sender, amount, or extracted value may appear.

## SmsReviewSession

- `transactions`: successful reviewable suggestions.
- `unresolvedCandidates`: transient candidates eligible for retry.
- `parseContext`: transient category/currency/account context needed by AI.
- `summary`: safe `HybridParseSummary`.
- `retryState`: idle, retrying, or failed.

**Lifecycle**:

1. Created when a batch scan has reviewable suggestions.
2. Updated atomically after an unresolved-only retry.
3. Cleared after save, discard, reset, review Back, route replacement that
   abandons review, logout/private-runtime unmount, or any other explicit flow
   exit that discards review state.
4. Never persisted to AsyncStorage, WatermelonDB, Supabase, logs, or analytics.

## State Transitions

```text
candidate
  -> local matched -> review suggestion
  -> local rejected -> no suggestion
  -> local unresolved/ambiguous/catalog error
       -> AI matched -> review suggestion
       -> AI rejected/unresolved -> unresolved
       -> AI retryable failure -> retryable unresolved
       -> cancellation -> cancelled

review session unresolved
  -> retrying
       -> matched -> merge suggestion and remove unresolved
       -> still unresolved -> retain unresolved
       -> failed -> retain unresolved and expose retry again
       -> cancelled -> retain prior session unchanged
```
