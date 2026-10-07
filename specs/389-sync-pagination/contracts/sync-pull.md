# Contract: Sync Pull (client/server)

Minimal exact contracts for #255. No new business flow. MarketV2 RPC is
referenced, never repaginated. All server work lands in additive migrations: 082
fence foundation first, then the 4 copied hooks (split 083+ only if size
requires), final bindings/seal/journal migration last; prefix NOT reserved until
implementation verifies. Never edit old migrations.

## 1. Count-aware page envelope

Every pull surface returns one bounded JSON envelope (an INTERNAL typed adapter
over the normal PostgREST data/count/error response per §2 — NOT a new ordinary
JSON RPC):

```json
{ "rows": ["..."], "count": 0, "upperWatermark": "..." }
```

- `count`: exact remaining total for the bounded query (cap-independent).
- EOF rule: continue while `count > rows.length`; EOF iff `count == rows.length`
  (valid zero included).
- Failure: missing/invalid `count`, empty `rows` with positive `count`,
  malformed/non-advancing cursor, or query error → fail closed, advance nothing.
- Alternatively a server-explicit EOF flag is acceptable ONLY if verified inside
  the same single bounded envelope (no second round-trip).

## 2. Shared typed pager scope + client adapter

One shared pager implementation serves: ordinary rows, categories, dedicated
rows, snapshot active rows. Cursor: raw server timestamp + UUID tie. Watermark:
shared H (§5). The client adapter consumes NORMAL PostgREST data/count/error
responses — NO generic ordinary JSON RPCs are created. New RPCs are ONLY seal
(§5) + journal (§8). The existing marketV2 server-explicit EOF contract is
unchanged. The standard `{rows, count, upperWatermark}` adapter MAY be reused
for the journal owner page RPC.

## 3. Child ownership join

Server join includes owned soft-deleted parents (especially deleted children)
through the owned-parent chain. The client MUST strip the embedded owner (typed)
projection before the local record transform and MUST retain canonical typed
column projections. No fetched parent-ID lists.

## 4. Barrier table (private)

`private.sync_pull_barrier`: singleton row holding
`last_sealed_watermark timestamptz`. RLS enabled; direct access revoked for
PUBLIC, anon, authenticated, and service_role; fixed `search_path`.

## 5. Seal RPC (public)

`public.seal_sync_pull_v1(p_upper_watermark timestamptz)` returns `timestamptz`.
Granted to authenticated ONLY; requires non-null `auth.uid`. Seals ONLY the
ordinary barrier (`FOR UPDATE` semantics); reads the fresh committed market
barrier with NO additional market locks or calls. Validates: finite, millisecond
precision, not future, not beyond the validated market barrier, no clock
regression. H is the requested bound from the completed marketV2 traversal; M is
the fresh committed server market barrier read during sealing. Requires
`H <= M`, computes ordinary `S = max(S, H)`, and returns H unchanged, even when
M or S is newer.

## 6. Writer fence helpers (private, internal-only grants)

- `private.acquire_sync_writer_fence_v1()` returns `timestamptz`:
  shared-transaction row lock establishing the fence.
- `private.sync_write_time_v1()` samples the clock AFTER the lock, strictly
  greater than S, with non-regression; internal-only grants.
- Both callable by existing function owners; no old-body bypass.

## 7. Writer fence ordering

Writers hold the fence (`FOR SHARE` semantics) through commit BEFORE existing
domain locks; publication is sampled after fence acquisition and is strictly
greater than S. No generic immutable feed, no blanket validator. Stamp ONLY sync
publication fields; business/metadata clocks (e.g. existing `v_now`
initializations) are preserved.

## 8. Journal table + page RPC

`private.sync_snapshot_deletions(entry_id uuid PK, user_id uuid, table_name text CHECK (3 snapshot names), record_id uuid, published_at timestamptz)`:
no FK to the deleted row; no TTL; `INDEX (user_id, published_at, entry_id)`. RLS
enabled with the same revocations as §4; fixed `search_path`.

`public.pull_snapshot_deletions_page_v1(p_last_pulled_at timestamptz, p_upper_watermark timestamptz, p_after_published_at timestamptz, p_after_entry_id uuid, p_limit integer)`
returns JSON `{rows, count, upperWatermark}`. Bounded limit with type/bounds
checks; `auth.uid` owner only (NO caller-supplied owner parameter); cursor pair
all-or-none; `count` and `rows` computed from the SAME SQL snapshot.

## 9. Trigger rebinding

Rebind ONLY explicit target tables. Verify existing trigger names, order, and
guards BEFORE changing names; preserve ordering everywhere guards depend on old
stamps. Never globally replace shared `handle_updated_at`. Include existing
ordinary + child + financial + Metals + SMS writer bindings. Unsupported hard
deletes / ownership mutations MUST NOT quietly become new feed scope. Snapshot
publication triggers run only on INSERT: payload UPDATE preserves the original
`created_at` and existing 90-day retention cutoff. Known replacement producers
DELETE the old identity and INSERT a newly stamped identity; DELETE continues to
publish the old identity to the retained journal.

## 10. Four early hooks (proposal — verify before code)

In-place `CREATE OR REPLACE` of the four existing bindings at pinned sources,
exactly one added `PERFORM private.acquire_sync_writer_fence_v1()` per body, one
necessary `OR REPLACE` header fix, otherwise unchanged copies. No renames,
wrappers, grants, triggers, or exception-handler changes. Privileged RPCs carry
an explicit auth-owner filter independent of RLS.

| Binding                                    | Hook position                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `public.apply_account_financial_action_v1` | After payload-version rejection, before action-root row lock              |
| `private.apply_metal_action_v1_pre_285`    | After hash rejection, before holding advisory lock                        |
| `public.apply_metal_metadata_patch_v1`     | After (not inside) the null-owner delegation branch, before advisory lock |
| `public.sms_ai_reconcile_outcomes`         | After service-role/input checks, before advisory lock                     |

Preserved in all four: ACLs, `search_path`, roles, financial revisions,
idempotency, expected-`updatedAt` checks, exact error text.

Pinned sources (lead-verified): the active metals private entry lives in
`075_metals_persistence_hardening.sql:542–642` (NOT `070`), which retains the
Cairo future-sale-date guard. The four hooks cover supported app/public RPC
routes transitively — no extra private-entry hooks and no ACL revocations are
warranted. Private administrative SQL access is not a supported app path:
unverified and outside bounded core scope.
