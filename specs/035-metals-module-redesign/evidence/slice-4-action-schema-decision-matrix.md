# Slice 4 Action-Schema Decision Matrix

## Status

Superseded on 2026-09-05. This file is retained only as historical decision
context; none of its blocking or empty-registry statements are current. The
newer approved registry contract, PR #254 task note, and the production DEFAULT
registry authorize the exact Add, Correct, Sell v2, Dispose, Delete, and Undo
schemas. The table below must not be used to reopen those settled decisions.

## Grounded common contract

Every action is an owner-scoped canonical financial-action envelope linked to
exactly one Metals evidence row and one lifecycle event by `actionId`. The hash
covers the schema version, kind, owner, holding, expected holding revision,
empty ordered account guards, event time, and exact payload.
`expectedHoldingRevision` is `null` only for Add and a canonical
unsigned-integer string for every later material action. Slice 4 rejects every
account effect and keeps `accountGuards` empty. Unknown keys, missing required
keys, numeric JSON tokens, and unregistered schema tuples fail closed.

| Action    | Approved facts and invariants                                                                                                                                                                                                                                                                  | Decision still required before exact schema registration                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add`     | Gold/Silver only; complete positive exact weight; complete catalog-v1 purity tuple; positive exact total purchase cost; ISO purchase currency; purchase date; null expected revision; optional independently captured acquisition Metal/currency references; no account effect                 | Exact payload key names and nesting; name/notes placement; date wire form; item-form representation; whether reference rows are embedded facts or ID links; explicit nullable fields                                                  |
| `correct` | Existing owned holding; non-null expected revision; Metal type cannot change; immutable before/after exact fact evidence; a legacy-incomplete correction supplies the complete required fact set; accepted projection may replace the acquisition action/reference-set link; no account effect | Exact prior/replacement object shapes; which facts a material correction must repeat; predecessor link fields; rate-reference representation; reason/notes fields; null rules                                                         |
| `sell` v2 | Existing active holding; non-null expected revision; holding-only mode; `includeAccountCredit` remains false until #242/069; sale proceeds and fees use canonical exact strings; terminal Metal/currency references preserve consumed observations                                             | Complete v2 key set and nesting; how the revision is embedded; gross/fee/net relationship and currency-scale validation; sale date versus envelope time; proceeds currency field; predecessor link fields; notes null/empty semantics |
| `dispose` | Existing active holding; non-null expected revision; category required; creates no sale P/L and no account effect                                                                                                                                                                              | Category identifier versus stable code; allowed category catalog; disposal date versus envelope time; predecessor link fields; reason/notes and reference fields; null rules                                                          |
| `delete`  | Existing mistaken active record; non-null expected revision; hides the holding without deleting append-only action/event evidence; no account effect                                                                                                                                           | Eligibility proof fields; reason/notes; predecessor link fields; whether the prior projection snapshot is required in payload; null rules                                                                                             |
| `undo`    | Non-null expected revision; references the effective event/action; holding-only Slice 4 mode creates no account effect; deterministic lifecycle reversal restores the prior verified projection                                                                                                | Exact target event/action keys; restored projection/snapshot fields; reversal eligibility facts; how an absent account effect is represented; predecessor/reversal link fields; reason/notes and null rules                           |

## Safe implementation boundary

Migration, owner scope, canonical envelope/hash verification, evidence
uniqueness, revision grammar/range checks, fixture tooling, and fail-closed
rejection of unregistered tuples may proceed. Accepted RPC mutation, TypeScript
registry entries, and action-specific SQL validators remain blocked until this
matrix is resolved and approved as a versioned contract.
