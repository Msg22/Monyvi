# Slice 2 Exact Metals Domain — Green and Refactor Evidence

Date: 2026-08-30
Base: `3ab5ee4c74af16f62de4ddeb092d687f1a2a6ab5` plus approved uncommitted
Slice 1/Red-gate sources
Owner: exact Metals domain T012–T017
Scope: six pure implementation modules, local Metals barrel, authorized
test-module markers and FR-051 supplemental tests, and Slice 2 evidence only

## Green gate

Working directory for commands below:
`E:\Work\My Projects\Monyvi-metals-redesign\packages\logic`

| Command | Result | Evidence |
| --- | --- | --- |
| `npx jest --testPathPattern='src/metals/__tests__/(decimal\|purity-valuation\|attribution-postgres-parity\|lifecycle-rate-trust).test.ts' --no-coverage --runInBand --watchman=false` | Pass | 4/4 suites, 89/89 tests, 0 snapshots, 4.134 s on first Green run. |
| `npm run typecheck` | Stop, then corrected | First run found owned `decimal.ts` comparison narrowing plus TS2393 because two Jest files were global scripts with duplicate test-local `loadValuationApi` declarations. No product behavior failed. |
| `npx jest --testPathPattern='src/metals/__tests__/(decimal\|purity-valuation\|attribution-postgres-parity\|lifecycle-rate-trust).test.ts' --no-coverage --runInBand --watchman=false` | Pass after authorized technical correction | 4/4 suites, 89/89 tests, 0 snapshots, 1.43 s. |
| `npm run typecheck` | Pass | `tsc --noEmit`, exit 0. |
| `npx jest --testPathPattern='src/metals/__tests__/attribution-postgres-parity.test.ts' --no-coverage --runInBand --watchman=false` | Supplemental FR-051 Green | 1/1 suite, 23/23 tests, 0 snapshots, 0.99 s. |
| `npx jest --testPathPattern='src/metals/__tests__/(decimal\|purity-valuation\|attribution-postgres-parity\|lifecycle-rate-trust).test.ts' --no-coverage --runInBand --watchman=false` | Final Green | 4/4 suites, 93/93 tests, 0 snapshots, 1.238 s. |
| `npm run typecheck` | Final pass | `tsc --noEmit`, exit 0 after FR-051 API addition. |
| `npx jest --coverage --testPathPattern='src/metals/__tests__/(decimal\|purity-valuation\|attribution-postgres-parity\|lifecycle-rate-trust).test.ts' --runInBand --watchman=false` | Pass; coverage recorded, not overstated | 4/4 suites and 93/93 tests. Aggregate: 92.30% statements, 81.73% branches, 100% functions, 92.27% lines. |

The authorized test correction added only `export {}` to
`purity-valuation.test.ts` and `attribution-postgres-parity.test.ts`, making
each file a TypeScript module. Expectations, cases, fixture values, and runtime
behavior are unchanged.

## Coverage detail

| Module | Statements | Branches | Functions | Lines | Uncovered lines |
| --- | ---: | ---: | ---: | ---: | --- |
| `attribution.ts` | 93.39% | 80.55% | 100% | 93.33% | 95, 173, 222, 226, 405, 430, 444 |
| `decimal.ts` | 90.69% | 83.33% | 100% | 90.69% | 22, 47, 78, 96 |
| `lifecycle-reducer.ts` | 91.30% | 73.33% | 100% | 91.30% | 36, 67 |
| `purity-catalog.ts` | 95.65% | 84.61% | 100% | 95.65% | 61 |
| `rate-trust.ts` | 100% | 100% | 100% | 100% | none |
| `valuation.ts` | 86.84% | 77.77% | 100% | 86.84% | 44, 48, 85, 89, 104 |

No 100% coverage claim is made. Uncovered lines are defensive invalid-input,
empty-lifecycle, unknown-code, and reciprocal comparison branches around the
approved contract paths. Explicit Slice 2 behavior remains exercised at its
own boundary: invalid/missing valuation and rate inputs return unavailable,
rate trust covers invalid values/quality and unknown time, canonical parsing
rejects invalid syntax, and lifecycle/attribution cover every approved Red
fixture. Independent logic/QA review should decide whether later hardening needs
additional boundary fixtures; no tests were added only to chase a percentage.

