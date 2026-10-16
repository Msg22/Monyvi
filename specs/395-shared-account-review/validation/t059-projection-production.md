# #395 T059 — pure Review Panel projection production handoff

**SOURCE RELEASED; NOT RUN.** Frozen parent: `a440cb432c4d413320d5088bec7b00a1647ee218` (not a branch ref). This change implements only the Root-approved pure T059 projection plus one minimal filter sharing helper, canonical export, and the separately granted T058 test harness correction. T060 shaped panel is **held**. Root owns all consolidated checks, test interpretation, integration, and follow-up production leases.

## Changed-only inventory and original Git blob identities

| Path | Before at a440cb43 | Outcome |
| --- | --- | --- |
| `packages/logic/src/account-review/read-model.ts` | absent | **new T059 pure projection** |
| `packages/logic/src/account-review/reducer-selection.ts` | `fc88325d3dcd1d673b3850beb9fd33a28a632d15` | export the identical original filter predicate as `isAccountReviewRowVisible`; its existing bulk command now calls the same predicate |
| `packages/logic/src/index.ts` | `928cd5c033e4a9a022e7fd44915caba278eaad9c` | named projection function and type exports |
| `apps/mobile/__tests__/components/account-review-panel.test.tsx` | `f80bc2c1d47adbe379fc8462c4331481d9f99b3a` | **only** replace eager whole-`react-native` namespace spread mock with narrow internal `useWindowDimensions` mock |
| `specs/395-shared-account-review/validation/t059-projection-production.md` | absent | this report |

All other files are untouched, including the T057 test, T058 test assertions and 17 existing parameterized instances, `reducer.ts`, `resolution.ts`, T020/T031 views, Review shell, locales, hooks, Undo, private storage, SQL and sync.

## Exact pure API

`projectAccountReviewSession({ session: AccountReviewSession, accountSnapshots: AccountReviewOwnedContext }): AccountReviewReadModel` exported from the canonical `@monyvi/logic` barrel. Read-model properties:

- `summary`: global `totalCount`, `distinctNeedsReviewCount`, `selectedCount`, `pendingGroupCount`, `confirmedGroupCount`, `defaultAssignmentCount`.
- `groupSummaries`: original group ID and canonical status, `liveLinkedRowIds` from reciprocal current row assignments at exact group revision; removed tombstones remain present as UI/Undo provenance but have zero live links. Pending/confirmed headline counts require live assigned members, never inert or removed groups.
- `visibleRowIds`: three authoritative `AccountReviewSession["filter"]` states, using exactly the same exported predicate now used by `reduceSelectBatch` (`all`, `needs_review`, `selected`).
- `readyVisibleRowIds`: **preview of the existing `reduceAccountReviewCommand` on canonical `select_ready` for that active filter**. No copied readiness formula, unchecked pending-group promotion, account count shortcut or fabricated default.

Every call parses the original session through `accountReviewSessionSchema` and checks `assertOwnedResolutionContext`. The original reducer's guarded batch path applies its existing `resolveAccountReviewSession`, fresh ownership/default/currency/ATM-destination checks, strict comparison against original row evidence, and precise scope/revision/operation guards. The reducer's returned proposed `state` and effect are **never applied or persisted**; only exact `affectedRowIds` are used if it is not a rejected/no-op outcome. A frozen `saveIntent` returns an empty ready preview, consistent with the reducer's refusal of `select_ready` and `clear_selection`.

Counts use original canonical review state: each row with one or more review reasons contributes once, actual `selected` booleans contribute to the checked count, and only existing account assignments with `origin === "default"` contribute to default disclosure. Neither filter switching nor view projection changes groups, transactions, selected state, revisions, Save intent, financial effects, remote data or parsing usage. `Map`-indexed reciprocal group lookups avoid per-group full-row scans. A 500-row/100-group performance measurement is independently owned by T075; **NOT RUN** here.

No `any`, enum duplication, reducer type casts, domain DTO shadowing, runtime DB access, native code, local writes, network, provider call or package-boundary reversal.

## T058 exact harness hygiene

**Before:** a Jest factory for `jest.mock("react-native", () => ({ ...jest.requireActual("react-native"), useWindowDimensions: ... }))` spreads the entire React Native module and eagerly resolves `DevMenu`, causing the reported `TurboModuleRegistry` exception before the missing `AccountReviewPanel` import is reached.

**After:** only that four-line factory was replaced with this established repository pattern:

```ts
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: (): typeof mockWindow => mockWindow,
}));
```

The existing changing `mockWindow` object and all width/font-scale 390/340/600/1.35 variants remain intact. No added native/TurboModule stubs, no mocked panel/SUT, no UI-source change. All authored assertions, R3 reference states, QNB/CIB actions, filter/toolbar, View all, empty-state recovery, bottom inset, Arabic and NativeWind touchable-alpha regression remain unchanged. The accepted T018/T026 test files and all existing 29+ T031 behavior checks remain untouched.

## Coverage reconciliation / B1

- T057's original 10 authored tests remain unchanged: 7/5/2 distinct reason counts; QNB3 confirm-vs-select; removed tombstone vs live CIB; all/needs_review/selected membership; actual reducer ready-only preview/clear/no-op; owner/filter/revision checks; frozen Save intent and no input mutation.
- T058's 14 authored test definitions, 17 parameterized instances remain unchanged. R3-05/R3-15 combined EN/AR; R3-07/12 quiet default/Why; R3-08 issues-only; R3-10 clean with no detail card; R3-09 confirmed; R3-06 removed/Undo; R3-11 filtered-empty Show all; R2-02/R2-03 independent actions and scrollable View all. Filter/toolbar are siblings even for clean/default-only states; this is a downstream T060 constraint, not new UI code here.
- B1 approved receipt `cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0` and spec `e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0` unchanged; no new mockup, copy or choice.
- The pre-existing authored `conditional-states.yaml` still lacks a real T054/T061 authenticated fixture-to-UI entry; it cannot be claimed as a user-level executed E2E journey.

## Exact validation and next gate

**NOT RUN**: Jest T057/T058, Typescript compilation, lint, formatter, test suite, Maestro or static YAML validation, emulator, provider, hosted migration, screenshot comparison, RTL/dark/large-font native layout, screen reader, focus or inset device proof. No behavioral Red or Green claimed by this worker. Root's prior T057 zero-assertion creation Red was reported at missing `read-model.ts`; that module is now authored. Root's prior T058 TurboModuleRegistry harness blocker has only a source-level targeted fix; **the expected missing-panel creation Red still requires Root's actual consolidated test result**. If another test-harness failure appears, do not label it product Red or silently write UI.

**Next:** Root fetches the exact unreferenced child/tree, independently verifies changed-only ancestry/blob IDs, executes its single planned cohesive pure/UI/type/lint check batch, and accepts or returns specific failures. T060 remains held pending valid missing-panel creation Red and T059 admission. No Git refs, pushes, PR/issue actions or local/native/delegated jobs in this lease.
