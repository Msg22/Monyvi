# Research: Resumable SMS Review Drafts

## Decision 1: Use installation-local WatermelonDB tables

**Decision**: Store queues, restorable items, and dismissed fingerprints in three
WatermelonDB tables that are explicitly excluded from Supabase sync.

**Rationale**: Review must survive process/device restart and work offline, while
raw SMS must never enter cloud sync. Separate tables keep lifecycle and fingerprint
lookups queryable without decoding sensitive payloads.

**Alternatives rejected**:
- React context or AsyncStorage: weak ownership/query/atomicity guarantees.
- Supabase tables: violates the approved device-local privacy boundary.
- One JSON queue row: requires decoding every raw payload for deduplication and
  makes item-level atomic transitions fragile.

## Decision 2: Persist complete payloads through a versioned codec

**Decision**: `@monyvi/logic` owns a V1 Zod-validated codec for complete
`ParsedSmsTransaction` review payloads. Dates serialize as ISO-8601 strings and
restore only after strict validation.

**Rationale**: Resume must reproduce current review behavior without remapping or
new AI work. A version discriminator provides an explicit migration/failure
boundary.

**Alternatives rejected**:
- Persisting only selected fields: loses review reasons, provenance, original SMS,
  or future-compatible state.
- Unvalidated `JSON.parse`: malformed local data could reach financial writes.

## Decision 3: Separate durable state from volatile Undo

**Decision**: An individual discard atomically deletes the draft item and inserts
a lightweight dismissed fingerprint. The complete edited item is retained only in
memory for the latest Undo opportunity.

**Rationale**: Durable raw SMS disappears immediately, repeat AI parsing remains
blocked, and an accidental one-item discard stays recoverable.

**Alternatives rejected**:
- Soft-delete full payload: retains raw SMS after discard.
- Persisted Undo payload: extends sensitive retention and survives process death
  contrary to the approved behavior.
- Multiple Undo banners: unclear ownership and noisy list behavior.

## Decision 4: Persist before checkpoint finalization

**Decision**: Accepted parser results are merged into the active queue before the
scan checkpoint records them as handled. Persistence failure leaves those
fingerprints retryable and fails the scan finalization path.

**Rationale**: A checkpoint must never claim that paid work is safely handled when
its review result can still be lost.

**Alternatives rejected**:
- Persist after navigation: process loss can discard paid results.
- Keep `memory_suggestion`: the state is not durable enough for checkpoint safety.

## Decision 5: Merge by user and fingerprint without overwriting edits

**Decision**: One active item exists for each `(user_id, sms_fingerprint)`. New
unique results append at stable positions; an existing item wins over later parser
output.

**Rationale**: Fingerprints are the established identity invariant, and confirmed
user edits must be stronger than repeated parser output.

**Alternatives rejected**:
- Last-write-wins parser upserts: can silently erase edits.
- Queue replacement on each scan: loses unresolved work and selection state.

## Decision 6: Make financial save and draft removal one database batch

**Decision**: The SMS save command prepares existing validated financial writes
and selected draft deletions, then commits them together in one WatermelonDB
batch. Empty queue cleanup belongs to that batch.

**Rationale**: It prevents both financial records without draft resolution and
draft loss without financial records.

**Alternatives rejected**:
- Delete drafts after `batchCreateTransactions`: app termination between commits
  can resurrect suggestions.
- Delete before financial write: write failure loses reviewed work.

## Decision 7: Revalidate current-user references on resume and save

**Decision**: Mobile reference services recheck account/category accessibility
without AI. Hard failures force an explicit unselected override; later correction
does not silently reselect.

**Rationale**: Local references can become stale or foreign while the payload is
retained. Financial ownership is checked at display and authoritatively at save.

**Alternatives rejected**:
- Trust stored IDs: can write inaccessible or deleted references.
- Automatically remap IDs: changes financial meaning without user consent.

## Decision 8: Keep shared review components source-aware

**Decision**: Reuse transaction-review components with explicit SMS-only props for
persistent selection, Review later, X discard, Undo, read-only type, Currency,
and motion. Voice behavior remains unchanged.

**Rationale**: The visual system stays consistent without leaking SMS lifecycle
rules into voice review.

**Alternatives rejected**:
- Fork the entire review screen: creates drift and duplicate validation logic.
- Apply SMS rules globally: regresses voice editing and transient review.

## Decision 9: Use restrained Reanimated layout transitions

**Decision**: Successful discard fades/collapses once; Undo expands/fades into the
stored position. Reduced-motion users receive immediate state changes. Failed
persistence never triggers a completed removal animation.

**Rationale**: The approved interaction needs continuity without bounce, repeated
layout movement, or animation masking durable failures.

## Decision 10: Run user-scoped 30-day cleanup at bounded lifecycle points

**Decision**: Cleanup runs when SMS entry/review initializes for the current user
and before queue mutation. It physically removes expired items and removes an
empty queue, but never removes dismissed fingerprints.

**Rationale**: This bounds raw-SMS retention without a background scheduler and
keeps every operation offline and account-scoped.

**Alternatives rejected**:
- Global unscoped cleanup: risks cross-account mutation.
- Timer-only cleanup: unreliable across process death.
- Expiring dismissed fingerprints: reintroduces repeat paid parsing.

## Decision 11: Protect local-only schema from generation and sync

**Decision**: Add local schema definitions after generated remote schema content,
register models manually, add a sequential Watermelon migration, and test both
schema-generation preservation and explicit sync exclusion.

**Rationale**: Existing sync derives table names from the Watermelon schema. A new
local table would otherwise be requested from Supabase, and schema regeneration
could silently erase it.

## Decision 12: Keep raw SMS out of operational surfaces

**Decision**: Repository/service errors and logs use IDs, counts, versions, and
stable reason codes only. Original SMS and payload JSON never enter logs,
diagnostics, notifications, enrichment, analytics, or final records.

**Rationale**: Persistence is a narrow review-only exception, not permission to
broaden raw-message exposure.
