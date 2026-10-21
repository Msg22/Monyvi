# Account creation with default intent

Frozen T004 technical target; exact current-state default CAS,
absence/money/mutation fields and API exports are in
[wire shapes](wire-shapes.md). Current active owned UUIDs and zero/one default
UUID/true flag are the guard; no expectedUpdatedAt or new global revision/schema
counter. Shared owner serialization remains a narrow SQL implementation-proof
gate subject to independent DB/logic review. Local
SQL/action/sync/reconciliation implementation scope is owner approved; the new
operation is not implemented. Applies to approved Add Account Default flag, not
unrelated Edit form redesign. Current `createAccountForUser` accepts no
later-account default intent and separates zero from nonzero creation. Add
retains its **own** `expectedDefaultSnapshot` name and `defaultIntent`; review's
unshipped `review.batch-save/v1` separately uses `creationDefaultSnapshot` when
any Cash/Bank/Wallet account is created. Both reuse the exact common
`DefaultSnapshot` shape and owner-wide serialization, without changing this Add
tuple, a deployed tuple, or persisted schema. Existing server account-create
mutation simply inserts the requested flag; it does not clear a prior default.
SQL029/033 unique active-default constraint must remain.

## Local command

Extend validated creation input with explicit default intent. First active
account always default; later OFF preserves prior/no default, ON replaces prior
default. Capture owner and existing-default snapshot; revalidate active count,
uniqueness, default metadata and owned references inside writer, including a
default added or deleted while form is open. No hooks write DB state.
Invalid/failed/cancelled create changes neither prior default nor persisted
account/children.

One local preparation/commit includes account, optional bank/sender children,
prior-default clearance when needed and opening-balance action. No separate call
to Edit's toggle after account creation. Preserve posted opening-balance
precision, no duplicate-submit/child records and existing
type/currency/provider/sender rules. Helpers expose the original flag's
accessible switch/disabled states.

## Coordinated atomic server support

Propose new strict tuple
`accounts/create_with_default/account.create-default/v1`, operationCode
`account.create-default`, through existing foundation; source includes explicit
default intent and expected previous-default identity/metadata guard. Canonical
account/child create fields, exact opening effect and owner scope validated
together. Zero opening balance is valid and needs a complete metadata/create
action without fabricated nonzero effect. Nonzero opening balance uses existing
exact financial revision guards.

Default-only clear has expectedIsDefault=true and after.id equal to the current
captured default; it updates only isDefault=false. Other metadata/balance fields
are preserved. Identical historical A→B→A state is equivalent and accepts;
different current active/default state rejects atomically. Offline successor
actions wait for their durable local predecessor action IDs to canonicalize
before push; replay never rewrites the immutable snapshot or generates new IDs.

In one server transaction, verify expected active-default snapshot, clear prior
owned default, create new account and owned children, post opening balance once.
Unexpected concurrent default, uniqueness/child failure or stale financial guard
rejects the whole action. Preserve at-most-one partial unique index; never
disable it or send independently acknowledged default-clear/create writes to
work around it. Retrying same actionID/hash is idempotent; changed input
requires fresh intent only after resolving an ambiguous prior outcome.

Main `de09f76bdadb570c99a1015bbf1c680279b0d5ad` ends at
`089_historical_metal_rate_request_limits.sql`; reserve
`supabase/migrations/091_account_create_default.sql` (090 is review; 088 gap is
not reusable). This Add-only migration implements the new tuple, no-effect
creation validation, protected push and reconciliation inside the approved local
SQL/sync scope. Existing account-create tuple
`accounts/create/account.balance-effects/v1` and Edit semantics remain
supported; do not expand the old tuple or migrate unrelated forms as a side
effect. Suppressed action-owned metadata cannot escape through generic sync.
Rejection reconciles default flags/account/children/opening effects together
without overwriting a newer canonical choice. No hosted reset/backfill planned.