## Success-criterion evidence

| Criterion | Slice-owned proof |
| --- | --- |
| SC-004 | Literal FR-050 current and realized fixtures prove additive components equal combined P/L. Supplemental FR-051 fixtures convert combined P/L and every component through one exact display-time FX basis before final rounding. Sale-time proceeds conversion and two-minor-unit display explanation pass with no balancing component. |
| SC-005 | Zero/invalid valuation inputs and every required missing acquisition/current/sale rate reference return unavailable rather than zero; recorded holding visibility remains downstream read-model scope. |
| SC-006 | Exactly 24 hours is Fresh, one millisecond older is Stale, old provider time cannot be refreshed by capture time, and missing/unparseable/non-finite observation time is Unknown. Confirmation acknowledgment remains downstream UI/command scope. |
| SC-017 | Null purchase cost and all required missing conversion facts make current/realized P/L unavailable; positive-cost validation prevents zero/free acquisition. |
| SC-018 | Attribution snapshots retain exact value, unit/orientation, provider observation time, source, quality, capture time, and captured freshness after source mutation; unknown/unparseable time is never Fresh. |
| SC-021 | Precision-50 Decimal clone, canonical non-exponent strings, exact huge/sub-minor comparison, half-even minor-unit conversion, no-intermediate-rounding fixture, high-precision attribution fixture, and final-boundary rounding all pass. |
| SC-026 | Complete approved Gold/Silver catalog v1, distinct `24K · 999`, ambiguous bare `24K` rejection, immutable purity snapshot, pure-gram factors, and unsupported/free-text rejection all pass. |

## Refactor and boundary review

- Decimal comparison result is explicitly narrowed to `-1 | 0 | 1` for strict
  TypeScript without number conversion.
- Catalog and evidence snapshots are detached and immutable.
- Rate-reference deduplication removes only fully identical consumed snapshots;
  distinct acquisition/valuation observations remain separate.
- Equal-time unrelated lifecycle events use ascending stable event ID after
  causal precedence. Direction is documented technical behavior, not product
  policy.
- `packages/logic/src/index.ts`, DB, services, hooks, UI, migrations, and all
  T018+ work remain untouched.

Stop conditions triggered: initial package typecheck harness collision, reported
before test edits and corrected only after explicit authorization. The missing
FR-051 Red contract was also reported before changes; four focused tests and the
minimal conversion API were added only after explicit authorization. No remaining
Slice 2 logic, typecheck, or cross-package blocker.

## Final source hashes

| Source | Git blob hash |
| --- | --- |
| `decimal.ts` | `1bbc514a6e06b15c534e67cdefa310395cc1c92c` |
| `purity-catalog.ts` | `eaa9942ffa425b8208aa2f2c3d5163ffdc9ef373` |
| `valuation.ts` | `dc02fd92b1461843ab22645f364308996ed2053d` |
| `attribution.ts` | `82da4b5d661ed6946dd2dc67c2b66716ae2173f5` |
| `lifecycle-reducer.ts` | `f02ea383f120be97222c24d18b7b9ca43b483fb4` |
| `rate-trust.ts` | `21f89b3bc56c81f99fff68d67fe1c53aad2ed51c` |
| `metals/index.ts` | `44822e2c6a9b0d03ddcfcf1c084cce7aab8d74da` |
| `decimal.test.ts` | `8ba4b4c9db37c28843b9327b57708898301592e0` |
| `purity-valuation.test.ts` | `e96f0893d611dde8d072787b633ebf3caa1a7c2b` |
| `attribution-postgres-parity.test.ts` | `a3b52994046d338bf0264ca89c23e6f13bbcedab` |
| `lifecycle-rate-trust.test.ts` | `6345e9f37c94db5eafb4f6d9bb5a056479306f37` |

## Supplemental TypeScript-review Green cycle

