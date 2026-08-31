# Financial-Action Foundation Dependency

Status: **implemented locally, pending SQL parity freeze**

## Stable candidate surface

- Root identity is `(user_id, action_id)`; local and remote row IDs are independent
  opaque identifiers.
- Same owner/action plus identical canonical payload text and hash is an idempotent
  replay; any text or hash mismatch is rejected.
- `payload_json` is the immutable restricted V1 envelope; `payload_hash` is the
  lowercase UTF-8 SHA-256 digest of its exact canonical bytes.
- Expected account revision remains `null` in Slice 3A. This foundation cannot
  mutate account balances or create account effects.
- Local access is current-user scoped, one-writer atomic, and retryable. Action roots
  are retained permanently with `deleted = false`.
- Standalone foundation creation starts at `pending_local`. Slice 3A does not mark
  domain work complete or queue dedicated sync; a future atomic domain writer owns
  `pending_local -> local_complete`.
- Repository logic is available through an injected factory bound to a specific
  WatermelonDB instance, plus the production default facade.
- `financial_action_groups` is permanently excluded from generic sync while both
  database generators continue to include it.

Approved Arabic fixture digest candidate:

```text
d9496846d80647644048c112aa501a2bf2985bc279445d82efdd96669b5718ab
```

## Pending freeze gate

TypeScript and local-storage coverage is green. PostgreSQL parity is not yet proven
because the local Docker-backed Supabase runtime is unavailable. The linked remote
project was not touched.

To complete T024:

1. Start local Supabase without contacting the linked remote.
2. Apply migration `067` locally.
3. Run `supabase/tests/financial_action_canonicalization_test.sql` and require all
   30 assertions to pass.
4. Regenerate Supabase types from the local schema and confirm no checked-in drift.
5. Re-run the logic, repository, sync, generator, typecheck, and diff checks.
6. Record and freeze the verified interface/schema hashes.

Security-review amendment: the final pgTAP file now declares 44 assertions after
adding exact payload-bound, auth/read-race, and recovery-evidence parity cases.
Local execution of all 44 is the remaining T024 gate. Static, TypeScript,
WatermelonDB, and deterministic-generator checks are green; no remote database was
touched.

QA amendment: the final executable plan is now 63 assertions after adding owner and
foreign RLS behavior, authenticated mutation/private-helper denial, privileged test
fixtures, immutable-root update attempts, and no-mutation verification. T024 must
execute all 63 locally before the SQL gate can close.
