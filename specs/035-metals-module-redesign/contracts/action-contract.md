# Generic Financial-Action Contract

## Scope And Version

Slice 3A owns this restricted canonical envelope for the generic
`financial_action_groups` root. It is identity, durable outbox, replay, and outcome
evidence; it does not own domain lifecycle facts, holding revisions, account effects,
or mutable synchronization state. The live #242 account-integrity issue remains
verified open/current: Slice 3A accepts only `expectedAccountRevision: null` and
does not enable account effects.

`envelopeVersion` is exactly `"monyvi.financial-action/v1"`. `payloadVersion` is a
registered domain payload literal such as `"metals.sell/v1"`; the registry selects
one exact payload schema for the tuple `(domain, kind, payloadVersion)`.

## Canonical `payload_json` Envelope V1

Every root stores this complete envelope in `payload_json`; `payload_hash` is not a
member because it hashes the complete serialized envelope.

```ts
declare const registeredActionKindBrand: unique symbol;
declare const registeredPayloadVersionBrand: unique symbol;
declare const canonicalUnsignedIntegerStringBrand: unique symbol;

export type RegisteredActionKind = string & {
  readonly [registeredActionKindBrand]: true;
};
export type RegisteredPayloadVersion = string & {
  readonly [registeredPayloadVersionBrand]: true;
};
export type CanonicalJsonValue =
  | string
  | boolean
  | null
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };
export type RegisteredActionPayload = {
  readonly [key: string]: CanonicalJsonValue;
};
export type CanonicalUnsignedIntegerString = string & {
  readonly [canonicalUnsignedIntegerStringBrand]: true;
};

interface FinancialActionEnvelopeV1 {
  readonly actionId: CanonicalUuid;
  readonly domain: "metals" | "transactions" | "transfers" | "recurring_payments" | "sms";
  readonly domainReferenceId: CanonicalUuid;
  readonly envelopeVersion: "monyvi.financial-action/v1";
  readonly expectedAccountRevision: CanonicalUnsignedIntegerString | null;
  readonly kind: RegisteredActionKind;
  readonly occurredAt: UtcMillisecondTimestamp;
  readonly payload: RegisteredActionPayload;
  readonly payloadVersion: RegisteredPayloadVersion;
  readonly userId: CanonicalUuid;
}
```

The local and remote row `id` values are opaque persistence identifiers. They are
independent of `actionId`, need not match one another, and must never be derived from
the envelope. Identity is exactly the owner-scoped pair `(user_id, action_id)`;
`actionId` is stable across local retry, restart, and server replay. `actionId`,
`userId`, and `domainReferenceId` accept only canonical
lowercase UUID text: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`.
`domain`, `kind`, and `payloadVersion` must resolve to an approved registry entry;
they are never inferred from display copy or payload contents.

## Typed Registry And Dispatcher

The generic ten-key envelope, canonical serializer, hash algorithm, and root
repository are immutable V1 infrastructure. They do not learn domain payload fields.
The typed dispatcher resolves exactly one immutable registry definition by the tuple
`(domain, kind, payloadVersion)`, then calls that definition's exact payload validator.

```ts
interface FinancialActionDefinition<
  TDomain extends string,
  TKind extends string,
  TPayloadVersion extends string,
  TPayload extends RegisteredActionPayload,
> {
  readonly domain: TDomain;
  readonly kind: TKind;
  readonly payloadVersion: TPayloadVersion;
  readonly validatePayload: (raw: unknown) => TPayload;
}

type FinancialActionRegistry = readonly FinancialActionDefinition<
  string,
  string,
  string,
  RegisteredActionPayload
>[];

const defaultFinancialActionRegistry: FinancialActionRegistry = Object.freeze([
  Object.freeze({
    domain: "metals",
    kind: "sell",
    payloadVersion: "metals.sell/v1",
    validatePayload: validateMetalsSellPayloadV1,
  }),
]);

