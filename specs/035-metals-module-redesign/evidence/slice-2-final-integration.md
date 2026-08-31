# Slice 2 Final Integration Evidence

- Date: 2026-08-31
- Code head: `38da95d24f4244e3d8c4afbe276e7bcc2afa8266`
- Contract head: `9d83f6a4a1d8d9c751dc65f2aa0b9b4c7b44f498`

This record supersedes earlier Slice 2 hash snapshots for byte-level
authentication after catalog, rate-reference, and contract hardening. Contract
authority adds no production or test bytes.

## Fresh verification

- Directly affected suites: 2/2 suites, 53/53 tests.
- Complete Metals coverage: 10/10 suites, 279/279 tests; 95.13% statements,
  88.96% branches, 100% functions, and 95.09% lines.
- Complete logic package: 65/65 suites, 1117/1117 tests.
- `npm run typecheck -w @monyvi/logic`: pass.
- Scoped ESLint: pass.
- Root `npm run lint`: pass with 0 errors and 269 pre-existing warnings.
- Authoritative-contract stale scans for superseded singular account guards,
  singular canonical-account fields, 50-digit revisions, and the removed
  expected-account-revision field: no matches.
- `git diff --check`: pass.
- Normal and `--ignore-space-at-eol` statistics for the integrated contract diff
  are identical; no line-ending-only churn exists.

The existing touched-file Prettier check reports historical tracked-file versus
configured line-ending/wrapping differences. Reformatting would rewrite
unrelated historical content, so this focused record preserves the narrow
reviewed diff and is formatted independently.

## SHA-256

| Source relative to `packages/logic/src/metals/`     | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `attribution.ts`                                    | `b248dabd8d5af68d5b2fe37e66943f1952b619b57d3a1afbe452cc4b9193d634` |
| `currency-minor-units.ts`                           | `6e64fde0766bc64b4337071547430b2f7920d597efe1f402ba1366fecc603af1` |
| `decimal.ts`                                        | `5a5b9da07b3c0e9247344a22bd3ed3c105af5c3e6c4a458d3d486abd610d2edb` |
| `index.ts`                                          | `424d092cf51b33b6c6eafc2aa719ce9056bdb3c5fe0dfc932b204fc13da2af4f` |
| `lifecycle-reducer.ts`                              | `89eb61d83c496dfe2bb64f0a0ccddcf57bd5aa7f1cee5847eede33431d9a2af4` |
| `purity-catalog.ts`                                 | `5715e1d63c199b0922de6f2ef264c680071d2667120dd8305a8cedd99650f36b` |
| `rate-reference.ts`                                 | `1dd173d32ceaaea34f903e665c32174ee6451dd2ba83ff94f23644371b5290bc` |
| `rate-trust.ts`                                     | `978d9a8058963da1bcb70bdabfd35b173e05a6d6f8557ea04989125feaedd5c0` |
| `valuation.ts`                                      | `93c35ff7d07de1eb2fc4605c16eb0b459425437e5d8a9418e451377b8aff2feb` |
| `__tests__/attribution-context-contract.test.ts`    | `015a07efe6507a5781a7eccfd5c995f81660ba792f4cb0cfa0ce6ae2ab3da251` |
| `__tests__/attribution-postgres-parity.test.ts`     | `4832f34f1e929cfe90d9a2666244b118cbf82f78b499b9210d3698cf49644c9d` |
| `__tests__/attribution-reason-types.test.ts`        | `87b4dfecda1b48b86e48bebb416b820f34d4cae165cbbccf28c311046817bd76` |
| `__tests__/attribution-rounding-validation.test.ts` | `1da74f748073b4228edb5cf52e81b5ca15476905b3eaeea3b46e870b9872f95f` |
| `__tests__/currency-minor-units.test.ts`            | `417f00d38ee148427535ab19a715cea52493f9a7e4d4232d4c6167564a175ce9` |
| `__tests__/decimal.test.ts`                         | `6146026fbb9d45b0d94cd2d3bbef8afa7c7aa1824f97eb1fa9a960921fbe84af` |
| `__tests__/lifecycle-rate-trust.test.ts`            | `3162d7f11fe619a20fbe93bca394c6c58138f3aa7621f3aae548f33dfcf03e4e` |
| `__tests__/lifecycle-reducer-contract.test.ts`      | `83c7f665fa2e00e37cca644df5864ceeffe05e510ff82266cb46b357a8aeeaf3` |
| `__tests__/purity-valuation.test.ts`                | `7cf1f717c3c75c8a3e756e7ba14a02d93845ac2275cd10442cfd6b01057e3832` |
| `__tests__/rate-reference-contract.test.ts`         | `3bac1e16488542ffd929c8e704c64cc3ead90d91c62f3950e71e6292ed4893d6` |

This snapshot authenticates the integrated final Slice 2 source state. It is not
release coverage or merge-approval evidence.
