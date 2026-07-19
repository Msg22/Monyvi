# Contract: Trusted Production SMS Catalog

## Promotion boundary

- Input is an explicitly reviewer-approved Phase 2A candidate ID.
- Promotion fails unless schema, privacy, exact positive, near-match,
  intentional non-match, ambiguity, and integrity checks pass.
- One approved real sanitized candidate is sufficient; no sample-count minimum
  exists.
- Promotion requires an explicit immutable promotion record containing the
  promotion/candidate/pattern/catalog identities, designated reviewer identity,
  explicit approval timestamp, decision, and closed validation status codes.
- Output is a separate runtime catalog artifact. Candidate artifacts remain
  `candidate` and are never mutated into runtime entries.

## Initial promotion matrix

- Eligible exact QNB families: card purchase, ATM withdrawal, incoming/outgoing
  IPN transfer, refund/reversal, OTP, informational, and promotional.
- ATM withdrawals map to expense plus `isAtmWithdrawal=true` and remain review
  required.
- Incoming/outgoing IPN maps to external-counterparty income/expense.
- `bank_to_wallet_transfer` is explicitly excluded and remains unresolved for AI
  because the current runtime result lacks two owned account endpoints.
- Unavailable family/currency scopes produce no runtime entry.

## Runtime entry

Each entry contains stable identity/version, provider and sender scope, enabled
state, reviewed fixed fragments, placeholder-role metadata, expected outcome,
review-only policy, provenance code, and validation status.

It must not contain raw evidence messages, full evidence samples, concrete
placeholder values, account/card values, people, merchants, balances, phones,
references, or evidence timestamps.

## Validation

The catalog is invalid when any entry has duplicate identity, unsupported
schema, candidate/dev-test scope, missing reviewer approval, broadened
structure, unsupported placeholder role, production auto-selection, incomplete
validation, or integrity mismatch.

Invalid catalog state activates no local production patterns. Candidates remain
eligible for AI under the normal consent gate.

## Activation

The first implementation reads a bundled version and enabled flags. Activation
is accessed through an interface so a future cached remote manifest can select
enabled IDs without changing pattern identity, match semantics, or output.

Disabling one pattern affects only that identity/version. Offline execution uses
the installed valid activation state.

Failed OTA/app update activation retains the prior installed valid bundle. If
the current bundled catalog fails runtime validation, no local production
patterns activate and candidates remain eligible for AI.