## Coverage

M12/M18/M19: first account, later off/on, no default, multiple locally
inconsistent defaults, zero/nonzero balance, concurrent
creation/deletion/default change, uniqueness/card/sender errors, cancelled form,
failed preparation/commit/server apply, repeat-submit/action/hash conflict,
wrong owner and rollback/restart. Verify no previous default change before
successful commit and no unsupported generic push fallback. User-facing errors
use existing friendly recovery patterns.

## T069 additive Add rejection contract — 2026-10-16

This section is the exact Add-only amendment to the common new-tuple outcome
boundary in `wire-shapes.md`. The earlier implementation-status paragraphs
record their historical planning baseline: the actual Add writer now exists at
`58acc73646426dcd5535f4b1885dd826d7747f2e`, but durable Add recovery is not
proved. The actual SQL candidate at `f4ba7ccc22244cf3672c1a14a09132ed0d23e318`
is `supabase/migrations/091_account_create_default.sql`; the earlier `_intent`
filename is a reservation, not a second migration to create. No code or SQL is
changed by this reconciliation.

### One closed server extension, not a new public Add request

The only added server-outcome key is `canonicalDefaultSnapshot`, permitted
**only** for `accounts/create_with_default/account.create-default/v1` with
`status: "stale" | "rejected"`. Its value is the existing closed
`accountDefaultSnapshotSchema` / `DefaultSnapshot`, exactly:

