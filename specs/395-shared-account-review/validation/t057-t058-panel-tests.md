# #395 T057/T058 — Review Panel tests-first handoff

**Mode:** TESTS ONLY; source parent `bde7c6285b0e5630ad8ef0ca531ed2ad8946d5bb` (direct child of frozen `1264134305c126a7836cf09e8f7843609a8c8555`). **Root owns all validation/integration and any later production grant.** The five-path allowance was not expanded; four new files authored, optional fixture helper unnecessary.

## Source and authority consumed

- Governing `AGENTS.md` and `.agent/workflows/team-led-delivery.md` at `c02a773613f9b6ebc5ca01aae02dd41863fd0e90`; Constitution 1.8.0 at separately approved `503f5a1336ba23f6d270615ce1ba47b02116e4f0`.
- Immutable feature `spec.md`, `plan.md`, `tasks.md`, `pre-plan-review.md`, B1 receipt, package, common contract, R3 interaction/copy notes and scoped R3 sidecars at `1264134305c126a7836cf09e8f7843609a8c8555`. Approved spec sha256 `e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0`, B1 package sha256 `cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`. All 23 approvals remain frozen; T057/T058 change no image or binding.
- Actual parent source: `review-schemas.ts`, `reducer.ts`, `reducer-selection.ts`, `reducer-primitives.ts`, `resolution.ts`, `normalization-types.ts`, accepted `review-command-fixtures.ts`, `resolution-fixtures.ts`, `DefaultAccountInfo.tsx`, `SharedAccountSuggestions.tsx`, `shared-account-presentation.tsx`, their T018/T026 tests and approved synthetic descriptor catalog. No private app/service/provider import in the pure T057 test.
- At the parent, **neither** `packages/logic/src/account-review/read-model.ts` (T059) **nor** `apps/mobile/components/transaction-review/AccountReviewPanel.tsx` (T060) exists. This is a **creation Red**, not a claimed behavioral test failure. Production implementation and combined checks require Root's later decision.

## Proposed small pure API for Root's T059 review (NOT implementation)

```ts
import type { AccountReviewSession, AccountReviewGroup, AccountReviewRow } from "./review-schemas";
import type { AccountReviewOwnedContext } from "./normalization-types";

interface ProjectAccountReviewSessionInput {
  readonly session: AccountReviewSession;
  readonly accountSnapshots: AccountReviewOwnedContext;
}
interface AccountReviewReadModel {
  readonly summary: {
    readonly totalCount: number;
    readonly distinctNeedsReviewCount: number;
    readonly selectedCount: number;
    readonly pendingGroupCount: number;
    readonly confirmedGroupCount: number;
    readonly defaultAssignmentCount: number;
  };
  readonly groupSummaries: ReadonlyArray<{
    readonly groupId: AccountReviewGroup["groupId"];
    readonly status: AccountReviewGroup["status"];
    readonly liveLinkedRowIds: ReadonlyArray<AccountReviewRow["rowId"]>;
  }>;
  readonly visibleRowIds: ReadonlyArray<AccountReviewRow["rowId"]>;
  readonly readyVisibleRowIds: ReadonlyArray<AccountReviewRow["rowId"]>;
}
function projectAccountReviewSession(
  input: ProjectAccountReviewSessionInput
): AccountReviewReadModel;
```

This declaration is a **review request** for T059, not a new canonical DTO. Existing `AccountReviewSession["filter"]` remains the only filter union (`all`, `needs_review`, `selected`). T057 imports the missing function and uses `ReturnType<typeof projectAccountReviewSession>`, never casts domain types.

The owner/scoped snapshot must be validated; any mismatch fails closed. `distinctNeedsReviewCount` counts rows with one-or-more unresolved reasons **once**, not reasons or groups. `selectedCount` uses actual `row.selected`; default count is valid original `assignment.state === "existing" && origin === "default"` (no arbitrary first account). Confirmed/pending count only currently active groups, never removed tombstones. `liveLinkedRowIds` derives reciprocal active row assignments, not historical `group.linkedRowIds` of a removal tombstone. Group summaries persist irrespective of active filter so group linked totals do not shrink to the visible viewport.

