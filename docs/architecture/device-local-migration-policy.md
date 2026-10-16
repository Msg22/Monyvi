# Device-only WatermelonDB migration policy

**Authority:** Monyvi Constitution VII, version 1.8.0 (2026-10-16). This
document describes a narrow implementation route, **not** approval to add a
particular field/table or to deploy Supabase changes. A feature's approved
technical contract and owned implementation wave still determine exact fields,
migration version, writer, and tests.

## Classify ownership before changing a schema

| Class                                                                                                             | Source of truth                                                                                  | Required migration and generation                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase-owned or syncable schema, including financial/action data needed by another device or server             | Sequential `supabase/migrations/NNN_descriptive_name.sql`                                        | Derive/update Watermelon schema/migrations and public generated types through the approved local generator; separate hosted deployment approval |
| Genuinely **device-only** Watermelon field/table, including a private column on an otherwise syncable local table | Versioned Watermelon migration and durable, generator-consumed **local-only** schema declaration | Regenerate or verify local schema/model integration and parity without introducing a Supabase schema/type field                                 |

An otherwise syncable table does **not** make its local-only extension syncable.
Conversely, calling a server-owned field "private" does **not** exempt it: a
financial balance, expected revision, action outcome needed for canonical
reconciliation, or cross-device business state belongs to the approved
server/CAS contract. If the data must be sent to or interpreted by Supabase, use
the sequential SQL path and preserve RLS. Never introduce a dummy Supabase
column merely to persuade the Watermelon generator to keep a device-private
value.

## Requirements for the device-only exception

1. **Evidence and scope.** Record why the data is required for offline
   correctness/privacy and why the server does not own it. Declare the exact
   local table/field, user/parent ownership, nullable legacy behavior,
   read/write/cleanup lifetime, and every prohibited transport. Confirm it is
   excluded from generic sync pull/push, dedicated RPC/action envelopes,
   protected outbox, outcomes, analytics, logs, and server type generation.
   Private content, especially raw SMS/recovery preimages, MUST NOT appear in
   server payloads, `payloadJson`, `outcomeJson`, or diagnostic logs.
2. **Versioned local migration.** Add the next ordered, uniquely numbered
   `packages/db/src/migrations.ts` Watermelon migration and advance the
   Watermelon schema version once. Use local migration primitives or a justified
   local-only step; provide a safe nullable/default-compatible upgrade from
   existing on-device databases. No Supabase migration, RLS/function mutation,
   hosted backfill, reset, or server schema change is implied by this exception.
3. **Generator authority.** Declare the private field/table in a maintained
   local-only schema/override source consumed by generation; where needed,
   extend the generator to incorporate or preserve that declaration. For a
   private column on a generated Supabase table, generation must keep the
   server-owned column projection and add only the explicit local override.
   Supply the field via a **non-generated** model extension and update
   export/type boundaries as needed. Do not hand-edit
   `packages/db/src/schema.ts`, `packages/db/src/models/base/*`, or
   `packages/db/src/supabase-types.ts` as the source of truth. Do not silently
   lose public generated fields or types, and do not mark local-only fields as
   Supabase `Row`/`Insert`/`Update` properties.
4. **Reproducibility and commits.** Regenerate via the approved **local**
   workflow and repeat the generation/parity check to ensure no private schema,
   migration, model field, public type, or sync exclusion disappears. Commit the
   versioned local migration, durable local override/generator, necessary
   non-generated model, generated schema, exports and tests as one cohesive
   feature change. A one-off hand patch to a generated file is not durable.
5. **Isolation and verification.** Prove fresh install and existing-version
   upgrade, restart/reopen, migration ordering, no data loss, strict owned-user
   scope, and atomic rollback. For a private field on a syncable parent,
   explicitly test pull/upsert and push mapping: an owned cloud refresh must
   preserve the local field, and neither new nor changed private values may leak
   to any remote request. Prove expiry/logout/retention cleanup and
   rejection/retry behavior for private recovery evidence, alongside
   financial-action idempotency, expected-revision CAS, RLS, and canonical
   reconciliation where relevant. Fail closed for missing/incomplete evidence.

A Watermelon-only table still requires authenticated owner scoping or an
approved immutable owned-parent chain. Device-only state is not an authority to
bypass a server CAS/ownership check or to substitute a local timestamp for a
canonical financial revision.

## Commands and deployment boundary

The current root `package.json` defines:

- `npm run db:sync-local`: local generation path (Watermelon migration
  conversion, local Supabase types, formatting, schema transform). This MUST be
  verified to preserve a newly declared device-only extension; if its generator
  would drop an extension, fix the durable generator/override before using it as
  evidence.
- `npm run db:migrate`: **runs `db:push` before `db:sync-local`**. It is
  therefore **not** a local-only generation command.
- `npm run db:push`: remote Supabase migration application. Run it only under a
  separate explicit hosted-deployment authorization after review.

For genuine Supabase DDL, create the sequential local SQL file, perform approved
local SQL/generator verification, and keep remote application as a separately
authorized step. For exclusively device-local DDL, there is **no** corresponding
Supabase SQL, public type or remote push. Never use Supabase MCP
`apply_migration`/`execute_sql` or the dashboard to mutate DDL.

## Review and authorization

The existing feature/business approval, TDD Red, exclusive file ownership,
strict TypeScript, source parity, independent database/security review, and
Root's final integration gates all remain mandatory. A technical policy
exception does not approve a specific feature's local storage layout, sync
boundary, data retention, or deployment. Feature-specific declarations and tests
belong in that feature's separately owned implementation PR; this policy change
itself modifies **no** application/schema/financial behavior.

If classification or generator safety is uncertain, **stop and surface the
concrete conflict** rather than adding a cloud placeholder, editing generated
output, dropping a protected field, or silently waiving a migration gate.
