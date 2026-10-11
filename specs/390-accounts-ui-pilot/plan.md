# Implementation Plan: Accounts UI Pilot

**Branch**: `codex/accounts-ui-pilot` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)
**Input**: `specs/390-accounts-ui-pilot/spec.md`
**Status**: Planning artifacts only; root review required before tasks/analyze. No production or test implementation authorized by this document.

## Summary

Unify Add/Edit Account controls around existing default presentation while preserving existing local financial behavior. Extend the shared numeric foundation only enough to support explicit default styling, signed Edit entry, unchanged invalid text, and shared labels/messages. Adopt the stable contract in Accounts after foundation verification; preserve other consumers' outlined/unsigned defaults.

Mohamed approved eight calibrated references on 2026-10-11, package `sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e`. [Manifest](../../docs/mockups/accounts-ui-pilot/approval-manifest.json) and matching sidecars identify exact approved image/fact revisions. Approval covers the depicted design, including message priority and locked geometry; it does not establish native rendering, accessibility or runtime correctness.

## Technical Context

**Language/Version**: TypeScript strict; root/mobile manifest ~5.9.2, React 19.2.0, React Native 0.83.6, Expo ~55.0.27.
**Primary Dependencies**: Existing NativeWind 4.2.6, Expo Router, i18next, React Native safe-area context, Zod, WatermelonDB; existing numeric helpers in @monyvi/logic. No new dependencies.
**Storage**: Existing current-user-scoped WatermelonDB/SQLite; existing background Supabase sync unchanged.
**Testing**: Existing Jest, React Native Testing Library, Maestro; meaningful deterministic and controllable user-journey Red evidence before production edits.
**Target Platform**: Existing Android/iOS app, English/Arabic, light/dark, supported screen/text sizes.
**Project Type**: npm/Nx mobile monorepo.
**Performance Goals**: Preserve responsive typing, draft protection and current interaction behavior; no new numeric latency or frame-rate target invented.
**Constraints**: Zero-network local usability; unchanged Add unsigned/Edit signed validation and save conversion; no input rounding, provider-rule, schema, service, permission or navigation changes.
**Scale/Scope**: Two Account routes and minimum shared field foundation. Issues #359/#360 retain remaining app-wide adoption.

### Verified revisions and dependency policy

- Worktree HEAD and governing main: `3264eba2b67bcc66cddc95e3fbdb36e8705ee642`.
- Root refreshed Msg22/Monyvi main and PR #383 on 2026-10-11: PR OPEN/unmerged, current head `0e7ee55abf6fb18af37e29e4f2e48ba45604a31e`.
- Five shared files were read through GitHub at that exact new head; see [research.md](research.md). Earlier `d45745a5c8a13db082eab24e12c2cc072e26c124` references in existing artifacts are historical reviewed evidence, not claims about this new head.
- No PR changes have been integrated into the pilot worktree. Before implementation, root selects one explicit dependency route: wait for merge and refresh isolated base, or authorize a dependency branch/integration worker. No duplicate callback, nullable-value or error implementation while that route is unresolved.
- Recheck exact main/PR head before later dispatch. This plan does not imply merge/readiness or authorize cherry-pick/rebase/reset.

## Constitution Check

_GATE: Evaluate before research and again after design._

| Principle | Design obligation | Pre-research / post-design result |
| --- | --- | --- |
| I, VIII: Local-first and user scope | Reuse existing scoped hooks/services; no database/cloud imports in presentational fields; preserve offline/restart behavior | PASS / PASS by design; execution pending QA28 |
| II: Documented rules | Follow corrected business-decisions.md provider identity, Add/Edit validation and current workflows | PASS / PASS; no new business decisions |
| III, VI: Types/boundaries | Authoritative domain types, specialized callbacks, pure numeric logic in packages/logic; no runtime db import or any | PASS / PASS; executable lint/type proof pending |
| IV: Separation | Controls render shaped props; existing hooks own lifecycle and services persistence | PASS / PASS; no new service behavior |
| V: Approved visual binding | Approved immutable package; reverify all eight sidecars before coding; compare native baseline and variants before fidelity claims | Design approval PASS; native fidelity NOT RUN |
| VII: Migrations | No database/schema/sync changes | PASS / PASS, migrations not applicable |
| Workflow/testing | Red-before-production unit/integration and controllable complete E2E; independent review and honest device gaps | PASS by planned gates; tests NOT RUN |

