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
- `reviewPolicy`: always `needs_review` for transaction outcomes at the trusted
  pattern boundary. A pattern can never request auto-selection itself; the
  mobile orchestrator may independently derive the sole FR-052 through FR-054
  enriched-purchase exception after category and account resolution.
- `validationEvidence`: positive, near-match, negative, privacy, and ambiguity
  validation status codes.

**Invariants**:

- No raw evidence message or concrete placeholder value is stored.
- One pattern version represents one exact structure.
- `enabled=false` never drops a candidate; it makes the candidate unresolved.
- Transaction patterns cannot request production auto-selection. Any eventual
  auto-selection is derived outside the catalog and must pass every approved
  post-parse financial gate.
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
- `validationEvidence`: privacy-safe executable recipes for rendering the exact
  candidate, mutating every fixed segment, and testing an unverified sender.
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

## CategoryEnrichmentRequest

- `merchants`: at most 20 unique normalized merchant identities per request.
- `merchant.id`: opaque session-scoped correlation ID.
- `merchant.merchant`: the locally extracted merchant text.
- `merchant.transactionType`: fixed to `EXPENSE` in this release.
- `merchant.messageFamily`: fixed to `card_purchase` in this release.

**Invariants**:

- Equal normalized merchants are transported once and map back to all matching
  local candidate IDs in memory.
- The request contains no raw SMS, sender/provider, amount, currency, balance,
  account/card data, reference, phone, date/time, fingerprint, or custom
  category data.
- The client sends no category allowlist; the Edge Function owns the immutable
  enrichment-safe taxonomy.
- Requests execute in chunks of at most 20, with at most two chunks in flight
  and one 20-second client deadline for the complete enrichment operation.

## CategoryEnrichmentOutcome

- `merchantId`: opaque request identity.
- `categorySystemName`: exact server-allowlisted system category name.
- `confidence`: finite value from 0 through 1.
- `status`: accepted, rejected, missing, failed, consent-required, timed-out, or
  cancelled at the mobile boundary.

**Invariants**:

- Duplicate response identities poison every sibling for that identity.
- Malformed or unallowlisted outcomes fail per identity; a malformed envelope
  fails the whole response.
- Accepted outcomes can update only `categoryId` and category display data.
  Merchant and every other trusted local field remain immutable.
- Previously accepted chunk outcomes survive a later chunk failure or timeout.
- Auto-selection is recomputed locally only after category confidence,
  current-category visibility, account resolution, and review-reason checks.

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