| Key                | Required value                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeAccountIds` | Distinct, canonical ASCII-sorted owned active account UUIDs; `[]` is valid.                                                                                                                           |
| `defaultAccount`   | Exactly `{accountId: UUID, isDefault: true}` or `null`. The UUID must occur in `activeAccountIds`; an empty active set requires null. A nonempty set with null is valid intentional no-default state. |

The object and its non-null member are strict: no extra keys, timestamps,
revision counter, device ID, owner metadata, balances, child content or raw
private snapshot. `canonicalDefaultSnapshot: null` is invalid, not shorthand for
an empty graph. The outer response retains its existing status-specific closed
fields and presence rules, adding exactly this key; do not relax any other
outcome validator or rename `canonicalAccounts`, `canonicalRevision`,
`accountRevisions`, `canonicalAbsentAccountIds`, `actionId`, `status` or `code`.
Accepted/idempotent Add, Review and deployed tuples keep their existing outcome
shapes and MUST NOT acquire this key, including a null-valued key. The public
Add envelope, payload version, `expectedDefaultSnapshot`, `defaultIntent`,
financial guards and payload hash projection remain byte-compatible.

Every newly persisted, authenticated and immutable-root-bound Add business
stale/rejection outcome MUST contain this object. Historical outcomes and
failures before trusted owner/envelope/root binding may lack it under their
existing failure schema; they are **not automatic-recovery authority**. A
missing snapshot must never be synthesized from the client request, guessed from
financial `canonicalAccounts`, or added to an immutable old receipt.
Malformed/foreign/auth/unsupported/transport failures must not disclose an
unverified owner's graph or masquerade as a recoverable business rejection.

Capture the complete current owned active/default graph **after rolling back all
tentative Add account/default/child/effect business writes**, while the existing
outer authenticated owner-serialization and immutable action-identity locks are
still held. Store the snapshot with the canonical failure outcome and owned root
in the same server transaction. The no-business-write stale path uses that same
protected boundary. Read the whole active graph, not merely the financial guards
(which are empty for zero opening). Preserve the unique active default index and
existing lock ordering/publication gates. Inconsistent graph or inability to
retain the required owner serialization fails without inventing an outcome; no
lock upgrade, new global revision, table, column or endpoint is authorized. The
existing SQL serialization proof remains a prerequisite.

Bind the receipt through the owned persisted root's exact action ID, owner,
tuple, domain reference, canonical envelope bytes and payload hash; the outcome
`actionId` must match. The snapshot is not self-authenticating merely because it
parses. Replayed stale/rejected action ID plus identical hash returns the
**original stored outcome and graph**. A different hash does not replace it.
This is immutable rejection-time authority, not an always-latest cloud claim.
Later unseen remote changes are handled like later changes after existing
canonical financial receipts; there is no mandatory fresh generic pull, TTL, new
cloud freshness API or automatic replay under a resampled default.

### Sufficient and insufficient recovery authority

The dedicated Add recovery described in `local-recovery.md` may restore only
when the receipt's graph exactly equals the durable Add
`expectedDefaultSnapshot`, the current local graph exactly equals its actual
`preparedDefaultSnapshot`, and all account/default/child/effect postimage,
owner, dependency and revision guards pass. The losing new account must be
positively present in `canonicalAbsentAccountIds`; absence from
`canonicalAccounts` alone proves nothing. An owned or foreign physical ID
collision cannot be declared absent. Existing canonical financial snapshots
retain their exact vocabulary and verification rules, but are not default or
child restoration evidence.

A differing canonical active/default graph, missing/invalid evidence, newer
local choice, changed child, changed financial revision, extra dependent
financial member or unresolved predecessor leaves recovery unresolved with no
partial mutation. Do not pick a different default, import a guessed canonical
graph, invoke legacy inverse compensation or silently cancel dependent actions.
A rejection target that is empty is legitimate: remove the proven losing
creation locally and restore no default. A nonempty target with null default
also restores no default. A prior default is restored only when that exact
captured owned account was actually cleared by this Add and is still proven.

### Protected transport and correction isolation

A zero-opening Add is a complete protected action with `accountGuards: []`,
`accountEffects: []`, zero physical effect rows and account revision `"0"`.
Admit that exact registered shape after full create/default/child/membership
validation; do not require a fabricated effect or relax the empty-guard rule for
Review, nonzero Add or old operations. Nonzero Add retains one exact opening
effect and its new-account guard/revision transition `"0"` to `"1"`. Incomplete
Add bundles remain protected and unacknowledged, never generic LWW.

Add compensation is local application of canonical rejection, **not new user
intent**. Losing account/child tombstones, opening-effect deactivation and
recovery-generated default flips or balance changes must never be exported
through generic create/update/delete sync, even on a later sync after the root
becomes reconciled. Preserve unrelated dirty metadata and its acknowledgement
rights using the exact field-level rules in `local-recovery.md`; never reset an
entire old `_raw`, `_changed` or `_status` snapshot. A whole-row generic upsert
that includes the corrected `is_default` despite that field being clean is not
permitted. A later independently authored default edit remains a new genuine
intent; the historical receipt does not authorize suppressing it forever.

Durable dependency entries bind actual owned predecessor roots and hashes; Add A
must be canonically accepted before dependent B dispatches, including after cold
restart. B's original payload/hash/default snapshot are immutable.
Pending/unsupported A holds B; rejected, missing, foreign or hash-mismatched A
blocks B without RPC or resampling. Keep dependency evidence and required
predecessor roots until all consumers are terminal. Accepted/idempotent root
state alone is not permission to erase private evidence before protected ACK,
local residual-dirty preservation and dependency cleanup are safely complete.

For **newly prepared Add commands**, preserve two independent technical
projections of the ORIGINAL frozen active/default graph. The device-private
twelve-key `dependencyRoots` member MUST contain the **complete, ASCII-sorted,
unique (actionId, payloadHash) set** of all relevant registered, owned account
CREATE roots, whether each creator is already accepted/idempotent or remains
unresolved when B is prepared. `dependencyActionIds` remains a separate
unresolved-only command/transport-blocking set; it is not the private recovery
journal and is not added to the public Add payload. The prepare and writer
boundaries rederive/verify the same complete original creator identities, guard
journal and canonical payload/hash, including when a creator changes from
unresolved to accepted before B's atomic local commit. A later acceptance cannot
replace the originally captured payload hash or resample B's frozen graph.
Recovery independently demands complete exact creator-root membership and
canonical accepted/idempotent receipts; neither current state labels nor
timestamps establish acceptance **at preparation time**. Pre-existing
unresolved-only private snapshots with missing relevant accepted creators remain
fail-closed; no retroactive backfill, private key/version change, automatic
destructive migration, altered SQL outcome or changed Add owner-wide snapshot
CAS is authorized.

### T069 local completion versus a later genuine default Edit (2026-10-17)

The first valid rejection/atomic compensation of optimistic Add B restores its
proven captured prior A as default (when applicable) and tombstones B. A
subsequently initiated **ordinary user Edit** may legitimately select a distinct
already-owned D as the new default and clear A; this does NOT invalidate the
earlier completed recovery or authorize restoring A a second time. Both **before
first root ACK** and **after a prior guarded ACK**, A's and D's independently
dirty metadata/default fields must be eligible for the existing owner-bound,
clear-before-set, positively acknowledged metadata UPDATE path; B's original
recovery-only default/tombstones/effect remain excluded from generic
push/replay. An ordinary metadata-only Edit now applies its metadata writes in
**one safe prepared batch** inside the existing writer, restores the cached
beforeimages when a confirmed precommit failure occurs, and **never creates a
financial effect** (no action, RPC, receipt or default-effect change). The
owner-bound clear-before-set metadata UPDATE contract and its positive
count-and-id acknowledgement are unchanged. Narrow pending metadata pull
admission hands unmodified remote rows to the SDK dirty-column merge; equality
alone is **not** an acknowledgement.

For this narrow T069 technical liveness condition, a separate versioned
**terminal private carrier** in the SAME existing local-only root field records
a completion fact written _only_ with the dedicated compensation
`commitPreparedBatch`. Its original strict 12-key
`account-create-default-local-save/v1` snapshot, including complete
accepted-plus-unresolved original creator provenance, is preserved as the
**exact** originally stored canonical byte string. No first-ACK/clean-status,
timestamp, dirty bit, remote state or late Edit is compensation authority. This
is not a changed public Add payload, SQL091 outcome, financial protocol,
original private snapshot key/version, a newer business decision, or a new local
schema. Legacy plain 12-key terminal roots without this positive writer-owned
completion remain on the original strict proof path and can conservatively block
after A subsequently changes. Do NOT lazily backfill them. The complete
binding/reader/privacy/Red rules are in
[local recovery](local-recovery.md#t069-terminal-add-compensation-liveness--bounded-technical-amendment-2026-10-17)
and
[T069 completion proof](../validation/t069-compensation-completion-contract.md).

The detailed schema, state/cleanup rules and implementation ownership proposal
are in `local-recovery.md` and
`../validation/t069-recovery-contract-reconciliation.md`. Root-run fresh Speckit
analysis, meaningful correctly serialized Red, disjoint source grants and
independent SQL/sync review remain required. No Green, activation or hosted
compatibility is claimed.

### Current workflow status (2026-10-21)

- The portable Default fix is in the reviewed child commit `0fa4dc3f` and is
  cherry-picked into the parent branch with this change.
- The ordinary zero-delta metadata Edit now uses one safe prepared batch,
  restores the cached beforeimages on a confirmed precommit failure and never
  creates a financial effect; the owner-bound clear-before-set metadata UPDATE
  with positive count and id acknowledgement is unchanged, and narrow pending
  metadata pull admission hands unmodified remote rows to the SDK dirty-column
  merge (equality alone is not an ACK).
- Verified in this delivery: the account default atomic Edit and pending pull
  suites, the category catalogue service and SQLite runner suites, and the
  mobile typecheck and touched-path lint. Device visual QA was **not** run (the
  phone stayed locked/AOD), so the manual contrast and default-swap steps remain
  open.