declare function createFinancialActionRegistryForTest(
  definitions: FinancialActionRegistry
): FinancialActionRegistry;
```

Only `("metals", "sell", "metals.sell/v1")` is registered in Slice 3A.
`createFinancialActionRegistryForTest` creates an isolated immutable registry for
fixtures; production always uses the immutable default. A future action adds its own
registered validator and tuple without changing the envelope, serializer, hash, or
repository. The PostgreSQL dispatcher resolves and validates the same tuple before its
canonicalization boundary; SQL and TypeScript registry behavior require parity tests.

The sole Slice 3A Metals sell validator requires `includeAccountCredit: false`.
`true` is rejected until #242/T033 authorizes a separate account-effect capability;
that later capability may add validation but cannot change V1 serialization or hashing.

## V1 Technical Safety Ceilings

These are representation and resource ceilings, not business wealth caps. Every
canonical financial numeric string—decimal, minor-unit, or revision—has at most 50
significant decimal digits. A canonical decimal has at most 18 fractional digits
(scale). The `metals.sell/v1` validator requires `grossProceedsDecimal` to be strictly
greater than zero and `feeMinorUnits` and `netProceedsMinorUnits` to be nonnegative.

`notes` is at most 4,096 UTF-8 bytes; `rateReferenceIds` contains at most 16 entries;
and the complete canonical envelope is at most 65,536 UTF-8 bytes. TypeScript and
PostgreSQL enforce the same limits before persistence or hashing. V1 deliberately has
no fee/gross/net relational validation: that requires a currency-scale-aware domain
payload. Any change to these meanings or ceilings requires a new `payloadVersion`, not
a relaxed validator for an existing version.

## Restricted JSON Grammar

The raw input is untrusted JSON. A validator accepts only a top-level object with
the ten envelope keys above, then validates the payload against its selected exact
schema. Every object schema controls its keys: unknown keys are rejected at the
envelope and every nested payload object. Required keys must be present; omission
and explicit `null` are distinct, and `null` is accepted only where the selected
schema explicitly permits it.

- Keys contain ASCII only and objects serialize keys in ascending ASCII byte order,
  recursively. The envelope order is therefore `actionId`, `domain`,
  `domainReferenceId`, `envelopeVersion`, `expectedAccountRevision`, `kind`,
  `occurredAt`, `payload`, `payloadVersion`, `userId`.
- JSON strings preserve their decoded Unicode scalar sequence. Do not NFC/NFD
  normalize, case-fold, trim, or locale-transform values before hashing. Reject
  U+0000 and lone UTF-16 surrogates.
- Arrays are permitted only where the selected schema says so. Preserve their input
  order exactly; do not sort, deduplicate, or reinterpret them.
- Accepted JSON values are schema-authorized objects, arrays, strings, booleans,
  and `null`; JSON numeric tokens are never accepted.
- JSON numeric tokens are rejected everywhere. Decimal values, minor units, and
  revisions are canonical strings. A decimal matches exactly
  `^(?:0|-?[1-9][0-9]*|-?(?:0|[1-9][0-9]*)\.[0-9]*[1-9])$`, so `0.5` and `-0.5`
  are valid ordinary canonical decimals. A minor-unit string matches
  `^-?(0|[1-9][0-9]*)$` plus an explicit `-0` rejection. A revision string matches
  `^(0|[1-9][0-9]*)$`. No exponent, leading plus, leading zero, negative zero, or
  trailing fractional zero is canonical.
- `occurredAt` is a strict calendar-valid UTC timestamp with milliseconds only:
  `YYYY-MM-DDTHH:mm:ss.SSSZ`. It has no offset variant. JavaScript `number` values
  are forbidden in the envelope and payload.
- Canonical bytes are UTF-8 without BOM. Whitespace is omitted outside strings.

The raw JSON parser detects duplicate keys before object materialization. The
TypeScript adapter also rejects non-JSON runtime values before serialization:
`undefined`, `bigint`, functions, symbols, accessors, sparse arrays, cycles,
`Date`, `Map`, `Set`, typed arrays, class instances, and every non-plain object.

Canonical serialization re-encodes decoded scalar string values deterministically:
the raw spellings `"a"` and `"\u0061"` therefore hash identically. Both TypeScript
and PostgreSQL MUST use the single `financial_action_canonical_json_v1` algorithm:
sort object keys by ASCII byte order; emit no insignificant whitespace; emit UTF-8
scalars literally except `"`, `\\`, `\b`, `\f`, `\n`, `\r`, `\t`, and U+0001–U+001F,
which use their shortest JSON escape or lowercase `\u00xx`; never emit a BOM. A
different serializer, database JSON textual rendering, or host `JSON.stringify`
output is not canonical.

Schema rejection is fail-closed. A raw value of the wrong JSON type, missing/unknown
field, invalid grammar, forbidden `null`, numeric token, non-canonical string, or
invalid timestamp produces no canonical envelope and no local root row. The same
fail-closed boundary rejects a value over a V1 technical safety ceiling.

## Hashing And Replay

One injected SHA-256 provider hashes the exact canonical UTF-8 bytes and returns
lowercase 64-hex. The server recomputes the digest from the received canonical
envelope; it never trusts a client-provided digest alone. The client persists and
sends that digest as `payload_hash`.

For one `(userId, actionId)`, the same digest returns the stored durable outcome.
A different digest returns the stable internal code `action_id_payload_mismatch` and
does not overwrite the original root, outcome, or domain evidence. Mutable root
fields are excluded from `payload_json` and the hash: `state`, `server_outcome`,
`outcome_json`, `rejection_code`, sync timestamps, the required `deleted` sync-column,
retry metadata,
and all server acceptance/reconciliation fields.

## PostgreSQL Canonicalization Boundary

Migration `067_financial_action_foundation` owns private PostgreSQL function
`financial_action_canonical_json_v1` and server-side SHA-256 recomputation/validation.
The SQL boundary accepts raw canonical-envelope text, parses and canonicalizes it,
then requires supplied text to equal the canonical output byte-for-byte. Duplicate
keys, whitespace, non-ASCII key order, alternate escape spellings, and any other
noncanonical representation therefore fail instead of being silently normalized.
The server hashes canonical output and never hashes or trusts a client-supplied digest.