The Decimal.js clone is now private. Public exact-arithmetic helpers accept
only canonical strings or opaque immutable exact values, expose frozen
configuration metadata, and reject JavaScript-number and exponent inputs.
Equal-time lifecycle groups now use deterministic topological ordering:
transitive successors precede predecessors and ascending event ID selects among
unrelated eligible events.

Final verification from `packages/logic`:

- Focused Green: 2/2 suites, 66/66 tests, 0 snapshots.
- Complete Green command: `npx jest --testPathPattern='src/metals/__tests__/(decimal|purity-valuation|attribution-postgres-parity|lifecycle-rate-trust).test.ts' --no-coverage --runInBand --watchman=false`; 4/4 suites, 103/103 tests, 0 snapshots.
- `npm run typecheck`: `tsc --noEmit`, exit 0.
- Coverage command: `npx jest --coverage --testPathPattern='src/metals/__tests__/(decimal|purity-valuation|attribution-postgres-parity|lifecycle-rate-trust).test.ts' --runInBand --watchman=false`; 103/103 pass, aggregate 93.15% statements, 80.67% branches, 98.55% functions, 93.09% lines.
- `git diff --check`: exit 0 with no output.

Current uncovered lines remain defensive invalid-input, empty-lifecycle,
malformed-cycle fallback, and unavailable-result branches; no 100% coverage
claim is made. All configured minimums remain above 80%.

Supplemental source Git blob hashes:

| Source | Hash |
| --- | --- |
| `decimal.ts` | `68f4900fb1a38ecf0ebe7cd93260ea1a86b119d9` |
| `valuation.ts` | `c431fb2dc2eed5abc38fac255ed71d48f537cc63` |
| `attribution.ts` | `0ecfca891de19ea6e1ad7adea85f62e8e4c7fd49` |
| `lifecycle-reducer.ts` | `8279b7a807b91dd1a7ff40586430a6c404945eb1` |
| `rate-trust.ts` | `b03f929339ab8bf47900ac7ed4fc8936463a5e09` |
| `decimal.test.ts` | `932330c3a8f434a231ee4ec9019980ed7305df83` |
| `lifecycle-rate-trust.test.ts` | `d4567e93d0b74a301555fefe9685095c48cf580a` |

## Supplemental financial-logic review Green and blocked gate

Source-complete findings A, C, E, and F are Green:

- gross proceeds are positive and minor-unit compatible; fees are
  minor-unit compatible in `0..gross`; equal gross/fee yields exact zero net;
- FR-059 combined P/L survives missing detailed historical attribution facts,
  with explicit breakdown-unavailable reasons;
- weight/purity scales and purchase/proceeds money scales enforce FR-083;
- future provider observation time is Unknown with no negative age.

Final command results: focused rate suite 26/26; full four-suite run 121/121;
`npm run typecheck` exit 0. Coverage run passed 121/121 with 94.73% statements,
86.95% branches, 98.63% functions, and 94.68% lines.

Slice 2 remains review-blocked rather than complete. Finding B cannot be
implemented without approved role literals, instrument grammar, unit literals,
and their allowed orientation matrix. Finding D cannot be implemented without
an approved pure invalid-event result/diagnostic shape and duplicate/cycle
semantics. T013, T015, and T017 are therefore unchecked; T014 is Green.

Current reviewed-source hashes: `valuation.ts`
`7592647fbce5b0a418fd348c8f17c0e5734c44bf`, `attribution.ts`
`5e299e45d95dad6512fef435ec20fdb1ef8647e2`, `rate-trust.ts`
`dba80ea213a09ef502c28499412a9c4b79106dc6`, `purity-valuation.test.ts`
`50bef1863818682db68e9397b2523b02b3b8db96`,
`attribution-postgres-parity.test.ts`
`af1262ac0ab7a2cdca7c2c0cd4cb74fd754a8554`, and
`lifecycle-rate-trust.test.ts`
`674b8ddd69c88dabf8522f713bee946721444c8d`.

## Resolution note — 2026-08-31

The approved rate-reference and lifecycle-reducer contracts remove Findings B and
D as requirement blockers. This does not convert this historical Green record into
completion evidence: T013, T015, and T017 remain implementation-pending and
unchecked until their required implementation and verification are newly run.

