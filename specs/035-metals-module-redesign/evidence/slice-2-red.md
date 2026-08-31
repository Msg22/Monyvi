# Slice 2 Exact Metals Domain — Red Evidence

Date: 2026-08-30
Base: `3ab5ee4c74af16f62de4ddeb092d687f1a2a6ab5` with the approved
uncommitted Slice 1 specification/authority files present
Owner: exact Metals domain Red lane, T006–T011
Scope: Decimal.js dependency metadata and the four owned pure-logic test suites;
no T012+ production Metals implementation was created or edited

## Requirements and authority

The tests implement the exact-arithmetic, catalog, valuation, attribution,
lifecycle, and rate-trust contracts in FR-046–FR-060, SC-004, SC-005, SC-006,
SC-017, SC-018, SC-021, SC-026, and the Slice 2 task text. They use Decimal.js as the
required arithmetic boundary, canonical decimal strings or integer minor-unit
strings, precision 50, `ROUND_HALF_EVEN`, and no JavaScript `number`
intermediates for financial values.

Authority Git blob hashes captured before this gate was marked complete:

| Source | Hash |
| --- | --- |
| `.specify/memory/constitution.md` | `777232e4e5bd556cb2e25c1a6810672fa07c8a44` |
| `docs/business/business-decisions.md` | `62f8074a0b77eb73ff64f1cc91f1f18497c5f6d7` |
| `spec.md` | `51198cf02fe1de8c4679f7d4ffdd1ad45fc2a054` |
| `plan.md` | `348fdf4f28bde00b45c3836cd759026b882972a1` |
| `tasks.md` (before T006–T011 completion marks) | `1a4a3bafe4216be52a84dd42793583d9dcac7ff5` |
| `research.md` | `17b80840b549113e445896ed77c1097539827e94` |
| `data-model.md` | `cbcb35670698e808fe7b7393fbdc36ede1ae937c` |
| `contracts/metadata-lww-contract.md` | `69b667e71ec5610b54f32c51609f7811d1dd79cf` |
| `contracts/command-contract.md` | `e704528993b4c8a4ce517be9d01dc374b830a5e6` |
| `contracts/rate-reference-contract.md` | `4f29a6ab02b333baf3a15c170f844625ec6ae5bf` |
| `contracts/read-model-contract.md` | `a8b03ba7b8882f675a8406a3abcdc7d86b37d0d4` |
| `contracts/reconciliation-contract.md` | `2798b6fd89c4c5bdea7fe7a845210f437c0f2c04` |
| `contracts/test-harness-contract.md` | `e28b8efdbac8d55db7b9ef54bf70fb4ef3128f5e` |
| `contracts/rpc-contract.md` | `d6974f7b8237215da0ed6684fcad4a64d1d70cbc` |
| `implementation-evidence.md` | `f5684b540b316180f3e17e4e552ebf22db6cab30` |

### Hash-resolution note — 2026-08-31

The rate-reference hash remains unchanged because this table is explicitly the
historical authority snapshot captured before the Red gate, not a generated
current-source ledger. Updating it would rewrite the evidence record. The current
revised contract hash is `6c0deac490567dbfb315227943c76c8bc5e94547`; later Green
implementation evidence must capture its own verified source set.

No authority conflict was found. Stable purity codes are deliberately tested as
opaque, non-empty, unique, and repeatable instead of inventing unspecified code
literals. FR-098 requires an equal-time causal successor to precede the event it
reverses, and SC-030 requires deterministic ordering. Neither authorizes ascending
or descending event-ID order. The test therefore requires three unrelated,
same-kind, equal-time events to be permutation-invariant and monotonic by immutable
event ID in either direction. Green must not expose one direction as approved policy
without source authority.

## T006 dependency gate

No package-manager install command was run. The secondary worktree reuses the
main checkout `node_modules` junction. `decimal.js` 10.6.0 was already present
and importable through that junction; `new Decimal("0.1").plus("0.2")` produced
the exact string `0.3`. Metadata now declares `decimal.js: ^10.6.0` in
`packages/logic/package.json` and its workspace entry in `package-lock.json`.
The existing lock node is 10.6.0 with its original registry URL and integrity.

`npm ls decimal.js --workspace @monyvi/logic --depth=0`, run from the repository
root, resolved `decimal.js@10.6.0` through `..\Monyvi\node_modules\decimal.js`.
It labels the package `extraneous` because the shared junction reflects the
main checkout's metadata, not this worktree's edited package metadata; direct
runtime resolution succeeded, so this is an environment note rather than a
dependency blocker.

Dependency/test source Git blob hashes:

