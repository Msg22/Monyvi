# Account creation with default intent

Design only. Applies to approved Add Account Default flag, not unrelated Edit
form redesign. Current `createAccountForUser` accepts no later-account default
intent and separates zero from nonzero creation. Existing server account-create
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
`accounts/create_with_default/account.create-default/v1` through existing
foundation; source includes explicit default intent and expected
previous-default identity/metadata guard. Canonical account/child create fields,
exact opening effect and owner scope validated together. Zero opening balance is
valid and needs a complete metadata/create action without fabricated nonzero
effect. Nonzero opening balance uses existing exact financial revision guards.

In one server transaction, verify expected active-default snapshot, clear prior
owned default, create new account and owned children, post opening balance once.
Unexpected concurrent default, uniqueness/child failure or stale financial guard
rejects the whole action. Preserve at-most-one partial unique index; never
disable it or send independently acknowledged default-clear/create writes to
work around it. Retrying same actionID/hash is idempotent; changed input
requires fresh intent only after resolving an ambiguous prior outcome.

This new tuple, no-effect creation validation, protected push and reconciliation
are part of the proposed local SQL/sync scope requiring approval before
implementation. Existing account.create/v1 and Edit semantics remain supported;
do not expand the old tuple or migrate unrelated forms as a side effect.
Suppressed action-owned metadata cannot escape through generic sync. Rejection
reconciles default flags/account/children/opening effects together without
overwriting a newer canonical choice. No hosted reset/backfill planned.

## Coverage

M12/M18/M19: first account, later off/on, no default, multiple locally
inconsistent defaults, zero/nonzero balance, concurrent
creation/deletion/default change, uniqueness/card/sender errors, cancelled form,
failed preparation/commit/server apply, repeat-submit/action/hash conflict,
wrong owner and rollback/restart. Verify no previous default change before
successful commit and no unsupported generic push fallback. User-facing errors
use existing friendly recovery patterns.