## Approved contract Green and final Slice 2 gate — 2026-08-31

The approved blockers are now implemented. Rate references use typed Metal/Currency
roles, Gold/Silver and ISO-currency instrument grammar with BTC excluded, the exact
legal unit/orientation matrix, exact USD identity, stable validation reasons, one
Decimal normalization, detached immutable evidence, and provider-observation-time
freshness semantics. Attribution validates every field-specific reference role and
cross-reference instrument context before using it.

The lifecycle reducer now returns an immutable `LifecycleReductionResult`, retains
accepted and rejected evidence, applies the complete approved rejection taxonomy,
uses one safe causal chain, rejects invalid descendants, validates terminal reversal
targets, gives equal-time causality precedence over IDs, accepts only trustworthy
canonical CAS winners, and fails closed when competing effective successors have no
canonical winner. Rejected evidence never enters the projection.

Final commands, run from the feature worktree with the shared absolute Jest cache:

| Command | Result |
| --- | --- |
| `npx jest --testPathPattern='src/metals/__tests__/(rate-reference-contract|lifecycle-reducer-contract).test.ts' --no-coverage --runInBand --watchman=false --cacheDirectory='E:/Work/My Projects/Monyvi/node_modules/.cache/jest-metals'` | 2/2 suites, 42/42 tests, 0 snapshots. |
| `npx jest --testPathPattern='src/metals/__tests__' --no-coverage --runInBand --watchman=false --cacheDirectory='E:/Work/My Projects/Monyvi/node_modules/.cache/jest-metals'` | 6/6 suites, 163/163 tests, 0 snapshots. |
| `npm run typecheck -w @monyvi/logic` | `tsc --noEmit`, exit 0. |
| `npx jest --coverage --testPathPattern='src/metals/__tests__' --runInBand --watchman=false --cacheDirectory='E:/Work/My Projects/Monyvi/node_modules/.cache/jest-metals'` | 6/6 suites, 163/163 tests; 94.86% statements, 82.41% branches, 99.05% functions, 94.80% lines. |
| `git diff --check` | Exit 0, no output. |

Final owned-source blob hashes: `rate-reference.ts`
`09b6ff5ca850671f1ce65cd5e2bf4bc9889a25e8`, `valuation.ts`
`0af8901549670c8b94620562fa7724a6baaf26f9`, `attribution.ts`
`226b132bea62e3aa2abf8a024e6405ce094fd71c`, `lifecycle-reducer.ts`
`7b64d31c5ef040b5d767953127d44d7906187ca1`, `rate-trust.ts`
`dba80ea213a09ef502c28499412a9c4b79106dc6`, and the Metals barrel
`dec8f881ee3d2b06c5df02e044bb941685cff81c`.

SC-004/005/006/017/018/021/026 evidence remains the cumulative fixture set above,
now strengthened by the approved reference-context and fail-closed lifecycle cases.
No DB, migration, service, hook, UI, root-package barrel, or schema work was added.
T013, T015, and T017 are Green and ready for independent TypeScript and financial
logic review; this implementation record does not self-approve either review.

## Supplemental TypeScript-review boundary Green — 2026-08-31

- Focused reviewer command: 4/4 suites, 85/85 tests.
- Complete Metals command: 7/7 suites, 170/170 tests.
- `npm run typecheck -w @monyvi/logic`: exit 0.
- Complete Metals coverage: 94.20% statements, 83.22% branches, 99.09%
  functions, and 94.13% lines.
- Valid fixtures now import the public APIs/types directly; deliberately malformed
  rate observations alone remain `unknown` at the runtime validation boundary.
- `ExactRateReference` is a true Metal/direct-currency/inverse-currency
  discriminated union. Attribution requires independent holding, purchase,
  proceeds, canonical-display, and preferred-display instruments and never derives
  expected context from the supplied evidence reference.
- A Created root with any predecessor or reversal reference is rejected as
  `invalid_transition` before projection.

### Legacy expected-context parity follow-up — 2026-08-31

