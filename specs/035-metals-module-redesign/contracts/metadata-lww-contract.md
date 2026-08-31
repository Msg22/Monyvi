# Metadata Partial-LWW Contract

Only independent `name` and `notes` use LWW.

```ts
interface MetalMetadataPatch {
  holdingId: string; userId: string;
  fields: {
    name?: { value: string; writtenAt: number; writerId: string };
    notes?: { value: string | null; writtenAt: number; writerId: string };
  };
}
```

Merge each supplied field by `(writtenAt, writerId)`; omitted fields remain unchanged.
Reject empty or foreign patches. Local write precedes scoped sync. This contract never
changes type, weight, purity, acquisition facts, lifecycle, rates, revisions, effects,
or evidence. Sold/Disposed holdings still accept metadata patches.

For accounts, generic sync uses an explicit metadata whitelist. `balance` and
`financial_revision` are protected columns and MUST be changed only by the generic
financial-action CAS protocol. A legacy full-row upsert or client without action ID,
payload hash, and expected revision is rejected rather than allowed to overwrite them.
