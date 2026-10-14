# #395 — UI capability and implementation-readiness probe

**Report date:** 2026-10-14  
**Repository:** `Msg22/Monyvi`  
**Capability branch:** `codex/395-ui-capability`  
**Type:** bounded read-only UI/source probe, followed by authorized publication of this report only  
**Disposition:** **CONDITIONAL GO** for a future, exclusively assigned test-first UI leaf; **NO production or test authoring authorization from this report**.

## 1. Connection and exact revision evidence

| Item | Actually observed |
| --- | --- |
| Authenticated GitHub identity | `Msg22` (user ID `58268248`) |
| Repository permissions | `pull=true`, `push=true`, `admin=true`, `maintain=true`, `triage=true` as reported by `get_repo` |
| PR #396 | Open, not merged, title: `docs: plan shared account review with approved bindings and tasks` |
| PR head / report-branch starting commit | `944cbafc7e7d9f36a13c75d20c0669204974db2b` |
| Head commit Git tree | `1eef2975e75594214c9aac28563c5cd165f642c9` |
| Head commit parent | `d013b5a39afafb44ce31218545da73bdc64886e6` |
| Trusted governing main / PR base | `7838df64eb9b3828c6e8f1a02f590b008d5435fd` |
| Governing-main Git tree | `3209768da3ebdc6917de2fcd4ebd21f439e27940` |
| B1 manifest revision | `sha256:cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0` |
| B1 approval receipt file blob | `f2fbd67fd350b08ed897995a7cca71f38940110b` |

**Actually executed read-capability actions:** `mcp__GitHub__get_repo`, `get_pr_info`, `get_user_login`, `fetch`, `fetch_file`, `search`, and directory/ref reads through `fetch`; these successfully returned repository metadata, commit objects, planning documents, scoped binding sidecars, component source and existing tests. The source probe read at immutable refs rather than relying on a mutable branch.

**Actual write-capability evidence:** `mcp__GitHub__create_branch` successfully created `codex/395-ui-capability` from the exact pinned PR head after the exact-ref read returned GitHub 404 and branch search returned no matches. A subsequent exact Git-ref read confirmed `refs/heads/codex/395-ui-capability` pointed to `944cbafc7e7d9f36a13c75d20c0669204974db2b` before report publication. The connector also exposes `create_file`, `update_file`, `create_blob`, `create_tree`, `create_commit`, and `update_ref` interfaces; their presence is not proof they were exercised or would succeed on other targets. `create_file` is the separately authorized publication mechanism for this one report. No other write API is authorized by this capability leaf.

## 2. Governing documents and binding authority inspected

- Read `AGENTS.md`, `.specify/memory/constitution.md`, `.agent/workflows/team-led-delivery.md`, `.agents/personas/frontend-developer.md`, and `.agent/skills/tdd-guide/SKILL.md` at trusted main. The constitution is 1.7.0; presentational components render shaped props and callbacks, while services own financial persistence and hooks provide lifecycle/state facades.
- Read the pinned #395 `spec.md`, `plan.md`, `tasks.md`, `manual-test-plan.md`, `pre-plan-review.md`, `approvals/b1-2026-10-14.json`, common mockup binding contract, interaction/copy notes, adjustments, package metadata, reference inventory, and all 23 B1 scoped sidecar documents.
- The B1 receipt says **APPROVED** for the 23 exact scoped image/metadata tuples, R3 English/Arabic additions, and existing currency-modal reuse. Original image bytes are not to be edited. The frozen manifest's historical `PENDING` header is superseded by the exact approval receipt; it does not reopen visual approval.
- The existing `CurrencyPicker` is mandatory. R3-04 authorizes only the transaction-context subtitle and reuse of existing picker behavior; the illustrated custom picker chrome is **excluded**.
- The prior planning notes say the canonical mockup-binding verifier passed. This probe **did not run** the verifier, hash PNG bytes independently, inspect raster/rendered pixels, run mobile tests, or perform owner-device accessibility checks. Source/metadata inspection must not be reported as visual acceptance.
- The latest owner routing instruction supersedes older task text: **Normal ChatGPT → Antigravity → justified native fallback**; **OpenCode excluded**. No independent worker orchestration is authorized here.

## 3. Exact current component and existing-test snapshots

