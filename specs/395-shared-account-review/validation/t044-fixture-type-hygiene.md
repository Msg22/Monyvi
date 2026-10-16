# #395 T044 — Verification fixture DirtyRaw type hygiene

**2026-10-16 — NEW TEST-HYGIENE ONLY; NOT RUN.**

Source is the immutable complete verification context
`a08c23d5aca160a3120d8b7cf2b5689d0354fb68`, whose parent is
`11e1231adda508bf1a036ad24e6c7b25afb791b9`.

## Exact bounded change

Only `apps/mobile/__tests__/services/account-review-sync-test-fixtures.ts`
is modified. Its pinned previous blob is
`2bc4d561ef75d25367439c864464f5c82adfa1c7`.

At the pinned source, `withRoot` obtains
`changes.financial_action_groups?.created[0]`, typed as WatermelonDB
`SyncTableChangeSet["created"][number]` (`DirtyRaw`), then passes it to
an `update(root: ChangeRow)` callback. TypeScript correctly refuses the
call because `DirtyRaw` does not establish the required string `id`
of the local `ChangeRow` contract.

The new small private `validatedRootChange(value: unknown): ChangeRow`:

- Rejects null, arrays, primitive inputs, missing `id`, empty IDs, and
  non-string IDs before the mutation callback can run.
- Uses TypeScript's native `typeof`/`in` narrowing and an explicit
  immutable object spread `{ ...value, id: value.id }`; every other
  original dirty-row field, including payload/hash/owner/revision/status,
  is carried unchanged.
- Calls `update(validatedRootChange(original))` from the existing
  `withRoot` implementation, preserving its return shape, callback,
  and test-owned mutation semantics.
- Does **not** fabricate an ID, coerce a malformed row, silently drop
  dirty fields, widen production types, use `any`, cast, or suppress lint.
  Missing entire roots retain the prior `Missing canonical financial root`
  failure, and malformed existing roots are explicitly rejected.
- Leaves all existing T044 fixtures, review action envelopes, hash provider,
  registry, closed wire schemas, source payloads and 24 sync case assertions
  untouched.

This change fixes the specified structural type mismatch and adds
fail-closed malformed-root handling. **Actual Jest/TypeScript/ESLint Green
has not been established by this author**; Root owns the consolidated
verification batch. No execution/formatter/tools/tests were run.

## Ownership and import ledger

Changed paths: this NEW validation note and the single existing fixture.
`c89f34ca` Undo/command tests, verification sync tests,
production collectors/reconciliation, SMS/auth/financial actions, schema,
SQL, UI, locales and other workers' files remain read-only.

No refs/branch changes, push, PR/comment, deploy, provider/native/emulator,
delegation or Codex handoff.

**STOP — T044 fixture hygiene ownership released after GitData artifact.**