| Source | Hash |
| --- | --- |
| `packages/logic/package.json` | `020845ad12e31899bb6018033e1b175fa11dbcd1` |
| `package-lock.json` | `2dbfe22102f971330e9c80ec603f5f661dba133d` |
| `decimal.test.ts` | `8ba4b4c9db37c28843b9327b57708898301592e0` |
| `purity-valuation.test.ts` | `bf030a7a20eca9f8893661f621426d84c8ebf7ea` |
| `attribution-postgres-parity.test.ts` | `f45063864809102cdb8a385988039935186aa6e9` |
| `lifecycle-rate-trust.test.ts` | `6345e9f37c94db5eafb4f6d9bb5a056479306f37` |

## Red gate

Working directory for Jest: `E:\Work\My Projects\Monyvi-metals-redesign\packages\logic`

| Test or command | Expected missing behavior | Actual failure | Result |
| --- | --- | --- | --- |
| `npx jest --testPathPattern="src/metals/__tests__/(decimal\|purity-valuation\|attribution-postgres-parity\|lifecycle-rate-trust).test.ts" --no-coverage --runInBand --watchman=false` | T007–T010 APIs/behavior do not exist before T012–T015 | 4/4 suites failed; 89/89 tests failed; 0 snapshots; 1.442 s. Every failure is `Cannot find module` for one of the six planned production modules. | Red |

Case inventory proving every listed test was discovered:

| Suite | Cases | Intended missing modules |
| --- | ---: | --- |
| `decimal.test.ts` | 33 | `../decimal` |
| `purity-valuation.test.ts` | 14 | `../purity-catalog`, `../valuation` |
| `attribution-postgres-parity.test.ts` | 19 | `../attribution`, `../valuation` |
| `lifecycle-rate-trust.test.ts` | 23 | `../lifecycle-reducer`, `../rate-trust` |
| **Total** | **89** | **All T012–T015 production APIs are absent** |

The test files load the planned modules at the individual test boundary. This
lets Jest compile and discover all fixtures while each case still fails on its
specific missing production API. Literal, hand-checked expected values are used;
there are no mirror calculation helpers, mocks, random inputs, dates based on
the current clock, or JavaScript-number financial intermediates.

The two exact-decimal compatibility fixtures are hand-derived from FR-050 using
the literal inputs recorded in each fixture. Research lines 104–117 establish
canonical decimal strings locally, PostgreSQL `numeric` remotely, and the need
for later parity verification. No PostgreSQL instance or query was run in this
Red gate, so these tests record expected values for a future PostgreSQL numeric
comparison; they do not claim executed database parity.

## Excluded infrastructure attempt

The first combined command omitted `--watchman=false`:

`npx jest --testPathPattern="src/metals/__tests__/(decimal|purity-valuation|attribution-postgres-parity|lifecycle-rate-trust).test.ts" --no-coverage --runInBand`

It stopped before discovery with `Failed to spawn watchman server` under Node
22.22.3. Per the evidence contract, that attempt is not Red evidence. Re-running
with Jest's supported `--watchman=false` flag removed the infrastructure error;
no syntax, transform, configuration, fixture, or unintended import failure
remained.

## Gate conclusion

- T006 dependency metadata is present without running an install or changing an
  unrelated dependency.
- T007–T010 each contain deterministic failing tests for every named task case.
- T011 is honest Red: all 89 cases fail only because the planned production
  modules/behavior are absent.
- `git diff --check -- package-lock.json packages/logic/package.json` exited 0
  with no output. The untracked Slice 2 sources are enumerated above and all
  four suites compiled and were discovered by Jest.
- `tasks.md` after marking only T006–T011 has Git blob hash
  `2c59fe3406d91c6a866945947b2a40dc1dc51e27`.
- Green, refactor, coverage, migration, service, UI, and T012+ work did not run.
- Stop conditions triggered: initial Watchman infrastructure failure, resolved
  by the supported Jest flag before collecting Red evidence. No remaining
  blocker.

## Supplemental FR-051 / T014 Red cycle

Independent review found T014's explicit preferred-display-currency conversion
was not represented in the original 89-case Red contract. After explicit
authorization, four hand-derived cases were added before changing production:

- combined P/L and every component use one exact `x_P,d ÷ x_D,d` basis;
- conversion occurs at full precision before one display-boundary rounding;
- an unavailable canonical attribution remains unavailable;
- each missing display FX input returns an unavailable result.

Command, run from `packages/logic`:

`npx jest --testPathPattern='src/metals/__tests__/attribution-postgres-parity.test.ts' --no-coverage --runInBand --watchman=false`

Result: 1/1 suite failed; 4 expected tests failed and 19 existing tests passed,
23 total; 0 snapshots; 1 s. Every new failure was
`TypeError: convertAttributionForDisplay is not a function`. No syntax,
configuration, fixture, or unrelated failure occurred. Production implementation
started only after this intended supplemental Red was recorded. Supplemental test
source Git blob hash: `a3b52994046d338bf0264ca89c23e6f13bbcedab`.

## Supplemental TypeScript-review Red cycle

