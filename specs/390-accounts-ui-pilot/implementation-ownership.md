# Accounts pilot — candidate implementation ownership

**Status**: Proposal for later Speckit plan/tasks; no implementation authorization or current code writer.
**Base**: 3264eba2b67bcc66cddc95e3fbdb36e8705ee642.
**Gate**: Mohamed approved immutable mockup package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e; shared PR #383 reconciliation and implementation authorization remain prerequisites before production changes.

## Current authorized writers

| Writer | Exclusive allowed writes | Restriction |
| --- | --- | --- |
| Local specification integrator (accounts_docs_integration) | spec.md, contracts/shared-fields.md, manual-test-plan.md, implementation-ownership.md, checklists/requirements.md within specs/390-accounts-ui-pilot/ | Recorded review integration only; no selector, Git, app, test or mockup edits |
| Local mockup completion owner assigned by coordinator | docs/mockups/accounts-ui-pilot/** | Existing mockup completion and binding metadata only; no specification edits |
| Normal chats S1R / M1R | Remote review/draft outputs only | Completed remote review; final-draft retrieval impaired, no local filesystem ownership |
| Coordinator | Out-of-repository ledger, briefs and synthesis | Read-only review of repository artifacts; no feature implementation |

Previous native specification and mockup workers have ended; they are not active writers. Current local owners integrate recorded remote findings and preserved artifacts. Future implementation lanes below remain provisional and confer no write authority.

AGENTS active plan remains specs/389-sync-pagination/plan.md. This feature selector is independent and explicitly points at 390. Mandatory before_specify Git feature hook was already executed once by coordinator; not repeated. Optional after_specify commit hook was not selected. No commits, pushes, issues or PRs in this stage.

## Proposed later dependency order

1. Visual approval and immutable binding revision recorded; product decisions about messages/focus/locked geometry settled.
2. Refresh exact main and PR #383 head. Resolve integration ownership and avoid duplicating numeric callbacks/nullable Dropdown support.
3. Speckit plan and canonical tasks define actual allowlists and test IDs, including required rendered evidence.
4. Shared foundation writer authors relevant failing tests/journeys first; produces minimum backward-compatible shared API. Published integration revision freezes contracts.
5. Accounts writer adopts stable shared API and covers complete Add/Edit journeys.
6. Reserved integration writer handles any shared exports/locales/styles approved through requests.
7. Independent reviewers and QA inspect exact final revision, execute required coverage and compare approved images with rendered variants.

Foundation and Accounts are sequential: they depend on the same UI contracts. Monetary #359 and requiredness #360 work in Account files has one owner, with separate acceptance mapping; neither app-wide issue closes from this pilot.

## Candidate exclusive file sets

These are candidates, not final tasks. Confirm each existing test path by full-repository discovery before creating or replacing a suite.

| Lane | Candidate production files | Candidate tests / evidence | Dependency |
| --- | --- | --- | --- |
| Shared field foundation | apps/mobile/components/ui/TextField.tsx, GroupedDecimalInput.tsx, GroupedMoneyInput.tsx, Dropdown.tsx; proposed FieldLabel/accessible-name helper and FieldMessage only if justified; approved currency-trigger adapter only after real-consumer check | Their existing component tests and focused override/requiredness/state/numeric regression coverage; relevant controllable journey contract authored before production | Mockup approval, PR383 reconciliation |
| Optional pure numeric extension | packages/logic/src/utils/amount-helpers.ts only if signed migration regression proves need | Existing numeric helper tests plus signed/grouping/selection boundary cases | Separate named owner, or expressly included in same foundation allowlist; unsigned compatibility |
| Accounts adoption | apps/mobile/app/(private)/add-account.tsx and edit-account.tsx; components/add-account/AccountTypeSelector.tsx; approved narrow provider/SMS consumers; components/edit-account/ReadOnlyDropdown.tsx and BalanceChangedSheet.tsx only if touched behavior/geometry requires it | Existing Account screen/hook tests where affected, real-control integrations and Maestro Account journeys; nonzero sheet inset test if sheet touched | Published stable shared API |
| Shared integration | Exact existing UI barrel exports, approved locale files/schema, apps/mobile/global.css and existing token config only when required and explicitly approved | i18n/schema/lint checks and cross-consumer compatibility | Requests from foundation/Accounts; exclusive ownership |
| Independent review | Review report only | TypeScript, logic/style/security review; coverage audit; exact-head CI and rendered/device evidence | Published exact code revision |

Paths abbreviated within a table row inherit the preceding stated folder. No implicit authority to edit all listed candidates: canonical tasks must narrow them to actual need. Shared styles/locale changes require reserved integration owner; feature writers submit change requests instead of concurrent edits.

## Unchanged behavior and excluded writes

No Account/service schema changes, WatermelonDB/Supabase migrations, provider rules, dependencies, financial protocol, type/currency unlocking, permission flows, delete cascades, new warning thresholds or dirty-leave prompts. Hooks/services remain existing dependencies; if a reproduced defect needs their changes, coordinator assesses scope and assigns one owner before adding it.

Retain sibling E: worktree isolation and main node_modules junction. Never install dependencies in a secondary worktree. Preserve unrelated primary checkout work.

## Validation/handoff contract

- Map all 35 manual scenarios to existing/new actual test identifiers after discovery, runnable journeys or explicit harness/device gaps.
- Demonstrate relevant deterministic and controllable E2E Red before production changes; Green after implementation; report setup failures separately.
- Use RNTL renderHook for touched hooks; do not add react-test-renderer shims.
- Recheck cross-consumer defaults for shared changes; grouped money migration must not alter Account precision or unsigned other-consumer grammar.
- Capture approved-baseline and compact/ordinary/tablet/landscape/dark/RTL/enlarged-text rendered evidence; record visual fidelity separately.
- Actual clipboard/native caret/IME and TalkBack/VoiceOver evidence remains distinct from driver input and accessibility-prop assertions.
- Final PR carries full coverage matrix and manual-only/harness gaps. No readiness claim from passing CI alone.

## Decisions remaining before coding

- Actual images and immutable handoff/binding metadata approved in package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e; reverify exact revisions before use.
- Approved error/warning/helper order, unchanged focus border and locked geometry govern that exact package; native fidelity remains NOT RUN.
- Current PR383 integration/ownership settlement.
- Signed grouping/selection regression proof and minimum compatible resolver decision.
- Full test discovery and emulator/harness capability verification.

No tests or implementation performed by this document.
