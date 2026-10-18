---
name: offline-financial-systems
description:
  Build or assess an approved offline-first financial action, account-revision,
  migration, or sync-safety slice. Do not use for dashboard/UI work, direct
  database mutations, or unapproved schema and product decisions.
---

# Offline Financial Systems

Apply to bounded infrastructure that changes financial actions, account effects,
revisions, migrations, synchronization, or reconciliation. Read
`../../personas/offline-financial-systems-engineer.md` completely before work.

- Map current balance writers, authenticated ownership scope, and sync failure
  propagation before changing the protocol.
- Preserve action-id/payload-hash idempotency, expected-revision protection,
  immutable account-effect evidence, protected financial fields, and
  restart-safe reconciliation. A failed pull or push must remain a failed sync.
- Follow [delivery policy](../../../docs/development-workflow.md): direct
  implementation with batched checks and owner manual testing. Preserve focused
  pre-merge tests for duplicate retries, mismatched payloads, revision
  conflicts, restart recovery and failed sync; these tests may follow
  implementation.
- Classify every schema change under Constitution VII 2.1.0 BEFORE
  implementation: Supabase-owned/syncable DDL still requires sequential local
  `supabase/migrations` SQL and regenerated public types/local schema. A
  genuinely device-only Watermelon field/table, including a private column on a
  syncable parent, uses a versioned local migration plus generator-owned local
  schema override and non-generated model declaration instead. It MUST remain
  absent from all Supabase schema/types/push/pull/RPC/outbox/logs.
- Preserve authenticated ownership, RLS/CAS/revisions and full financial action
  evidence. For a private local field on a syncable model, verify cloud pull
  preserves it and push never serializes it. Verify fresh install, existing
  database upgrade and repeated local code-generation parity. Cover affected
  restart, failure and retention paths with focused checks required for data
  safety; commit the versioned migration, generator source, necessary model,
  generated schema and tests together. Never add a dummy Supabase field or
  manually patch a generated base model/schema to make local storage appear
  supported.
- Follow `docs/architecture/device-local-migration-policy.md` and
  `.agent/rules/database-migrations.md`. `npm run db:migrate` currently performs
  a remote `db:push` first; local generation is separate from separately
  authorized hosted deployment. Never execute DDL through the Supabase dashboard
  or MCP.
- Stop for missing recorded scope/schema/sync/product approval, a data-loss
  path, unknown writer, missing authenticated user scope/RLS/CAS guarantee,
  invalid generator parity, private-data leakage or unapproved remote mutation.
  Hand off evidence for independent database and security review.

Apply the delivery policy's first-release impact rule: include the smallest
protection for major harm, ask Mohamed for uncertain impact, otherwise defer.
Preserve pending data on safe failure; do not require an automatic recovery
framework or exhaustive scenarios solely because local storage is involved.
