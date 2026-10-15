# PR #386 — Legacy revision-zero Dispose identity follow-up

**Status:** Source authored for independent lead review; all execution gates
**NOT RUN** by the remote implementation owner.

**Immutable implementation parent:** `d2a549ef62c9b54b7540af6ad05a155a9aa614e3`.
**Trusted governing main:** `de09f76bdadb570c99a1015bbf1c680279b0d5ad`.

## Contract and boundaries

A locally recorded original revision-zero Dispose can have
`metal_lifecycle_events.id = E` and `action_id = D`, with `E != D`. The server
uses `D` for its immutable terminal event identity. A new Undo must use
`predecessorEventId = reversesEventId = D`; preserving `E` in the new envelope
would cause server CAS rejection.

The single proof implementation is
`apps/mobile/services/metal-lifecycle-identity-service.ts`. It admits an alias
only for one owned revision-zero Dispose with unique event, action root and
action evidence; exact owner, holding, kind, original occurrence,
expected/canonical revisions, canonical envelope validation and immutable
root/event/evidence payload agreement. Additional action-root guard evidence
must be empty when present. Any foreign, malformed, ambiguous, conflicting or
unprovable case fails closed. The general business-date validator and existing
event-row primary keys are unchanged.

The pure in-memory reducer input changes only the proven original root's logical
ID `E -> D`; existing immutable predecessor/reversal fields are never
normalized. In particular an old Undo action that incorrectly persisted `E` is
NOT rewritten or silently marked accepted. Its invalid chain remains a recovery
case.

For new Undo the canonical identity is proven before envelope creation and
hashing. The local writer subsequently revalidates original owned terminal
evidence, current effective state, holding revision and authentication inside
the normal atomic action group. Replay reconstructs the same canonical payload
from the immutable original event/evidence, without requiring the holding to
remain Sold or Disposed after an earlier successful Undo.

For canonical pull, an existing uniquely owned matching event/evidence row is
targeted by its _existing_ primary key, still in the ordinary Watermelon
`updated` change set. The normalized incoming immutable event/evidence payload
fields use the matching original local bytes; the primary key and historical
financial facts are not rewritten. Duplicate candidates, missing proof, owner
drift or inconsistent canonical server facts fail the pull instead of advancing
its watermark. Fresh devices retain their canonical `id = action_id`.

Stale canonical group verification and its server hash/fingerprint checks are
untouched. The local installer accepts a noncanonical persisted row ID only when
the same legacy revision-zero proof succeeds and all other immutable fields
agree. Otherwise installation remains incomplete and locked.

Subsequent Dispose/Delete command reductions receive the same proven canonical
logical baseline. Details/History/Portfolio use proof-gated effective-action
lookups and cannot count an unresolved legacy terminal root as newly Active
wealth.

## Test sources authored, NOT RUN

- `metal-lifecycle-identity-service.test.ts`: valid E/D proof, canonical-only
  source, malformed/foreign/duplicate/numeric evidence, old Undo link refusal,
  repeated Dispose/Restore reducer chain and later Active eligibility.
- `undo-metal-holding-command-service.integration.test.ts`: original offline
  rev0 Dispose, new canonical Undo root/evidence/event, replay hash and restart;
  ordinary Sell fixtures are canonical; unproven E alias refuses Restore.
- `metal-legacy-disposal-baseline-read-model.test.ts`: logical read-model alias,
  old incompatible Undo refusal and missing-proof recovery.
- `sync/pull-legacy-metal-identity.test.ts`: event and evidence remapping,
  repeated canonical pulls, fresh canonical-only device, cross-user, duplicate
  incoming/local action and payload-mismatch refusal.
- `dispose-canonical-evidence.sqlite.integration.test.ts`: actual Watermelon
  change-application update classification preserving legacy primary keys
  without the two `(user_id, action_id)` unique-index collisions.
- `metal-canonical-action-group-cache.integration.test.ts`: accepted local
  revision-zero alias during canonical installation and immutable mismatch
  refusal.
- `dispose-metal-holding-command-service.test.ts` and
  `delete-metal-holding-command-service.integration.test.ts`: new lifecycle
  actions after canonical Undo of an original E!=D legacy disposal.

## Review and verification obligations

Lead must independently inspect ownership/auth rechecks, local Watermelon
identity matching, exact immutable payload hashing, the accepted/stale
reconciliation distinction, read-model History preservation and duplicate pull
behavior. Run the focused tests followed by affected TypeScript, ESLint, format,
SQL/server contract, wider integration and CI gates **only during Mohamed's
final pre-push batch**.

No local checkout, E2E/device, provider, Supabase/SQL execution, migration,
backfill, existing-row repair, push, PR comment, issue or branch mutation is
claimed or authorized in this source-authorship handoff.

If a real legacy device has absent or internally inconsistent canonical
root/event/evidence, this implementation intentionally cannot reconstruct or
repair it. It must remain in the existing recovery path pending explicit
separate data/contract authorization.
