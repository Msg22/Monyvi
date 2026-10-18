---
trigger: always_on
---

# Database Migration Rules

## Constitution VII 2.1.0 — Classify Before Migrating

All schema changes MUST be local-first, versioned and source-controlled.
Classify each proposed field/table as **Supabase-owned or syncable** versus
**genuinely device-only WatermelonDB** before authoring a migration. The sole
device-local exception is defined by Constitution VII and
`docs/architecture/device-local-migration-policy.md`; it is not permission to
hide server-owned financial fields, evade expected-revision CAS, RLS or
authenticated ownership, or deploy a hosted change.

### Server-Owned / Syncable DDL (Existing Rule)

- Create sequential local `supabase/migrations/NNN_descriptive_name.sql` files
  for schema, tables, columns, indexes, triggers, functions, RLS policies, enums
  and every field that is server-owned or participates in sync.
- Keep the Supabase public types and generated WatermelonDB columns/models in
  parity with local SQL. Commit migration, generated schema/types, and necessary
  local migration artifacts together.
- Do **not** use Supabase MCP `apply_migration`/`execute_sql` for DDL, the
  Supabase dashboard, or direct hosted mutation. Supabase MCP is read-only for
  schema/data/log inspection in this workflow.
- Remote `db:push`, SQL deployment, backfill, reset or hosted RLS changes
  require separately recorded approval. A local SQL implementation grant does
  not authorize remote application.

### Narrow Device-Only WatermelonDB Exception

A field/table may exist **only in WatermelonDB**, even as a private column on a
syncable parent table, solely when the approved feature contract proves that it
is **never** server-owned, never synchronized and never part of a remote
financial action. The feature owner MUST:

1. Declare the exact device-only field/table, approved owner/parent scope,
   legacy null/upgrade behavior, retention and intended cleanup. Exclude it from
   generic pull/push, dedicated RPC/action/outbox, `payloadJson`, `outcomeJson`,
   logging and all cloud data mappings. Private recovery preimages/raw messages
   MUST never leave the device. A private field on a synced parent must survive
   an authenticated cloud pull/upsert without being overwritten by absent remote
   data.
2. Add one ordered, versioned local Watermelon step in
   `packages/db/src/migrations.ts` and bump the Watermelon schema version. Keep
   the local schema declaration in a generator-consumed, non-generated overlay
   and the field decorator/model in a non-generated model extension. If existing
   generators overwrite this extension, update their durable source
   configuration first. NEVER hand-edit generated `packages/db/src/schema.ts`,
   `models/base/*`, or `supabase-types.ts` to fake support, and NEVER create a
   dummy Supabase column or public type.
3. Verify local code generation can be run repeatedly with parity, preserving
   all public generated fields and the new private extension. Verify fresh
   installs and upgrades, ownership, sync pull preservation and push/privacy
   exclusion. Cover relevant restart, failure and cleanup paths with focused
   checks where omission could lose, corrupt or expose data. Commit the
   versioned local migration, durable schema override/generator, needed
   non-generated models, regenerated outputs and focused tests together.
4. Preserve existing server CAS, financial-effect/revision/idempotency,
   owner/RLS and failed-sync semantics. Stop when the field cannot honestly be
   device-only, ownership is not proven, data would leak to cloud/logs,
   generator parity is missing or recovery could overwrite newer data.

This does not authorize adding the actual local field, migration version,
feature-specific sync exclusion, or database code in a workflow-policy PR. Those
implementation artifacts belong to the feature's separately owned PR and
independent database/security review. Follow
[delivery policy](../../docs/development-workflow.md): direct implementation,
batched checks and focused safety tests before merge; no tests-before-code gate.
Apply the first-release impact rule to rare cases. Preserve pending data and
surface a safe error when sufficient; do not add speculative recovery frameworks
or an exhaustive test matrix.

### Migration / Generation Commands (Do Not Conflate With Deployment)

Current root `package.json` defines:

- `npm run db:sync-local` — local Watermelon conversion, local Supabase types
  and schema/model regeneration. Check that its generator preserves the
  device-only overlay; do not assume a hand-edit survives.
- `npm run db:migrate` — calls `db:push` **first**, then `db:sync-local`. It is
  NOT an offline/local-only generation command.
- `npm run db:push` — applies Supabase migrations remotely and MUST NOT be run
  without separate, explicit hosted deployment approval.

For Supabase-owned changes: write and review the numbered local SQL, run only
the authorized local generation/verification commands, and commit the SQL plus
complete generated/local schema changes. Remote application is a separate
approval/deployment step.

For device-only changes: write the versioned Watermelon migration and
generator-authoritative local schema/model declarations **without** creating SQL
in `supabase/migrations/`, altering public Supabase generated types, or invoking
a hosted push. Reconcile generator tooling if local regeneration is not
reproducible; never silently waive the parity gate.

### Why Sequential Local SQL Still Matters

Using dashboard or MCP DDL for server-owned changes causes remote migration
history to diverge from source control: `db push` version mismatches, lost
migration provenance, manual repair, and collaboration conflicts. The
device-local exception does not weaken this requirement.

### Migration File Naming

Follow the existing Supabase sequential numbering, e.g.
`supabase/migrations/023_descriptive_name.sql`, for genuinely server-owned DDL.
Device-only version numbers belong to the ordered Watermelon migration history
instead, never a dummy server SQL migration.

### Bringing Existing Supabase Tables into WatermelonDB

When adding an existing Supabase table to WatermelonDB sync (e.g., removing it
from `EXCLUDED_TABLES` in `transform-schema.js` and
`sql-to-watermelon-migration.js`), you **MUST** manually add a `createTable`
step to `packages/db/src/migrations.ts` and bump the schema version. The
auto-generation script (`sql-to-watermelon-migration.js`) cannot detect this
case because no `CREATE TABLE` statement exists in the latest SQL migration —
the table already exists in Supabase.

### DROP COLUMN Behavior

WatermelonDB does **not** have a `dropColumn` migration primitive. When a column
is removed from the Supabase schema:

- Remove it from `transform-schema.js` mapping (or let the script auto-exclude
  it)
- The column will remain in local SQLite but WatermelonDB ignores extra columns
- **No WatermelonDB migration is needed** for column drops