| Read path (under `apps/mobile/`) | Git blob SHA | Finding |
| --- | --- | --- |
| `components/transaction-review/TransactionReview.tsx` | `92568b7cbc51ac55ce32c16b9eeaabee7291b906` | Existing `FlatList`, `PageHeader` review variant, partial-SMS/recovery components, summary, filter and action-bar composition provide the shared shell. Its current `auto_selected` filter is **not** the new approved filter over actually checked selections. |
| `components/transaction-review/TransactionItem.tsx` | `9d1121c4e9140f1346179be0f348814d5a713c46` | Memoized row already has separate checkbox and edit targets; account is currently a text chip. New shaped account choice/status/disclosure props and memo-comparison coverage are needed without DB/service imports. |
| `components/transaction-review/ReviewActionBar.tsx` | `81b2d676258afee95c1a4ef84efa142ae3769b2` | Existing Save count/disabled state, Discard and optional SMS Review later can be reused; save failure/retry, exact selection semantics and one safe-area inset require focused integration coverage. |
| `components/navigation/PageHeader.tsx` | `a5c4ddd5d61483efc912734906371b46f3f8610a` | `variant="review"` provides the shared review header/back navigation; `includeTopSafeAreaInset` is optional. Keep source-specific Voice/SMS header semantics rather than introducing a second header. |
| `components/currency/CurrencyPicker.tsx` | `30e0cdb00e2062cc99f9b90edb11fa7db555f994` | Existing localized searchable picker, scroll list and modal bottom inset are reusable. Its current `selectedCurrency: CurrencyType` is non-null; unconfirmed/null entry and localized context require additive backward-compatible props and tests. |
| `constants/ui.ts` | `aae56189cad1c99235005df2e43c20b3f99720e0` | Centralized `compactPhone=340`, `denseRowPhone=390`, `tablet=600` dp and dense font-scale threshold `1.35` are already present. |
| `__tests__/components/transaction-review/TransactionReview.test.tsx` | `892e0a53745c3188e25b3234b8ec25642c882f53` | Existing shell/filter/readiness/row-rendering test patterns can be extended. |
| `__tests__/components/transaction-review/TransactionItem.test.tsx` | `041566e8ef51e2e83b9fabb777143f0c7469180a` | Existing row memoization, theme, checkbox, accessible edit/expand and Arabic formatting tests can be extended. |
| `__tests__/components/transaction-review/ReviewActionBar.test.tsx` | `b80f8fe8b222e8acc72c3d9377894c9c0951ab89` | Existing footer/Save readiness/theme patterns can be extended. |
| `__tests__/components/currency/CurrencyPicker.test.tsx` | `782f8dd60ffd57710f4ac5de0f5a9f91b5d4e292` | Existing locale/search/selection/allowed-currency regressions can protect picker compatibility. |

All listed blobs are **source reads only**; no passing or failing test result is claimed.

## 4. Exact approved UI fidelity obligations

- **Composition:** Preserve the current transaction shell, navigation/header, disclaimer, transaction rows, account fields and source-specific Voice/SMS recovery. Render a compact conditional Review details region only when needed; separate the three review filters from Select ready / Clear selection. Rows and selected counts must reflect actual checked entries, not auto-eligibility.
- **Group interaction:** Confirm one compatible shared draft without selecting transactions or creating accounts. A direct eligible-row selection can confirm its group after visible disclosure, but checks only that row. Per-row account replacement changes one transaction; a group-menu replacement discloses its linked count and affects only the group. Remove retains rows, clears invalid selections, and exposes appropriately generation-guarded Undo.
- **Currency:** Ambiguous/conflicting/unconfirmed currency cannot auto-assign an account. Choose another currency closes the conflict surface and opens the **existing** picker, with contextual localized subtitle and no fabricated selection; cancel/Back commit nothing. An explicit change preserves the numeric amount and regroups only its row.
- **Responsive/design:** Approved normal comparison is **390×844 logical dp, font scale 1**, with runtime safe-area applied once. Use existing semantic light/dark tokens, Nile green CTAs, gold review state, 20 dp gutters, 12 dp panel radius, 32 dp sheet top radius, min 44 dp interaction targets and 48 dp primary buttons where scoped. Reflow dense identities/actions/disclosures below 390 dp or above font scale 1.35. Check compact/tablet/landscape, EN/AR/RTL, keyboard and bottom reachability. Generated phone hardware, decorative lighting and superseded mockup backgrounds are not binding.
- **Accessibility:** Preserve independent checkbox/edit/group-action semantics, explicit selected/checked/disabled states, named account actions and group counts, screen-reader focus recovery and RTL isolation of account/currency codes. Rendered comparison and actual screen-reader behavior are separate owner-run completion gates; component tests do not close them.

## 5. Deterministic fixture and test readiness

The manual matrix M01–M20 is a **planned scenario source**, not recorded automated execution. The existing Jest/RNTL patterns support Red-first UI tests once the frozen engine/shaped-prop contract is supplied. Most direct UI-focused tasks are T018 (eligible default), T026 (shared suggestions), T035 (account/currency choice) and T058 (conditional review), with component integration following the owning reducer/hook boundaries.

