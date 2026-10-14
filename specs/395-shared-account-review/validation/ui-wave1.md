# #395 UI Wave 1 — T006/T008 test-authoring handoff

**Checkpoint:** branch established; test authoring in progress (no production edits or test execution).
**Repository:** Msg22/Monyvi
**Exclusive leaf:** `codex/395-ui-worker`
**Exact base:** `7e27eb55c642dccef44f4b977a8712ab320ecd18` (parent `944cbafc7e7d9f36a13c75d20c0669204974db2b`)
**Trusted governing main:** `7838df64eb9b3828c6e8f1a02f590b008d5435fd`

## First checkpoint: actual GitHub activity

- Exact branch ref lookup returned GitHub 404 and `search_branches` returned no matching branches.
- `create_branch` created `codex/395-ui-worker` from the exact pinned base, and a follow-up exact-ref GET confirmed that head.
- Frozen `specs/395-shared-account-review/contracts/wire-shapes.md` read at the exact base; new production APIs are **not yet implemented**. T006/T008 filenames and producer modules are absent at the base, as expected for test-first authoring.
- Read current account/profile/bank/sender WatermelonDB model field declarations, scoped-access helpers, account and SMS test-mode patterns, existing Jest/E2E syntax, and approved M01–M20/B1 test requirements.
- Work is confined to two test files, `apps/mobile/e2e/fixtures/shared-account-review.json`, and this validation receipt. Core's T005/T007 sources and production/SQL files remain untouched.
- **Tests run:** NOT RUN. **Maestro/device/provider/hosted operations:** NOT RUN. Root owns the focused Red batch after the frozen Core/UI test handoffs.

## Contract check still important

- Frozen mobile API name: `loadAccountReviewAccountSnapshots`; frozen parser context: `accountReviewRequestContextSchema` with `preferredCurrency` and privacy-safe `accounts` array.
- T015 test-only entry service path is named, but its callable function signature is not specified in the frozen wire document. This leaf will record any proposed test-facing seam as a downstream integration dependency instead of treating it as an already-approved production contract.
- All future runtime fixtures must be gated to explicit test mode and bound to the authenticated local user. Static synthetic IDs are **not proof** that matching owned records exist on a real device.

## Final handoff

Pending source/test authoring. This checkpoint will be replaced with exact test cases, fixture coverage, post-commit SHA/parents, limitations, and WRITE OWNERSHIP RELEASED after the authorized publication is verified.