Five direct parity fixtures now cover legacy null acquisition snapshots with
explicit Gold/EGP expectations and mismatched Silver/SAR current or terminal
evidence. Required current, terminal purchase, and proceeds mismatches return their
stable unavailable reason. A terminal Metal mismatch preserves trustworthy realized
combined P/L while marking only the detailed breakdown unavailable, per FR-059.
The focused parity suite passed 41/41; the complete Metals suite passed 175/175;
package typecheck and scoped diff validation passed. Production required no change.

## Supplemental financial-logic re-review Green — 2026-08-31

- Focused parity/lifecycle: 2/2 suites, 66/66 tests.
- Complete Metals: 7/7 suites, 182/182 tests.
- Coverage: 94.29% statements, 83.83% branches, 99.13% functions, 94.22% lines.
- Package typecheck passed.
- Unrealized/realized values always expose a frozen deduplicated
  `consumedRateReferences`, including truthful FR-059 fallback output.
- Captured evidence uses validator-derived observation/freshness while retaining
  value, unit/orientation, instrument, source, quality, and capture provenance.
- Missing/invalid lifecycle evidence is retained and rejected as incomplete;
  canonical-CAS-rejected evidence is ineffective before root selection; duplicate
  replay requires full immutable event equality in addition to ID/fingerprint.

## Supplemental style/architecture review Green — 2026-08-31

- Focused rate/lifecycle: 2/2 suites, 64/64 tests.
- Complete Metals: 7/7 suites, 199/199 tests.
- Coverage: 94.46% statements, 87.02% branches, 99.20% functions, 94.40% lines.
- Package typecheck passed.
- The reducer validates raw `unknown` observations for non-empty identity and
  fingerprint, supported kind, finite non-negative time, nullable non-empty causal
  references, evidence state, and canonical CAS status before reduction. Malformed
  evidence is retained as incomplete and cannot affect projection.
- Runtime Metals ISO membership derives from canonical `SUPPORTED_CURRENCIES` with
explicit BTC exclusion; parity covers every catalog code, BTC, and unknown codes.

## Source-hash supersession after foundation-review refinements — 2026-08-31

The earlier **Final source hashes** table is retained above as historical evidence
for its recorded Green cycle. It does not identify later reviewer refinements.
This dated snapshot supersedes that table for source authentication of the current
foundation-review source tree. Its source/test content is commit
`d4ee8c5188dbec47e596fcc8795706b94cc44e17`; this evidence addition remains a
later uncommitted documentation change until integration. It was calculated with:

```powershell
Set-Location E:\Work\My Projects\Monyvi-metals-redesign
git hash-object packages/logic/src/metals/decimal.ts packages/logic/src/metals/purity-catalog.ts packages/logic/src/metals/valuation.ts packages/logic/src/metals/attribution.ts packages/logic/src/metals/lifecycle-reducer.ts packages/logic/src/metals/rate-trust.ts packages/logic/src/metals/rate-reference.ts packages/logic/src/metals/index.ts packages/logic/src/metals/__tests__/decimal.test.ts packages/logic/src/metals/__tests__/purity-valuation.test.ts packages/logic/src/metals/__tests__/attribution-postgres-parity.test.ts packages/logic/src/metals/__tests__/lifecycle-rate-trust.test.ts packages/logic/src/metals/__tests__/rate-reference-contract.test.ts packages/logic/src/metals/__tests__/attribution-rounding-validation.test.ts
```