TypeScript and SQL share the same `financial_action_canonical_json_v1` rules and
must pass identical canonical-text/hash fixtures. JavaScript-only unsupported values
(`undefined`, `bigint`, functions, symbols, accessors, sparse arrays, cycles,
`Date`, `Map`, `Set`, typed arrays, and class instances) remain TypeScript-boundary
tests; SQL tests cover encodable raw JSON failures.

## Account-Revision Reservation

`expectedAccountRevision` is required in the envelope and has type
`CanonicalUnsignedIntegerString | null`. Slice 3A capability validation accepts
only `null`; a non-null canonical string is reserved for a future linked
`account_financial_effects` protocol after full #242 T033 approval. Slice 3A has no
account effect, account balance mutation, account revision mutation, or account-effect
synchronizer.

## Durable State Matrix And Recovery

The state/outcome pairing and transitions are fixed for V1:

| From | Trigger | To | `server_outcome` |
| --- | --- | --- | --- |
| `pending_local` | Atomic local root/domain commit succeeds | `local_complete` | `null` |
| `local_complete` | Dedicated action sync queues the durable root | `sync_pending` | `null` |
| `sync_pending` | Remote accepts the command or returns same-hash replay | `accepted` | `accepted` or `idempotent` |
| `sync_pending` | Retryable transport/availability failure | `sync_failed` | `null` |
| `sync_failed` | Explicit retry of unchanged evidence | `sync_pending` | `null` |
| `sync_pending` | Canonical server result proves this local action lost or was rejected | `rejected_compensating` | `stale` or `rejected` |
| `rejected_compensating` | The linked local effects are compensated exactly once | `reconciled` | `stale` or `rejected` |
| Any nonterminal state that needs unavailable or malformed canonical proof | Fail closed | `reconciliation_incomplete` | `null` |
| `reconciliation_incomplete` | Canonical pull/RPC replay proves acceptance | `accepted` | `accepted` or `idempotent` |
| `reconciliation_incomplete` | Canonical pull/RPC replay proves loser/rejection | `rejected_compensating` | `stale` or `rejected` |

`accepted` and `reconciled` are terminal. No retry, recovery, time value, or ID can
select a different terminal result. `rejected_compensating` is an internal recovery
step, never a user-facing success. While `reconciliation_incomplete`, the action stays
durable for audit/sync recovery but cannot advance domain ownership or account effects.
An authenticated canonical acceptance/replay for the same `(user_id, action_id,
payload_hash)` may clear `rejection_code` only in the atomic
`reconciliation_incomplete -> accepted` transition. No ordinary read, retry, or
unrelated canonical result may clear it; loser/rejection recovery retains it through
compensation and terminal reconciliation.

Every root read, replay lookup, update, and RPC begins from an authenticated owner
scope and reasserts that scope immediately before returning or mutating the root or
durable outcome. A changed, absent, or foreign auth scope returns no action data and
cannot clear a rejection or advance recovery.

Action roots are never soft-deleted by product behavior. Their required `deleted` column
remains `false` solely for the shared sync-row convention; deleting a holding is a
separate append-only holding action and never deletes its action root.

## Positive Arabic Vector

The following architect-approved vector tests Unicode preservation, ASCII key order,
`null`, strings for money, and array order. Its digest is verified by the executable
TypeScript fixture; PostgreSQL digest-parity verification remains pending and neither
result is Green evidence by itself.

```json
{"actionId":"018f0c7a-1234-7abc-8def-000000000001","domain":"metals","domainReferenceId":"018f0c7a-1234-7abc-8def-000000000002","envelopeVersion":"monyvi.financial-action/v1","expectedAccountRevision":null,"kind":"sell","occurredAt":"2026-08-31T10:15:30.123Z","payload":{"feeMinorUnits":"80000","grossProceedsDecimal":"35500","holdingId":"018f0c7a-1234-7abc-8def-000000000004","includeAccountCredit":false,"netProceedsMinorUnits":"3470000","notes":"ذهب","rateReferenceIds":["018f0c7a-1234-7abc-8def-000000000005","018f0c7a-1234-7abc-8def-000000000006"]},"payloadVersion":"metals.sell/v1","userId":"018f0c7a-1234-7abc-8def-000000000003"}
```

SHA-256: `d9496846d80647644048c112aa501a2bf2985bc279445d82efdd96669b5718ab`.

## Generic-Sync Boundary

Slice 3A creates the table and database/model generators include
`financial_action_groups`, but ordinary generic table synchronization must never
push or pull it. Runtime sync configuration defines
`DEDICATED_SYNC_TABLES = new Set(["financial_action_groups"])` and permanently
excludes that table from generic sync selection. Slice 4 and every later slice must
never remove or change this exclusion. Only a dedicated-synchronizer capability guard,
added after dedicated action synchronization is proven, may change; it governs the
dedicated path, not generic selection. This prevents action roots from activating
independently of their complete domain evidence and durable outcome protocol.
