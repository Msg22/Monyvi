# #395 T047 — Promise-boundary production correction

**Status:** minimal production correction AUTHORED, **NOT RUN** by this owner.
Root owns all coherent Jest, TypeScript, lint, formatter and independent
non-author acceptance. This is not a review-writer activation.

## Immutable parent and retained documents

- Exact parent: `67b7e511498577149642bffce47294a564a018aa`.
- Source baseline:
  `apps/mobile/services/core-account-financial-action-service.ts`, Git blob
  `c06ab3d29956d5f35aa477df0143b6de1cb4e328`.
- Original production report:
  `specs/395-shared-account-review/validation/t047-review-adapter.md`, Git blob
  `15c8103672ac965fb3ef24f671d6d3cae145026c`. **Unchanged**; this separate note
  preserves its earlier handoff.
- The new production-correction report path was **absent** at parent.

## Root's meaningful observed Red

Root ran one coherent 40-case batch after the initial T047 adapter source: **19
PASS / 21 FAIL**; source lint **0**. The observed failures invoke
`await expect(adapter.execute(...)).rejects` for invalid review roots, envelopes
or payloads, while the adapter's synchronous `execute` callback throws during
validation _before returning a Promise_. Root identified this as the common
failure boundary. This is **Root's pre-correction evidence**, not Green from
this patch.

## Narrow correction

The existing returned `execute` callback in `createCoreReviewBatchSaveAdapter`
is now `async`:

```ts
execute: async (input: ExecuteAccountBalanceCommandInput) => {
```

This single modifier makes any validation failure a rejected Promise, conforming
to the existing `AccountBalanceCommandService["execute"]` asynchronous contract.
It also naturally adopts the return value or rejection of the injected
`executeReviewCommand`. No catch, fallback, fake accepted outcome or error-code
rewriting was introduced.

**Every other byte of the production source is preserved.** The adapter still
checks the exact review root, canonicalizes the full envelope using the
explicitly opt-in T046 registry, and forwards the original `hashProvider` and
`prepareDomainOperationPlan` callback references unchanged. Zero-valued effects,
guards, absence proofs, all planned mutations/children, and optional
`creationDefaultSnapshot` remain intact.

Protected legacy `createCoreAccountFinancialActionService`, its
`canonicalizeEffects`/`buildEnvelope`, legacy command, foundation repository,
registry, SQL, sync and UI remain untouched. T048 must separately authorize a
real typed review executor, registry composition, and authenticated atomic
writer; this adapter is not itself a persistence authorization.

## Follow-up gate

Root to apply exact source delta against the stated parent, preserve the earlier
report, rerun **all 32 T047 + eight protected legacy tests** in one coherent
batch, strict mobile TypeScript/lint, and non-author peer review. No test,
TypeScript, lint, formatter, SQL, native, emulator, provider, or hosted check
was executed by this worker. No branch, ref, PR, issue or comment was mutated.

**STOP — exclusive T047 correction lease released.**
