# Metals Action Payload Registry Contract Evidence

## Approved Production Tuples

`@monyvi/logic/financial-actions` registers exactly these production tuples:

| Kind    | Payload version     | Required financial binding                         |
| ------- | ------------------- | -------------------------------------------------- |
| Add     | `metals.add/v1`     | `expectedHoldingRevision: null`                    |
| Correct | `metals.correct/v1` | canonical expected revision                        |
| Sell    | `metals.sell/v2`    | canonical expected revision                        |
| Dispose | `metals.dispose/v1` | canonical expected revision                        |
| Delete  | `metals.delete/v1`  | canonical expected revision                        |
| Undo    | `metals.undo/v1`    | canonical expected revision plus reversal event ID |

The generic envelope remains the frozen ten-key `monyvi.financial-action/v1`
contract. `occurredAt`, `providerObservedAt`, and `capturedAt` are strict
`YYYY-MM-DDTHH:mm:ss.SSSZ` UTC instants. This reconciles the approved "UTC-ms"
wording with the existing generic contract: it means an ISO-8601 UTC instant
with exactly millisecond precision, not an epoch value or an envelope v2.

## Payload Boundaries

- Add carries complete metadata, Gold/Silver type, physical form (`COIN`, `BAR`,
  `JEWELRY`, or `null`), complete exact material/purchase facts, and optional
  complete acquisition rate snapshots.
- Correct carries explicit predecessor/reversal links, an optional before/after
  metadata change, and an optional full before/after material correction. At
  least one change is required. A material correction has a bounded reason,
  cannot change Gold to Silver or vice versa, and includes the complete exact
  fact set rather than inventing legacy facts.
- Sell carries locked metal type, date/currency, exact nonnegative gross, fee,
  and net minor-unit strings. The validator requires `fee <= gross` and
  `net = gross - fee` without rounding.
- Dispose permits bounded reason and event notes. Delete and Undo accept only
  IDs/revision/event links: no client notes, reasons, or restoration snapshot.
- Rate snapshots use a unique `referenceId`, complete raw/provenance fields,
  approved Gold/Silver or ISO (never BTC) instruments, and role/kind/unit/
  orientation validation. An empty snapshot list represents unavailable input; a
  nonempty list must contain the complete role-specific set.

All field objects reject extra keys. Name, reason, and notes ceilings are 256,
1,024, and 4,096 UTF-8 bytes. Acquisition, sale, and disposal dates are
validated against the injected `cairoTodayDate`; the pure logic layer has no
hidden clock.

## Compatibility

`validateMetalsSellPayloadV1` remains an explicit legacy-validator export for
isolated historical contract fixtures only. It is not registered by the default
registry, so production rejects `metals.sell/v1` and uses `metals.sell/v2`.