| Fixture/reference | Deterministic expected output and independent checks |
| --- | --- |
| R3-05 EN / R3-15 AR combined | 7 transactions: QNB3 + CIB1 + default2 + currency issue1; needing review5, actually selected2. Group disclosure, filters, separate Select ready and RTL parity. |
| QNB3 / CIB1 group state, R2-02/03 and R3-09 | Confirm QNB once to affect exactly three account assignments; check only Lunch, leave other rows unchecked and CIB independent. Confirmed remains readable while Change/menu remains available. |
| R3-06 remove/Undo | Separate 4-row fixture: QNB2 retained but unassigned, pending CIB1, selected Cash1; review3, selected1. No implicit default regeneration and no later-edit overwrite by Undo. |
| R3-07 default only / R3-12 Why | Two Cash default rows ready and selected; review0, selected2. Quiet explanation, no unnecessary Review details container; per-row account remains editable. |
| R3-08 issues only | Four unresolved row examples covering account, currency, amount and category; avoid duplicated issue counts and empty draft/default banners. |
| R3-10 clean / R3-11 Selected empty | Clean two existing-account matches selected2, no empty informational panel; separately three confirmed but unselected rows produce an empty Selected filter, Show all recovery and disabled Save. |
| R1-03/11/12 + R3-03/04/13 | Distinguishable, owned eligible account candidates, row-versus-group scopes, no implied currency selection, existing picker with context, cancellation unchanged, same numeric amount. |
| R3-14 SMS failure | Existing review selections and durable choices remain intact; retry/revalidate and Review later are available, without false success or duplicate-save promises. |
| R3-01/02 + R1-08 account default | Add follows Edit flag pattern: first active account on/disabled, later off by default, pending toggle unsaved until successful account creation; provider/SMS fields unchanged. |

**Fixture prerequisites:** Stable, user-scoped transaction IDs and account/group IDs; one/several eligible defaults and zero/multiple/incompatible defaults; Cash-versus-Bank/Wallet and SMS-versus-Voice rules; QNB card/provider distinctions; unknown/conflicting currencies; active/deleted/foreign matches; SMS fingerprints/recovery states; failure, retry, filter, Undo and late-result revisions. Prefer the approved test-only deterministic fixture entry planned in T008/T015, with no hosted seed/reset, customer data or real-provider calls.

**Tests currently authored/executed by this worker:** **NONE / NOT RUN**. No test Red, Green, Maestro execution, TypeScript, lint, binding-script invocation, device screenshot, TalkBack/VoiceOver, database or hosted validation is claimed. Proposed Maestro journeys are authored only after authorization, statically validated where allowed, and remain unexecuted without the owner's device run.

## 6. Exact dependencies, blockers and handoff boundary

1. **Frozen engine/schema and shaped-prop boundary required.** Before UI test files are assigned, the coordinator must supply the immutable accepted source snapshot and typed contracts for row evidence/assignment, shared-group status/revisions, owned candidate choices, identity/generation controls, actual selection/count/filter projections, and callbacks for confirm/edit/remove/Undo/row choice/group replace/currency. The UI must consume shaped models instead of re-implementing business resolution, DB operations, provider calls or financial save.
2. **TDD gate remains hard.** The approved test files and controllable E2E YAML must be authored first, and meaningful deterministic Red observed before modifying corresponding production UI. The feature plan's T004/T016 frozen-contract/foundation prerequisites and serialized shared files/locale keys remain applicable.
3. **Shared-file serialization.** The pinned task graph serializes reducer T027→T036→T059, hook T030→T039, row T021→T039, review shell T054→T061, and all EN/AR locales through T072. The later integration brief must name exclusive writable files; no code, test or locale ownership is acquired by publishing this report.
4. **Account forms:** #393's independent shared-field/form changes must be reconciled before any Add/Edit changes. Do not infer unreleased local changes or rewrite existing fields, balances, authentication or schema.
5. **Save dependency:** Full selected-save/local SQL/sync approval is stated by the owner, but UI Save behavior must use a separately delivered validated complete writer contract; no legacy unguarded writer can be treated as complete just because the UI permits selecting rows. This report neither edits nor validates financial-action contracts.
6. **Fidelity/proof:** The B1 receipt/sidecars establish the design authority, **not** runtime rendered acceptance. Owner-run baseline/variant screenshots and accessibility/manual-device validation remain pending. No emulator, real provider, hosted deployment/reset/backfill, or new mockup creation is authorized.
7. **Branch/topology isolation:** This capability branch was created from exact `944cbafc7e7d9f36a13c75d20c0669204974db2b`, not from unpublished native-worker contracts or root's unpushed workflow edits. No assumptions were made about those unpublished artifacts. A future implementation branch and lease must be assigned separately.

## 7. Final receipt and freeze

**UI/source access: VERIFIED. GitHub read API: VERIFIED. Branch creation: VERIFIED. Scoped Markdown file publication: the sole authorized report write. Production test/UI readiness: CONDITIONAL; awaiting frozen engine/shaped-prop snapshot, specific file ownership and test-Red authority.**

Only `specs/395-shared-account-review/validation/ui-capability.md` may be added on `codex/395-ui-capability` in this leaf. No app/test/SQL/other-doc/PR/issue/Page/root-branch updates; no application tests, migration or device claims. All write ownership freezes immediately after the single report commit is verified.