| Source | Current Git blob hash |
| --- | --- |
| `decimal.ts` | `309b0c9487e2301088b6554ec75a946fcc6451f6` |
| `purity-catalog.ts` | `eaa9942ffa425b8208aa2f2c3d5163ffdc9ef373` |
| `valuation.ts` | `f09dbcfa018f30f39b7730d3ca1978e25a7f26af` |
| `attribution.ts` | `0efd10fd12868e4fa145ab2c3ba3018961f3a14f` |
| `lifecycle-reducer.ts` | `2acafe7cea8853df3496519fc5085bf851870e57` |
| `rate-trust.ts` | `45e16a9563965ad34b57780b0bde62571efd4bfb` |
| `rate-reference.ts` | `42f11dac8040eafbce82bac70a26c80a303d84a0` |
| `metals/index.ts` | `fc9d51e5ce367740619c60504981f7637fbd6df6` |
| `decimal.test.ts` | `e0220e446f34f68901dd2f75cf48a39b72b790ce` |
| `purity-valuation.test.ts` | `d787694182ccd63b17faaa633b6ce1a88b40d15f` |
| `attribution-postgres-parity.test.ts` | `b5f639c4e655e2c526dd73609762224b86a3618e` |
| `lifecycle-rate-trust.test.ts` | `11118df5b86d2a39a38228ee3c5adfd754e1d9e3` |
| `rate-reference-contract.test.ts` | `0ada9eb1ac53b87d625c5466853f68311cba2b35` |
| `attribution-rounding-validation.test.ts` | `417871649e00fec790e7c767ec3db81e2c08bc9b` |

The associated reviewer verification passed 7/7 Metals suites and 209/209 tests,
and `npm run typecheck -w @monyvi/logic` passed. This snapshot remains dated
evidence; any later source edit requires a new append-only supersession record.


## Source-hash supersession after localization and display-conversion fixes — 2026-08-31

The earlier foundation-review snapshot remains historical evidence for commit
`d4ee8c5188dbec47e596fcc8795706b94cc44e17`. This append-only record supersedes
it for source authentication after commits `e3c7e569636dd0deab96cc79daa1550aaea47b12`
and `9b4ac04cc69820fccda7ea334fc75332f6599752`. It was calculated from the
current worktree with the same `git hash-object` command listed above.

| Source | Current Git blob hash |
| --- | --- |
| `decimal.ts` | `fb395f6516fdb272f6e784792edb7aa4a98948ef` |
| `purity-catalog.ts` | `eaa9942ffa425b8208aa2f2c3d5163ffdc9ef373` |
| `valuation.ts` | `f09dbcfa018f30f39b7730d3ca1978e25a7f26af` |
| `attribution.ts` | `8ce4d6e9700215c894898a5844a77d0875ff25a7` |
| `lifecycle-reducer.ts` | `4c5d56ea96a18d6687e4cfa0d05a34bdf6b9a24d` |
| `rate-trust.ts` | `7cdc8d2442a3e05b1a91eae7a930a3a2328aaff2` |
| `rate-reference.ts` | `42f11dac8040eafbce82bac70a26c80a303d84a0` |
| `metals/index.ts` | `fc9d51e5ce367740619c60504981f7637fbd6df6` |
| `decimal.test.ts` | `f3f07cf3bcbcb9efc5aea51608b6d09e3ffaf884` |
| `purity-valuation.test.ts` | `d787694182ccd63b17faaa633b6ce1a88b40d15f` |
| `attribution-postgres-parity.test.ts` | `b5f639c4e655e2c526dd73609762224b86a3618e` |
| `lifecycle-rate-trust.test.ts` | `5bacc378039f48c195a13e9a6a7dc99a325673ec` |
| `rate-reference-contract.test.ts` | `0ada9eb1ac53b87d625c5466853f68311cba2b35` |
| `attribution-rounding-validation.test.ts` | `3cca046923a5144df7f2706b01541fd931422b59` |

Independent verification at this source state, run from the documented
worktree, passed: the complete Metals coverage command (8/8 suites, 229/229
tests; 94.67% statements, 87.56% branches, 100% functions, 94.62% lines),
`npm run typecheck -w @monyvi/logic` (exit 0), and root `npm run lint` (exit 0;
269 pre-existing warnings, no errors). This remains dated foundation evidence,
not release coverage or approval evidence.


## Source-hash supersession after financial-evidence preservation — 2026-08-31

The prior localization/display-conversion snapshot remains historical evidence.
This append-only record supersedes it for source authentication at commit
`79a7cd8bfd7dd0396dd84c8057f3c11c7a82a5c9`. It was calculated from the current
worktree with the same `git hash-object` command listed in the prior supersession.