**Important readiness dependency:** `readyVisibleRowIds` must be equivalent to the **affected IDs from the existing guarded `reduceAccountReviewCommand` with canonical `select_ready` for the active filter**, using `resolveAccountReviewSession` ownership/currency/assignment eligibility. It must not implement a second simplistic `reviewReasons.length === 0` eligibility algorithm. Preview must cause no persisted operation, group confirmation, input mutation or Save intent. If the reducer returns a no-op for no eligible rows, the projected list is empty; a frozen `saveIntent` disables bulk mutation. Root may select a more efficient guarded pure helper if it has exactly the reducer's semantics and does not create duplicate business logic. Benchmark impact belongs to T075, not this lease.

### T057 case inventory (10 authored, no execution)

| Cases | Assertions |
| --- | --- |
| L01 | Seven canonical rows: 5 *distinct* review rows despite one row having two reasons; 2 actual selected, 2 default, 2 pending, 0 confirmed |
| L02 | Confirm QNB3 only: 2 review rows remain, QNB confirmed and CIB pending, selected remains the original 2 |
| L03 | Removed QNB tombstone retains historical IDs but no live links; current CIB links/count intact, no row loss |
| L04 | All/Needs review/Selected visible IDs match rows; global summary and group links do not depend on filter |
| L05 | Ready list exactly matches existing reducer's `select_ready` affected IDs; QNB remains pending; input immutability |
| L06 | Needs-review bulk no-op, never implicitly confirms a pending shared group |
| L07 | Clear selected current-filter entries; Selected becomes genuinely empty without affecting QNB |
| L08 | Existing command schema rejects stale active filter/owner/revision with specific original reducer reasons |
| L09 | Foreign owned snapshot cannot silently authorize default/ready projection |
| L10 | Frozen original Save intent disables bulk readiness/clear, preserving data, revisions, input and planned selection |

All sessions/commands are parsed with the production Zod schemas. QNB3/CIB1 and ready rows come from existing canonical normalization/reducer fixtures. Synthetic extra defaults are explicit, owned Cash assignments matching the accepted Voice policy (not first-account fallback); no new account/card/type or financial write is invented.

## Proposed shaped panel props for T060 review (NOT implementation)

T058 uses `ComponentProps<typeof AccountReviewPanel>` and existing `SharedPresentationFixture` / `SharedAccountSuggestions`, not a duplicate domain business union. The expected shape is the existing `SharedAccountSuggestionsProps` (`groups`, `summary`, `isAllGroupsSheetOpen`, `isBusy`, `onConfirm`, `onEdit`, `onReplace`, `onRemove`, `onUndo`, `onViewAll`, `onCloseAllGroups`) plus:

- `filter: AccountReviewSession["filter"]`; `visibleRowIds` and `readyVisibleRowIds` are already-shaped canonical row IDs provided by T059/parent; `onFilterChange(filter)`, `onSelectReady()`, `onClearSelection()`.
- `defaultAccountName: string | null` (actual eligible owned account name supplied by parent, never guessed), `isWhySheetOpen: boolean`, `onDefaultWhyPress()`, `onCloseWhy()` for exact T020 components controlled by parent.
- Child may own only a temporary *presentation* menu while T031 does; it cannot call reducer/DB/services/hooks that write review state. No Save/routing, new picker or 4th filter. No duplicate detail panel when T031 is composed, and no empty detail panel for default-only/clean states.
- Proposed named IDs: `account-review-filter-all`, `account-review-filter-needs_review`, `account-review-filter-selected`, `account-review-select-ready`, `account-review-clear-selection`, `account-review-filter-empty` and `account-review-show-all`. Existing T020/T031 testIDs are preserved unmodified.

R3's three filters must be accessibility-named controls, with selected state from props. Select ready and Clear selection are **separate toolbar actions** and never mutate locally. Disabled/no-ready click is inert. A filtered-empty Selected view calls `onFilterChange("all")`, not the recorder no-transactions surface. The panel may use presentation/locale/theme/bottom-inset hooks only; alpha `bg-*/NN`, shadow or `opacity-*` NativeWind classes must **not** be applied to `TouchableOpacity`; put an alpha surface on a noninteractive child `View` (existing T031/T020 pattern).

