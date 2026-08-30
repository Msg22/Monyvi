---
name: offline-financial-systems
description: Build or assess an approved offline-first financial action, account-revision, migration, or sync-safety slice. Do not use for dashboard/UI work, direct database mutations, or unapproved schema and product decisions.
---

# Offline Financial Systems

Apply to bounded infrastructure that changes financial actions, account effects,
revisions, migrations, synchronization, or reconciliation. Read
`../../personas/offline-financial-systems-engineer.md` completely before work.

- Map current balance writers, authenticated ownership scope, and sync failure
  propagation before changing the protocol.
- Preserve action-id/payload-hash idempotency, expected-revision protection,
  immutable account-effect evidence, protected financial fields, and restart-safe
  reconciliation. A failed pull or push must remain a failed sync.
- Write focused tests first and show Red evidence for duplicate retries,
  mismatched payloads, revision conflicts, recovery after restart, and failed
  synchronization.
- Make DDL only in sequential `supabase/migrations` files; update required
  WatermelonDB migration/schema and generated artifacts through the approved
  local workflow. Never execute schema changes through the dashboard or MCP.
- Stop for missing recorded schema/sync/product approval, a data-loss path,
  unknown writer, missing user scope/RLS guarantee, or required remote mutation.
  Hand off evidence for independent database and security review.