| Source | Current Git blob hash |
| --- | --- |
| `decimal.ts` | `fb395f6516fdb272f6e784792edb7aa4a98948ef` |
| `purity-catalog.ts` | `eaa9942ffa425b8208aa2f2c3d5163ffdc9ef373` |
| `valuation.ts` | `f09dbcfa018f30f39b7730d3ca1978e25a7f26af` |
| `attribution.ts` | `8a78522bee120fc69ff781948e1d537cc9c5cc0a` |
| `lifecycle-reducer.ts` | `f6987f6ae71c19c1199a69b28b34258bf02532eb` |
| `rate-trust.ts` | `7cdc8d2442a3e05b1a91eae7a930a3a2328aaff2` |
| `rate-reference.ts` | `42f11dac8040eafbce82bac70a26c80a303d84a0` |
| `metals/index.ts` | `fc9d51e5ce367740619c60504981f7637fbd6df6` |
| `decimal.test.ts` | `f3f07cf3bcbcb9efc5aea51608b6d09e3ffaf884` |
| `purity-valuation.test.ts` | `d787694182ccd63b17faaa633b6ce1a88b40d15f` |
| `attribution-postgres-parity.test.ts` | `b5f639c4e655e2c526dd73609762224b86a3618e` |
| `lifecycle-rate-trust.test.ts` | `5bacc378039f48c195a13e9a6a7dc99a325673ec` |
| `rate-reference-contract.test.ts` | `0ada9eb1ac53b87d625c5466853f68311cba2b35` |
| `attribution-rounding-validation.test.ts` | `3cca046923a5144df7f2706b01541fd931422b59` |

Independent verification at this source state, run from the documented worktree,
passed: complete Metals coverage (8/8 suites, 232/232 tests; 94.77% statements,
87.69% branches, 100% functions, 94.72% lines) and
`npm run typecheck -w @monyvi/logic` (exit 0). This remains dated foundation
evidence, not release coverage or approval evidence.


## Final SHA-256 supersession at final foundation head — 2026-08-31

The preceding Git-blob snapshots and the uncommitted PR #244-head draft remain
historical evidence. This append-only record supersedes them for byte-level source
authentication at final foundation head `be99eba76757a966ea80b0c070f71fce1e58c33a`.

The current Metals coverage command passed 8/8 suites and 241/241 tests with 0
snapshots. Aggregate coverage was 94.36% statements, 87.05% branches, 100%
functions, and 94.3% lines. Full logic passed 1079/1079 tests; package typecheck,
root lint, and diff checks passed according to final worker evidence.

SHA-256 values below were computed from current worktree files:

| Source | SHA-256 |
| --- | --- |
| `decimal.ts` | `74e1a92389479f9beb3dcac65dc52aaaa6bc597724b9164a7892c8e32c26a9af` |
| `purity-catalog.ts` | `fc7a5e6e1ca5140e63f4ef18d209906316fdec03606e9fed289b2722aeaff373` |
| `valuation.ts` | `71eca82b5fc8261bc39fdc7d82fe8937661f9fdb923331af4b2fba37679dc00b` |
| `attribution.ts` | `af2612097871c8fb0ec760ce41e4ad6aae17aaa13418e6b62e573c1311040eaa` |
| `lifecycle-reducer.ts` | `ccd116b534bcefadd0e374e655a47f1c73d7a15e00b2cbb8f83d30aab8eca757` |
| `rate-trust.ts` | `489a9295e0ea8fcd8ecd3ab099cd7238730e39fc022b0794b81fced96d902565` |
| `rate-reference.ts` | `0ee96f2abefbe29cc1240e42de64c082253139a3c599aae5d54bd91c87462d89` |
| `metals/index.ts` | `abdb6238e223db39363f5553c6d165532ef586cab8b3ed2289d1204be3bd3c1d` |
| `decimal.test.ts` | `077293384ae3de36e3b36d26db5c3376454e08e29ba75a3cf91bf23eae89cffb` |
| `purity-valuation.test.ts` | `01db37dc0cc65497c6df232429b8ee3ec2f2223462e45e36067ad4fc942b62ec` |
| `attribution-postgres-parity.test.ts` | `9627a8cd970e2a3357f712510e2144f60b35d1f84516973fac6a2e972fd952ff` |
| `lifecycle-rate-trust.test.ts` | `b70e33fdfd241a7e392435fe4732fba1b90f7d8540421f554f06960ef4fe04e7` |
| `rate-reference-contract.test.ts` | `139c3202338f8ac37e11b368dfaab25f53e6964615dce37e022cf761a91b34a1` |
| `attribution-rounding-validation.test.ts` | `1da74f748073b4228edb5cf52e81b5ca15476905b3eaeea3b46e870b9872f95f` |
| `attribution-context-contract.test.ts` | `edd724560e70000fefd1accd768656aa0684a0b2666b1dfecb2202fa44baa16a` |
| `lifecycle-reducer-contract.test.ts` | `20739f9d12019b1f5db9510727d077394a042e14e6832ea7e3e30965bb6c9aea` |