### T058 case inventory (14 authored definitions; 17 deterministic instances)

| Cases | B1 reference and assertion |
| --- | --- |
| P01 | R3-05: single 350dp-scope detail region, QNB3/CIB1 separate, currency issue, default2 quiet note, counters7/5/2 |
| P02 | R3-07/R3-12: default-only two selected, Why parent callback, no empty details |
| P03 | R3-08: four distinct unresolved account/currency/amount/category labels, no fake group/default container |
| P04 | R3-10: clean two checked, no blank detail/default section, filters remain |
| P05 | R3-09: confirmed QNB/CIB status read-only, independent edit/menu callback, selection unchanged |
| P06 | R3-06: removed group Undo independent of surviving pending group |
| P07 | R3-11: empty Selected filter, Show all parent callback, not recorder no-result |
| P08 | R3-05/09: three controlled filters; separate ready/clear callbacks, no group auto-confirm |
| P09 | R3-05: pending groups alone never enable ready-only bulk action |
| P10 | R2-03 + R3-05: View all is parent-controlled, six groups in FlatList and bottom-inset modal |
| P11 | R2-02/R3-05: Confirm invokes only one group callback, no selection or Save side effect |
| P12 | R3-05 layout semantics on width 390, 340, 390 at font scale 1.35, 600 at 1.35 (four cases), long names/actions retained |
| P13 | R3-15: Arabic labels and same 7/5/2, controlled selected-filter callback; RTL native proof remains outstanding |
| P14 | R3-12: modal max-height/bottom inset and no forbidden alpha/shadow classes on touchables |

Tests assert component/prop semantics; `340`, `390`, `600`, RTL and font scale tests **do not measure actual native layout, focus traversal, text clipping, gesture bars, contrast or screenshot fidelity**. Those remain owner-rendered/device gates T062/T063 and the separate T020/T031 evidence tasks. Existing T026 29+ cases are untouched.

## Authored Maestro, explicit blocker

`apps/mobile/e2e/maestro/account-review/conditional-states.yaml` is test intent for M10/M11. It calls the **existing** `../helpers/setup.yaml` only; it deliberately asserts the not-yet-integrated review panel so no normal Transactions list can pass as #395 review coverage. The actual T015 `loadAccountReviewFixtureSession(sceneId)` is authenticated, non-production, `EXPO_PUBLIC_MONYVI_TEST_MODE=e2e`-gated, purely in-memory and has **no route/deep link or provider/native automation action** at this parent. A real T054/T061 scene-to-visible-UI entry is required before a meaningful controllable Maestro journey can run. Do not invent a fixture-opening UI, parse a real SMS, start Voice capture or claim pass based on conditional skip. Remaining individual R3 variant E2E entries are documented but not falsely asserted as executed.

## Exact validation state and handoff

- **NOT RUN:** Jest logic/UI, TypeScript, Nx, ESLint, formatting, Maestro/static validation, emulator, E2E, native responsive/render/screen-reader/accessibility, binding-verifier and consolidated batch. Root runs only the one planned consolidated check batch after relevant production modules and integrated entry exist.
- **Red status:** missing `read-model.ts` and `AccountReviewPanel.tsx` make both focused Jest suites fail at module loading before any behavioral assertion. **0 executed assertions; no behavioral Red/Green claim.**
- **Source:** 4 new test/specification files only, no production/locale/fixture-service/hook/Undo/storage/SQL edits. No branch, ref, PR, push, hosted mutation, provider, native or Codex delegation. Separate file/blob/tree/commit SHA evidence in worker handoff.
- **Root next gate:** review the small proposed API/IDs against T059/T060 ownership; preserve tests-first creation Red, reconcile any genuinely unsupported UI contract in the test-only owner lane, then grant disjoint T059/T060 production source after its own prerequisites. Never silently weaken tests or duplicate reducer eligibility.