No constitution waiver requested. Unknown native metrics and harness capabilities are explicit execution prerequisites, not invented design values. A blocking discrepancy returns to root before affected production work; a material design/behavior deviation requires renewed Mohamed approval.

## Project Structure

### Documentation (this feature)

```text
specs/390-accounts-ui-pilot/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── manual-test-plan.md
├── implementation-ownership.md
├── checklists/requirements.md
└── contracts/
    ├── shared-fields.md
    └── implementation-design.md
docs/mockups/accounts-ui-pilot/
└── approval-manifest.json + eight calibrated images/bindings
```

Canonical [tasks.md](tasks.md) was generated in the separately authorized task-planning step after root reviewed this plan; no implementation or read-only analysis has been executed.

### Source Code (repository root)

```text
apps/mobile/
├── app/(private)/add-account.tsx
├── app/(private)/edit-account.tsx
├── components/ui/{TextField,GroupedDecimalInput,GroupedMoneyInput,Dropdown}.tsx
├── components/currency/CurrencyPicker.tsx
├── components/add-account/{AccountTypeSelector,InstitutionProviderSection,SmsMatchingSection}.tsx
├── components/edit-account/{ReadOnlyDropdown,BalanceChangedSheet}.tsx
├── __tests__/{components/ui,hooks,app,validation}/
└── e2e/maestro/accounts/egyptian-institution-presets.yaml
packages/logic/src/utils/
├── amount-helpers.ts
└── __tests__/amount-helpers.test.ts
```

**Structure Decision**: Keep established layers and controls. Proposed small label/message/name helpers and currency presentation adapter belong with shared UI only where repeated responsibilities justify them. No universal conditional form engine or replacement CurrencyPicker.

## Phase 0: Research Decisions

[research.md](research.md) consolidates already-recorded reviews plus the narrow current-head reconciliation. The new PR already supplies numeric focus/blur and styling/soft-input forwarding and Dropdown nullable/error/adornment contracts. Remaining pilot work is default-variant opt-in, required accessible names, shared feedback, raw-invalid display and signed Edit compatibility. Required regression proof precedes choosing production details.

## Phase 1: Design

[data-model.md](data-model.md) describes existing data and UI state without migrations. [contracts/implementation-design.md](contracts/implementation-design.md) defines specialized control and numeric compatibility boundaries.

1. Preserve TextField ordinary focus-local drafts; numeric controlled grouping remains explicit.
2. Retain numeric outlined and unsigned defaults. Accounts opt into default presentation; only Edit opts into signed entry. Preserve arbitrary existing Account decimals/trailing zeros and existing save conversion.
3. Invalid text such as abc12345 stays verbatim in both callbacks and controlled display; no embedded comma insertion.
4. Share labels/required accessible-name composition and approved error > warning > helper rendering. Type requiredness belongs to its group once, not every radio; override names announce requiredness once.
5. Preserve PageHeader Back/Save, preview raw balance, horizontal Type selection, unboxed Default row, boxed SMS, Delete below SMS and existing silent/tracked sheet with Confirm/backdrop/Android Back.

## Phase 2: Proposed Delivery Order and Ownership

These are planning lanes, not canonical task IDs or authority to edit code.

| Lane | Exclusive later ownership | Dependency and acceptance gate |
| --- | --- | --- |
| Integration preflight | One named integration owner for exact dependency/base and approved exports/locales/global styles | Root reviews plan; exact PR/main and eight binding revisions verified; no feature implementation by root |
| Shared foundation | One implementation worker: shared field/numeric production files and their unit/integration tests; optional amount helper extension and its tests explicitly included in same allowlist | Scoped consumer check and failing signed/raw/required/default regressions; preserve pending PR capabilities; publish Green stable API revision |
| Accounts adoption | One different implementation worker: two Account routes, explicitly touched Account controls, real-screen tests and Accounts Maestro journeys | Foundation revision frozen; author/run meaningful failing Account journeys before adoption; no concurrent shared-file edits |
| Independent QA | Read-only coverage and evidence audit; no ownership of implementers' tests | Audit 35-case mapping while tests are authored; later execute approved harness/device checks and report gaps |
| Ordered reviewers | Independent TypeScript reviewer, then logic reviewer, then style reviewer | Exact integrated revision, preceding review fixed/rechecked; security/data review added only if affected boundaries justify it |