This snapshot authenticates foundation source state; it is not release coverage
or merge approval evidence.


## Final SHA-256 supersession at final foundation head — 2026-08-31

The preceding snapshots remain historical evidence. This append-only record
supersedes them for byte-level source authentication at final foundation head
`5a56f5c79deba61f4ee1acfac608124081b28157`.

Final worker evidence records 8/8 Metals suites and 244/244 tests with 0
snapshots. Aggregate coverage was 94.38% statements, 87.15% branches, 100%
functions, and 94.32% lines. Full logic passed 1079/1079 tests; package
typecheck, root lint, and diff checks passed.

SHA-256 values below were computed from current worktree files:

| Source | SHA-256 |
| --- | --- |
| `decimal.ts` | `74e1a92389479f9beb3dcac65dc52aaaa6bc597724b9164a7892c8e32c26a9af` |
| `purity-catalog.ts` | `fc7a5e6e1ca5140e63f4ef18d209906316fdec03606e9fed289b2722aeaff373` |
| `valuation.ts` | `71eca82b5fc8261bc39fdc7d82fe8937661f9fdb923331af4b2fba37679dc00b` |
| `attribution.ts` | `af2612097871c8fb0ec760ce41e4ad6aae17aaa13418e6b62e573c1311040eaa` |
| `lifecycle-reducer.ts` | `ccd116b534bcefadd0e374e655a47f1c73d7a15e00b2cbb8f83d30aab8eca757` |
| `rate-trust.ts` | `131ab4d3caae079cd7e3b2ea6f750abfb019ddbe1d84cd8eadde5a3f7b2ffd50` |
| `rate-reference.ts` | `0ee96f2abefbe29cc1240e42de64c082253139a3c599aae5d54bd91c87462d89` |
| `metals/index.ts` | `abdb6238e223db39363f5553c6d165532ef586cab8b3ed2289d1204be3bd3c1d` |
| `decimal.test.ts` | `077293384ae3de36e3b36d26db5c3376454e08e29ba75a3cf91bf23eae89cffb` |
| `purity-valuation.test.ts` | `01db37dc0cc65497c6df232429b8ee3ec2f2223462e45e36067ad4fc942b62ec` |
| `attribution-postgres-parity.test.ts` | `9627a8cd970e2a3357f712510e2144f60b35d1f84516973fac6a2e972fd952ff` |
| `lifecycle-rate-trust.test.ts` | `cf9ce989d7966fc0d6317581df995c530c7b52455c98bee22748fc3573089b64` |
| `rate-reference-contract.test.ts` | `139c3202338f8ac37e11b368dfaab25f53e6964615dce37e022cf761a91b34a1` |
| `attribution-rounding-validation.test.ts` | `1da74f748073b4228edb5cf52e81b5ca15476905b3eaeea3b46e870b9872f95f` |
| `attribution-context-contract.test.ts` | `edd724560e70000fefd1accd768656aa0684a0b2666b1dfecb2202fa44baa16a` |
| `lifecycle-reducer-contract.test.ts` | `20739f9d12019b1f5db9510727d077394a042e14e6832ea7e3e30965bb6c9aea` |

This snapshot authenticates foundation source state; it is not release coverage
or merge approval evidence.
