# #395 Wave 8 — bounded recovery/form fixture triage

**Mode:** existing-tests-only triage. **NOT RUN.** Exact parent `58acc73646426dcd5535f4b1885dd826d7747f2e`, tree `d0c8060fa8f58f0b4300a5a8429d8f73a9bb39a3`. No production source, business logic, contracts, global harness, native adapter, SQL, sync implementation, checks or formatter changed.

## Root's observed baseline (not outcomes of this child)

- Account Add/Edit T065 **16/17 PASS**. Later-account OFF test at line 369 expected one navigation callback but saw zero immediately after tapping Back and awaiting an unrelated SQLite read.
- Capture/pull **23/25 PASS**. L08's selected-source fixture expected A+B although the `sms-all-dedup` source fixture selects **only B**. P06 authored an unrelated `domainReferenceId` that is not the actual lowest financial-row UUID, so canonical serialize rejected `invalid_envelope`.
- Durable Recovery + Sync **41/44 PASS**. T044-16b assumed legacy generic reconciler can return replay for a new Review tuple; Root's admitted 96 source guard intentionally refuses all Review/Add generic inverse compensation. D06/D07 rejected on compensation despite proved SMS supersession/discard and otherwise permitted financial-only rollback.

## Changed-only inventory, exact before and after Git blob IDs

| Owned existing test | Before | After | Scoped change |
| --- | --- | --- | --- |
| `apps/mobile/__tests__/components/account-default-intent-form.test.tsx` | `2774468325f9892b23ddfb93a431f7a5bd92a4f5` | `e6372cee59544378314da98ba9d393c51490822d` | Preserve actual back press, exactly **one** callback and unchanged owned-account count; use `waitFor` on navigation completion *before* the SQLite read. No default write, Save or route mock change. |
| `apps/mobile/__tests__/services/account-review-local-recovery.sqlite.integration.test.ts` | `b8f8a8b47ea2b2205f6fb5a2f1b0668a6a681670` | `e1f133207d13fdb4f5d45a2768fbb0e56ec2a27a` | L08 asserts only the **actually selected B** and seeds B's genuine saved transaction; no fabricated unselected A or unnecessary transfer. Retain `cleanup_only`, no new immutable root and no retained drafts. Remove unused A import. |
| `apps/mobile/__tests__/services/account-review-local-pull.sqlite.integration.test.ts` | `7debe5da5775fea42310dbc99bae253f7e8c5f13` | `6943dec8fde7f881962551a533969f282ec2f033` | P06 varies only canonical **action ID**, preserving `domainReferenceId` bound to the actual smallest financial create record; real registry rehash. An unrelated pulled root still cannot inherit the old local private recovery bytes; old root retains them. |
| `apps/mobile/__tests__/services/account-review-sync.test.ts` | `ac89812aa387b5dd780c917e07cdcf146908f840` | `7f6d66de41404cd2bae52d6e6d2bf348237ec2d7` | T044-16b now expects `INCOMPLETE` from the **generic** reconciler even for `state=reconciled`/ineffective effects on a new Review tuple. Retains terminal fixture preconditions, exactly zero generic compensation mutations and all 96-protected negative suites; D02 still proves *dedicated production* replay. |
| `apps/mobile/__tests__/services/account-review-durable-recovery.sqlite.integration.test.ts` | `ea11c8f2e308c5fddcce3066c8b26ce981fcde12` | `fc105cfcd83ca92cf2e6699f1635cb22e78d764f` | D06/D07 now require actual `reconciled` **with financial evidence** instead of a thrown exception, while requiring no resurrected revoked queue/discarded draft, no active created members, all actual nonempty effects ineffective, root terminal state and cleared private evidence. |
| `specs/395-shared-account-review/validation/wave8-recovery-fixture-triage.md` | **absent** | **new** | This report. |

## Contract decisions, no weakened proof

**L08:** `scenarioRows("sms-all-dedup")` resolves via the normal singleton SMS source and sets fingerprint B. `makeSaveFixture` selects B. The previous statement “selects A+B” was factually incorrect. The narrowed positive still proves the entire selected, pre-saved set is deduplicated with no Review financial root or queued draft.

**P06:** The strict canonical review root's `domainReferenceId` is calculated from its financial CREATE members. Changing the UUID to a random `testUuid(482)` while preserving original mutations is invalid independently of pull/privacy behavior. The test keeps the valid original domain-reference ID and varies only immutable action identity (and hashes the resulting real envelope), preserving the stronger private-snapshot isolation assertions.

**T044-16b:** `financial-action-reconciliation-service.ts` `assertLegacyRecoveryOnly` runs before any legacy bundle replay or inverse compensation and intentionally rejects new `review.batch-save/v1` or `account.create-default/v1` with `INCOMPLETE`. The original `replay` assertion was impossible and unsafe through that generic SUT. A previously reconciled Review root may replay **only through the dedicated owned/private production dispatcher**, proven separately by physical D02. This change does **not** broaden generic recovery, weaken 15/16/17 negative cases, fake a positive, or alter financial source.

**D06/D07:** Frozen `contracts/local-recovery.md` lines 151–167 states proven `expired/superseded` SMS evidence is never restored; financial compensation **may still complete** without reactivating discarded/expired SMS. Actual `verifySms` returns no restorable draft/queue for such states; actual `prepareSmsRestoration` skips them while retaining rigorous created/owner/effect/default/revision evidence. New assertions require the true atomic financial result (created members logically deleted, nonempty originally effective effects now all ineffective, root terminal, local private bytes cleared), plus physical absence of the superseded queue or explicitly deleted draft. No resurrection, unsafe overwrite or partial `reconciled` state is allowed.

**Forms:** `PageHeader` shell forwards `onBack ?? router.back`; the real Add screen uses the fallback. The back event and its navigation callback can settle asynchronously relative to the independently awaited Watermelon read. `waitFor(...toHaveBeenCalledTimes(1))` is the supported bounded observation. Physical one-owned-account invariant remains intact.

## Additional T069 evidence, explicitly OUTSIDE this lease

Root separately reported T069 Add lifecycle packet `c7f05...` **5 PASS / 11 FAIL out of 16**. A01/A02/A04 produced the expected **malformed root / zero-account-guard** Red from the protected bundle collector. A03's protected-effect lookup returned false; inspect the actual effect entity/table identity and collector mapping before inferring source behavior. A08/A09/A10/A11/A12/A14 hit `financial_action_invalid_state_evidence` at `action-contracts.ts:740` while staging canonical outcomes; this may be a fixture **outcome JSON canonicalization** issue like an earlier 0fef correction, not six separate production defects. **No T069 files/source were changed**. Root should grant a distinct T069 fixture-only investigation and preserve the genuine zero-guard and recovery Reds. Core owns Add-private/server-default technical contracts.

## Execution status and next gate

**NOT RUN** by this worker: Jest, SQLite, typecheck, lint, formatter, Node/Metro, emulator, native, Supabase/SQL, provider or hosted operations. Root's baseline results are **not proof these edits passed**. Root should run grouped 17 form, 25 local capture/pull and 44 recovery/sync instances, classify any remaining sources separately, preserve all no-resurrection and owner proofs, and keep publication/activation blocked until independent review. No source changes, refs, pushes, PRs, DB, delegation or Codex handoff.

**SOURCE RELEASED — STOP.**