Foundation and Account migration are sequential because they share contracts. Integration requests for locales/barrels/styles go to the one reserved owner. Generic native workers inherit the configured model; no unaudited model adapter. Normal chats completed remote review; impaired retrieval prevented final-draft integration. OpenCode reported actual usage/credit failure and Antigravity denied tools; current local planning integration is the bounded successor, not a new audit.

### Required validation gates

- Use [manual-test-plan.md](manual-test-plan.md) as the mandatory 35-case source list. Every deterministic branch receives actual unit/integration identifiers; every controllable complete journey receives Maestro coverage before production changes.
- Existing inspected suites are starting points, not proof of complete screen coverage. Real controls must replace mocked-control confidence for changed behavior.
- Test Add zero/nonnegative, signed Edit, grouped paste/correction/caret, raw invalid text, arbitrary precision, pristine focus/blur, stale provider/name checks, retries/duplicate taps, both balance choices, dismissal, metadata-only save, default status, scoped offline relaunch.
- Preserve Name maxLength50; 51 characters are schema-only evidence. Card five-character payload is schema-only; real UI uses three-digit correction to four, retaining sanitizer.
- If a touched bottom sheet/action changes, write a nonzero-inset test. Test ordinary/compact layout contracts against constants/ui.ts.
- Native clipboard, caret/IME/bidi, platform Arabic fonts/emoji, density/insets, BlurView and transition rendering, TalkBack/VoiceOver and modal focus require appropriate native evidence. Props, driver inputText and HTML raster pixels do not establish them.
- Compare native screenshots with approved references at recorded viewport/font scale and source revision, plus tablet/landscape/dark/RTL/enlarged variants. HTML font/inset stand-ins are reference context only. No substituted new font, guessed dp or undocumented glyph redesign.
- Require focused tests, shared-consumer regressions, typecheck, lint, applicable i18n checks and ordered reviews. Report functional, visual, accessibility and CI status separately.

## Delivery Estimate and Stop Conditions

Full implementation, automation, native calibration and reviews: **10–16 elapsed hours** assuming working dependency integration and emulator/harness. Approximate critical path: dependency/harness preflight1–2h; foundation3–4h; Account adoption/E2E3–5h; rendered/native verification and ordered review3–5h, with limited QA overlap. Missing iOS/device or failure harness may extend the estimate.

This exceeds four hours: Mohamed must receive the forecast and authorize delivery duration or a smaller first slice before substantive implementation dispatch. Recommended first delivery is dependency/harness preflight plus shared foundation: 4–6 elapsed hours from the current state (preflight 1–2h plus foundation 3–4h). Foundation work alone is 3–4h only after readiness. Account adoption and full fidelity verification are separately scheduled. Do not claim that slice delivers the complete pilot.

Root checkpoints at least every30 active minutes; stop at mandatory overrun threshold, overlapping writes, invalid bindings, unresolved dependency route, missing meaningful Red evidence, material behavior/design change or unavailable required harness. All35 QA cases and implementation/native checks remain NOT RUN.

## Complexity Tracking

No design-level constitution violations or additional architectural layers. Minimal composition is chosen over a universal schema-driven form engine. Any necessary scope expansion returns to root for explicit ownership and authorization.

## Planning Handoff

Windows setup-plan.ps1 is absent. The inspected bash setup-plan.sh only copies the plan template into the selected feature; a bounded PowerShell equivalent checked feature390 and copied that template, without hooks or branch mutations. Before/after-plan optional commit hooks were skipped. Worktree AGENTS Speckit marker points to this plan; primary dirty checkout is untouched.

Plan and task generation stop for root review and a separately assigned read-only analysis stage. Do not run analyze/implement or claim production readiness from these documents.