Review found two boundary defects: the public Decimal.js clone remained
mutable and public helpers still admitted binary-number/exponent inputs, while
the direct same-time lifecycle comparator was non-transitive across a causal
chain. Tests were added first for the canonical-string/opaque-value boundary,
immutable configuration, and all six permutations of a three-event causal
chain.

Command, run from `packages/logic`:

`npx jest --testPathPattern='src/metals/__tests__/(decimal|lifecycle-rate-trust).test.ts' --no-coverage --runInBand --watchman=false`

Result: 2/2 suites failed; 10 expected tests failed and 56 existing tests
passed, 66 total. The failures were only the exposed mutable constructor (1),
accepted JavaScript-number inputs (4), accepted exponent strings (4), and the
non-transitive chain order (1). There were no syntax, configuration, import, or
fixture failures. Production changes began only after this Red was verified.

## Supplemental financial-logic review Red cycles

- Sale validation: attribution suite had 4 intended failures and 28 passes,
  32 total. Zero/subminor gross and fee-over-gross/subminor fee were wrongly
  accepted. Negative and unparseable cases already returned unavailable.
- FR-059 availability: attribution suite had 2 intended failures and 32 passes,
  34 total. Missing historical breakdown facts wrongly erased trustworthy
  current and realized combined P/L.
- FR-083 precision: attribution plus valuation suites had 4 intended failures
  and 49 passes, 53 total. Weight above three decimals, purity above six, and
  subminor purchase cost for current/realized P/L were wrongly accepted.
- Future observation time: lifecycle/rate suite had 1 intended failure and 25
  passes, 26 total. One-millisecond clock-ahead input was wrongly Fresh with
  age `-1`.

Every focused Red used `--no-coverage --runInBand --watchman=false` and failed
only at the intended current behavior. No syntax, import, fixture, or test-harness
failure occurred.

## Approved rate-reference and lifecycle-contract Red — 2026-08-31

After the approved contracts resolved the two review blockers, focused tests were
added before production changes in
`rate-reference-contract.test.ts` and
`lifecycle-reducer-contract.test.ts`. They cover the legal and illegal
role/kind/instrument/unit/orientation matrix, BTC runtime rejection, USD identity,
exact reciprocal normalization, immutable raw evidence, provider-time handling,
the reduction result/rejection taxonomy, duplicate replay/conflict, missing or
rejected predecessors, cycles, reversal validation, evidence state, equal-time
causality, canonical CAS selection, fail-closed competing successors, shuffled
replay, and all-invalid input.

Command, run from `packages/logic`:

`npx jest --testPathPattern='src/metals/__tests__/(rate-reference-contract|lifecycle-reducer-contract).test.ts' --no-coverage --runInBand --watchman=false --cacheDirectory='E:/Work/My Projects/Monyvi/node_modules/.cache/jest-metals'`

Result: 2/2 suites failed; 41 expected tests failed and 1 existing-order helper
test passed, 42 total; 0 snapshots. Rate failures were solely the missing
`../rate-reference` implementation. Lifecycle failures were solely the old reducer
returning a projection rather than the approved immutable
`{ projection, acceptedEvents, rejectedEvents }` result and therefore exposing no
rejection diagnostics. No syntax, fixture, configuration, or unrelated harness
failure occurred. Production implementation began only after this Red was captured.

## Supplemental TypeScript-review boundary Red — 2026-08-31

Review found that a `created` root could carry a reversal reference, attribution
could infer expected instruments from the supplied reference when acquisition
evidence was absent, and the public exact-reference type admitted illegal matrix
combinations. Direct-import tests were added before production changes.

The focused lifecycle/context command failed 2/2 suites with 7 intended failures
and 17 passes, 24 total: one invalid Created root was accepted and six independent
Gold/Silver, EGP/SAR, proceeds, and display-context mismatches were ignored.
The pre-change package typecheck also failed on all three compile-time illegal
reference assertions, the unknown raw-validator boundary, and missing expected
display-context fields. No unrelated fixture, import, or harness failure occurred.

## Supplemental financial-logic re-review Red — 2026-08-31

Seven focused tests were added before production changes. The parity/lifecycle
command failed 7/66 with 59 passes: combined-only current and realized results
omitted consumed evidence; raw caller freshness bypassed validator-derived state;
same-ID/fingerprint unequal events were replayed; missing and invalid evidence state
were accepted; and a canonical-CAS-rejected root plus descendant established
ownership. All failures matched the reviewed gaps; no harness failure occurred.

## Supplemental style/architecture review Red — 2026-08-31

The focused rate/lifecycle command failed 17/64 with 47 passes. Sixteen malformed
runtime lifecycle cases crashed, established ownership, or received a later
transition reason instead of structural `incomplete_evidence`. The currency parity
case failed because no canonical-catalog narrowing guard existed. Cases cover every
approved event field plus a malformed successor; no unrelated failure occurred.
