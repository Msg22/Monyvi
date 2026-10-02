# Issue #242 Account Effects Manual QA

## Purpose

Exercise the user-visible guarded account writers that are implemented in PR #278
and keep the incomplete Issue #242 release gates explicit. This plan records manual
observations only; automated evidence and hosted CI remain separate.

## Status and boundaries

- Current implementation checkpoint before this plan: `9488f748604ab270c298ce2838ba2cd25d0a4a3c`.
- Implemented user paths: account create, account balance edit, transaction
  create/update/delete/conversion/batch delete, transfer
  create/update/delete/conversion, and recurring-payment Pay Now.
- Not implemented and therefore not passable here: selected batch import, SMS
  account preparation and every SMS review/live/background/headless/notification
  path, authenticated direct account updates, fixture restore/upsert, and account
  repair.
- Issue #339 owns durable restoration of losing transaction and transfer
  update/delete/conversion/batch-delete rows after a stale or rejected action.
  Until it lands, the full Issue #242 writer gate and credited Metals Sale/Undo
  remain closed.
- Android E2E is skipped in the current hosted workflow. Maestro and physical-device
  results must be recorded only after they are actually run.

## Preconditions

1. Use a disposable QA user with no production data and two signed-in devices or
   emulators for stale-revision cases.
2. Record each device's starting account balances and visible transaction,
   transfer, and recurring-payment state.
3. Prepare:
   - one EGP account with a nonzero balance;
   - one second EGP account;
   - one foreign-currency account with a known conversion amount;
   - one due recurring payment;
   - offline mode and a reliable way to terminate/restart the app.
4. For every scenario, record device, language, network state, starting state,
   final state, whether sync was attempted, and any recovery message.
5. Do not use credited Metals Sale or Undo as a shortcut for this plan; those
   journeys are blocked on the complete Issue #242 gate.

## Executable scenarios

### 1. Account creation

1. Create an account with a zero opening balance.
2. Confirm one account appears with balance zero; retry navigation or submission
   must not create another account.
3. Create another account with a nonzero opening balance.
4. Confirm the opening balance appears once, restart the app, sync, and confirm
   the same account and balance remain.
5. Repeat the final submission or sync after an interruption and confirm no
   duplicate account, adjustment, or balance change is visible.

Expected: zero-balance creation stays at revision-zero semantics without fabricated
financial history; nonzero creation is represented once and survives restart/retry.

### 2. Account balance edit and related metadata

1. Edit the EGP account's target balance and, in the same save, change one
   available metadata field such as default-account, bank, or SMS-sender data.
2. Confirm the target balance and metadata are both visible after save.
3. Restart before sync, reopen the account, then sync.
4. Confirm the adjustment and metadata remain together and the balance changes
   only once.
5. Repeat with a metadata-only edit and confirm it does not change the balance.

Expected: balance-changing edits are guarded and atomic with their related evidence;
metadata-only edits do not create a financial effect.

### 3. Transaction lifecycle

1. Create an income or expense and record the account balance delta.
2. Edit amount, type, date, or account so the financial effect changes.
3. Confirm the old effect is reversed and the new effect is applied once.
4. Delete the transaction and confirm its effect is reversed once.
5. Convert a transaction to a transfer, then exercise mixed batch deletion where
   available.
6. Repeat one financially changing case with the app offline, restart, reconnect,
   sync, and retry the same delivery.

Expected: each operation is all-or-none locally; replay/retry does not duplicate an
effect. Do not mark a stale losing update/delete recovery as passed until Issue #339
is implemented.

### 4. Transfer lifecycle

1. Create a same-currency transfer and confirm equal debit/credit effects.
2. Create a cross-currency transfer with an explicit destination amount and
   confirm each account uses its own currency precision.
3. Edit financial fields or swap accounts, then confirm old effects are reversed
   before new effects appear.
4. Delete a transfer and confirm both sides reverse exactly once.
5. Convert a transfer to a transaction and verify only the final domain record and
   intended account effect remain.
6. Repeat one case offline with restart, reconnect, sync, and duplicate delivery.

Expected: source and destination changes are one guarded group. The known Issue #339
stale-loser limitation applies to update/delete/conversion recovery.

### 5. Recurring Pay Now

1. Record the due schedule, account balance, and existing transaction list.
2. Use Pay Now while online; confirm one transaction, one balance effect, and one
   schedule advancement.
3. Repeat after an interrupted submission and after app restart.
4. Confirm retry/replay does not add another transaction or balance effect.
5. On two devices, make one Pay Now action lose the expected account revision.
6. Confirm rejection recovery restores the losing transaction, balance, and
   original schedule exactly once.
7. Before replaying a rejected action, edit the recurring schedule again.
8. Confirm recovery preserves the newer schedule and surfaces incomplete recovery
   instead of overwriting it.

Expected: transaction, effect, and schedule behave as one action. A newer schedule
edit always wins over restoration of the stale local preimage.

### 6. Stale device and repeated delivery

1. Start both devices from the same synchronized account state.
2. Take both offline and create conflicting implemented actions against the same
   expected account revision.
3. Reconnect and sync device A, then device B.
4. Confirm only one canonical action wins, the losing balance effect is compensated
   once, and repeated sync/restart does not apply either action again.
5. For a losing transaction or transfer update/delete, record the current known
   behavior as blocked by Issue #339; do not accept a mismatched domain row and
   canonical balance as a release pass.

Expected: no silent balance overwrite, false sync success, or duplicate compensation.

## Blocked release matrix

| Path | Current state | Evidence required before release |
| --- | --- | --- |
| Selected transaction batch import | Registry-blocked | One atomic selected batch, ordered per-account effects, replay, rollback, restart, foreign-account rejection |
| SMS durable and legacy review | Registry-blocked | Atomic selected batch, pending/new account creation, fingerprint deduplication, privacy-safe recovery |
| SMS foreground/background/headless/auto-confirm | Registry-blocked | Same owner-pinned action and fingerprint across every delivery mode |
| SMS notification confirm and ATM transfer | Registry-blocked | Idempotent repeated confirmation, dismissed notification, atomic bank/cash effects |
| Direct authenticated account update | Registry-blocked | Server enforcement proving protected balance/revision cannot be bypassed |
| Fixtures and repair | Registry-blocked | Deterministic test/developer cutover with no production bypass |
| Losing transaction/transfer mutation recovery | Deferred to #339 | Durable validated preimage, safe atomic restore, restart/replay and two-device evidence |
| Credited Metals Sale and Undo | Blocked by Issue #242 | Complete writer gate plus account-credit end-to-end evidence |

## Result record

For each executed row, record `Pass`, `Fail`, or `Blocked`, the build/head,
device and OS, language, network transitions, starting and ending balances, visible
domain records, retry/restart actions, and screenshots or logs. A hosted CI pass does
not replace these observations.
